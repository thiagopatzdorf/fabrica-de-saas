// Painel do RH: funcionários (cadastro, link de ativação, espelho), locais de ponto e auditoria.
import { $, api, aviso, esc, mesAtual } from "./comum.js";

let locais = [];
const eu = await api("/api/rh/eu");
if (eu.status === 401) location.href = "/app/";
$("[data-empresa]").textContent = eu.empresa?.nome || "Painel do RH";
$("[data-quem]").textContent = eu.rh ? `${eu.rh.nome} · CNPJ ${eu.empresa.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}` : "";

for (const b of document.querySelectorAll("[data-aba]")) b.addEventListener("click", () => {
  for (const x of document.querySelectorAll("[data-aba]")) x.setAttribute("aria-selected", String(x === b));
  for (const s of document.querySelectorAll("[data-painel]")) s.hidden = s.dataset.painel !== b.dataset.aba;
  if (b.dataset.aba === "auditoria") carregarAuditoria();
});
$("[data-sair]").addEventListener("click", async () => { await api("/api/rh/sair", {}); location.href = "/app/"; });

const quando = (ms) => (ms ? new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

async function carregarLocais() {
  locais = (await api("/api/rh/locais")).locais || [];
  $("[data-lista-locais]").innerHTML = locais.length
    ? `<table class="tabela-app"><thead><tr><th>Local</th><th>Coordenadas</th><th>Raio</th><th>Fora da cerca</th></tr></thead><tbody>${locais.map((l) => `<tr><td>${esc(l.nome)}</td><td>${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}</td><td>${l.raio_m} m</td><td>${l.exigir ? "recusa" : "registra e marca"}</td></tr>`).join("")}</tbody></table>`
    : `<p class="vazio">Nenhum local ainda. Sem local, o ponto vale de qualquer lugar (a localização fica registrada mesmo assim).</p>`;
  $("[data-sel-local]").innerHTML = `<option value="">Sem cerca (qualquer lugar)</option>` + locais.map((l) => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join("");
}

async function carregarFuncionarios() {
  const fs = (await api("/api/rh/funcionarios")).funcionarios || [];
  const nomeLocal = (id) => locais.find((l) => l.id === id)?.nome || "sem cerca";
  $("[data-lista-func]").innerHTML = fs.length ? `<table class="tabela-app"><thead><tr><th>Nome</th><th>Situação</th><th>Local</th><th>Último ponto</th><th></th></tr></thead><tbody>${fs.map((f) => `
    <tr data-f="${esc(f.id)}"><td><b>${esc(f.nome)}</b>${f.matricula ? `<br><small>matrícula ${esc(f.matricula)}</small>` : ""}</td>
      <td>${!f.ativo ? `<span class="selo">desativado</span>` : f.rosto ? `<span class="selo ok">ativo</span>` : `<span class="selo alerta">falta ativar o celular</span>`}</td>
      <td>${esc(nomeLocal(f.local))}</td><td>${quando(f.ultimo)}</td>
      <td><div class="acoes">${f.ativo ? `<a class="btn sm" href="/app/espelho?f=${encodeURIComponent(f.id)}&m=${mesAtual()}">Espelho</a>
        <button class="btn sm leve" type="button" data-ativ="${esc(f.id)}" data-nome="${esc(f.nome)}">${f.rosto ? "Novo celular" : "Link de ativação"}</button>
        ${f.rosto ? `<button class="btn sm leve" type="button" data-apagar="${esc(f.id)}" data-nome="${esc(f.nome)}">Apagar rosto</button>` : ""}
        <button class="btn sm leve" type="button" data-desativar="${esc(f.id)}" data-nome="${esc(f.nome)}">Desativar</button>` : ""}</div>
      <div data-link="${esc(f.id)}"></div></td></tr>`).join("")}</tbody></table>` : `<p class="vazio">Nenhum funcionário ainda. Cadastre o primeiro abaixo.</p>`;
}

$("[data-lista-func]").addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.ativ) {
    if (b.textContent.includes("Novo") && !confirm(`Gerar link para um celular novo de ${b.dataset.nome}? O celular atual perde o acesso.`)) return;
    const r = await api(`/api/rh/funcionarios/${b.dataset.ativ}/ativacao`, {});
    const alvo = document.querySelector(`[data-link="${CSS.escape(b.dataset.ativ)}"]`);
    if (!r.ok) { alvo.innerHTML = `<p class="aviso erro">${esc(r.erro)}</p>`; return; }
    const msg = `Olá, ${b.dataset.nome.split(" ")[0]}! Abra este link no SEU celular para ativar o ponto (vale ${r.expira_em_dias} dias, uma vez só): ${r.url}`;
    alvo.innerHTML = `<div class="link-ativ"><span>${esc(r.url)}</span><div class="acoes"><button class="btn sm" type="button" data-copiar>Copiar</button>
      <a class="btn sm leve" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Mandar no WhatsApp</a></div></div>`;
    alvo.querySelector("[data-copiar]").addEventListener("click", async (ev) => { await navigator.clipboard.writeText(r.url); ev.target.textContent = "Copiado"; });
  } else if (b.dataset.apagar) {
    if (!confirm(`Apagar o cadastro do rosto de ${b.dataset.nome}? Ele(a) só volta a bater ponto depois de cadastrar de novo.`)) return;
    await api(`/api/rh/funcionarios/${b.dataset.apagar}/rosto/apagar`, {}); carregarFuncionarios();
  } else if (b.dataset.desativar) {
    if (!confirm(`Desativar ${b.dataset.nome}? O celular perde o acesso e o histórico continua guardado.`)) return;
    await api(`/api/rh/funcionarios/${b.dataset.desativar}/desativar`, {}); carregarFuncionarios();
  }
});

