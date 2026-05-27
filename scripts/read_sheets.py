#!/usr/bin/env python3
"""
Script para ler dados do Google Sheets usando conta de serviço.
Gera JWT manualmente usando rsa + base64 + json.
"""

import json
import time
import base64
import urllib.request
import urllib.parse
import urllib.error
import rsa

# ============================================================
# Credenciais da conta de serviço
# ============================================================
SERVICE_ACCOUNT_EMAIL = "rdo-sync-service@rdo-engecom.iam.gserviceaccount.com"
TOKEN_URI = "https://oauth2.googleapis.com/token"
SPREADSHEET_ID = "1wHFUIQ8uRplRBNSV6TEyatR7_ilURZTC0qXWhubb1Fs"

PRIVATE_KEY_PEM = """-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDCA1+0BrD0sesU
t8HAYWeeIlR2vPK5YdTf03G1j56myvY5um3TGFclBQl6pSsaqUimuvC22KWzes8e
4/4PdAjIPOC+oAwhO4JnPMrawi5HOjkbbcOnVAyhemH8/NL8UZU9UtY5RUMDZvYl
R0y6c0GgeViQrWPB8ISIuzpwRELjWaRJTsytVN1Mi+d/kEET/f+QtCkSFSgSZdVl
Q+RM/PkewZwRVOmdFOKggJt3UfAGSeOOANrfIbHVENN6CUHVsWY1m4gdT6/YoPib
t59pn84ZEdrPq+jl6adhRmsmzJEYXlPs22ck/FKskPBSdf8FAwyTBMejJC8r+s/+
1Dd6iGKDAgMBAAECggEAOe/t/YHeCES1cgtqBbxQyC1yUb8dMPUhL/Ihy9lmxGJp
41VkBJ0JMRnu+bwnQh/5fSjoR4ItAYsUHSJytUSudrWPW/3JgYcW6yOBZJCGZ2jg
sus1eVulJfe5GWaazxTB331EUff4CiUOLpW7ORbAK17xbssItlrQCVD4I5yO6PtP
2G20DNuCth0UYBEI2A4efilO5OZv6eEPkOfAG2wwfgnmfiaAEH6z6i9SPAQNT4zw
PRRWyqpJQ/FJW8a4wulFtXZ7uH3pMOwDU3T570Xv+GAyMwxMRoT31vA38qwRCJts
yZOy5NWUdiLSI9Tv+bdCw+vxDeU1x7pgaywvM3yreQKBgQDoA8xicChEI8Wf8S2J
Pw2HG/j26r6dCS2CRiMrzIDmh9JqHBGIwoTRoC6QMa31kAsUBRLSUX9swrblpJ5u
pgqTL6wapaWaijN7Rexboz1T2c73IYAVSv9FZ9K1wXjmyua0GZSS89qo/FXnFopS
OXHOtGtvvqhskjJLdKY8ReOcTwKBgQDWEd+K3h+Wt9bsuQXfkcVjlrryWAhgQiWj
yjsQmOpRHJzb6dFaJLuRKo35SCX0r3uSnk8bJ15vUadwy6vUET0murF5wBwE6ygR
VfJvms1G+vBys0DHBiWetXH/GzZKRO7IgYDtOJ7XEZKUrXWB70Y0hxFOPb3pswox
gpkbN9ZFjQKBgG9UO0NU3A1uOMr5eEcuCTi2lG0u0M4bdEnZi9DdbVCxBadC1qsP
45mOyikInZeCSb6OfKyMzJ8Mg6SHrDod1F8x9dxHdcJE5FUXhUWne6r7jZMJ8SLG
fNz556KtNm1QGQl8aM1m05pYkoOzTiYMSG7OJetVyg1mzVllnMq5InGDAoGAQAjQ
qaWQJXGQpPcjvqDIPuYTvfJ/buvafog76tcTIHhCo7XpneFnCiGEnpDqaaskd9NL
LoA0S3BNefwyxhjyBefKtvS0bPQ65BSllKTlytm9m1Hrip1YG4WDOCBXuRetpeS3
QD6zpPnosvjAMcH1ajkNAC6P5Jxd7Dl4ux+UxPECgYEAvm+c2Z1K+J7de1rBGmwC
xCLvul4X4TC3SYvVWTWlc0sPEAeAVPCbEBNVaQw9QvSYkBP5F/0WjpLESO8ZvFfB
HHFF/Wlb0qsTs+LiUCLWrLdPttvxx+pGAjQ75O9FXMFZYP2XkEowRtlj/doEjTQp
qtKn8y6Dx0uVLEJyZh77HzU=
-----END PRIVATE KEY-----"""

SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly"
SHEETS_TO_READ = ["RDO", "HorasImprodutivas", "Servicos"]

def list_sheets(access_token: str) -> list:
    """Lista todas as abas da planilha."""
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}?fields=sheets.properties.title"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    return [s["properties"]["title"] for s in data.get("sheets", [])]


