let chartCpcDaily = null;
let chartCpcCampaign = null;

let selectedCpcCampaignId = null;

let cachedCampaignSeries = {};
let cachedCampaignSettings = new Map();
let cachedSettingsKey = null;
let cachedCampaignGroups = [];
let selectedCampaignGroupId = null;
let lastCpcRange = { dateFrom: null, dateTo: null };

let gmsPager = { offset: 0, limit: 50, hasNext: false, total: null };

let lastCpcCampaignRows = [];
let lastGmsItemRows = [];
let lastGmsDeletedItemIds = [];

let cpcCampaignsMaster = [];
let cpcCampaignsView = [];

let cpcFilterTimer = null;

let lastCpcProductPerfRows = [];

/* ===========================
   Helpers
=========================== */

function getCpcCampaignStatusFilter() {
  const el = document.getElementById("cpcCampaignStatusFilter");
  return String(el?.value || "all");
}

function normStatus(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function isCampaignActiveStatus(status) {
  const s = normStatus(status);
  if (!s) return false;

  if (
    s.includes("ongoing") ||
    s.includes("running") ||
    s.includes("active") ||
    s.includes("enabled")
  )
    return true;

  if (
    s.includes("paused") ||
    s.includes("ended") ||
    s.includes("stopped") ||
    s.includes("disabled") ||
    s.includes("deleted")
  )
    return false;

  return false;
}

function badgeHtml(text, tone) {
  const t = escHtml(text || "—");
  const cls =
    tone === "green"
      ? "badge badge--green"
      : tone === "yellow"
      ? "badge badge--yellow"
      : tone === "red"
      ? "badge badge--red"
      : "badge badge--gray";

  return `<span class="${cls}"><span class="badge-dot"></span>${t}</span>`;
}

function statusTone(status) {
  const s = normStatus(status);
  if (!s) return "gray";

  if (
    s.includes("ongoing") ||
    s.includes("running") ||
    s.includes("active") ||
    s.includes("enabled")
  )
    return "green";

  if (s.includes("paused")) return "yellow";

  if (
    s.includes("ended") ||
    s.includes("stopped") ||
    s.includes("disabled") ||
    s.includes("deleted")
  )
    return "gray";

  return "gray";
}

function adTypeTone(adType) {
  const s = String(adType || "").toLowerCase();
  if (s.includes("manual")) return "gray";
  if (s.includes("auto")) return "gray";
  return "gray";
}

function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function markSelectedCampaignRow(campaignId) {
  const tbody = document.querySelector("#tblCpcCampaigns tbody");
  if (!tbody) return;

  const id = String(campaignId || "");
  const rows = tbody.querySelectorAll("tr[data-campaign-id]");
  rows.forEach((r) =>
    r.classList.toggle("is-selected", r.dataset.campaignId === id)
  );
}

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

async function apiPut(url, body) {
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
  return j;
}

async function apiDelete(url) {
  const r = await fetch(url, {
    method: "DELETE",
    credentials: "include",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
  return j;
}

function ensureDefaultDates() {
  const fromEl = document.getElementById("adsDateFrom");
  const toEl = document.getElementById("adsDateTo");
  if (!fromEl || !toEl) return;

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
  const fromEl = document.getElementById("adsDateFrom");
  const toEl = document.getElementById("adsDateTo");
  return {
    dateFrom: fromEl ? fromEl.value : "",
    dateTo: toEl ? toEl.value : "",
  };
}

function safeDestroyChart(ch) {
  if (ch && typeof ch.destroy === "function") ch.destroy();
  return null;
}

function renderLineChart(canvasId, labels, datasets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  return new Chart(canvas, {
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

function setDisabled(id, disabled) {
  const el = document.getElementById(id);
  if (el) el.disabled = Boolean(disabled);
}

function setMsg(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || "";
}

function setLoading(id, text) {
  setMsg(id, text || "");
}

/* ===========================
   CSV
=========================== */

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename, headers, rows) {
  const lines = [];
  lines.push(headers.map(csvEscape).join(","));
  for (const row of rows) lines.push(row.map(csvEscape).join(","));

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/* ===========================
   Export CSV Actions
=========================== */

function exportCpcCampaignsCsv() {
  if (!cpcCampaignsView.length) {
    return setMsg(
      "cpcCampaignMsg",
      "Nada para exportar. Ajuste o filtro/ordem ou clique em Atualizar."
    );
  }

  const { dateFrom, dateTo } = getDates();
  const filename = `cpc-campaigns-view-${dateFrom}-to-${dateTo}.csv`;

  const headers = [
    "campaign_id",
    "ad_name",
    "ad_type",
    "campaign_status",
    "placement",
    "budget",
    "impression",
    "clicks",
    "expense",
    "direct_gmv",
    "direct_roas",
    "direct_acos_pct",
    "credit_estimated",
  ];

  const rows = cpcCampaignsView.map((x) => [
    x.campaign_id,
    x.ad_name,
    x.ad_type,
    x.campaign_status,
    x.placement,
    x.budget,
    x.impression,
    x.clicks,
    x.expense,
    x.direct_gmv,
    x.direct_roas != null ? Number(x.direct_roas).toFixed(4) : "",
    x.direct_acos_pct != null ? Number(x.direct_acos_pct).toFixed(4) : "",
    x.credit_estimated,
  ]);

  downloadCsv(filename, headers, rows);
}

function exportGmsItemsCsv() {
  if (!lastGmsItemRows.length)
    return setMsg(
      "gmsMsg",
      "Nada para exportar. Clique em Atualizar primeiro."
    );

  const { dateFrom, dateTo } = getDates();
  const filename = `gms-items-${dateFrom}-to-${dateTo}.csv`;

  const headers = [
    "item_id",
    "title",
    "impression",
    "clicks",
    "expense",
    "broad_gmv",
    "broad_roi",
    "broad_cir",
    "broad_order",
  ];

  const rows = lastGmsItemRows.map((x) => [
    x.item_id,
    x.title,
    x.impression,
    x.clicks,
    x.expense,
    x.broad_gmv,
    x.broad_roi != null ? Number(x.broad_roi).toFixed(4) : "",
    x.broad_cir != null ? Number(x.broad_cir).toFixed(4) : "",
    x.broad_order,
  ]);

  downloadCsv(filename, headers, rows);
}

function exportGmsDeletedCsv() {
  if (!lastGmsDeletedItemIds.length)
    return setMsg(
      "gmsMsg",
      "Nada para exportar. Clique em Atualizar primeiro."
    );

  const { dateFrom, dateTo } = getDates();
  const filename = `gms-deleted-items-first-50-${dateFrom}-to-${dateTo}.csv`;

  const headers = ["item_id"];
  const rows = lastGmsDeletedItemIds.map((id) => [id]);

  downloadCsv(filename, headers, rows);
}

function exportCpcLinkedItemsCsv() {
  if (!selectedCpcCampaignId)
    return setMsg("cpcCampaignMsg", "Selecione uma campanha primeiro.");

  const set = cachedCampaignSettings.get(String(selectedCpcCampaignId));
  if (!set)
    return setMsg(
      "cpcCampaignMsg",
      "Sem dados de settings para a campanha selecionada. Clique em Atualizar."
    );

  const common = set.common_info || {};
  const itemIds = Array.isArray(common.item_id_list) ? common.item_id_list : [];

  const autoInfo = Array.isArray(set.auto_product_ads_info)
    ? set.auto_product_ads_info
    : [];
  const autoMap = new Map(
    autoInfo.filter((x) => x.item_id).map((x) => [String(x.item_id), x])
  );

  const { dateFrom, dateTo } = getDates();
  const filename = `cpc-linked-items-campaign-${selectedCpcCampaignId}-${dateFrom}-to-${dateTo}.csv`;

  const headers = ["campaign_id", "item_id", "product_name", "status"];
  const rows = itemIds.map((itemId) => {
    const ai = autoMap.get(String(itemId));
    return [
      selectedCpcCampaignId,
      String(itemId),
      ai?.product_name || "",
      ai?.status || "",
    ];
  });

  downloadCsv(filename, headers, rows);
}

function exportCpcProductPerfCsv() {
  if (!selectedCpcCampaignId) {
    return setMsg("cpcItemsMsg", "Selecione uma campanha primeiro.");
  }

  if (!lastCpcProductPerfRows.length) {
    return setMsg(
      "cpcItemsMsg",
      "Nada para exportar. Selecione uma campanha e aguarde carregar o desempenho."
    );
  }

  const { dateFrom, dateTo } = getDates();
  const filename = `cpc-product-performance-campaign-${selectedCpcCampaignId}-${dateFrom}-to-${dateTo}.csv`;

  const headers = [
    "campaign_id",
    "item_id",
    "title",
    "impression",
    "clicks",
    "expense",
    "gmv",
    "conversions",
    "items",
    "product_name",
    "status",
  ];

  const rows = lastCpcProductPerfRows.map((x) => [
    selectedCpcCampaignId,
    x.item_id,
    x.title || "",
    x.impression ?? "",
    x.clicks ?? "",
    x.expense ?? "",
    x.gmv ?? "",
    x.conversions ?? "",
    x.items ?? "",
    x.product_name || "",
    x.status || "",
  ]);

  downloadCsv(filename, headers, rows);
}

/* ===========================
   Modal
=========================== */

function openModal(title, html) {
  const overlay = document.getElementById("modal-overlay");
  const t = document.getElementById("modal-title");
  const b = document.getElementById("modal-body");
  const close = document.getElementById("modal-close");

  if (!overlay || !t || !b || !close) return;

  t.textContent = title;
  b.innerHTML = html;
  overlay.style.display = "flex";

  const onClose = () => {
    overlay.style.display = "none";
    close.removeEventListener("click", onClose);
    overlay.removeEventListener("click", onOverlay);
  };

  const onOverlay = (e) => {
    if (e.target === overlay) onClose();
  };

  close.addEventListener("click", onClose);
  overlay.addEventListener("click", onOverlay);
}

function val(id) {
  return document.getElementById(id)?.value;
}

function openGmsCreateModal() {
  openModal(
    "Criar campanha GMS",
    `
      <div class="field">
        <label class="muted">Data início (obrigatório)</label>
        <input id="gmsCreateDateFrom" class="input" type="date">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Data fim (opcional)</label>
        <input id="gmsCreateDateTo" class="input" type="date">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Orçamento diário (obrigatório)</label>
        <input id="gmsCreateDailyBudget" class="input" type="number" step="0.01" placeholder="Ex: 50.00">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">ROAS target (opcional)</label>
        <input id="gmsCreateRoasTarget" class="input" type="number" step="0.1" placeholder="Ex: 6.5">
        <div class="muted" style="margin-top:6px;">Dica: vazio = GMV Max Auto Bidding (Shop). <b>0</b> também ativa o modo auto.</div>
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Reference ID (opcional)</label>
        <input id="gmsCreateReferenceId" class="input" type="text" placeholder="UUID (opcional)">
      </div>
      <div class="actions" style="margin-top:14px;">
        <button id="btnGmsCreateSubmit" class="btn btn-primary">Criar</button>
      </div>
    `
  );

  const { dateFrom, dateTo } = getDates();
  const d1 = document.getElementById("gmsCreateDateFrom");
  const d2 = document.getElementById("gmsCreateDateTo");
  if (d1) d1.value = dateFrom || "";
  if (d2) d2.value = dateTo || "";

  const submit = document.getElementById("btnGmsCreateSubmit");
  if (!submit) return;

  submit.addEventListener("click", async () => {
    setMsg("gmsMsg", "");
    setLoading("gmsLoading", "Criando campanha...");

    const body = {
      dateFrom: val("gmsCreateDateFrom"),
      dateTo: val("gmsCreateDateTo") || null,
      dailyBudget: val("gmsCreateDailyBudget"),
      roasTarget: val("gmsCreateRoasTarget") || null,
      referenceId: val("gmsCreateReferenceId") || null,
    };

    try {
      await apiPost("/shops/active/ads/gms/campaign/create", body);
      setMsg("gmsMsg", "Campanha GMS criada.");
      await loadAdsAll();
      const overlay = document.getElementById("modal-overlay");
      if (overlay) overlay.style.display = "none";
    } catch (e) {
      setMsg("gmsMsg", e.message || "Falha ao criar campanha GMS.");
    } finally {
      setLoading("gmsLoading", "");
    }
  });
}

function openGmsEditModal() {
  openModal(
    "Editar campanha GMS",
    `
      <div class="field">
        <label class="muted">Campaign ID (obrigatório)</label>
        <input id="gmsEditCampaignId" class="input" type="number" placeholder="Ex: 12412421">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Ação (edit_action)</label>
        <select id="gmsEditAction" class="select">
          <option value="change_budget">change_budget</option>
          <option value="change_duration">change_duration</option>
          <option value="change_roas_target">change_roas_target</option>
          <option value="pause">pause</option>
          <option value="resume">resume</option>
          <option value="start">start</option>
        </select>
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Orçamento diário (para change_budget)</label>
        <input id="gmsEditDailyBudget" class="input" type="number" step="0.01" placeholder="Ex: 80.00">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Data início (para change_duration)</label>
        <input id="gmsEditDateFrom" class="input" type="date">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Data fim (para change_duration)</label>
        <input id="gmsEditDateTo" class="input" type="date">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">ROAS target (para change_roas_target)</label>
        <input id="gmsEditRoasTarget" class="input" type="number" step="0.1">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Reference ID (recomendado)</label>
        <input id="gmsEditReferenceId" class="input" type="text" placeholder="UUID para evitar duplicidade">
      </div>
      <div class="actions" style="margin-top:14px;">
        <button id="btnGmsEditSubmit" class="btn btn-primary">Aplicar</button>
      </div>
    `
  );

  const { dateFrom, dateTo } = getDates();
  const d1 = document.getElementById("gmsEditDateFrom");
  const d2 = document.getElementById("gmsEditDateTo");
  if (d1) d1.value = dateFrom || "";
  if (d2) d2.value = dateTo || "";

  const submit = document.getElementById("btnGmsEditSubmit");
  if (!submit) return;

  submit.addEventListener("click", async () => {
    setMsg("gmsMsg", "");
    setLoading("gmsLoading", "Aplicando alteração...");

    const body = {
      campaignId: val("gmsEditCampaignId"),
      editAction: val("gmsEditAction"),
      dailyBudget: val("gmsEditDailyBudget") || null,
      dateFrom: val("gmsEditDateFrom") || null,
      dateTo: val("gmsEditDateTo") || null,
      roasTarget: val("gmsEditRoasTarget") || null,
      referenceId: val("gmsEditReferenceId") || null,
    };

    try {
      await apiPost("/shops/active/ads/gms/campaign/edit", body);
      setMsg("gmsMsg", "Alteração aplicada.");
      await loadAdsAll();
      const overlay = document.getElementById("modal-overlay");
      if (overlay) overlay.style.display = "none";
    } catch (e) {
      setMsg("gmsMsg", e.message || "Falha ao editar campanha GMS.");
    } finally {
      setLoading("gmsLoading", "");
    }
  });
}

/* ===========================
   CPC Campaign View (debounce + persist)
=========================== */

function debounceApplyCpcCampaignView() {
  // Se veio campanha do backend, mas o filtro salvou “escondeu tudo”, limpa automaticamente
  if (cpcFilterTimer) clearTimeout(cpcFilterTimer);
  cpcFilterTimer = setTimeout(() => applyCpcCampaignView(), 120);
}

function getCpcCampaignFilter() {
  const el = document.getElementById("cpcCampaignFilter");
  return String(el?.value || "")
    .trim()
    .toLowerCase();
}

function getCpcCampaignSort() {
  const el = document.getElementById("cpcCampaignSortBy");
  return String(el?.value || "expense_desc");
}

function applyCpcCampaignView() {
  const filter = getCpcCampaignFilter();
  const sort = getCpcCampaignSort();

  let rows = [...cpcCampaignsMaster];

  if (filter) {
    rows = rows.filter((x) => {
      const name = String(x.ad_name || "").toLowerCase();
      const id = String(x.campaign_id || "").toLowerCase();
      return name.includes(filter) || id.includes(filter);
    });
  }
  const statusFilter = getCpcCampaignStatusFilter();
  if (statusFilter !== "all") {
    rows = rows.filter((x) => {
      const active = isCampaignActiveStatus(x.campaign_status);
      return statusFilter === "active" ? active : !active;
    });
  }
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : -Infinity);

  rows.sort((a, b) => {
    switch (sort) {
      case "expense_asc":
        return num(a.expense) - num(b.expense);
      case "expense_desc":
        return num(b.expense) - num(a.expense);

      case "direct_gmv_asc":
        return num(a.direct_gmv) - num(b.direct_gmv);
      case "direct_gmv_desc":
        return num(b.direct_gmv) - num(a.direct_gmv);

      case "direct_roas_asc":
        return num(a.direct_roas) - num(b.direct_roas);
      case "direct_roas_desc":
        return num(b.direct_roas) - num(a.direct_roas);

      case "clicks_asc":
        return num(a.clicks) - num(b.clicks);
      case "clicks_desc":
        return num(b.clicks) - num(a.clicks);

      case "impression_asc":
        return num(a.impression) - num(b.impression);
      case "impression_desc":
        return num(b.impression) - num(a.impression);

      default:
        return num(b.expense) - num(a.expense);
    }
  });

  cpcCampaignsView = rows;

  const countEl = document.getElementById("cpcCampaignCount");
  if (countEl) countEl.textContent = `${rows.length} campanhas`;

  renderCpcCampaignTable(rows);
}

function renderCpcCampaignTable(rows) {
  const tbody = document.querySelector("#tblCpcCampaigns tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  for (const x of rows) {
    const tr = document.createElement("tr");
    tr.dataset.campaignId = x.campaign_id;

    const name = escHtml(x.ad_name || String(x.campaign_id));
    const type = badgeHtml(x.ad_type || "—", adTypeTone(x.ad_type));
    const status = badgeHtml(
      x.campaign_status || "—",
      statusTone(x.campaign_status)
    );
    const placement = badgeHtml(x.placement || "—", "gray");

    tr.innerHTML = `
      <td>${name}</td>
      <td>${type}</td>
      <td>${status}</td>
      <td>${placement}</td>
      <td>${x.budget != null ? fmtMoney(x.budget) : "—"}</td>
      <td>${
        x.credit_estimated != null ? fmtMoney(x.credit_estimated) : "—"
      }</td>
      <td>${fmtInt(x.impression)}</td>
      <td>${fmtInt(x.clicks)}</td>
      <td>${fmtMoney(x.expense)}</td>
      <td>${fmtMoney(x.direct_gmv)}</td>
      <td>${x.direct_roas != null ? Number(x.direct_roas).toFixed(2) : "—"}</td>
      <td>${
        x.direct_acos_pct != null
          ? Number(x.direct_acos_pct).toFixed(2) + "%"
          : "—"
      }</td>
    `;

    tr.addEventListener("click", () => selectCampaign(x.campaign_id));

    if (String(x.campaign_id) === String(selectedCpcCampaignId)) {
      tr.classList.add("is-selected");
    }

    tbody.appendChild(tr);
  }

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="12" class="muted">Nenhuma campanha encontrada para o filtro/ordem atual.</td>`;
    tbody.appendChild(tr);
  }
}

/* ===========================
   DOM Events
=========================== */

document.addEventListener("DOMContentLoaded", () => {
  ensureDefaultDates();

  // restore filter/sort
  const filterEl = document.getElementById("cpcCampaignFilter");
  const sortEl = document.getElementById("cpcCampaignSortBy");
  const statusEl = document.getElementById("cpcCampaignStatusFilter");
  const btnExportCpcPerf = document.getElementById(
    "btnExportCpcProductPerfCsv"
  );
  if (btnExportCpcPerf) {
    btnExportCpcPerf.addEventListener("click", () => exportCpcProductPerfCsv());
  }
  if (statusEl)
    statusEl.value = localStorage.getItem("ads_cpc_status") || "all";
  if (filterEl) filterEl.value = localStorage.getItem("ads_cpc_filter") || "";
  if (sortEl)
    sortEl.value = localStorage.getItem("ads_cpc_sort") || "expense_desc";

  // CPC filter/sort listeners (persist + debounce)
  if (filterEl) {
    filterEl.addEventListener("input", () => {
      localStorage.setItem("ads_cpc_filter", filterEl.value || "");
      debounceApplyCpcCampaignView();
    });
  }

  if (statusEl) {
    statusEl.addEventListener("change", () => {
      localStorage.setItem("ads_cpc_status", statusEl.value || "all");
      applyCpcCampaignView();
    });
  }

  if (sortEl) {
    sortEl.addEventListener("change", () => {
      localStorage.setItem("ads_cpc_sort", sortEl.value || "expense_desc");
      applyCpcCampaignView();
    });
  }

  const clearBtn = document.getElementById("btnCpcCampaignClearFilter");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (filterEl) {
        filterEl.value = "";
        localStorage.setItem("ads_cpc_filter", "");
      }
      if (sortEl) {
        sortEl.value = "expense_desc";
        localStorage.setItem("ads_cpc_sort", "expense_desc");
      }
      if (statusEl) {
        statusEl.value = "all";
        localStorage.setItem("ads_cpc_status", "all");
      }
      applyCpcCampaignView();
    });
  }

  // Exports
  const btnExportCpc = document.getElementById("btnExportCpcCampaignsCsv");
  if (btnExportCpc)
    btnExportCpc.addEventListener("click", () => exportCpcCampaignsCsv());

  const btnExportGms = document.getElementById("btnExportGmsItemsCsv");
  if (btnExportGms)
    btnExportGms.addEventListener("click", () => exportGmsItemsCsv());

  const btnExportGmsDeleted = document.getElementById("btnExportGmsDeletedCsv");
  if (btnExportGmsDeleted)
    btnExportGmsDeleted.addEventListener("click", () => exportGmsDeletedCsv());

  const btnExportCpcLinked = document.getElementById(
    "btnExportCpcLinkedItemsCsv"
  );
  if (btnExportCpcLinked)
    btnExportCpcLinked.addEventListener("click", () =>
      exportCpcLinkedItemsCsv()
    );

  // Reload + pager
  const btnReload = document.getElementById("btnAdsReload");
  if (btnReload) btnReload.addEventListener("click", () => loadAdsAll());

  const prev = document.getElementById("btnGmsPrev");
  const next = document.getElementById("btnGmsNext");
  if (prev) prev.addEventListener("click", () => gmsPagePrev());
  if (next) next.addEventListener("click", () => gmsPageNext());

  // Modals
  const btnCreate = document.getElementById("btnGmsCreate");
  const btnEdit = document.getElementById("btnGmsEdit");
  if (btnCreate)
    btnCreate.addEventListener("click", () => openGmsCreateModal());
  if (btnEdit) btnEdit.addEventListener("click", () => openGmsEditModal());

  const selGroup = document.getElementById("adsGroupSelect");
  if (selGroup) {
    selGroup.addEventListener("change", () => {
      selectedCampaignGroupId = selGroup.value || null;
      const g = getGroupById(selectedCampaignGroupId);
      renderGroupSummary(g);
      renderGroupItemsInline(g);
    });
  }

  const btnGR = document.getElementById("btnAdsGroupReload");
  if (btnGR) btnGR.addEventListener("click", () => loadCampaignGroups());

  const btnGC = document.getElementById("btnAdsGroupCreate");
  if (btnGC) btnGC.addEventListener("click", () => openAdsGroupCreateModal());

  const btnGE = document.getElementById("btnAdsGroupEdit");
  if (btnGE) btnGE.addEventListener("click", () => openAdsGroupEditModal());

  const btnGD = document.getElementById("btnAdsGroupDelete");
  if (btnGD) btnGD.addEventListener("click", () => deleteAdsGroupSelected());

  const btnGV = document.getElementById("btnAdsGroupViewItems");
  if (btnGV)
    btnGV.addEventListener("click", () => {
      const g = getGroupById(selectedCampaignGroupId);
      if (!g) return setMsg("adsGroupMsg", "Selecione um grupo primeiro.");
      openGroupItemsModal(g);
    });
});

// Auto-load ao abrir a aba Ads
document.addEventListener("click", (e) => {
  const btn = e.target.closest?.(".tab[data-tab='ads']");
  if (!btn) return;
  setTimeout(() => loadAdsAll(), 0);
});

/* ===========================
   Load All (CPC e GMS independentes, sem alert)
=========================== */

async function loadAdsAll() {
  setMsg("cpcCampaignMsg", "");
  setMsg("gmsMsg", "");
  setLoading("cpcLoading", "Carregando CPC...");
  setLoading("gmsLoading", "Carregando GMS...");

  const btn = document.getElementById("btnAdsReload");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Carregando...";
  }

  try {
    let { dateFrom, dateTo } = getDates();
    if (!dateFrom || !dateTo) {
      ensureDefaultDates();
      ({ dateFrom, dateTo } = getDates());
      if (!dateFrom || !dateTo) throw new Error("Datas inválidas.");
    }

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

    await Promise.all([
      (async () => {
        try {
          await loadCpcBalance();
          await loadCpcDaily(cpcDateFrom, cpcDateTo);
          await loadCpcCampaigns(cpcDateFrom, cpcDateTo);
        } catch (e) {
          setMsg("cpcCampaignMsg", e.message || "Falha ao carregar CPC.");
        } finally {
          setLoading("cpcLoading", "");
        }
      })(),
      (async () => {
        try {
          await loadGmsAll(dateFrom, dateTo);
        } catch (e) {
          setMsg("gmsMsg", e.message || "Falha ao carregar GMS.");
        } finally {
          setLoading("gmsLoading", "");
        }
      })(),
    ]);
  } catch (e) {
    setMsg("cpcCampaignMsg", e.message || "Falha ao carregar Ads.");
    setMsg("gmsMsg", e.message || "Falha ao carregar Ads.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Atualizar";
    }
    setLoading("cpcLoading", "");
    setLoading("gmsLoading", "");
  }
}

/* ===========================
   CPC
=========================== */

function parseCampaignIdsCsv(s) {
  const seen = new Set();
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}

function getGroupById(id) {
  const gid = String(id || "");
  return cachedCampaignGroups.find((g) => String(g.id) === gid) || null;
}

function computeGroupAgg(group) {
  const ids = Array.isArray(group?.campaign_ids) ? group.campaign_ids : [];

  const byCampaign = new Map(
    cpcCampaignsMaster.map((x) => [String(x.campaign_id), x])
  );

  let totals = {
    campaigns: 0,
    impression: 0,
    clicks: 0,
    expense: 0,
    direct_gmv: 0,
    budget: 0,
    credit_estimated: 0, // budget - expense do período
  };

  // União de itens vinculados (sem duplicar por item_id)
  const itemMap = new Map(); // item_id -> {item_id,title,image_url,product_name,status}

  for (const cid of ids) {
    const row = byCampaign.get(String(cid));
    if (row) {
      totals.campaigns += 1;
      totals.impression += Number(row.impression || 0);
      totals.clicks += Number(row.clicks || 0);
      totals.expense += Number(row.expense || 0);
      totals.direct_gmv += Number(row.direct_gmv || 0);

      // budget e crédito estimado já calculado no row
      if (row.budget != null) totals.budget += Number(row.budget || 0);
      if (row.credit_estimated != null)
        totals.credit_estimated += Number(row.credit_estimated || 0);
    } else {
      // campanha do grupo não apareceu no período -> conta como “fora do período”
      totals.campaigns += 1;
    }

    const set = cachedCampaignSettings.get(String(cid));
    const linked = Array.isArray(set?.linked_items) ? set.linked_items : [];
    for (const it of linked) {
      const key = String(it.item_id || "");
      if (!key) continue;

      const prev = itemMap.get(key) || {};
      itemMap.set(key, {
        item_id: key,
        title: it.title || prev.title || null,
        image_url: it.image_url || prev.image_url || null,
        product_name: it.product_name || prev.product_name || null,
        status: it.status || prev.status || null,
      });
    }
  }

  return { totals, linkedItems: Array.from(itemMap.values()) };
}

function renderGroupSummary(group) {
  const box = document.getElementById("adsGroupSummary");
  if (!box) return;

  if (!group) {
    box.innerHTML = "";
    return;
  }

  const { totals, linkedItems } = computeGroupAgg(group);

  box.innerHTML = `
    <div class="kpi-grid kpi-grid-sm">
      <div class="kpi"><div class="kpi-label">Campanhas</div><div class="kpi-value">${fmtInt(
        totals.campaigns
      )}</div></div>
      <div class="kpi"><div class="kpi-label">Gasto</div><div class="kpi-value">${fmtMoney(
        totals.expense
      )}</div></div>
      <div class="kpi"><div class="kpi-label">GMV Dir.</div><div class="kpi-value">${fmtMoney(
        totals.direct_gmv
      )}</div></div>
      <div class="kpi"><div class="kpi-label">Budget (soma)</div><div class="kpi-value">${fmtMoney(
        totals.budget
      )}</div></div>
      <div class="kpi"><div class="kpi-label">Crédito (est.)</div><div class="kpi-value">${fmtMoney(
        totals.credit_estimated
      )}</div></div>
      <div class="kpi"><div class="kpi-label">Itens (união)</div><div class="kpi-value">${fmtInt(
        linkedItems.length
      )}</div></div>
    </div>
    <div class="muted" style="margin-top:8px;">
      Crédito (est.) = soma de (budget − gasto) das campanhas no período ${
        lastCpcRange.dateFrom || "—"
      } → ${lastCpcRange.dateTo || "—"}.
    </div>
  `;
}

function openGroupItemsModal(group) {
  const { linkedItems } = computeGroupAgg(group);

  const rows = linkedItems
    .map((it) => {
      const productHtml = `
        <div class="product-cell">
          <img class="product-thumb" src="${
            it.image_url || ""
          }" onerror="this.style.display='none'">
          <div>
            <div style="font-weight:700">${
              it.title || "Item " + it.item_id
            }</div>
            <div class="muted">${it.item_id}</div>
          </div>
        </div>
      `;
      return `
        <tr>
          <td>${productHtml}</td>
          <td>${it.product_name || "—"}</td>
          <td>${it.status || "—"}</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <div class="muted" style="margin-bottom:10px;">
      Itens agregados (união) do grupo <b>${escHtml(group.name)}</b>.
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Nome no Ads</th>
            <th>Status no Ads</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows ||
            `<tr><td colspan="3" class="muted">Nenhum item encontrado.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  openModal(`Itens do grupo`, html);
}

function renderGroupItemsInline(group) {
  const box = document.getElementById("adsGroupItems");
  if (!box) return;

  if (!group) {
    box.innerHTML = "";
    return;
  }

  const { linkedItems } = computeGroupAgg(group);

  const rows = linkedItems
    .map((it) => {
      const productHtml = `
      <div class="product-cell">
        <img class="product-thumb" src="${
          it.image_url || ""
        }" onerror="this.style.display='none'">
        <div>
          <div style="font-weight:700">${escHtml(
            it.title || "Item " + it.item_id
          )}</div>
          <div class="muted">ID: ${escHtml(it.item_id)}</div>
        </div>
      </div>
    `;

      return `<tr><td>${productHtml}</td><td>${escHtml(
        it.product_name || "—"
      )}</td><td>${escHtml(it.status || "—")}</td></tr>`;
    })
    .join("");

  box.innerHTML = `
    <div class="muted" style="margin:8px 0;">Itens dentro do grupo</div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Produto</th><th>Nome no Ads</th><th>Status no Ads</th></tr></thead>
        <tbody>${
          rows ||
          `<tr><td colspan="3" class="muted">Nenhum item encontrado no grupo.</td></tr>`
        }</tbody>
      </table>
    </div>
  `;
}

async function loadCampaignGroups() {
  setMsg("adsGroupMsg", "");
  setLoading("adsGroupLoading", "Carregando grupos...");

  try {
    const j = await apiGet("/shops/active/ads/campaign-groups");
    const groups = j?.response?.groups || [];
    cachedCampaignGroups = groups;

    const sel = document.getElementById("adsGroupSelect");
    if (sel) {
      sel.innerHTML = `<option value="">Selecione um grupo…</option>`;
      for (const g of groups) {
        const opt = document.createElement("option");
        opt.value = String(g.id);
        opt.textContent = g.name;
        sel.appendChild(opt);
      }
      // tenta manter seleção
      if (selectedCampaignGroupId) sel.value = String(selectedCampaignGroupId);
    }

    renderGroupSummary(getGroupById(selectedCampaignGroupId));
    renderGroupItemsInline(getGroupById(selectedCampaignGroupId));
  } catch (e) {
    setMsg("adsGroupMsg", e.message || "Falha ao carregar grupos.");
  } finally {
    setLoading("adsGroupLoading", "");
  }
}

function openAdsGroupCreateModal() {
  openModal(
    "Criar grupo de campanhas",
    `
      <div class="field">
        <label class="muted">Nome (obrigatório)</label>
        <input id="adsGroupName" class="input" type="text" placeholder="Ex: Linha Premium">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Descrição (opcional)</label>
        <input id="adsGroupDesc" class="input" type="text" placeholder="Ex: campanhas de alto ticket">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Campaign IDs (CSV)</label>
        <input id="adsGroupCampaignIds" class="input" type="text" placeholder="123, 456, 789">
        <div class="muted" style="margin-top:6px;">Unitária = 1 ID • Grupal = vários IDs</div>
      </div>
      <div class="actions" style="margin-top:14px;">
        <button id="btnAdsGroupCreateSubmit" class="btn btn-primary">Criar</button>
      </div>
    `
  );

  const submit = document.getElementById("btnAdsGroupCreateSubmit");
  if (!submit) return;

  submit.addEventListener("click", async () => {
    setMsg("adsGroupMsg", "");
    setLoading("adsGroupLoading", "Criando grupo...");

    try {
      const name = document.getElementById("adsGroupName")?.value || "";
      const description =
        document.getElementById("adsGroupDesc")?.value || null;
      const campaignIdsCsv =
        document.getElementById("adsGroupCampaignIds")?.value || "";
      const campaignIds = parseCampaignIdsCsv(campaignIdsCsv);

      await apiPost("/shops/active/ads/campaign-groups", {
        name,
        description,
        campaignIds,
      });

      const overlay = document.getElementById("modal-overlay");
      if (overlay) overlay.style.display = "none";

      await loadCampaignGroups();
      setMsg("adsGroupMsg", "Grupo criado.");
    } catch (e) {
      setMsg("adsGroupMsg", e.message || "Falha ao criar grupo.");
    } finally {
      setLoading("adsGroupLoading", "");
    }
  });
}

function openAdsGroupEditModal() {
  const g = getGroupById(selectedCampaignGroupId);
  if (!g) return setMsg("adsGroupMsg", "Selecione um grupo primeiro.");

  openModal(
    "Editar grupo de campanhas",
    `
      <div class="field">
        <label class="muted">Nome</label>
        <input id="adsGroupName" class="input" type="text" value="${escAttr(
          g.name || ""
        )}">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Descrição</label>
        <input id="adsGroupDesc" class="input" type="text" value="${escAttr(
          g.description || ""
        )}">
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="muted">Campaign IDs (CSV)</label>
        <input id="adsGroupCampaignIds" class="input" type="text" value="${escAttr(
          (g.campaign_ids || []).join(", ")
        )}">
      </div>
      <div class="actions" style="margin-top:14px;">
        <button id="btnAdsGroupEditSubmit" class="btn btn-primary">Salvar</button>
      </div>
    `
  );

  const submit = document.getElementById("btnAdsGroupEditSubmit");
  if (!submit) return;

  submit.addEventListener("click", async () => {
    setMsg("adsGroupMsg", "");
    setLoading("adsGroupLoading", "Salvando grupo...");

    try {
      const name = document.getElementById("adsGroupName")?.value || "";
      const description =
        document.getElementById("adsGroupDesc")?.value || null;
      const campaignIdsCsv =
        document.getElementById("adsGroupCampaignIds")?.value || "";
      const campaignIds = parseCampaignIdsCsv(campaignIdsCsv);

      await apiPut(`/shops/active/ads/campaign-groups/${g.id}`, {
        name,
        description,
        campaignIds,
      });

      const overlay = document.getElementById("modal-overlay");
      if (overlay) overlay.style.display = "none";

      await loadCampaignGroups();
      setMsg("adsGroupMsg", "Grupo atualizado.");
    } catch (e) {
      setMsg("adsGroupMsg", e.message || "Falha ao atualizar grupo.");
    } finally {
      setLoading("adsGroupLoading", "");
    }
  });
}

async function deleteAdsGroupSelected() {
  const g = getGroupById(selectedCampaignGroupId);
  if (!g) return setMsg("adsGroupMsg", "Selecione um grupo primeiro.");

  setMsg("adsGroupMsg", "");
  setLoading("adsGroupLoading", "Excluindo grupo...");

  try {
    await apiDelete(`/shops/active/ads/campaign-groups/${g.id}`);
    selectedCampaignGroupId = null;

    const sel = document.getElementById("adsGroupSelect");
    if (sel) sel.value = "";

    renderGroupSummary(null);
    renderGroupItemsInline(null);
    await loadCampaignGroups();

    setMsg("adsGroupMsg", "Grupo excluído.");
  } catch (e) {
    setMsg("adsGroupMsg", e.message || "Falha ao excluir grupo.");
  } finally {
    setLoading("adsGroupLoading", "");
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
  setText("kpiCpcBroadGmv", fmtMoney(totals.broad_gmv));

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
    {
      label: "GMV Broad",
      data: series.map((x) => x.broad_gmv),
      borderColor: "#0ea5e9",
      tension: 0.25,
    },
  ];

  chartCpcDaily = safeDestroyChart(chartCpcDaily);
  chartCpcDaily = renderLineChart("chartCpcDaily", labels, ds);
}

async function loadCpcCampaigns(dateFrom, dateTo) {
  lastCpcRange = { dateFrom, dateTo };
  setMsg("cpcCampaignMsg", "");
  selectedCpcCampaignId = null;

  // cache settings por período CPC
  const newKey = `cpc:${dateFrom}:${dateTo}`;
  if (cachedSettingsKey !== newKey) {
    cachedSettingsKey = newKey;
    cachedCampaignSettings = new Map();
  }

  const perf = await apiGet(
    `/shops/active/ads/campaigns/performance/daily?dateFrom=${encodeURIComponent(
      dateFrom
    )}&dateTo=${encodeURIComponent(dateTo)}&adType=`
  );

  const campaigns = perf?.response?.campaigns || [];
  cachedCampaignSeries = perf?.response?.seriesByCampaignId || {};

  const ids = campaigns
    .map((c) => c.campaign_id)
    .filter(Boolean)
    .map((x) => String(x));
  const missing = ids.filter((id) => !cachedCampaignSettings.has(id));

  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const settings = await apiGet(
      `/shops/active/ads/campaigns/settings?campaignIds=${encodeURIComponent(
        batch.join(",")
      )}&infoTypes=1,2,3,4`
    );
    const list = settings?.response?.campaign_list || [];
    for (const c of list) cachedCampaignSettings.set(String(c.campaign_id), c);
  }

  lastCpcCampaignRows = campaigns.map((row) => {
    const set = cachedCampaignSettings.get(String(row.campaign_id));
    const common = set?.common_info || {};
    const m = row.metrics || {};
    const creditEstimated =
      common.campaign_budget != null
        ? Number(common.campaign_budget) - Number(m.expense || 0)
        : null;
    const directRoas =
      m.expense && m.direct_gmv ? m.direct_gmv / m.expense : null;
    const directAcos = m.direct_gmv ? (m.expense / m.direct_gmv) * 100 : null;

    return {
      campaign_id: row.campaign_id,
      ad_name: common.ad_name || row.ad_name || "",
      ad_type: common.ad_type || row.ad_type || "",
      campaign_status: common.campaign_status || "",
      placement: common.campaign_placement || row.campaign_placement || "",
      budget: common.campaign_budget ?? null,
      impression: m.impression ?? 0,
      clicks: m.clicks ?? 0,
      expense: m.expense ?? 0,
      direct_gmv: m.direct_gmv ?? 0,
      direct_roas: directRoas,
      direct_acos_pct: directAcos,
      credit_estimated: creditEstimated,
    };
  });

  cpcCampaignsMaster = [...lastCpcCampaignRows];
  applyCpcCampaignView();
  if (cpcCampaignsMaster.length > 0 && cpcCampaignsView.length === 0) {
    const filterEl = document.getElementById("cpcCampaignFilter");
    const statusEl = document.getElementById("cpcCampaignStatusFilter");

    const hadFilter = filterEl && String(filterEl.value || "").trim();
    const hadStatus = statusEl && String(statusEl.value || "all") !== "all";

    if (hadFilter || hadStatus) {
      if (filterEl) {
        filterEl.value = "";
        localStorage.setItem("ads_cpc_filter", "");
      }
      if (statusEl) {
        statusEl.value = "all";
        localStorage.setItem("ads_cpc_status", "all");
      }

      applyCpcCampaignView();
      setMsg(
        "cpcCampaignMsg",
        "Filtros limpos automaticamente para exibir campanhas."
      );
    }
  }
  if (cpcCampaignsView.length) {
    selectCampaign(cpcCampaignsView[0].campaign_id);
  } else {
    setText("cpcCampaignSelected", "Nenhuma selecionada");
  }
  await loadCampaignGroups();
}

async function selectCampaign(campaignId) {
  selectedCpcCampaignId = String(campaignId);
  markSelectedCampaignRow(selectedCpcCampaignId);
  const id = String(campaignId);
  const set = cachedCampaignSettings.get(id);
  const common = set?.common_info || {};

  setText(
    "cpcCampaignSelected",
    common.ad_name ? `${common.ad_name} (#${id})` : `#${id}`
  );

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

  // Desempenho do Produto (tabela de 8 colunas)
  setMsg("cpcItemsMsg", "");
  setLoading("cpcItemsLoading", "Carregando desempenho do produto...");
  lastCpcProductPerfRows = [];

  try {
    const perf = await loadCpcProductPerformance(selectedCpcCampaignId);
    const items = perf?.response?.items || [];
    const ready = Boolean(perf?.response?.performance_ready);

    if (!ready) {
      setMsg(
        "cpcItemsMsg",
        "Desempenho do produto ainda não disponível (endpoint não configurado ou sem dados). Exibindo itens base."
      );
    }

    renderCpcProductPerformanceTable(items);
  } catch (e) {
    setMsg(
      "cpcItemsMsg",
      e.message || "Falha ao carregar desempenho do produto."
    );
    renderCpcProductPerformanceTable([]); // mantém tabela consistente
  } finally {
    setLoading("cpcItemsLoading", "");
  }
  // Desempenho do Produto (igual Shopee) — depende da rota nova do backend
  try {
    setMsg("cpcCampaignMsg", "");
    const perf = await loadCpcProductPerformance(selectedCpcCampaignId);
    // vamos renderizar quando atualizar o HTML da tabela (próximo arquivo)
    // por enquanto só deixa pronto o fetch
  } catch (e) {
    // não quebra a página se o backend ainda não estiver pronto
    // você pode comentar esta linha depois que a rota existir
    // setMsg("cpcCampaignMsg", e.message || "Falha ao carregar desempenho do produto.");
  }
}

