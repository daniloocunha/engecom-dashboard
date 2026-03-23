/**
 * fix-sheets-data.js
 * Corrige inconsistências na planilha Google Sheets:
 * 1. Remove coluna P "Causa Não Serviço" da aba RDO (e realinha dados)
 * 2. Atualiza Config tab (versao_minima=16, versao_recomendada=16, forcar_update=NAO)
 * 3. Remove linhas duplicadas de Número RDO
 */

const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

// ─── Config ──────────────────────────────────────────────────────────────────
const SA_KEY_FILE = './rdo-engecom-3cda2be0f303.json';
const SPREADSHEET_ID = '1wHFUIQ8uRplRBNSV6TEyatR7_ilURZTC0qXWhubb1Fs';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ─── JWT / OAuth2 ─────────────────────────────────────────────────────────────
function base64urlEncode(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken() {
    const sa = JSON.parse(fs.readFileSync(SA_KEY_FILE));
    const now = Math.floor(Date.now() / 1000);
    const header = base64urlEncode(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const payload = base64urlEncode(Buffer.from(JSON.stringify({
        iss: sa.client_email,
        scope: SCOPES.join(' '),
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    })));
    const unsigned = `${header}.${payload}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(unsigned);
    const sig = base64urlEncode(sign.sign(sa.private_key));
    const jwt = `${unsigned}.${sig}`;

    return new Promise((resolve, reject) => {
        const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
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

// ─── Sheets API helpers ───────────────────────────────────────────────────────
function apiRequest(token, method, path, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : null;
        const req = https.request({
            hostname: 'sheets.googleapis.com',
            path,
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
            }
        }, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 300)}`));
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

async function batchUpdate(token, requests) {
    return apiRequest(token, 'POST', `/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, { requests });
}

async function valuesBatchUpdate(token, data) {
    return apiRequest(token, 'POST', `/v4/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`, {
        valueInputOption: 'USER_ENTERED',
        data
    });
}

async function getSpreadsheetInfo(token) {
    return apiRequest(token, 'GET', `/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🔑 Obtendo token de acesso...');
    const token = await getAccessToken();
    console.log('✅ Token obtido\n');

    // Get sheet IDs
    console.log('📋 Obtendo informações das abas...');
    const info = await getSpreadsheetInfo(token);
    const sheetMap = {};
    info.sheets.forEach(s => { sheetMap[s.properties.title] = s.properties.sheetId; });
    console.log('Abas encontradas:', Object.keys(sheetMap).join(', '), '\n');

    const rdoSheetId = sheetMap['RDO'];
    if (rdoSheetId === undefined) throw new Error('Aba RDO não encontrada!');

    // ── Step 1: Read RDO headers ──────────────────────────────────────────────
    console.log('📖 Lendo headers da aba RDO...');
    const headersResp = await getValues(token, 'RDO!1:1');
    const headers = headersResp.values ? headersResp.values[0] : [];
    console.log(`Headers (${headers.length} colunas):`, headers.map((h, i) => `${i+1}:${h}`).join(', '));

    // Check if "Causa Não Serviço" exists at column P (index 15)
    const colPIndex = 15; // P = index 15 (0-based)
    const colPHeader = headers[colPIndex];
    console.log(`\nColuna P (índice ${colPIndex}): "${colPHeader}"`);

    if (!colPHeader || !colPHeader.toString().includes('Causa')) {
        console.log('⚠️  Coluna P não parece ser "Causa Não Serviço". Headers atuais:');
        headers.forEach((h, i) => console.log(`  ${String.fromCharCode(65+i)} (${i+1}): ${h}`));

        // Look for the column anywhere
        const causeIdx = headers.findIndex(h => h && h.toString().includes('Causa'));
        if (causeIdx === -1) {
            console.log('\n✅ Coluna "Causa Não Serviço" não encontrada — já foi removida ou nunca existiu.');
            console.log('   Pulando etapa 1 (remoção de coluna).');
        } else {
            console.log(`\n⚠️  Encontrou "Causa" na coluna ${String.fromCharCode(65+causeIdx)} (índice ${causeIdx})`);
        }
    } else {
        console.log(`\n🔧 Deletando coluna P (índice ${colPIndex}) "Causa Não Serviço"...`);

        // Delete column P using deleteDimension
        const deleteResp = await batchUpdate(token, [{
            deleteDimension: {
                range: {
                    sheetId: rdoSheetId,
                    dimension: 'COLUMNS',
                    startIndex: colPIndex,  // 0-based, inclusive
                    endIndex: colPIndex + 1  // exclusive
                }
            }
        }]);
        console.log('✅ Coluna P deletada. Todas as linhas foram realinhadas automaticamente.\n');
    }

    // Verify headers after deletion
    console.log('📖 Verificando headers após operação...');
    const newHeadersResp = await getValues(token, 'RDO!1:1');
    const newHeaders = newHeadersResp.values ? newHeadersResp.values[0] : [];
    console.log(`Headers agora (${newHeaders.length} colunas):`);
    newHeaders.forEach((h, i) => console.log(`  ${String.fromCharCode(65+i)} (${i+1}): ${h}`));

    // Expected 22-column headers per SheetsConstants.kt
    const expected22 = [
        "ID", "Número RDO", "Data", "Código Turma", "Encarregado",
        "Local", "Número OS", "Status OS", "KM Início", "KM Fim",
        "Horário Início", "Horário Fim", "Clima", "Tema DDS",
        "Houve Serviço", "Houve Transporte", "Nome Colaboradores",
        "Observações", "Deletado", "Data Sincronização", "Data Criação",
        "Versão App"
    ];
    console.log(`\n🎯 Headers esperados (22): ${expected22.join(', ')}`);
    if (newHeaders.length === 22) {
        console.log('✅ Contagem de colunas correta: 22');
        let mismatches = 0;
        expected22.forEach((exp, i) => {
            if (newHeaders[i] !== exp) {
                console.log(`  ⚠️  Col ${i+1}: esperado "${exp}", encontrado "${newHeaders[i]}"`);
                mismatches++;
            }
        });
        if (mismatches === 0) console.log('✅ Todos os headers batem!');
    } else {
        console.log(`⚠️  Contagem incorreta: ${newHeaders.length} (esperado 22)`);
    }

    // ── Step 2: Check for duplicates ──────────────────────────────────────────
    console.log('\n📖 Lendo todos os Números RDO para checar duplicatas...');
    const allDataResp = await getValues(token, 'RDO!A:B');
    const allRows = allDataResp.values || [];
    console.log(`Total de linhas (incluindo header): ${allRows.length}`);

    // Map: numeroRDO -> [rowIndex (1-based)]
    const rdoMap = {};
    for (let i = 1; i < allRows.length; i++) { // skip header row 0
        const rdo = allRows[i][1]; // Column B = Número RDO
        if (!rdo) continue;
        if (!rdoMap[rdo]) rdoMap[rdo] = [];
        rdoMap[rdo].push(i + 1); // 1-based row number in sheet
    }

    const duplicates = Object.entries(rdoMap).filter(([_, rows]) => rows.length > 1);
    if (duplicates.length === 0) {
        console.log('✅ Nenhum Número RDO duplicado encontrado.\n');
    } else {
        console.log(`⚠️  ${duplicates.length} Número(s) RDO duplicado(s):`);
        duplicates.forEach(([rdo, rows]) => console.log(`  "${rdo}" → linhas: ${rows.join(', ')}`));

        // For each duplicate, keep the last occurrence (most recent sync) and delete others
        // We need to delete rows from bottom to top to preserve indices
        const rowsToDelete = [];
        for (const [rdo, rows] of duplicates) {
            // Keep last row (highest number), delete all others
            const toKeep = rows[rows.length - 1];
            const toDelete = rows.slice(0, -1);
            console.log(`  "${rdo}": mantendo linha ${toKeep}, deletando linhas ${toDelete.join(', ')}`);
            rowsToDelete.push(...toDelete);
        }

        // Sort descending so we delete from bottom to top (preserve indices)
        rowsToDelete.sort((a, b) => b - a);
        console.log(`\n🔧 Deletando ${rowsToDelete.length} linha(s) duplicada(s)...`);

        // Build batch delete requests (each row deletion shifts indices, so process in reverse)
        const deleteRequests = rowsToDelete.map(rowNum => ({
            deleteDimension: {
                range: {
                    sheetId: rdoSheetId,
                    dimension: 'ROWS',
                    startIndex: rowNum - 1,  // 0-based
                    endIndex: rowNum          // exclusive
                }
            }
        }));

        await batchUpdate(token, deleteRequests);
        console.log('✅ Duplicatas removidas.\n');
    }

    // ── Step 3: Update Config tab ─────────────────────────────────────────────
    console.log('📖 Lendo aba Config...');
    const configResp = await getValues(token, 'Config!A:C');
    const configRows = configResp.values || [];
    console.log('Config atual:');
    configRows.forEach((row, i) => console.log(`  [${i+1}] ${row.join(' | ')}`));

    // Build update map
    const updates = {
        'versao_minima': '16',
        'versao_recomendada': '16',
        'forcar_update': 'NAO',
        'mensagem_aviso': 'Nova versão 5.0.0 disponível - Melhorias de estabilidade e sincronização!',
        'mensagem_bloqueio': 'Atualize para continuar usando o aplicativo'
    };

    const configUpdates = [];
    for (let i = 0; i < configRows.length; i++) {
        const key = configRows[i][0];
        if (key && updates[key] !== undefined) {
            const rowNum = i + 1;
            const newVal = updates[key];
            console.log(`  Atualizando "${key}" na linha ${rowNum}: "${configRows[i][1]}" → "${newVal}"`);
            configUpdates.push({
                range: `Config!B${rowNum}`,
                values: [[newVal]]
            });
        }
    }

    if (configUpdates.length > 0) {
        await valuesBatchUpdate(token, configUpdates);
        console.log(`✅ ${configUpdates.length} campo(s) do Config atualizados.\n`);
    } else {
        console.log('⚠️  Nenhum campo do Config encontrado para atualizar.\n');
    }

    // ── Step 4: Verify Deletado column alignment ──────────────────────────────
    console.log('📖 Verificando amostras da coluna "Deletado" (deve ser coluna S)...');
    const deletadoResp = await getValues(token, 'RDO!S1:S20');
    const deletadoRows = deletadoResp.values || [];
    console.log('Primeiras 20 linhas da coluna S (Deletado):');
    deletadoRows.forEach((row, i) => {
        const val = row[0] !== undefined ? `"${row[0]}"` : '(vazio)';
        console.log(`  S${i+1}: ${val}`);
    });

    // Check for "Sim" in column P (should now be Houve Transporte)
    console.log('\n📖 Verificando coluna P (Houve Transporte) - deve conter Sim/Não...');
    const transResp = await getValues(token, 'RDO!P1:P20');
    const transRows = transResp.values || [];
    transRows.forEach((row, i) => {
        const val = row[0] !== undefined ? `"${row[0]}"` : '(vazio)';
        console.log(`  P${i+1}: ${val}`);
    });

    console.log('\n🎉 Correções concluídas!');
    console.log('\nResumo:');
    console.log('  ✅ Coluna "Causa Não Serviço" verificada/removida da aba RDO');
    console.log('  ✅ Duplicatas de Número RDO verificadas/removidas');
    console.log('  ✅ Config atualizado (versao_minima=16, versao_recomendada=16, forcar_update=NAO)');
}

main().catch(err => {
    console.error('❌ Erro fatal:', err.message);
    process.exit(1);
});
