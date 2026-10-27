// O convite vem na URL (?convite=...), é uso único e vale 72 h. Sai da barra de endereço logo
// que a página abre, para não ficar no histórico nem em print.
const convite = new URLSearchParams(location.search).get("convite") || "";
history.replaceState(null, "", "/configurar");
const $ = (id) => document.getElementById(id);
$("f").addEventListener("submit", async (ev) => {
  ev.preventDefault(); $("erro").textContent = ""; $("ok").textContent = "";
  try {
    const r = await fetch("/api/configurar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ convite, chave: $("chave").value, whsec: $("whsec").value || undefined }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || "Algo deu errado.");
    $("chave").value = ""; $("whsec").value = "";
    const aviso = [j.sessoes !== "ok" && `Checkout: ${j.sessoes}`, j.marca !== "ok" && `Marca: ${j.marca}`].filter(Boolean);
    $("ok").textContent = `Stripe ligado em modo ${j.modo === "live" ? "real" : "de teste"}. Webhook: ${j.webhook}. Checkout: ${j.sessoes}. Marca: ${j.marca}. ` +
      (aviso.length ? "Atenção: a chave não tem todas as permissões. Gere outra com Checkout Sessions e Files em escrita e abra um novo link de configuração." : "Já pode fechar esta página.");
    $("f").hidden = true;
  } catch (e) { $("erro").textContent = e.message; }
});
