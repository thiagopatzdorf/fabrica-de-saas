// node --test servidor/worker.test.mjs   (Node >= 22: node:sqlite faz o papel do D1)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker, { convite } from "./worker.js";
import { calcularEspelho, espelhoCsv, msDe } from "./src/espelho.js";
import { cnpjValido, cpfValido, distanciaM, semelhanca, veredito } from "./src/regras.js";
import { conferirSenha, hashSenha, verificar } from "./src/cripto.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCHEMA = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
function d1() {
  const s = new DatabaseSync(":memory:"); s.exec(SCHEMA);
  const conv = (a) => a.map((x) => (x instanceof Uint8Array ? x : x === undefined ? null : x));
  return { s, prepare(sql) { const mk = (a) => ({ bind: (...x) => mk(conv(x)), first: async () => s.prepare(sql).get(...a) ?? null, all: async () => ({ results: s.prepare(sql).all(...a) }), run: async () => (s.prepare(sql).run(...a), { success: true }) }); return mk([]); } };
}
const SEGREDO = "segredo-de-teste-com-tamanho-suficiente";
const novoEnv = () => ({ DB: d1(), SEGREDO, ASSETS: { fetch: () => new Response("asset") } });

// Vetores de rosto sintéticos com a escala do modelo real (desvio ~0,3 por dimensão).
function prng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) / 4294967296) * 2 - 1; }; }
const base = (seed) => { const r = prng(seed); return Array.from({ length: 1024 }, () => r() * 0.52); };
const ruido = (v, seed, amp) => { const r = prng(seed); return v.map((x) => x + r() * amp); };
const ANA = base(11), BIA = base(99);

function cli(env, ip = "1.1.1.1") {
  let ck = {};
  return async (m, p, b) => {
    const r = await worker.fetch(new Request("https://ponto.test" + p, { method: m, headers: { "cf-connecting-ip": ip, cookie: Object.entries(ck).map(([k, v]) => `${k}=${v}`).join("; "), ...(b ? { "content-type": "application/json", origin: "https://ponto.test" } : {}) }, body: b ? JSON.stringify(b) : undefined }), env);
    const sc = r.headers.get("set-cookie"); if (sc) { const [kv] = sc.split(";"); const [k, ...v] = kv.split("="); ck[k] = v.join("="); }
    const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {} return { st: r.status, j, t, h: r.headers };
  };
}
const CNPJ = "11222333000181", CPF_ANA = "52998224725", CPF_BIA = "11144477735";
const SP = { lat: -23.561684, lng: -46.655981 };

async function montar(env) {
  const RH = cli(env);
  const inst = await RH("POST", "/api/instalar", { convite: await convite(SEGREDO), empresa: { nome: "Padaria Exemplo", cnpj: CNPJ }, rh: { nome: "Bia RH", email: "rh@exemplo.com", senha: "senha-forte-123" } });
  assert.equal(inst.st, 201, inst.t);
  const loc = await RH("POST", "/api/rh/locais", { nome: "Loja Paulista", ...SP, raio_m: 100 });
  const f = await RH("POST", "/api/rh/funcionarios", { nome: "Ana Souza", cpf: CPF_ANA, jornada_min: 480, local: loc.j.id });
  const at = await RH("POST", `/api/rh/funcionarios/${f.j.id}/ativacao`, {});
  return { RH, fid: f.j.id, local: loc.j.id, token: at.j.url.split("#")[1] };
}
async function ativarAna(env, token) {
  const CEL = cli(env, "2.2.2.2");
  const r = await CEL("POST", "/api/ativacao", { token, consentimento: true, piscou: true, vetores: [ruido(ANA, 1, 0.05), ruido(ANA, 2, 0.05), ruido(ANA, 3, 0.05)], reais: [0.8, 0.8, 0.8] });
  assert.equal(r.st, 200, r.t);
  return CEL;
}
// Ponto exige 1 min entre registros: os testes recuam o relógio das marcações já feitas.
const voltarRelogio = (env, min) => env.DB.s.prepare("UPDATE marcacoes SET quando = quando - ?").run(min * 60000);

