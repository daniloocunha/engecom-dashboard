#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import json
import re
import time
import requests
from google.oauth2 import service_account
import google.auth.transport.requests

CREDENTIALS_FILE = r"C:\Users\dan\CalculadoraHH\app\src\main\assets\rdo-engecom-0cdcc15ed168.json"
SPREADSHEET_ID   = "1wHFUIQ8uRplRBNSV6TEyatR7_ilURZTC0qXWhubb1Fs"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
BASE = "https://sheets.googleapis.com/v4/spreadsheets"

def get_headers():
    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS_FILE, scopes=SCOPES
    )
    req = google.auth.transport.requests.Request()
    creds.refresh(req)
    return {"Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"}

H = get_headers()

def get_sheet_values(sheet_name):
    url = f"{BASE}/{SPREADSHEET_ID}/values/'{sheet_name}'?valueRenderOption=UNFORMATTED_VALUE"
    r = requests.get(url, headers=H)
    r.raise_for_status()
    return r.json().get("values", [])

def batch_update_values(data_list):
    if not data_list:
        return
    url = f"{BASE}/{SPREADSHEET_ID}/values:batchUpdate"
    body = {"valueInputOption": "USER_ENTERED", "data": data_list, "includeValuesInResponse": False}
    r = requests.post(url, headers=H, json=body)
    r.raise_for_status()
    return r.json()

TMC_CORRECT = "TMC 810 - Iguacu"  # usar sem acento especial para comparar
TMC_CORRECT_REAL = "TMC 810 - Iguaçu"  # valor real a gravar

def is_wrong_tmc(turma):
    t = turma.lower().replace('ç', 'c').replace('ú', 'u').replace('u', 'u')
    return 'iguacu' in t and turma != TMC_CORRECT_REAL

print("=" * 60)
print("OPERACAO 6 - Unificar 'TMC 810 - Iguacu'")
print("=" * 60)

SHEETS = ["RDO", "HorasImprodutivas", "Servicos", "Materiais", "Efetivo", "Equipamentos", "TransporteSucatas"]
TURMA_COL = {"RDO": ("D", 3), "HorasImprodutivas": ("D", 3), "Servicos": ("D", 3),
             "Materiais": ("D", 3), "Efetivo": ("D", 3), "Equipamentos": ("D", 3), "TransporteSucatas": ("D", 3)}

report = []
all_updates = []

for sheet_name in SHEETS:
    try:
        vals = get_sheet_values(sheet_name)
    except Exception as e:
        print(f"  [WARN] Nao foi possivel ler {sheet_name}: {e}")
        continue
    if not vals:
        continue
    col_letter, col_idx = TURMA_COL[sheet_name]
    count = 0
    for i, row in enumerate(vals[1:], 2):
        if len(row) <= col_idx:
            continue
        turma = str(row[col_idx])
        if is_wrong_tmc(turma):
            all_updates.append({
                "range": f"'{sheet_name}'!{col_letter}{i}",
                "values": [[TMC_CORRECT_REAL]]
            })
            report.append(f"{sheet_name} linha {i}: '{turma}' -> '{TMC_CORRECT_REAL}'")
            print(f"  [{sheet_name}] Linha {i}: '{turma}' -> '{TMC_CORRECT_REAL}'")
            count += 1
    if count == 0:
        print(f"  [{sheet_name}] Nenhuma correcao necessaria.")

print(f"\nTotal correcoes de turma: {len(report)}")
if all_updates:
    for start in range(0, len(all_updates), 100):
        batch = all_updates[start:start+100]
        batch_update_values(batch)
        time.sleep(0.5)
    print(f"[OK] {len(all_updates)} celula(s) atualizadas.")
else:
    print("[OK] Nenhuma atualizacao necessaria.")

print()
print("=== RELATORIO OP6 ===")
for msg in report:
    print(f"  - {msg}")
print("\n[CONCLUIDO]")
