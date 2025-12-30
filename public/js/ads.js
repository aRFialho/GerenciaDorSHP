let chartCpcDaily = null;
let chartCpcCampaign = null;

let cachedCampaignSeries = {};
let cachedCampaignSettings = new Map();
let gmsPager = { offset: 0, limit: 50, hasNext: false, total: null };

function fmtMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR");
}

function fmtPctFromClicksImpr(clicks, impr) {
  const c = Number(clicks) || 0;
  const i = Number(impr) || 0;
  if (!i) return "—";
  return ((c / i) * 100).toFixed(2) + "%";
}

async function apiGet(url) {
  const r = await fetch(url, { credentials: "include" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
  return j;
}

async function apiPost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
  return j;
}

function ensureDefaultDates() {
  const fromEl = document.getElementById("adsDateFrom");
  const toEl = document.getElementById("adsDateTo");
  if (!fromEl.value || !toEl.value) {
    const now = new Date();
    const to = new Date(now);
    const from = new Date(now);
    from.setDate(from.getDate() - 14);
    toEl.value = to.toISOString().slice(0, 10);
    fromEl.value = from.toISOString().slice(0, 10);
  }
}

function getDates() {
  const dateFrom = document.getElementById("adsDateFrom").value;
  const dateTo = document.getElementById("adsDateTo").value;
  return { dateFrom, dateTo };
}

function safeDestroyChart(ch) {
  if (ch && typeof ch.destroy === "function") ch.destroy();
  return null;
}

function renderLineChart(canvasId, labels, datasets) {
  const ctx = document.getElementById(canvasId);
  return new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

document.addEventListener("DOMContentLoaded", () => {
  ensureDefaultDates();
  const btn = document.getElementById("btnAdsReload");
  if (btn) btn.addEventListener("click", () => loadAdsAll());
  const prev = document.getElementById("btnGmsPrev");
  const next = document.getElementById("btnGmsNext");
  if (prev) prev.addEventListener("click", () => gmsPagePrev());
  if (next) next.addEventListener("click", () => gmsPageNext());
});
async function loadAdsAll() {
  const { dateFrom, dateTo } = getDates();

  // CPC limita 1 mês; se passar, corta automaticamente para últimos 30 dias
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const diffDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
  let cpcDateFrom = dateFrom;
  let cpcDateTo = dateTo;

  if (Number.isFinite(diffDays) && diffDays > 31) {
    const cutTo = new Date(to);
    const cutFrom = new Date(to);
    cutFrom.setDate(cutFrom.getDate() - 30);
    cpcDateTo = cutTo.toISOString().slice(0, 10);
    cpcDateFrom = cutFrom.toISOString().slice(0, 10);
  }

  try {
    await Promise.all([
      loadCpcBalance(),
      loadCpcDaily(cpcDateFrom, cpcDateTo),
      loadCpcCampaigns(cpcDateFrom, cpcDateTo),
      loadGmsAll(dateFrom, dateTo),
    ]);
  } catch (e) {
    alert(e.message || String(e));
  }
}

async function loadCpcBalance() {
  const j = await apiGet("/shops/active/ads/balance");
  const bal = j?.response?.total_balance;
  setText("kpiAdsBalance", fmtMoney(bal));
}

async function loadCpcDaily(dateFrom, dateTo) {
  const j = await apiGet(
    `/shops/active/ads/performance/daily?dateFrom=${encodeURIComponent(
      dateFrom
    )}&dateTo=${encodeURIComponent(dateTo)}`
  );
  const series = j?.response?.series || [];
  const totals = j?.response?.totals || {};

  setText("kpiCpcExpense", fmtMoney(totals.expense));
  setText("kpiCpcImpressions", fmtInt(totals.impression));
  setText("kpiCpcClicks", fmtInt(totals.clicks));
  setText("kpiCpcCtr", fmtPctFromClicksImpr(totals.clicks, totals.impression));
  setText("kpiCpcDirectGmv", fmtMoney(totals.direct_gmv));

  const labels = series.map((x) => x.date);
  const ds = [
    {
      label: "Impressões",
      data: series.map((x) => x.impression),
      borderColor: "#2563eb",
      tension: 0.25,
    },
    {
      label: "Cliques",
      data: series.map((x) => x.clicks),
      borderColor: "#16a34a",
      tension: 0.25,
    },
    {
      label: "Gasto",
      data: series.map((x) => x.expense),
      borderColor: "#dc2626",
      tension: 0.25,
    },
    {
      label: "GMV Direto",
      data: series.map((x) => x.direct_gmv),
      borderColor: "#7c3aed",
      tension: 0.25,
    },
  ];

  chartCpcDaily = safeDestroyChart(chartCpcDaily);
  chartCpcDaily = renderLineChart("chartCpcDaily", labels, ds);
}

async function loadCpcCampaigns(dateFrom, dateTo) {
  const perf = await apiGet(
    `/shops/active/ads/campaigns/performance/daily?dateFrom=${encodeURIComponent(
      dateFrom
    )}&dateTo=${encodeURIComponent(dateTo)}&adType=all`
  );
  const campaigns = perf?.response?.campaigns || [];
  cachedCampaignSeries = perf?.response?.seriesByCampaignId || {};

  // Pega settings em lotes (100)
  const ids = campaigns.map((c) => c.campaign_id).filter(Boolean);
  cachedCampaignSettings = new Map();

  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const settings = await apiGet(
      `/shops/active/ads/campaigns/settings?campaignIds=${encodeURIComponent(
        batch.join(",")
      )}&infoTypes=1,2,3,4`
    );
    const list = settings?.response?.campaign_list || [];
    for (const c of list) cachedCampaignSettings.set(String(c.campaign_id), c);
  }

  // Render tabela
  const tbody = document.querySelector("#tblCpcCampaigns tbody");
  tbody.innerHTML = "";

  for (const row of campaigns) {
    const set = cachedCampaignSettings.get(String(row.campaign_id));
    const common = set?.common_info || {};
    const m = row.metrics || {};

    const directRoas =
      m.expense && m.direct_gmv ? m.direct_gmv / m.expense : null;
    const directAcos = m.direct_gmv ? (m.expense / m.direct_gmv) * 100 : null;

    const tr = document.createElement("tr");
    tr.dataset.campaignId = row.campaign_id;

    tr.innerHTML = `
      <td>${common.ad_name || row.ad_name || row.campaign_id}</td>
      <td>${common.ad_type || row.ad_type || "—"}</td>
      <td>${common.campaign_status || "—"}</td>
      <td>${common.campaign_placement || row.campaign_placement || "—"}</td>
      <td>${
        common.campaign_budget != null ? fmtMoney(common.campaign_budget) : "—"
      }</td>
      <td>${fmtInt(m.impression)}</td>
      <td>${fmtInt(m.clicks)}</td>
      <td>${fmtMoney(m.expense)}</td>
      <td>${fmtMoney(m.direct_gmv)}</td>
      <td>${directRoas != null ? directRoas.toFixed(2) : "—"}</td>
      <td>${directAcos != null ? directAcos.toFixed(2) + "%" : "—"}</td>
    `;

    tr.addEventListener("click", () => selectCampaign(row.campaign_id));
    tbody.appendChild(tr);
  }

  if (campaigns.length) selectCampaign(campaigns[0].campaign_id);
}

function selectCampaign(campaignId) {
  const id = String(campaignId);
  const set = cachedCampaignSettings.get(id);
  const common = set?.common_info || {};
  setText(
    "cpcCampaignSelected",
    common.ad_name ? `${common.ad_name} (#${id})` : `#${id}`
  );

  // KPIs simples (a partir da série)
  const series = cachedCampaignSeries[id] || [];
  const totals = series.reduce(
    (a, x) => {
      a.impression += x.impression || 0;
      a.clicks += x.clicks || 0;
      a.expense += x.expense || 0;
      a.direct_gmv += x.direct_gmv || 0;
      return a;
    },
    { impression: 0, clicks: 0, expense: 0, direct_gmv: 0 }
  );

  setText("cpcCampImp", fmtInt(totals.impression));
  setText("cpcCampClicks", fmtInt(totals.clicks));
  setText("cpcCampExpense", fmtMoney(totals.expense));
  setText("cpcCampDirectGmv", fmtMoney(totals.direct_gmv));

  // Chart campanha
  const labels = series.map((x) => x.date);
  const ds = [
    {
      label: "Impressões",
      data: series.map((x) => x.impression),
      borderColor: "#2563eb",
      tension: 0.25,
    },
    {
      label: "Cliques",
      data: series.map((x) => x.clicks),
      borderColor: "#16a34a",
      tension: 0.25,
    },
    {
      label: "Gasto",
      data: series.map((x) => x.expense),
      borderColor: "#dc2626",
      tension: 0.25,
    },
    {
      label: "GMV Direto",
      data: series.map((x) => x.direct_gmv),
      borderColor: "#7c3aed",
      tension: 0.25,
    },
  ];

  chartCpcCampaign = safeDestroyChart(chartCpcCampaign);
  chartCpcCampaign = renderLineChart("chartCpcCampaign", labels, ds);

  // Produtos vinculados (settings)
  const tbody = document.querySelector("#tblCpcCampaignItems tbody");
  tbody.innerHTML = "";

  const itemIds = common.item_id_list || [];
  const autoInfo = set?.auto_product_ads_info || [];
  const autoMap = new Map(
    autoInfo.filter((x) => x.item_id).map((x) => [String(x.item_id), x])
  );

  for (const itemId of itemIds) {
    const ai = autoMap.get(String(itemId));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${itemId}</td>
      <td>${ai?.product_name || "—"}</td>
      <td>${ai?.status || "—"}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!itemIds.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" class="muted">Nenhum item vinculado (ou campanha usa seleção automática sem itens retornados).</td>`;
    tbody.appendChild(tr);
  }
}

async function loadGmsAll(dateFrom, dateTo) {
  await loadGmsEligibility();
  await loadGmsCampaignTotals(dateFrom, dateTo);
  gmsPager.offset = 0;
  await loadGmsItems(dateFrom, dateTo, gmsPager.offset, gmsPager.limit);
  await loadGmsDeleted();
}

async function loadGmsEligibility() {
  const j = await apiGet("/shops/active/ads/gms/eligibility");
  const eligible = j?.response?.is_eligible;
  const reason = j?.response?.reason;
  setText(
    "kpiGmsEligible",
    eligible === true ? "Sim" : eligible === false ? "Não" : "—"
  );
  setText("kpiGmsReason", reason || "—");
}

async function loadGmsCampaignTotals(dateFrom, dateTo) {
  const j = await apiPost("/shops/active/ads/gms/campaign/performance", {
    dateFrom,
    dateTo,
  });
  const r = j?.response?.report || {};
  setText("kpiGmsExpense", fmtMoney(r.expense));
  setText("kpiGmsGmv", fmtMoney(r.broad_gmv));
  setText(
    "kpiGmsRoas",
    r.broad_roi != null ? Number(r.broad_roi).toFixed(2) : "—"
  );
  setText(
    "kpiGmsAcos",
    r.broad_cir != null ? Number(r.broad_cir).toFixed(2) + "%" : "—"
  );
}

async function loadGmsItems(dateFrom, dateTo, offset, limit) {
  const j = await apiPost("/shops/active/ads/gms/items/performance", {
    dateFrom,
    dateTo,
    offset,
    limit,
  });
  const items = j?.response?.items || [];
  gmsPager.hasNext = Boolean(j?.response?.has_next_page);
  gmsPager.total = j?.response?.total ?? null;

  const tbody = document.querySelector("#tblGmsItems tbody");
  tbody.innerHTML = "";

  for (const it of items) {
    const r = it.report || {};
    const tr = document.createElement("tr");

    const productHtml = `
      <div class="product-cell">
        <img class="product-thumb" src="${
          it.image_url || ""
        }" onerror="this.style.display='none'">
        <div>
          <div style="font-weight:700">${it.title || "Item " + it.item_id}</div>
          <div class="muted">${it.item_id}</div>
        </div>
      </div>
    `;

    tr.innerHTML = `
      <td>${productHtml}</td>
      <td>${fmtInt(r.impression)}</td>
      <td>${fmtInt(r.clicks)}</td>
      <td>${fmtMoney(r.expense)}</td>
      <td>${fmtMoney(r.broad_gmv)}</td>
      <td>${r.broad_roi != null ? Number(r.broad_roi).toFixed(2) : "—"}</td>
      <td>${
        r.broad_cir != null ? Number(r.broad_cir).toFixed(2) + "%" : "—"
      }</td>
      <td>${fmtInt(r.broad_order)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!items.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="8" class="muted">Nenhum item com performance neste período.</td>`;
    tbody.appendChild(tr);
  }

  setText(
    "gmsPagerInfo",
    `Offset ${offset} • Limit ${limit}${
      gmsPager.total != null ? " • Total " + gmsPager.total : ""
    }`
  );
}

async function loadGmsDeleted() {
  const j = await apiPost("/shops/active/ads/gms/items/deleted", {
    offset: 0,
    limit: 50,
  });
  const itemIds = j?.response?.item_id_list || [];
  const tbody = document.querySelector("#tblGmsDeleted tbody");
  tbody.innerHTML = "";

  for (const id of itemIds) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${id}</td>`;
    tbody.appendChild(tr);
  }

  if (!itemIds.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="muted">Nenhum item removido retornado.</td>`;
    tbody.appendChild(tr);
  }
}

async function gmsPageNext() {
  const { dateFrom, dateTo } = getDates();
  if (!gmsPager.hasNext) return;
  gmsPager.offset += gmsPager.limit;
  await loadGmsItems(dateFrom, dateTo, gmsPager.offset, gmsPager.limit);
}

async function gmsPagePrev() {
  const { dateFrom, dateTo } = getDates();
  gmsPager.offset = Math.max(0, gmsPager.offset - gmsPager.limit);
  await loadGmsItems(dateFrom, dateTo, gmsPager.offset, gmsPager.limit);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest?.(".tab[data-tab='ads']");
  if (!btn) return;
  setTimeout(() => loadAdsAll(), 0);
});