async function loadCpcProductPerformance(campaignId) {
  const { dateFrom, dateTo } = getDates();

  // Essa rota vamos criar no backend na próxima etapa
  return apiPost("/shops/active/ads/campaigns/items/performance", {
    campaignId: String(campaignId),
    dateFrom,
    dateTo,
  });
}

function renderCpcProductPerformanceTable(items) {
  const tbody = document.querySelector("#tblCpcCampaignItems tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const safeItems = Array.isArray(items) ? items : [];
  lastCpcProductPerfRows = safeItems
    .map((it) => ({
      item_id: String(it.item_id || ""),
      title: it.title || "",
      image_url: it.image_url || "",
      product_name: it.product_name || "",
      status: it.status || "",
      impression: it.impression ?? null,
      clicks: it.clicks ?? null,
      expense: it.expense ?? null,
      gmv: it.gmv ?? null,
      conversions: it.conversions ?? null,
      items: it.items ?? null,
    }))
    .filter((x) => x.item_id);

  for (const it of lastCpcProductPerfRows) {
    const tr = document.createElement("tr");

    const productHtml = `
      <div class="product-cell">
        <img class="product-thumb" src="${
          it.image_url || ""
        }" onerror="this.style.display='none'">
        <div>
          <div style="font-weight:900">${escHtml(
            it.title || "Item " + it.item_id
          )}</div>
          <div class="muted">ID: ${escHtml(it.item_id)}${
      it.product_name ? " • " + escHtml(it.product_name) : ""
    }${it.status ? " • " + escHtml(it.status) : ""}</div>
        </div>
      </div>
    `;

    // Ação simples: copiar item_id
    const actionHtml = `<button class="btn btn-ghost" data-copy="${escAttr(
      it.item_id
    )}">Copiar ID</button>`;

    tr.innerHTML = `
      <td>${productHtml}</td>
      <td>${fmtInt(it.impression)}</td>
      <td>${fmtInt(it.clicks)}</td>
      <td>${fmtMoney(it.expense)}</td>
      <td>${fmtMoney(it.gmv)}</td>
      <td>${fmtInt(it.conversions)}</td>
      <td>${fmtInt(it.items)}</td>
      <td>${actionHtml}</td>
    `;

    // Handler do botão de copiar
    tr.querySelector("button[data-copy]")?.addEventListener(
      "click",
      async (e) => {
        e.stopPropagation();
        const v = e.currentTarget.getAttribute("data-copy") || "";
        try {
          await navigator.clipboard.writeText(v);
          setMsg("cpcItemsMsg", "Item ID copiado.");
        } catch (_) {
          setMsg(
            "cpcItemsMsg",
            "Não foi possível copiar (permissão do navegador)."
          );
        }
      }
    );

    tbody.appendChild(tr);
  }

  if (!lastCpcProductPerfRows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="8" class="muted">Nenhum item retornado para esta campanha no período.</td>`;
    tbody.appendChild(tr);
  }
}

/* ===========================
   GMS
=========================== */

async function loadGmsAll(dateFrom, dateTo) {
  setMsg("gmsMsg", "");

  setDisabled("btnGmsCreate", true);
  setDisabled("btnGmsEdit", true);

  let eligibleResp = null;

  try {
    eligibleResp = await apiGet("/shops/active/ads/gms/eligibility");
  } catch (e) {
    setText("kpiGmsEligible", "Indisponível");
    setText("kpiGmsReason", "—");
    setText("kpiGmsExpense", "—");
    setText("kpiGmsGmv", "—");
    setText("kpiGmsRoas", "—");
    setText("kpiGmsAcos", "—");
    renderGmsTablesEmpty("GMS indisponível para esta loja.");
    setDisabled("btnGmsCreate", true);
    setDisabled("btnGmsEdit", true);
    setMsg("gmsMsg", e.message || "GMS indisponível para esta loja.");
    return;
  }

  const eligible = eligibleResp?.response?.is_eligible;
  const reason = eligibleResp?.response?.reason;

  setText(
    "kpiGmsEligible",
    eligible === true ? "Sim" : eligible === false ? "Não" : "—"
  );
  setText("kpiGmsReason", reason || "—");

  if (reason === "not_whitelisted") {
    setText("kpiGmsExpense", "—");
    setText("kpiGmsGmv", "—");
    setText("kpiGmsRoas", "—");
    setText("kpiGmsAcos", "—");
    renderGmsTablesEmpty("GMS indisponível para esta loja (not_whitelisted).");
    setDisabled("btnGmsCreate", true);
    setDisabled("btnGmsEdit", true);
    setMsg("gmsMsg", "GMS indisponível para esta loja (not_whitelisted).");
    return;
  }

  setDisabled("btnGmsCreate", false);
  setDisabled("btnGmsEdit", false);

  try {
    await loadGmsCampaignTotals(dateFrom, dateTo);
    gmsPager.offset = 0;
    await loadGmsItems(dateFrom, dateTo, gmsPager.offset, gmsPager.limit);
    await loadGmsDeleted();
  } catch (e) {
    setText("kpiGmsExpense", "—");
    setText("kpiGmsGmv", "—");
    setText("kpiGmsRoas", "—");
    setText("kpiGmsAcos", "—");
    renderGmsTablesEmpty(e.message || "Falha ao carregar GMS.");
    setDisabled("btnGmsCreate", true);
    setDisabled("btnGmsEdit", true);
    setMsg("gmsMsg", e.message || "Falha ao carregar GMS.");
  }
}

function renderGmsTablesEmpty(msg) {
  lastGmsItemRows = [];
  lastGmsDeletedItemIds = [];

  const tb1 = document.querySelector("#tblGmsItems tbody");
  const tb2 = document.querySelector("#tblGmsDeleted tbody");

  if (tb1) tb1.innerHTML = `<tr><td colspan="8" class="muted">${msg}</td></tr>`;
  if (tb2) tb2.innerHTML = `<tr><td class="muted">${msg}</td></tr>`;

  setText("gmsPagerInfo", "—");
  gmsPager.hasNext = false;
  gmsPager.total = null;
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

  lastGmsItemRows = items.map((it) => {
    const r = it.report || {};
    return {
      item_id: it.item_id,
      title: it.title || "",
      impression: r.impression ?? 0,
      clicks: r.clicks ?? 0,
      expense: r.expense ?? 0,
      broad_gmv: r.broad_gmv ?? 0,
      broad_roi: r.broad_roi ?? null,
      broad_cir: r.broad_cir ?? null,
      broad_order: r.broad_order ?? 0,
    };
  });

  const tbody = document.querySelector("#tblGmsItems tbody");
  if (!tbody) return;

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
  lastGmsDeletedItemIds = itemIds.map((x) => String(x));

  const tbody = document.querySelector("#tblGmsDeleted tbody");
  if (!tbody) return;

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
