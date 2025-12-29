async function apiPost(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body ?? {}),
  });

  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!r.ok) {
    const msg =
      (json && (json.error || json.message)) || text || `HTTP ${r.status}`;
    throw new Error(msg);
  }

  return json;
}

function $(sel) {
  return document.querySelector(sel);
}

function setMsg(text, kind) {
  const el = $("#login-msg");
  if (!el) return;
  el.textContent = text || "";
  el.dataset.kind = kind || "";
}

async function onLoginSubmit(e) {
  e.preventDefault();

  const email = ($("#email")?.value || "").trim();
  const password = ($("#password")?.value || "").trim();

  if (!email || !password) {
    setMsg("Informe e-mail e senha.", "error");
    return;
  }

  try {
    setMsg("Entrando...", "info");
    await apiPost("/auth/login", { email, password });
    window.location.href = "/";
  } catch (err) {
    setMsg(String(err?.message || "Falha no login."), "error");
  }
}

async function onRegisterClick() {
  const accountName = ($("#accountName")?.value || "").trim();
  const email = ($("#email")?.value || "").trim();
  const password = ($("#password")?.value || "").trim();

  if (!accountName || !email || !password) {
    setMsg("Para registrar: informe nome da conta, e-mail e senha.", "error");
    return;
  }

  try {
    setMsg("Registrando...", "info");
    await apiPost("/auth/register", { accountName, email, password });
    window.location.href = "/?tab=auth&startOauth=1";
  } catch (err) {
    setMsg(String(err?.message || "Falha no registro."), "error");
  }
}

function bootLogin() {
  const form = $("#login-form");
  if (form) form.addEventListener("submit", onLoginSubmit);

  const btnRegister = $("#btn-register");
  if (btnRegister) btnRegister.addEventListener("click", onRegisterClick);

  const forgot = $("#forgot");
  if (forgot) {
    forgot.addEventListener("click", (e) => {
      e.preventDefault();
      setMsg("Recuperação de senha: contate o administrador da conta.", "info");
    });
  }
}

bootLogin();
