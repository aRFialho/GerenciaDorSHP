function setActiveTab(tabName) {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
}

function getShopId() {
  const el = document.getElementById("shop-id");
  return el ? String(el.value || "").trim() : "";
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error("Resposta inválida (não é JSON).");
    err.details = text;
    throw err;
  }
}

async function fetchAuthUrl() {
  const res = await fetch("/auth/url");
  const data = await safeJson(res);
  return data.auth_url;
}

async function fetchOrders({ shopId, rangeDays, pageSize, cursor }) {
  const params = new URLSearchParams();

  params.set("rangeDays", String(rangeDays || 7));
  params.set("pageSize", String(pageSize || 50));
  if (cursor) params.set("cursor", String(cursor));

  const url = `/shops/${encodeURIComponent(
    shopId
  )}/orders?${params.toString()}`;
  const res = await fetch(url);

  const data = await safeJson(res);
  if (!res.ok || data?.status === "error") {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Erro ao carregar pedidos (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

async function fetchProducts({
  shopId,
  status,
  sortBy,
  sortDir,
  pageSize,
  cursor,
}) {
  const params = new URLSearchParams();

  params.set("status", String(status || "active"));
  params.set("sortBy", String(sortBy || "createdAt"));
  params.set("sortDir", String(sortDir || "desc"));
  params.set("pageSize", String(pageSize || 50));
  if (cursor) params.set("cursor", String(cursor));

  const url = `/shops/${encodeURIComponent(
    shopId
  )}/products?${params.toString()}`;
  const res = await fetch(url);

  const data = await safeJson(res);
  if (!res.ok || data?.status === "error") {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Erro ao carregar produtos (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

function setPre(preId, text) {
  const pre = document.getElementById(preId);
  if (pre) pre.textContent = text;
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});

const btnAuth = document.getElementById("btn-auth-url");
if (btnAuth) {
  btnAuth.addEventListener("click", async () => {
    const preview = document.getElementById("auth-url-preview");
    if (preview) preview.textContent = "Carregando...";

    try {
      const url = await fetchAuthUrl();
      if (preview) preview.textContent = url;
      window.open(url, "_blank");
    } catch (e) {
      if (preview) preview.textContent = "Falha ao gerar URL de autorização.";
    }
  });
}

const btnLoadOrders = document.getElementById("btn-load-orders");
if (btnLoadOrders) {
  btnLoadOrders.addEventListener("click", async () => {
    const shopId = getShopId();
    if (!shopId) {
      setPre("orders-output", "Erro: informe o shop_id no campo acima.");
      return;
    }

    const rangeEl = document.getElementById("orders-range");
    const pageSizeEl = document.getElementById("orders-page-size");

    const rangeDays = rangeEl ? Number(rangeEl.value) : 7;
    const pageSize = pageSizeEl ? Number(pageSizeEl.value) : 50;

    setPre("orders-output", "Carregando...");

    try {
      const data = await fetchOrders({ shopId, rangeDays, pageSize });
      setPre("orders-output", JSON.stringify(data, null, 2));
    } catch (e) {
      setPre("orders-output", `Erro: ${e.message}`);
    }
  });
}

const btnLoadProducts = document.getElementById("btn-load-products");
if (btnLoadProducts) {
  btnLoadProducts.addEventListener("click", async () => {
    const shopId = getShopId();
    if (!shopId) {
      setPre("products-output", "Erro: informe o shop_id no campo acima.");
      return;
    }

    const statusEl = document.getElementById("products-status");
    const sortByEl = document.getElementById("products-sort-by");
    const sortDirEl = document.getElementById("products-sort-dir");
    const pageSizeEl = document.getElementById("products-page-size");

    const status = statusEl ? statusEl.value : "active";
    const sortBy = sortByEl ? sortByEl.value : "createdAt";
    const sortDir = sortDirEl ? sortDirEl.value : "desc";
    const pageSize = pageSizeEl ? Number(pageSizeEl.value) : 50;

    setPre("products-output", "Carregando...");

    try {
      const data = await fetchProducts({
        shopId,
        status,
        sortBy,
        sortDir,
        pageSize,
      });
      setPre("products-output", JSON.stringify(data, null, 2));
    } catch (e) {
      setPre("products-output", `Erro: ${e.message}`);
    }
  });
}

setActiveTab("auth");
