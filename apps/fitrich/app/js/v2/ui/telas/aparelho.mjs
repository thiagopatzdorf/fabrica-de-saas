// Tela "App e aparelho": o que faz o Fitrich ser um app neste aparelho. Instalação (Android com prompt, iOS por
// instrução, resto por dica de menu), uso sem internet (quantos arquivos o service worker guardou), atualização
// ("nova versão" sem perder dados), segurança dos dados (armazenamento persistente com aviso honesto, espaço,
// último backup) e os recursos nativos da casca da loja (lembretes locais). Tudo vem de plataforma/servico.mjs;
// a tela não toca em IndexedDB nem em rede.
import { plataforma as obterPlataforma } from "../../plataforma/servico.mjs";
import { ID_LEMBRETE_BACKUP, ID_LEMBRETE_DIARIO } from "../../plataforma/nativo.mjs";

export const CHAVE_LEMBRETES = "fitrich-lembretes";
export const LEMBRETES_PADRAO = Object.freeze({ diario: { ativo: false, hora: "20:00" }, backup: { ativo: false } });

const ls = (f) => { try { return f(); } catch { return null; } };

// Preferências dos lembretes locais. Lixo no localStorage nunca quebra a tela: cai no padrão.
export function lerLembretes(texto) {
  let o = null;
  try { o = JSON.parse(texto); } catch { /* padrão */ }
  const hora = typeof o?.diario?.hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.diario.hora) ? o.diario.hora : LEMBRETES_PADRAO.diario.hora;
  return { diario: { ativo: o?.diario?.ativo === true, hora }, backup: { ativo: o?.backup?.ativo === true } };
}

export function bytesLegiveis(n, idioma = "pt-BR") {
  if (!Number.isFinite(n)) return "?";
  const un = ["B", "KB", "MB", "GB", "TB"];
  let v = n, i = 0;
  while (v >= 1024 && i < un.length - 1) { v /= 1024; i++; }
  return `${new Intl.NumberFormat(idioma, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 }).format(v)} ${un[i]}`;
}

