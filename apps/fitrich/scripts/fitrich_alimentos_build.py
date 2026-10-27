#!/usr/bin/env python3
"""Gera `app/js/v2/nutricao/base-alimentos.mjs` a partir da TACO (Unicamp/NEPA, 4a ed. 2011).

Uso:  python3 fitrich_alimentos_build.py <taco.db>

`taco.db` e o SQLite publicado em github.com/raulfdm/taco-api (apps/api/prisma/taco.db, codigo MIT; os DADOS
sao da TACO/NEPA-Unicamp, que pede citacao da fonte). Nao e versionado aqui: o `.mjs` gerado e o artefato.
Por que um gerador e nao a mao: 597 linhas copiadas a mao divergem da fonte; assim da para conferir de novo.

O que o script decide (cada regra tem um defeito atras):
- alimento sem energia na TACO (leite integral, sal, iogurte de abacaxi...) sai: sem kcal nao ha o que somar;
- macro nulo com energia presente (oleos: proteina e carbo nulos) vira 0, nulo de fibra continua nulo (= nao medido);
- leite, queijo cottage etc. que a TACO nao traz entram como `ref` (USDA FoodData Central, dominio publico, ou rotulo
  tipico), marcados `o=1` para a tela poder dizer de onde veio;
- porcoes caseiras NAO existem na TACO: sao medidas tipicas arredondadas (marcadas como aproximadas na tela).
"""
import json
import sqlite3
import sys
import unicodedata
from pathlib import Path

SAIDA = Path(__file__).resolve().parent.parent / "app" / "js" / "v2" / "nutricao" / "base-alimentos.mjs"

# id: (kcal, proteina, carbo, gordura, fibra) por 100 g. Fonte: USDA FoodData Central (dominio publico) ou rotulo tipico.
REFERENCIA = {
    1001: ("Leite de vaca, integral (ref. USDA)", 11, 61, 3.2, 4.8, 3.3, 0.0),
    1002: ("Leite de vaca, desnatado (ref. USDA)", 11, 34, 3.4, 5.0, 0.1, 0.0),
    1003: ("Whey protein, concentrado (rótulo típico)", 11, 400, 80.0, 10.0, 7.0, 0.0),
    1004: ("Pão de forma, tradicional (ref. USDA)", 1, 266, 9.0, 49.0, 3.2, 2.7),
    1005: ("Pasta de amendoim (ref. USDA)", 15, 588, 25.0, 20.0, 50.0, 6.0),
    1006: ("Queijo cottage (ref. USDA)", 7, 98, 11.1, 3.4, 4.3, 0.0),
    1007: ("Iogurte grego, natural (ref. USDA)", 7, 97, 9.0, 3.9, 5.0, 0.0),
    1008: ("Pizza de mussarela (ref. USDA)", 13, 266, 11.0, 33.0, 10.0, 2.3),
}

# Nomes mais claros que o da TACO para o que a pessoa realmente procura (o original continua buscavel).
NOMES = {
    3: "Arroz branco, cozido", 5: "Arroz branco (tipo 2), cozido", 1: "Arroz integral, cozido",
    561: "Feijão carioca, cozido", 567: "Feijão preto, cozido", 410: "Frango, peito grelhado (filé)",
    408: "Frango, peito cozido", 53: "Pão francês (pãozinho)", 488: "Ovo cozido", 490: "Ovo frito", 489: "Ovo cru",
    182: "Banana prata", 179: "Banana nanica", 180: "Banana ouro", 91: "Batata inglesa, cozida", 88: "Batata doce, cozida",
    377: "Bife de patinho, grelhado", 383: "Picanha sem gordura, grelhada", 540: "Feijoada", 140: "Pão de queijo, assado",
    448: "Iogurte natural", 461: "Queijo minas frescal", 463: "Queijo mussarela", 
    533: "Cuscuz de milho, cozido", 215: "Suco de laranja", 480: "Refrigerante de cola", 471: "Café (infusão)",
    7: "Aveia em flocos", 260: "Azeite de oliva extra virgem",
}

