const SHOP_ID = "348584331"; // ajuste se quiser tornar dinâmico depois

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
  const r = await fetch(path);
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  return JSON.parse(text);
}

async function apiPost(path) {
  const r = await fetch(path, { method: "POST" });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  return JSON.parse(text);
}

/* ---------------- Tabs ---------------- */
function initTabs() {
  const tabs = $all(".tab");
  const panels = $all(".tab-panel");

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      tabs.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((p) =>
        p.classList.toggle("active", p.id === `tab-${tab}`)
      );

      if (tab === "products") loadProducts();
      if (tab === "orders") loadOrders();
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

/* ---------------- Orders (DB) ---------------- */
async function loadOrders() {
  const grid = $("#orders-grid");
  grid.innerHTML = `<div class="card"><div class="muted">Carregando pedidos...</div></div>`;

  try {
    // precisa existir no backend: GET /shops/:shopId/orders  (DB)
    const data = await apiGet(`/shops/${SHOP_ID}/orders?limit=60`);

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
    // precisa existir no backend: GET /shops/:shopId/orders/:orderSn  (DB)
    const data = await apiGet(
      `/shops/${SHOP_ID}/orders/${encodeURIComponent(orderSn)}`
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
    // precisa existir no backend: GET /shops/:shopId/products  (DB)
    const data = await apiGet(`/shops/${SHOP_ID}/products?limit=60`);

    const items = data.items || data.products || [];
    if (!items.length) {
      grid.innerHTML = `<div class="card"><div class="muted">Nenhum produto encontrado no banco. Clique em "Sincronizar Produtos".</div></div>`;
      return;
    }

    grid.innerHTML = items
      .map((p) => {
        const itemId = escapeHtml(p.itemId ?? p.item_id);
        const title = escapeHtml(p.title || p.item_name || "Sem título");
        const status = escapeHtml(p.status || p.item_status || "—");
        const stock = escapeHtml(p.stock ?? "—");
        const sold = escapeHtml(p.sold ?? "—");
        const img = p.images?.[0]?.url ? escapeHtml(p.images[0].url) : "";

        return `
          <div class="card clickable" data-item-id="${itemId}">
            <div class="card-title">${title}</div>
            ${
              img
                ? `<img src="${img}" alt="" style="width:100%; border-radius:12px; margin:10px 0; border:1px solid rgba(255,255,255,0.10);" />`
                : ""
            }
            <div class="muted">Item ID: ${itemId}</div>
            <div class="muted">Status: ${status}</div>
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
    grid.innerHTML = `<div class="card"><div class="muted">Erro ao carregar produtos: ${escapeHtml(
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
    // precisa existir no backend: GET /shops/:shopId/products/:itemId  (DB com models)
    const data = await apiGet(
      `/shops/${SHOP_ID}/products/${encodeURIComponent(itemId)}`
    );
    const p = data.product || data;

    let html = "";
    html += `<div style="margin-bottom:10px;">
      <span class="badge">${escapeHtml(p.title || "Produto")}</span>
      <span class="badge gray" style="margin-left:8px;">Item ID: ${escapeHtml(
        String(p.itemId)
      )}</span>
    </div>`;

    html += kv("Status", escapeHtml(p.status || "—"));
    html += kv("Brand", escapeHtml(p.brand || "—"));
    html += kv("Stock", escapeHtml(p.stock ?? "—"));
    html += kv("Sold", escapeHtml(p.sold ?? "—"));
    html += kv("Currency", escapeHtml(p.currency || "—"));

    if (Array.isArray(p.images) && p.images.length) {
      html += `<div style="margin-top:14px; font-weight:800;">Imagens</div>`;
      html +=
        `<div class="grid" style="grid-template-columns: repeat(3, minmax(0, 1fr));">` +
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
              <div class="muted">Preço: ${escapeHtml(m.price ?? "—")}</div>
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
        const res = await apiPost(`/shops/${SHOP_ID}/orders/sync?rangeDays=7`);
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
        const res = await apiPost(`/shops/${SHOP_ID}/products/sync`);
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

/* ---------------- Boot ---------------- */
async function boot() {
  initTabs();
  initModal();
  initSyncButtons();

  // Carrega auth status básico (se você tiver endpoint, plugamos)
  setText("auth-status", "Dashboard pronto. Use as abas para ver dados.");

  // Pré-carregar pedidos/produtos opcional:
  // await loadOrders();
  // await loadProducts();
}

boot();
