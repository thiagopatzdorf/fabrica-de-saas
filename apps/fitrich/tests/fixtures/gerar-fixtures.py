#!/usr/bin/env python3
"""Gera as fixtures de importação do Fitrich v2 (OFX e CSV) de forma determinística.

Por que um gerador e não só os arquivos: três fixtures têm bytes cp1252 de verdade
(acentos fora do UTF-8) e um editor comum salvaria como UTF-8 sem avisar, destruindo o
caso de teste. Rodar `python3 gerar-fixtures.py` reescreve tudo igual.

São arquivos "reais-sintéticos": a FORMA é a dos bancos (fontes abaixo), os dados são
inventados.

Fontes da forma:
- OFX 1.x SGML do Banco do Brasil (cabeçalho ENCODING:USASCII / CHARSET:1252, DTPOSTED
  com [-3:BRT], tags folha sem fechamento): T2TiERP-1-Delphi, arquivo
  conciliacao_bancaria/.../ExtratoOFX.ofx, e github.com/chiarelli-dev/ofx-br (README).
- Nubank conta: cabeçalho `Data,Valor,Identificador,Descrição`, data DD/MM/AAAA, sinal do
  banco (controle-financeiro-familiar/familia-gomes-oliveira PR #141; comunidade.nubank.com.br).
- Nubank cartão: `date,title,amount`, data AAAA-MM-DD, valor com vírgula entre aspas
  ("94,59") em exportações antigas e com ponto (94.59) nas atuais; positivo = compra,
  negativo = pagamento recebido/estorno (mesma PR #141 e micheldpcarlos/nubank-csv).
- Inter: linhas de resumo (conta, período, saldo) antes da tabela, separador `;`, colunas
  `Data Lançamento;Histórico;Descrição;Valor;Saldo`, valor "R$ 1.234,56"
  (marcoantoniosouza/extratoBancoInter, Arquivo.py: header=6, sep=';', replace de ' R$ ').
"""
from pathlib import Path

AQUI = Path(__file__).resolve().parent

CAB_SGML = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

"""


def ofx_sgml_cp1252():
    # Acentos (ã, ç, é) e o símbolo "–" (0x96 em cp1252, inválido em UTF-8) de propósito.
    # TRNAMT com vírgula decimal na 3ª transação; FITID 2026070200002 repetido com a
    # MESMA data e valor (reemissão idêntica) e 2026070200003 repetido com valor
    # DIFERENTE (o banco reemitiu a transação depois de compensar: é um lançamento novo).
    corpo = """<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260731120000[-3:BRT]
