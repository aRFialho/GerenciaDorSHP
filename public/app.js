let PRODUCTS_PAGE = 1;
let PRODUCTS_PAGE_SIZE = 50;
let PRODUCTS_TOTAL_PAGES = 1;
let PRODUCTS_Q = "";
let PRODUCTS_SORT_BY = "updatedAt";
let PRODUCTS_SORT_DIR = "desc";
let GEO_STATIC = null;
let DASH_CHART = null;
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

function formatBRLCents(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

      if (tab === "products" || tab === "orders" || tab === "geo-sales") {
        await ensureShopSelected();
      }

      if (tab === "products") loadProducts();
      if (tab === "orders") loadOrders();
      if (tab === "admin") loadAdmin();
      if (tab === "geo-sales") loadGeoSales();
      if (tab === "dashboard") loadDashboard();
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

  if (shops.length === 0) {
    openModal(
      "Conectar Shopee",
      `<div class="muted">Nenhuma loja vinculada a esta conta ainda.</div>
       <div class="muted" style="margin-top:10px;">Conecte sua Shopee na aba Autenticação.</div>`
    );
    return;
  }

  if (shops.length === 1 && !active) {
    await apiPost("/auth/select-shop", { shopId: shops[0].id });
    await loadMe();
    return;
  }

  if (shops.length > 1 && !active) {
    await promptSelectShop(shops);
    await loadMe();
    return;
  }
}
async function loadDashboard() {
  await ensureShopSelected();
  const msg = document.getElementById("dashMsg");
  if (msg) msg.textContent = "Carregando...";

  try {
    const data = await apiGet(
      `/shops/${SHOP_PATH_PLACEHOLDER}/dashboard/monthly-sales`
    );

    setText("dashPeriodLabel", data.period.label);
    setText(
      "dashDayLabel",
      `${data.period.dayOfMonth}/${data.period.daysInMonth}`
    );
    setText("dashProgressLabel", `${data.period.progressPct}%`);

    setText("dashGmvMtd", formatBRLCents(data.metrics.gmvMtdCents));
    setText("dashAvgPerDay", formatBRLCents(data.metrics.avgPerDayCents));
    setText("dashProjection", formatBRLCents(data.metrics.projectionCents));
    setText("dashAdsStatus", "Ads: Ads não configurado");
    setText(
      "dashAdsAttributed",
      formatBRLCents(data.metrics.adsAttributedCents || 0)
    );
    setText(
      "dashOrganicEstimated",
      formatBRLCents(data.metrics.organicEstimatedCents)
    );
    setText("dashOrdersCount", String(data.metrics.ordersCountMtd));
    setText("dashTicketAvg", formatBRLCents(data.metrics.ticketAvgCents));
    setText(
      "dashFormula",
      "( total_vendas_mês_atual / dia_atual ) x dias_do_mês"
    );
    const labels = data.dailyBars.map((d) => d.day);
    const values = data.dailyBars.map((d) => (d.gmvCents || 0) / 100);

    const today = Number(data?.period?.dayOfMonth || 1);

    const colors = labels.map(
      (day) =>
        day < today
          ? "rgba(255, 106, 0, 0.35)" // passado (laranja)
          : day === today
          ? "rgba(255, 46, 147, 0.55)" // hoje (rosa)
          : "rgba(148, 163, 184, 0.18)" // futuro (cinza)
    );

    const ctx = document.getElementById("dashSalesChart")?.getContext("2d");
    if (DASH_CHART) DASH_CHART.destroy();
    if (ctx) {
      if (!window.Chart) {
        if (msg) msg.textContent = "Chart.js não carregou.";
        return;
      }
      DASH_CHART = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ data: values, backgroundColor: colors }] },
        options: {
          responsive: true,
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
          scales: {
            x: { grid: { display: false }, ticks: { display: false } },
            y: { grid: { display: false }, ticks: { display: false } },
          },
        },
      });
    }

    if (msg) msg.textContent = "";
  } catch (e) {
    if (msg) msg.textContent = `Erro: ${e.message}`;
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

let ORDERS_GRID_BOUND = false;

function bindOrdersGridClicks() {
  if (ORDERS_GRID_BOUND) return;
  ORDERS_GRID_BOUND = true;

  const grid = $("#orders-grid");
  if (!grid) return;

  grid.addEventListener("click", async (e) => {
    // Se clicou no botão do alerta → abre comparação
    const alertBtn = e.target.closest("[data-order-alert]");
    if (alertBtn) {
      e.stopPropagation();
      const orderSn = alertBtn.getAttribute("data-order-alert");
      if (orderSn) await openOrderAddressChangeModal(orderSn);
      return;
    }

    // Caso contrário → abre detalhe do pedido
    const card = e.target.closest("[data-order-sn]");
    if (card) {
      const orderSn = card.getAttribute("data-order-sn");
      if (orderSn) await openOrderDetail(orderSn);
    }
  });
}

let ORDERS_OPEN_ADDRESS_ALERTS = []; // cache pro modal-lista

function fmtAddr(snap) {
  if (!snap) return "—";
  const parts = [
    snap.fullAddress || "",
    [snap.city, snap.state].filter(Boolean).join(" / "),
    snap.zipcode ? `CEP: ${snap.zipcode}` : "",
  ].filter(Boolean);
  return escapeHtml(parts.join(" • "));
}

async function refreshOrdersAddressAlertsBadge() {
  const badge = $("#orders-address-alerts-badge");
  if (!badge) return;

  try {
    const data = await apiGet(
      `/shops/${SHOP_PATH_PLACEHOLDER}/orders/address-alerts?limit=500`
    );

    const items = Array.isArray(data?.items) ? data.items : [];
    ORDERS_OPEN_ADDRESS_ALERTS = items;

    if (items.length > 0) {
      badge.style.display = "inline-flex";
      badge.textContent = String(items.length);
    } else {
      badge.style.display = "none";
      badge.textContent = "0";
    }
  } catch (_) {
    // se falhar, não quebra a tela
    badge.style.display = "none";
    badge.textContent = "0";
  }
}

function showOrdersAlertsPopover() {
  const pop = $("#orders-address-alerts-popover");
  if (pop) pop.style.display = "block";
}

function hideOrdersAlertsPopover() {
  const pop = $("#orders-address-alerts-popover");
  if (pop) pop.style.display = "none";
}

function isOrdersAlertsPopoverOpen() {
  const pop = $("#orders-address-alerts-popover");
  return pop && pop.style.display !== "none";
}

function renderOrdersAlertsPopover() {
  const list = $("#orders-address-alerts-list");
  if (!list) return;

  if (!ORDERS_OPEN_ADDRESS_ALERTS.length) {
    list.innerHTML = `<div class="orders-alerts-empty">Nenhum alerta de endereço em aberto.</div>`;
    return;
  }

  list.innerHTML = ORDERS_OPEN_ADDRESS_ALERTS.map((a) => {
    const orderSn = escapeHtml(a.orderSn || "—");
    const detected = a.detectedAt
      ? escapeHtml(new Date(a.detectedAt).toLocaleString("pt-BR"))
      : "—";
    const status = escapeHtml(a.orderStatus || "—");

    return `
        <div class="orders-alerts-item" data-open-order-alert="${orderSn}">
          <div style="font-weight:800;">Pedido ${orderSn}</div>
          <div class="muted">Detectado: ${detected}</div>
          <div class="muted">Status: ${status}</div>
        </div>
      `;
  }).join("");

  $all("[data-open-order-alert]").forEach((el) => {
    el.addEventListener("click", async () => {
      const orderSn = el.getAttribute("data-open-order-alert");
      hideOrdersAlertsPopover();
      await openOrderAddressChangeModal(orderSn);
    });
  });
}

function initOrdersAlertsPopover() {
  const btn = $("#btn-orders-address-alerts");
  const closeBtn = $("#orders-address-alerts-close");
  const wrap = $(".orders-alerts-wrap");

  if (btn) {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      if (isOrdersAlertsPopoverOpen()) {
        hideOrdersAlertsPopover();
        return;
      }

      showOrdersAlertsPopover();

      const list = $("#orders-address-alerts-list");
      if (list)
        list.innerHTML = `<div class="orders-alerts-empty">Carregando...</div>`;

      await refreshOrdersAddressAlertsBadge();
      renderOrdersAlertsPopover();
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", hideOrdersAlertsPopover);

  document.addEventListener("click", (e) => {
    if (!isOrdersAlertsPopoverOpen()) return;
    if (wrap && wrap.contains(e.target)) return;
    hideOrdersAlertsPopover();
  });
}

async function openOrderAddressChangeModal(orderSn) {
  openModal(
    `Endereço alterado • Pedido ${escapeHtml(orderSn)}`,
    `<div class="muted">Carregando comparação...</div>`
  );

  try {
    await ensureShopSelected();

    const data = await apiGet(
      `/shops/${SHOP_PATH_PLACEHOLDER}/orders/${encodeURIComponent(
        orderSn
      )}/address-alerts`
    );

    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      $(
        "#modal-body"
      ).innerHTML = `<div class="muted">Não há alertas abertos para este pedido.</div>`;
      return;
    }

    const a = items[0]; // mais recente
    const detected = a.detectedAt
      ? escapeHtml(new Date(a.detectedAt).toLocaleString("pt-BR"))
      : "—";

    const oldSnap = a.oldSnapshot || null;
    const newSnap = a.newSnapshot || null;

    const html = `
      <div class="muted">Detectado: ${detected}</div>

      <div style="margin-top:12px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="card">
          <div class="card-title">Endereço anterior</div>
          <div class="muted" style="margin-top:8px;">${fmtAddr(oldSnap)}</div>
        </div>

        <div class="card">
          <div class="card-title">Endereço novo</div>
          <div class="muted" style="margin-top:8px;">${fmtAddr(newSnap)}</div>
        </div>
      </div>

      ${
        items.length > 1
          ? `<div class="muted" style="margin-top:12px;">Há mais ${
              items.length - 1
            } alteração(ões) em aberto para este pedido.</div>`
          : ""
      }
    `;

    $("#modal-body").innerHTML = html;
  } catch (e) {
    $("#modal-body").innerHTML = `<div class="muted">Erro: ${escapeHtml(
      e.message
    )}</div>`;
  }
}

async function loadOrders() {
  const grid = $("#orders-grid");
  bindOrdersGridClicks();
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

        const hasAlert = Boolean(o.hasAddressAlert);
        const alertCount = Number(o.addressAlertCount || 0);

        return `
          <div class="card clickable order-card" data-order-sn="${orderSn}">
            ${
              hasAlert
                ? `<button class="order-addr-alert-btn" type="button" data-order-alert="${orderSn}" title="Endereço alterado">
                     !
                     ${
                       alertCount > 1
                         ? `<span class="order-addr-alert-badge">${escapeHtml(
                             String(alertCount)
                           )}</span>`
                         : ""
                     }
                   </button>`
                : ""
            }

            <div class="card-title">Pedido ${orderSn}</div>
            <div class="muted">Status: ${status}</div>
            <div class="muted">Ship by: ${escapeHtml(shipBy)}</div>
            <div class="muted">Atualizado: ${escapeHtml(updated)}</div>
          </div>
        `;
      })
      .join("");

    await refreshOrdersAddressAlertsBadge();
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