test("regras: CPF, CNPJ, distância e semelhança", () => {
  assert.ok(cpfValido(CPF_ANA) && cpfValido("529.982.247-25") && !cpfValido("52998224724") && !cpfValido("11111111111"));
  assert.ok(cnpjValido(CNPJ) && !cnpjValido("11222333000182"));
  const d = distanciaM(SP.lat, SP.lng, SP.lat + 0.001, SP.lng);
  assert.ok(d > 110 && d < 112, `1 milésimo de grau de latitude ~111 m, deu ${d}`);
  assert.equal(semelhanca(ANA, ANA), 1);
  assert.ok(semelhanca(ANA, ruido(ANA, 7, 0.05)) >= 0.9);
  assert.ok(semelhanca(ANA, BIA) < 0.42, `pessoas diferentes ${semelhanca(ANA, BIA)}`);
});

test("veredito: limiar registra, faixa cinza registra para revisar, abaixo e foto de foto recusam", () => {
  assert.deepEqual(veredito({ semelhanca: 0.7, real: 0.8 }), { ok: true, revisar: false });
  assert.deepEqual(veredito({ semelhanca: 0.48, real: 0.8 }), { ok: true, revisar: true });
  assert.equal(veredito({ semelhanca: 0.3, real: 0.8 }).ok, false);
  assert.equal(veredito({ semelhanca: 0.9, real: 0.2 }).ok, false, "rosto certo numa foto impressa");
  assert.equal(veredito({ semelhanca: 0.9 }).ok, false, "sem nota de vivacidade não passa");
});

test("senha do RH: PBKDF2 confere a certa e recusa a errada", async () => {
  const h = await hashSenha("senha-forte-123");
  assert.ok(h.startsWith("pbkdf2$100000$"));
  assert.ok(await conferirSenha("senha-forte-123", h));
  assert.ok(!(await conferirSenha("senha-forte-124", h)));
});

test("instalação: convite assinado, uso único, CNPJ e senha validados", async () => {
  const env = novoEnv(), A = cli(env);
  const c = await convite(SEGREDO);
  const base = { convite: c, empresa: { nome: "Padaria", cnpj: CNPJ }, rh: { nome: "Bia", email: "a@b.com", senha: "senha-forte-123" } };
  assert.equal((await A("POST", "/api/instalar", { ...base, convite: c.replace(/.$/, "x") })).st, 403);
  assert.equal((await A("POST", "/api/instalar", { ...base, empresa: { nome: "P", cnpj: "123" } })).st, 400);
  assert.equal((await A("POST", "/api/instalar", { ...base, rh: { ...base.rh, senha: "curta" } })).st, 400);
  assert.equal((await A("POST", "/api/instalar", base)).st, 201);
  assert.equal((await cli(env)("POST", "/api/instalar", { ...base, rh: { ...base.rh, email: "c@d.com" } })).st, 409, "convite é de uso único");
  assert.equal((await A("GET", "/api/rh/eu")).j.empresa.nome, "Padaria");
});

