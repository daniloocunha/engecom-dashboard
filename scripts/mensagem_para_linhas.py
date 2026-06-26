#!/usr/bin/env python3
"""
Converte a mensagem de RDO gerada pelo app (formato WhatsApp) em linhas prontas
para colar no Google Sheets — uma por aba, na ordem exata das colunas.

NÃO requer credenciais nem internet. Apenas parseia o texto e imprime blocos TSV
(células separadas por TAB). Para usar: selecione o bloco de uma aba, vá na aba
correspondente do Sheets, clique na primeira linha vazia da coluna A e cole.

Uso:
    python mensagem_para_linhas.py mensagem.txt
    python mensagem_para_linhas.py < mensagem.txt
    python mensagem_para_linhas.py          # cole a mensagem e finalize com:
                                            #   Ctrl-D  (Linux/Mac)
                                            #   Ctrl-Z + Enter  (Windows)

Aceita uma ou várias mensagens coladas em sequência (cada uma vira um RDO).

Limitação do offline: o conversor não lê o Sheets, então o sequencial do
Número RDO começa em -001 por combinação OS+data. Se já existir um RDO daquela
OS+data na planilha, ajuste o sufixo (-002, -003...) na coluna B antes de colar.
"""

import re
import sys
import os

# Reutiliza o parser já testado do importar_rdos.py (mesmo diretório).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importar_rdos import (  # noqa: E402
    split_rdos,
    parse_rdo_block,
    split_into_sections,
    strip_bold,
    make_rdo_key,
)

# Metadados das colunas de auditoria da aba RDO (não vêm na mensagem).
APP_VERSION = "manual"  # marca que a linha foi lançada via colagem, não pelo app


def parse_transportes(tra_text: str) -> list[dict]:
    """
    Parseia a seção 'Manejo de Materiais e Sucatas' → Transportes Realizados.

    Formato (duas variantes de negrito, toleradas):
        *1.* Descrição
           Colaboradores: 3            |  *Colaboradores:* 3
           Horário: 08:00 - 09:00      |  *Horário:* 08:00 - 09:00
           KM: 100+000 → 105+000 (...) |  *KM:* 100+000 *→* 105+000 (...)
    """
    items = []
    # O primeiro pedaço (antes de *1.*) é o cabeçalho "Houve Transporte / Transportes
    # Realizados" — descartado pelo split.
    blocks = re.split(r"\*\d+\.\*\s*", tra_text)
    for block in blocks[1:]:
        lines = [l.strip() for l in block.split("\n") if l.strip()]
        if not lines:
            continue
        descricao = strip_bold(lines[0])
        if not descricao:
            continue

        colaboradores = ""
        hora_inicio = hora_fim = ""
        km_inicio = km_fim = ""

        for line in lines[1:]:
            m = re.search(r"Colaboradores:?\*?\s*(\d+)", line)
            if m:
                colaboradores = m.group(1)
            m = re.search(r"Hor[áa]rio:?\*?\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", line)
            if m:
                hora_inicio, hora_fim = m.group(1), m.group(2)
            m = re.search(r"KM:?\*?\s*([\d+]+)\s*\*?→\*?\s*([\d+]+)", line)
            if m:
                km_inicio, km_fim = m.group(1), m.group(2)

        items.append({
            "descricao": descricao,
            "colaboradores": colaboradores,
            "horarioInicio": hora_inicio,
            "horarioFim": hora_fim,
            "kmInicio": km_inicio,
            "kmFim": km_fim,
        })
    return items


def cell(v) -> str:
    """Sanitiza um valor para uma célula TSV (sem TAB nem quebra de linha)."""
    return str(v).replace("\t", " ").replace("\r", " ").replace("\n", " / ").strip()


def to_tsv(rows: list[list]) -> str:
    return "\n".join("\t".join(cell(c) for c in row) for row in rows)


