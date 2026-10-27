// Rosto no navegador: câmera frontal, detecção, vetor (1024 números), nota de "pessoa real" e foto pequena.
// Biblioteca @vladmandic/human 3.3.6 (MIT, vendor/LICENSE-human.txt), servida do nosso domínio.
// A malha facial (mesh) fica LIGADA: medido em 2026-10-21, sem ela duas pessoas diferentes chegaram a
// 0,71 de semelhança; com ela, o máximo entre pessoas diferentes foi 0,49.
// O vetor não decide nada aqui: vai para o servidor, que compara com o cadastro guardado lá.
import { Human } from "./vendor/human.esm.js";

const CONFIG = {
  modelBasePath: "/app/modelos/", backend: "webgl", debug: false, cacheSensitivity: 0, warmup: "none",
  face: { enabled: true, detector: { rotation: false, maxDetected: 2, minConfidence: 0.5 }, mesh: { enabled: true }, iris: { enabled: false },
    description: { enabled: true }, emotion: { enabled: false }, antispoof: { enabled: true }, liveness: { enabled: true }, attention: { enabled: false } },
  body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false },
};

let human = null;
export async function carregar(aoProgresso = () => {}) {
  if (human) return human;
  aoProgresso("Preparando o reconhecimento facial (só na primeira vez demora)…");
  human = new Human(CONFIG);
  try { await human.load(); }
  catch {
    // Celular sem WebGL: cai para a CPU (mais lento, mas funciona).
    human = new Human({ ...CONFIG, backend: "cpu" });
    await human.load();
  }
  return human;
}

export async function abrirCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não dá acesso à câmera. Use o Chrome ou o Safari atualizado.");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    return () => stream.getTracks().forEach((t) => t.stop());
  } catch {
    throw new Error("Libere o acesso à câmera para este site (ícone de cadeado ao lado do endereço) e recarregue a página.");
  }
}

// Foto pequena (240 px de largura, JPEG ~10 KB): é o que o RH vê para conferir a marcação.
function fotoPequena(video) {
  const c = document.createElement("canvas");
  const w = 240, h = Math.round((video.videoHeight / video.videoWidth) * w) || 180;
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(video, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.7).split(",")[1];
}

// Uma captura válida: exatamente um rosto, grande o bastante e com vetor. Erro explica o que fazer.
export async function capturar(fonte) {
  const h = await carregar();
  const r = await h.detect(fonte);
  const rostos = r.face || [];
  if (rostos.length === 0) throw new Error("Não achei um rosto. Centralize o rosto na tela, com boa luz.");
  if (rostos.length > 1) throw new Error("Tem mais de uma pessoa na câmera. Fique sozinho na imagem.");
  const f = rostos[0];
  const largura = fonte.videoWidth || fonte.naturalWidth || fonte.width;
  if (f.box[2] < largura * 0.18) throw new Error("Chegue mais perto da câmera.");
  if (!f.embedding || f.embedding.length !== 1024) throw new Error("Não deu para ler o rosto. Tente de novo, olhando para a câmera.");
  return {
    vetor: Array.from(f.embedding, (x) => Math.round(x * 1e5) / 1e5),
    real: Math.round((f.real ?? 0) * 100) / 100,
    vivo: Math.round((f.live ?? 0) * 100) / 100,
    foto: fonte.videoWidth ? fotoPequena(fonte) : null,
  };
}

// Desafio de piscar: foto parada não pisca. Abertura do olho = distância entre as pálpebras dividida pela
// altura do olho na malha facial (mesma conta do gesto "blink" da biblioteca, abaixo de 0,2 = fechado).
// Passa com a sequência aberto -> fechado -> aberto em até 6 s. Vídeo de outra tela ainda passaria:
// por isso a foto de cada ponto fica guardada para o RH.
const abertura = (m, a, b, c, d) => Math.abs(m[a][1] - m[b][1]) / (Math.abs(m[c][1] - m[d][1]) || 1);
export async function desafioPiscar(video, aoEstado = () => {}, prazo = 6000) {
  const h = await carregar();
  aoEstado("Agora pisque os olhos devagar.");
  let fase = 0; // 0: esperando olho aberto, 1: esperando fechar, 2: esperando abrir de novo
  const fim = Date.now() + prazo;
  while (Date.now() < fim) {
    const r = await h.detect(video);
    const m = r.face?.[0]?.mesh;
    if (m?.length >= 468) {
      const v = (abertura(m, 374, 386, 443, 450) + abertura(m, 145, 159, 223, 230)) / 2;
      if (fase === 0 && v > 0.28) fase = 1;
      else if (fase === 1 && v < 0.2) fase = 2;
      else if (fase === 2 && v > 0.28) return true;
    }
    await new Promise((ok) => setTimeout(ok, 60));
  }
  return false;
}

export function localizacao() {
  return new Promise((ok, falha) => {
    if (!navigator.geolocation) return falha(new Error("Este celular não informa a localização."));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.round(p.coords.accuracy) }),
      (e) => falha(new Error(e.code === 1 ? "Libere a localização para este site e tente de novo." : "Não deu para pegar a localização. Vá para um lugar aberto e tente de novo.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}
