import { del, get, patch, post, put, query } from './api.js';
import { acao, anexar, botao, brl, confirmar, debounce, estadoVazio, fmtData, fmtDataHora, formulario, h, limpar, modal, opcoesUsuarios, selo, tabela, toast } from './ui.js';
import { ADVOGA, EDITA, carregarClientes, carregarUsuarios, estado } from './estado.js';
import { novoPrazo, tabelaPrazos } from './prazos.js';

const TIPOS = { judicial: 'Judicial', administrativo: 'Administrativo', extrajudicial: 'Extrajudicial' };
const POLOS = { ativo: 'Polo ativo', passivo: 'Polo passivo', terceiro: 'Terceiro' };
const STATUS = { ativo: ['Ativo', 'ok'], suspenso: ['Suspenso', 'aviso'], arquivado: ['Arquivado', ''], encerrado: ['Encerrado', ''] };
const seloStatusProc = (s) => selo(...(STATUS[s] || [s, '']));
const centavos = (reais) => (reais == null || reais === '' ? undefined : Math.round(Number(reais) * 100));

// ---------- lista ----------
export async function render(raiz, params, partes) {
  if (partes[0]) return detalhe(raiz, Number(partes[0]), params);
  const fases = await get('/api/processos/fases');
  const f = { q: params.q || '', status: params.status || 'ativo', tipo: params.tipo || '', fase: params.fase || '' };
  const lista = h('div');
  const carregar = async () => {
    const dados = await get(`/api/processos${query(f)}`);
    limpar(lista).append(tabela([
      { titulo: 'Número', celula: (p) => h('div', {}, h('div', { class: 'mono' }, p.numero || 'sem número'), p.tribunal ? selo(p.tribunal, 'info') : null) },
      { titulo: 'Cliente', celula: (p) => p.cliente_nome },
      { titulo: 'Assunto', celula: (p) => h('div', {}, h('div', {}, p.assunto || '—'), h('div', { class: 'muted pequeno' }, [TIPOS[p.tipo], p.classe].filter(Boolean).join(' · '))) },
      { titulo: 'Fase', celula: (p) => p.fase },
      { titulo: 'Próx. prazo', classe: 'nowrap', celula: (p) => (p.proximo_prazo ? fmtData(p.proximo_prazo) : '—') },
      { titulo: 'Responsável', celula: (p) => p.responsaveis.map((r) => r.nome).join(', ') || '—' },
      { titulo: 'Status', celula: (p) => seloStatusProc(p.status) },
    ], dados, { aoClicar: (p) => { location.hash = `#/processos/${p.id}`; }, vazio: f.q ? 'Nenhum processo encontrado para essa busca.' : 'Nenhum processo cadastrado ainda.' }));
  };
  const seletor = (nome, rotulo, opcoes) => h('select', { 'aria-label': rotulo, onchange: (e) => { f[nome] = e.target.value; carregar(); } },
    [h('option', { value: '' }, rotulo), ...opcoes.map(([v, r]) => h('option', { value: v, selected: f[nome] === v }, r))]);
  const busca = h('input', { type: 'search', value: f.q, placeholder: 'Cliente, CPF/CNPJ, número do processo, parte ou assunto', 'aria-label': 'Buscar', oninput: debounce((e) => { f.q = e.target.value; carregar(); }) });
  limpar(raiz).append(
    h('div', { class: 'cabecalho' }, h('h1', {}, 'Processos'), h('div', { class: 'acoes' }, EDITA() ? botao('Novo processo', () => novoProcesso().catch((e) => toast(e.message, 'erro')), 'primario') : null)),
    h('div', { class: 'barra' }, busca,
      seletor('status', 'Todos os status', Object.entries(STATUS).map(([v, [r]]) => [v, r])),
      seletor('tipo', 'Todos os tipos', Object.entries(TIPOS)),
      seletor('fase', 'Todas as fases', [...new Set(Object.values(fases).flat())].map((x) => [x, x]))),
    lista);
  busca.focus();
  await carregar();
}