def build_all_rows(rdos: list[dict], transportes_por_idx: dict) -> dict:
    """Monta as linhas de cada aba. Sequencial do Número RDO começa em 001 por OS+data."""
    counters: dict[str, int] = {}
    out = {
        "RDO": [], "Servicos": [], "Materiais": [], "HorasImprodutivas": [],
        "TransporteSucatas": [], "Efetivo": [], "Equipamentos": [],
    }

    for idx, rdo in enumerate(rdos):
        key = make_rdo_key(rdo["numeroOS"], rdo["data"])
        counters[key] = counters.get(key, 0) + 1
        numero_rdo = f"{key}-{counters[key]:03d}"

        e = rdo["efetivo"]
        total_efetivo = sum(e.values())
        prefixo = [numero_rdo, rdo["numeroOS"], rdo["data"], rdo["codigoTurma"], rdo["encarregado"]]

        # RDO (22 colunas A–V)
        out["RDO"].append([
            "", numero_rdo, rdo["data"], rdo["codigoTurma"], rdo["encarregado"],
            rdo["local"], rdo["numeroOS"], rdo["statusOS"], rdo["kmInicio"], rdo["kmFim"],
            rdo["horarioInicio"], rdo["horarioFim"], rdo["clima"], rdo["temaDDS"],
            rdo["houveServico"], rdo["houveTransporte"], rdo["nomeColaboradores"],
            rdo["observacoes"], "Não", "", "", APP_VERSION,
        ])

        # Servicos (11 colunas A–K)
        for s in rdo["servicos"]:
            out["Servicos"].append(prefixo + [
                s["descricao"], s["quantidade"], s["unidade"], "", "NÃO", "",
            ])

        # Materiais (8 colunas A–H)
        for m in rdo["materiais"]:
            out["Materiais"].append(prefixo + [m["descricao"], m["quantidade"], m["unidade"]])

        # HorasImprodutivas (10 colunas A–J)
        for hi in rdo["horasImprodutivas"]:
            out["HorasImprodutivas"].append(prefixo + [
                hi["tipo"], hi["descricao"], hi["horaInicio"], hi["horaFim"], total_efetivo,
            ])

        # TransporteSucatas (11 colunas A–K)
        for t in transportes_por_idx.get(idx, []):
            out["TransporteSucatas"].append(prefixo + [
                t["descricao"], t["colaboradores"], t["horarioInicio"], t["horarioFim"],
                t["kmInicio"], t["kmFim"],
            ])

        # Efetivo (11 colunas A–K)
        if total_efetivo > 0:
            out["Efetivo"].append(prefixo + [
                e["encarregado"], e["operadores"], e["operadorEGP"],
                e["tecnicoSeguranca"], e["soldador"], e["motoristas"],
            ])

        # Equipamentos (7 colunas A–G)
        for eq in rdo["equipamentos"]:
            out["Equipamentos"].append(prefixo + [eq["tipo"], eq["placa"]])

    return out


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            text = f.read()
    else:
        if sys.stdin.isatty():
            print("Cole a mensagem do RDO e finalize com Ctrl-D (Linux/Mac) "
                  "ou Ctrl-Z+Enter (Windows):\n", file=sys.stderr)
        text = sys.stdin.read()

    blocks = split_rdos(text)
    rdos = []
    transportes_por_idx = {}
    for block in blocks:
        rdo = parse_rdo_block(block)
        if not rdo:
            continue
        idx = len(rdos)
        rdos.append(rdo)
        sec = split_into_sections(block)
        tr = parse_transportes(sec.get("transporte", ""))
        if tr:
            transportes_por_idx[idx] = tr

    if not rdos:
        print("Nenhum RDO válido encontrado na mensagem.", file=sys.stderr)
        sys.exit(1)

    out = build_all_rows(rdos, transportes_por_idx)

    print(f"\n✅ {len(rdos)} RDO(s) convertido(s).")
    for rdo in rdos:
        key = make_rdo_key(rdo["numeroOS"], rdo["data"])
        print(f"   • {key}-001  |  {rdo['data']}  |  Turma {rdo['codigoTurma']}  |  OS {rdo['numeroOS']}")
    print("\n⚠️  Número RDO começa em -001 por OS+data. Se já existir um na planilha, "
          "ajuste o sufixo na coluna B antes de colar.\n")
    print("Para cada bloco abaixo: vá na aba indicada, clique na primeira linha vazia "
          "da coluna A e cole (Ctrl+V).\n")

    ordem = ["RDO", "Servicos", "Materiais", "HorasImprodutivas",
             "TransporteSucatas", "Efetivo", "Equipamentos"]
    for aba in ordem:
        rows = out[aba]
        if not rows:
            continue
        print("=" * 70)
        print(f"ABA: {aba}   ({len(rows)} linha(s))")
        print("=" * 70)
        print(to_tsv(rows))
        print()


if __name__ == "__main__":
    main()
