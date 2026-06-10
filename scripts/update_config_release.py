#!/usr/bin/env python3
"""
Atualiza a aba Config do Google Sheets após um release do app.

Uso:
  python scripts/update_config_release.py                    # só mostra os valores atuais
  python scripts/update_config_release.py --apply \
      --versao 24 --hash fa68... --tamanho 6.77 \
      --url https://github.com/.../app-release.apk

Autentica com a conta de serviço (rdo-engecom-0cdcc15ed168.json na raiz do
repo — a mesma usada pelo app Android, que tem permissão de escrita).

⚠️ NÃO atualiza versao_minima (bloqueio de versões antigas é decisão manual).
⚠️ hash_md5: usar MD5 enquanto houver aparelhos com versionCode <= 23 em campo
   (versões antigas só calculam MD5). SHA-256 só após todos migrarem para 24+.
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

import rsa

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREDENTIALS_FILE = os.path.join(REPO_ROOT, "rdo-engecom-0cdcc15ed168.json")
SPREADSHEET_ID = "1wHFUIQ8uRplRBNSV6TEyatR7_ilURZTC0qXWhubb1Fs"
TOKEN_URI = "https://oauth2.googleapis.com/token"
SCOPES = "https://www.googleapis.com/auth/spreadsheets"

CHAVES_RELEASE = ["versao_recomendada", "hash_md5", "tamanho_apk_mb", "url_download"]


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def criar_jwt(client_email: str, private_key_pem: str) -> str:
    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(json.dumps({
        "iss": client_email, "scope": SCOPES, "aud": TOKEN_URI,
        "iat": now, "exp": now + 3600,
    }, separators=(",", ":")).encode())
    signing_input = f"{header}.{payload}".encode("ascii")

    # PKCS8 → PKCS1 via openssl (módulo rsa só lê PKCS1)
    with tempfile.NamedTemporaryFile(suffix=".pem", delete=False, mode="w") as tmp:
        tmp.write(private_key_pem.strip())
        tmp_path = tmp.name
    try:
        result = subprocess.run(
            ["openssl", "pkcs8", "-inform", "PEM", "-nocrypt", "-in", tmp_path,
             "-out", "-", "-traditional"],
            capture_output=True, timeout=10,
        )
        if result.returncode != 0:
            raise RuntimeError(f"openssl: {result.stderr.decode()}")
        pkcs1_pem = result.stdout
    finally:
        os.unlink(tmp_path)

    key = rsa.PrivateKey.load_pkcs1(pkcs1_pem)
    assinatura = b64url(rsa.sign(signing_input, key, "SHA-256"))
    return f"{header}.{payload}.{assinatura}"


def obter_token() -> str:
    with open(CREDENTIALS_FILE, encoding="utf-8") as f:
        cred = json.load(f)
    jwt_token = criar_jwt(cred["client_email"], cred["private_key"])
    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt_token,
    }).encode()
    req = urllib.request.Request(TOKEN_URI, data=data, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())["access_token"]


def ler_config(token: str) -> list:
    url = (f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}"
           f"/values/{urllib.parse.quote('Config')}!A:B")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode()).get("values", [])


def atualizar_celula(token: str, linha: int, valor: str) -> None:
    """Escreve `valor` em Config!B<linha> (linha 1-based)."""
    rng = urllib.parse.quote(f"Config!B{linha}")
    url = (f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}"
           f"/values/{rng}?valueInputOption=RAW")
    body = json.dumps({"values": [[valor]]}).encode()
    req = urllib.request.Request(url, data=body, method="PUT", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        json.loads(resp.read().decode())


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="aplica as alterações (sem isso, só mostra)")
    ap.add_argument("--versao", help="versionCode recomendado (ex: 24)")
    ap.add_argument("--hash", dest="hash_", help="hash do APK (MD5 32 chars ou SHA-256 64 chars)")
    ap.add_argument("--tamanho", help="tamanho do APK em MB (ex: 6.77)")
    ap.add_argument("--url", help="URL de download do GitHub Release")
    ap.add_argument("--mensagem", help="texto da mensagem_aviso exibida no app")
    args = ap.parse_args()

    token = obter_token()
    valores = ler_config(token)

    linhas = {}  # chave -> (numero da linha 1-based, valor atual)
    for i, row in enumerate(valores, start=1):
        chave = str(row[0]).strip() if row else ""
        atual = str(row[1]) if len(row) > 1 else ""
        if chave:
            linhas[chave] = (i, atual)

    print("Valores atuais da aba Config:")
    for chave, (linha, atual) in linhas.items():
        print(f"  B{linha:>2}  {chave:<22} = {atual}")

    if not args.apply:
        print("\n(modo leitura — use --apply com --versao/--hash/--tamanho/--url para atualizar)")
        return

    novos = {
        "versao_recomendada": args.versao,
        "hash_md5": args.hash_,
        "tamanho_apk_mb": args.tamanho,
        "url_download": args.url,
        "mensagem_aviso": args.mensagem,
    }
    print("\nAtualizando:")
    for chave, valor in novos.items():
        if valor is None:
            continue
        if chave not in linhas:
            print(f"  ⚠️ chave '{chave}' não encontrada na aba Config — pulando")
            continue
        linha, atual = linhas[chave]
        atualizar_celula(token, linha, valor)
        print(f"  ✅ {chave}: '{atual}' → '{valor}'")

    print("\nConcluído. Releitura de verificação:")
    for row in ler_config(token):
        chave = str(row[0]).strip() if row else ""
        if chave in CHAVES_RELEASE:
            print(f"  {chave:<22} = {row[1] if len(row) > 1 else ''}")


if __name__ == "__main__":
    main()
