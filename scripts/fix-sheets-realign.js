/**
 * fix-sheets-realign.js
 * Após deletar a coluna P "Causa Não Serviço", todas as linhas ficaram
 * com os dados deslocados (a app sempre escreveu 22 cols sem essa coluna).
 *
 * Estado atual (errado):
 *   Header: P=Houve Transporte, Q=Nome Colab, R=Obs, S=Deletado, T=DataSync, U=DataCriacao, V=VersaoApp
 *   Dados:  P=Nome Colab,        Q=Obs,        R=Del, S=DataSync,  T=DataCriacao, U=VersaoApp, V=(vazio)
 *
 * Correção: inserir célula vazia em P para cada linha de dados,
 * depois reconstruir "Houve Transporte" a partir da aba TransporteSucatas.
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
    const header = base64urlEncode(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const payload = base64urlEncode(Buffer.from(JSON.stringify({
        iss: sa.client_email, scope: SCOPES.join(' '),
        aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
    })));
    const unsigned = `${header}.${payload}`;
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
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                const parsed = JSON.parse(data);
                if (parsed.access_token) resolve(parsed.access_token);
                else reject(new Error(`Token error: ${JSON.stringify(parsed)}`));
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
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
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 400)}`));
                    else resolve(parsed);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function getValues(token, range) {
    return apiRequest(token, 'GET', `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`);
}
async function clearRange(token, range) {
    return apiRequest(token, 'POST', `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:clear`, {});
}
async function updateRange(token, range, values) {
    return apiRequest(token, 'PUT', `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, { values });
}
async function valuesBatchUpdate(token, data) {
    return apiRequest(token, 'POST', `/v4/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`, {
        valueInputOption: 'USER_ENTERED', data
    });
}

// Column index to letter
function colLetter(idx) {
    let s = '';
    idx++;
    while (idx > 0) {
        s = String.fromCharCode(64 + (idx % 26 || 26)) + s;
        idx = Math.floor((idx - 1) / 26);
    }
    return s;
}

async function main() {
    console.log('🔑 Obtendo token...');
    const token = await getAccessToken();
    console.log('✅ Token OK\n');

    // ── Diagnóstico: ler headers e amostra de dados ──────────────────────────
    console.log('📖 Lendo headers atuais...');
    const h = await getValues(token, 'RDO!1:1');
    const headers = h.values ? h.values[0] : [];
    console.log('Headers:');
    headers.forEach((col, i) => console.log(`  ${colLetter(i)} (${i+1}): ${col}`));

    // ── Ler TODOS os dados (linhas 2+) ────────────────────────────────────────
    console.log('\n📖 Lendo todos os dados...');
    const allResp = await getValues(token, 'RDO!A2:V');
    const dataRows = allResp.values || [];
    console.log(`Total de linhas de dados: ${dataRows.length}`);

    // Mostrar amostra do estado atual
    console.log('\nAmostra (primeiras 3 linhas, colunas N-V):');
    for (let i = 0; i < Math.min(3, dataRows.length); i++) {
        const row = dataRows[i];
        const slice = row.slice(13, 22); // N=13 to V=21
        console.log(`  Linha ${i+2}: ${JSON.stringify(slice)}`);
    }

    // ── Verificar alinhamento ─────────────────────────────────────────────────
    // Col S (index 18) deve ser Deletado (valores: "Sim", "", ou vazio)
    // Col P (index 15) deve ser Houve Transporte (Sim/Não)
    // Se col S tiver timestamps, está errado
    const sampleS = dataRows.slice(0, 10).map(r => r[18] || '');
    const sampleP = dataRows.slice(0, 10).map(r => r[15] || '');
    const hasTimestampInS = sampleS.some(v => /^\d{4}-\d{2}-\d{2}/.test(String(v)));
    const hasNamesInP = sampleP.some(v => String(v).length > 10 && /[a-z]{3,}/.test(String(v).toLowerCase()));

    console.log(`\nDiagnóstico:`);
    console.log(`  Col S (Deletado?) amostras: ${JSON.stringify(sampleS.slice(0, 5))}`);
    console.log(`  Col P (Houve Transporte?) amostras: ${JSON.stringify(sampleP.slice(0, 3).map(v => String(v).slice(0, 30)))}`);
    console.log(`  hasTimestampInS: ${hasTimestampInS}`);
    console.log(`  hasNamesInP: ${hasNamesInP}`);

    if (!hasTimestampInS && !hasNamesInP) {
        console.log('\n✅ Dados parecem já alinhados! Nenhuma correção necessária.');
        return;
    }

    console.log('\n⚠️  Dados desalinhados detectados. Aplicando correção...');

    // ── Ler TransporteSucatas para reconstruir Houve Transporte ──────────────
    console.log('\n📖 Lendo TransporteSucatas para reconstruir "Houve Transporte"...');
    const tsResp = await getValues(token, 'TransporteSucatas!A:B');
    const tsRows = tsResp.values || [];
    // Col A = Número RDO, Col B = Número OS (header row first)
    // Build set of RDOs that have transport records
    const rdosComTransporte = new Set();
    for (let i = 1; i < tsRows.length; i++) {
        const rdoNum = tsRows[i][0];
        if (rdoNum) rdosComTransporte.add(String(rdoNum).trim());
    }
    console.log(`  ${rdosComTransporte.size} RDOs com registros de transporte`);

    // ── Corrigir dados: inserir coluna P (Houve Transporte) ──────────────────
    // Estado atual das linhas de dados (21 cols A-U):
    //   A-O (15 cols): corretos
    //   P (idx 15): Nome Colaboradores ← ERRADO, deveria ser Houve Transporte
    //   Q (idx 16): Observações
    //   R (idx 17): Deletado
    //   S (idx 18): Data Sincronização
    //   T (idx 19): Data Criação
    //   U (idx 20): Versão App
    //   V (idx 21): vazio
    //
    // Queremos que fique (22 cols A-V):
    //   A-O (15 cols): sem mudança
    //   P (idx 15): Houve Transporte ← inserir "Sim" ou "Não"
    //   Q (idx 16): Nome Colaboradores
    //   R (idx 17): Observações
    //   S (idx 18): Deletado
    //   T (idx 19): Data Sincronização
    //   U (idx 20): Data Criação
    //   V (idx 21): Versão App

    const correctedRows = dataRows.map((row, i) => {
        // Pad row to 22 cols
        const padded = [...row];
        while (padded.length < 22) padded.push('');

        // Get Número RDO from col B (index 1) to determine Houve Transporte
        const numeroRDO = String(padded[1] || '').trim();
        const houveTransporte = rdosComTransporte.has(numeroRDO) ? 'Sim' : 'Não';

        // Current layout (after wrong deletion):
        // idx 0-14: A-O (correct)
        // idx 15: Nome Colaboradores (wrong, should be Houve Transporte)
        // idx 16: Observações (wrong pos)
        // idx 17: Deletado (wrong pos)
        // idx 18: Data Sincronização (wrong pos)
        // idx 19: Data Criação (wrong pos)
        // idx 20: Versão App (wrong pos)

        const fixed = [
            ...padded.slice(0, 15),         // A-O (idx 0-14): unchanged
            houveTransporte,                 // P (idx 15): Houve Transporte
            padded[15] || '',               // Q (idx 16): Nome Colaboradores
            padded[16] || '',               // R (idx 17): Observações
            padded[17] || '',               // S (idx 18): Deletado
            padded[18] || '',               // T (idx 19): Data Sincronização
            padded[19] || '',               // U (idx 20): Data Criação
            padded[20] || '',               // V (idx 21): Versão App
        ];
        return fixed;
    });

    // Show sample of corrected data
    console.log('\nAmostra corrigida (primeiras 3 linhas, colunas N-V):');
    for (let i = 0; i < Math.min(3, correctedRows.length); i++) {
        const row = correctedRows[i];
        const slice = row.slice(13, 22);
        console.log(`  Linha ${i+2}: ${JSON.stringify(slice)}`);
    }

    // ── Write corrected data back ─────────────────────────────────────────────
    console.log(`\n🔧 Escrevendo ${correctedRows.length} linhas corrigidas...`);

    // Process in batches of 100 to avoid request size limits
    const BATCH_SIZE = 100;
    let written = 0;
    for (let start = 0; start < correctedRows.length; start += BATCH_SIZE) {
        const end = Math.min(start + BATCH_SIZE, correctedRows.length);
        const batch = correctedRows.slice(start, end);
        const startRow = start + 2; // +2 because we skip header (row 1) and it's 1-based
        const endRow = startRow + batch.length - 1;
        const range = `RDO!A${startRow}:V${endRow}`;

        await updateRange(token, range, batch);
        written += batch.length;
        process.stdout.write(`\r  Escrito: ${written}/${correctedRows.length}`);
    }
    console.log('\n✅ Dados escritos!\n');

    // ── Verificação final ─────────────────────────────────────────────────────
    console.log('📖 Verificação final - primeiras 5 linhas de dados (colunas O-V)...');
    const checkResp = await getValues(token, 'RDO!O2:V6');
    const checkRows = checkResp.values || [];
    const checkHeaders = headers.slice(14, 22); // O-V
    console.log(`Headers O-V: ${checkHeaders.join(' | ')}`);
    checkRows.forEach((row, i) => {
        console.log(`  Linha ${i+2}: ${row.map(v => String(v || '').slice(0, 20)).join(' | ')}`);
    });

    // Check Deletado column S
    console.log('\n📖 Coluna S (Deletado) - amostra...');
    const delResp = await getValues(token, 'RDO!S2:S10');
    const delRows = delResp.values || [];
    delRows.forEach((row, i) => console.log(`  S${i+2}: "${row[0] || ''}"`));

    // Count how many have transport
    const simCount = correctedRows.filter(r => r[15] === 'Sim').length;
    const naoCount = correctedRows.filter(r => r[15] === 'Não').length;
    console.log(`\n📊 Houve Transporte reconstruído:`);
    console.log(`   Sim: ${simCount} RDOs`);
    console.log(`   Não: ${naoCount} RDOs`);

    console.log('\n🎉 Realinhamento concluído!');
}

main().catch(err => {
    console.error('\n❌ Erro fatal:', err.message);
    process.exit(1);
});