// ---------- cadastro ----------
export async function novoProcesso({ cliente_id = null } = {}) {
  const [clientes, usuarios, fases] = await Promise.all([carregarClientes(), carregarUsuarios(), get('/api/processos/fases')]);
  const campos = [
    { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', numero: true, obrigatorio: true, padrao: cliente_id,
      opcoes: [{ valor: '', rotulo: 'Escolha…' }, ...clientes.map((c) => ({ valor: c.id, rotulo: `${c.nome}${c.documento ? ` — ${c.documento}` : ''}` }))],
      ajuda: 'Cliente novo? Cadastre em Clientes antes.' },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Object.entries(TIPOS).map(([valor, rotulo]) => ({ valor, rotulo })) },
    { nome: 'numero', rotulo: 'Número do processo', dica: '0000000-00.0000.0.00.0000', ajuda: 'Judicial: número CNJ, validado pelo dígito verificador.' },
    { nome: 'numero_legado', rotulo: 'Numeração antiga (fora do padrão CNJ)', tipo: 'checkbox' },
    { nome: 'fase', rotulo: 'Fase', tipo: 'select', opcoes: fases.judicial },
    { nome: 'polo_cliente', rotulo: 'Cliente está no', tipo: 'select', opcoes: Object.entries(POLOS).map(([valor, rotulo]) => ({ valor, rotulo })) },
    { nome: 'vara', rotulo: 'Vara / órgão' }, { nome: 'comarca', rotulo: 'Comarca' },
    { nome: 'classe', rotulo: 'Classe' }, { nome: 'assunto', rotulo: 'Assunto' },
    { nome: 'valor_reais', rotulo: 'Valor da causa (R$)', tipo: 'number', passo: '0.01', min: 0 },
    { nome: 'data_distribuicao', rotulo: 'Data de distribuição', tipo: 'date' },
    { nome: 'responsaveis', rotulo: 'Responsáveis (o primeiro é o principal)', tipo: 'multi', opcoes: opcoesUsuarios(usuarios), padrao: [estado.eu.id], cheio: true, ajuda: 'Ctrl/Cmd para escolher mais de um.' },
    { nome: 'restrito', rotulo: 'Processo restrito (só responsáveis e administradores veem)', tipo: 'checkbox', cheio: true },
    { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', cheio: true, linhas: 3 },
  ];
  const f = formulario(campos, {}, { duas: true });
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  f.ctl.tipo.entrada.addEventListener('change', () => {
    const sel = f.ctl.fase.entrada; limpar(sel).append(...fases[f.ctl.tipo.entrada.value].map((x) => h('option', { value: x }, x)));
  });
  const m = modal({ titulo: 'Novo processo', largo: true, corpo: [erro, f.el], acoes: [botao('Cancelar', () => m.fechar()), botao('Cadastrar', acao(async () => {
    if (!f.valido()) return;
    const v = f.ler(); v.valor_causa_centavos = centavos(v.valor_reais); delete v.valor_reais;
    try { const p = await post('/api/processos', v); m.fechar(); toast('Processo cadastrado.', 'ok'); location.hash = `#/processos/${p.id}`; } catch (e) { erro.textContent = e.message; erro.hidden = false; }
  }), 'primario')] });
}

// ---------- detalhe ----------
async function detalhe(raiz, id, params) {
  const p = await get(`/api/processos/${id}`);
  const abas = [['resumo', 'Resumo'], ['andamentos', 'Andamentos'], ['prazos', 'Prazos'], ['documentos', 'Documentos', EDITA], ['partes', 'Partes e vínculos'], ['historico', 'Histórico', ADVOGA]]
    .filter(([, , ok]) => !ok || ok());
  const painel = h('div', { role: 'tabpanel' });
  const barra = h('div', { class: 'abas', role: 'tablist' });
  let atual = params.aba || 'resumo';
  const abrir = async (aba) => {
    atual = aba;
    barra.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
    limpar(painel);
    try { await ABAS[aba](painel, p, () => detalhe(raiz, id, { aba })); } catch (e) { limpar(painel).append(h('div', { class: 'erro' }, e.message)); }
  };
  abas.forEach(([a, r]) => barra.append(h('button', { type: 'button', role: 'tab', dataset: { aba: a }, onclick: () => abrir(a) }, r)));
  limpar(raiz).append(
    h('div', { class: 'cabecalho' },
      h('div', {}, h('div', { class: 'muted pequeno' }, h('a', { href: '#/processos' }, '← Processos')),
        h('h1', { class: 'mono' }, p.numero || `Processo #${p.id}`),
        h('div', { class: 'muted' }, h('a', { href: `#/clientes/${p.cliente.id}` }, p.cliente.nome), ` · ${p.assunto || TIPOS[p.tipo]}`)),
      h('div', { class: 'acoes' }, p.tribunal ? selo(p.tribunal, 'info') : null, selo(TIPOS[p.tipo]), seloStatusProc(p.status), p.restrito ? selo('Restrito', 'aviso') : null)),
    barra, painel);
  await abrir(abas.some(([a]) => a === atual) ? atual : 'resumo');
}