test("ponto: rosto certo dentro da cerca registra com NSR, comprovante e hash encadeado", async () => {
  const env = novoEnv(), { token } = await montar(env), CEL = await ativarAna(env, token);
  const eu = await CEL("GET", "/api/eu");
  assert.equal(eu.j.nome, "Ana Souza"); assert.equal(eu.j.local.raio_m, 100); assert.equal(eu.j.rosto, true);
  const r = await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(ANA, 50, 0.05), real: 0.9, vivo: 0.9, lat: SP.lat + 0.0003, lng: SP.lng, precisao: 12, foto: btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xd9)) });
  assert.equal(r.st, 201, r.t);
  const c = r.j.comprovante;
  assert.equal(c.nsr, 1); assert.equal(c.cpf, "529.982.247-25"); assert.equal(c.cnpj, CNPJ); assert.equal(c.dentro, true); assert.equal(c.revisar, false);
  assert.match(c.hash, /^[0-9a-f]{64}$/);
  assert.equal((await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(ANA, 51, 0.05), real: 0.9, ...SP })).st, 429, "dois registros no mesmo minuto");
  await voltarRelogio(env, 5);
  const r2 = await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(ANA, 52, 0.05), real: 0.9, ...SP, precisao: 5 });
  assert.equal(r2.j.comprovante.nsr, 2);
  const rows = env.DB.s.prepare("SELECT hash, hash_anterior FROM marcacoes ORDER BY nsr").all();
  assert.equal(rows[1].hash_anterior, rows[0].hash, "cada marcação aponta para a anterior");
  assert.equal(env.DB.s.prepare("SELECT COUNT(*) n FROM fotos").get().n, 1);
});

test("ponto: fora da cerca, sem GPS, rosto de outra pessoa e foto de foto são recusados", async () => {
  const env = novoEnv(), { token } = await montar(env), CEL = await ativarAna(env, token);
  const longe = await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(ANA, 60, 0.05), real: 0.9, lat: SP.lat + 0.01, lng: SP.lng, precisao: 10 });
  assert.equal(longe.st, 403); assert.match(longe.j.erro, /Você está a 1\d{3} m de Loja Paulista/);
  assert.equal((await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(ANA, 61, 0.05), real: 0.9 })).st, 400, "sem localização");
  const outra = await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(BIA, 62, 0.05), real: 0.9, ...SP });
  assert.equal(outra.st, 403); assert.match(outra.j.erro, /não confere/);
  assert.equal((await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(ANA, 63, 0.05), real: 0.1, ...SP })).st, 403, "foto de foto");
  assert.equal((await CEL("POST", "/api/ponto", { piscou: true, vetor: [1, 2, 3], real: 0.9, ...SP })).st, 400);
  assert.equal(env.DB.s.prepare("SELECT COUNT(*) n FROM marcacoes").get().n, 0, "nada recusado vira marcação");
  assert.ok(env.DB.s.prepare("SELECT COUNT(*) n FROM auditoria WHERE acao = 'ponto recusado'").get().n >= 3, "recusa fica na auditoria");
  // Recusa não queima a janela de 1 minuto: o ponto certo logo em seguida passa.
  assert.equal((await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(ANA, 64, 0.05), real: 0.9, ...SP })).st, 201);
});

test("ponto: precisão do GPS vira tolerância (até 100 m) e local sem exigir registra marcando fora", async () => {
  const env = novoEnv(), { RH, fid, token } = await montar(env), CEL = await ativarAna(env, token);
  // 130 m do centro, raio 100, precisão 40: conta como dentro.
  const r = await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(ANA, 70, 0.05), real: 0.9, lat: SP.lat + 0.00117, lng: SP.lng, precisao: 40 });
  assert.equal(r.st, 201, r.t); assert.equal(r.j.comprovante.dentro, true);
  const livre = await RH("POST", "/api/rh/locais", { nome: "Obra", ...SP, raio_m: 50, exigir: false });
  env.DB.s.prepare("UPDATE funcionarios SET local = ? WHERE id = ?").run(livre.j.id, fid);
  await voltarRelogio(env, 5);
  const fora = await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(ANA, 71, 0.05), real: 0.9, lat: SP.lat + 0.01, lng: SP.lng, precisao: 10 });
  assert.equal(fora.st, 201); assert.equal(fora.j.comprovante.dentro, false);
});

