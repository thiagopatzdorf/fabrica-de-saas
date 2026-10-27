// Utilidades de interface. Todo dado do servidor entra no DOM por textContent/createTextNode:
// nunca por innerHTML, para que texto de publicação ou nome de arquivo jamais vire HTML.

export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  anexar(el, filhos);
  return el;
}

export function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f.nodeType ? f : document.createTextNode(String(f)));
  }
  return el;
}

export function limpar(el) { while (el.firstChild) el.firstChild.remove(); return el; }

// ---------- formatação ----------
export function fmtData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
export function fmtHora(iso) { return iso && iso.length > 10 ? iso.slice(11, 16) : ''; }
export function fmtDataHora(iso) {
  if (!iso) return '—';
  const quando = iso.length > 10 ? ` ${iso.slice(11, 16)}` : '';
  return `${fmtData(iso)}${quando}`;
}
export function brl(centavos) {
  if (centavos == null) return '—';
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function tamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
export function isoDia(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dataLocal(iso) { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); }
export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const STATUS_PRAZO = {
  pendente: ['Pendente', ''], em_andamento: ['Em andamento', 'info'], em_revisao: ['Em revisão', 'aviso'],
  concluido: ['Concluído', 'ok'], perdido: ['Perdido', 'perigo'], cancelado: ['Cancelado', ''],
};
export const TIPOS_EVENTO = {
  audiencia: 'Audiência', reuniao: 'Reunião', sustentacao_oral: 'Sustentação oral', compromisso: 'Compromisso interno',
  pericia: 'Perícia', diligencia: 'Diligência', vencimento_financeiro: 'Vencimento financeiro', prazo: 'Prazo',
};

export function selo(texto, tom = '') { return h('span', { class: `selo ${tom}` }, texto); }
export function seloStatus(status) { const [t, tom] = STATUS_PRAZO[status] || [status, '']; return selo(t, tom); }

// Situação de um prazo em aberto: texto + tom, nunca só cor.
export function seloPrazo(p) {
  if (p.status !== 'pendente' && p.status !== 'em_andamento' && p.status !== 'em_revisao') return seloStatus(p.status);
  const d = p.dias_restantes;
  if (d < 0) return selo(`Vencido há ${-d} d`, 'perigo');
  if (d === 0) return selo('Vence HOJE', 'perigo');
  if (d === 1) return selo('Vence amanhã', 'aviso');
  return selo(`${d} dias`, d <= 3 ? 'aviso' : '');
}

// Trecho de busca: o servidor delimita o achado com \u0001 e \u0002; aqui vira <mark> sem passar por HTML.
export function trechoMarcado(trecho) {
  const saida = h('span');
  let marcado = false;
  for (const parte of trecho.split(/([\u0001\u0002])/)) {
    if (parte === '\u0001') marcado = true;
    else if (parte === '\u0002') marcado = false;
    else if (parte) saida.append(marcado ? h('mark', {}, parte) : document.createTextNode(parte));
  }
  return saida;
}

// ---------- avisos e modal ----------
export function toast(mensagem, tipo = '') {
  const el = h('div', { class: `aviso-toast ${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' }, mensagem);
  document.getElementById('avisos').append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 9000 : 4500);
}

export function modal({ titulo, corpo, acoes = [], largo = false }) {
  const dlg = h('dialog', { class: `modal${largo ? ' largo' : ''}`, 'aria-label': titulo });
  const fechar = () => { if (dlg.open) dlg.close(); dlg.remove(); };
  anexar(dlg, [
    h('header', {}, h('h2', {}, titulo), h('button', { class: 'icone', 'aria-label': 'Fechar', onclick: fechar }, '×')),
    h('div', { class: 'corpo' }, corpo),
    acoes.length ? h('footer', {}, acoes) : null,
  ]);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return { fechar, el: dlg };
}

export function botao(rotulo, onclick, tipo = '') { return h('button', { type: 'button', class: tipo, onclick }, rotulo); }

// Executa uma ação de botão: desabilita enquanto roda e mostra o erro do servidor, sem derrubar a tela.
export function acao(fn) {
  return async (ev) => {
    const b = ev?.currentTarget;
    if (b) b.disabled = true;
    try { await fn(ev); } catch (e) { toast(e.message || String(e), 'erro'); } finally { if (b) b.disabled = false; }
  };
}

export function confirmar(mensagem, rotuloOk = 'Confirmar') {
  return new Promise((resolve) => {
    let respondido = false;
    const fim = (v) => { if (!respondido) { respondido = true; resolve(v); } m.fechar(); };
    const m = modal({
      titulo: 'Confirmar', corpo: h('p', {}, mensagem),
      acoes: [botao('Cancelar', () => fim(false)), botao(rotuloOk, () => fim(true), 'primario')],
    });
    m.el.addEventListener('close', () => fim(false));
  });
}

// ---------- formulário declarativo ----------
// campos: [{nome, rotulo, tipo: text|number|date|datetime-local|select|textarea|checkbox|multi|password, opcoes, obrigatorio, ajuda, cheio}]
export function formulario(campos, valores = {}, { duas = false } = {}) {
  const ctl = {};
  const el = h('form', { class: `form${duas ? ' duas' : ''}`, onsubmit: (e) => e.preventDefault() });
  let n = 0;
  for (const c of campos) {
    const id = `f-${c.nome}-${n++}`;
    const val = valores[c.nome] ?? c.padrao ?? '';
    let entrada;
    if (c.tipo === 'select') {
      entrada = h('select', { id }, (c.opcoes || []).map((o) => {
        const v = typeof o === 'object' ? o.valor : o; const r = typeof o === 'object' ? o.rotulo : o;
        return h('option', { value: v, selected: String(v) === String(val) }, r);
      }));
    } else if (c.tipo === 'multi') {
      entrada = h('select', { id, multiple: true, size: Math.min(6, (c.opcoes || []).length || 2) }, (c.opcoes || []).map((o) =>
        h('option', { value: o.valor, selected: (val || []).map(String).includes(String(o.valor)) }, o.rotulo)));
    } else if (c.tipo === 'textarea') {
      entrada = h('textarea', { id, rows: c.linhas || 4, value: val, placeholder: c.dica });
    } else if (c.tipo === 'checkbox') {
      entrada = h('input', { id, type: 'checkbox', checked: !!val });
    } else {
      entrada = h('input', { id, type: c.tipo || 'text', value: val, placeholder: c.dica, required: c.obrigatorio, min: c.min, max: c.max, step: c.passo, autocomplete: c.tipo === 'password' ? 'off' : null });
    }
    ctl[c.nome] = { entrada, c };
    const caixa = c.tipo === 'checkbox'
      ? h('div', { class: 'campo check' + (c.cheio ? ' cheio' : '') }, h('label', { for: id }, entrada, c.rotulo))
      : h('div', { class: 'campo' + (c.cheio ? ' cheio' : '') }, h('label', { for: id }, c.rotulo + (c.obrigatorio ? ' *' : '')), entrada, c.ajuda ? h('div', { class: 'ajuda' }, c.ajuda) : null);
    ctl[c.nome].caixa = caixa;
    el.append(caixa);
  }
  const ler = () => {
    const o = {};
    for (const [nome, { entrada, c }] of Object.entries(ctl)) {
      if (c.tipo === 'checkbox') o[nome] = entrada.checked;
      else if (c.tipo === 'multi') o[nome] = [...entrada.selectedOptions].map((x) => Number(x.value));
      else if (entrada.value !== '') o[nome] = c.tipo === 'number' || c.numero ? Number(entrada.value) : entrada.value;
    }
    return o;
  };
  const valido = () => { if (!el.reportValidity()) return false; return true; };
  return { el, ler, valido, ctl };
}

export function estadoVazio(texto) { return h('div', { class: 'vazio' }, texto); }

export function tabela(colunas, linhas, { aoClicar, vazio = 'Nada por aqui ainda.' } = {}) {
  if (!linhas.length) return estadoVazio(vazio);
  return h('div', { class: 'rolagem' }, h('table', { class: 'tabela' },
    h('thead', {}, h('tr', {}, colunas.map((c) => h('th', { class: c.classe || '' }, c.titulo)))),
    h('tbody', {}, linhas.map((l) => h('tr', { class: aoClicar ? 'clicavel' : '', tabindex: aoClicar ? 0 : null, onclick: aoClicar ? () => aoClicar(l) : null,
      onkeydown: aoClicar ? (e) => { if (e.key === 'Enter') aoClicar(l); } : null },
    colunas.map((c) => h('td', { class: c.classe || '' }, c.celula(l))))))));
}

export function opcoesUsuarios(usuarios, { vazio = null } = {}) {
  return [...(vazio ? [{ valor: '', rotulo: vazio }] : []), ...usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }))];
}