/* ---------------- Geo Sales (Mapa) ---------------- */

let GEO_READY = false;
let GEO_VIEW = "BR"; // "BR" | "UF"
let GEO_UF = null;
let GEO_LEGEND_CTRL = null;
let GEO_MONTHS = 6;

let GEO_MAP = null;
let GEO_BASE = null;
let GEO_STATES_LAYER = null;
let GEO_HEAT = null;

let GEO_BR_GEOJSON = null; // cache do geojson Brasil
let GEO_STATE_POINTS_CACHE = new Map(); // uf -> points[]

function normTextGeo(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getUfFromFeature(feature) {
  const p = feature?.properties || {};
  const cand =
    p.sigla ||
    p.SIGLA ||
    p.uf ||
    p.UF ||
    p.abbrev ||
    p.ABBREV ||
    p.SIGLA_UF ||
    feature?.id ||
    null;

  if (!cand) return null;

  const s = String(cand).toUpperCase().trim();
  if (/^[A-Z]{2}$/.test(s)) return s;

  const m = s.match(/([A-Z]{2})$/);
  return m ? m[1] : null;
}

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function colorForRatio(r) {
  // r: 0..1
  const x = clamp(r, 0, 1);

  // escala “quente” (laranja -> rosa)
  // retorna rgba para ficar elegante no tema escuro
  const a = 0.12 + 0.55 * x;
  if (x < 0.5) {
    // laranja
    return `rgba(255, 106, 0, ${a.toFixed(3)})`;
  }
  // rosa
  return `rgba(255, 46, 147, ${a.toFixed(3)})`;
}

function borderForRatio(r) {
  const x = clamp(r, 0, 1);
  const a = 0.1 + 0.55 * x;
  return `rgba(255,255,255,${a.toFixed(3)})`;
}

function fmtInt(n) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString("pt-BR") : "0";
}