test("piscar: sem o desafio, ponto e cadastro são recusados; empresa pode desligar", async () => {
  const env = novoEnv(), { token } = await montar(env), C = cli(env, "5.5.5.5");
  const fotos = [ruido(ANA, 1, 0.05), ruido(ANA, 2, 0.05), ruido(ANA, 3, 0.05)];
  assert.equal((await C("POST", "/api/ativacao", { token, consentimento: true, vetores: fotos, reais: [0.8, 0.8, 0.8] })).st, 400, "cadastro sem piscar");
  assert.equal((await C("POST", "/api/ativacao", { token, consentimento: true, piscou: true, vetores: fotos, reais: [0.8, 0.8, 0.8] })).st, 200);
  const sem = await C("POST", "/api/ponto", { vetor: ruido(ANA, 95, 0.05), real: 0.9, ...SP });
  assert.equal(sem.st, 403); assert.match(sem.j.erro, /piscar/);
  env.DB.s.prepare("UPDATE empresas SET exigir_piscar = 0").run();
  assert.equal((await C("POST", "/api/ponto", { vetor: ruido(ANA, 96, 0.05), real: 0.9, ...SP })).st, 201);
});

test("ponto: semelhança na faixa cinza registra e marca para o RH revisar", async () => {
  const env = novoEnv(), { token } = await montar(env), CEL = await ativarAna(env, token);
  const v = ruido(ANA, 80, 0.53);
  const s = semelhanca(v, ruido(ANA, 1, 0.05));
  assert.ok(s >= 0.42 && s < 0.55, `vetor de teste fora da faixa cinza: ${s}`);
  const r = await CEL("POST", "/api/ponto", { piscou: true, vetor: v, real: 0.9, ...SP });
  assert.equal(r.st, 201, r.t); assert.equal(r.j.comprovante.revisar, true);
});

test("ativação: termo obrigatório, três fotos da mesma pessoa, link de uso único, celular novo derruba o antigo", async () => {
  const env = novoEnv(), { RH, fid, token } = await montar(env), C = cli(env, "3.3.3.3");
  const fotos = [ruido(ANA, 1, 0.05), ruido(ANA, 2, 0.05), ruido(ANA, 3, 0.05)];
  assert.equal((await C("POST", "/api/ativacao/info", { token })).j.nome, "Ana Souza");
  assert.equal((await C("POST", "/api/ativacao", { token, consentimento: false, piscou: true, vetores: fotos, reais: [0.8, 0.8, 0.8] })).st, 400);
  assert.equal((await C("POST", "/api/ativacao", { token, consentimento: true, piscou: true, vetores: [fotos[0], fotos[1], ruido(BIA, 4, 0.05)], reais: [0.8, 0.8, 0.8] })).st, 400, "duas pessoas no cadastro");
  assert.equal((await C("POST", "/api/ativacao", { token, consentimento: true, piscou: true, vetores: fotos, reais: [0.8, 0.8, 0.8] })).st, 200);
  assert.equal((await cli(env)("POST", "/api/ativacao", { token, consentimento: true, piscou: true, vetores: fotos, reais: [0.8, 0.8, 0.8] })).st, 403, "link vale uma vez");
  const f = env.DB.s.prepare("SELECT rosto, cpf_cifrado, termo_versao FROM funcionarios WHERE id = ?").get(fid);
  assert.ok(!f.rosto.includes("0.") && !f.cpf_cifrado.includes("529"), "rosto e CPF cifrados no banco");
  assert.equal(f.termo_versao, "2026-10-21");
  assert.equal((await C("GET", "/api/eu")).st, 200);
  const novo = await RH("POST", `/api/rh/funcionarios/${fid}/ativacao`, {});
  assert.equal((await C("GET", "/api/eu")).st, 401, "o celular antigo perde o acesso");
  const C2 = cli(env, "4.4.4.4");
  assert.equal((await C2("POST", "/api/ativacao", { token: novo.j.url.split("#")[1], consentimento: true, piscou: true, vetores: fotos, reais: [0.8, 0.8, 0.8] })).st, 200);
  assert.equal((await C2("GET", "/api/eu")).st, 200);
  await RH("POST", `/api/rh/funcionarios/${fid}/rosto/apagar`, {});
  assert.equal((await C2("POST", "/api/ponto", { piscou: true, vetor: fotos[0], real: 0.9, ...SP })).st, 409, "rosto apagado (LGPD) não bate ponto");
});

