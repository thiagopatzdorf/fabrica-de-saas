// Criar link no celular. A chave de acesso fica só no localStorage deste aparelho (se o navegador
// bloquear, vale até fechar a aba). Texto do servidor entra sempre como texto, nunca como HTML.
import { paraCentavos } from "/dinheiro.js";
const $ = (id) => document.getElementById(id);
const guardar = (t) => { try { localStorage.setItem("pagar:token", t); } catch { sessionStorage.setItem("pagar:token", t); } };
const ler = () => { try { return localStorage.getItem("pagar:token") || sessionStorage.getItem("pagar:token") || ""; } catch { return ""; } };

async function chamar(caminho, corpo) {
  const r = await fetch(caminho, { method: corpo ? "POST" : "GET", headers: { authorization: `Bearer ${ler()}`, ...(corpo ? { "content-type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.erro || "Algo deu errado."), { status: r.status });
  return j;
}

function mostrar() {
  const tem = Boolean(ler());
  $("acesso").hidden = tem; $("criar").hidden = !tem;
  if (tem) recentes();
}

async function recentes() {
  try {
    const { pagamentos } = await chamar("/api/pagamentos");
    $("recentes").hidden = !pagamentos.length;
    $("lista").replaceChildren(...pagamentos.slice(0, 10).map((p) => {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = `${(p.valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${p.nome || p.email || "sem nome"}`;
      const b = document.createElement("small"); b.textContent = p.status;
      li.append(a, b); return li;
    }));
  } catch (e) { if (e.status === 401) { guardar(""); mostrar(); } }
}

$("f-token").addEventListener("submit", (ev) => { ev.preventDefault(); guardar($("token").value.trim()); $("token").value = ""; mostrar(); });
$("tipo").addEventListener("change", () => { const t = $("tipo").value; $("l-minimo").hidden = t !== "livre"; $("l-valor").firstChild.textContent = t === "livre" ? "Valor sugerido em reais (opcional)" : "Valor em reais"; });

$("f-link").addEventListener("submit", async (ev) => {
  ev.preventDefault(); $("erro").textContent = ""; $("resultado").hidden = true;
  const tipo = $("tipo").value;
  const valor = paraCentavos($("valor").value), minimo = paraCentavos($("minimo").value);
  if (tipo !== "livre" && valor === null) { $("erro").textContent = "Digite um valor em reais, por exemplo 150,00."; return; }
  const corpo = { descricao: $("descricao").value, ...(tipo === "livre" ? { livre: true, ...(valor !== null ? { valor } : {}), ...(minimo !== null ? { minimo } : {}) } : { valor, ...(tipo === "fixo" ? {} : { recorrente: tipo }) }) };
  try {
    const l = await chamar("/api/links", corpo);
    $("url").textContent = l.url; $("resultado").hidden = false;
    $("copiar").onclick = async () => { try { await navigator.clipboard.writeText(l.url); $("copiar").textContent = "Copiado"; } catch { $("url").focus(); } };
    $("whats").onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent(`${l.descricao}: ${l.url}`)}`, "_blank", "noopener");
  } catch (e) {
    if (e.status === 401) { guardar(""); mostrar(); } else $("erro").textContent = e.message;
  }
});
mostrar();
