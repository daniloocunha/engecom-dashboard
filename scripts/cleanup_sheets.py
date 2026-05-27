#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
cleanup_sheets.py — Limpeza e normalização dos dados do Google Sheets (RDOs ferroviários)
"""

import json
import re
import time
import os
import requests
from google.oauth2 import service_account

# ── Configuração ────────────────────────────────────────────────────────────────
CREDENTIALS_FILE = r"C:\Users\dan\CalculadoraHH\app\src\main\assets\rdo-engecom-0cdcc15ed168.json"
SPREADSHEET_ID   = "1wHFUIQ8uRplRBNSV6TEyatR7_ilURZTC0qXWhubb1Fs"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# IDs de aba (sheetId) — serão obtidos via API
SHEET_IDS = {}

# Relatório
report = {
    "op1_header": [],
    "op2_deleted": [],
    "op3_hi_normalized": [],
    "op4_hi_ortho": [],
    "op5_rdo_ortho": [],
    "op6_turma": [],
    "errors": [],
}

# ── Autenticação ─────────────────────────────────────────────────────────────────
def get_token():
    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS_FILE, scopes=SCOPES
    )
    creds.refresh(requests.Request())
    return creds.token

def get_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Renova token antes de cada bloco de chamadas
TOKEN = None
def headers():
    global TOKEN
    if TOKEN is None:
        creds = service_account.Credentials.from_service_account_file(
            CREDENTIALS_FILE, scopes=SCOPES
        )
        import google.auth.transport.requests
        req = google.auth.transport.requests.Request()
        creds.refresh(req)
        TOKEN = creds.token
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def refresh_token():
    global TOKEN
    TOKEN = None
    return headers()

# ── Funções de API ────────────────────────────────────────────────────────────────
BASE = "https://sheets.googleapis.com/v4/spreadsheets"

def get_spreadsheet_meta():
    url = f"{BASE}/{SPREADSHEET_ID}?fields=sheets(properties(sheetId,title))"
    r = requests.get(url, headers=headers())
    r.raise_for_status()
    return r.json()

def get_sheet_values(sheet_name, range_notation=None):
    rng = range_notation or f"'{sheet_name}'"
    url = f"{BASE}/{SPREADSHEET_ID}/values/{rng}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING"
    r = requests.get(url, headers=headers())
    r.raise_for_status()
    return r.json().get("values", [])

def batch_update_values(data_list):
    """data_list: [{"range": "Sheet!A1", "values": [[...]]}]"""
    if not data_list:
        return
    url = f"{BASE}/{SPREADSHEET_ID}/values:batchUpdate"
    body = {
        "valueInputOption": "USER_ENTERED",
        "data": data_list,
        "includeValuesInResponse": False,
    }
    r = requests.post(url, headers=headers(), json=body)
    r.raise_for_status()
    return r.json()

def batch_delete_rows(delete_requests):
    """delete_requests: list of deleteDimension request dicts"""
    if not delete_requests:
        return
    url = f"{BASE}/{SPREADSHEET_ID}:batchUpdate"
    body = {"requests": delete_requests}
    r = requests.post(url, headers=headers(), json=body)
    r.raise_for_status()
    return r.json()

# ── Utilidades ────────────────────────────────────────────────────────────────────
TRAIN_CODE_PATTERN = re.compile(r'\b([A-Za-z]{1,2})[\s]?(\d{2,3})\b')

def extract_train_codes(text):
    """Retorna lista de códigos de trem encontrados no texto (normalizados para maiúsculas sem espaço)."""
    matches = TRAIN_CODE_PATTERN.findall(text)
    codes = [f"{letters.upper()}{digits}" for letters, digits in matches]
    # Deduplicar mantendo ordem
    seen = set()
    result = []
    for c in codes:
        if c not in seen:
            seen.add(c)
            result.append(c)
    return result

def is_train_description(text):
    """Retorna True se o texto parece ser uma descrição de passagem de trem."""
    low = text.lower().strip()
    # Contém código de trem?
    codes = extract_train_codes(text)
    if not codes:
        return False
    # Verificar que não é uma frase narrativa longa sobre outra coisa
    # Se tem código de trem e é relativamente curto OU tem palavras-chave de trem → True
    train_keywords = ['trem', 'passando', 'cruzamento', 'cruzando', 'desviada', 'parado na', 'auto de linha', 'auto  ']
    if any(kw in low for kw in train_keywords):
        return True
    # Se o texto é basicamente só o código (após remover prefixos comuns), retorna True
    cleaned = re.sub(r'^(trem\.?\s*|auto\s*)', '', low, flags=re.IGNORECASE).strip()
    # Se depois de limpar sobra apenas o código de trem (com ou sem texto menor)
    if len(cleaned) <= 10:
        return True
    return False

def normalize_hi_description(tipo, desc):
    """
    Normaliza a descrição de HI conforme as regras 3A/3B/3C/3D.
    Retorna (novo_tipo, nova_desc, changed).
    """
    original_desc = desc
    original_tipo = tipo

    codes = extract_train_codes(desc)

    if not codes:
        return tipo, desc, False

    # Verificar se é uma descrição de trem
    low = desc.lower()
    train_keywords = ['trem', 'passando', 'cruzamento', 'cruzando', 'desviada', 'parado', 'auto de linha', 'auto  ', 'boletim', 'principal']
    has_train_context = any(kw in low for kw in train_keywords)

    # Se não há contexto de trem e a descrição é longa, pode ser texto com número (ex: "sem O.S proxima 001")
    if not has_train_context and len(codes) == 1 and len(desc) > 20:
        # Verificar se o código está no meio de uma frase não relacionada
        # Ex: "Sem intervalo junto ao CCo." — não é trem
        return tipo, desc, False

    # Curto com só código(s)
    is_short = len(desc.strip()) <= 30

    # Regra 3B — Cruzamento (2 trens)
    if len(codes) >= 2 and ('cruzamento' in low or 'cruzando' in low or 'com' in low):
        nova_desc = f"Trem '{codes[0]}' em cruzamento com o trem '{codes[1]}'."
        novo_tipo = "Passagens de Trem"
        changed = (nova_desc != original_desc or novo_tipo != original_tipo)
        return novo_tipo, nova_desc, changed

    # Regra 3B alternativa — dois códigos sem "cruzamento" explícito mas separados por "com" / "x" / espaço
    if len(codes) >= 2:
        nova_desc = f"Trem '{codes[0]}' em cruzamento com o trem '{codes[1]}'."
        novo_tipo = "Passagens de Trem"
        changed = (nova_desc != original_desc or novo_tipo != original_tipo)
        return novo_tipo, nova_desc, changed

    # Regra 3C — Trem único passando
    if len(codes) == 1 and (is_short or has_train_context):
        nova_desc = f"Trem '{codes[0]}' passando pelo boletim."
        novo_tipo = "Passagens de Trem"
        changed = (nova_desc != original_desc or novo_tipo != original_tipo)
        return novo_tipo, nova_desc, changed

    return tipo, desc, False


INTERSTICIO_PATTERN = re.compile(
    r'\b(interticio|iterticio|inrerticio|intersticio)\b', re.IGNORECASE
)
TAGUIAMENTO_PATTERN = re.compile(r'\btaguiamento\b', re.IGNORECASE)
FINALIZACAO_PATTERN = re.compile(r'\b(finalizacao|finaliza[oõ])\b', re.IGNORECASE)
PROXIMO_PATTERN     = re.compile(r'\bproximo\b', re.IGNORECASE)

def fix_ortho_hi(desc):
    """Corrige erros ortográficos em descrições de HI (não-trem)."""
    original = desc
    desc = INTERSTICIO_PATTERN.sub('Interstício', desc)
    desc = TAGUIAMENTO_PATTERN.sub('tagueamento', desc)
    desc = FINALIZACAO_PATTERN.sub('Finalização', desc)
    desc = PROXIMO_PATTERN.sub('próximo', desc)
    return desc, desc != original

def fix_ortho_rdo_obs(obs):
    """Corrige erros ortográficos em Observações do RDO."""
    original = obs
    obs = re.sub(r'\btrwm\b', 'trem', obs, flags=re.IGNORECASE)
    obs = INTERSTICIO_PATTERN.sub('interstício', obs)
    obs = TAGUIAMENTO_PATTERN.sub('tagueamento', obs)
    obs = re.sub(r'\bareia de viv[eê]ncia\b', 'área de vivência', obs, flags=re.IGNORECASE)
    obs = re.sub(r'\bbandeirando treixo\b', 'bandeando trecho', obs, flags=re.IGNORECASE)
    # também "bandeirando trexo" variações
    obs = re.sub(r'\bbandeirando tr[ée]xo\b', 'bandeando trecho', obs, flags=re.IGNORECASE)
    obs = re.sub(r'\binrpodutividade\b', 'improdutividade', obs, flags=re.IGNORECASE)
    obs = re.sub(r'\bimrpodutividade\b', 'improdutividade', obs, flags=re.IGNORECASE)
    obs = re.sub(r'\bFinalizao\b', 'Finalização', obs)
    obs = re.sub(r'08::', '08:', obs)
    obs = re.sub(r'\bsem O\.S proxima\b', 'sem O.S. próxima', obs, flags=re.IGNORECASE)
    return obs, obs != original

TMC_CORRECT = "TMC 810 - Iguaçu"

def is_wrong_tmc(turma):
    """Retorna True se o turma é uma variação errada do TMC Iguaçu."""
    t = turma.lower().replace('ç', 'c').replace('ú', 'u')
    if 'iguacu' not in t:
        return False
    return turma != TMC_CORRECT

# ════════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("LIMPEZA E NORMALIZAÇÃO — Google Sheets RDO Engecom")
    print("=" * 70)
    print()

    # Obter metadados do Sheets
    print("[INFO] Obtendo metadados da planilha...")
    meta = get_spreadsheet_meta()
    for sheet in meta["sheets"]:
        props = sheet["properties"]
        SHEET_IDS[props["title"]] = props["sheetId"]
    print(f"[INFO] Abas encontradas: {list(SHEET_IDS.keys())}")
    print()

    # ──────────────────────────────────────────────────────────────────────────
    # OPERAÇÃO 1 — Corrigir header da aba RDO
    # ──────────────────────────────────────────────────────────────────────────
    print("=" * 50)
    print("OPERAÇÃO 1 — Corrigir header da aba RDO")
    print("=" * 50)

    CORRECT_HEADERS = [
        "ID", "Número RDO", "Data", "Código Turma", "Encarregado", "Local",
        "Número OS", "Status OS", "KM Início", "KM Fim", "Horário Início",
        "Horário Fim", "Clima", "Tema DDS", "Houve Serviço", "Houve Transporte",
        "Nome Colaboradores", "Observações", "Deletado", "Data Sincronização",
        "Data Criação", "Versão App"
    ]

    # Ler header atual
    current_header_raw = get_sheet_values("RDO", "RDO!A1:Z1")
    current_header = current_header_raw[0] if current_header_raw else []
    print(f"  Header atual  ({len(current_header)} colunas): {current_header}")
    print(f"  Header correto ({len(CORRECT_HEADERS)} colunas): {CORRECT_HEADERS}")

    if current_header != CORRECT_HEADERS:
        # Limpar até coluna W (23 colunas) e escrever o correto
        update_data = [
            {"range": "RDO!A1:W1", "values": [CORRECT_HEADERS + [""] * (23 - len(CORRECT_HEADERS))]}
        ]
        batch_update_values(update_data)
        report["op1_header"].append(f"Header atualizado de {len(current_header)} para {len(CORRECT_HEADERS)} colunas")
        print(f"  [OK] Header atualizado.")
    else:
        report["op1_header"].append("Header já estava correto.")
        print("  [OK] Header já estava correto.")
    print()

    # ──────────────────────────────────────────────────────────────────────────
    # OPERAÇÃO 2 — Deletar RDOs "sem OS-" de dezembro/2025
    # ──────────────────────────────────────────────────────────────────────────
    print("=" * 50)
    print("OPERAÇÃO 2 — Marcar/Deletar RDOs 'sem OS-' dez/2025")
    print("=" * 50)

    TARGET_RDOS = ["sem OS-27.12.25-001", "sem OS-28.12.25-001", "sem OS-29.12.25-001"]

    # Ler dados completos de todas as abas relacionadas
    rdo_values = get_sheet_values("RDO", "RDO!A:W")
    hi_values  = get_sheet_values("HorasImprodutivas", "HorasImprodutivas!A:J")
    srv_values = get_sheet_values("Servicos", "Servicos!A:K")

    # Tentar ler abas opcionais (podem não ter dados para esses RDOs)
    def safe_get(sheet):
        try:
            return get_sheet_values(sheet, f"'{sheet}'!A:Z")
        except Exception as e:
            print(f"  [WARN] Não foi possível ler {sheet}: {e}")
            return []

    mat_values = safe_get("Materiais")
    efe_values = safe_get("Efetivo")
    eqp_values = safe_get("Equipamentos")
    trn_values = safe_get("TransporteSucatas")

    def find_rows_with_rdo(values, rdo_num, col_idx=0):
        """Retorna índices (0-based) das linhas que contêm o numero_rdo na coluna col_idx."""
        found = []
        for i, row in enumerate(values):
            if len(row) > col_idx and str(row[col_idx]).strip() == rdo_num:
                found.append(i)
        return found

    value_updates = []  # Para marcar Deletado=Sim no RDO

    for target_rdo in TARGET_RDOS:
        print(f"\n  Processando: {target_rdo}")

        # 2a. Marcar como Deletado=Sim na aba RDO (col S = índice 18)
        rdo_rows = find_rows_with_rdo(rdo_values, target_rdo, col_idx=1)
        if rdo_rows:
            for row_idx in rdo_rows:
                sheet_row = row_idx + 1  # 1-based
                # Verificar status atual
                current_deletado = rdo_values[row_idx][18] if len(rdo_values[row_idx]) > 18 else ""
                if current_deletado != "Sim":
                    value_updates.append({
                        "range": f"RDO!S{sheet_row}",
                        "values": [["Sim"]]
                    })
                    report["op2_deleted"].append(f"RDO!S{sheet_row} -> Sim ({target_rdo})")
                    print(f"    [RDO] Linha {sheet_row} marcada como Deletado=Sim")
                else:
                    print(f"    [RDO] Linha {sheet_row} já estava marcada como Deletado=Sim")
        else:
            print(f"    [WARN] {target_rdo} não encontrado na aba RDO")
            report["errors"].append(f"Op2: {target_rdo} não encontrado na aba RDO")

    # Aplicar marcações de Deletado antes de deletar linhas relacionadas
    if value_updates:
        batch_update_values(value_updates)
        print(f"\n  [OK] {len(value_updates)} célula(s) marcadas como Deletado=Sim")

    # 2b. Deletar linhas nas abas relacionadas
    # Precisamos deletar em ordem reversa para não deslocar índices

    def build_delete_requests(values, target_rdos, sheet_id, col_idx=0):
        """Encontra linhas e retorna requests de deleteDimension (em ordem reversa)."""
        rows_to_delete = []
        for target_rdo in target_rdos:
            for i, row in enumerate(values):
                if len(row) > col_idx and str(row[col_idx]).strip() == target_rdo:
                    rows_to_delete.append(i)  # 0-based
        rows_to_delete = sorted(set(rows_to_delete), reverse=True)
        requests_list = []
        for row_idx in rows_to_delete:
            requests_list.append({
                "deleteDimension": {
                    "range": {
                        "sheetId": sheet_id,
                        "dimension": "ROWS",
                        "startIndex": row_idx,
                        "endIndex": row_idx + 1,
                    }
                }
            })
        return requests_list, rows_to_delete

    all_delete_requests = []

    for sheet_name, values, col_idx in [
        ("HorasImprodutivas", hi_values, 0),
        ("Servicos", srv_values, 0),
        ("Materiais", mat_values, 0),
        ("Efetivo", efe_values, 0),
        ("Equipamentos", eqp_values, 0),
        ("TransporteSucatas", trn_values, 0),
    ]:
        if not values:
            continue
        sheet_id = SHEET_IDS.get(sheet_name)
        if sheet_id is None:
            print(f"  [WARN] SheetId não encontrado para {sheet_name}")
            report["errors"].append(f"Op2: SheetId não encontrado para {sheet_name}")
            continue
        reqs, deleted_rows = build_delete_requests(values, TARGET_RDOS, sheet_id, col_idx)
        if reqs:
            all_delete_requests.extend(reqs)
            for r in deleted_rows:
                report["op2_deleted"].append(f"{sheet_name}: linha {r+1} deletada")
            print(f"  [{sheet_name}] {len(reqs)} linha(s) a deletar: {[r+1 for r in deleted_rows]}")
        else:
            print(f"  [{sheet_name}] Nenhuma linha encontrada para os RDOs alvo.")

    if all_delete_requests:
        batch_delete_rows(all_delete_requests)
        print(f"\n  [OK] {len(all_delete_requests)} linha(s) deletada(s) nas abas relacionadas.")
    else:
        print("\n  [OK] Nenhuma linha para deletar nas abas relacionadas.")
    print()

    # ──────────────────────────────────────────────────────────────────────────
    # OPERAÇÃO 3 & 4 — Normalizar HI (descrições + ortografia)
    # ──────────────────────────────────────────────────────────────────────────
    print("=" * 50)
    print("OPERAÇÕES 3 & 4 — Normalizar HorasImprodutivas")
    print("=" * 50)

    # Reler HI após deleções
    time.sleep(1)
    hi_values = get_sheet_values("HorasImprodutivas", "HorasImprodutivas!A:J")
    print(f"  Total linhas HI (com header): {len(hi_values)}")

    hi_updates = []  # {"range": "...", "values": [[...]]}

    for i, row in enumerate(hi_values[1:], 2):  # pula header, 1-based
        if len(row) < 7:
            continue
        tipo_orig = row[5] if len(row) > 5 else ""
        desc_orig = row[6]

        tipo_new  = tipo_orig
        desc_new  = desc_orig

        # Op 3 — Normalizar trem
        codes = extract_train_codes(desc_orig)
        if codes and is_train_description(desc_orig):
            tipo_new, desc_new, changed3 = normalize_hi_description(tipo_orig, desc_orig)
            if changed3:
                report["op3_hi_normalized"].append(
                    f"HI linha {i}: {desc_orig!r} → {desc_new!r} | Tipo: {tipo_orig!r} → {tipo_new!r}"
                )
        else:
            # Op 4 — Ortografia (apenas se não é trem)
            desc_fixed, changed4 = fix_ortho_hi(desc_orig)
            if changed4:
                desc_new = desc_fixed
                report["op4_hi_ortho"].append(f"HI linha {i}: {desc_orig!r} → {desc_new!r}")

        # Construir update
        updates_needed = []
        if desc_new != desc_orig:
            updates_needed.append(("G", desc_new))
        if tipo_new != tipo_orig:
            updates_needed.append(("F", tipo_new))

        for col, val in updates_needed:
            hi_updates.append({"range": f"HorasImprodutivas!{col}{i}", "values": [[val]]})

    print(f"  Op3 normalizações de trem:  {len(report['op3_hi_normalized'])}")
    print(f"  Op4 correções ortográficas: {len(report['op4_hi_ortho'])}")

    if hi_updates:
        # Fazer em lotes de 100
        BATCH_SIZE = 100
        for start in range(0, len(hi_updates), BATCH_SIZE):
            batch = hi_updates[start:start + BATCH_SIZE]
            batch_update_values(batch)
            time.sleep(0.5)
        print(f"  [OK] {len(hi_updates)} célula(s) atualizadas em HorasImprodutivas.")
    else:
        print("  [OK] Nenhuma atualização necessária em HorasImprodutivas.")
    print()

    # ──────────────────────────────────────────────────────────────────────────
    # OPERAÇÃO 5 — Corrigir ortografia em Observações do RDO
    # ──────────────────────────────────────────────────────────────────────────
    print("=" * 50)
    print("OPERAÇÃO 5 — Ortografia em RDO.Observações")
    print("=" * 50)

    # Reler RDO após op2
    time.sleep(1)
    rdo_values = get_sheet_values("RDO", "RDO!A:W")
    print(f"  Total linhas RDO (com header): {len(rdo_values)}")

    rdo_obs_updates = []

    for i, row in enumerate(rdo_values[1:], 2):
        if len(row) < 18:
            continue
        obs_orig = row[17]  # coluna R (índice 17)
        if not obs_orig:
            continue
        obs_fixed, changed = fix_ortho_rdo_obs(obs_orig)
        if changed:
            rdo_obs_updates.append({"range": f"RDO!R{i}", "values": [[obs_fixed]]})
            report["op5_rdo_ortho"].append(f"RDO linha {i}: {obs_orig!r} → {obs_fixed!r}")

    print(f"  Correções ortográficas RDO: {len(report['op5_rdo_ortho'])}")
    if rdo_obs_updates:
        for start in range(0, len(rdo_obs_updates), 100):
            batch = rdo_obs_updates[start:start + 100]
            batch_update_values(batch)
            time.sleep(0.5)
        print(f"  [OK] {len(rdo_obs_updates)} célula(s) atualizadas.")
    else:
        print("  [OK] Nenhuma correção necessária.")
    print()

    # ──────────────────────────────────────────────────────────────────────────
    # OPERAÇÃO 6 — Unificar nome de turma TMC Iguaçu
    # ──────────────────────────────────────────────────────────────────────────
    print("=" * 50)
    print("OPERAÇÃO 6 — Unificar 'TMC 810 - Iguaçu'")
    print("=" * 50)

    SHEET_TURMA_COL = {
        "RDO":              ("D", 3),
        "HorasImprodutivas": ("D", 3),
        "Servicos":         ("D", 3),
        "Materiais":        ("D", 3),
        "Efetivo":          ("D", 3),
        "Equipamentos":     ("D", 3),
        "TransporteSucatas": ("D", 3),
    }

    turma_updates = []

    for sheet_name, (col_letter, col_idx) in SHEET_TURMA_COL.items():
        try:
            vals = get_sheet_values(sheet_name, f"'{sheet_name}'!A:Z")
        except Exception as e:
            print(f"  [WARN] Não foi possível ler {sheet_name}: {e}")
            continue

        if not vals:
            continue

        for i, row in enumerate(vals[1:], 2):  # pula header
            if len(row) <= col_idx:
                continue
            turma = row[col_idx]
            if is_wrong_tmc(turma):
                turma_updates.append({
                    "range": f"'{sheet_name}'!{col_letter}{i}",
                    "values": [[TMC_CORRECT]]
                })
                report["op6_turma"].append(f"{sheet_name} linha {i}: {turma!r} → {TMC_CORRECT!r}")
                print(f"  [{sheet_name}] Linha {i}: {turma!r} → {TMC_CORRECT!r}")

    print(f"  Total correções de turma: {len(report['op6_turma'])}")
    if turma_updates:
        for start in range(0, len(turma_updates), 100):
            batch = turma_updates[start:start + 100]
            batch_update_values(batch)
            time.sleep(0.5)
        print(f"  [OK] {len(turma_updates)} célula(s) atualizadas.")
    else:
        print("  [OK] Nenhuma correção necessária.")
    print()

    # ──────────────────────────────────────────────────────────────────────────
    # RELATÓRIO FINAL
    # ──────────────────────────────────────────────────────────────────────────
    print()
    print("=" * 70)
    print("RELATÓRIO FINAL")
    print("=" * 70)

    print(f"\n[OP1] Header RDO:")
    for msg in report["op1_header"]:
        print(f"  • {msg}")

    print(f"\n[OP2] RDOs duplicados deletados ({len(report['op2_deleted'])} ações):")
    for msg in report["op2_deleted"]:
        print(f"  • {msg}")

    print(f"\n[OP3] Normalizações de trem em HI ({len(report['op3_hi_normalized'])} linhas):")
    for msg in report["op3_hi_normalized"][:20]:
        print(f"  • {msg}")
    if len(report['op3_hi_normalized']) > 20:
        print(f"  ... e mais {len(report['op3_hi_normalized'])-20} normalizações")

    print(f"\n[OP4] Correções ortográficas em HI ({len(report['op4_hi_ortho'])} linhas):")
    for msg in report["op4_hi_ortho"]:
        print(f"  • {msg}")

    print(f"\n[OP5] Correções ortográficas em RDO.Observações ({len(report['op5_rdo_ortho'])} linhas):")
    for msg in report["op5_rdo_ortho"][:20]:
        print(f"  • {msg}")
    if len(report['op5_rdo_ortho']) > 20:
        print(f"  ... e mais {len(report['op5_rdo_ortho'])-20} correções")

    print(f"\n[OP6] Unificação de turma TMC ({len(report['op6_turma'])} linhas):")
    for msg in report["op6_turma"]:
        print(f"  • {msg}")

    if report["errors"]:
        print(f"\n[ERROS] ({len(report['errors'])} erros):")
        for msg in report["errors"]:
            print(f"  ! {msg}")

    total_changes = (
        len(report["op2_deleted"]) +
        len(report["op3_hi_normalized"]) +
        len(report["op4_hi_ortho"]) +
        len(report["op5_rdo_ortho"]) +
        len(report["op6_turma"])
    )
    print(f"\nTotal de alterações realizadas: {total_changes}")
    print("\n[CONCLUÍDO]")

    # Salvar relatório JSON
    report_path = r"C:\Users\dan\CalculadoraHH\cleanup_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"Relatório completo salvo em: {report_path}")


if __name__ == "__main__":
    main()
