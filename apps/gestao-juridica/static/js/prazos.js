import { del, get, patch, post, query } from './api.js';
import { acao, anexar, botao, dataLocal, estadoVazio, fmtData, fmtDataHora, formulario, h, limpar, modal, seloPrazo, seloStatus, tabela, toast, debounce, opcoesUsuarios, confirmar } from './ui.js';
import { carregarUsuarios, estado, ADVOGA, EDITA, ADMIN } from './estado.js';

const diaSemana = (iso) => dataLocal(iso).toLocaleDateString('pt-BR', { weekday: 'long' });

export async function novoPrazo({ processo_id = null, padrao = {} } = {}, aoSalvar = () => {}) {
  const [usuarios, catalogo, processos] = await Promise.all([carregarUsuarios(), get('/api/prazos/modelos'), processo_id ? [] : get('/api/processos?limite=500')]);
  const campos = [
    ...(processo_id ? [] : [{ nome: 'processo_id', rotulo: 'Processo', tipo: 'select', numero: true, obrigatorio: true, cheio: true,
      opcoes: [{ valor: '', rotulo: 'Escolha…' }, ...processos.map((p) => ({ valor: p.id, rotulo: `${p.numero || 'sem número'} — ${p.cliente_nome}` }))] }]),
    { nome: 'catalogo', rotulo: 'Tipo de prazo (preenche dias e base legal)', tipo: 'select', cheio: true,
      opcoes: [{ valor: '', rotulo: 'Outro / informar manualmente' }, ...catalogo.map((c) => ({ valor: c.chave, rotulo: `${c.nome} — ${c.dias} dias ${c.contagem === 'uteis' ? 'úteis' : 'corridos'}` }))] },
    { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, cheio: true, padrao: padrao.descricao },
    { nome: 'evento', rotulo: 'Como o prazo começa', tipo: 'select', padrao: padrao.evento || 'disponibilizacao_dje',
      opcoes: [{ valor: 'disponibilizacao_dje', rotulo: 'Disponibilização no DJe' }, { valor: 'ciencia', rotulo: 'Ciência / intimação pessoal ou eletrônica' }, { valor: 'manual', rotulo: 'Informar a data fatal' }] },
    { nome: 'data_evento', rotulo: 'Data do evento', tipo: 'date', padrao: padrao.data_evento },
    { nome: 'dias', rotulo: 'Dias', tipo: 'number', min: 1, padrao: padrao.dias },
    { nome: 'contagem', rotulo: 'Contagem', tipo: 'select', padrao: padrao.contagem || 'uteis', opcoes: [{ valor: 'uteis', rotulo: 'Dias úteis' }, { valor: 'corridos', rotulo: 'Dias corridos' }] },
    { nome: 'data_fatal', rotulo: 'Data fatal', tipo: 'date' },
    { nome: 'dobro', rotulo: 'Prazo em dobro (Fazenda, MP, Defensoria)', tipo: 'checkbox' },
    { nome: 'suspender_recesso', rotulo: 'Suspender no recesso forense (20/12 a 20/01)', tipo: 'checkbox', padrao: true },
    { nome: 'responsavel_id', rotulo: 'Responsável', tipo: 'select', numero: true, padrao: estado.eu.id, opcoes: opcoesUsuarios(usuarios) },
    { nome: 'revisor_id', rotulo: 'Revisor / conferente', tipo: 'select', numero: true, opcoes: opcoesUsuarios(usuarios, { vazio: 'Sem revisor' }) },
    { nome: 'margem_dias', rotulo: 'Margem interna (dias úteis antes)', tipo: 'number', min: 0, padrao: 2, ajuda: 'O "fatal interno" lembra o time antes do vencimento.' },
    { nome: 'base_legal', rotulo: 'Base legal', cheio: true, padrao: padrao.base_legal },
  ];
  const f = formulario(campos, {}, { duas: true });
  const previa = h('div', { class: 'previa', hidden: true, 'aria-live': 'polite' });
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const C = f.ctl;
  const atualizarVisibilidade = () => {
    const manual = C.evento.entrada.value === 'manual';
    for (const n of ['data_evento', 'dias', 'contagem', 'dobro', 'suspender_recesso', 'margem_dias']) C[n].caixa.hidden = manual;
    C.data_fatal.caixa.hidden = !manual;
  };
  const recalcular = debounce(async () => {
    const v = f.ler();
    if (v.evento === 'manual' || !v.data_evento || !v.dias) { previa.hidden = true; return; }
    try {
      const r = await post('/api/prazos/calcular', { data_evento: v.data_evento, dias: v.dias, evento: v.evento, contagem: v.contagem, dobro: !!v.dobro,
        suspender_recesso: !!v.suspender_recesso, margem_dias: v.margem_dias ?? 2, processo_id: processo_id || v.processo_id || null });
      limpar(previa).append(h('strong', {}, `Data fatal: ${fmtData(r.data_fatal)} (${diaSemana(r.data_fatal)})`), h('div', { class: 'muted' }, `Fatal interno: ${fmtData(r.data_interna)}`),
        h('div', { class: 'bloco-mem pequeno' }, r.memoria.join('\n')));
      previa.hidden = false;
    } catch (e) { limpar(previa).append(e.message); previa.hidden = false; }
  }, 250);
  f.el.addEventListener('input', () => { atualizarVisibilidade(); recalcular(); });
  f.el.addEventListener('change', () => { atualizarVisibilidade(); recalcular(); });
  C.catalogo.entrada.addEventListener('change', () => {
    const c = catalogo.find((x) => x.chave === C.catalogo.entrada.value);
    if (!c) return;
    if (!C.descricao.entrada.value) C.descricao.entrada.value = c.nome;
    C.dias.entrada.value = c.dias; C.contagem.entrada.value = c.contagem; C.base_legal.entrada.value = c.base_legal;
    recalcular();
  });
  atualizarVisibilidade();
  recalcular();
  const m = modal({
    titulo: 'Novo prazo', largo: true, corpo: [erro, previa, f.el],
    acoes: [botao('Cancelar', () => m.fechar()), botao('Salvar prazo', acao(async () => {
      if (!f.valido()) return;
      erro.hidden = true;
      const v = f.ler(); delete v.catalogo;
      if (processo_id) v.processo_id = processo_id;
      try { const novo = await post('/api/prazos', v); m.fechar(); toast('Prazo cadastrado.', 'ok'); aoSalvar(novo); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    }), 'primario')],
  });
}

export async function abrirPrazo(id, aoMudar = () => {}) {
  const p = await get(`/api/prazos/${id}`);
  const eu = estado.eu;
  const sou = (uid) => uid === eu.id;
  const aberto = ['pendente', 'em_andamento', 'em_revisao'].includes(p.status);
  const m = modal({ titulo: p.descricao, largo: true, corpo: '', acoes: [] });
  const recarregar = () => { m.fechar(); aoMudar(); abrirPrazo(id, aoMudar); };
  const mudar = (status, texto) => botao(texto, acao(async () => { await post(`/api/prazos/${id}/status`, { status }); toast('Status atualizado.', 'ok'); recarregar(); }), status === 'concluido' ? 'primario' : '');
  const botoes = [];
  if (p.status === 'em_revisao') {
    if (ADMIN() || sou(p.revisor_id)) botoes.push(mudar('concluido', 'Aprovar e concluir'), mudar('em_andamento', 'Devolver para ajuste'));
  } else if (aberto) {
    if (p.status === 'pendente') botoes.push(mudar('em_andamento', 'Iniciar'));
    botoes.push(mudar('concluido', p.revisor_id && !(ADMIN() || sou(p.revisor_id)) ? 'Cumprido (enviar para revisão)' : 'Marcar como cumprido'));
  } else if (p.status === 'perdido') botoes.push(mudar('concluido', 'Cumprido em atraso'));
  else if (ADMIN()) botoes.push(mudar('pendente', 'Reabrir'));
  if ((aberto || p.status === 'perdido') && ADVOGA()) botoes.push(botao('Cancelar prazo', acao(async () => { if (await confirmar('Cancelar este prazo?', 'Cancelar prazo')) { await post(`/api/prazos/${id}/status`, { status: 'cancelado' }); recarregar(); } }), 'perigo'));
  if (aberto && eu.papel !== 'estagiario') botoes.push(botao('Alterar data fatal', () => alterarData(p, recarregar)));
  if (aberto) botoes.push(botao('Responsável / revisor', () => alterarPessoas(p, recarregar)));
  const corpo = [
    h('div', { class: 'linha' }, seloPrazo(p), seloStatus(p.status)),
    h('dl', { class: 'dl' },
      h('dt', {}, 'Processo'), h('dd', {}, h('a', { href: `#/processos/${p.processo_id}`, onclick: () => m.fechar() }, p.processo_numero || `#${p.processo_id}`), ` · ${p.cliente_nome}`),
      h('dt', {}, 'Data fatal'), h('dd', {}, h('strong', {}, `${fmtData(p.data_fatal)} (${diaSemana(p.data_fatal)})`)),
      h('dt', {}, 'Fatal interno'), h('dd', {}, fmtData(p.data_interna)),
      h('dt', {}, 'Responsável'), h('dd', {}, p.responsavel_nome || '—'),
      h('dt', {}, 'Revisor'), h('dd', {}, p.revisor_nome || '—'),
      h('dt', {}, 'Base legal'), h('dd', {}, p.base_legal || '—')),
    p.memoria_calculo ? [h('h3', {}, 'Memória de cálculo'), h('div', { class: 'bloco-mem' }, p.memoria_calculo)] : null,
    h('h3', {}, 'Histórico'),
    tabela([{ titulo: 'Quando', celula: (x) => fmtDataHora(x.em) }, { titulo: 'Quem', celula: (x) => x.usuario },
      { titulo: 'O quê', celula: (x) => x.acao + (x.campo ? ` — ${x.campo}: ${x.de ?? '∅'} → ${x.para ?? '∅'}` : '') }], p.historico),
  ];
  anexar(limpar(m.el.querySelector('.corpo')), corpo);
  const rodape = h('footer', {}, botoes);
  m.el.append(rodape);
  return m;
}

function alterarData(p, depois) {
  const f = formulario([{ nome: 'data_fatal', rotulo: 'Nova data fatal', tipo: 'date', obrigatorio: true, padrao: p.data_fatal },
    { nome: 'motivo', rotulo: 'Motivo (fica no histórico)', obrigatorio: true, ajuda: 'Ex.: suspensão por decisão, feriado local, erro no cálculo.' }]);
  const m = modal({ titulo: 'Alterar data fatal', corpo: f.el, acoes: [botao('Cancelar', () => m.fechar()), botao('Salvar', acao(async () => {
    if (!f.valido()) return; await patch(`/api/prazos/${p.id}`, f.ler()); m.fechar(); depois();
  }), 'primario')] });
}

async function alterarPessoas(p, depois) {
  const us = await carregarUsuarios();
  const f = formulario([{ nome: 'responsavel_id', rotulo: 'Responsável', tipo: 'select', numero: true, padrao: p.responsavel_id, opcoes: opcoesUsuarios(us) },
    { nome: 'revisor_id', rotulo: 'Revisor', tipo: 'select', numero: true, padrao: p.revisor_id, opcoes: opcoesUsuarios(us, { vazio: 'Sem revisor' }) }]);
  const m = modal({ titulo: 'Responsável e revisor', corpo: f.el, acoes: [botao('Cancelar', () => m.fechar()), botao('Salvar', acao(async () => {
    const v = f.ler(); await patch(`/api/prazos/${p.id}`, { responsavel_id: v.responsavel_id, revisor_id: v.revisor_id ?? null }); m.fechar(); depois();
  }), 'primario')] });
}

export function tabelaPrazos(prazos, aoMudar, { mostrarProcesso = true } = {}) {
  const cols = [
    { titulo: 'Data fatal', classe: 'nowrap', celula: (p) => h('strong', {}, fmtData(p.data_fatal)) },
    { titulo: 'Situação', classe: 'nowrap', celula: (p) => seloPrazo(p) },
    { titulo: 'Prazo', celula: (p) => p.descricao },
    ...(mostrarProcesso ? [{ titulo: 'Processo', celula: (p) => h('div', {}, h('div', { class: 'mono' }, p.processo_numero || `#${p.processo_id}`), h('div', { class: 'muted pequeno' }, p.cliente_nome)) }] : []),
    { titulo: 'Responsável', celula: (p) => p.responsavel_nome || '—' },
    { titulo: 'Revisor', celula: (p) => p.revisor_nome || '—' },
    { titulo: 'Status', celula: (p) => seloStatus(p.status) },
  ];
  return tabela(cols, prazos, { aoClicar: (p) => abrirPrazo(p.id, aoMudar).catch((e) => toast(e.message, 'erro')), vazio: 'Nenhum prazo encontrado.' });
}

export async function render(raiz, params) {
  const us = await carregarUsuarios();
  const filtros = { visao: params.visao || 'abertos', responsavel_id: params.responsavel_id || '', q: params.q || '' };
  const lista = h('div');
  const carregar = async () => {
    const q = { q: filtros.q, responsavel_id: filtros.responsavel_id };
    if (filtros.visao === 'abertos') q.abertos = true;
    if (filtros.visao === 'perdidos') q.status = 'perdido';
    if (filtros.visao === 'concluidos') q.status = 'concluido';
    limpar(lista).append(tabelaPrazos(await get(`/api/prazos${query(q)}`), carregar));
  };
  const chips = h('div', { class: 'barra' }, [['abertos', 'Em aberto'], ['perdidos', 'Perdidos'], ['concluidos', 'Concluídos'], ['todos', 'Todos']].map(([v, r]) =>
    botao(r, () => { filtros.visao = v; chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); carregar(); }, '')));
  chips.querySelectorAll('button').forEach((b, i) => { b.dataset.v = ['abertos', 'perdidos', 'concluidos', 'todos'][i]; b.setAttribute('aria-pressed', String(b.dataset.v === filtros.visao)); });
  const resp = h('select', { 'aria-label': 'Responsável', onchange: (e) => { filtros.responsavel_id = e.target.value; carregar(); } },
    [h('option', { value: '' }, 'Todos os responsáveis'), ...us.map((u) => h('option', { value: u.id, selected: String(u.id) === String(filtros.responsavel_id) }, u.nome))]);
  const busca = h('input', { type: 'search', placeholder: 'Buscar prazo, processo ou cliente…', value: filtros.q, oninput: debounce((e) => { filtros.q = e.target.value; carregar(); }) });
  limpar(raiz).append(
    h('div', { class: 'cabecalho' }, h('h1', {}, 'Prazos'), h('div', { class: 'acoes' }, EDITA() ? botao('Novo prazo', () => novoPrazo({}, carregar).catch((e) => toast(e.message, 'erro')), 'primario') : null)),
    chips, h('div', { class: 'barra' }, busca, resp), lista);
  await carregar();
}