const ABAS = {
  async resumo(c, p, recarregar) {
    const linha = (rot, val) => [h('dt', {}, rot), h('dd', {}, val ?? '—')];
    anexar(c, [
      h('div', { class: 'grade' },
        h('section', { class: 'cartao' }, h('div', { class: 'linha' }, h('h2', {}, 'Dados do processo'), EDITA() ? botao('Editar', () => editarProcesso(p, recarregar)) : null),
          h('dl', { class: 'dl' }, linha('Tipo', TIPOS[p.tipo]), linha('Número', p.numero), linha('Tribunal', p.tribunal), linha('Vara / órgão', p.vara), linha('Comarca', [p.comarca, p.uf].filter(Boolean).join('/') || null),
            linha('Classe', p.classe), linha('Assunto', p.assunto), linha('Cliente é', POLOS[p.polo_cliente]), linha('Fase', p.fase), linha('Valor da causa', brl(p.valor_causa_centavos)),
            linha('Distribuição', fmtData(p.data_distribuicao)), linha('Próximo prazo', p.proximo_prazo ? fmtData(p.proximo_prazo) : null), linha('Observações', p.observacoes))),
        h('section', { class: 'cartao' }, h('div', { class: 'linha' }, h('h2', {}, 'Responsáveis'), ADVOGA() ? botao('Alterar', () => editarResponsaveis(p, recarregar)) : null),
          p.responsaveis.length ? h('ul', { class: 'lista' }, p.responsaveis.map((r) => h('li', {}, h('strong', {}, r.nome), ' ', selo(r.papel === 'responsavel' ? 'Principal' : 'Colaborador')))) : estadoVazio('Sem responsável definido.'),
          h('h3', {}, 'Fases'), h('ul', { class: 'lista' }, p.fases_historico.map((x) => h('li', {}, h('strong', {}, x.fase), h('span', { class: 'muted' }, ` — desde ${fmtData(x.desde)}`)))))),
    ]);
  },

  async andamentos(c, p, recarregar) {
    const lista = h('div');
    const carregar = async () => {
      const movs = await get(`/api/processos/${p.id}/movimentacoes`);
      limpar(lista).append(tabela([{ titulo: 'Data', classe: 'nowrap', celula: (m) => fmtData(m.data) }, { titulo: 'Andamento', celula: (m) => m.descricao },
        { titulo: 'Origem', celula: (m) => selo({ manual: 'Manual', automatica: 'Automático', publicacao: 'Publicação' }[m.origem], m.origem === 'manual' ? '' : 'info') }], movs, { vazio: 'Nenhum andamento registrado.' }));
    };
    const f = formulario([{ nome: 'data', rotulo: 'Data', tipo: 'date', obrigatorio: true, padrao: new Date().toISOString().slice(0, 10) }, { nome: 'descricao', rotulo: 'Andamento', obrigatorio: true }]);
    f.el.classList.add('barra');
    anexar(c, [h('div', { class: 'cartao' },
      EDITA() ? [f.el, h('div', { class: 'barra' },
        botao('Registrar andamento', acao(async () => { if (!f.valido()) return; await post(`/api/processos/${p.id}/movimentacoes`, f.ler()); toast('Andamento registrado.', 'ok'); f.ctl.descricao.entrada.value = ''; carregar(); }), 'primario'),
        p.tipo === 'judicial' && p.numero && !p.numero_legado ? botao('Atualizar pelo DataJud', acao(async () => {
          const r = await post(`/api/processos/${p.id}/consultar-datajud`); toast(`${r.inseridos} andamento(s) novo(s) de ${r.total_no_tribunal} no tribunal.`, 'ok'); carregar();
        })) : null)] : null,
      lista)]);
    await carregar();
  },

  async prazos(c, p, recarregar) {
    const lista = h('div');
    const carregar = async () => limpar(lista).append(tabelaPrazos(await get(`/api/prazos${query({ processo_id: p.id })}`), carregar, { mostrarProcesso: false }));
    anexar(c, [h('div', { class: 'cartao' }, EDITA() ? h('div', { class: 'barra' }, botao('Novo prazo', () => novoPrazo({ processo_id: p.id }, carregar).catch((e) => toast(e.message, 'erro')), 'primario')) : null, lista)]);
    await carregar();
  },

  async documentos(c, p) {
    const { painelDocumentos } = await import('./documentos.js');
    await painelDocumentos(c, p);
  },

  async partes(c, p, recarregar) {
    const outros = (await get('/api/processos?limite=500')).filter((x) => x.id !== p.id);
    anexar(c, [
      h('section', { class: 'cartao' }, h('div', { class: 'linha' }, h('h2', {}, 'Partes, advogados e outros'), EDITA() ? botao('Adicionar', () => novaParte(p, recarregar), 'primario') : null),
        tabela([{ titulo: 'Nome', celula: (x) => x.nome }, { titulo: 'Documento', celula: (x) => x.documento || '—' }, { titulo: 'Polo', celula: (x) => POLOS[x.polo] },
          { titulo: 'Papel', celula: (x) => x.papel + (x.oab ? ` · OAB ${x.oab}` : '') },
          { titulo: '', celula: (x) => (EDITA() ? botao('Remover', acao(async () => { if (await confirmar(`Remover ${x.nome}?`)) { await del(`/api/processos/${p.id}/partes/${x.id}`); recarregar(); } }), 'link') : '') }], p.partes, { vazio: 'Nenhuma parte cadastrada.' })),
      h('section', { class: 'cartao' }, h('div', { class: 'linha' }, h('h2', {}, 'Processos relacionados'), EDITA() ? botao('Vincular processo', () => novoVinculo(p, outros, recarregar)) : null),
        p.vinculos.length ? h('ul', { class: 'lista' }, p.vinculos.map((v) => h('li', { class: 'linha' },
          h('span', {}, selo(v.tipo), ' ', h('a', { class: 'mono', href: `#/processos/${v.outro.id}` }, v.outro.numero || `#${v.outro.id}`), h('span', { class: 'muted' }, ` · ${v.outro.fase}`), v.observacao ? h('div', { class: 'muted pequeno' }, v.observacao) : null),
          EDITA() ? botao('Desvincular', acao(async () => { await del(`/api/vinculos/${v.id}`); recarregar(); }), 'link') : null))) : estadoVazio('Nenhum vínculo (apenso, recurso, execução, conexão…).')),
    ]);
  },

  async historico(c, p) {
    const h_ = await get(`/api/auditoria?entidade=processo&entidade_id=${p.id}`);
    anexar(c, [h('div', { class: 'cartao' }, tabela([{ titulo: 'Quando', classe: 'nowrap', celula: (x) => fmtDataHora(x.em) }, { titulo: 'Quem', celula: (x) => x.usuario },
      { titulo: 'O quê', celula: (x) => x.acao + (x.detalhes ? ` — ${x.detalhes}` : '') }], h_, { vazio: 'Sem registros.' }))]);
  },
};