async function loadGeoStatic() {
  if (GEO_STATIC) return GEO_STATIC;
  GEO_STATIC = await apiGet("/json/Geo.json");
  return GEO_STATIC;
}

async function loadBrStatesGeoJson() {
  const data = await loadGeoStatic();
  return data?.brStatesGeoJson || null;
}

async function loadUfPoints(uf) {
  const data = await loadGeoStatic();
  const key = String(uf || "").toUpperCase();
  const arr = data?.cityPointsByUf?.[key];
  return Array.isArray(arr) ? arr : [];
}

function ensureGeoDomBound() {
  if (GEO_READY) return;
  GEO_READY = true;

  const sel = $("#geoSalesMonths");
  const btnReload = $("#geoSalesReload");
  const btnBack = $("#geoSalesBack");

  if (sel) {
    GEO_MONTHS = Number(sel.value || 6);
    setText("geoSalesMonthsLabel", String(GEO_MONTHS));

    sel.addEventListener("change", async () => {
      GEO_MONTHS = Number(sel.value || 6);
      setText("geoSalesMonthsLabel", String(GEO_MONTHS));
      await loadGeoSales(); // recarrega mantendo a view atual
    });
  }

  if (btnReload) {
    btnReload.addEventListener("click", async () => {
      await loadGeoSales();
    });
  }

  if (btnBack) {
    btnBack.addEventListener("click", async () => {
      GEO_VIEW = "BR";
      GEO_UF = null;
      await renderGeoBrazil();
    });
  }
}

