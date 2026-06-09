#!/usr/bin/env python3
"""
Importa RDOs de mensagens WhatsApp para o Google Sheets.

Uso:
    python importar_rdos.py            # importa de verdade
    python importar_rdos.py --dry-run  # simula sem gravar

Dependências:
    pip install google-auth google-api-python-client
"""

import re
import sys
import argparse
from datetime import datetime
from collections import defaultdict

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError:
    print("Instale as dependências: pip install google-auth google-api-python-client")
    sys.exit(1)

# ── Configuração ──────────────────────────────────────────────────────────────
SPREADSHEET_ID   = "1wHFUIQ8uRplRBNSV6TEyatR7_ilURZTC0qXWhubb1Fs"
CREDENTIALS_FILE = r"C:\Users\dan\CalculadoraHH\app\src\main\assets\rdo-engecom-0cdcc15ed168.json"
TXT_FILE         = r"C:\Users\dan\CalculadoraHH\dashboard\RDO - Registro Diário de Obra.txt"
APP_VERSION      = "16"
SCOPES           = ["https://www.googleapis.com/auth/spreadsheets"]

# Nomes das abas (espelhando SheetsConstants.kt)
SHEET_RDO          = "RDO"
SHEET_SERVICOS     = "Servicos"
SHEET_MATERIAIS    = "Materiais"
SHEET_HI           = "HorasImprodutivas"
SHEET_EFETIVO      = "Efetivo"
SHEET_EQUIPAMENTOS = "Equipamentos"

# Palavras-chave dos marcadores de seção.
# Usa busca por palavra-chave em vez de string exata para tolerar variações de emoji.
SECTION_KEYWORDS = [
    ("os_dados",       "Dados da O.S"),
    ("clima",          "Clima e Segurança"),
    ("servicos",       "Serviços Realizados"),
    ("materiais",      "Materiais Utilizados"),
    ("efetivo",        "Efetivo"),
    ("veiculos",       "Veículos"),
    ("hi",             "Horas Improdutivas"),
    ("transporte",     "Manejo de Materiais"),
    ("colaboradores",  "Nome dos Colaboradores"),
    ("observacoes",    "Observações"),
]

# Pré-compilados para melhor desempenho
_SECTION_PATTERNS = [
    (name, re.compile(
        r'^\*[^\n*]*' + re.escape(kw) + r'[^\n*]*\*\s*$',
        re.MULTILINE
    ))
    for name, kw in SECTION_KEYWORDS
]


# ─────────────────────────────────────────────────────────────────────────────
# Parsing de texto
# ─────────────────────────────────────────────────────────────────────────────

def strip_bold(s: str) -> str:
    return re.sub(r"\*", "", s).strip()


def split_rdos(text: str) -> list[str]:
    """Divide o texto em blocos individuais de RDO."""
    parts = re.split(r"\*RDO - Registro Diário de Obra\*", text)
    return [p.strip() for p in parts if p.strip()]


def split_into_sections(block: str) -> dict[str, str]:
    """Divide um bloco de RDO em seções nomeadas usando busca por palavra-chave."""
    positions = []
    for name, pattern in _SECTION_PATTERNS:
        m = pattern.search(block)
        if m:
            positions.append((m.start(), m.end(), name))
    positions.sort(key=lambda x: x[0])

    sections: dict[str, str] = {}
    sections["header"] = block[: positions[0][0]].strip() if positions else block.strip()

    for i, (start, end, name) in enumerate(positions):
        content_start = end
        content_end = positions[i + 1][0] if i + 1 < len(positions) else len(block)
        sections[name] = block[content_start:content_end].strip()

    return sections


def field(text: str, label: str) -> str:
    """Extrai o valor de '*Label* valor' no texto."""
    match = re.search(rf"\*{re.escape(label)}\*\s*(.*?)(?:\n|$)", text)
    return strip_bold(match.group(1)) if match else ""


