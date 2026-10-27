import { del, get, post, query } from './api.js';
import { acao, anexar, botao, estadoVazio, fmtData, formulario, h, limpar, modal, opcoesUsuarios, selo, toast } from './ui.js';
import { carregarUsuarios, estado } from './estado.js';

const STATUS = { nova: ['Nova', 'aviso'], vinculada: ['Vinculada', 'info'], tratada: ['Tratada', 'ok'], descartada: ['Descartada', ''] };

export async function render(raiz) {
  const f = { visao: 'pendentes' };
  const lista = h('div');
  const carregar = async () => {
    const todas = await get('/api/publicacoes');
    const dados = todas.filter((p) => (f.visao === 'pendentes' ? ['nova', 'vinculada'].includes(p.status) : f.visao === 'todas' ? true : p.status === f.visao));
    limpar(lista);
    if (!dados.length) { lista.append(estadoVazio(f.visao === 'pendentes' ? 'Nenhuma publicação para tratar. Use “Importar” para trazer intimações.' : 'Nada por aqui.')); return; }
    const procs = (await get('/api/processos?limite=500'));
    dados.forEach((p) => lista.append(cartao(p, procs, carregar)));
  };
  const chips = h('div', { class: 'barra', role: 'group' }, [['pendentes', 'Para tratar'], ['tratada', 'Tratadas'], ['descartada', 'Descartadas'], ['todas', 'Todas']].map(([v, r]) => {
    const b = botao(r, () => { f.visao = v; chips.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); carregar(); }); b.setAttribute('aria-pressed', String(v === f.visao)); return b;
  }));
  limpar(raiz).append(h('div', { class: 'cabecalho' }, h('h1', {}, 'Publicações e intimações'), h('div', { class: 'acoes' }, botao('Importar', () => importar(carregar), 'primario'))),
    h('p', { class: 'muted' }, 'O sistema reconhece o número do processo, sugere o prazo pela lei e espera a sua confirmação: nenhum prazo nasce sozinho.'), chips, lista);
  await carregar();
}

