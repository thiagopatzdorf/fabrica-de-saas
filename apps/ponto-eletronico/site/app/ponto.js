// Bater ponto: relógio, câmera, localização, rosto. O servidor decide e devolve o comprovante.
import { $, api, aviso, esc } from "./comum.js";
import { abrirCamera, capturar, carregar, desafioPiscar, localizacao } from "./rosto.js";

const dois = (n) => String(n).padStart(2, "0");
const tic = () => { const d = new Date(); $("[data-relogio]").textContent = `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`; };
tic(); setInterval(tic, 1000);
$("[data-data]").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

async function atualizarEu() {
  const eu = await api("/api/eu");
  if (!eu.ok) { $("[data-quem]").textContent = ""; aviso($("[data-aviso]"), eu.erro); return null; }
  $("[data-quem]").innerHTML = `<b>${esc(eu.nome)}</b> · ${esc(eu.empresa)}${eu.local ? ` · ${esc(eu.local.nome)}` : ""}`;
  $("[data-hoje]").innerHTML = eu.hoje.length ? eu.hoje.map((m) => `<span class="selo">${m.hora}</span>`).join("") : `<span class="selo">nenhuma marcação hoje</span>`;
  return eu;
}

const eu = await atualizarEu();
const video = $(".camera video"), estado = $("[data-estado]"), botao = $("[data-bater]");
if (eu) {
  try {
    await abrirCamera(video);
    await carregar((t) => { estado.textContent = t; });
    estado.textContent = "Rosto dentro da moldura e toque em Registrar.";
    botao.disabled = false;
  } catch (e) { estado.textContent = ""; aviso($("[data-aviso]"), e.message); }
}

botao.addEventListener("click", async () => {
  botao.disabled = true; aviso($("[data-aviso]"), "");
  try {
    estado.textContent = "Pegando a localização…";
    const geo = eu.local ? await localizacao() : await localizacao().catch(() => ({}));
    const piscou = eu.piscar ? await desafioPiscar(video, (t) => { estado.textContent = t; }) : false;
    estado.textContent = "Lendo o rosto…";
    const rosto = await capturar(video);
    estado.textContent = "Registrando…";
    const r = await api("/api/ponto", { ...geo, vetor: rosto.vetor, real: rosto.real, vivo: rosto.vivo, piscou, foto: rosto.foto });
    if (!r.ok) throw new Error(r.erro);
    const c = r.comprovante;
    $("[data-dados]").innerHTML = [["NSR", c.nsr], ["Data", c.dia], ["Hora", c.hora], ["Nome", esc(c.nome)], ["CPF", esc(c.cpf)], ["Empresa", esc(c.empresa)],
      ["CNPJ", esc(c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"))], ["Local", c.local ? `${esc(c.local)} (${c.distancia_m} m${c.dentro ? "" : ", fora da cerca"})` : "sem cerca"]]
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("") +
      (c.revisar ? `<p class="aviso info">O RH vai conferir a foto desta marcação.</p>` : "") +
      `<div><dt>Código de conferência</dt></div><code class="hash">${esc(c.hash)}</code>`;
    $("[data-tela-ponto]").hidden = true; $("[data-comprovante]").hidden = false;
    atualizarEu();
  } catch (e) { aviso($("[data-aviso]"), e.message); }
  estado.textContent = "Rosto dentro da moldura e toque em Registrar.";
  botao.disabled = false;
});
$("[data-de-novo]").addEventListener("click", () => { $("[data-comprovante]").hidden = true; $("[data-tela-ponto]").hidden = false; });
