let PRODUCTS_PAGE = 1;
let PRODUCTS_PAGE_SIZE = 50;
let PRODUCTS_TOTAL_PAGES = 1;
let PRODUCTS_Q = "";
let PRODUCTS_SORT_BY = "updatedAt";
let PRODUCTS_SORT_DIR = "desc";

let ME = null; // cache do /me
let ACTIVE_SHOP_ID = null; // Shop.id (DB) vindo da sessão

// Para Opção A: manter rotas /shops/:shopId/... mas backend ignora.
// Usamos um placeholder fixo só para completar a URL.
const SHOP_PATH_PLACEHOLDER = "active";

function formatBRLFixed90(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return (n + 0.9).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function $(sel) {
  return document.querySelector(sel);
}
function $all(sel) {
  return Array.from(document.querySelectorAll(sel));
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(text ?? "");
}

async function apiGet(path) {
  const r = await fetch(path, { credentials: "include" });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  return text ? JSON.parse(text) : null;
}

async function apiPost(path, body) {
  const r = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  return text ? JSON.parse(text) : null;
}

/* ---------------- Tabs ---------------- */
function initTabs() {
  const tabs = $all(".tab");
  const panels = $all(".tab-panel");

  tabs.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.tab;

      tabs.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((p) =>
        p.classList.toggle("active", p.id === `tab-${tab}`)
      );

      // garante loja ativa antes de carregar módulos

      if (tab === "products" || tab === "orders") {
        await ensureShopSelected();
      }

      if (tab === "products") loadProducts();
      if (tab === "orders") loadOrders();
      if (tab === "admin") loadAdmin();
    });
  });
}

/* ---------------- Modal ---------------- */
function openModal(title, html) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = html;
  $("#modal-overlay").style.display = "flex";
}

function closeModal() {
  $("#modal-overlay").style.display = "none";
  $("#modal-title").textContent = "";
  $("#modal-body").innerHTML = "";
}

function initModal() {
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
}

