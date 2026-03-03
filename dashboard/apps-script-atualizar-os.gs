/**
 * Google Apps Script — Endpoint para atualizar Número OS de um RDO
 *                     + Gestão de O.S (status, GE/Via, notas) persistente
 * Dashboard Engecom/Encogel
 *
 * COMO USAR:
 * 1. Abra a planilha Google Sheets → Extensões → Apps Script
 * 2. Cole este código no editor (substitua ou adicione ao código existente)
 * 3. Salve (Ctrl+S)
 * 4. Clique em "Implantar" → "Nova implantação" (ou "Gerenciar implantações" para atualizar)
 *    - Tipo: Aplicativo da Web
 *    - Executar como: EU (sua conta)
 *    - Quem tem acesso: Qualquer pessoa (para que o dashboard possa chamar sem login)
 * 5. Copie a URL gerada e cole em CONFIG.APPS_SCRIPT_URL no dashboard
 *
 * AÇÕES SUPORTADAS:
 *   { "acao": "atualizarOS",     "numeroRDO": "...", "novaOS": "..." }
 *   { "acao": "listarGestaoOS" }
 *   { "acao": "salvarGestaoOS", "numeroOS": "...", "status": "...", "gevia": "...", "nota": "..." }
 */

// ─── Handler principal ───────────────────────────────────────────────────────

