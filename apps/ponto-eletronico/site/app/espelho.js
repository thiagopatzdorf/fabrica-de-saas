// Espelho de ponto do mês (RH): tela, impressão/PDF pelo navegador, CSV e ajustes com motivo.
import { $, api, dataBr, esc, hhmm, mesNome, somarMes } from "./comum.js";

const q = new URLSearchParams(location.search);
const fid = q.get("f");
let mes = /^\d{4}-\d{2}$/.test(q.get("m") || "") ? q.get("m") : new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);
let dados = null;
const dlg = $("[data-dialogo]");

function abrirDialogo(html) {
  dlg.innerHTML = html;
  dlg.showModal();
  dlg.querySelector("[data-fechar]")?.addEventListener("click", () => dlg.close());
}

async function carregar() {
  history.replaceState(null, "", `/app/espelho?f=${encodeURIComponent(fid)}&m=${mes}`);
  const r = await api(`/api/rh/espelho?funcionario=${encodeURIComponent(fid)}&mes=${mes}`);
  if (r.status === 401) { location.href = "/app/"; return; }
  if (!r.ok) { $("[data-dias]").innerHTML = `<tr><td colspan="7">${esc(r.erro)}</td></tr>`; return; }
  dados = r;
  const c = r.cabecalho, t = r.espelho.totais;
  document.title = `Espelho ${mes} · ${c.nome}`;
  $("[data-periodo]").textContent = `Período: ${mesNome(mes)} (01 a ${r.espelho.dias.length})`;
  $("[data-csv]").href = `/api/rh/espelho.csv?funcionario=${encodeURIComponent(fid)}&mes=${mes}`;
  $("[data-cab]").innerHTML = `
    <div>Empregador: <b>${esc(c.empresa)}</b></div><div>CNPJ: <b>${esc(c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"))}</b></div>
    <div>Empregado: <b>${esc(c.nome)}</b></div><div>CPF: <b>${esc(c.cpf)}</b></div>
    <div>Jornada: <b>${hhmm(c.jornada_min)}</b> por dia útil, intervalo de <b>${hhmm(c.intervalo_min)}</b></div>
    <div>${c.matricula ? `Matrícula: <b>${esc(c.matricula)}</b>` : ""}${c.admissao ? ` · Admissão: <b>${dataBr(c.admissao)}</b>` : ""}</div>`;
  $("[data-tot]").innerHTML = [["Trabalhado", hhmm(t.trabalhado_min)], ["Previsto", hhmm(t.previsto_min)],
    ["Saldo", `<span class="${t.saldo_min < 0 ? "neg" : "pos"}">${hhmm(t.saldo_min)}</span>`], ["Faltas", t.faltas], ["Ímpares", t.impares], ["Rosto a revisar", t.revisar]]
    .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");
  $("[data-dias]").innerHTML = r.espelho.dias.map((d) => `
    <tr class="${d.util ? "" : "fds"}">
      <td>${dataBr(d.data).slice(0, 5)} <small>${d.semana}</small></td>
      <td>${d.marcacoes.map((m) => `<span class="mk ${m.origem === "I" ? "inc" : ""} ${m.desconsiderada ? "des" : ""}">${m.origem === "O" ? `<button type="button" data-mk="${esc(m.id)}" title="NSR ${m.nsr}">${m.hora}</button>` : m.hora}${!m.dentro ? " ⚑" : ""}${m.revisar ? " ?" : ""}</span>`).join("") || (d.util ? "—" : "")}</td>
      <td>${d.marcacoes.length ? hhmm(d.trabalhado_min) : ""}</td><td>${d.previsto_min ? hhmm(d.previsto_min) : ""}</td>
      <td class="${d.saldo_min < 0 ? "neg" : d.saldo_min > 0 ? "pos" : ""}">${d.saldo_min == null || (!d.util && !d.marcacoes.length) ? "" : hhmm(d.saldo_min)}</td>
      <td>${d.alertas.map((a) => `<span class="selo alerta">${esc(a)}</span>`).join(" ")}</td>
      <td class="nao-imprime"><button class="btn sm leve" type="button" data-incluir="${d.data}">+ marcação</button></td>
    </tr>`).join("");
  const aj = r.ajustes.filter((a) => a.tipo === "incluir" || r.espelho.dias.some((d) => d.marcacoes.some((m) => m.id === a.marcacao)));
  $("[data-ajustes]").innerHTML = aj.length ? `<h2>Ajustes do RH neste mês</h2><table class="tabela-app"><tbody>${aj.map((a) => `<tr><td>${a.tipo === "incluir" ? "Incluída" : "Desconsiderada"}</td><td>${esc(a.motivo)}</td><td>${esc(a.autor)}</td></tr>`).join("")}</tbody></table>` : "";
}