function kv(k, v) {
  return `<div class="kv"><div class="k">${escapeHtml(
    k
  )}</div><div class="v">${v}</div></div>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------- Auth + Shop Select ---------------- */
async function loadMe() {
  const data = await apiGet("/me");
  ME = data;
  ACTIVE_SHOP_ID = data?.activeShopId ?? null;

  const accountName = data?.account?.name ? String(data.account.name) : "—";
  const email = data?.user?.email ? String(data.user.email) : "—";

  setText("auth-status", `Conta: ${accountName} • Usuário: ${email}`);

  const viewStatus = document.getElementById("auth-status-view");
  if (viewStatus) viewStatus.textContent = $("#auth-status")?.textContent || "";

  const role = String(data?.user?.role || "");
  const adminBtn = document.getElementById("admin-tab-btn");
  const adminTitle = document.getElementById("admin-title");

  const canSeeAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  if (adminBtn) adminBtn.style.display = canSeeAdmin ? "" : "none";

  if (adminTitle) {
    adminTitle.textContent = role === "SUPER_ADMIN" ? "Admin Global" : "Admin";
  }

  const adminBtnLabel = adminBtn?.querySelector(".ml-nav-item__label");
  if (adminBtnLabel) {
    adminBtnLabel.textContent =
      role === "SUPER_ADMIN" ? "Admin Global" : "Admin";
  }
}

async function ensureShopSelected() {
  if (!ME) {
    await loadMe();
  }

  const shops = Array.isArray(ME?.shops) ? ME.shops : [];
  const active = ME?.activeShopId ?? null;

  // 0 lojas: ainda não vinculou Shopee
  if (shops.length === 0) {
    openModal(
      "Conectar Shopee",
      `<div class="muted">Nenhuma loja vinculada a esta conta ainda.</div>
       <div class="muted" style="margin-top:10px;">Conecte sua Shopee na aba Autenticação.</div>`
    );
    return;
  }

  // 1 loja: se não estiver ativa, seleciona automaticamente
  if (shops.length === 1 && !active) {
    await apiPost("/auth/select-shop", { shopId: shops[0].id });
    await loadMe();
    return;
  }

  // 2 lojas: se não tiver ativa, pede seleção via popup
  if (shops.length > 1 && !active) {
    await promptSelectShop(shops);
    await loadMe();
    return;
  }
}

async function promptSelectShop(shops) {
  const optionsHtml = shops
    .map((s) => {
      const title = s.shopId
        ? `ShopId Shopee: ${escapeHtml(String(s.shopId))}`
        : "Loja";
      const region = s.region ? ` • ${escapeHtml(String(s.region))}` : "";
      const status = s.status ? ` • ${escapeHtml(String(s.status))}` : "";
      return `
        <button class="btn btn-primary" data-select-shop="${escapeHtml(
          String(s.id)
        )}" style="width:100%; margin-top:10px;">
          ${title}${region}${status}
        </button>
      `;
    })
    .join("");

  openModal(
    "Selecione a loja",
    `<div class="muted">Esta conta possui mais de uma loja vinculada. Escolha qual deseja acessar agora.</div>
     <div style="margin-top:12px;">${optionsHtml}</div>`
  );

  $all("[data-select-shop]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const shopId = Number(btn.getAttribute("data-select-shop"));
      try {
        await apiPost("/auth/select-shop", { shopId });
        closeModal();
      } catch (e) {
        $("#modal-body").innerHTML =
          `<div class="muted">Erro ao selecionar loja: ${escapeHtml(
            e.message
          )}</div>` + `<div style="margin-top:12px;">${optionsHtml}</div>`;
      }
    });
  });
}

/* “Trocar conta/loja” no topo (por enquanto clicando no status) */
function initSwitchShopShortcut() {
  const el = $("#auth-status");
  if (!el) return;

  el.style.cursor = "pointer";
  el.title = "Clique para trocar a loja";

  el.addEventListener("click", async () => {
    try {
      await loadMe();
      const shops = Array.isArray(ME?.shops) ? ME.shops : [];
      if (shops.length <= 1) return;
      await promptSelectShop(shops);
    } catch (_) {}
  });
}

/* ---------------- Orders (DB) ---------------- */
async function loadOrders() {
  const grid = $("#orders-grid");
  grid.innerHTML = `<div class="card"><div class="muted">Carregando pedidos...</div></div>`;

  try {
    await ensureShopSelected();

    const data = await apiGet(
      `/shops/${SHOP_PATH_PLACEHOLDER}/orders?limit=60`
    );

    const items = data.items || data.orders || [];
    if (!items.length) {
      grid.innerHTML = `<div class="card"><div class="muted">Nenhum pedido encontrado no banco. Clique em "Sincronizar Pedidos".</div></div>`;
      return;
    }

    grid.innerHTML = items
      .map((o) => {
        const orderSn = escapeHtml(o.orderSn || o.order_sn);
        const status = escapeHtml(o.orderStatus || o.order_status || "—");
        const shipBy = o.shipByDate
          ? new Date(o.shipByDate).toLocaleString("pt-BR")
          : "—";
        const updated = o.shopeeUpdateTime
          ? new Date(o.shopeeUpdateTime).toLocaleString("pt-BR")
          : "—";

        return `
          <div class="card clickable" data-order-sn="${orderSn}">
            <div class="card-title">Pedido ${orderSn}</div>
            <div class="muted">Status: ${status}</div>
            <div class="muted">Ship by: ${escapeHtml(shipBy)}</div>
            <div class="muted">Atualizado: ${escapeHtml(updated)}</div>
          </div>
        `;
      })
      .join("");

    $all("[data-order-sn]").forEach((el) => {
      el.addEventListener("click", async () => {
        const orderSn = el.getAttribute("data-order-sn");
        await openOrderDetail(orderSn);
      });
    });
  } catch (e) {
    grid.innerHTML = `<div class="card"><div class="muted">Erro ao carregar pedidos: ${escapeHtml(
      e.message
    )}</div></div>`;
  }
}

async function openOrderDetail(orderSn) {
  openModal(
    `Pedido ${escapeHtml(orderSn)}`,
    `<div class="muted">Carregando detalhes...</div>`
  );

  try {
    await ensureShopSelected();

    const data = await apiGet(
      `/shops/${SHOP_PATH_PLACEHOLDER}/orders/${encodeURIComponent(orderSn)}`
    );

    const order = data.order || data;
    const snap = data.lastAddressSnapshot || null;

    let html = "";
    html += `<div style="margin-bottom:10px;">
      <span class="badge">Status: ${escapeHtml(order.orderStatus || "—")}</span>
      <span class="badge gray" style="margin-left:8px;">Order SN: ${escapeHtml(
        order.orderSn
      )}</span>
    </div>`;

    html += kv(
      "Ship By",
      order.shipByDate
        ? escapeHtml(new Date(order.shipByDate).toLocaleString("pt-BR"))
        : "—"
    );
    html += kv(
      "Create Time",
      order.shopeeCreateTime
        ? escapeHtml(new Date(order.shopeeCreateTime).toLocaleString("pt-BR"))
        : "—"
    );
    html += kv(
      "Update Time",
      order.shopeeUpdateTime
        ? escapeHtml(new Date(order.shopeeUpdateTime).toLocaleString("pt-BR"))
        : "—"
    );
    html += kv("Region", escapeHtml(order.region || "—"));
    html += kv("Currency", escapeHtml(order.currency || "—"));

    if (snap) {
      html += `<div style="margin-top:14px; font-weight:800;">Último Endereço (snapshot)</div>`;
      html += kv("Nome", escapeHtml(snap.name || "—"));
      html += kv("Telefone", escapeHtml(snap.phone || "—"));
      html += kv("Cidade", escapeHtml(snap.city || "—"));
      html += kv("Estado", escapeHtml(snap.state || "—"));
      html += kv("CEP", escapeHtml(snap.zipcode || "—"));
      html += kv("Endereço", escapeHtml(snap.fullAddress || "—"));
      html += kv(
        "Criado em",
        snap.createdAt
          ? escapeHtml(new Date(snap.createdAt).toLocaleString("pt-BR"))
          : "—"
      );
    } else {
      html += `<div class="muted" style="margin-top:14px;">Sem snapshot de endereço salvo ainda.</div>`;
    }

    $("#modal-body").innerHTML = html;
  } catch (e) {
    $(
      "#modal-body"
    ).innerHTML = `<div class="muted">Erro ao carregar detalhes: ${escapeHtml(
      e.message
    )}</div>`;
  }
}

/* ---------------- Products (DB) ---------------- */
async function loadProducts() {
  const grid = $("#products-grid");
  grid.innerHTML = `<div class="card"><div class="muted">Carregando produtos...</div></div>`;

  try {
    await ensureShopSelected();

    const qs =
      `page=${PRODUCTS_PAGE}` +
      `&pageSize=${PRODUCTS_PAGE_SIZE}` +
      `&q=${encodeURIComponent(PRODUCTS_Q)}` +
      `&sortBy=${encodeURIComponent(PRODUCTS_SORT_BY)}` +
      `&sortDir=${encodeURIComponent(PRODUCTS_SORT_DIR)}`;

    const data = await apiGet(`/shops/${SHOP_PATH_PLACEHOLDER}/products?${qs}`);

    const items = data.items || data.products || [];
    const meta = data.meta || {};

    PRODUCTS_PAGE = meta.page || PRODUCTS_PAGE;
    PRODUCTS_TOTAL_PAGES = meta.totalPages || 1;

    setText(
      "products-page-info",
      `Página ${PRODUCTS_PAGE} de ${PRODUCTS_TOTAL_PAGES} • Total: ${
        meta.total ?? "—"
      }`
    );

    const prev = $("#products-prev");
    const next = $("#products-next");
    const first = $("#products-first");
    const last = $("#products-last");

    if (prev) prev.disabled = PRODUCTS_PAGE <= 1;
    if (first) first.disabled = PRODUCTS_PAGE <= 1;
    if (next) next.disabled = PRODUCTS_PAGE >= PRODUCTS_TOTAL_PAGES;
    if (last) last.disabled = PRODUCTS_PAGE >= PRODUCTS_TOTAL_PAGES;

    if (!items.length) {
      grid.innerHTML = `<div class="card"><div class="muted">Nenhum produto encontrado no banco. Clique em "Sincronizar Produtos".</div></div>`;
      return;
    }

    grid.innerHTML = items
      .map((p) => {
        const itemId = escapeHtml(p.itemId ?? p.item_id);
        const title = escapeHtml(p.title || p.item_name || "Sem título");
        const status = escapeHtml(p.status || p.item_status || "—");

        const stockValue = p.totalStock ?? p.stock;
        const stock = escapeHtml(stockValue ?? "—");

        const sold = escapeHtml(p.sold ?? "—");
        const img = p.images?.[0]?.url ? escapeHtml(p.images[0].url) : "";

        const ratingStar = p.ratingStar ?? null;
        const ratingCount = p.ratingCount ?? null;

        const ratingStarNum = ratingStar == null ? null : Number(ratingStar);
        const ratingText =
          ratingStarNum == null || Number.isNaN(ratingStarNum)
            ? "⭐ —"
            : `⭐ ${ratingStarNum.toFixed(1)}${
                ratingCount != null ? ` (${ratingCount})` : ""
              }`;

        const priceMin = p.priceMin ?? null;
        const priceMax = p.priceMax ?? null;

        let priceText = "Preço: —";
        if (priceMin != null && priceMax != null) {
          const pmin = formatBRLFixed90(priceMin);
          const pmax = formatBRLFixed90(priceMax);

          priceText =
            priceMin === priceMax
              ? `Preço: ${escapeHtml(pmin)}`
              : `Preço: ${escapeHtml(pmin)} – ${escapeHtml(pmax)}`;
        }

        return `
          <div class="card clickable" data-item-id="${itemId}">
            <div class="card-title">${title}</div>
            ${img ? `<img class="product-cover" src="${img}" alt="" />` : ""}
            <div class="muted">Item ID: ${itemId}</div>
            <div class="muted">Status: ${status}</div>
            <div class="muted">${escapeHtml(ratingText)}</div>
            <div class="muted">${priceText}</div>
            <div class="muted">Estoque: ${stock} • Vendidos: ${sold}</div>
          </div>
        `;
      })
      .join("");

    $all("[data-item-id]").forEach((el) => {
      el.addEventListener("click", async () => {
        const itemId = el.getAttribute("data-item-id");
        await openProductDetail(itemId);
      });
    });
  } catch (e) {
    $(
      "#products-grid"
    ).innerHTML = `<div class="card"><div class="muted">Erro ao carregar produtos: ${escapeHtml(
      e.message
    )}</div></div>`;
  }
}

async function openProductDetail(itemId) {
  openModal(
    `Produto ${escapeHtml(itemId)}`,
    `<div class="muted">Carregando detalhes...</div>`
  );

  try {
    await ensureShopSelected();

    const data = await apiGet(
      `/shops/${SHOP_PATH_PLACEHOLDER}/products/${encodeURIComponent(
        itemId
      )}/full`
    );

    const p = data.product || data;
    const extra = data.extra || {};

    let html = "";

    html += `<div class="product-detail-grid">`;
    html += kv("Status", escapeHtml(p.status || "—"));
    html += kv("Brand", escapeHtml(p.brand || "—"));
    html += kv("Stock", escapeHtml(p.totalStock ?? p.stock ?? "—"));
    html += kv("Sold (total)", escapeHtml(p.sold ?? "—"));
    html += kv("Currency", escapeHtml(p.currency || "—"));
    html += `</div>`;

    html += `<div style="margin-top:14px; font-weight:800;">Descrição</div>`;
    html += `<div class="card">${escapeHtml(extra.description || "—")}</div>`;

    const attrs = extra.attributes;
    if (Array.isArray(attrs) && attrs.length) {
      html += `<div style="margin-top:14px; font-weight:800;">Ficha técnica</div>`;
      html += attrs
        .map((a) => {
          const name =
            a?.original_attribute_name ||
            a?.attribute_name ||
            a?.attribute_id ||
            "—";

          const values = Array.isArray(a?.attribute_value_list)
            ? a.attribute_value_list
                .map((v) => v?.original_value_name || v?.value || "")
                .filter(Boolean)
                .join(", ")
            : "";

          return `<div class="card">${escapeHtml(name)}: ${escapeHtml(
            values || "—"
          )}</div>`;
        })
        .join("");
    }

    if (extra.daysToShip != null || Array.isArray(extra.logistics)) {
      html += `<div style="margin-top:14px; font-weight:800;">Envio</div>`;

      if (extra.daysToShip != null) {
        html += `<div class="card">Days to ship: ${escapeHtml(
          extra.daysToShip
        )}</div>`;
      }

      if (Array.isArray(extra.logistics) && extra.logistics.length) {
        html += extra.logistics
          .map((l) => {
            const name = l?.logistic_name || "—";
            const enabled = l?.enabled ? "Sim" : "Não";
            const fee =
              l?.estimated_shipping_fee != null
                ? String(l.estimated_shipping_fee)
                : "—";
            return `<div class="card">${escapeHtml(name)} • Ativo: ${escapeHtml(
              enabled
            )} • Frete estimado: ${escapeHtml(fee)}</div>`;
          })
          .join("");
      }
    }

    if (extra.dimension || extra.weight != null) {
      html += `<div style="margin-top:14px; font-weight:800;">Dimensões / Peso</div>`;

      if (extra.dimension) {
        const d = extra.dimension;
        html += `<div class="card">Pacote: ${escapeHtml(
          d.package_length ?? "—"
        )} x ${escapeHtml(d.package_width ?? "—")} x ${escapeHtml(
          d.package_height ?? "—"
        )}</div>`;
      }

      if (extra.weight != null) {
        html += `<div class="card">Peso: ${escapeHtml(extra.weight)} kg</div>`;
      }
    }

    if (Array.isArray(p.images) && p.images.length) {
      html += `<div style="margin-top:14px; font-weight:800;">Imagens</div>`;
      html +=
        `<div class="grid-3">` +
        p.images
          .slice(0, 6)
          .map(
            (im) =>
              `<div class="card"><img src="${escapeHtml(
                im.url
              )}" alt="" style="width:100%; border-radius:12px; border:1px solid rgba(255,255,255,0.10);" /></div>`
          )
          .join("") +
        `</div>`;
    }

    if (Array.isArray(p.models) && p.models.length) {
      html += `<div style="margin-top:14px; font-weight:800;">Variações</div>`;
      html += p.models
        .map((m) => {
          return `
            <div class="card" style="margin:10px 0;">
              <div class="card-title">${escapeHtml(m.name || "Modelo")}</div>
              <div class="muted">Model ID: ${escapeHtml(
                String(m.modelId)
              )}</div>
              <div class="muted">SKU: ${escapeHtml(m.sku || "—")}</div>
              <div class="muted">Estoque: ${escapeHtml(
                m.stock ?? "—"
              )} • Vendidos: ${escapeHtml(m.sold ?? "—")}</div>
              <div class="muted">Preço: ${escapeHtml(
                formatBRLFixed90(m.price)
              )}</div>
            </div>
          `;
        })
        .join("");
    } else {
      html += `<div class="muted" style="margin-top:14px;">Sem variações salvas.</div>`;
    }

    $("#modal-body").innerHTML = html;
  } catch (e) {
    $(
      "#modal-body"
    ).innerHTML = `<div class="muted">Erro ao carregar detalhes: ${escapeHtml(
      e.message
    )}</div>`;
  }
}

