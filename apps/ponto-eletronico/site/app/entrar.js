// Login do RH.
import { $, api, aviso } from "./comum.js";

$("[data-entrar]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), b = e.target.querySelector("button");
  b.disabled = true;
  const r = await api("/api/entrar", { email: f.get("email"), senha: f.get("senha") });
  b.disabled = false;
  if (r.ok) location.href = "/app/rh";
  else aviso($("[data-aviso]"), r.erro);
});