# Palavras de busca extras (sem acento, minusculas): sinonimos populares e o termo em ingles.
APELIDOS = {
    3: "arroz branco rice", 5: "arroz branco rice", 1: "arroz integral brown rice", 561: "feijao beans", 567: "feijao beans",
    410: "frango peito chicken breast file", 408: "frango peito chicken", 53: "pao frances paozinho bread", 52: "pao integral",
    488: "ovo egg", 490: "ovo egg", 489: "ovo egg", 182: "banana", 179: "banana", 180: "banana", 91: "batata potato",
    88: "batata doce sweet potato", 377: "bife carne vermelha beef", 383: "picanha beef", 540: "feijoada", 140: "pao de queijo",
    448: "iogurte yogurt", 461: "queijo cheese", 463: "queijo mucarela mozzarella cheese", 1001: "leite milk",
    1002: "leite milk", 1003: "whey proteina protein", 1004: "pao de forma bread", 533: "cuscuz", 215: "suco laranja orange juice",
    480: "refri coca cola soda", 471: "cafe coffee", 7: "aveia oats", 260: "azeite olive oil", 261: "manteiga butter",
    494: "acucar sugar", 507: "mel honey", 317: "salmao salmon", 277: "atum tuna", 168: "acai", 225: "mamao papaya",
    235: "melancia watermelon", 221: "maca apple", 214: "laranja orange", 239: "morango strawberry", 157: "tomate tomato",
    78: "alface lettuce salada", 100: "brocolis broccoli", 109: "cenoura carrot", 386: "coxinha salgado", 56: "pastel salgado",
    1008: "pizza", 1005: "pasta de amendoim peanut butter", 417: "hamburguer burger", 423: "linguica sausage",
    326: "carne moida carne", 551: "tapioca", 495: "chocolate", 589: "castanha do para castanha-do-brasil", 558: "amendoim peanut",
}

