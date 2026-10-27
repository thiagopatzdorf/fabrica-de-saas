// Onde o app está rodando, sem adivinhar por marca de navegador mais do que o necessário. Puro: tudo que é
// do ambiente entra por parâmetro, para o teste cobrir iPhone, iPad, Android e app nativo sem navegador.
//   ios        iPhone/iPod/iPad (iPadOS 13+ se diz "Macintosh": o desempate é tela de toque)
//   safari     iOS no Safari (os outros navegadores do iOS também instalam, mas pelo menu Compartilhar deles)
//   standalone já aberto como app (tela inicial, PWA instalado ou casca nativa): nada de pedir instalação
export function detectarPlataforma({ ua = "", platform = "", maxTouchPoints = 0, standaloneIOS = false, displayStandalone = false, nativo = false } = {}) {
  const ios = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const outroNoIOS = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua);
  return {
    ios, android,
    safari: ios && /Safari/.test(ua) && !outroNoIOS,
    standalone: Boolean(standaloneIOS || displayStandalone || nativo),
    nativo: Boolean(nativo),
    // WebKit apaga dados de site sem uso em 7 dias; app na tela inicial é isento (ver docs/pesquisa-app.md).
    webkitNaoInstalado: ios && !(standaloneIOS || displayStandalone || nativo),
  };
}

export function plataformaDoAmbiente(win = globalThis.window, nav = globalThis.navigator) {
  const q = (m) => { try { return Boolean(win?.matchMedia?.(m).matches); } catch { return false; } };
  return detectarPlataforma({
    ua: nav?.userAgent ?? "", platform: nav?.platform ?? "", maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standaloneIOS: nav?.standalone === true, displayStandalone: q("(display-mode: standalone)") || q("(display-mode: minimal-ui)"),
    nativo: Boolean(win?.Capacitor?.isNativePlatform?.()),
  });
}
