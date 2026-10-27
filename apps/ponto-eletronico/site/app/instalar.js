// Instalação: o convite vem no fragmento (#...) do link, que não vai para servidor nem para log.
import { $, api, aviso } from "./comum.js";

const convite = location.hash.slice(1);
if (!convite) aviso($("[data-aviso]"), "Este endereço precisa do link de convite completo que o administrador do sistema gerou (veja o README, "Cliente novo").");

$("[data-instalar]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), b = e.target.querySelector("button");
  b.disabled = true;
  const r = await api("/api/instalar", { convite, empresa: { nome: f.get("empresa"), cnpj: f.get("cnpj") }, rh: { nome: f.get("nome"), email: f.get("email"), senha: f.get("senha") } });
  b.disabled = false;
  if (r.ok) { history.replaceState(null, "", "/app/instalar"); location.href = "/app/rh"; }
  else aviso($("[data-aviso]"), r.erro);
});
