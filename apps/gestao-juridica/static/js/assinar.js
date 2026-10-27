// Página pública: o signatário (cliente) lê o documento e assina pelo link de uso único.
import { api } from './api.js';
import { formulario, h, limpar } from './ui.js';

const token = location.hash.slice(1);
const caixa = document.getElementById('caixa');
const base = `/api/publico/assinatura/${encodeURIComponent(token)}`;

async function iniciar() {
  if (!token) { limpar(caixa).append(h('p', { class: 'erro' }, 'Link incompleto.')); return; }
  try {
    const info = await api('GET', base, undefined, { semLogin: true });
    const f = formulario([
      { nome: 'nome', rotulo: 'Seu nome completo', obrigatorio: true, padrao: info.signatario },
      { nome: 'cpf', rotulo: 'CPF', obrigatorio: true },
      { nome: 'aceite', rotulo: `Li o documento “${info.documento}” e concordo em assiná-lo eletronicamente.`, tipo: 'checkbox' },
    ]);
    const erro = h('div', { class: 'erro', hidden: true, role: 'alert' });
    const enviar = async () => {
      if (!f.valido()) return;
      erro.hidden = true;
      try {
        const r = await api('POST', base, f.ler(), { semLogin: true });
        limpar(caixa).append(h('h1', {}, 'Documento assinado'), h('p', {}, 'Sua assinatura foi registrada. Guarde o código do arquivo assinado:'), h('p', { class: 'mono pequeno' }, r.sha256));
      } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    };
    limpar(caixa).append(h('h1', {}, 'Assinatura de documento'), h('p', { class: 'muted' }, 'Leia o documento antes de assinar.'),
      h('p', {}, h('a', { class: 'botao', href: `${base}/arquivo`, download: info.documento }, `Baixar “${info.documento}”`)),
      h('p', { class: 'mono pequeno muted' }, `SHA-256: ${info.sha256}`), erro, f.el,
      h('button', { type: 'button', class: 'primario', onclick: enviar }, 'Assinar'),
      h('p', { class: 'muted pequeno' }, 'Assinatura eletrônica com registro de data, hora e arquivo (Lei 14.063/2020).'));
  } catch (e) { limpar(caixa).append(h('h1', {}, 'Link indisponível'), h('p', { class: 'erro' }, e.message)); }
}
iniciar();
