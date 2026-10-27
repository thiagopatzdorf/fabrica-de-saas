// Preferências que moram só neste aparelho (localStorage), nunca nos dados da pessoa: objetivo escolhido no
// onboarding, alto contraste, texto maior. Tudo em try/catch: armazenamento bloqueado não derruba o app.
export const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const gravar = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
export const CHAVES = { onboarding: "fitrich-onboarding", objetivo: "fitrich-objetivo", contraste: "fitrich-contraste", texto: "fitrich-texto" };
export const OBJETIVOS = ["financas", "corpo", "ambos"];


export const lerObjetivo = () => { const v = ler(CHAVES.objetivo); return OBJETIVOS.includes(v) ? v : "ambos"; };
export const gravarObjetivo = (v) => OBJETIVOS.includes(v) && gravar(CHAVES.objetivo, v);
// "feito" (terminou ou pulou) ou "idioma" (passo 1 resolvido; a troca de idioma recarrega a página).
export const lerOnboarding = () => ler(CHAVES.onboarding);
export const gravarOnboarding = (v) => gravar(CHAVES.onboarding, v);