$("[data-dias]").addEventListener("click", (e) => {
  const inc = e.target.closest("[data-incluir]"), mk = e.target.closest("[data-mk]");
  if (inc) {
    abrirDialogo(`<form method="dialog" data-f-inc><h2>Incluir marcação em ${dataBr(inc.dataset.incluir)}</h2>
      <label class="campo">Hora<input name="hora" type="time" required></label>
      <label class="campo">Motivo<small>fica no espelho e na auditoria</small><input name="motivo" required minlength="5" maxlength="300" placeholder="Ex.: esqueceu de bater a saída"></label>
      <div class="acoes"><button class="btn" type="submit">Incluir</button><button class="btn leve" type="button" data-fechar>Cancelar</button></div><p class="aviso" data-av hidden></p></form>`);
    dlg.querySelector("form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const r = await api("/api/rh/ajustes", { funcionario: fid, tipo: "incluir", dia: inc.dataset.incluir, hora: f.get("hora"), motivo: f.get("motivo") });
      if (!r.ok) { const a = dlg.querySelector("[data-av]"); a.hidden = false; a.className = "aviso erro"; a.textContent = r.erro; return; }
      dlg.close(); carregar();
    });
  } else if (mk) {
    const m = dados.espelho.dias.flatMap((d) => d.marcacoes).find((x) => x.id === mk.dataset.mk);
    abrirDialogo(`<h2>Marcação NSR ${m.nsr} · ${m.hora}</h2>
      <img src="/api/rh/foto/${encodeURIComponent(m.id)}" alt="Foto tirada no momento do ponto" width="240" height="180">
      <p>${m.dentro ? "Dentro da cerca." : "⚑ Fora da cerca."} ${m.revisar ? "? Rosto na faixa de revisão: confira a foto." : ""}</p>
      ${m.desconsiderada ? `<p><b>Desconsiderada:</b> ${esc(m.motivo)}</p><button class="btn leve" type="button" data-fechar>Fechar</button>` : `
      <form data-f-des><label class="campo">Desconsiderar esta marcação? Motivo<input name="motivo" required minlength="5" maxlength="300" placeholder="Ex.: bateu duas vezes por engano"></label>
      <div class="acoes"><button class="btn" type="submit">Desconsiderar</button><button class="btn leve" type="button" data-fechar>Fechar</button></div><p class="aviso" data-av hidden></p></form>`}`);
    dlg.querySelector("img").addEventListener("error", (ev) => ev.target.replaceWith(Object.assign(document.createElement("p"), { textContent: "Sem foto para esta marcação." })));
    dlg.querySelector("[data-f-des]")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const r = await api("/api/rh/ajustes", { funcionario: fid, tipo: "desconsiderar", marcacao: m.id, motivo: new FormData(ev.target).get("motivo") });
      if (!r.ok) { const a = dlg.querySelector("[data-av]"); a.hidden = false; a.className = "aviso erro"; a.textContent = r.erro; return; }
      dlg.close(); carregar();
    });
  }
});
for (const b of document.querySelectorAll("[data-mes]")) b.addEventListener("click", () => { mes = somarMes(mes, Number(b.dataset.mes)); carregar(); });
$("[data-imprimir]").addEventListener("click", () => print());
carregar();