def parse_numbered_items(section_text: str) -> list[dict]:
    """
    Parseia itens numerados no formato:
        *1.* Descrição do serviço/material
           *Qnt.:* 2.0uni
    """
    items = []
    # Cada item começa com *N.*
    blocks = re.split(r"\*\d+\.\*\s*", section_text)
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        lines = [l.strip() for l in block.split("\n") if l.strip()]
        if not lines:
            continue

        descricao = strip_bold(lines[0])
        quantidade = ""
        unidade = "uni"

        for line in lines[1:]:
            qnt = re.search(r"\*Qnt\.:\*\s*([\d.,]+)\s*(\S+)?", line)
            if qnt:
                quantidade = qnt.group(1).replace(",", ".")
                raw_unit = (qnt.group(2) or "uni").lower()
                # Normaliza: "uni", "m", "kg", "m³", etc.
                unidade = raw_unit.rstrip(".")
                break

        if descricao:
            items.append({"descricao": descricao, "quantidade": quantidade, "unidade": unidade})

    return items


def parse_efetivo(efetivo_text: str) -> dict:
    """Parseia a seção Efetivo."""
    def get_int(label: str) -> int:
        m = re.search(rf"\*{re.escape(label)}\*\s*(\d+)", efetivo_text)
        return int(m.group(1)) if m else 0

    return {
        "encarregado":      get_int("Encarregado:"),
        "operadores":       get_int("Operadores:"),
        "operadorEGP":      get_int("Operador EGP:"),
        "tecnicoSeguranca": get_int("Técnico de Segurança:"),
        "soldador":         get_int("Soldador:"),
        "motoristas":       get_int("Motoristas:"),
    }


def parse_vehicles(veiculos_text: str) -> list[dict]:
    """Parseia veículos no formato '*1.* Tipo - Placa'."""
    vehicles = []
    for m in re.finditer(r"\*\d+\.\*\s*(.+?)$", veiculos_text, re.MULTILINE):
        raw = strip_bold(m.group(1))
        if " - " in raw:
            tipo, placa = raw.rsplit(" - ", 1)
        else:
            tipo, placa = raw, ""
        placa = placa.strip()
        # Ignora placa "0" (indica sem placa cadastrada)
        if placa == "0":
            placa = ""
        if tipo.strip():
            vehicles.append({"tipo": tipo.strip(), "placa": placa})
    return vehicles


def parse_hi(hi_text: str) -> list[dict]:
    """
    Parseia Horas Improdutivas:
        *Tipo:*
          1. descrição *Horário:* HH:MM *→* HH:MM
    """
    items = []
    current_type = ""
    entry_re = re.compile(
        r"\d+\.\s*(.+?)\s*\*Horário:\*\s*(\d{2}:\d{2})\s*\*→\*\s*(\d{2}:\d{2})"
    )
    type_re = re.compile(r"^\s*\*(.+?):\*\s*$")

    for line in hi_text.split("\n"):
        type_match = type_re.match(line)
        if type_match:
            current_type = type_match.group(1).strip()
            continue

        entry_match = entry_re.search(line)
        if entry_match and current_type:
            descricao  = strip_bold(entry_match.group(1)).strip()
            hora_inicio = entry_match.group(2)
            hora_fim    = entry_match.group(3)
            items.append({
                "tipo":       current_type,
                "descricao":  descricao,
                "horaInicio": hora_inicio,
                "horaFim":    hora_fim,
            })

    return items


def parse_collaborators(colab_text: str) -> str:
    """Une os nomes dos colaboradores em uma string separada por vírgula."""
    names = []
    for line in colab_text.split("\n"):
        name = line.strip()
        if name and not name.startswith("*"):
            names.append(name)
    return ", ".join(names)


def parse_observations(obs_text: str) -> str:
    """Extrai o texto de *Gerais:*."""
    m = re.search(r"\*Gerais:\*\s*\n(.*)", obs_text, re.DOTALL)
    return m.group(1).strip() if m else obs_text.strip()


