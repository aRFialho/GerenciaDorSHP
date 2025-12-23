function setActiveTab(tabName) {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
}

async function fetchAuthUrl() {
  const res = await fetch("/auth/url");
  const data = await res.json();
  return data.auth_url;
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});

const btn = document.getElementById("btn-auth-url");
if (btn) {
  btn.addEventListener("click", async () => {
    const preview = document.getElementById("auth-url-preview");
    preview.textContent = "Carregando...";
    try {
      const url = await fetchAuthUrl();
      preview.textContent = url;
      window.open(url, "_blank");
    } catch (e) {
      preview.textContent = "Falha ao gerar URL de autorização.";
    }
  });
}

setActiveTab("auth");