# Porcoes caseiras tipicas (g ou ml; liquido: 1 ml ~ 1 g). APROXIMADAS: variam de casa em casa.
PORCOES = {
    3: [("escumadeira", 90), ("colher_servir", 50)], 5: [("escumadeira", 90), ("colher_servir", 50)],
    1: [("escumadeira", 90), ("colher_servir", 50)], 561: [("concha", 100), ("colher_sopa", 22)],
    567: [("concha", 100), ("colher_sopa", 22)], 563: [("concha", 100)], 577: [("concha", 100), ("colher_sopa", 25)],
    410: [("file", 100)], 408: [("file", 100)], 403: [("porcao", 100)], 377: [("bife", 100)], 383: [("fatia", 50)],
    346: [("bife", 100)], 326: [("colher_servir", 50)], 417: [("unidade", 90)], 317: [("file", 120)], 277: [("lata", 120)],
    488: [("unidade", 50)], 490: [("unidade", 50)], 489: [("unidade", 50)], 484: [("unidade", 90)],
    53: [("unidade", 50)], 52: [("fatia", 25)], 1004: [("fatia", 25)], 140: [("unidade", 20)], 63: [("unidade", 8)],
    551: [("unidade", 90)], 533: [("fatia", 100)], 131: [("colher_sopa", 20)], 122: [("colher_sopa", 15)],
    182: [("unidade", 70)], 179: [("unidade", 90)], 180: [("unidade", 45)], 221: [("unidade", 130)], 222: [("unidade", 130)],
    214: [("unidade", 130)], 208: [("unidade", 130)], 225: [("fatia", 170)], 235: [("fatia", 200)], 231: [("unidade", 200)],
    163: [("colher_sopa", 30)], 164: [("fatia", 75)], 239: [("unidade", 12)], 207: [("unidade", 70)], 200: [("unidade", 170)],
    256: [("porcao", 100)], 168: [("copo", 200)], 243: [("unidade", 150)], 251: [("unidade", 120)],
    1001: [("copo", 200), ("xicara", 180)], 1002: [("copo", 200), ("xicara", 180)],
    471: [("xicara_cafe", 50)], 215: [("copo", 200)], 209: [("copo", 200)], 480: [("lata", 350), ("copo", 200)],
    481: [("lata", 350)], 478: [("copo", 200)], 448: [("pote", 170)], 1007: [("pote", 170)], 461: [("fatia", 30)],
    463: [("fatia", 15)], 439: [("fatia", 15)], 468: [("colher_sopa", 30)], 1006: [("colher_sopa", 30)], 261: [("colher_cha", 5)],
    260: [("colher_sopa", 13), ("colher_cha", 4)], 272: [("colher_sopa", 13), ("colher_cha", 4)], 494: [("colher_cha", 5), ("colher_sopa", 15)],
    507: [("colher_sopa", 21), ("colher_cha", 7)], 7: [("colher_sopa", 15)], 1005: [("colher_sopa", 16)], 1003: [("colher_sopa", 30)],
    91: [("unidade", 100)], 88: [("unidade", 130)], 129: [("porcao", 100)], 78: [("folha", 8)], 157: [("fatia", 15), ("unidade", 100)],
    110: [("unidade", 80)], 100: [("porcao", 80)], 540: [("concha", 120)], 538: [("colher_servir", 100)], 537: [("colher_servir", 100)],
    542: [("escumadeira", 110)], 386: [("unidade", 80)], 56: [("unidade", 70)], 58: [("unidade", 70)], 390: [("unidade", 50)],
    16: [("fatia", 60)], 495: [("porcao", 25)], 558: [("punhado", 30)], 588: [("punhado", 30)], 587: [("punhado", 30)],
    589: [("unidade", 4)], 1008: [("fatia", 110)], 13: [("unidade", 6)], 8: [("unidade", 6)], 61: [("xicara", 15)],
    421: [("unidade", 70)], 418: [("unidade", 70)], 423: [("unidade", 70)],
}

# Pratos e marmitas: soma de itens da propria base (id, gramas). Os numeros saem da soma, nunca digitados.
COMBOS = [
    (2001, "Prato feito (arroz, feijão, frango, salada)", [(3, 150), (561, 100), (410, 100), (78, 30), (157, 50)]),
    (2002, "Marmita fit (arroz integral, frango, brócolis)", [(1, 120), (410, 120), (100, 80)]),
    (2003, "Prato de bife (arroz, feijão, bife, ovo frito)", [(3, 150), (567, 100), (377, 100), (490, 50)]),
    (2004, "Arroz com feijão", [(3, 150), (561, 100)]),
    (2005, "Pão francês com manteiga", [(53, 50), (261, 10)]),
    (2006, "Pão francês com ovo e manteiga", [(53, 50), (490, 50), (261, 5)]),
    (2007, "Cuscuz com ovo", [(533, 100), (490, 50)]),
    (2008, "Salada de alface e tomate com azeite", [(78, 60), (157, 60), (260, 5)]),
    (2009, "Iogurte com aveia e banana", [(448, 170), (7, 15), (182, 70)]),
    (2010, "Sanduíche de frango (pão, frango, tomate, alface)", [(53, 50), (410, 60), (157, 30), (78, 10)]),
]

POPULARES = [3, 561, 410, 488, 53, 182, 1001, 2001, 1, 567, 377, 91, 88, 448, 461, 463, 471, 168, 100, 78, 157, 221, 214, 7, 260]


