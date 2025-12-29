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

function bootLogin() {
  // IDs esperados no login.html:
  // - form#login-form
  // - input#email
  // - input#password
  // - div#login-msg
  // - a#forgot (opcional)
  const form = $("#login-form");
  if (form) form.addEventListener("submit", onLoginSubmit);

  const forgot = $("#forgot");
  if (forgot) {
    forgot.addEventListener("click", (e) => {
      e.preventDefault();
      setMsg("Recuperação de senha: contate o administrador da conta.", "info");
    });
  }
}

bootLogin();