// ---------- modais ----------
async function editarProcesso(p, depois) {
  const fases = await get('/api/processos/fases');
  const f = formulario([
    { nome: 'fase', rotulo: 'Fase', tipo: 'select', padrao: p.fase, opcoes: fases[p.tipo] },
    { nome: 'status', rotulo: 'Status', tipo: 'select', padrao: p.status, opcoes: Object.entries(STATUS).map(([valor, [rotulo]]) => ({ valor, rotulo })) },
    { nome: 'tribunal', rotulo: 'Tribunal', padrao: p.tribunal }, { nome: 'vara', rotulo: 'Vara / órgão', padrao: p.vara },
    { nome: 'comarca', rotulo: 'Comarca', padrao: p.comarca }, { nome: 'classe', rotulo: 'Classe', padrao: p.classe },
    { nome: 'assunto', rotulo: 'Assunto', padrao: p.assunto, cheio: true },
    { nome: 'polo_cliente', rotulo: 'Cliente está no', tipo: 'select', padrao: p.polo_cliente, opcoes: Object.entries(POLOS).map(([valor, rotulo]) => ({ valor, rotulo })) },
    { nome: 'valor_reais', rotulo: 'Valor da causa (R$)', tipo: 'number', passo: '0.01', padrao: p.valor_causa_centavos != null ? p.valor_causa_centavos / 100 : '' },
    { nome: 'data_distribuicao', rotulo: 'Distribuição', tipo: 'date', padrao: p.data_distribuicao },
    { nome: 'restrito', rotulo: 'Processo restrito', tipo: 'checkbox', padrao: p.restrito },
    { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', padrao: p.observacoes, cheio: true, linhas: 3 },
  ], {}, { duas: true });
  const m = modal({ titulo: 'Editar processo', largo: true, corpo: f.el, acoes: [botao('Cancelar', () => m.fechar()), botao('Salvar', acao(async () => {
    const v = f.ler(); v.valor_causa_centavos = centavos(v.valor_reais); delete v.valor_reais;
    await patch(`/api/processos/${p.id}`, v); m.fechar(); toast('Processo atualizado.', 'ok'); depois();
  }), 'primario')] });
}

async function editarResponsaveis(p, depois) {
  const us = (await carregarUsuarios()).filter((u) => u.papel !== 'financeiro');
  const atual = p.responsaveis;
  const f = formulario([
    { nome: 'responsavel_id', rotulo: 'Responsável principal', tipo: 'select', numero: true, padrao: atual.find((r) => r.papel === 'responsavel')?.id, opcoes: opcoesUsuarios(us) },
    { nome: 'colaboradores', rotulo: 'Colaboradores', tipo: 'multi', padrao: atual.filter((r) => r.papel !== 'responsavel').map((r) => r.id), opcoes: opcoesUsuarios(us) },
  ]);
  const m = modal({ titulo: 'Responsáveis', corpo: f.el, acoes: [botao('Cancelar', () => m.fechar()), botao('Salvar', acao(async () => {
    await put(`/api/processos/${p.id}/responsaveis`, f.ler()); m.fechar(); depois();
  }), 'primario')] });
}

function novaParte(p, depois) {
  const f = formulario([
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true, cheio: true }, { nome: 'documento', rotulo: 'CPF/CNPJ' },
    { nome: 'polo', rotulo: 'Polo', tipo: 'select', opcoes: Object.entries(POLOS).map(([valor, rotulo]) => ({ valor, rotulo })) },
    { nome: 'papel', rotulo: 'Papel', tipo: 'select', opcoes: ['parte', 'advogado', 'perito', 'testemunha', 'outro'] }, { nome: 'oab', rotulo: 'OAB (se advogado)' },
  ], {}, { duas: true });
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const m = modal({ titulo: 'Adicionar parte', corpo: [erro, f.el], acoes: [botao('Cancelar', () => m.fechar()), botao('Adicionar', acao(async () => {
    if (!f.valido()) return;
    try { await post(`/api/processos/${p.id}/partes`, f.ler()); m.fechar(); depois(); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
  }), 'primario')] });
}

function novoVinculo(p, outros, depois) {
  const f = formulario([
    { nome: 'outro_id', rotulo: 'Processo relacionado', tipo: 'select', numero: true, obrigatorio: true, opcoes: [{ valor: '', rotulo: 'Escolha…' }, ...outros.map((o) => ({ valor: o.id, rotulo: `${o.numero || `#${o.id}`} — ${o.cliente_nome}` }))] },
    { nome: 'tipo', rotulo: 'Tipo de vínculo', tipo: 'select', padrao: 'conexao', opcoes: [['apenso', 'Apenso'], ['dependencia', 'Dependência'], ['recurso', 'Recurso'], ['conexao', 'Conexão'], ['execucao', 'Execução'], ['cautelar', 'Cautelar'], ['outro', 'Outro']].map(([valor, rotulo]) => ({ valor, rotulo })) },
    { nome: 'observacao', rotulo: 'Observação' },
  ]);
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const m = modal({ titulo: 'Vincular processo', corpo: [erro, f.el], acoes: [botao('Cancelar', () => m.fechar()), botao('Vincular', acao(async () => {
    if (!f.valido()) return;
    try { await post(`/api/processos/${p.id}/vinculos`, f.ler()); m.fechar(); depois(); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
  }), 'primario')] });
}