def parse_rdo_block(block: str) -> dict | None:
    """Converte um bloco de texto de RDO em um dicionário estruturado."""
    sec = split_into_sections(block)

    header = sec.get("header", "")
    os_sec  = sec.get("os_dados", "")
    clm_sec = sec.get("clima", "")
    svc_sec = sec.get("servicos", "")
    mat_sec = sec.get("materiais", "")
    efe_sec = sec.get("efetivo", "")
    vei_sec = sec.get("veiculos", "")
    hi_sec  = sec.get("hi", "")
    tra_sec = sec.get("transporte", "")
    col_sec = sec.get("colaboradores", "")
    obs_sec = sec.get("observacoes", "")

    # Campos do cabeçalho
    data = field(header, "Data:")
    if not data:
        return None  # bloco inválido

    codigo_turma = field(header, "Código da Turma:")

    # Encarregado no cabeçalho é nome (não número)
    encarregado = ""
    for m in re.finditer(r"\*Encarregado:\*\s*(.*?)(?:\n|$)", header):
        val = strip_bold(m.group(1))
        if val and not val.isdigit():
            encarregado = val
            break

    # Campos da O.S.
    numero_os    = field(os_sec, "Número OS:")
    status_os    = field(os_sec, "Status:")
    local        = field(os_sec, "Local:")
    km_inicio    = field(os_sec, "KM Início:")
    km_fim       = field(os_sec, "KM Fim:")
    hora_inicio  = field(os_sec, "Hora Início:")
    hora_fim     = field(os_sec, "Hora Fim:")

    # Clima
    clima    = field(clm_sec, "Clima:")
    tema_dds = field(clm_sec, "Tema DDS:")

    # Serviços
    servicos    = parse_numbered_items(svc_sec) if svc_sec else []
    houve_svc   = "Sim" if servicos else "Não"

    # Materiais
    materiais = parse_numbered_items(mat_sec) if mat_sec else []

    # Efetivo
    efetivo = parse_efetivo(efe_sec) if efe_sec else {
        "encarregado": 0, "operadores": 0, "operadorEGP": 0,
        "tecnicoSeguranca": 0, "soldador": 0, "motoristas": 0,
    }

    # Veículos
    equipamentos = parse_vehicles(vei_sec) if vei_sec else []

    # Horas Improdutivas
    hi_items = parse_hi(hi_sec) if hi_sec else []

    # Transporte
    houve_transporte = field(tra_sec, "Houve Transporte:")

    # Colaboradores
    nome_colaboradores = parse_collaborators(col_sec)

    # Observações
    observacoes = parse_observations(obs_sec) if obs_sec else ""

    return {
        "data":              data,
        "codigoTurma":       codigo_turma,
        "encarregado":       encarregado,
        "numeroOS":          numero_os,
        "statusOS":          status_os,
        "local":             local,
        "kmInicio":          km_inicio,
        "kmFim":             km_fim,
        "horarioInicio":     hora_inicio,
        "horarioFim":        hora_fim,
        "clima":             clima,
        "temaDDS":           tema_dds,
        "servicos":          servicos,
        "houveServico":      houve_svc,
        "materiais":         materiais,
        "efetivo":           efetivo,
        "equipamentos":      equipamentos,
        "horasImprodutivas": hi_items,
        "houveTransporte":   houve_transporte,
        "nomeColaboradores": nome_colaboradores,
        "observacoes":       observacoes,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Geração de Número RDO
# ─────────────────────────────────────────────────────────────────────────────

def normalize_date(data: str) -> str:
    """Normaliza data para DD/MM/YYYY, aceitando DD/MM/YY (ano 2 dígitos)."""
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(data.strip(), fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return data.strip()


def date_part(data: str) -> str:
    """Converte 'DD/MM/YYYY' ou 'DD/MM/YY' → 'DD.MM.YY'."""
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(data.strip(), fmt).strftime("%d.%m.%y")
        except ValueError:
            continue
    return data.replace("/", ".")


def make_rdo_key(numero_os: str, data: str) -> str:
    return f"{numero_os}-{date_part(data)}"


# ─────────────────────────────────────────────────────────────────────────────
# Google Sheets
# ─────────────────────────────────────────────────────────────────────────────

def build_service():
    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS_FILE, scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds)


def get_existing_rdo_info(service) -> tuple[dict, set[str]]:
    """
    Lê a aba RDO e retorna:
    - content_map: {(data, turma, encarregado, numeroOS) → numero_rdo}  (apenas não-deletados)
    - all_numbers: set de TODOS os Números RDO (incluindo deletados) — usado para evitar colisões
    """
    try:
        result = service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID, range=f"{SHEET_RDO}!B:S"
        ).execute()
        values = result.get("values", [])
    except HttpError as e:
        print(f"  Aviso: nao foi possivel ler aba RDO ({e}).")
        return {}, set()

    # Colunas relativas a B (índice 0):
    # 0=numero_rdo, 1=data, 2=turma, 3=encarregado, 4=local, 5=os, ..., 17=deletado
    content_map: dict[tuple, str] = {}
    all_numbers: set[str] = set()

    for i, row in enumerate(values):
        if i == 0 or not row:
            continue
        while len(row) < 18:
            row.append("")
        numero_rdo = row[0].strip()
        data_rdo   = row[1].strip()
        turma      = row[2].strip()
        encarregado= row[3].strip()
        numero_os  = row[5].strip()
        deletado   = row[17].strip().lower()
        if numero_rdo:
            all_numbers.add(numero_rdo)
            if deletado != "sim":
                key = (data_rdo, turma, encarregado, numero_os)
                content_map[key] = numero_rdo
    return content_map, all_numbers