test("RH: login com limite de tentativas, sessão, e uma empresa nunca vê a outra", async () => {
  const env = novoEnv(), { fid } = await montar(env);
  const X = cli(env, "9.9.9.9");
  assert.equal((await X("POST", "/api/entrar", { email: "rh@exemplo.com", senha: "errada-123456" })).st, 401);
  assert.equal((await X("POST", "/api/entrar", { email: "rh@exemplo.com", senha: "senha-forte-123" })).st, 200);
  assert.equal((await X("GET", "/api/rh/funcionarios")).j.funcionarios.length, 1);
  const B = cli(env, "8.8.8.8");
  await B("POST", "/api/instalar", { convite: await convite(SEGREDO), empresa: { nome: "Outra", cnpj: "45723174000110" }, rh: { nome: "Zé", email: "ze@outra.com", senha: "senha-forte-456" } });
  assert.equal((await B("GET", "/api/rh/funcionarios")).j.funcionarios.length, 0);
  assert.equal((await B("GET", `/api/rh/espelho?funcionario=${fid}&mes=2026-10`)).st, 404, "espelho de funcionário de outra empresa");
  assert.equal((await B("POST", `/api/rh/funcionarios/${fid}/ativacao`, {})).st, 404);
  const F = cli(env, "7.7.7.7");
  for (let i = 0; i < 10; i++) await F("POST", "/api/entrar", { email: "rh@exemplo.com", senha: "x" + i });
  assert.equal((await F("POST", "/api/entrar", { email: "rh@exemplo.com", senha: "senha-forte-123" })).st, 429, "11ª tentativa em 15 min");
  assert.equal((await cli(env)("GET", "/api/rh/eu")).st, 401);
});

