// Ativação do celular do funcionário: confere o link, mostra o termo (LGPD), tira 3 fotos do rosto
// e manda só os vetores (o servidor confere que as 3 são da mesma pessoa e guarda cifrado).
import { $, api, aviso, esc } from "./comum.js";
import { abrirCamera, capturar, carregar, desafioPiscar } from "./rosto.js";

const token = location.hash.slice(1);
// O token sai da barra de endereço: quem olhar a tela (ou um print) não leva o link.
history.replaceState(null, "", "/app/ativar");
const etapa = (n) => { for (const s of document.querySelectorAll("[data-etapa]")) s.hidden = s.dataset.etapa !== n; };

const info = token ? await api("/api/ativacao/info", { token }) : { ok: false, erro: "Abra o link completo que o RH mandou." };
if (!info.ok) {
  $("[data-empresa-at]").textContent = "";
  aviso($("[data-aviso]"), info.erro);
} else {
  $("[data-ola]").textContent = `Olá, ${info.nome.split(" ")[0]}!`;
  $("[data-empresa-at]").innerHTML = `A <b>${esc(info.empresa)}</b> usa o Ponto Eletrônico para o registro de ponto. Vamos ativar este celular para você.`;
  $("[data-termo]").hidden = false;
  carregar().catch(() => {});
}
$("[data-aceito]").addEventListener("change", (e) => { $("[data-comecar]").disabled = !e.target.checked; });

$("[data-comecar]").addEventListener("click", async () => {
  etapa("camera");
  const video = $(".camera video"), botao = $("[data-foto]"), estado = $("[data-estado]");
  let fechar;
  try { fechar = await abrirCamera(video); await carregar((t) => { estado.textContent = t; }); }
  catch (e) { estado.textContent = ""; aviso($("[data-aviso-cam]"), e.message); return; }
  estado.textContent = "Rosto dentro da moldura, olhando para a câmera.";
  botao.disabled = false;
  const fotos = [];
  let piscou = false;
  botao.addEventListener("click", async () => {
    botao.disabled = true; aviso($("[data-aviso-cam]"), "");
    estado.textContent = "Lendo o rosto…";
    try {
      // Na primeira foto, o desafio de piscar: o cadastro também não aceita foto de foto.
      if (info.piscar && !fotos.length && !(piscou ||= await desafioPiscar(video, (t) => { estado.textContent = t; }))) throw new Error("Não vi você piscar. Toque de novo e pisque devagar quando pedir.");
      const c = await capturar(video);
      fotos.push(c);
      document.querySelectorAll(".passos-foto i")[fotos.length - 1].classList.add("feito");
    } catch (e) { aviso($("[data-aviso-cam]"), e.message); }
    if (fotos.length < 3) {
      estado.textContent = fotos.length ? "Boa! Mexa um pouco a cabeça e tire a próxima." : "Rosto dentro da moldura, olhando para a câmera.";
      botao.textContent = `Tirar foto ${fotos.length + 1} de 3`; botao.disabled = false;
      return;
    }
    estado.textContent = "Enviando…";
    const r = await api("/api/ativacao", { token, consentimento: true, vetores: fotos.map((f) => f.vetor), reais: fotos.map((f) => f.real), piscou });
    if (!r.ok) {
      fotos.length = 0; piscou = false;
      for (const i of document.querySelectorAll(".passos-foto i")) i.classList.remove("feito");
      aviso($("[data-aviso-cam]"), r.erro);
      estado.textContent = "Vamos de novo.";
      botao.textContent = "Tirar foto 1 de 3"; botao.disabled = r.status === 403;
      return;
    }
    fechar();
    etapa("pronto");
  });
});
