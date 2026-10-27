import { get } from './api.js';
import { anexar, estadoVazio, fmtData, fmtDataHora, h, limpar, seloPrazo, selo, TIPOS_EVENTO } from './ui.js';
import { estado } from './estado.js';

function listaPrazos(prazos, vazio) {
  if (!prazos.length) return estadoVazio(vazio);
  return h('ul', { class: 'lista' }, prazos.map((p) => h('li', {},
    h('div', { class: 'linha' },
      h('a', { href: `#/processos/${p.processo_id}` }, p.descricao),
      seloPrazo(p)),
    h('div', { class: 'muted pequeno' }, `${fmtData(p.data_fatal)} · ${p.cliente_nome}${p.processo_numero ? ` · ${p.processo_numero}` : ''}`))));
}

export async function render(raiz) {
  const d = await get('/api/painel');
  const ehFin = estado.eu.papel === 'financeiro';
  const metrica = (n, rotulo, tom = '', href = null) => h('a', { class: `cartao metrica ${tom}`, href: href || '#/prazos', style: null }, h('span', { class: 'n' }, n), h('span', { class: 'muted' }, rotulo));
  anexar(limpar(raiz), [
    h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, `Olá, ${estado.eu.nome.split(' ')[0]}`), h('div', { class: 'muted' }, `Hoje é ${fmtData(d.hoje)}`))),
    ehFin ? null : h('div', { class: 'grade-2' },
      metrica(d.prazos_hoje.length, 'prazos vencem hoje', d.prazos_hoje.length ? 'perigo' : ''),
      metrica(d.prazos_semana.length, 'prazos nos próximos 7 dias', d.prazos_semana.length ? 'aviso' : ''),
      metrica(d.prazos_perdidos.length, 'perdidos nos últimos 30 dias', d.prazos_perdidos.length ? 'perigo' : ''),
      metrica(d.aguardando_minha_revisao.length, 'aguardando a minha revisão', d.aguardando_minha_revisao.length ? 'aviso' : ''),
      metrica(d.publicacoes_novas, 'publicações para tratar', '', '#/publicacoes')),
    h('div', { class: 'grade', style: null },
      ehFin ? null : h('section', { class: 'cartao' }, h('h2', {}, 'Vencem hoje'), listaPrazos(d.prazos_hoje, 'Nenhum prazo vence hoje.')),
      ehFin ? null : h('section', { class: 'cartao' }, h('h2', {}, 'Próximos 7 dias'), listaPrazos(d.prazos_semana, 'Nada vence nesta semana.')),
      ehFin || !d.prazos_perdidos.length ? null : h('section', { class: 'cartao' }, h('h2', {}, 'Perdidos (30 dias)'), listaPrazos(d.prazos_perdidos, '')),
      ehFin || !d.aguardando_minha_revisao.length ? null : h('section', { class: 'cartao' }, h('h2', {}, 'Para eu revisar'), listaPrazos(d.aguardando_minha_revisao, '')),
      h('section', { class: 'cartao' }, h('h2', {}, 'Agenda dos próximos 7 dias'),
        d.proximos_eventos.length ? h('ul', { class: 'lista' }, d.proximos_eventos.map((e) => h('li', {},
          h('div', { class: 'linha' }, h('strong', {}, e.titulo), selo(TIPOS_EVENTO[e.tipo] || e.tipo)),
          h('div', { class: 'muted pequeno' }, `${fmtDataHora(e.inicio)}${e.local ? ` · ${e.local}` : ''}`)))) : estadoVazio('Sem compromissos na semana.')),
      ehFin ? null : h('section', { class: 'cartao' }, h('h2', {}, 'Processos ativos por fase'),
        d.processos_por_fase.length ? (() => {
          const max = Math.max(...d.processos_por_fase.map((f) => f.n));
          return h('div', {}, d.processos_por_fase.map((f) => {
            const preenche = h('div', { class: 'preenche' });
            preenche.style.width = `${(f.n / max) * 100}%`;
            return h('div', { class: 'barra-fase' }, h('span', {}, f.fase), h('div', { class: 'trilho' }, preenche), h('strong', { class: 'direita' }, f.n));
          }));
        })() : estadoVazio('Nenhum processo ativo.')))]);
}
