import { del, get, patch, post, put, query } from './api.js';
import { acao, anexar, botao, debounce, estadoVazio, fmtData, formulario, h, limpar, modal, selo, tabela, toast, confirmar } from './ui.js';
import { ADMIN, ADVOGA, EDITA, carregarUsuarios, estado } from './estado.js';
import { novoProcesso } from './processos.js';

// ================= CLIENTES =================
function formCliente(c = {}) {
  return formulario([
    { nome: 'tipo_pessoa', rotulo: 'Tipo', tipo: 'select', padrao: c.tipo_pessoa || 'PF', opcoes: [{ valor: 'PF', rotulo: 'Pessoa física' }, { valor: 'PJ', rotulo: 'Pessoa jurídica' }] },
    { nome: 'nome', rotulo: 'Nome / razão social', obrigatorio: true, padrao: c.nome },
    { nome: 'documento', rotulo: 'CPF / CNPJ', padrao: c.documento, ajuda: 'Os dígitos verificadores são conferidos.' },
    { nome: 'telefone', rotulo: 'Telefone', padrao: c.telefone }, { nome: 'email', rotulo: 'E-mail', tipo: 'email', padrao: c.email },
    { nome: 'endereco', rotulo: 'Endereço', padrao: c.endereco, cheio: true },
    { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', linhas: 3, padrao: c.observacoes, cheio: true },
  ], {}, { duas: true });
}

function salvarCliente(existente, depois) {
  const f = formCliente(existente || {});
  if (existente) f.ctl.tipo_pessoa.entrada.disabled = true;
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const m = modal({ titulo: existente ? 'Editar cliente' : 'Novo cliente', largo: true, corpo: [erro, f.el], acoes: [botao('Cancelar', () => m.fechar()), botao('Salvar', acao(async () => {
    if (!f.valido()) return;
    const v = f.ler();
    try { const r = existente ? await patch(`/api/clientes/${existente.id}`, v) : await post('/api/clientes', v); m.fechar(); toast('Cliente salvo.', 'ok'); depois(r); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
  }), 'primario')] });
}

export const clientes = {
  async render(raiz, params, partes) {
    if (partes[0]) return detalheCliente(raiz, Number(partes[0]));
    const lista = h('div'); const f = { q: params.q || '' };
    const carregar = async () => limpar(lista).append(tabela([
      { titulo: 'Nome', celula: (c) => h('strong', {}, c.nome) }, { titulo: 'Documento', celula: (c) => c.documento || '—' }, { titulo: 'Contato', celula: (c) => [c.telefone, c.email].filter(Boolean).join(' · ') || '—' },
      { titulo: 'Tipo', celula: (c) => selo(c.tipo_pessoa === 'PF' ? 'Pessoa física' : 'Pessoa jurídica') }], await get(`/api/clientes${query({ q: f.q })}`),
    { aoClicar: (c) => { location.hash = `#/clientes/${c.id}`; }, vazio: 'Nenhum cliente encontrado.' }));
    limpar(raiz).append(h('div', { class: 'cabecalho' }, h('h1', {}, 'Clientes'), h('div', { class: 'acoes' }, EDITA() ? botao('Novo cliente', () => salvarCliente(null, (c) => { location.hash = `#/clientes/${c.id}`; }), 'primario') : null)),
      h('div', { class: 'barra' }, h('input', { type: 'search', value: f.q, placeholder: 'Nome, CPF/CNPJ ou e-mail', 'aria-label': 'Buscar clientes', oninput: debounce((e) => { f.q = e.target.value; carregar(); }) })), lista);
    await carregar();
  },
};

async function detalheCliente(raiz, id) {
  const c = await get(`/api/clientes/${id}`);
  const docs = h('div');
  limpar(raiz);
  anexar(raiz, [
    h('div', { class: 'cabecalho' }, h('div', {}, h('div', { class: 'muted pequeno' }, h('a', { href: '#/clientes' }, '← Clientes')), h('h1', {}, c.nome), h('div', { class: 'muted' }, [c.documento, c.telefone, c.email].filter(Boolean).join(' · '))),
      h('div', { class: 'acoes' }, EDITA() ? [botao('Editar', () => salvarCliente(c, () => detalheCliente(raiz, id))), botao('Novo processo', () => novoProcesso({ cliente_id: c.id }).catch((e) => toast(e.message, 'erro')), 'primario')] : null)),
    h('div', { class: 'grade' },
      h('section', { class: 'cartao' }, h('h2', {}, 'Processos'),
        tabela([{ titulo: 'Número', celula: (p) => h('span', { class: 'mono' }, p.numero || `#${p.id}`) }, { titulo: 'Assunto', celula: (p) => p.assunto || '—' }, { titulo: 'Fase', celula: (p) => p.fase }, { titulo: 'Status', celula: (p) => selo(p.status) }],
          c.processos, { aoClicar: (p) => { location.hash = `#/processos/${p.id}`; }, vazio: 'Sem processos.' })),
      h('section', { class: 'cartao' }, h('h2', {}, 'Dados'), h('dl', { class: 'dl' }, h('dt', {}, 'Endereço'), h('dd', {}, c.endereco || '—'), h('dt', {}, 'Observações'), h('dd', {}, c.observacoes || '—')))),
    EDITA() ? h('section', {}, h('h2', {}, 'Documentos do cliente'), docs) : null]);
  if (EDITA()) { const { painelDocumentosCliente } = await import('./documentos.js'); await painelDocumentosCliente(docs, c); }
}

// ================= MODELOS =================
export const modelos = {
  async render(raiz) {
    const lista = h('div');
    const carregar = async () => {
      const ms = await get('/api/modelos');
      limpar(lista).append(tabela([{ titulo: 'Modelo', celula: (m) => h('strong', {}, m.nome) }, { titulo: 'Categoria', celula: (m) => m.categoria || '—' }, { titulo: 'Variáveis', celula: (m) => h('span', { class: 'muted pequeno' }, m.variaveis.join(', ')) }],
        ms, { aoClicar: (m) => abrirModelo(m, carregar) }));
    };
    limpar(raiz).append(h('div', { class: 'cabecalho' }, h('h1', {}, 'Modelos de documentos'), h('div', { class: 'acoes' }, ADVOGA() ? botao('Novo modelo', () => editarModelo(null, carregar), 'primario') : null)),
      h('p', { class: 'muted' }, 'Modelos-base para o advogado revisar. Variáveis como {{ cliente.nome }} são preenchidas com os dados do cliente e do processo; se faltar um dado, o documento não é gerado.'), lista);
    await carregar();
  },
};

async function abrirModelo(m, depois) {
  const [processos, clientes_] = await Promise.all([get('/api/processos?limite=500'), get('/api/clientes?limite=500')]);
  const f = formulario([
    { nome: 'processo_id', rotulo: 'Processo', tipo: 'select', numero: true, opcoes: [{ valor: '', rotulo: 'Sem processo' }, ...processos.map((p) => ({ valor: p.id, rotulo: `${p.numero || `#${p.id}`} — ${p.cliente_nome}` }))] },
    { nome: 'cliente_id', rotulo: 'ou Cliente', tipo: 'select', numero: true, opcoes: [{ valor: '', rotulo: 'Nenhum' }, ...clientes_.map((c) => ({ valor: c.id, rotulo: c.nome }))] },
  ], {}, { duas: true });
  const saida = h('div');
  const mm = modal({ titulo: m.nome, largo: true, corpo: [f.el, saida],
    acoes: [ADVOGA() ? botao('Editar modelo', () => { mm.fechar(); editarModelo(m, depois); }) : null, botao('Fechar', () => mm.fechar()),
      botao('Pré-visualizar', acao(async () => {
        try { const r = await post(`/api/modelos/${m.id}/gerar`, { ...f.ler(), apenas_previa: true }); limpar(saida).append(h('div', { class: 'bloco-mem' }, r.texto)); } catch (e) {
          const falta = e.dados?.detail?.faltando; limpar(saida).append(h('div', { class: 'erro' }, falta ? `Faltam dados: ${falta.join(', ')}. Escolha um processo/cliente que os tenha ou complete o cadastro.` : e.message));
        }
      }), 'primario')].filter(Boolean) });
}

async function editarModelo(m, depois) {
  const vars = await get('/api/modelos/variaveis');
  const f = formulario([{ nome: 'nome', rotulo: 'Nome', obrigatorio: true, padrao: m?.nome }, { nome: 'categoria', rotulo: 'Categoria', padrao: m?.categoria },
    { nome: 'corpo', rotulo: 'Texto (use {{ variavel }}; linhas começando com “# ” viram título)', tipo: 'textarea', linhas: 14, obrigatorio: true, padrao: m?.corpo, cheio: true }], {}, { duas: true });
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const ajuda = h('details', {}, h('summary', {}, 'Variáveis disponíveis'), h('ul', { class: 'lista pequeno' }, Object.entries(vars).map(([k, d]) => h('li', {}, h('code', {}, `{{ ${k} }}`), ` — ${d}`))));
  const mm = modal({ titulo: m ? 'Editar modelo' : 'Novo modelo', largo: true, corpo: [erro, f.el, ajuda], acoes: [botao('Cancelar', () => mm.fechar()), botao('Salvar', acao(async () => {
    if (!f.valido()) return;
    try { m ? await put(`/api/modelos/${m.id}`, f.ler()) : await post('/api/modelos', f.ler()); mm.fechar(); toast('Modelo salvo.', 'ok'); depois(); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
  }), 'primario')] });
}

// ================= CONFIGURAÇÕES =================
export const config = {
  async render(raiz) {
    const eu = await get('/api/eu');
    const perfil = formulario([
      { nome: 'nome', rotulo: 'Nome', padrao: eu.nome }, { nome: 'oab', rotulo: 'OAB', padrao: eu.oab }, { nome: 'telefone', rotulo: 'Telefone (WhatsApp)', padrao: eu.telefone, ajuda: 'Com DDI: +5511999990000. Necessário para alertas por WhatsApp.' },
      { nome: 'canais_alerta', rotulo: 'Canais de alerta', tipo: 'select', padrao: eu.canais_alerta, opcoes: [['app', 'Só no aplicativo'], ['app,email', 'Aplicativo e e-mail'], ['app,whatsapp', 'Aplicativo e WhatsApp'], ['app,email,whatsapp', 'Todos']].map(([valor, rotulo]) => ({ valor, rotulo })) },
    ], {}, { duas: true });
    const senha = formulario([{ nome: 'senha_atual', rotulo: 'Senha atual', tipo: 'password' }, { nome: 'senha_nova', rotulo: 'Nova senha (mín. 10 caracteres)', tipo: 'password' }], {}, { duas: true });
    const feriados = h('div'); const usuarios = h('div');
    const carregarFeriados = async () => {
      const fs = await get('/api/feriados');
      limpar(feriados).append(tabela([{ titulo: 'Data', celula: (x) => fmtData(x.data) }, { titulo: 'Nome', celula: (x) => x.nome }, { titulo: 'Escopo', celula: (x) => x.escopo }, { titulo: 'Tribunal', celula: (x) => x.tribunal || 'todos' },
        { titulo: '', celula: (x) => (ADVOGA() ? botao('Remover', acao(async () => { await del(`/api/feriados/${x.id}`); carregarFeriados(); }), 'link') : '') }], fs, { vazio: 'Nenhum feriado local cadastrado. Só os feriados nacionais entram na contagem.' }));
    };
    const carregarUsuariosTabela = async () => {
      const us = await carregarUsuarios(true);
      limpar(usuarios).append(tabela([{ titulo: 'Nome', celula: (u) => u.nome }, { titulo: 'E-mail', celula: (u) => u.email }, { titulo: 'Perfil', celula: (u) => u.papel }, { titulo: 'OAB', celula: (u) => u.oab || '—' },
        { titulo: 'Situação', celula: (u) => (u.ativo ? selo('Ativo', 'ok') : selo('Inativo')) },
        { titulo: '', celula: (u) => (u.id !== estado.eu.id ? botao(u.ativo ? 'Desativar' : 'Reativar', acao(async () => { await patch(`/api/usuarios/${u.id}`, { ativo: !u.ativo }); carregarUsuariosTabela(); }), 'link') : '') }], us));
    };
    const f = formulario([{ nome: 'data', rotulo: 'Data', tipo: 'date', obrigatorio: true }, { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
      { nome: 'escopo', rotulo: 'Escopo', tipo: 'select', opcoes: ['forense', 'estadual', 'municipal'] }, { nome: 'tribunal', rotulo: 'Sigla do tribunal (vazio = todos)', dica: 'TJSP' }]);
    f.el.classList.add('barra');
    limpar(raiz);
    anexar(raiz, [
      h('div', { class: 'cabecalho' }, h('h1', {}, 'Configurações')),
      h('section', { class: 'cartao' }, h('h2', {}, 'Meu perfil'), perfil.el, h('div', { class: 'barra' }, botao('Salvar perfil', acao(async () => { await patch('/api/eu', perfil.ler()); estado.eu = await get('/api/eu'); toast('Perfil salvo.', 'ok'); }), 'primario'))),
      h('section', { class: 'cartao' }, h('h2', {}, 'Trocar senha'), senha.el, h('div', { class: 'barra' }, botao('Trocar senha', acao(async () => {
        await patch('/api/eu', senha.ler()); toast('Senha trocada. Entre novamente.', 'ok'); setTimeout(() => location.reload(), 1200);
      })))),
      h('section', { class: 'cartao' }, h('h2', {}, 'Feriados e suspensões locais'), h('p', { class: 'muted' }, 'A contagem de prazos já considera os feriados nacionais. Cadastre aqui feriado estadual, municipal ou suspensão de expediente do tribunal; sem isso a data pode sair um dia adiantada.'),
        ADVOGA() ? [f.el, h('div', { class: 'barra' }, botao('Adicionar feriado', acao(async () => { if (!f.valido()) return; await post('/api/feriados', f.ler()); toast('Feriado cadastrado.', 'ok'); carregarFeriados(); }), 'primario'))] : null, feriados),
      ADMIN() ? h('section', { class: 'cartao' }, h('div', { class: 'linha' }, h('h2', {}, 'Usuários'), botao('Novo usuário', () => novoUsuario(carregarUsuariosTabela), 'primario')), usuarios) : null,
      h('section', { class: 'cartao' }, h('h2', {}, 'Sobre'), h('p', { class: 'muted' }, ['A contagem de prazos segue o CPC e é um apoio ao advogado, que confere antes de confiar. Documentação da API: ', h('a', { href: '/api/docs' }, '/api/docs'), '.'])),
    ]);
    await carregarFeriados();
    if (ADMIN()) await carregarUsuariosTabela();
  },
};

function novoUsuario(depois) {
  const f = formulario([{ nome: 'nome', rotulo: 'Nome', obrigatorio: true }, { nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true },
    { nome: 'papel', rotulo: 'Perfil', tipo: 'select', padrao: 'advogado', opcoes: [['advogado', 'Advogado'], ['estagiario', 'Estagiário'], ['financeiro', 'Financeiro'], ['admin', 'Administrador']].map(([valor, rotulo]) => ({ valor, rotulo })) },
    { nome: 'oab', rotulo: 'OAB' }, { nome: 'senha', rotulo: 'Senha inicial (mín. 10 caracteres)', tipo: 'password', obrigatorio: true }], {}, { duas: true });
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const m = modal({ titulo: 'Novo usuário', corpo: [erro, f.el], acoes: [botao('Cancelar', () => m.fechar()), botao('Criar', acao(async () => {
    if (!f.valido()) return;
    try { await post('/api/usuarios', f.ler()); m.fechar(); toast('Usuário criado.', 'ok'); depois(); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
  }), 'primario')] });
}
