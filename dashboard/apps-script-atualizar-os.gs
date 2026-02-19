/**
 * Google Apps Script — Endpoint para atualizar Número OS de um RDO
 * Dashboard Engecom/Encogel
 *
 * COMO USAR:
 * 1. Abra a planilha Google Sheets → Extensões → Apps Script
 * 2. Cole este código no editor (substitua ou adicione ao código existente)
 * 3. Salve (Ctrl+S)
 * 4. Clique em "Implantar" → "Nova implantação"
 *    - Tipo: Aplicativo da Web
 *    - Executar como: EU (sua conta)
 *    - Quem tem acesso: Qualquer pessoa (para que o dashboard possa chamar sem login)
 * 5. Copie a URL gerada e cole em CONFIG.APPS_SCRIPT_URL no dashboard
 *    (ou configure como variável APPS_SCRIPT_URL no Netlify)
 *
 * AÇÃO SUPORTADA:
 *   { "acao": "atualizarOS", "numeroRDO": "998070-01.01.25-001", "novaOS": "998070" }
 *
 * RESPOSTA DE SUCESSO:  { "sucesso": true, "linhaAtualizada": 42 }
 * RESPOSTA DE ERRO:     { "sucesso": false, "erro": "mensagem de erro" }
 */

// ─── Handler principal ───────────────────────────────────────────────────────

function doPost(e) {
    // Cabeçalhos CORS para permitir chamadas do dashboard
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    try {
        const dados = JSON.parse(e.postData.contents);

        if (dados.acao === 'atualizarOS') {
            return _resposta(atualizarNumerOS(dados.numeroRDO, dados.novaOS), headers);
        }

        return _resposta({ sucesso: false, erro: 'Ação desconhecida: ' + dados.acao }, headers);

    } catch (err) {
        return _resposta({ sucesso: false, erro: err.message }, headers);
    }
}

// Necessário para permitir preflight CORS
function doGet(e) {
    return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', descricao: 'Endpoint Engecom — use POST' }))
        .setMimeType(ContentService.MimeType.JSON);
}

// ─── Lógica de atualização ───────────────────────────────────────────────────

/**
 * Localiza a linha com o Número RDO informado na aba RDO
 * e atualiza a coluna "Número OS" com o novo valor.
 */
function atualizarNumerOS(numeroRDO, novaOS) {
    if (!numeroRDO || !novaOS) {
        return { sucesso: false, erro: 'Parâmetros obrigatórios: numeroRDO e novaOS' };
    }

    const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('RDO');

    if (!sheet) {
        return { sucesso: false, erro: 'Aba "RDO" não encontrada na planilha' };
    }

    const dados  = sheet.getDataRange().getValues();
    const header = dados[0]; // primeira linha = cabeçalhos

    // Encontrar índice das colunas "Número RDO" e "Número OS"
    const colRDO = header.findIndex(h => h.toString().trim() === 'Número RDO');
    const colOS  = header.findIndex(h => h.toString().trim() === 'Número OS');

    if (colRDO === -1) return { sucesso: false, erro: 'Coluna "Número RDO" não encontrada na aba RDO' };
    if (colOS  === -1) return { sucesso: false, erro: 'Coluna "Número OS" não encontrada na aba RDO' };

    // Procurar linha com o Número RDO correspondente
    for (let i = 1; i < dados.length; i++) {
        const rdoNaLinha = (dados[i][colRDO] || '').toString().trim();
        if (rdoNaLinha === numeroRDO.trim()) {
            // Atualizar célula (linha i+1 no Sheets, pois Sheets usa base 1)
            sheet.getRange(i + 1, colOS + 1).setValue(novaOS);
            SpreadsheetApp.flush(); // Garantir gravação imediata

            Logger.log(`✅ Atualizado: RDO ${numeroRDO} → OS ${novaOS} (linha ${i + 1})`);
            return { sucesso: true, linhaAtualizada: i + 1 };
        }
    }

    return { sucesso: false, erro: `Número RDO "${numeroRDO}" não encontrado na aba RDO` };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function _resposta(obj, headers) {
    const output = ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
    return output;
}
