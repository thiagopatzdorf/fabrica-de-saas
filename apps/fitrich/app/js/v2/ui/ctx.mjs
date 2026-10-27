// O que toda tela recebe. É o ÚNICO ponto de contato entre uma tela e o resto do app: tela não importa
// outra tela nem toca no armazenamento; lê `estado()` e pede mudança por `mudar(fn)`.
import { h, hs, limpar } from "./h.mjs";
import { criarFmt } from "./fmt.mjs";
import { criarEstadoVazio } from "./estado-vazio.mjs";

// `mudar(fn)`: fn recebe os dados v2 atuais e devolve os NOVOS (funções imutáveis do esquema); o app valida,
// grava e re-renderiza a tela. Se fn lançar (ErroEsquema), `mudar` rejeita com `.erros` e nada é gravado.
export function criarCtx({ estado, mudar, i18n, hoje, agora, novoId, indices, navegar = () => {}, dialogo = null }) {
  const fmt = criarFmt(i18n.idioma);
  return Object.freeze({
    estado, mudar, t: i18n.t, idioma: () => i18n.idioma, fmt, hoje, agora, novoId, indices, navegar, dialogo, h, hs, limpar,
    // Peça única de estado vazio que ensina o próximo passo (estado-vazio.mjs); textos em vazios.i18n.mjs.
    estadoVazio: criarEstadoVazio({ h, navegar }),
  });
}
// Contrato de tela (arquivo js/v2/ui/telas/<id>.mjs):
//   export const tela = {
//     id: "cartoes",                       // rota: #/cartoes
//     titulo: "cartoes.titulo",            // chave i18n
//     icone: "card",                       // nome de ícone (SVG do shell)
//     grupo: "principal" | "mais",         // aba principal ou menu "Mais"
//     ordem: 40,
//     css: "/css/cartoes.css",             // opcional; o shell injeta <link> (CSP style-src 'self')
//     i18n: "/js/v2/ui/telas/cartoes.i18n.mjs",  // {"pt-BR": {...}, "en": {...}}
//     montar(ctx) { return { elemento, atualizar?(), destruir?() }; },  // `atualizar` roda quando os dados mudam
//   };