function ensureGeoMap() {
  if (GEO_MAP) return;

  const el = $("#geoSalesMap");
  if (!el) return;

  GEO_MAP = L.map(el, {
    zoomControl: true,
    scrollWheelZoom: true,
  }).setView([-14.2, -51.9], 4);

  GEO_BASE = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap",
  }).addTo(GEO_MAP);
}

function setGeoHeader({ title, subtitle, indexSubtitle, showBack }) {
  setText("geoSalesTitle", title);
  setText("geoSalesSubtitle", subtitle);
  setText("geoSalesIndexSubtitle", indexSubtitle);

  const back = $("#geoSalesBack");
  if (back) back.style.display = showBack ? "" : "none";
}

function renderGeoIndex(items, { mode, activeKey }) {
  const root = $("#geoSalesIndex");
  if (!root) return;

  if (!Array.isArray(items) || items.length === 0) {
    root.innerHTML = `<div class="muted">Sem dados para o período selecionado.</div>`;
    return;
  }

  const max = Math.max(...items.map((x) => Number(x.count || 0)));
  const html =
    `<div class="geo-index">` +
    items
      .map((x) => {
        const name = mode === "BR" ? String(x.uf) : String(x.city || "—");
        const key =
          mode === "BR"
            ? String(x.uf)
            : String(x.cityNorm || normTextGeo(x.city));
        const pct = max > 0 ? (Number(x.count || 0) / max) * 100 : 0;
        const active = activeKey && String(activeKey) === String(key);

        return `
          <div class="geo-index-item ${
            active ? "is-active" : ""
          }" data-geo-item="${escapeHtml(key)}" data-geo-mode="${escapeHtml(
          mode
        )}">
            <div class="geo-index-top">
              <div class="geo-index-name">${escapeHtml(name)}</div>
              <div class="geo-index-count">${escapeHtml(
                fmtInt(x.count || 0)
              )}</div>
            </div>
            <div class="geo-index-bar"><div style="width:${pct.toFixed(
              2
            )}%"></div></div>
          </div>
        `;
      })
      .join("") +
    `</div>`;

  root.innerHTML = html;

  $all("[data-geo-item]").forEach((el) => {
    el.addEventListener("click", async () => {
      const mode = el.getAttribute("data-geo-mode");
      const key = el.getAttribute("data-geo-item");

      if (mode === "BR") {
        const uf = String(key || "").toUpperCase();
        GEO_VIEW = "UF";
        GEO_UF = uf;
        await renderGeoState(uf);
      } else {
        // Em UF: clicar no item dá zoom em um ponto (se existir)
        const cityNorm = String(key || "");
        await geoZoomToCity(cityNorm);
      }
    });
  });
}