$("[data-novo-func]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const r = await api("/api/rh/funcionarios", { ...f, jornada_min: Number(f.jornada_min), intervalo_min: Number(f.intervalo_min), local: f.local || null });
  if (!r.ok) return aviso($("[data-aviso-func]"), r.erro);
  e.target.reset();
  aviso($("[data-aviso-func]"), "Cadastrado. Agora gere o link de ativação e mande para o celular dele(a).", "ok");
  carregarFuncionarios();
});

$("[data-minha-loc]").addEventListener("click", () => {
  const form = $("[data-novo-local]");
  aviso($("[data-aviso-local]"), "Pegando a localização…", "info");
  navigator.geolocation.getCurrentPosition((p) => {
    form.lat.value = p.coords.latitude.toFixed(6); form.lng.value = p.coords.longitude.toFixed(6);
    aviso($("[data-aviso-local]"), `Localização pega (precisão de ${Math.round(p.coords.accuracy)} m).`, "ok");
  }, () => aviso($("[data-aviso-local]"), "Não deu para pegar a localização. Libere o acesso ou digite as coordenadas."), { enableHighAccuracy: true, timeout: 15000 });
});
$("[data-novo-local]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const r = await api("/api/rh/locais", { nome: f.get("nome"), lat: Number(String(f.get("lat")).replace(",", ".")), lng: Number(String(f.get("lng")).replace(",", ".")), raio_m: Number(f.get("raio_m")), exigir: f.get("exigir") === "on" });
  if (!r.ok) return aviso($("[data-aviso-local]"), r.erro);
  e.target.reset(); aviso($("[data-aviso-local]"), "Local salvo.", "ok");
  await carregarLocais(); carregarFuncionarios();
});

async function carregarAuditoria() {
  const a = (await api("/api/rh/auditoria")).auditoria || [];
  $("[data-lista-aud]").innerHTML = a.length ? `<table class="tabela-app"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th></tr></thead><tbody>${a.map((x) => `<tr><td>${quando(x.quando)}</td><td>${esc(x.quem)}</td><td><b>${esc(x.acao)}</b>${x.detalhe ? `<br><small>${esc(x.detalhe)}</small>` : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="vazio">Nada ainda.</p>`;
}

await carregarLocais();
await carregarFuncionarios();