export const tela = {
  id: "aparelho",
  titulo: "aparelho.titulo",
  icone: "celular",
  grupo: "mais",
  ordem: 120,
  css: "/css/aparelho.css",
  i18n: "/js/v2/ui/telas/aparelho.i18n.mjs",
  montar(ctx, serv = obterPlataforma()) {
    const { h, limpar, t, fmt } = ctx;
    const raiz = h("div", { class: "ap" });
    const st = { versao: null, checando: false, resultadoChecagem: null, resultadoInstalar: null, resultadoPersist: null, erro: false, lembretes: lerLembretes(ls(() => localStorage.getItem(CHAVE_LEMBRETES))) };
    const salvarLembretes = () => ls(() => localStorage.setItem(CHAVE_LEMBRETES, JSON.stringify(st.lembretes)));
    const botao = (rotulo, onclick, extra = "leve", attrs = {}) => h("button", { type: "button", class: ["botao", extra], onclick, ...attrs }, rotulo);
    const cartao = (titulo, ...filhos) => h("section", { class: "cartao" }, h("h2", null, titulo), ...filhos);
    const estadoLinha = (rotulo, texto) => h("p", { class: "ap-estado" }, h("strong", null, rotulo), " ", texto);

    function instalacao() {
      const i = serv.instalacao({ hoje: ctx.hoje(), registros: 0 });
      const filhos = [];
      if (i.modo === "nenhum") filhos.push(h("p", null, t("aparelho.instalacao.instalado")));
      else {
        filhos.push(h("p", null, t(`aparelho.instalacao.${i.modo}`)));
        if (i.modo === "nativo") filhos.push(botao(t("aparelho.instalacao.botao"), async () => { st.resultadoInstalar = await serv.instalador.instalar(); desenhar(); }, ""));
        if (st.resultadoInstalar === "dismissed") filhos.push(h("p", { class: "nota", role: "status" }, t("aparelho.instalacao.recusou")));
      }
      return cartao(t("aparelho.instalacao"), ...filhos);
    }

    function offline() {
      const pwa = serv.pwa.estado();
      let texto;
      if (serv.nativo.ativo) texto = t("aparelho.offline.nativo");
      else if (!pwa.suporte) texto = t("aparelho.offline.indisponivel");
      else if (st.versao?.arquivos) texto = t("aparelho.offline.pronto", { n: st.versao.arquivos });
      else texto = t("aparelho.offline.preparando");
      const filhos = [h("p", null, texto)];
      if (!serv.nativo.ativo && pwa.suporte) {
        filhos.push(estadoLinha(t("aparelho.versao"), st.versao ? t("aparelho.versao.valor", { cache: st.versao.cache.replace("fitrich-", "") }) : t("aparelho.versao.desconhecida")));
        const pronta = pwa.atualizacaoPronta;
        filhos.push(h("div", { class: "ap-bloco" }, h("h3", null, t("aparelho.atualizacao")),
          h("p", { role: "status" }, st.checando ? t("aparelho.atualizacao.verificando") : pronta ? t("aparelho.atualizacao.nova") : st.resultadoChecagem === "emdia" ? t("aparelho.atualizacao.emDia") : st.resultadoChecagem === "semrede" ? t("aparelho.atualizacao.semRede") : ""),
          pronta ? botao(t("aparelho.atualizacao.atualizar"), () => serv.pwa.aplicarAtualizacao(), "")
                 : botao(t("aparelho.atualizacao.verificar"), async () => { st.checando = true; desenhar(); const nova = await serv.pwa.verificar({ forcar: true }); st.checando = false; st.resultadoChecagem = nova ? "nova" : serv.pwa.estado().suporte ? "emdia" : "semrede"; desenhar(); }, "leve", { disabled: st.checando })));
      }
      return cartao(t("aparelho.offline"), ...filhos);
    }

    function dados() {
      const p = serv.persistencia(), d = ctx.estado();
      const av = serv.avaliarPersistencia(1);
      const filhos = [h("p", null, t(`plat.persist.${av.codigo}`))];
      filhos.push(h("p", { class: "nota" }, p.usoBytes != null && p.cotaBytes != null ? t("aparelho.dados.uso", { uso: bytesLegiveis(p.usoBytes, ctx.idioma()), cota: bytesLegiveis(p.cotaBytes, ctx.idioma()) }) : t("aparelho.dados.usoDesconhecido")));
      if (p.persistido === false && p.suporte) filhos.push(botao(t("aparelho.dados.pedir"), async () => { st.resultadoPersist = (await serv.pedirPersistencia()) ? "ok" : "no"; desenhar(); }));
      if (st.resultadoPersist) filhos.push(h("p", { class: "nota", role: "status" }, t(st.resultadoPersist === "ok" ? "aparelho.dados.pedido" : "aparelho.dados.recusado")));
      const ult = d.meta?.ultimoBackupEm;
      filhos.push(h("div", { class: "ap-bloco" }, h("h3", null, t("aparelho.backup")),
        h("p", null, ult ? t("aparelho.backup.ultimo", { data: fmt.data(ult.slice(0, 10)) }) : t("aparelho.backup.nunca")),
        h("a", { class: "botao leve", href: "#/dados" }, t("aparelho.backup.ir"))));
      return cartao(t("aparelho.dados"), ...filhos);
    }

    async function ligarDiario() {
      const [hh, mm] = st.lembretes.diario.hora.split(":").map(Number);
      const r = await serv.nativo.lembreteDiario({ hora: hh, minuto: mm, titulo: t("aparelho.lembrete.titulo"), corpo: t("aparelho.lembrete.corpo") });
      if (!r.ok) { st.erro = r.codigo === "nativo.permissao_negada" ? "negado" : "falha"; return; }
      st.lembretes.diario.ativo = true; st.erro = false; salvarLembretes();
    }
    async function ligarBackup() {
      const r = await serv.nativo.lembreteBackup({ titulo: t("aparelho.lembrete.titulo"), corpo: t("aparelho.lembreteBackup.corpo") });
      if (!r.ok) { st.erro = r.codigo === "nativo.permissao_negada" ? "negado" : "falha"; return; }
      st.lembretes.backup.ativo = true; st.erro = false; salvarLembretes();
    }

    function nativo() {
      if (!serv.nativo.ativo) return cartao(t("aparelho.nativo"), h("p", null, t("aparelho.nativo.web")));
      const L = st.lembretes;
      const filhos = [
        h("div", { class: "ap-bloco" }, h("h3", null, t("aparelho.lembrete.diario")),
          h("label", { class: "ap-campo" }, h("span", null, t("aparelho.lembrete.hora")),
            h("input", { type: "time", value: L.diario.hora, onchange: (e) => { if (/^\d\d:\d\d$/.test(e.target.value)) { L.diario.hora = e.target.value; salvarLembretes(); } } })),
          h("p", { class: "nota", role: "status" }, L.diario.ativo ? t("aparelho.lembrete.ativo", { hora: L.diario.hora }) : t("aparelho.lembrete.inativo")),
          L.diario.ativo ? botao(t("aparelho.lembrete.desligar"), async () => { await serv.nativo.cancelar(ID_LEMBRETE_DIARIO); L.diario.ativo = false; salvarLembretes(); desenhar(); })
                         : botao(t("aparelho.lembrete.ligar"), async () => { await ligarDiario(); desenhar(); }, "")),
        h("div", { class: "ap-bloco" }, h("h3", null, t("aparelho.lembreteBackup")),
          h("p", { class: "nota", role: "status" }, L.backup.ativo ? t("aparelho.lembreteBackup.ativo") : t("aparelho.lembreteBackup.inativo")),
          L.backup.ativo ? botao(t("aparelho.lembrete.desligar"), async () => { await serv.nativo.cancelar(ID_LEMBRETE_BACKUP); L.backup.ativo = false; salvarLembretes(); desenhar(); })
                         : botao(t("aparelho.lembrete.ligar"), async () => { await ligarBackup(); desenhar(); }, "")),
      ];
      if (st.erro) filhos.push(h("p", { class: "aviso atencao", role: "alert" }, t(st.erro === "negado" ? "aparelho.lembrete.negado" : "aparelho.erro")));
      return cartao(t("aparelho.nativo"), ...filhos);
    }

    function desenhar() {
      const foco = raiz.contains(document.activeElement) ? document.activeElement.textContent : null;
      limpar(raiz).append(h("p", { class: "nota" }, t("aparelho.intro")), instalacao(), offline(), dados(), nativo());
      if (foco) for (const b of raiz.querySelectorAll("button")) if (b.textContent === foco) { b.focus(); break; }
    }

    // O worker só responde "versão" depois de controlar a página (1ª visita: logo após clients.claim); pergunta de novo a cada mudança até ter resposta.
    let perguntando = false;
    const perguntarVersao = () => {
      if (st.versao || perguntando || !serv.pwa.estado().controlado) return;
      perguntando = true;
      serv.pwa.versao().then((v) => { perguntando = false; if (v) { st.versao = v; desenhar(); } });
    };
    desenhar();
    const parar = serv.aoMudar(() => { desenhar(); perguntarVersao(); });
    perguntarVersao();
    serv.lerPersistencia();
    return { elemento: raiz, atualizar: desenhar, destruir: parar };
  },
};
