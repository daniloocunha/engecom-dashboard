/**
 * Google Apps Script - Endpoint para atualizar Numero OS de um RDO
 *                    + Gestao de O.S (status, GE/Via, notas) persistente
 * Dashboard Engecom/Encogel
 *
 * COMO USAR:
 * 1. Abra a planilha Google Sheets -> Extensoes -> Apps Script
 * 2. Cole este codigo no editor (substitua o codigo existente)
 * 3. Salve (Ctrl+S)
 * 4. Clique em "Implantar" -> "Gerenciar implantacoes"
 *    Edite a implantacao existente e selecione "Nova versao" -> "Implantar"
 *
 * ACOES SUPORTADAS:
 *   { "acao": "atualizarOS",     "numeroRDO": "...", "novaOS": "..." }
 *   { "acao": "listarGestaoOS" }
 *   { "acao": "salvarGestaoOS", "numeroOS": "...", "status": "...", "gevia": "...", "nota": "..." }
 */

// === Handler principal ===

function doPost(e) {
    var headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    try {
        var dados = JSON.parse(e.postData.contents);

        if (dados.acao === 'atualizarOS') {
            return _resposta(atualizarNumerOS(dados.numeroRDO, dados.novaOS));
        }

        if (dados.acao === 'listarGestaoOS') {
            return _resposta(listarGestaoOS());
        }

        if (dados.acao === 'salvarGestaoOS') {
            return _resposta(salvarGestaoOS(dados.numeroOS, dados.status, dados.gevia, dados.nota));
        }

        return _resposta({ sucesso: false, erro: 'Acao desconhecida: ' + dados.acao });

    } catch (err) {
        return _resposta({ sucesso: false, erro: err.message });
    }
}

// Responde ao preflight CORS (OPTIONS)
function doGet(e) {
    return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', descricao: 'Endpoint Engecom - use POST' }))
        .setMimeType(ContentService.MimeType.JSON);
}

// === Acao: atualizarOS ===

/**
 * Localiza a linha com o Numero RDO informado na aba RDO
 * e atualiza a coluna "Numero OS" com o novo valor.
 */
function atualizarNumerOS(numeroRDO, novaOS) {
    if (!numeroRDO || !novaOS) {
        return { sucesso: false, erro: 'Parametros obrigatorios: numeroRDO e novaOS' };
    }

    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('RDO');

    if (!sheet) {
        return { sucesso: false, erro: 'Aba "RDO" nao encontrada na planilha' };
    }

    var dados  = sheet.getDataRange().getValues();
    var header = dados[0];

    var colRDO = header.findIndex(function(h) { return h.toString().trim() === 'N\u00famero RDO'; });
    var colOS  = header.findIndex(function(h) { return h.toString().trim() === 'N\u00famero OS'; });

    if (colRDO === -1) return { sucesso: false, erro: 'Coluna "Numero RDO" nao encontrada na aba RDO' };
    if (colOS  === -1) return { sucesso: false, erro: 'Coluna "Numero OS" nao encontrada na aba RDO' };

    for (var i = 1; i < dados.length; i++) {
        var rdoNaLinha = (dados[i][colRDO] || '').toString().trim();
        if (rdoNaLinha === numeroRDO.trim()) {
            sheet.getRange(i + 1, colOS + 1).setValue(novaOS);
            SpreadsheetApp.flush();
            Logger.log('Atualizado: RDO ' + numeroRDO + ' -> OS ' + novaOS + ' (linha ' + (i + 1) + ')');
            return { sucesso: true, linhaAtualizada: i + 1 };
        }
    }

    return { sucesso: false, erro: 'Numero RDO "' + numeroRDO + '" nao encontrado na aba RDO' };
}

// === Acao: listarGestaoOS ===

/**
 * Le todos os registros da aba "GestaoOS" e retorna objeto indexado
 * por Numero OS: { "998070": { status, gevia, nota, atualizadoEm }, ... }
 * Cria a aba automaticamente se nao existir.
 */
