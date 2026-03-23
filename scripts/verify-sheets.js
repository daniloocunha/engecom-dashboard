/**
 * verify-sheets.js — Verifica o estado final da planilha
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
            let data = ''; res.on('data', d => data += d);
            res.on('end', () => { const p = JSON.parse(data); p.access_token ? resolve(p.access_token) : reject(new Error(JSON.stringify(p))); });
        });
        req.on('error', reject); req.write(body); req.end();
    });
}
function apiGet(token, range) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'sheets.googleapis.com',
            path: `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
            headers: { 'Authorization': `Bearer ${token}` }
        }, res => {
            let data = ''; res.on('data', d => data += d);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        req.on('error', reject); req.end();
    });
}

async function main() {
    const token = await getAccessToken();
    console.log('✅ Token OK\n');

    // 1. Headers
    const hResp = await apiGet(token, 'RDO!1:1');
    const headers = hResp.values ? hResp.values[0] : [];
    console.log(`=== HEADERS (${headers.length} colunas) ===`);
    headers.forEach((h, i) => process.stdout.write(`${String.fromCharCode(65+i)}=${h}  `));
    console.log('\n');

    // 2. Full data for analysis
    const dataResp = await apiGet(token, 'RDO!A2:V');
    const rows = dataResp.values || [];
    console.log(`=== DADOS: ${rows.length} linhas ===\n`);

    // Count Deletado values
    const delIdx = headers.indexOf('Deletado');
    const transIdx = headers.indexOf('Houve Transporte');
    console.log(`Col Deletado: índice ${delIdx} = ${String.fromCharCode(65+delIdx)}`);
    console.log(`Col Houve Transporte: índice ${transIdx} = ${String.fromCharCode(65+transIdx)}\n`);

    const delCounts = {};
    const transCounts = {};
    let datesInDel = 0;
    rows.forEach(row => {
        const del = row[delIdx] || '';
        const trans = row[transIdx] || '';
        delCounts[del] = (delCounts[del] || 0) + 1;
        transCounts[trans] = (transCounts[trans] || 0) + 1;
        if (/^\d{2}\/\d{2}\/\d{4}/.test(del) || /^\d{4}-\d{2}-\d{2}/.test(del)) datesInDel++;
    });

    console.log('=== Contagem de valores em Deletado ===');
    Object.entries(delCounts).sort().forEach(([k, v]) => console.log(`  "${k}": ${v}`));
    if (datesInDel > 0) console.log(`  ⚠️  ${datesInDel} linhas com datas na coluna Deletado!`);

    console.log('\n=== Contagem de valores em Houve Transporte ===');
    Object.entries(transCounts).sort().forEach(([k, v]) => console.log(`  "${k}": ${v}`));

    // 3. Config
    const cfgResp = await apiGet(token, 'Config!A:B');
    const cfgRows = cfgResp.values || [];
    console.log('\n=== CONFIG ===');
    cfgRows.forEach(r => console.log(`  ${r[0] || ''} | ${r[1] || ''}`));

    // 4. Check for duplicate Número RDOs
    const rdoIdx = headers.indexOf('Número RDO');
    const rdoMap = {};
    rows.forEach((row, i) => {
        const rdo = row[rdoIdx] || '';
        if (!rdoMap[rdo]) rdoMap[rdo] = [];
        rdoMap[rdo].push(i + 2);
    });
    const dups = Object.entries(rdoMap).filter(([_, r]) => r.length > 1);
    console.log(`\n=== DUPLICATAS ===`);
    if (dups.length === 0) console.log('✅ Nenhum Número RDO duplicado!');
    else dups.forEach(([rdo, r]) => console.log(`  ⚠️  "${rdo}": linhas ${r.join(', ')}`));

    // 5. Show 5 rows with Deletado = Sim
    const deletados = rows.filter(r => r[delIdx] === 'Sim').slice(0, 5);
    console.log(`\n=== AMOSTRA RDOs DELETADOS (${rows.filter(r => r[delIdx]==='Sim').length} total) ===`);
    deletados.forEach(r => {
        console.log(`  NumRDO=${r[1]} | Del=${r[delIdx]} | Trans=${r[transIdx]} | NomeColab=${String(r[16]||'').slice(0,30)}`);
    });

    console.log('\n✅ Verificação completa!');
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
