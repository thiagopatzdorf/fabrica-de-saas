import { api, get, post } from './api.js';
import { acao, botao, formulario, h, limpar, modal, toast, fmtDataHora } from './ui.js';
import { estado, EDITA, ADMIN } from './estado.js';

const PAGINAS = {
  painel: () => import('./painel.js'),
  processos: () => import('./processos.js'),
  prazos: () => import('./prazos.js'),
  agenda: () => import('./agenda.js'),
  documentos: () => import('./documentos.js'),
  publicacoes: () => import('./publicacoes.js'),
  clientes: () => import('./cadastros.js').then((m) => m.clientes),
  modelos: () => import('./cadastros.js').then((m) => m.modelos),
  config: () => import('./cadastros.js').then((m) => m.config),
};

const MENU = [
  ['painel', 'Painel', null], ['processos', 'Processos', null], ['prazos', 'Prazos', 'edita'], ['agenda', 'Agenda', null],
  ['documentos', 'Documentos', 'edita'], ['publicacoes', 'Publicações', 'edita'], ['clientes', 'Clientes', null],
  ['modelos', 'Modelos', 'edita'], ['config', 'Configurações', null],
];

const raiz = document.getElementById('raiz');

function rota() {
  const [caminho, qs = ''] = (location.hash.replace(/^#\/?/, '') || 'painel').split('?');
  return { partes: caminho.split('/').filter(Boolean), params: Object.fromEntries(new URLSearchParams(qs)) };
}

function telaLogin() {
  const f = formulario([
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true },
    { nome: 'senha', rotulo: 'Senha', tipo: 'password', obrigatorio: true },
  ]);
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const entrar = acao(async () => {
    if (!f.valido()) return;
    erro.hidden = true;
    try {
      await api('POST', '/api/login', f.ler(), { semLogin: true });
      await iniciar();
    } catch (e) { erro.textContent = e.message; erro.hidden = false; }
  });
  f.el.addEventListener('submit', entrar);
  limpar(raiz).append(h('div', { class: 'login' }, h('div', { class: 'cartao' },
    h('h1', {}, 'Gestão Jurídica'), h('p', { class: 'muted' }, 'Entre com o e-mail e a senha do escritório.'), erro, f.el,
    h('button', { class: 'primario', type: 'button', onclick: entrar }, 'Entrar'))));
  f.ctl.email.entrada.focus();
}

function logoSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('aria-hidden', 'true');
  const fundo = document.createElementNS(ns, 'rect');
  fundo.setAttribute('width', '32'); fundo.setAttribute('height', '32'); fundo.setAttribute('rx', '7'); fundo.setAttribute('fill', 'currentColor');
  const tr = document.createElementNS(ns, 'path');
  tr.setAttribute('d', 'M16 6v18M9 24h14M7 12h18M10 12l-3 7h6l-3-7zm12 0l-3 7h6l-3-7z');
  tr.setAttribute('stroke', 'var(--surface)'); tr.setAttribute('stroke-width', '1.8'); tr.setAttribute('fill', 'none');
  tr.setAttribute('stroke-linecap', 'round'); tr.setAttribute('stroke-linejoin', 'round');
  svg.append(fundo, tr);
  svg.style.color = 'var(--primary)';
  return svg;
}

async function abrirAlertas() {
  const lista = await get('/api/alertas');
  const corpo = lista.length ? h('ul', { class: 'lista' }, lista.map((a) => h('li', {},
    h('div', {}, a.mensagem), h('div', { class: 'linha' }, h('span', { class: 'muted pequeno' }, fmtDataHora(a.enviar_em)),
      botao('Marcar como lido', acao(async (ev) => { await post(`/api/alertas/${a.id}/lido`); ev.currentTarget.closest('li').remove(); atualizarSino(); }), 'link'))))) : h('p', { class: 'muted' }, 'Nenhum alerta novo.');
  modal({ titulo: 'Alertas', corpo });
}

async function atualizarSino() {
  const sino = document.getElementById('sino');
  if (!sino) return;
  try { const p = await get('/api/painel'); sino.textContent = `Alertas${p.alertas_nao_lidos ? ` (${p.alertas_nao_lidos})` : ''}`; } catch { /* sem painel não há contador */ }
}

async function desenhar() {
  const { partes, params } = rota();
  const atual = partes[0] || 'painel';
  const conteudo = document.getElementById('conteudo');
  if (!conteudo) return;
  document.querySelectorAll('.lateral a.item').forEach((a) => (a.getAttribute('href') === `#/${atual}` ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const carregar = PAGINAS[atual];
  limpar(conteudo);
  if (!carregar) { conteudo.append(h('p', {}, 'Página não encontrada.')); return; }
  try {
    const mod = await carregar();
    await mod.render(conteudo, params, partes.slice(1));
  } catch (e) {
    if (e.status === 401) return;
    limpar(conteudo).append(h('div', { class: 'erro' }, e.message || String(e)));
  }
  conteudo.focus({ preventScroll: true });
}

function casca() {
  const busca = h('input', { type: 'search', placeholder: 'Buscar processo por cliente, CPF/CNPJ, número ou assunto…', 'aria-label': 'Buscar processos' });
  limpar(raiz).append(h('div', { class: 'app' },
    h('aside', { class: 'lateral' },
      h('div', { class: 'marca' }, logoSvg(), 'Gestão Jurídica'),
      h('nav', { 'aria-label': 'Principal' }, MENU.filter(([, , req]) => !req || EDITA()).map(([id, nome]) => h('a', { class: 'item', href: `#/${id}` }, nome))),
      h('div', { class: 'rodape' }, h('div', {}, estado.eu.nome), h('div', {}, estado.eu.papel),
        botao('Sair', acao(async () => { await post('/api/logout'); location.hash = ''; location.reload(); })))),
    h('div', { class: 'principal' },
      h('div', { class: 'topo' },
        h('form', { onsubmit: (e) => { e.preventDefault(); location.hash = `#/processos?q=${encodeURIComponent(busca.value)}`; } }, busca),
        h('button', { id: 'sino', type: 'button', onclick: acao(abrirAlertas) }, 'Alertas')),
      h('main', { id: 'conteudo', class: 'conteudo', tabindex: -1 }))));
}

async function iniciar() {
  try { estado.eu = await api('GET', '/api/eu', undefined, { semLogin: true }); } catch { telaLogin(); return; }
  casca();
  atualizarSino();
  await desenhar();
}

window.addEventListener('hashchange', desenhar);
window.addEventListener('sessao-expirada', () => { if (estado.eu) { estado.eu = null; toast('Sua sessão expirou. Entre novamente.', 'erro'); telaLogin(); } });
iniciar();
