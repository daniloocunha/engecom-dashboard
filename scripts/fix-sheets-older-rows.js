/**
 * fix-sheets-older-rows.js
 * Corrige as ~17 linhas de RDOs antigos (v3.x) que ficaram com
 * Observações na coluna Deletado após as correções anteriores.
 *
 * Estado errado (linhas antigas):
 *   P=Houve Transporte, Q=Houve Transporte (DUP!), R=Nome Colab,
 *   S=Observações TEXT, T=Deletado, U=DataSync, V=DataCriacao
 *
 * Estado correto:
 *   P=Houve Transporte, Q=Nome Colab, R=Observações,
 *   S=Deletado, T=DataSync, U=DataCriacao, V=VersaoApp
 */
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const SA_KEY_FILE = './rdo-engecom-3cda2be0f303.json';
const SPREADSHEET_ID = '1wHFUIQ8uRplRBNSV6TEyatR7_ilURZTC0qXWhubb1Fs';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function base64urlEncode(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
async function getAccessToken() {
    const sa = JSON.parse(fs.readFileSync(SA_KEY_FILE));
    const now = Math.floor(Date.now() / 1000);
    const hdr = base64urlEncode(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const pay = base64urlEncode(Buffer.from(JSON.stringify({
        iss: sa.client_email, scope: SCOPES.join(' '),
        aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
    })));
    const unsigned = `${hdr}.${pay}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(unsigned);
    const sig = base64urlEncode(sign.sign(sa.private_key));
    const jwt = `${unsigned}.${sig}`;
    return new Promise((resolve, reject) => {
        const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
        const req = https.request({
            hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
            let d = ''; res.on('data', x => d += x);
            res.on('end', () => { const p = JSON.parse(d); p.access_token ? resolve(p.access_token) : reject(new Error(JSON.stringify(p))); });
        });
        req.on('error', reject); req.write(body); req.end();
    });
}
function apiRequest(token, method, path, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : null;
        const req = https.request({
            hostname: 'sheets.googleapis.com', path, method,
            headers: {
                'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
            }
        }, res => {
            let d = ''; res.on('data', x => d += x);
            res.on('end', () => {
                try {
                    const p = JSON.parse(d);
                    if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(p).slice(0, 400)}`));
                    else resolve(p);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function getValues(token, range) {
    return apiRequest(token, 'GET', `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`);
}
async function valuesBatchUpdate(token, data) {
    return apiRequest(token, 'POST', `/v4/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`, {
        valueInputOption: 'USER_ENTERED', data
    });
}

async function main() {
    console.log('🔑 Obtendo token...');
    const token = await getAccessToken();
    console.log('✅ Token OK\n');

    // Read all data rows
    console.log('📖 Lendo dados (A2:V)...');
    const resp = await getValues(token, 'RDO!A2:V');
    const rows = resp.values || [];
    console.log(`Total linhas: ${rows.length}\n`);

    // Identify misaligned rows: col S (index 18) has non-boolean content
    // In correctly aligned rows, col S = Deletado = "Sim", "Não", or ""
    // In misaligned older rows, col S has Observações text
    const BOOLEAN_VALUES = new Set(['Sim', 'Não', '']);
    const isBoolean = v => BOOLEAN_VALUES.has(String(v || '').trim());

    const misalignedRows = [];
    rows.forEach((row, i) => {
        const colS = row[18] || '';
        if (!isBoolean(colS)) {
            misalignedRows.push({ rowIdx: i, sheetRow: i + 2, row });
        }
    });

    console.log(`Linhas desalinhadas encontradas: ${misalignedRows.length}`);
    misalignedRows.forEach(({ sheetRow, row }) => {
        console.log(`  Linha ${sheetRow}: NumRDO="${row[1]}" | S="${String(row[18]).slice(0, 50)}..."`);
    });

    if (misalignedRows.length === 0) {
        console.log('\n✅ Nenhuma correção necessária!');
        return;
    }

    // Fix: For each misaligned row, the current layout is:
    //   [0-14]: A-O correct
    //   [15]: Houve Transporte (correct)
    //   [16]: Houve Transporte DUPLICATE (wrong - should be Nome Colab)
    //   [17]: Nome Colaboradores (wrong pos)
    //   [18]: Observações TEXT (wrong - this is the Deletado column in header)
    //   [19]: Deletado "Sim"/"Não" (wrong pos)
    //   [20]: Data Sincronização (wrong pos)
    //   [21]: Data Criação (wrong pos)
    //
    // Target layout (22 cols):
    //   [0-14]: A-O unchanged
    //   [15]: Houve Transporte
    //   [16]: Nome Colaboradores
    //   [17]: Observações TEXT
    //   [18]: Deletado ("Sim"/"Não")
    //   [19]: Data Sincronização
    //   [20]: Data Criação
    //   [21]: Versão App (app version ~12-13 for v3.x.x, we'll leave blank if unknown)

    console.log('\n🔧 Aplicando correções...');
    const updates = [];

    misalignedRows.forEach(({ sheetRow, row }) => {
        const padded = [...row];
        while (padded.length < 22) padded.push('');

        // Determine VersaoApp - check if padded[22] exists (unlikely, but try)
        // For v3.x.x rows, versionCode was 12 or 13
        // We'll leave it as empty since we can't recover it
        const versaoApp = padded[22] || '';  // likely empty

        const fixed = [
            ...padded.slice(0, 15),   // A-O: unchanged
            padded[15] || '',         // P: Houve Transporte (keep as-is)
            padded[17] || '',         // Q: Nome Colaboradores (was at [17])
            padded[18] || '',         // R: Observações (was at [18], the long text)
            padded[19] || '',         // S: Deletado (was at [19])
            padded[20] || '',         // T: Data Sincronização (was at [20])
            padded[21] || '',         // U: Data Criação (was at [21])
            versaoApp,                // V: Versão App (lost, leave empty or try padded[22])
        ];

        console.log(`  Linha ${sheetRow}: S="${padded[18].slice(0,30)}..." → Del="${padded[19]}"`);
        updates.push({
            range: `RDO!A${sheetRow}:V${sheetRow}`,
            values: [fixed]
        });
    });

    console.log(`\n📝 Enviando ${updates.length} correção(ões)...`);
    await valuesBatchUpdate(token, updates);
    console.log('✅ Correções aplicadas!\n');

    // Verify
    console.log('📖 Verificação rápida - Contagem de Deletado após correção...');
    const verResp = await getValues(token, 'RDO!S2:S');
    const delRows = verResp.values || [];
    const delCounts = {};
    delRows.forEach(r => {
        const v = String(r[0] || '');
        delCounts[v] = (delCounts[v] || 0) + 1;
    });
    console.log('Valores em Deletado (col S):');
    Object.entries(delCounts).sort().forEach(([k, v]) => {
        const preview = k.length > 50 ? k.slice(0, 50) + '...' : k;
        console.log(`  "${preview}": ${v}`);
    });

    const problematic = Object.entries(delCounts).filter(([k]) => !isBoolean(k));
    if (problematic.length === 0) {
        console.log('\n✅ Todas as linhas Deletado contêm apenas "Sim"/"Não"/"" — correto!');
    } else {
        console.log(`\n⚠️  Ainda há ${problematic.length} valor(es) problemáticos em Deletado.`);
    }

    console.log('\n🎉 Correção de linhas antigas concluída!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
