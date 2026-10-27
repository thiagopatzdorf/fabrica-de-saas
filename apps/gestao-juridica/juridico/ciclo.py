"""Rotina diária (cron): perde o que venceu, gera e entrega alertas e atualiza andamentos.

    python -m juridico.ciclo [--sem-datajud]

Cada passo é independente: falha do DataJud ou de e-mail não impede os outros.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from . import alertas, config, datajud, db
from . import prazos_servico as ps
from .api_processos import atualizar_do_datajud


def rodar(con, *, datajud_ligado: bool = True, transporte=None, enviadores=None) -> dict:
    r = {"perdidos": ps.marcar_perdidos(con), "alertas_novos": alertas.gerar_alertas(con)}
    r["entrega"] = alertas.entregar_alertas(con, enviadores=enviadores)
    r["datajud"] = {"processos": 0, "andamentos_novos": 0, "erros": 0}
    if datajud_ligado and (os.environ.get("DATAJUD_API_KEY") or transporte):
        for p in con.execute("SELECT * FROM processos WHERE tipo='judicial' AND status='ativo' AND numero_digitos!=''").fetchall():
            try:
                x = atualizar_do_datajud(con, p, transporte=transporte)
                r["datajud"]["processos"] += 1
                r["datajud"]["andamentos_novos"] += x["inseridos"]
            except datajud.DataJudErro:
                r["datajud"]["erros"] += 1
    return r


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sem-datajud", action="store_true")
    a = ap.parse_args()
    con = db.conectar(config.caminho_banco())
    try:
        db.migrar(con)
        resultado = rodar(con, datajud_ligado=not a.sem_datajud)
        con.commit()
    finally:
        con.close()
    print(json.dumps(resultado, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
