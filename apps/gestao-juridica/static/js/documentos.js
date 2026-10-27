import { api, del, get, post, query } from './api.js';
import { acao, anexar, botao, confirmar, debounce, estadoVazio, fmtDataHora, formulario, h, limpar, modal, selo, tabela, tamanho, toast, trechoMarcado } from './ui.js';
import { ADVOGA } from './estado.js';

const OCR = { indisponivel: ['Sem OCR: texto não pesquisável', 'aviso'], falhou: ['Falha ao ler o conteúdo', 'perigo'], feito: ['OCR feito', 'info'] };
const seloOcr = (s) => (OCR[s] ? selo(...OCR[s]) : null);

// ---------- aba "Documentos" do processo ----------
export async function painelDocumentos(c, processo) { return painelPastas(c, { tipo: 'processos', id: processo.id }); }
export async function painelDocumentosCliente(c, cliente) { return painelPastas(c, { tipo: 'clientes', id: cliente.id }); }

async function painelPastas(c, alvo) {
  const pastas = await get(`/api/${alvo.tipo}/${alvo.id}/pastas`);
  const recarregar = async () => { limpar(c); await painelPastas(c, alvo); };
  anexar(c, [
    h('div', { class: 'barra' },
      alvo.tipo === 'processos' ? botao('Nova pasta', acao(async () => {
        const f = formulario([{ nome: 'nome', rotulo: 'Nome da pasta', obrigatorio: true }]);
        const m = modal({ titulo: 'Nova pasta', corpo: f.el, acoes: [botao('Cancelar', () => m.fechar()), botao('Criar', acao(async () => { if (!f.valido()) return; await post(`/api/processos/${alvo.id}/pastas`, f.ler()); m.fechar(); recarregar(); }), 'primario')] });
      })) : null,
      botao('Gerar documento a partir de modelo', acao(() => gerarDeModelo(alvo, pastas, recarregar)), 'primario')),
    pastas.map((p) => {
      const input = h('input', { type: 'file', hidden: true, onchange: acao(async (ev) => {
        for (const arq of ev.target.files) { await enviar(p.id, arq); }
        recarregar();
      }), multiple: true });
      return h('section', { class: 'cartao' },
        h('div', { class: 'linha' }, h('h2', {}, `📁 ${p.nome}`), h('div', {}, input, botao('Enviar arquivo', () => input.click()))),
        tabela([
          { titulo: 'Documento', celula: (d) => h('button', { type: 'button', class: 'link', onclick: () => abrirDocumento(d.id, recarregar) }, d.nome) },
          { titulo: 'Versão', celula: (d) => `v${d.versao_atual}` }, { titulo: 'Tamanho', classe: 'nowrap', celula: (d) => tamanho(d.tamanho) },
          { titulo: 'Assinaturas', celula: (d) => (d.assinaturas ? selo(`${d.assinaturas} assinatura(s)`, 'ok') : '—') },
          { titulo: 'Leitura', celula: (d) => seloOcr(d.ocr_status) || '' }, { titulo: 'Enviado em', classe: 'nowrap', celula: (d) => fmtDataHora(d.enviado_em) },
        ], p.documentos, { vazio: 'Pasta vazia.' }));
    }),
  ]);
}

async function enviar(pastaId, arquivo) {
  const fd = new FormData(); fd.append('arquivo', arquivo);
  const d = await api('POST', `/api/pastas/${pastaId}/documentos`, fd);
  toast(`${d.nome} enviado.`, 'ok');
  return d;
}