def get_existing_related_numbers(service) -> set[str]:
    """
    Retorna Números RDO com dados relacionados (union de Efetivo + HorasImprodutivas + Servicos).
    Cobre todos os tipos de RDO independente do conteúdo.
    """
    existing: set[str] = set()
    for sheet in (SHEET_EFETIVO, SHEET_HI, SHEET_SERVICOS):
        try:
            result = service.spreadsheets().values().get(
                spreadsheetId=SPREADSHEET_ID, range=f"{sheet}!A:A"
            ).execute()
            for row in result.get("values", [])[1:]:
                if row:
                    existing.add(row[0])
        except HttpError:
            pass
    return existing


def append_rows(service, sheet_name: str, rows: list[list]):
    if not rows:
        return
    service.spreadsheets().values().append(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{sheet_name}!A:A",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": rows},
    ).execute()


def mark_deleted(service, sheet_name: str, numero_rdos: list[str]):
    """Marca entradas como Deletado='Sim' na coluna S da aba informada."""
    if not numero_rdos:
        return
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID, range=f"{sheet_name}!B:B"
    ).execute()
    values = result.get("values", [])
    targets = set(numero_rdos)
    updates = []
    for i, row in enumerate(values):
        if i == 0 or not row:
            continue
        if row[0] in targets:
            # Linha no Sheets é 1-based e inclui o cabeçalho (linha 1 = header)
            sheet_row = i + 1
            updates.append({
                "range": f"{sheet_name}!S{sheet_row}",
                "values": [["Sim"]],
            })
    if updates:
        service.spreadsheets().values().batchUpdate(
            spreadsheetId=SPREADSHEET_ID,
            body={"valueInputOption": "RAW", "data": updates},
        ).execute()
    return len(updates)


# ─────────────────────────────────────────────────────────────────────────────
# Construção das linhas para cada aba
# ─────────────────────────────────────────────────────────────────────────────