test("RH: escrita de outra origem ou sem JSON é recusada (CSRF)", async () => {
  const env = novoEnv(), { RH } = await montar(env);
  const r = await worker.fetch(new Request("https://ponto.test/api/rh/locais", { method: "POST", headers: { "content-type": "application/json", origin: "https://mal.example" }, body: "{}" }), env);
  assert.equal(r.status, 403);
  const r2 = await worker.fetch(new Request("https://ponto.test/api/rh/locais", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=1" }), env);
  assert.equal(r2.status, 403);
  assert.equal((await RH("GET", "/api/rh/locais")).j.locais.length, 1);
});

test("espelho via API: marcações do mês, ajuste com motivo, CSV e auditoria", async () => {
  const env = novoEnv(), { RH, fid, token } = await montar(env), CEL = await ativarAna(env, token);
  await CEL("POST", "/api/ponto", { piscou: true, vetor: ruido(ANA, 90, 0.05), real: 0.9, ...SP });
  const mk = env.DB.s.prepare("SELECT id FROM marcacoes").get();
  // A marcação vira 08:00 de 06/10/2026 (terça) para o espelho ter dia fixo.
  env.DB.s.prepare("UPDATE marcacoes SET quando = ?").run(msDe("2026-10-06", "08:00"));
  assert.equal((await RH("POST", "/api/rh/ajustes", { funcionario: fid, tipo: "incluir", dia: "2026-10-06", hora: "17:00", motivo: "ok" })).st, 400, "motivo curto");
  assert.equal((await RH("POST", "/api/rh/ajustes", { funcionario: fid, tipo: "incluir", dia: "2026-10-06", hora: "17:00", motivo: "Esqueceu de bater a saída" })).st, 201);
  const e = await RH("GET", `/api/rh/espelho?funcionario=${fid}&mes=2026-10`);
  assert.equal(e.st, 200, e.t);
  const dia = e.j.espelho.dias.find((d) => d.data === "2026-10-06");
  assert.deepEqual(dia.marcacoes.map((m) => [m.hora, m.origem]), [["08:00", "O"], ["17:00", "I"]]);
  assert.equal(dia.trabalhado_min, 540);
  assert.equal(e.j.cabecalho.cpf, "529.982.247-25");
  assert.equal((await RH("POST", "/api/rh/ajustes", { funcionario: fid, tipo: "desconsiderar", marcacao: mk.id, motivo: "Bateu por engano" })).st, 201);
  assert.equal((await RH("POST", "/api/rh/ajustes", { funcionario: fid, tipo: "desconsiderar", marcacao: mk.id, motivo: "De novo" })).st, 409);
  const e2 = await RH("GET", `/api/rh/espelho?funcionario=${fid}&mes=2026-10`);
  const d2 = e2.j.espelho.dias.find((d) => d.data === "2026-10-06");
  assert.equal(d2.marcacoes[0].desconsiderada, true, "a original continua no espelho, marcada");
  assert.equal(env.DB.s.prepare("SELECT COUNT(*) n FROM marcacoes").get().n, 1, "ajuste nunca apaga marcação");
  const csv = await RH("GET", `/api/rh/espelho.csv?funcionario=${fid}&mes=2026-10`);
  assert.equal(csv.h.get("content-type"), "text/csv; charset=utf-8");
  assert.match(csv.t, /06\/10\/2026;ter;08:00\(D\) 17:00\(I\)/);
  const aud = (await RH("GET", "/api/rh/auditoria")).j.auditoria.map((a) => a.acao);
  for (const a of ["incluiu marcação", "desconsiderou marcação", "exportou espelho (CSV)", "ativou o celular e cadastrou o rosto"]) assert.ok(aud.includes(a), a);
  assert.equal((await RH("GET", `/api/rh/foto/${mk.id}`)).st, 404, "sem foto enviada, 404");
});

test("espelho: pares, ímpar, falta, fim de semana, dia futuro e totais", () => {
  const M = (dia, hora, extra = {}) => ({ id: `${dia}${hora}`, nsr: 1, quando: msDe(dia, hora), dentro: 1, revisar: 0, ...extra });
  const esp = calcularEspelho({ mes: "2026-10", jornada_min: 480, agora: msDe("2026-10-09", "12:00"),
    marcacoes: [M("2026-10-01", "08:00"), M("2026-10-01", "12:00"), M("2026-10-01", "13:00"), M("2026-10-01", "17:30"),
      M("2026-10-02", "08:00", { dentro: 0 }), M("2026-10-03", "09:00"), M("2026-10-03", "11:00"), M("2026-10-09", "08:00")] });
  const d = Object.fromEntries(esp.dias.map((x) => [x.data, x]));
  assert.equal(esp.dias.length, 31);
  assert.equal(d["2026-10-01"].trabalhado_min, 510); assert.equal(d["2026-10-01"].saldo_min, 30);
  assert.deepEqual(d["2026-10-02"].alertas, ["marcação ímpar", "fora da cerca"]); assert.equal(d["2026-10-02"].saldo_min, -480);
  assert.equal(d["2026-10-03"].util, false); assert.equal(d["2026-10-03"].saldo_min, 120, "sábado: tudo é extra");
  assert.deepEqual(d["2026-10-05"].alertas, ["falta"]);
  assert.equal(d["2026-10-09"].saldo_min, null, "hoje ainda não fechou"); assert.deepEqual(d["2026-10-09"].alertas, []);
  assert.equal(d["2026-10-20"].saldo_min, null, "futuro");
  assert.equal(esp.totais.faltas, 4, "05, 06, 07 e 08");
  assert.equal(esp.totais.trabalhado_min, 630);
  assert.equal(esp.totais.previsto_min, 480 * 6);
  assert.equal(esp.totais.fora_da_cerca, 1);
});

test("espelho: antes da admissão não há previsto nem falta (cadastro no meio do mês)", () => {
  const esp = calcularEspelho({ mes: "2026-10", agora: msDe("2026-10-23", "12:00"), inicio: "2026-10-21",
    marcacoes: [{ id: "a", nsr: 1, quando: msDe("2026-10-22", "08:00"), dentro: 1 }, { id: "b", nsr: 2, quando: msDe("2026-10-22", "17:00"), dentro: 1 }] });
  const d = Object.fromEntries(esp.dias.map((x) => [x.data, x]));
  assert.equal(d["2026-10-20"].previsto_min, 0); assert.deepEqual(d["2026-10-20"].alertas, []);
  assert.deepEqual(d["2026-10-21"].alertas, ["falta"], "a partir da admissão conta");
  assert.equal(esp.totais.faltas, 1); assert.equal(esp.totais.previsto_min, 960); assert.equal(esp.totais.saldo_min, -480 + 60);
});

test("espelho: fuso de Brasília (marcação às 22:30 local fica no dia certo)", () => {
  const esp = calcularEspelho({ mes: "2026-10", agora: msDe("2026-10-31", "23:00"), marcacoes: [{ id: "a", nsr: 1, quando: msDe("2026-10-06", "22:30"), dentro: 1 }] });
  assert.equal(esp.dias.find((d) => d.data === "2026-10-06").marcacoes[0].hora, "22:30");
  assert.equal(new Date(msDe("2026-10-06", "22:30")).toISOString(), "2026-10-07T01:30:00.000Z");
});

test("CSV: nome que vira fórmula no Excel é neutralizado", () => {
  const esp = calcularEspelho({ mes: "2026-10", agora: msDe("2026-10-02", "00:00") });
  const csv = espelhoCsv(esp, { empresa: "=HYPERLINK(\"x\")", cnpj: "1", nome: "+Ana", cpf: "", });
  assert.ok(csv.includes("'=HYPERLINK") && csv.includes("'+Ana"));
  assert.ok(csv.startsWith("﻿"), "BOM para o Excel ler acentos");
});

test("API: rota desconhecida 404, sem SEGREDO 503 (falha fechada), arquivo vai para os assets", async () => {
  const env = novoEnv();
  assert.equal((await cli(env)("GET", "/api/nada")).st, 404);
  assert.equal((await cli({ ...env, SEGREDO: "" })("GET", "/api/eu")).st, 503);
  assert.equal(await (await worker.fetch(new Request("https://ponto.test/app/ponto"), env)).text(), "asset");
});

test("convite gerado por scripts/convite.mjs é aceito pelo Worker e não vale com outro SEGREDO", async () => {
  const saida = execFileSync("node", [fileURLToPath(new URL("../scripts/convite.mjs", import.meta.url)), "https://ponto.exemplo.com"], { encoding: "utf8", env: { ...process.env, SEGREDO } }).trim();
  assert.ok(saida.startsWith("https://ponto.exemplo.com/app/instalar#"), saida);
  const token = saida.split("#")[1];
  const c = await verificar(token, SEGREDO);
  assert.equal(c?.c, "ponto-instalar");
  assert.equal(await verificar(token, "outro-segredo"), null);
  const env = novoEnv();
  assert.equal((await cli(env)("POST", "/api/instalar", { convite: token, empresa: { nome: "Padaria Exemplo", cnpj: CNPJ }, rh: { nome: "Bia", email: "bia@exemplo.com", senha: "senha-forte-123" } })).st, 201);
});

test("convite.mjs recusa rodar sem SEGREDO (falha fechada)", () => {
  assert.throws(() => execFileSync("node", [fileURLToPath(new URL("../scripts/convite.mjs", import.meta.url))], { encoding: "utf8", stdio: "pipe", env: { ...process.env, SEGREDO: "" } }));
});