async function gerarDeModelo(alvo, pastas, depois) {
  const modelos = await get('/api/modelos');
  const f = formulario([
    { nome: 'modelo', rotulo: 'Modelo', tipo: 'select', numero: true, opcoes: modelos.map((m) => ({ valor: m.id, rotulo: `${m.nome}${m.categoria ? ` (${m.categoria})` : ''}` })) },
    { nome: 'pasta_id', rotulo: 'Salvar na pasta', tipo: 'select', numero: true, padrao: pastas.find((p) => p.nome === 'Documentos')?.id, opcoes: pastas.map((p) => ({ valor: p.id, rotulo: p.nome })) },
  ]);
  const extras = h('div'); const campos = {};
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const m = modal({ titulo: 'Gerar documento', corpo: [h('p', { class: 'muted' }, 'Os dados do cliente e do processo entram sozinhos. Se faltar algum, o sistema pergunta em vez de deixar lacuna.'), erro, f.el, extras],
    acoes: [botao('Cancelar', () => m.fechar()), botao('Gerar .docx', acao(async () => {
      const v = f.ler(); erro.hidden = true;
      const ex = Object.fromEntries(Object.entries(campos).map(([k, el]) => [k, el.value]).filter(([, val]) => val));
      try {
        const r = await post(`/api/modelos/${v.modelo}/gerar`, { [alvo.tipo === 'processos' ? 'processo_id' : 'cliente_id']: alvo.id, pasta_id: v.pasta_id, extras: ex });
        m.fechar(); toast(`Documento “${r.documento.nome}” gerado.`, 'ok'); depois();
      } catch (e) {
        const falta = e.dados?.detail?.faltando;
        if (!falta) { erro.textContent = e.message; erro.hidden = false; return; }
        erro.textContent = 'Faltam dados para gerar. Preencha abaixo e gere de novo.'; erro.hidden = false;
        limpar(extras);
        for (const nome of falta) { const el = h('input', { id: `x-${nome}`, value: campos[nome]?.value || '' }); campos[nome] = el; extras.append(h('div', { class: 'campo' }, h('label', { for: `x-${nome}` }, nome), el)); }
      }
    }), 'primario')] });
}

// ---------- janela do documento ----------
export async function abrirDocumento(id, depois = () => {}) {
  const d = await get(`/api/documentos/${id}`);
  const corpo = h('div');
  const m = modal({ titulo: d.nome, largo: true, corpo, acoes: [] });
  const recarregar = () => { m.fechar(); depois(); abrirDocumento(id, depois); };
  const input = h('input', { type: 'file', hidden: true, onchange: acao(async (ev) => {
    const fd = new FormData(); fd.append('arquivo', ev.target.files[0]);
    const com = window.prompt('Comentário sobre esta versão (opcional):') || ''; if (com) fd.append('comentario', com);
    await api('POST', `/api/documentos/${id}/versoes`, fd); toast('Nova versão enviada.', 'ok'); recarregar();
  }) });
  const verificar = (v) => acao(async () => {
    const r = await get(`/api/documentos/versoes/${v.id}/verificar`);
    modal({ titulo: `Integridade — versão ${v.numero}`, corpo: [
      h('p', {}, r.integro ? selo('Arquivo íntegro', 'ok') : selo('ARQUIVO ALTERADO desde o envio', 'perigo')),
      h('p', { class: 'mono pequeno' }, `SHA-256: ${r.sha256}`),
      r.assinaturas.length ? h('ul', { class: 'lista' }, r.assinaturas.map((a) => h('li', {}, a.valida ? selo('válida', 'ok') : selo('INVÁLIDA', 'perigo'), ` ${a.nome} — ${fmtDataHora(a.assinado_em)} (${a.metodo === 'login' ? 'login no sistema' : 'link'})`))) : h('p', { class: 'muted' }, 'Sem assinaturas nesta versão.')] });
  });
  anexar(limpar(corpo), [
    h('p', { class: 'muted' }, `Versão atual: v${d.versao_atual} · ${tamanho(d.tamanho)} · ${d.mime || ''}`), seloOcr(d.ocr_status),
    h('div', { class: 'barra' }, input, botao('Enviar nova versão', () => input.click(), 'primario'), ADVOGA() ? botao('Excluir documento', acao(async () => {
      if (await confirmar('Excluir este documento? Dá para restaurar depois.', 'Excluir')) { await del(`/api/documentos/${id}`); m.fechar(); depois(); toast('Documento excluído (reversível).', 'ok'); }
    }), 'perigo') : null),
    h('h3', {}, 'Versões'),
    tabela([
      { titulo: 'Versão', celula: (v) => `v${v.numero}` }, { titulo: 'Enviada', classe: 'nowrap', celula: (v) => fmtDataHora(v.enviado_em) }, { titulo: 'Por', celula: (v) => v.enviado_por || '—' },
      { titulo: 'Comentário', celula: (v) => v.comentario || '' }, { titulo: 'Tamanho', classe: 'nowrap', celula: (v) => tamanho(v.tamanho) },
      { titulo: 'Assinaturas', celula: (v) => (v.assinaturas.length ? v.assinaturas.map((a) => a.nome).join(', ') : '—') },
      { titulo: '', celula: (v) => h('div', { class: 'barra' },
        h('a', { class: 'botao', href: `/api/documentos/versoes/${v.id}/arquivo`, download: d.nome }, 'Baixar'),
        botao('Integridade', verificar(v)),
        ADVOGA() ? botao('Assinar', () => assinar(v, recarregar)) : null, ADVOGA() ? botao('Pedir assinatura', () => pedirAssinatura(v, recarregar)) : null) },
    ], d.versoes),
    h('h3', {}, 'Histórico'),
    tabela([{ titulo: 'Quando', classe: 'nowrap', celula: (x) => fmtDataHora(x.em) }, { titulo: 'Quem', celula: (x) => x.usuario }, { titulo: 'O quê', celula: (x) => x.acao + (x.detalhes ? ` — ${x.detalhes}` : '') }], d.historico),
  ]);
}

