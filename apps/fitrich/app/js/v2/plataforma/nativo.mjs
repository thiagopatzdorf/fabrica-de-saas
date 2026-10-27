// Camada nativa OPCIONAL (casca Capacitor, mobile/). O app inteiro funciona sem ela: no navegador
// `ativo` é false e toda função devolve { ok: false, codigo: "nativo.indisponivel" } sem lançar nem pedir nada.
//
// Por que existe: lembrete local que dispara com o app fechado (sem servidor, sem push), toque háptico ao
// confirmar um lançamento e a folha de compartilhar do sistema para o backup (o `<a download>` não funciona
// no WebView do iOS). Os plugins vêm do registro do Capacitor (`window.Capacitor.Plugins`), detectados em
// runtime: nada é importado, então nada disso pesa na versão web nem exige rede.
export const ID_LEMBRETE_DIARIO = 1001;
export const ID_LEMBRETE_BACKUP = 1002;
const INDISPONIVEL = Object.freeze({ ok: false, codigo: "nativo.indisponivel" });

export function criarNativo({ win = globalThis.window } = {}) {
  const cap = win?.Capacitor;
  const ativo = Boolean(cap?.isNativePlatform?.());
  const plugin = (nome) => (ativo ? cap.Plugins?.[nome] ?? null : null);
  const guarda = async (nome, fn) => {
    const p = plugin(nome);
    if (!p) return INDISPONIVEL;
    try { return { ok: true, ...(await fn(p)) }; } catch (e) { return { ok: false, codigo: "nativo.falhou", erro: String(e?.message ?? e) }; }
  };

  return {
    ativo,
    sistema: ativo ? (cap.getPlatform?.() ?? "nativo") : "web",
    tem: (nome) => Boolean(plugin(nome)),

    // "leve" ao confirmar, "sucesso" ao concluir algo maior. Falha em silêncio: háptico é conforto, não função.
    haptico: (tipo = "leve") => guarda("Haptics", (p) => (tipo === "sucesso" ? p.notification({ type: "SUCCESS" }) : p.impact({ style: "LIGHT" }))),

    // Lembrete que repete todo dia na hora dada. Pede a permissão de notificação só aqui, quando a pessoa liga.
    async lembreteDiario({ hora, minuto = 0, titulo, corpo }) {
      return guarda("LocalNotifications", async (p) => {
        const perm = await p.requestPermissions();
        if (perm?.display !== "granted") return { ok: false, codigo: "nativo.permissao_negada" };
        await p.schedule({ notifications: [{ id: ID_LEMBRETE_DIARIO, title: titulo, body: corpo, schedule: { on: { hour: hora, minute: minuto }, allowWhileIdle: true } }] });
        return {};
      });
    },
    // Lembrete de backup no dia 1 de cada mês.
    async lembreteBackup({ hora = 10, titulo, corpo }) {
      return guarda("LocalNotifications", async (p) => {
        const perm = await p.requestPermissions();
        if (perm?.display !== "granted") return { ok: false, codigo: "nativo.permissao_negada" };
        await p.schedule({ notifications: [{ id: ID_LEMBRETE_BACKUP, title: titulo, body: corpo, schedule: { on: { day: 1, hour: hora, minute: 0 }, allowWhileIdle: true } }] });
        return {};
      });
    },
    cancelar: (id) => guarda("LocalNotifications", (p) => p.cancel({ notifications: [{ id }] })),

    // Escreve o texto num arquivo temporário e abre a folha de compartilhar (Salvar em Arquivos, Drive, e-mail...).
    async compartilharArquivo({ nome, texto, titulo = nome }) {
      const fs = plugin("Filesystem"), share = plugin("Share");
      if (!fs || !share) return INDISPONIVEL;
      try {
        await fs.writeFile({ path: nome, data: texto, directory: "CACHE", encoding: "utf8" });
        const { uri } = await fs.getUri({ path: nome, directory: "CACHE" });
        await share.share({ title: titulo, files: [uri], dialogTitle: titulo });
        return { ok: true };
      } catch (e) {
        // Cancelar a folha lança em algumas versões: não é falha do app.
        return /cancel/i.test(String(e?.message ?? e)) ? { ok: false, codigo: "nativo.cancelado" } : { ok: false, codigo: "nativo.falhou", erro: String(e?.message ?? e) };
      }
    },
  };
}