function cartao(p, procs, recarregar) {
  const [rot, tom] = STATUS[p.status];
  const sel = h('select', { 'aria-label': 'Vincular a processo' }, [h('option', { value: '' }, 'Vincular a um processo…'), ...procs.map((x) => h('option', { value: x.id }, `${x.numero || `#${x.id}`} — ${x.cliente_nome}`))]);
  return h('section', { class: 'cartao' },
    h('div', { class: 'linha' }, h('div', {}, h('strong', {}, p.fonte), ` · disponibilizada em ${fmtData(p.data_disponibilizacao)}`), selo(rot, tom)),
    h('p', { style: null, class: 'bloco-mem' }, p.texto),
    h('p', { class: 'muted' }, p.processo_id ? ['Processo: ', h('a', { class: 'mono', href: `#/processos/${p.processo_id}` }, p.processo_numero || `#${p.processo_id}`)] : (p.numero_encontrado ? `Número no texto (sem processo cadastrado): ${p.numero_encontrado}` : 'Nenhum número de processo reconhecido.')),
    !p.processo_id && p.status !== 'descartada' ? h('div', { class: 'barra' }, sel, botao('Vincular', acao(async () => { if (!sel.value) return toast('Escolha o processo.', 'erro'); await post(`/api/publicacoes/${p.id}/vincular`, { processo_id: Number(sel.value) }); recarregar(); }))) : null,
    p.processo_id && ['nova', 'vinculada'].includes(p.status) ? h('div', { class: 'barra' },
      p.sugestoes.map((s, i) => botao(`Criar prazo: ${s.nome} — ${s.dias} dias ${s.contagem === 'uteis' ? 'úteis' : 'corridos'}${s.origem === 'texto' ? ' (fixado no texto)' : ''}`, () => confirmarPrazo(p, i, s, recarregar), 'primario')),
      p.sugestoes.length ? null : botao('Criar prazo manualmente', () => confirmarPrazo(p, 0, { nome: '', dias: '', contagem: 'uteis', base_legal: '' }, recarregar))) : null,
    p.status !== 'descartada' && p.status !== 'tratada' ? h('div', { class: 'barra' }, botao('Descartar', acao(async () => { await post(`/api/publicacoes/${p.id}/descartar`); recarregar(); }), 'link')) : null);
}

async function confirmarPrazo(p, indice, s, depois) {
  const us = await carregarUsuarios();
  const f = formulario([
    { nome: 'descricao', rotulo: 'Descrição do prazo', padrao: s.nome, obrigatorio: true, cheio: true },
    { nome: 'dias', rotulo: 'Dias', tipo: 'number', min: 1, padrao: s.dias, obrigatorio: true },
    { nome: 'contagem', rotulo: 'Contagem', tipo: 'select', padrao: s.contagem, opcoes: [{ valor: 'uteis', rotulo: 'Dias úteis' }, { valor: 'corridos', rotulo: 'Dias corridos' }] },
    { nome: 'dobro', rotulo: 'Em dobro (Fazenda, MP, Defensoria)', tipo: 'checkbox' },
    { nome: 'responsavel_id', rotulo: 'Responsável', tipo: 'select', numero: true, padrao: estado.eu.id, opcoes: opcoesUsuarios(us) },
    { nome: 'revisor_id', rotulo: 'Revisor', tipo: 'select', numero: true, opcoes: opcoesUsuarios(us, { vazio: 'Sem revisor' }) },
  ], {}, { duas: true });
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const m = modal({ titulo: 'Confirmar prazo', corpo: [h('p', { class: 'muted' }, s.base_legal ? `Base legal: ${s.base_legal}. Confira antes de salvar: a data é calculada a partir da disponibilização (${fmtData(p.data_disponibilizacao)}).` : 'Confira os dados antes de salvar.'), erro, f.el],
    acoes: [botao('Cancelar', () => m.fechar()), botao('Criar prazo', acao(async () => {
      if (!f.valido()) return;
      try { const r = await post(`/api/publicacoes/${p.id}/criar-prazo`, { sugestao: indice, ...f.ler() }); m.fechar(); toast('Prazo criado.', 'ok'); depois(); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    }), 'primario')] });
}

function importar(depois) {
  const f = formulario([
    { nome: 'fonte', rotulo: 'Fonte', tipo: 'select', opcoes: ['DJE', 'DJEN', 'PJe', 'DOU', 'E-mail', 'Manual'] },
    { nome: 'data_disponibilizacao', rotulo: 'Data de disponibilização', tipo: 'date', obrigatorio: true, padrao: new Date().toISOString().slice(0, 10) },
    { nome: 'texto', rotulo: 'Texto da publicação', tipo: 'textarea', linhas: 8, cheio: true, obrigatorio: true, ajuda: 'Cole o texto completo, com o número do processo.' },
  ], {}, { duas: true });
  const arquivo = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Importar arquivo JSON' });
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const mostrar = (r) => toast(`${r.novas} nova(s), ${r.vinculadas} vinculada(s) a processo, ${r.repetidas} repetida(s).`, 'ok');
  const m = modal({ titulo: 'Importar publicações', largo: true, corpo: [erro, f.el, h('div', { class: 'campo' }, h('label', {}, 'Ou envie um arquivo JSON com várias publicações'), arquivo, h('div', { class: 'ajuda' }, 'Lista de objetos: {"fonte","data_disponibilizacao","texto"}.'))],
    acoes: [botao('Cancelar', () => m.fechar()), botao('Importar', acao(async () => {
      erro.hidden = true;
      try {
        if (arquivo.files[0]) mostrar(await post('/api/publicacoes/importar', JSON.parse(await arquivo.files[0].text())));
        else { if (!f.valido()) return; mostrar(await post('/api/publicacoes/importar', [f.ler()])); }
        m.fechar(); depois();
      } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    }), 'primario')] });
}