def build_rows(
    rdos: list[dict],
    content_map: dict,       # {(data, turma, encarregado, numeroOS) → numero_rdo} (não-deletados)
    all_numbers: set[str],   # todos os Números RDO na planilha (incl. deletados) — evita colisão
    existing_related: set[str],
    now_str: str,
):
    """
    Atribui Número RDO a cada RDO e monta linhas para todas as abas.
    Usa deduplicação por conteúdo: (data, turma, encarregado, OS) → numero_rdo existente.
    - Se o RDO já existe (por conteúdo) E tem dados relacionados → ignora completamente.
    - Se o RDO já existe mas SEM dados relacionados → grava só os dados relacionados.
    - Se o RDO é novo → gera número novo sem colisão, grava tudo.
    """
    counters: dict[str, int] = defaultdict(int)
    # Cópia mutável para reservar números gerados dentro do lote
    reserved = set(all_numbers)

    rdo_rows, svc_rows, mat_rows, hi_rows, efe_rows, equ_rows = [], [], [], [], [], []
    skipped = 0
    related_only = 0

    for rdo in rdos:
        # Tenta encontrar RDO existente por conteúdo (idempotente em re-runs)
        content_key = (rdo["data"], rdo["codigoTurma"], rdo["encarregado"], rdo["numeroOS"])
        existing_numero = content_map.get(content_key)

        if existing_numero:
            numero_rdo = existing_numero
            rdo_exists = True
        else:
            # Gera novo número evitando colisões com tudo já na planilha e no lote
            key = make_rdo_key(rdo["numeroOS"], rdo["data"])
            counters[key] += 1
            numero_rdo = f"{key}-{counters[key]:03d}"
            while numero_rdo in reserved:
                counters[key] += 1
                numero_rdo = f"{key}-{counters[key]:03d}"
            reserved.add(numero_rdo)  # reserva para o restante do lote
            rdo_exists = False

        related_exists = numero_rdo in existing_related

        if rdo_exists and related_exists:
            print(f"  IGNORADO (completo): {numero_rdo}")
            skipped += 1
            continue

        if rdo_exists and not related_exists:
            print(f"  COMPLEMENTANDO (RDO ok, relacionados ausentes): {numero_rdo}")
            related_only += 1

        e = rdo["efetivo"]
        total_efetivo = sum(e.values())

        # ── Aba RDO (apenas se é um RDO novo) ───────────────────────────────
        if not rdo_exists:
            rdo_rows.append([
            "",                          # A: ID (vazio para registros importados)
            numero_rdo,                  # B: Número RDO
            rdo["data"],                 # C: Data
            rdo["codigoTurma"],          # D: Código Turma
            rdo["encarregado"],          # E: Encarregado
            rdo["local"],                # F: Local
            rdo["numeroOS"],             # G: Número OS
            rdo["statusOS"],             # H: Status OS
            rdo["kmInicio"],             # I: KM Início
            rdo["kmFim"],                # J: KM Fim
            rdo["horarioInicio"],        # K: Horário Início
            rdo["horarioFim"],           # L: Horário Fim
            rdo["clima"],                # M: Clima
            rdo["temaDDS"],              # N: Tema DDS
            rdo["houveServico"],         # O: Houve Serviço
            rdo["houveTransporte"],      # P: Houve Transporte
            rdo["nomeColaboradores"],    # Q: Nome Colaboradores
            rdo["observacoes"],          # R: Observações
            "Não",                       # S: Deletado
            now_str,                     # T: Data Sincronização
            now_str,                     # U: Data Criação
            APP_VERSION,                 # V: Versão App
            ])  # fim do if not rdo_exists

        # ── Aba Servicos ──────────────────────────────────────────────────────
        for s in rdo["servicos"]:
            svc_rows.append([
                numero_rdo, rdo["numeroOS"], rdo["data"], rdo["codigoTurma"], rdo["encarregado"],
                s["descricao"], s["quantidade"], s["unidade"],
                "",     # Observações
                "NÃO",  # É Customizado?
                "",     # HH Manual
            ])

        # ── Aba Materiais ─────────────────────────────────────────────────────
        for m in rdo["materiais"]:
            mat_rows.append([
                numero_rdo, rdo["numeroOS"], rdo["data"], rdo["codigoTurma"], rdo["encarregado"],
                m["descricao"], m["quantidade"], m["unidade"],
            ])

        # ── Aba HorasImprodutivas ─────────────────────────────────────────────
        for hi in rdo["horasImprodutivas"]:
            hi_rows.append([
                numero_rdo, rdo["numeroOS"], rdo["data"], rdo["codigoTurma"], rdo["encarregado"],
                hi["tipo"], hi["descricao"], hi["horaInicio"], hi["horaFim"],
                total_efetivo,  # Operadores
            ])

        # ── Aba Efetivo ───────────────────────────────────────────────────────
        if total_efetivo > 0:
            efe_rows.append([
                numero_rdo, rdo["numeroOS"], rdo["data"], rdo["codigoTurma"], rdo["encarregado"],
                e["encarregado"], e["operadores"], e["operadorEGP"],
                e["tecnicoSeguranca"], e["soldador"], e["motoristas"],
            ])

        # ── Aba Equipamentos ──────────────────────────────────────────────────
        for eq in rdo["equipamentos"]:
            equ_rows.append([
                numero_rdo, rdo["numeroOS"], rdo["data"], rdo["codigoTurma"], rdo["encarregado"],
                eq["tipo"], eq["placa"],
            ])

    return rdo_rows, svc_rows, mat_rows, hi_rows, efe_rows, equ_rows, skipped, related_only


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Importar RDOs para Google Sheets")
    parser.add_argument("--dry-run", action="store_true", help="Simula sem gravar")
    parser.add_argument("--cleanup-orphans", action="store_true",
                        help="Marca como Deletado entradas do lote sem dados relacionados")
    args = parser.parse_args()

    # 1. Lê e parseia o arquivo
    print(f"Lendo: {TXT_FILE}\n")
    with open(TXT_FILE, encoding="utf-8") as f:
        text = f.read()

    blocks = split_rdos(text)
    print(f"{len(blocks)} blocos encontrados\n")

    rdos = []
    errors = 0
    for i, block in enumerate(blocks, 1):
        rdo = parse_rdo_block(block)
        if rdo:
            rdos.append(rdo)
            svcs  = len(rdo["servicos"])
            mats  = len(rdo["materiais"])
            his   = len(rdo["horasImprodutivas"])
            equs  = len(rdo["equipamentos"])
            print(
                f"  [{i:02d}] {rdo['data']}  OS {rdo['numeroOS']:>8}  {rdo['encarregado']:<30}"
                f"  svc={svcs} mat={mats} hi={his} veic={equs}"
            )
        else:
            print(f"  [{i:02d}] ERRO: não foi possível parsear o bloco")
            errors += 1

    print(f"\n{len(rdos)} RDOs parseados com sucesso, {errors} erros\n")

    # 2. Conecta ao Sheets e verifica existentes
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    if args.dry_run:
        content_map = {}
        all_numbers = set()
        existing_related = set()
        service = None
    else:
        print("Conectando ao Google Sheets...")
        service = build_service()
        content_map, all_numbers = get_existing_rdo_info(service)
        existing_related = get_existing_related_numbers(service)
        print(f"{len(all_numbers)} RDOs ja na planilha ({len(content_map)} ativos)")
        print(f"{len(existing_related)} RDOs com dados relacionados\n")

    # 3. Monta linhas
    rdo_rows, svc_rows, mat_rows, hi_rows, efe_rows, equ_rows, skipped, related_only = build_rows(
        rdos, content_map, all_numbers, existing_related, now_str
    )

    to_insert = len(rdo_rows)
    has_related = bool(svc_rows or mat_rows or hi_rows or efe_rows or equ_rows)

    print(f"\nResumo:")
    print(f"  RDOs novos:              {to_insert}")
    print(f"  RDOs so relacionados:    {related_only}")
    print(f"  RDOs ignorados:          {skipped}")
    print(f"  Linhas Servicos:         {len(svc_rows)}")
    print(f"  Linhas Materiais:        {len(mat_rows)}")
    print(f"  Linhas HI:               {len(hi_rows)}")
    print(f"  Linhas Efetivo:          {len(efe_rows)}")
    print(f"  Linhas Equipamentos:     {len(equ_rows)}")

    if args.dry_run:
        print("\n[DRY-RUN] Nenhuma alteracao feita.")
        if rdo_rows:
            print("\nRDOs que seriam inseridos:")
            for row in rdo_rows:
                print(f"  {row[1]}  |  {row[2]}  |  {row[4]}  |  OS {row[6]}")
        return

    # Limpeza de orphans (--cleanup-orphans)
    if args.cleanup_orphans:
        # Orphans = estao em RDO (ativos) mas NAO em dados relacionados
        # São as entradas da run anterior que travou antes de gravar dados relacionados.
        active_numbers = set(content_map.values())
        orphans = sorted(active_numbers - existing_related)
        # Filtra apenas os do nosso lote (mesmo conjunto de chaves OS+data)
        batch_keys = {make_rdo_key(r["numeroOS"], r["data"]) for r in rdos}
        batch_orphans = [n for n in orphans if any(n.startswith(k + "-") for k in batch_keys)]
        if batch_orphans:
            print(f"\nLimpando {len(batch_orphans)} orphans do lote...")
            count = mark_deleted(service, SHEET_RDO, batch_orphans)
            print(f"  {count} entradas marcadas como Deletado=Sim")
        else:
            print("\nNenhum orphan encontrado no lote.")
        return

    if not to_insert and not has_related:
        print("\nNada a inserir. Planilha ja esta atualizada.")
        return

    # 4. Grava no Sheets
    def write(sheet, rows):
        if not rows:
            return
        append_rows(service, sheet, rows)
        print(f"  OK {sheet}: {len(rows)} linhas")

    print("\nInserindo no Google Sheets...")
    try:
        write(SHEET_RDO,         rdo_rows)
        write(SHEET_SERVICOS,    svc_rows)
        write(SHEET_MATERIAIS,   mat_rows)
        write(SHEET_HI,          hi_rows)
        write(SHEET_EFETIVO,     efe_rows)
        write(SHEET_EQUIPAMENTOS, equ_rows)
        print("\nImportacao concluida com sucesso!")
    except HttpError as e:
        print(f"\nERRO ao inserir dados: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