/* ---------------- Sync Buttons ---------------- */
function initSyncButtons() {
  const btnOrders = $("#btn-sync-orders");
  const btnProducts = $("#btn-sync-products");

  if (btnOrders) {
    btnOrders.addEventListener("click", async () => {
      setText("orders-sync-status", "Sincronizando pedidos...");
      try {
        const res = await apiPost(
          `/shops/${SHOP_PATH_PLACEHOLDER}/orders/sync?rangeDays=7`
        );
        setText(
          "orders-sync-status",
          `OK • Processados: ${res?.summary?.processed ?? "—"}`
        );
        await loadOrders();
      } catch (e) {
        setText("orders-sync-status", `Erro: ${e.message}`);
      }
    });
  }

  if (btnProducts) {
    btnProducts.addEventListener("click", async () => {
      setText("products-sync-status", "Sincronizando produtos...");
      try {
        const res = await apiPost(
          `/shops/${SHOP_PATH_PLACEHOLDER}/products/sync`
        );
        setText(
          "products-sync-status",
          `OK • Upserted: ${res?.summary?.upserted ?? "—"}`
        );
        await loadProducts();
      } catch (e) {
        setText("products-sync-status", `Erro: ${e.message}`);
      }
    });
  }
}

function initProductsToolbar() {
  const pageSizeSel = $("#products-page-size");
  const sortBySel = $("#products-sort-by");
  const sortDirSel = $("#products-sort-dir");

  const qInput = $("#products-q");
  const btnSearch = $("#products-search");
  const btnClear = $("#products-clear");

  const first = $("#products-first");
  const prev = $("#products-prev");
  const next = $("#products-next");
  const last = $("#products-last");

  if (pageSizeSel) {
    pageSizeSel.value = String(PRODUCTS_PAGE_SIZE);
    pageSizeSel.addEventListener("change", async () => {
      PRODUCTS_PAGE_SIZE = Number(pageSizeSel.value);
      PRODUCTS_PAGE = 1;
      await loadProducts();
    });
  }

  if (sortBySel) {
    sortBySel.value = PRODUCTS_SORT_BY;
    sortBySel.addEventListener("change", async () => {
      PRODUCTS_SORT_BY = String(sortBySel.value || "updatedAt");
      PRODUCTS_PAGE = 1;
      await loadProducts();
    });
  }

  if (sortDirSel) {
    sortDirSel.value = PRODUCTS_SORT_DIR;
    sortDirSel.addEventListener("change", async () => {
      PRODUCTS_SORT_DIR = String(sortDirSel.value || "desc");
      PRODUCTS_PAGE = 1;
      await loadProducts();
    });
  }

  const doSearch = async () => {
    PRODUCTS_Q = String(qInput?.value || "").trim();
    PRODUCTS_PAGE = 1;
    await loadProducts();
  };

  if (btnSearch) btnSearch.addEventListener("click", doSearch);

  if (qInput) {
    qInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") await doSearch();
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      if (qInput) qInput.value = "";
      PRODUCTS_Q = "";
      PRODUCTS_PAGE = 1;
      await loadProducts();
    });
  }

  if (first) {
    first.addEventListener("click", async () => {
      PRODUCTS_PAGE = 1;
      await loadProducts();
    });
  }

  if (prev) {
    prev.addEventListener("click", async () => {
      PRODUCTS_PAGE = Math.max(1, PRODUCTS_PAGE - 1);
      await loadProducts();
    });
  }

  if (next) {
    next.addEventListener("click", async () => {
      PRODUCTS_PAGE = Math.min(PRODUCTS_TOTAL_PAGES, PRODUCTS_PAGE + 1);
      await loadProducts();
    });
  }

  if (last) {
    last.addEventListener("click", async () => {
      PRODUCTS_PAGE = PRODUCTS_TOTAL_PAGES;
      await loadProducts();
    });
  }
}
function initHeaderButtons() {
  const btnSwitch = document.getElementById("btn-switch-shop");
  const btnLogout = document.getElementById("btn-logout");

  if (btnSwitch) {
    btnSwitch.addEventListener("click", async () => {
      try {
        await loadMe();
        const shops = Array.isArray(ME?.shops) ? ME.shops : [];
        const role = String(ME?.user?.role || "");
        const activeShopId = ME?.activeShopId ?? null;

        openShopSwitcherModal({ shops, role, activeShopId });
      } catch (e) {
        openModal("Erro", `<div class="muted">${escapeHtml(e.message)}</div>`);
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      try {
        await apiPost("/auth/logout");
      } catch (_) {}
      window.location.href = "/login";
    });
  }
}

function openShopSwitcherModal({ shops, role, activeShopId }) {
  const canAddShop = role === "ADMIN" || role === "SUPER_ADMIN";
  const limitReached = shops.length >= 2;

  const shopsHtml = shops.length
    ? shops
        .map((s) => {
          const isActive =
            activeShopId != null && Number(s.id) === Number(activeShopId);

          const title = s.shopId
            ? `ShopId Shopee: ${escapeHtml(String(s.shopId))}`
            : "Loja";
          const region = s.region ? ` • ${escapeHtml(String(s.region))}` : "";
          const status = s.status ? ` • ${escapeHtml(String(s.status))}` : "";

          return `
            <button class="btn btn-primary" data-select-shop="${escapeHtml(
              String(s.id)
            )}" style="width:100%; margin-top:10px;">
              ${title}${region}${status}${isActive ? ` • (ATIVA)` : ""}
            </button>
          `;
        })
        .join("")
    : `<div class="muted" style="margin-top:10px;">Nenhuma loja vinculada.</div>`;

  const left = `
    <div style="flex:1; min-width:280px;">
      <div class="card-title">Lojas desta conta</div>
      <div class="muted" style="margin-top:6px;">Selecione qual deseja usar.</div>
      <div style="margin-top:10px;">${shopsHtml}</div>
    </div>
  `;

  const right = canAddShop
    ? `
      <div style="flex:1; min-width:280px;">
        <div class="card-title">Adicionar nova loja</div>
        <div class="muted" style="margin-top:6px;">
          ${
            limitReached
              ? "Limite de 2 lojas por conta atingido."
              : "Você pode adicionar mais 1 loja (limite 2)."
          }
        </div>
        <div style="margin-top:10px;">
          <button id="btn-add-shop" class="btn btn-primary" ${
            limitReached ? "disabled" : ""
          }>+ Adicionar nova loja</button>
        </div>
      </div>
    `
    : `
      <div style="flex:1; min-width:280px;">
        <div class="card-title">Adicionar nova loja</div>
        <div class="muted" style="margin-top:6px;">Somente usuários Admin podem adicionar lojas.</div>
      </div>
    `;

  openModal(
    "Trocar loja",
    `<div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start;">${left}${right}</div>`
  );

  // selecionar loja (qualquer usuário pode)
  $all("[data-select-shop]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const shopId = Number(btn.getAttribute("data-select-shop"));
      try {
        await apiPost("/auth/select-shop", { shopId });
        closeModal();
        await loadMe();
      } catch (e) {
        openModal("Erro", `<div class="muted">${escapeHtml(e.message)}</div>`);
      }
    });
  });

  // adicionar loja (admin)
  const btnAdd = document.getElementById("btn-add-shop");
  if (btnAdd && !btnAdd.disabled) {
    btnAdd.addEventListener("click", async () => {
      try {
        const data = await apiGet("/auth/url?mode=add_shop");
        const url = data?.auth_url || null;
        if (url) window.location.href = url;
        else
          openModal(
            "Erro",
            `<div class="muted">Não foi possível gerar o link.</div>`
          );
      } catch (e) {
        openModal("Erro", `<div class="muted">${escapeHtml(e.message)}</div>`);
      }
    });
  }
}

function getQueryParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function activateTab(tab) {
  const tabs = $all(".tab");
  const panels = $all(".tab-panel");

  tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  panels.forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
}

async function startShopeeOauthFlowIfRequested() {
  const tab = getQueryParam("tab");
  const startOauth = getQueryParam("startOauth");

  if (tab === "auth") activateTab("auth");
  if (startOauth !== "1") return;

  try {
    const data = await apiGet("/auth/url");
    const url = data?.auth_url || data?.authUrl || data?.url || null;

    const preview = document.getElementById("auth-url-preview");
    if (preview)
      preview.textContent = url ? url : "Não foi possível gerar o link.";

    if (url) window.location.href = url;
  } catch (e) {
    const preview = document.getElementById("auth-url-preview");
    if (preview) preview.textContent = `Erro ao gerar link: ${e.message}`;
  }
}

async function loadAdmin() {
  const root = document.getElementById("admin-root");
  if (!root) return;

  root.innerHTML = `<div class="muted">Carregando...</div>`;

  try {
    await loadMe();
    const role = String(ME?.user?.role || "");

    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      root.innerHTML = `<div class="muted">Sem permissão.</div>`;
      return;
    }

    const usersData = await apiGet("/admin/users");
    const users = Array.isArray(usersData?.users) ? usersData.users : [];

    const formHtml = `
      <div class="card" style="margin-bottom:12px;">
        <div class="card-title">Adicionar acesso novo</div>
        <div class="muted" style="margin-top:6px;">Crie um usuário para acessar esta conta.</div>

        <div style="margin-top:12px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <input id="admin-new-name" class="input" placeholder="Nome" />
          <input id="admin-new-email" class="input" placeholder="E-mail" />
          <input id="admin-new-pass" class="input" placeholder="Senha" type="password" />
          <select id="admin-new-role" class="select">
            <option value="VIEWER" selected>Usuário</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
          <button id="admin-create-user" class="btn btn-primary">Criar acesso</button>
          <div id="admin-create-msg" class="muted"></div>
        </div>
      </div>
    `;

    const listHtml = `
      <div class="card">
        <div class="card-title">Acessos da Conta</div>
        <div class="muted" style="margin-top:6px;">Troque a função entre Admin e Usuário.</div>

        <div style="margin-top:10px;">
          ${
            users.length
              ? users
                  .map((u) => {
                    const id = escapeHtml(String(u.id));
                    const name = escapeHtml(u.name || "—");
                    const email = escapeHtml(u.email || "—");
                    const uRole = escapeHtml(String(u.role || "VIEWER"));

                    return `
                      <div class="card" style="margin-top:10px;">
                        <div class="card-title">${name}</div>
                        <div class="muted">${email}</div>
                         <button class="btn" data-edit-user="${id}">Editar</button>
                        <div style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                          <div class="muted">Função atual: <strong>${uRole}</strong></div>
                          <button class="btn btn-ghost" data-role-toggle="${id}" data-current-role="${uRole}">
                          
                            Alternar para ${
                              uRole === "ADMIN" ? "Usuário" : "Admin"
                            }
                          </button>
                        </div>
                      </div>
                    `;
                  })
                  .join("")
              : `<div class="muted" style="margin-top:10px;">Nenhum usuário.</div>`
          }
        </div>
      </div>
    `;

    root.innerHTML = formHtml + listHtml;

    // Create user
    const btnCreate = document.getElementById("admin-create-user");
    const msg = document.getElementById("admin-create-msg");

    if (btnCreate) {
      btnCreate.addEventListener("click", async () => {
        const name = String(
          document.getElementById("admin-new-name")?.value || ""
        ).trim();
        const email = String(
          document.getElementById("admin-new-email")?.value || ""
        ).trim();
        const password = String(
          document.getElementById("admin-new-pass")?.value || ""
        );
        const newRole = String(
          document.getElementById("admin-new-role")?.value || "VIEWER"
        ).toUpperCase();

        if (!name || !email || !password) {
          if (msg) msg.textContent = "Informe nome, e-mail e senha.";
          return;
        }

        try {
          if (msg) msg.textContent = "Criando...";
          await apiPost("/admin/users", {
            name,
            email,
            password,
            role: newRole,
          });
          if (msg) msg.textContent = "Acesso criado com sucesso.";
          await loadAdmin();
        } catch (e) {
          if (msg) msg.textContent = `Erro: ${e.message}`;
        }
      });
    }

    // Toggle role ADMIN <-> VIEWER
    $all("[data-role-toggle]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = Number(btn.getAttribute("data-role-toggle"));
        const current = String(
          btn.getAttribute("data-current-role") || "VIEWER"
        ).toUpperCase();
        const nextRole = current === "ADMIN" ? "VIEWER" : "ADMIN";

        try {
          await apiPatch(`/admin/users/${userId}/role`, { role: nextRole });
          await loadAdmin();
        } catch (e) {
          openModal(
            "Erro",
            `<div class="muted">${escapeHtml(e.message)}</div>`
          );
        }
      });
    });
    $all("[data-edit-user]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = Number(btn.getAttribute("data-edit-user"));
        const u = users.find((x) => Number(x.id) === userId);
        if (!u) return;

        openModal(
          "Editar usuário",
          `
        <div class="muted">Atualize nome/e-mail e (opcional) defina uma nova senha.</div>
        <div style="margin-top:12px; display:grid; gap:10px;">
          <input id="edit-user-name" class="input" placeholder="Nome" value="${escapeHtml(
            u.name || ""
          )}" />
          <input id="edit-user-email" class="input" placeholder="E-mail" value="${escapeHtml(
            u.email || ""
          )}" />
          <input id="edit-user-pass" class="input" placeholder="Nova senha (opcional)" type="password" />
        </div>
        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btn-save-user" class="btn btn-primary">Salvar</button>
          <button id="btn-del-user" class="btn btn-ghost">Excluir usuário</button>
        </div>
        <div id="edit-user-msg" class="muted" style="margin-top:10px;"></div>
      `
        );

        document
          .getElementById("btn-save-user")
          ?.addEventListener("click", async () => {
            const name = String(
              document.getElementById("edit-user-name")?.value || ""
            ).trim();
            const email = String(
              document.getElementById("edit-user-email")?.value || ""
            ).trim();
            const password = String(
              document.getElementById("edit-user-pass")?.value || ""
            );

            try {
              const body = {};
              if (name) body.name = name;
              if (email) body.email = email;
              if (password) body.password = password;

              document.getElementById("edit-user-msg").textContent =
                "Salvando...";
              await apiPatch(`/admin/users/${userId}`, body);
              document.getElementById("edit-user-msg").textContent =
                "Salvo com sucesso.";
              closeModal();
              await loadAdmin();
            } catch (e) {
              document.getElementById(
                "edit-user-msg"
              ).textContent = `Erro: ${e.message}`;
            }
          });

        document
          .getElementById("btn-del-user")
          ?.addEventListener("click", async () => {
            try {
              document.getElementById("edit-user-msg").textContent =
                "Excluindo...";
              await apiDelete(`/admin/users/${userId}`);
              closeModal();
              await loadAdmin();
            } catch (e) {
              document.getElementById(
                "edit-user-msg"
              ).textContent = `Erro: ${e.message}`;
            }
          });
      });
    });
  } catch (e) {
    root.innerHTML = `<div class="muted">Erro no Admin: ${escapeHtml(
      e.message
    )}</div>`;
  }
}

async function apiPatch(path, body) {
  const r = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  return text ? JSON.parse(text) : null;
}

function initAuthTab() {
  const btn = document.getElementById("btn-auth-url");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const preview = document.getElementById("auth-url-preview");
    if (preview) preview.textContent = "Gerando link...";

    try {
      const data = await apiGet("/auth/url");
      const url = data?.auth_url || data?.authUrl || data?.url || null;
      if (preview)
        preview.textContent = url ? url : "Não foi possível gerar o link.";
      if (url) window.location.href = url;
    } catch (e) {
      if (preview) preview.textContent = `Erro: ${e.message}`;
    }
  });
}

async function apiDelete(path) {
  const r = await fetch(path, { method: "DELETE", credentials: "include" });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  return text ? JSON.parse(text) : null;
}

/* ---------------- Boot ---------------- */
async function boot() {
  initTabs();
  initModal();
  initSyncButtons();
  initProductsToolbar();
  initSwitchShopShortcut();
  initHeaderButtons();
  initAuthTab();

  try {
    await loadMe();
    await startShopeeOauthFlowIfRequested();
  } catch (e) {
    setText("auth-status", "Não autenticado. Recarregue a página.");
  }
}

boot();
