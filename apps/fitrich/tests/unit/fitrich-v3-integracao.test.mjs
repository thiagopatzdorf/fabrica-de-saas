// Costuras entre as áreas do Fitrich v3 (corpo, treino, insights): cada uma foi escrita sem ver a outra, então o
// que uma grava precisa ser o que a outra lê. Estes testes falham se o nome ou a forma do dado divergir de novo.
import test from "node:test";
import assert from "node:assert/strict";
import { vazio, adicionar, validar } from "../../app/js/v2/esquema.mjs";
import { sonosDoEstado, treinosComGrupos } from "../../app/js/v2/insights/base.mjs";
import { iniciarSessao, registrarSerie, concluirSessao } from "../../app/js/v2/treino/sessao.mjs";
import { CATALOGO } from "../../app/js/v2/treino/catalogo.mjs";

const agora = () => "2026-10-05T12:00:00.000Z";
const HOJE = "2026-10-05";

test("o sono registrado na tela Corpo (coleção bemestar) é lido pelos insights como noites", () => {
  let d = vazio({ agora });
  for (let i = 0; i < 8; i++) d = adicionar(d, "bemestar", { id: `b${i}`, data: `2026-09-${String(20 + i).padStart(2, "0")}`, sonoHoras: 7.5 }, { agora });
  assert.equal(validar(d).ok, true);
  const sonos = sonosDoEstado(d);
  assert.equal(sonos.length, 8);
  assert.deepEqual(sonos[0], { data: "2026-09-20", horas: 7.5 });
});

test("sem sono registrado o equilíbrio não inventa horas: sonosDoEstado devolve lista vazia", () => {
  assert.deepEqual(sonosDoEstado(vazio({ agora })), []);
});

test("sessão de força concluída entrega ao insight os grupos musculares do registro simples em treinos", () => {
  let d = vazio({ agora });
  const ex = CATALOGO.find((e) => e.primarios.length);
  d = iniciarSessao(d, { hoje: HOJE, agora, novoId: () => "sessao-1" });
  d = registrarSerie(d, "sessao-1", { exercicioId: ex.id, kg: 40, reps: 8, rir: 2 }, { agora }).dados;
  d = concluirSessao(d, "sessao-1", { agora });
  const t = treinosComGrupos(d).find((x) => x.id === "sessao-1-treino");
  assert.ok(t, "a sessão cria o registro simples em treinos");
  assert.deepEqual([...t.grupos].sort(), [...ex.primarios].sort());
});