function assinar(v, depois) {
  const f = formulario([{ nome: 'senha', rotulo: 'Confirme sua senha para assinar', tipo: 'password', obrigatorio: true }]);
  const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
  const m = modal({ titulo: `Assinar versão ${v.numero}`, corpo: [h('p', { class: 'muted' }, 'Assinatura eletrônica com selo verificável (Lei 14.063/2020). Não é certificado ICP-Brasil.'), erro, f.el],
    acoes: [botao('Cancelar', () => m.fechar()), botao('Assinar', acao(async () => {
      if (!f.valido()) return;
      try { await post(`/api/documentos/versoes/${v.id}/assinar`, f.ler()); m.fechar(); toast('Documento assinado.', 'ok'); depois(); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    }), 'primario')] });
}

function pedirAssinatura(v, depois) {
  const f = formulario([{ nome: 'nome', rotulo: 'Nome de quem vai assinar', obrigatorio: true }, { nome: 'email', rotulo: 'E-mail (opcional)', tipo: 'email' }]);
  const m = modal({ titulo: 'Pedir assinatura por link', corpo: f.el, acoes: [botao('Cancelar', () => m.fechar()), botao('Gerar link', acao(async () => {
    if (!f.valido()) return;
    const r = await post(`/api/documentos/versoes/${v.id}/solicitar-assinatura`, f.ler());
    const url = `${location.origin}${r.caminho}`;
    limpar(m.el.querySelector('.corpo')).append(h('p', {}, 'Envie este link ao signatário. Ele vale uma vez só e expira em 7 dias; por segurança, não será mostrado de novo.'),
      h('input', { value: url, readOnly: true, 'aria-label': 'Link de assinatura', onfocus: (e) => e.target.select() }),
      h('p', { class: 'muted pequeno' }, `Expira em ${fmtDataHora(r.expira_em)}.`));
    m.el.querySelector('footer').replaceChildren(botao('Copiar link', acao(async () => { await navigator.clipboard.writeText(url); toast('Link copiado.', 'ok'); }), 'primario'), botao('Fechar', () => { m.fechar(); depois(); }));
  }), 'primario')] });
}

// ---------- página "Documentos" (busca no conteúdo) ----------
export async function render(raiz, params) {
  const resultado = h('div');
  const buscar = async (q) => {
    if (!q.trim()) { limpar(resultado).append(estadoVazio('Digite para buscar dentro de PDFs, Word, textos e imagens com OCR. Para navegar pelas pastas, abra o processo ou o cliente.')); return; }
    const r = await get(`/api/documentos/busca${query({ q })}`);
    limpar(resultado).append(r.length ? h('div', { class: 'cartao' }, h('ul', { class: 'lista' }, r.map((x) => h('li', {},
      h('div', { class: 'linha' }, h('button', { type: 'button', class: 'link', onclick: () => abrirDocumento(x.id) }, x.nome),
        h('span', { class: 'muted pequeno' }, [x.pasta, x.processo_numero].filter(Boolean).join(' · '))),
      h('div', { class: 'pequeno' }, trechoMarcado(x.trecho)))))) : estadoVazio('Nenhum documento contém essas palavras.'));
  };
  const busca = h('input', { type: 'search', placeholder: 'Buscar no conteúdo dos documentos…', value: params.q || '', 'aria-label': 'Buscar nos documentos',
    oninput: debounce((e) => buscar(e.target.value).catch((x) => toast(x.message, 'erro')), 350) });
  limpar(raiz).append(h('div', { class: 'cabecalho' }, h('h1', {}, 'Documentos')), h('div', { class: 'barra' }, busca), resultado);
  busca.focus();
  await buscar(busca.value);
}
