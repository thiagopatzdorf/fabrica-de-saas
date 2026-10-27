// Mostra se o Stripe já foi ligado; nada além disso é público.
const el = document.getElementById("estado");
try {
  const s = await (await fetch("/api/status")).json();
  el.textContent = s.stripe ? `Stripe ligado (${s.modo === "live" ? "dinheiro real" : "modo de teste"})` : "Stripe ainda não ligado";
} catch { el.textContent = "sem resposta"; }