<LANGUAGE>POR
<FI>
<ORG>Banco Fictício S.A.
<FID>999
</FI>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>999
<BRANCHID>1234-5
<ACCTID>98765-4
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260701000000[-3:BRT]
<DTEND>20260731000000[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260702000000[-3:BRT]
<TRNAMT>-150.00
<FITID>2026070200001
<MEMO>Compra com Cartão – PÃO DE AÇÚCAR
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260702000000[-3:BRT]
<TRNAMT>-45.90
<FITID>2026070200002
<MEMO>Pix enviado José da Silva
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260702000000[-3:BRT]
<TRNAMT>-45.90
<FITID>2026070200002
<MEMO>Pix enviado José da Silva
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260705
<TRNAMT>1.234,56
<FITID>2026070500003
<NAME>TED recebida
<MEMO>Salário Empresa Ltda
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260710000000[-3:BRT]
<TRNAMT>-89,90
<FITID>2026071000004
<MEMO>Pagamento Convênio – ENEL SÃO PAULO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260731235959[-3:BRT]
<TRNAMT>-10.00
<FITID>2026073100005
<MEMO>Tarifa Pacote de Serviços
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>2.345,67
<DTASOF>20260731000000[-3:BRT]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""
    return (CAB_SGML + corpo).encode("cp1252")


def ofx_xml_utf8():
    # OFX 2.x: XML de verdade, tags fechadas, cartão de crédito (CCACCTFROM).
    # Inclui uma descrição hostil: tem de chegar INTACTA como texto.
    return """<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
      <DTSERVER>20260805120000[-3:BRT]</DTSERVER>
      <LANGUAGE>POR</LANGUAGE>
      <FI><ORG>Cartão Fictício</ORG><FID>260</FID></FI>
    </SONRS>
  </SIGNONMSGSRSV1>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <TRNUID>1</TRNUID>
      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
      <CCSTMTRS>
        <CURDEF>BRL</CURDEF>
        <CCACCTFROM><ACCTID>1234********5678</ACCTID></CCACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20260701000000[-3:BRT]</DTSTART>
          <DTEND>20260731000000[-3:BRT]</DTEND>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260703000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-94.59</TRNAMT>
            <FITID>66a1b2c3-0001</FITID>
            <MEMO>Ifood *Restaurante Sabor &amp; Arte 2/3</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260704000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-29.90</TRNAMT>
            <FITID>66a1b2c3-0002</FITID>
            <MEMO>&lt;img src=x onerror=alert(1)&gt; Netflix.com</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20260710000000[-3:BRT]</DTPOSTED>
            <TRNAMT>1500.00</TRNAMT>
            <FITID>66a1b2c3-0003</FITID>
            <MEMO>Pagamento recebido</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>-124.49</BALAMT>
          <DTASOF>20260731000000[-3:BRT]</DTASOF>
        </LEDGERBAL>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>
""".encode("utf-8")


def csv_nubank_conta():
    # Sinal do banco: negativo saiu, positivo entrou. Vírgula dentro de campo entre aspas.
    return (
        "Data,Valor,Identificador,Descrição\n"
        "01/07/2026,-150.00,66a1b2c3-aaaa-0001,Compra no débito - PAO DE ACUCAR\n"
        "02/07/2026,-45.90,66a1b2c3-aaaa-0002,Transferência enviada pela Pix - JOSE DA SILVA - •••.123.456-•• - NU PAGAMENTOS\n"
        "05/07/2026,1234.56,66a1b2c3-aaaa-0003,\"Transferência Recebida - EMPRESA LTDA, ME - 12.345.678/0001-90\"\n"
        "10/07/2026,-500.00,66a1b2c3-aaaa-0004,Pagamento de fatura\n"
    ).encode("utf-8")


def csv_nubank_cartao_virgula():
    # Exportação antiga: amount entre aspas com vírgula decimal; positivo = compra.
    # Linha "Pagamento recebido" negativa com espaço depois do sinal (forma vista na PR #141).
    return (
        "﻿date,title,amount\n"
        "2026-07-03,Ifood *Restaurante Sabor,\"94,59\"\n"
        "2026-07-04,Netflix.Com,\"29,90\"\n"
        "2026-07-06,Uber *Trip,\"18,75\"\n"
        "2026-07-10,Pagamento recebido,\"- 1500,00\"\n"
    ).encode("utf-8")


def csv_nubank_cartao_ponto():
    # Exportação atual: amount com ponto decimal, sem aspas; mesmo sinal.
    return (
        "date,title,amount\n"
        "2026-07-03,Ifood *Restaurante Sabor,94.59\n"
        "2026-07-04,Netflix.Com,29.90\n"
        "2026-07-06,Uber *Trip,18.75\n"
        "2026-07-10,Pagamento recebido,-1500.00\n"
    ).encode("utf-8")


def csv_inter():
    # Linhas de resumo antes da tabela (header=6 no parser público), `;`, "R$ 1.234,56".
    return (
        "Extrato Conta Corrente\n"
        "Conta;1234567-8\n"
        "Período;01/07/2026 a 31/07/2026\n"
        "Saldo inicial;R$ 1.000,00\n"
        "Saldo final;R$ 2.038,66\n"
        "\n"
        "Data Lançamento;Histórico;Descrição;Valor;Saldo\n"
        "02/07/2026;Pix enviado;José da Silva;-R$ 45,90;R$ 954,10\n"
        "05/07/2026;Pix recebido;Empresa Ltda;R$ 1.234,56;R$ 2.188,66\n"
        "10/07/2026;Compra no débito;ENEL SAO PAULO;-R$ 89,90;R$ 2.098,76\n"
        "15/07/2026;Pagamento efetuado;\"FATURA CARTAO; INTER\";-R$ 60,10;R$ 2.038,66\n"
    ).encode("utf-8")


def csv_ponto_virgula_latin1():
    # Planilha genérica de banco pequeno: `;`, latin1 de verdade (ç, ã), \r\n, parênteses
    # para negativo e milhar com ponto.
    return (
        "Data;Descrição;Valor;Documento\r\n"
        "01/07/26;Mensalidade Academia Smart Fit;(99,90);0001\r\n"
        "03/07/26;Farmácia Drogasil;(1.045,30);0002\r\n"
        "05/07/26;Salário;3.500,00;0003\r\n"
    ).encode("cp1252")


def csv_debito_credito():
    # Débito e crédito em colunas separadas; sem coluna de valor único.
    return (
        "Data;Histórico;Débito;Crédito\n"
        "01/07/2026;Supermercado Carrefour;250,00;\n"
        "02/07/2026;Depósito em dinheiro;;300,00\n"
        "03/07/2026;Uber;18,75;\n"
    ).encode("utf-8")


ARQUIVOS = {
    "extrato-sgml-cp1252.ofx": ofx_sgml_cp1252,
    "fatura-xml-utf8.ofx": ofx_xml_utf8,
    "nubank-conta.csv": csv_nubank_conta,
    "nubank-cartao-virgula.csv": csv_nubank_cartao_virgula,
    "nubank-cartao-ponto.csv": csv_nubank_cartao_ponto,
    "inter-conta.csv": csv_inter,
    "generico-ponto-virgula-latin1.csv": csv_ponto_virgula_latin1,
    "generico-debito-credito.csv": csv_debito_credito,
}

if __name__ == "__main__":
    for nome, fn in ARQUIVOS.items():
        (AQUI / nome).write_bytes(fn())
        print(nome, (AQUI / nome).stat().st_size, "bytes")