function listarGestaoOS() {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = _obterOuCriarAbaGestaoOS(ss);

    var dados = sheet.getDataRange().getValues();
    if (dados.length <= 1) {
        return { sucesso: true, dados: {} };
    }

    var header = dados[0].map(function(h) { return h.toString().trim(); });
    var colOS  = _findCol(header, 'N\u00famero OS');
    var colSt  = _findCol(header, 'Status');
    var colGV  = _findCol(header, 'GE/Via');
    var colNt  = _findCol(header, 'Nota');
    var colAt  = _findCol(header, 'Atualizado Em');

    var resultado = {};
    for (var i = 1; i < dados.length; i++) {
        var row = dados[i];
        var numeroOS = (row[colOS] || '').toString().trim();
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

// === Acao: salvarGestaoOS ===

/**
 * Insere ou atualiza o registro de uma O.S na aba "GestaoOS".
 * Colunas: Numero OS | Status | GE/Via | Nota | Atualizado Em
 * Usa LockService para evitar linhas duplicadas quando dois PCs salvam simultaneamente.
 */
function salvarGestaoOS(numeroOS, status, gevia, nota) {
    if (!numeroOS) {
        return { sucesso: false, erro: 'Parametro obrigatorio: numeroOS' };
    }

    // Lock global: garante que apenas 1 processo por vez escreve na aba
    var lock = LockService.getScriptLock();
    try {
        lock.waitLock(8000);
    } catch (e) {
        return { sucesso: false, erro: 'Servidor ocupado. Tente novamente em instantes.' };
    }

    try {
        return _salvarGestaoOSInterno(numeroOS, status, gevia, nota);
    } finally {
        lock.releaseLock();
    }
}

function _salvarGestaoOSInterno(numeroOS, status, gevia, nota) {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = _obterOuCriarAbaGestaoOS(ss);

    var dados  = sheet.getDataRange().getValues();
    var header = dados[0].map(function(h) { return h.toString().trim(); });
    var colOS  = _findCol(header, 'N\u00famero OS');
    var agora  = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');

    // Procurar linha existente com esse Numero OS
    for (var i = 1; i < dados.length; i++) {
        var osNaLinha = (dados[i][colOS] || '').toString().trim();
        if (osNaLinha === numeroOS.trim()) {
            var row = i + 1;
            sheet.getRange(row, 2).setValue(status || '');
            sheet.getRange(row, 3).setValue(gevia  || '');
            sheet.getRange(row, 4).setValue(nota !== undefined ? nota : '');
            sheet.getRange(row, 5).setValue(agora);
            SpreadsheetApp.flush();
            Logger.log('[GestaoOS] Atualizado: OS ' + numeroOS + ' (linha ' + row + ')');
            return { sucesso: true, acao: 'atualizado', linha: row };
        }
    }

    // Nao encontrou -> inserir nova linha
    sheet.appendRow([
        numeroOS.trim(),
        status || '',
        gevia  || '',
        nota !== undefined ? nota : '',
        agora
    ]);
    SpreadsheetApp.flush();
    Logger.log('[GestaoOS] Inserido: OS ' + numeroOS);
    return { sucesso: true, acao: 'inserido' };
}

// === Helpers ===

/**
 * Retorna a aba "GestaoOS", criando-a com cabecalho se nao existir.
 */
function _obterOuCriarAbaGestaoOS(ss) {
    var sheet = ss.getSheetByName('GestaoOS');
    if (!sheet) {
        sheet = ss.insertSheet('GestaoOS');
        sheet.appendRow(['N\u00famero OS', 'Status', 'GE/Via', 'Nota', 'Atualizado Em']);

        var headerRange = sheet.getRange(1, 1, 1, 5);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#f3f3f3');

        sheet.setColumnWidth(1, 130);
        sheet.setColumnWidth(2, 180);
        sheet.setColumnWidth(3, 120);
        sheet.setColumnWidth(4, 350);
        sheet.setColumnWidth(5, 160);

        Logger.log('[GestaoOS] Aba "GestaoOS" criada automaticamente');
    }
    return sheet;
}

/**
 * Retorna o indice de uma coluna pelo nome (case-insensitive).
 * Lanca erro se nao encontrar.
 */
function _findCol(header, nome) {
    var idx = header.findIndex(function(h) { return h.toLowerCase() === nome.toLowerCase(); });
    if (idx < 0) throw new Error('Coluna "' + nome + '" nao encontrada. Cabecalho: ' + header.join(', '));
    return idx;
}

/**
 * Serializa a resposta como JSON para o ContentService.
 */
function _resposta(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}