function doPost(e) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    try {
        const dados = JSON.parse(e.postData.contents);

        if (dados.acao === 'atualizarOS') {
            return _resposta(atualizarNumerOS(dados.numeroRDO, dados.novaOS), headers);
        }

        if (dados.acao === 'listarGestaoOS') {
            return _resposta(listarGestaoOS(), headers);
        }

        if (dados.acao === 'salvarGestaoOS') {
            return _resposta(salvarGestaoOS(dados.numeroOS, dados.status, dados.gevia, dados.nota), headers);
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

// ─── Ação: atualizarOS ───────────────────────────────────────────────────────

/**
 * Localiza a linha com o Número RDO informado na aba RDO
 * e atualiza a coluna "Número OS" com o novo valor.
 */
function atualizarNumerOS(numeroRDO, novaOS) {
    if (!numeroRDO || !novaOS) {
        return { sucesso: false, erro: 'Parâmetros obrigatórios: numeroRDO e novaOS' };
    }

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('RDO');

    if (!sheet) {
        return { sucesso: false, erro: 'Aba "RDO" não encontrada na planilha' };
    }

    const dados  = sheet.getDataRange().getValues();
    const header = dados[0];

    const colRDO = header.findIndex(h => h.toString().trim() === 'Número RDO');
    const colOS  = header.findIndex(h => h.toString().trim() === 'Número OS');

    if (colRDO === -1) return { sucesso: false, erro: 'Coluna "Número RDO" não encontrada na aba RDO' };
    if (colOS  === -1) return { sucesso: false, erro: 'Coluna "Número OS" não encontrada na aba RDO' };

    for (let i = 1; i < dados.length; i++) {
        const rdoNaLinha = (dados[i][colRDO] || '').toString().trim();
        if (rdoNaLinha === numeroRDO.trim()) {
            sheet.getRange(i + 1, colOS + 1).setValue(novaOS);
            SpreadsheetApp.flush();
            Logger.log('✅ Atualizado: RDO ' + numeroRDO + ' → OS ' + novaOS + ' (linha ' + (i + 1) + ')');
            return { sucesso: true, linhaAtualizada: i + 1 };
        }
    }

    return { sucesso: false, erro: 'Número RDO "' + numeroRDO + '" não encontrado na aba RDO' };
}

// ─── Ação: listarGestaoOS ────────────────────────────────────────────────────

/**
 * Lê todos os registros da aba "GestaoOS" e retorna um objeto indexado
 * por Número OS: { "998070": { status, gevia, nota, atualizadoEm }, ... }
 *
 * Cria a aba automaticamente se não existir.
 */
function listarGestaoOS() {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = _obterOuCriarAbaGestaoOS(ss);

    const dados = sheet.getDataRange().getValues();
    if (dados.length <= 1) {
        // Só cabeçalho ou vazia
        return { sucesso: true, dados: {} };
    }

    const header = dados[0].map(h => h.toString().trim());
    const colOS  = _findCol(header, 'Número OS');
    const colSt  = _findCol(header, 'Status');
    const colGV  = _findCol(header, 'GE/Via');
    const colNt  = _findCol(header, 'Nota');

    const colAt  = _findCol(header, 'Atualizado Em');

    const resultado = {};
    for (let i = 1; i < dados.length; i++) {
        const row = dados[i];
        const numeroOS = (row[colOS] || '').toString().trim();
        if (!numeroOS) continue;

        resultado[numeroOS] = {
            status:       (row[colSt] || '').toString().trim() || null,
            gevia:        (row[colGV] || '').toString().trim() || null,
            nota:         (row[colNt] || '').toString(),
            atualizadoEm: (row[colAt] || '').toString()
        };
    }

    Logger.log('[GestaoOS] Listagem: ' + Object.keys(resultado).length + ' registros');
    return { sucesso: true, dados: resultado };
}

// ─── Ação: salvarGestaoOS ────────────────────────────────────────────────────

/**
 * Insere ou atualiza o registro de uma O.S na aba "GestaoOS".
 * Colunas: Número OS | Status | GE/Via | Nota | Atualizado Em
 */
function salvarGestaoOS(numeroOS, status, gevia, nota) {
    if (!numeroOS) {
        return { sucesso: false, erro: 'Parâmetro obrigatório: numeroOS' };
    }

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = _obterOuCriarAbaGestaoOS(ss);

    const dados  = sheet.getDataRange().getValues();
    const header = dados[0].map(h => h.toString().trim());
    const colOS  = _findCol(header, 'Número OS');
    const agora  = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');

    // Procurar linha existente com esse Número OS
    for (let i = 1; i < dados.length; i++) {
        const osNaLinha = (dados[i][colOS] || '').toString().trim();
        if (osNaLinha === numeroOS.trim()) {
            // Atualizar linha existente (base 1 no Sheets)
            const row = i + 1;
            sheet.getRange(row, 2).setValue(status  || '');
            sheet.getRange(row, 3).setValue(gevia   || '');
            sheet.getRange(row, 4).setValue(nota    !== undefined ? nota : '');
            sheet.getRange(row, 5).setValue(agora);
            SpreadsheetApp.flush();
            Logger.log('[GestaoOS] Atualizado: OS ' + numeroOS + ' (linha ' + row + ')');
            return { sucesso: true, acao: 'atualizado', linha: row };
        }
    }

    // Não encontrou → inserir nova linha
    sheet.appendRow([
        numeroOS.trim(),
        status  || '',
        gevia   || '',
        nota    !== undefined ? nota : '',
        agora
    ]);
    SpreadsheetApp.flush();
    Logger.log('[GestaoOS] Inserido: OS ' + numeroOS);
    return { sucesso: true, acao: 'inserido' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Retorna a aba "GestaoOS", criando-a com cabeçalho se não existir.
 */
function _obterOuCriarAbaGestaoOS(ss) {
    let sheet = ss.getSheetByName('GestaoOS');
    if (!sheet) {
        sheet = ss.insertSheet('GestaoOS');
        sheet.appendRow(['Número OS', 'Status', 'GE/Via', 'Nota', 'Atualizado Em']);

        // Formatar cabeçalho
        const headerRange = sheet.getRange(1, 1, 1, 5);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#f3f3f3');

        // Ajustar larguras de coluna
        sheet.setColumnWidth(1, 130); // Número OS
        sheet.setColumnWidth(2, 180); // Status
        sheet.setColumnWidth(3, 120); // GE/Via
        sheet.setColumnWidth(4, 350); // Nota
        sheet.setColumnWidth(5, 160); // Atualizado Em

        Logger.log('[GestaoOS] Aba "GestaoOS" criada automaticamente');
    }
    return sheet;
}

/**
 * Retorna o índice de uma coluna pelo nome (case-insensitive).
 * Lança erro se não encontrar, para evitar leituras/escritas silenciosas na coluna errada.
 */
function _findCol(header, nome) {
    const idx = header.findIndex(h => h.toLowerCase() === nome.toLowerCase());
    if (idx < 0) throw new Error('Coluna "' + nome + '" não encontrada. Cabeçalho: ' + header.join(', '));
    return idx;
}

/**
 * Serializa a resposta como JSON para o ContentService.
 */
function _resposta(obj, headers) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}
