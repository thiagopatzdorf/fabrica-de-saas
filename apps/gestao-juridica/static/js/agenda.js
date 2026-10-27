import { del, get, patch, post, query } from './api.js';
import { acao, anexar, botao, brl, confirmar, dataLocal, estadoVazio, fmtData, fmtHora, formulario, h, isoDia, limpar, modal, opcoesUsuarios, selo, seloStatus, TIPOS_EVENTO, toast } from './ui.js';
import { ADVOGA, EDITA, carregarClientes, carregarUsuarios, estado } from './estado.js';
import { abrirPrazo } from './prazos.js';

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const soma = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const segunda = (d) => soma(d, -((d.getDay() + 6) % 7));

function titulo(visao, ref) {
  if (visao === 'dia') return ref.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (visao === 'mes') return ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const i = segunda(ref); const f = soma(i, 6);
  return `${i.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${f.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export async function render(raiz, params) {
  const [usuarios, clientes, processos] = await Promise.all([carregarUsuarios(), carregarClientes(), get('/api/processos?limite=500')]);
  const e = { visao: params.visao || 'mes', ref: params.data ? dataLocal(params.data) : new Date(), advogado_id: '', cliente_id: '', processo_id: '', tipos: '' };
  const corpo = h('div');
  const rotulo = h('h2', { 'aria-live': 'polite' });
  let itensAtuais = [];

  const carregar = async () => {
    rotulo.textContent = titulo(e.visao, e.ref);
    const r = await get(`/api/agenda${query({ visao: e.visao, data: isoDia(e.ref), advogado_id: e.advogado_id, cliente_id: e.cliente_id, processo_id: e.processo_id, tipos: e.tipos })}`);
    itensAtuais = r.itens;
    limpar(corpo).append(e.visao === 'mes' ? mes(r) : e.visao === 'semana' ? semana(r) : dia(r));
  };
  const irPara = (visao, ref) => { e.visao = visao; e.ref = ref; segmentos(); carregar().catch((x) => toast(x.message, 'erro')); };
  const abrirItem = (i) => (i.origem === 'prazo' ? abrirPrazo(i.id, carregar) : abrirEvento(i, carregar));

  const chip = (i, longo = false) => h('button', { type: 'button', class: `item-ag t-${i.tipo}${i.concluido ? ' concluido' : ''}${longo ? ' longo' : ''}`, title: `${TIPOS_EVENTO[i.tipo]} — ${i.titulo}`, onclick: () => abrirItem(i) },
    i.dia_inteiro ? null : `${fmtHora(i.inicio)} `, i.titulo, longo && i.cliente_nome ? h('div', { class: 'muted pequeno' }, i.cliente_nome) : null);
  const porDia = (r) => { const m = {}; for (const i of r.itens) (m[i.inicio.slice(0, 10)] ||= []).push(i); return m; };

  function mes(r) {
    const mapa = porDia(r); const primeiro = segunda(dataLocal(r.de)); const ultimo = soma(segunda(dataLocal(r.ate)), 6);
    const grade = h('div', { class: 'agenda-mes', role: 'grid' }, DIAS.map((d) => h('div', { class: 'cab', role: 'columnheader' }, d)));
    for (let d = primeiro; d <= ultimo; d = soma(d, 1)) {
      const iso = isoDia(d); const itens = mapa[iso] || [];
      grade.append(h('div', { class: `dia${d.getMonth() !== e.ref.getMonth() ? ' fora' : ''}${iso === isoDia(new Date()) ? ' hoje' : ''}`, role: 'gridcell' },
        h('button', { type: 'button', class: 'num link', 'aria-label': `Abrir dia ${fmtData(iso)}`, onclick: () => irPara('dia', d) }, d.getDate()),
        itens.slice(0, 3).map((i) => chip(i)),
        itens.length > 3 ? h('button', { type: 'button', class: 'link pequeno', onclick: () => irPara('dia', d) }, `+${itens.length - 3} mais`) : null));
    }
    return grade;
  }
  function semana(r) {
    const mapa = porDia(r); const ini = dataLocal(r.de);
    return h('div', { class: 'agenda-semana' }, DIAS.map((nome, k) => {
      const d = soma(ini, k); const iso = isoDia(d);
      return h('div', { class: `dia${iso === isoDia(new Date()) ? ' hoje' : ''}` }, h('button', { type: 'button', class: 'num link', onclick: () => irPara('dia', d) }, `${nome} ${d.getDate()}`),
        (mapa[iso] || []).map((i) => chip(i, true)));
    }));
  }
  function dia(r) {
    if (!r.itens.length) return estadoVazio('Nada agendado para este dia.');
    return h('div', { class: 'cartao' }, h('ul', { class: 'lista' }, r.itens.map((i) => h('li', { class: `t-${i.tipo}` },
      h('div', { class: 'linha' }, chip(i, true), selo(TIPOS_EVENTO[i.tipo])),
      h('div', { class: 'muted pequeno' }, [i.dia_inteiro ? 'dia inteiro' : `${fmtHora(i.inicio)}${i.fim ? ` – ${fmtHora(i.fim)}` : ''}`, i.cliente_nome, i.processo_numero, i.local, i.responsavel_nome && `resp.: ${i.responsavel_nome}`, i.valor_centavos != null && brl(i.valor_centavos)].filter(Boolean).join(' · '))))));
  }

  const botoesVisao = h('div', { class: 'barra', role: 'group', 'aria-label': 'Visão' });
  const segmentos = () => limpar(botoesVisao).append(...[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([v, r]) => {
    const b = botao(r, () => irPara(v, e.ref)); b.setAttribute('aria-pressed', String(e.visao === v)); if (e.visao === v) b.classList.add('primario'); return b;
  }));
  segmentos();
  const passo = (dir) => { const d = new Date(e.ref); if (e.visao === 'dia') d.setDate(d.getDate() + dir); else if (e.visao === 'semana') d.setDate(d.getDate() + 7 * dir); else { d.setDate(1); d.setMonth(d.getMonth() + dir); } irPara(e.visao, d); };
  const filtro = (nome, rotulo, opcoes) => h('select', { 'aria-label': rotulo, onchange: (ev) => { e[nome] = ev.target.value; carregar(); } }, [h('option', { value: '' }, rotulo), ...opcoes.map(([v, r]) => h('option', { value: v }, r))]);
  const legenda = h('div', { class: 'legenda' }, Object.entries(TIPOS_EVENTO).map(([t, r]) => h('span', { class: `t-${t}` }, h('i'), r)));

  limpar(raiz);
  anexar(raiz, [
    h('div', { class: 'cabecalho' }, h('h1', {}, 'Agenda'), h('div', { class: 'acoes' }, botao('Novo evento', () => novoEvento({}, carregar), 'primario'))),
    h('div', { class: 'barra' }, botao('‹', () => passo(-1)), botao('Hoje', () => irPara(e.visao, new Date())), botao('›', () => passo(1)), rotulo, botoesVisao),
    h('div', { class: 'barra' },
      filtro('advogado_id', 'Todos os advogados', usuarios.filter((u) => u.papel !== 'financeiro').map((u) => [u.id, u.nome])),
      filtro('cliente_id', 'Todos os clientes', clientes.map((c) => [c.id, c.nome])),
      filtro('processo_id', 'Todos os processos', processos.map((p) => [p.id, `${p.numero || `#${p.id}`} — ${p.cliente_nome}`])),
      filtro('tipos', 'Todos os tipos', Object.entries(TIPOS_EVENTO))),
    legenda, corpo]);
  await carregar();
}

// ---------- eventos ----------
const paraInput = (iso) => (iso && iso.length === 10 ? `${iso}T00:00` : iso || '');

export async function novoEvento({ processo_id = null, inicio = '' } = {}, depois = () => {}) {
  const [usuarios, processos] = await Promise.all([carregarUsuarios(), processo_id ? [] : get('/api/processos?limite=500')]);
  const fin = estado.eu.papel === 'financeiro';
  const tipos = Object.entries(TIPOS_EVENTO).filter(([t]) => t !== 'prazo' && (!fin || t === 'vencimento_financeiro'));
  const f = formulario([
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: tipos.map(([valor, rotulo]) => ({ valor, rotulo })) },
    { nome: 'titulo', rotulo: 'Título', obrigatorio: true },
    { nome: 'inicio', rotulo: 'Início', tipo: 'datetime-local', obrigatorio: true, padrao: inicio },
    { nome: 'fim', rotulo: 'Fim', tipo: 'datetime-local' },
    { nome: 'dia_inteiro', rotulo: 'Dia inteiro', tipo: 'checkbox' },
    { nome: 'valor_reais', rotulo: 'Valor (R$)', tipo: 'number', passo: '0.01', min: 0 },
    { nome: 'local', rotulo: 'Local' },
    { nome: 'responsavel_id', rotulo: 'Responsável', tipo: 'select', numero: true, padrao: estado.eu.id, opcoes: opcoesUsuarios(usuarios) },
    ...(processo_id ? [] : [{ nome: 'processo_id', rotulo: 'Processo (opcional)', tipo: 'select', numero: true, cheio: true,
      opcoes: [{ valor: '', rotulo: 'Sem processo' }, ...processos.map((p) => ({ valor: p.id, rotulo: `${p.numero || `#${p.id}`} — ${p.cliente_nome}` }))] }]),
    { nome: 'descricao', rotulo: 'Observações', tipo: 'textarea', linhas: 3, cheio: true },
  ], {}, { duas: true });
  const mostrarValor = () => { f.ctl.valor_reais.caixa.hidden = f.ctl.tipo.entrada.value !== 'vencimento_financeiro'; };
  f.ctl.tipo.entrada.addEventListener('change', mostrarValor); mostrarValor();
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const m = modal({ titulo: 'Novo evento', largo: true, corpo: [erro, f.el], acoes: [botao('Cancelar', () => m.fechar()), botao('Salvar', acao(async () => {
    if (!f.valido()) return;
    const v = f.ler();
    if (v.valor_reais != null) v.valor_centavos = Math.round(v.valor_reais * 100); delete v.valor_reais;
    if (processo_id) v.processo_id = processo_id;
    try { await post('/api/eventos', v); m.fechar(); toast('Evento criado.', 'ok'); depois(); } catch (x) { erro.textContent = x.message; erro.hidden = false; }
  }), 'primario')] });
}

function abrirEvento(i, depois) {
  const f = formulario([
    { nome: 'titulo', rotulo: 'Título', padrao: i.titulo, cheio: true },
    { nome: 'inicio', rotulo: 'Início', tipo: 'datetime-local', padrao: paraInput(i.inicio) }, { nome: 'fim', rotulo: 'Fim', tipo: 'datetime-local', padrao: paraInput(i.fim) },
    { nome: 'local', rotulo: 'Local', padrao: i.local }, { nome: 'concluido', rotulo: 'Concluído', tipo: 'checkbox', padrao: i.concluido },
  ], {}, { duas: true });
  const info = h('p', { class: 'muted' }, [TIPOS_EVENTO[i.tipo], i.cliente_nome, i.processo_numero, i.responsavel_nome && `resp.: ${i.responsavel_nome}`, i.valor_centavos != null && brl(i.valor_centavos)].filter(Boolean).join(' · '));
  const m = modal({ titulo: 'Evento', largo: true, corpo: [info, f.el], acoes: [
    botao('Excluir', acao(async () => { if (await confirmar('Excluir este evento?', 'Excluir')) { await del(`/api/eventos/${i.id}`); m.fechar(); depois(); } }), 'perigo'),
    botao('Fechar', () => m.fechar()),
    botao('Salvar', acao(async () => { await patch(`/api/eventos/${i.id}`, f.ler()); m.fechar(); toast('Evento atualizado.', 'ok'); depois(); }), 'primario')] });
}