def b64url_encode(data: bytes) -> str:
    """Base64url encode sem padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def create_jwt() -> str:
    """Cria um JWT assinado com RS256."""
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {
        "iss": SERVICE_ACCOUNT_EMAIL,
        "scope": SCOPES,
        "aud": TOKEN_URI,
        "iat": now,
        "exp": now + 3600,
    }

    header_b64 = b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")

    # A chave está em formato PKCS8 ("BEGIN PRIVATE KEY").
    # Converte para PKCS1 via openssl para usar com o módulo rsa.
    import subprocess, tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".pem", delete=False, mode="w") as tmp:
        tmp.write(PRIVATE_KEY_PEM.strip())
        tmp_path = tmp.name
    try:
        result = subprocess.run(
            ["openssl", "pkcs8", "-inform", "PEM", "-nocrypt", "-in", tmp_path,
             "-out", "-", "-traditional"],
            capture_output=True, timeout=10
        )
        if result.returncode != 0:
            raise RuntimeError(f"openssl error: {result.stderr.decode()}")
        pkcs1_pem = result.stdout
    finally:
        os.unlink(tmp_path)

    private_key = rsa.PrivateKey.load_pkcs1(pkcs1_pem)
    signature = rsa.sign(signing_input, private_key, "SHA-256")
    signature_b64 = b64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def get_access_token(jwt_token: str) -> str:
    """Troca o JWT por um token de acesso OAuth2."""
    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt_token,
    }).encode("utf-8")

    req = urllib.request.Request(
        TOKEN_URI,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode())
    return result["access_token"]


def read_sheet(access_token: str, sheet_name: str) -> dict:
    """Lê todos os valores de uma aba da planilha."""
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}"
        f"/values/{urllib.parse.quote(sheet_name)}"
    )
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def format_sheet_data(sheet_name: str, data: dict) -> str:
    """Formata os dados da aba em texto estruturado."""
    values = data.get("values", [])
    if not values:
        return f"\n=== {sheet_name} ===\n(sem dados)\n"

    lines = [f"\n{'='*60}", f"ABA: {sheet_name}", f"Total de linhas: {len(values)}", f"{'='*60}"]

    # Primeira linha = headers
    headers = values[0] if values else []
    lines.append(f"HEADERS ({len(headers)} colunas): {headers}")
    lines.append("-" * 60)

    # Demais linhas = dados
    data_rows = values[1:] if len(values) > 1 else []
    lines.append(f"TOTAL DE REGISTROS (excl. header): {len(data_rows)}")
    lines.append("")

    # Mostrar todas as linhas
    for i, row in enumerate(data_rows, start=1):
        # Pad row to header length for alignment
        padded = row + [""] * (len(headers) - len(row))
        row_dict = dict(zip(headers, padded))
        lines.append(f"  Linha {i}: {json.dumps(row_dict, ensure_ascii=False)}")

    return "\n".join(lines)


def main():
    import sys
    # Forçar UTF-8 no stdout para suportar caracteres especiais no Windows
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')

    print("Gerando JWT...")
    jwt_token = create_jwt()
    print("JWT gerado com sucesso.")

    print("Obtendo token de acesso OAuth2...")
    access_token = get_access_token(jwt_token)
    print("Token de acesso obtido com sucesso.")

    print("\nListando abas disponíveis na planilha...")
    available_sheets = list_sheets(access_token)
    print(f"Abas encontradas: {available_sheets}")
    print()

    # Usar as abas disponíveis se a lista original tiver problemas
    sheets_to_fetch = []
    for wanted in SHEETS_TO_READ:
        # Busca exata ou case-insensitive
        match = next((s for s in available_sheets if s == wanted), None)
        if not match:
            match = next((s for s in available_sheets if s.lower() == wanted.lower()), None)
        if match:
            sheets_to_fetch.append(match)
        else:
            print(f"AVISO: Aba '{wanted}' não encontrada. Abas disponíveis: {available_sheets}")
            sheets_to_fetch.append(wanted)  # tenta assim mesmo

    results = {}
    for sheet_name in sheets_to_fetch:
        print(f"Lendo aba: {sheet_name}...")
        try:
            data = read_sheet(access_token, sheet_name)
            results[sheet_name] = data
            values = data.get("values", [])
            print(f"  -> {len(values)} linhas encontradas (incluindo header)")
        except urllib.error.HTTPError as e:
            error_body = e.read().decode()
            print(f"  -> ERRO HTTP {e.code}: {error_body}")
            results[sheet_name] = {"error": str(e), "detail": error_body}
        except Exception as e:
            print(f"  -> ERRO: {e}")
            results[sheet_name] = {"error": str(e)}

    print()
    print("=" * 60)
    print("DADOS COMPLETOS DAS ABAS")
    print("=" * 60)

    for sheet_name in SHEETS_TO_READ:
        data = results.get(sheet_name, {})
        if "error" in data:
            print(f"\n=== {sheet_name} ===")
            print(f"ERRO: {data['error']}")
            if "detail" in data:
                print(f"Detalhe: {data['detail']}")
        else:
            print(format_sheet_data(sheet_name, data))

    # Salvar resultado completo em JSON
    output_path = "C:/Users/dan/CalculadoraHH/sheets_data.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nDados completos salvos em: {output_path}")


if __name__ == "__main__":
    main()