def r1(x):
    return round(x + 1e-9, 1)


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def main(db):
    c = sqlite3.connect(db)
    linhas = c.execute("select f.id,f.categoryId,f.name,n.kcal,n.protein,n.carbohydrates,n.lipids,n.dietaryFiber from foods f left join nutrients n on n.foodId=f.id order by f.id").fetchall()
    base, ids = [], set()
    for i, cat, nome, kcal, p, cb, g, fib in linhas:
        if kcal is None:
            continue
        nome = " ".join(nome.split())
        base.append([i, NOMES.get(i, nome), cat, int(round(kcal)), r1(p or 0), r1(cb or 0), r1(g or 0), None if fib is None else r1(fib), 0])
        ids.add(i)
    for i, (nome, cat, kcal, p, cb, g, fib) in REFERENCIA.items():
        base.append([i, nome, cat, kcal, p, cb, g, fib, 1])
        ids.add(i)
    por_id = {l[0]: l for l in base}
    for i, nome, itens in COMBOS:
        total = sum(gr for _, gr in itens)
        soma = [0.0] * 5
        for fid, gr in itens:
            b = por_id[fid]
            for k, idx in enumerate((3, 4, 5, 6)):
                soma[k] += b[idx] * gr / 100
            soma[4] += (b[7] or 0) * gr / 100
        por100 = [x * 100 / total for x in soma]
        linha = [i, nome, 13, int(round(por100[0])), r1(por100[1]), r1(por100[2]), r1(por100[3]), r1(por100[4]), 2]
        base.append(linha)
        por_id[i] = linha
        PORCOES[i] = [("prato", total)]
    for i in PORCOES:
        assert i in por_id, f"porcao para id inexistente {i}"
    for i in APELIDOS:
        assert i in por_id, f"apelido para id inexistente {i}"
    for i in POPULARES:
        assert i in por_id, f"popular inexistente {i}"
    base.sort(key=lambda l: l[0])
    # Busca: nome + apelido, sem acento, ja normalizado (a tela nao normaliza 600 linhas a cada tecla).
    busca = {l[0]: sem_acento(l[1] + " " + APELIDOS.get(l[0], "")) for l in base}
    corpo = ["// GERADO por scripts/fitrich_alimentos_build.py. Nao edite a mao: rode o gerador de novo.",
             "// Fonte: TACO, Tabela Brasileira de Composicao de Alimentos, 4a ed. revisada e ampliada (NEPA/UNICAMP, 2011),",
             "// valores por 100 g de parte comestivel. Itens `o:1` vem do USDA FoodData Central (dominio publico) ou de rotulo",
             "// tipico; `o:2` sao pratos calculados somando itens desta mesma base. Porcoes caseiras sao medidas tipicas, APROXIMADAS.",
             f"export const TOTAL = {len(base)};",
             "export const FONTE = " + json.dumps({"taco": "TACO, 4ª ed. rev. e ampl., NEPA/UNICAMP, 2011", "ref": "USDA FoodData Central (domínio público) e rótulos típicos"}, ensure_ascii=False) + ";",
             "// [id, nome, categoria, kcal, proteina_g, carbo_g, gordura_g, fibra_g|null, origem]  (por 100 g)",
             "export const ALIMENTOS = [",
             ",\n".join(" " + json.dumps(l, ensure_ascii=False, separators=(",", ":")) for l in base),
             "];",
             "// id -> texto de busca sem acento (nome + apelidos).",
             "export const BUSCA = " + json.dumps({str(k): v for k, v in busca.items()}, ensure_ascii=False, separators=(",", ":")) + ";",
             "// id -> [[medida_caseira, gramas], ...]",
             "export const PORCOES = " + json.dumps({str(k): [[a, b] for a, b in v] for k, v in sorted(PORCOES.items())}, separators=(",", ":")) + ";",
             "export const POPULARES = " + json.dumps(POPULARES) + ";", ""]
    SAIDA.write_text("\n".join(corpo), encoding="utf-8")
    print(len(base), "alimentos,", SAIDA.stat().st_size, "bytes")


if __name__ == "__main__":
    main(sys.argv[1])