async function geoZoomToCity(cityNorm) {
  if (!GEO_MAP || !GEO_UF) return;

  const pts = await loadUfPoints(GEO_UF);
  const match = pts.find((p) => normTextGeo(p.city || p.name) === cityNorm);
  if (!match) return;

  const lat = Number(match.lat);
  const lng = Number(match.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  GEO_MAP.setView([lat, lng], 9, { animate: true });
}

function buildLegendRanges(max) {
  // você pode ajustar esses “degraus” como preferir
  if (max <= 0) return [];

  // Exemplo com ranges fixos que incluem "10–20"
  // e se max for maior, cria o último como "21+"
  const ranges = [
    { from: 1, to: 5 },
    { from: 6, to: 10 },
    { from: 11, to: 20 },
  ];

  if (max > 20) ranges.push({ from: 21, to: max });

  // remove ranges que não fazem sentido dado o max
  return ranges
    .filter((r) => r.from <= max)
    .map((r) => ({
      from: r.from,
      to: Math.min(r.to, max),
    }));
}

function setMapLegend({ max, title }) {
  if (!GEO_MAP) return;

  // remove a legenda anterior
  if (GEO_LEGEND_CTRL) {
    GEO_LEGEND_CTRL.remove();
    GEO_LEGEND_CTRL = null;
  }

  const ranges = buildLegendRanges(max);

  GEO_LEGEND_CTRL = L.control({ position: "bottomright" });
  GEO_LEGEND_CTRL.onAdd = function () {
    const div = L.DomUtil.create("div", "geo-map-legend");

    const head = `<div class="geo-map-legend__title">${escapeHtml(
      title
    )}</div>`;
    if (!ranges.length) {
      div.innerHTML =
        head + `<div class="geo-map-legend__item muted">Sem dados</div>`;
      return div;
    }

    const items = ranges
      .map((r) => {
        const mid = (r.from + r.to) / 2;
        const ratio = max > 0 ? mid / max : 0;
        const swatch = colorForRatio(ratio);
        const label = r.to >= max ? `${r.from}+` : `${r.from}–${r.to}`;
        return `<div class="geo-map-legend__item"><span class="geo-map-legend__swatch" style="background:${swatch};"></span><span class="geo-map-legend__label">${escapeHtml(
          label
        )} vendas</span></div>`;
      })
      .join("");

    div.innerHTML = head + items;
    return div;
  };

  GEO_LEGEND_CTRL.addTo(GEO_MAP);
}

async function renderGeoBrazil() {
  ensureGeoDomBound();
  ensureGeoMap();

  setGeoHeader({
    title: "Brasil",
    subtitle: "Vendas por estado",
    indexSubtitle: "Vendas por estado",
    showBack: false,
  });

  // limpa heat layer (se estiver em UF)
  if (GEO_HEAT) {
    GEO_MAP.removeLayer(GEO_HEAT);
    GEO_HEAT = null;
  }

  const months = GEO_MONTHS || 6;
  setText("geoSalesLegend", "Carregando…");

  const data = await apiGet(
    `/shops/${SHOP_PATH_PLACEHOLDER}/geo/sales?months=${encodeURIComponent(
      String(months)
    )}`
  );
  const items = Array.isArray(data?.items) ? data.items : [];

  // mapa uf -> count
  const countMap = new Map(
    items.map((x) => [String(x.uf).toUpperCase(), Number(x.count || 0)])
  );
  const max = Math.max(0, ...Array.from(countMap.values()));
  setMapLegend({ max, title: "Vendas (UF)" });
  // index (lado direito)
  renderGeoIndex(items, { mode: "BR", activeKey: GEO_UF });

  // geojson do Brasil
  const geo = await loadBrStatesGeoJson();

  // remove layer antigo
  if (GEO_STATES_LAYER) {
    GEO_MAP.removeLayer(GEO_STATES_LAYER);
    GEO_STATES_LAYER = null;
  }

  function styleFeature(feature) {
    const uf = getUfFromFeature(feature);
    const c = uf ? countMap.get(uf) || 0 : 0;
    const r = max > 0 ? c / max : 0;
    return {
      weight: 1,
      color: borderForRatio(r),
      fillColor: colorForRatio(r),
      fillOpacity: 0.85,
    };
  }

  function onEachFeature(feature, layer) {
    const uf = getUfFromFeature(feature) || "—";
    const c = countMap.get(uf) || 0;

    layer.on("click", async () => {
      GEO_VIEW = "UF";
      GEO_UF = uf;
      await renderGeoState(uf);
    });

    layer.on("mouseover", () => {
      layer.setStyle({ weight: 2, color: "rgba(238,77,45,0.85)" });
      layer
        .bindTooltip(`${uf} • ${fmtInt(c)} venda(s)`, { sticky: true })
        .openTooltip();
    });

    layer.on("mouseout", () => {
      GEO_STATES_LAYER.resetStyle(layer);
      layer.closeTooltip();
    });
  }

  GEO_STATES_LAYER = L.geoJSON(geo, {
    style: styleFeature,
    onEachFeature: onEachFeature,
  }).addTo(GEO_MAP);

  // zoom para Brasil
  try {
    GEO_MAP.fitBounds(GEO_STATES_LAYER.getBounds(), { padding: [18, 18] });
  } catch (_) {}

  setText(
    "geoSalesLegend",
    `Período: últimos ${months} meses • Total (com geo): ${fmtInt(
      data?.total || 0
    )}`
  );
}

async function renderGeoState(uf) {
  ensureGeoDomBound();
  ensureGeoMap();

  const months = GEO_MONTHS || 6;
  const UF = String(uf || "").toUpperCase();

  setGeoHeader({
    title: `Estado: ${UF}`,
    subtitle: "Vendas por cidade (heatmap)",
    indexSubtitle: "Vendas por cidade",
    showBack: true,
  });

  setText("geoSalesLegend", "Carregando…");

  // carrega agregação por cidade
  const data = await apiGet(
    `/shops/${SHOP_PATH_PLACEHOLDER}/geo/sales/${encodeURIComponent(
      UF
    )}?months=${encodeURIComponent(String(months))}`
  );

  const items = Array.isArray(data?.items) ? data.items : [];
  const cityCount = new Map(
    items.map((x) => [
      String(x.cityNorm || normTextGeo(x.city)),
      Number(x.count || 0),
    ])
  );

  // index (lado direito)
  renderGeoIndex(items, { mode: "UF", activeKey: null });

  // carrega pontos do estado
  const pts = await loadUfPoints(UF);

  // monta heat points
  const max = Math.max(0, ...items.map((x) => Number(x.count || 0)));

  const heatPoints = [];
  for (const p of pts) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const cityNorm = normTextGeo(p.city || p.name);
    const c = cityCount.get(cityNorm) || 0;
    if (c <= 0) continue;

    // intensidade 0..1
    const intensity = max > 0 ? c / max : 0;
    heatPoints.push([lat, lng, intensity]);
  }

  // remove layer de estados (pra não “poluir” no drilldown)
  if (GEO_STATES_LAYER) {
    GEO_MAP.removeLayer(GEO_STATES_LAYER);
    GEO_STATES_LAYER = null;
  }

  // remove heat anterior
  if (GEO_HEAT) {
    GEO_MAP.removeLayer(GEO_HEAT);
    GEO_HEAT = null;
  }

  GEO_HEAT = L.heatLayer(heatPoints, {
    radius: 22,
    blur: 18,
    maxZoom: 10,
    minOpacity: 0.25,
    gradient: { 0.2: "#ff6a00", 0.6: "#ff2e93", 1.0: "#ffffff" },
  }).addTo(GEO_MAP);

  // zoom aproximado pro estado: usa bounds dos pontos
  const latlngs = heatPoints.map((x) => [x[0], x[1]]);
  if (latlngs.length) {
    try {
      GEO_MAP.fitBounds(latlngs, { padding: [18, 18] });
    } catch (_) {}
  }

  setText(
    "geoSalesLegend",
    `Período: últimos ${months} meses • ${UF} • Total (com geo): ${fmtInt(
      data?.total || 0
    )}`
  );
}

async function loadGeoSales() {
  await ensureShopSelected();
  ensureGeoDomBound();
  ensureGeoMap();

  // Leaflet precisa recalcular tamanho quando a tab fica visível
  setTimeout(() => {
    try {
      GEO_MAP && GEO_MAP.invalidateSize();
    } catch (_) {}
  }, 60);

  if (GEO_VIEW === "UF" && GEO_UF) {
    await renderGeoState(GEO_UF);
  } else {
    await renderGeoBrazil();
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
          `/shops/${SHOP_PATH_PLACEHOLDER}/orders/sync?rangeDays=180`
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
  initOrdersAlertsPopover();
  document
    .getElementById("btnDashReload")
    ?.addEventListener("click", loadDashboard);
  try {
    await loadMe();
    await startShopeeOauthFlowIfRequested();
    const dashPanel = document.getElementById("tab-dashboard");
    if (dashPanel && dashPanel.classList.contains("active")) {
      await loadDashboard();
    }
  } catch (e) {
    setText("auth-status", "Não autenticado. Recarregue a página.");
  }
}

boot();
