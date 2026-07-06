/**
 * Google Apps Script - Endpoint para o Dashboard Engecom/Encogel
 *
 * ACOES SUPORTADAS:
 *   atualizarOS, listarGestaoOS, salvarGestaoOS, uploadAnexo, deletarAnexo,
 *   atualizarOSCascata, atualizarCampoRDO, atualizarServico, adicionarServico,
 *   excluirServico, atualizarHI, adicionarHI, excluirHI, deletarRDO,
 *   renomearRDO, dividirOS, duplicarRDO, salvarNotaDia, obterNotasDia
 */

// ID da pasta do Google Drive para os anexos (deixe '' para usar o Drive raiz)
var DRIVE_FOLDER_ID = '';

// === Handler principal ===

function doPost(e) {
    try {
        var dados = JSON.parse(e.postData.contents);

        if (dados.acao === 'atualizarOS')        { return _resposta(atualizarNumerOS(dados.numeroRDO, dados.novaOS)); }
        if (dados.acao === 'listarGestaoOS')      { return _resposta(listarGestaoOS()); }
        if (dados.acao === 'salvarGestaoOS')      { return _resposta(salvarGestaoOS(dados.numeroOS, dados.status, dados.gevia, dados.nota, dados.mediu, dados.anexos, dados.urgente, dados.reprovacoes)); }
        if (dados.acao === 'uploadAnexo')         { return _resposta(uploadAnexo(dados.numeroOS, dados.nome, dados.tipo, dados.base64)); }
        if (dados.acao === 'deletarAnexo')        { return _resposta(deletarAnexo(dados.fileId)); }
        if (dados.acao === 'atualizarOSCascata')  { return _resposta(atualizarOSCascata(dados.antigaOS, dados.novaOS)); }
        if (dados.acao === 'atualizarCampoRDO')   { return _resposta(atualizarCampoRDO(dados)); }
        if (dados.acao === 'atualizarServico')    { return _resposta(atualizarServico(dados)); }
        if (dados.acao === 'adicionarServico')    { return _resposta(adicionarServico(dados)); }
        if (dados.acao === 'excluirServico')      { return _resposta(excluirServico(dados)); }
        if (dados.acao === 'atualizarHI')         { return _resposta(atualizarHI(dados)); }
        if (dados.acao === 'adicionarHI')         { return _resposta(adicionarHI(dados)); }
        if (dados.acao === 'excluirHI')           { return _resposta(excluirHI(dados)); }
        if (dados.acao === 'deletarRDO')          { return _resposta(deletarRDO(dados)); }
        if (dados.acao === 'renomearRDO')         { return _resposta(renomearRDO(dados)); }
        if (dados.acao === 'dividirOS')           { return _resposta(dividirOS(dados)); }
        if (dados.acao === 'duplicarRDO')         { return _resposta(duplicarRDO(dados)); }
        if (dados.acao === 'salvarNotaDia')       { return _resposta(salvarNotaDia(dados)); }
        if (dados.acao === 'obterNotasDia')       { return _resposta(obterNotasDia()); }

        return _resposta({ sucesso: false, erro: 'Acao desconhecida: ' + dados.acao });

    } catch (err) {
        return _resposta({ sucesso: false, erro: err.message });
    }
}

function doGet(e) {
    return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', descricao: 'Endpoint Engecom - use POST' }))
        .setMimeType(ContentService.MimeType.JSON);
}

// === Acao: atualizarOS ===

function atualizarNumerOS(numeroRDO, novaOS) {
    if (!numeroRDO || !novaOS) {
        return { sucesso: false, erro: 'Parametros obrigatorios: numeroRDO e novaOS' };
    }

    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('RDO');
    if (!sheet) return { sucesso: false, erro: 'Aba "RDO" nao encontrada na planilha' };

    var dados  = sheet.getDataRange().getValues();
    var header = dados[0];
    var colRDO = _findColSafe(header.map(function(h) { return h.toString().trim(); }), 'Número RDO');
    var colOS  = _findColSafe(header.map(function(h) { return h.toString().trim(); }), 'Número OS');

    if (colRDO < 0) return { sucesso: false, erro: 'Coluna "Número RDO" nao encontrada na aba RDO' };
    if (colOS  < 0) return { sucesso: false, erro: 'Coluna "Número OS" nao encontrada na aba RDO' };

    for (var i = 1; i < dados.length; i++) {
        if ((dados[i][colRDO] || '').toString().trim() === numeroRDO.trim()) {
            sheet.getRange(i + 1, colOS + 1).setValue(novaOS);
            SpreadsheetApp.flush();
            Logger.log('Atualizado: RDO ' + numeroRDO + ' -> OS ' + novaOS + ' (linha ' + (i + 1) + ')');
            return { sucesso: true, linhaAtualizada: i + 1 };
        }
    }
    return { sucesso: false, erro: 'Numero RDO "' + numeroRDO + '" nao encontrado na aba RDO' };
}

// === Acao: listarGestaoOS ===

function listarGestaoOS() {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = _obterOuCriarAbaGestaoOS(ss);
    var dados = sheet.getDataRange().getValues();
    if (dados.length <= 1) return { sucesso: true, dados: {} };

    var header = dados[0].map(function(h) { return h.toString().trim(); });
    var colOS  = _findCol(header, 'Número OS');
    var colSt  = _findCol(header, 'Status');
    var colGV  = _findCol(header, 'GE/Via');
    var colNt  = _findCol(header, 'Nota');
    var colAt  = _findCol(header, 'Atualizado Em');
    var colMd  = _findColSafe(header, 'Mediu');
    var colAnx = _findColSafe(header, 'Anexos');
    var colUrg = _findColSafe(header, 'Urgente');
    var colRep = _findColSafe(header, 'Reprovacoes');

    var resultado = {};
    for (var i = 1; i < dados.length; i++) {
        var row = dados[i];
        var numeroOS = (row[colOS] || '').toString().trim();
        if (!numeroOS) continue;
        resultado[numeroOS] = {
            status:       (row[colSt] || '').toString().trim() || null,
            gevia:        (row[colGV] || '').toString().trim() || null,
            nota:         (row[colNt] || '').toString(),
            mediu:        colMd  >= 0 ? (row[colMd]  || '').toString().trim() || null : null,
            anexos:       colAnx >= 0 ? (row[colAnx] || '').toString().trim() || '[]' : '[]',
            urgente:      colUrg >= 0 ? (row[colUrg] || '').toString().trim() || undefined : undefined,
            reprovacoes:  colRep >= 0 ? (row[colRep] || '').toString().trim() || '' : '',
            atualizadoEm: (row[colAt] || '').toString()
        };
    }
    Logger.log('[GestaoOS] Listagem: ' + Object.keys(resultado).length + ' registros');
    return { sucesso: true, dados: resultado };
}

// === Acao: salvarGestaoOS ===

function salvarGestaoOS(numeroOS, status, gevia, nota, mediu, anexos, urgente, reprovacoes) {
    if (!numeroOS) return { sucesso: false, erro: 'Parametro obrigatorio: numeroOS' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(8000); }
    catch (e) { return { sucesso: false, erro: 'Servidor ocupado. Tente novamente em instantes.' }; }

    try {
        return _salvarGestaoOSInterno(numeroOS, status, gevia, nota, mediu, anexos, urgente, reprovacoes);
    } finally {
        lock.releaseLock();
    }
}

function _salvarGestaoOSInterno(numeroOS, status, gevia, nota, mediu, anexos, urgente, reprovacoes) {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = _obterOuCriarAbaGestaoOS(ss);
    var dados  = sheet.getDataRange().getValues();
    var header = dados[0].map(function(h) { return h.toString().trim(); });
    var colOS  = _findCol(header, 'Número OS');
    var colSt  = _findCol(header, 'Status');
    var colGV  = _findCol(header, 'GE/Via');
    var colNt  = _findCol(header, 'Nota');
    var colAt  = _findCol(header, 'Atualizado Em');
    var colMediu = _findColSafe(header, 'Mediu');
    var colAnx   = _findColSafe(header, 'Anexos');
    var colUrg   = _findColSafe(header, 'Urgente');
    var colRep   = _findColSafe(header, 'Reprovacoes');
    var agora    = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
    var anexosStr = (typeof anexos === 'string') ? anexos : (anexos ? JSON.stringify(anexos) : '[]');
    var reprovStr = (typeof reprovacoes === 'string') ? reprovacoes : (reprovacoes ? JSON.stringify(reprovacoes) : '');

    for (var i = 1; i < dados.length; i++) {
        if ((dados[i][colOS] || '').toString().trim() === numeroOS.trim()) {
            var row = i + 1;
            sheet.getRange(row, colSt + 1).setValue(status || '');
            sheet.getRange(row, colGV + 1).setValue(gevia  || '');
            sheet.getRange(row, colNt + 1).setValue(nota !== undefined ? nota : '');
            if (colMediu >= 0) sheet.getRange(row, colMediu + 1).setValue(mediu !== undefined ? mediu : '');
            if (colAnx   >= 0) sheet.getRange(row, colAnx   + 1).setValue(anexosStr);
            if (colUrg   >= 0 && urgente !== undefined) sheet.getRange(row, colUrg + 1).setValue(urgente || '');
            if (colRep   >= 0 && reprovacoes !== undefined) sheet.getRange(row, colRep + 1).setValue(reprovStr);
            sheet.getRange(row, colAt + 1).setValue(agora);
            SpreadsheetApp.flush();
            Logger.log('[GestaoOS] Atualizado: OS ' + numeroOS + ' (linha ' + row + ')');
            return { sucesso: true, acao: 'atualizado', linha: row };
        }
    }

    sheet.appendRow([numeroOS.trim(), status || '', gevia || '', nota !== undefined ? nota : '',
                     mediu !== undefined ? mediu : '', anexosStr, agora]);
    var novaLinha = sheet.getLastRow();
    if (colUrg >= 0) sheet.getRange(novaLinha, colUrg + 1).setValue(urgente !== undefined ? (urgente || '') : '');
    if (colRep >= 0) sheet.getRange(novaLinha, colRep + 1).setValue(reprovStr);
    SpreadsheetApp.flush();
    Logger.log('[GestaoOS] Inserido: OS ' + numeroOS);
    return { sucesso: true, acao: 'inserido' };
}

// === Acao: uploadAnexo ===

function uploadAnexo(numeroOS, nome, tipo, base64) {
    if (!base64) return { sucesso: false, erro: 'Conteudo base64 vazio' };
    if (!nome)   return { sucesso: false, erro: 'Nome do arquivo obrigatorio' };

    try {
        var bytes = Utilities.base64Decode(base64);
        var blob  = Utilities.newBlob(bytes, tipo || 'application/octet-stream', nome);

        var folder;
        if (DRIVE_FOLDER_ID && DRIVE_FOLDER_ID.trim()) {
            try { folder = DriveApp.getFolderById(DRIVE_FOLDER_ID.trim()); }
            catch (e) { return { sucesso: false, erro: 'Pasta Drive "' + DRIVE_FOLDER_ID + '" nao encontrada.' }; }
        } else {
            folder = DriveApp.getRootFolder();
        }

        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var fileId  = file.getId();
        var fileUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;

        _registrarAnexoNaAba(numeroOS, nome, fileUrl, fileId, tipo || '');
        Logger.log('uploadAnexo: ' + nome + ' -> ' + fileUrl);
        return { sucesso: true, url: fileUrl, fileId: fileId, nome: nome };

    } catch (err) {
        Logger.log('uploadAnexo erro: ' + err.message);
        return { sucesso: false, erro: err.message };
    }
}

function _registrarAnexoNaAba(numeroOS, nome, url, fileId, tipo) {
    try {
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('AnexosOS');
        if (!sheet) {
            sheet = ss.insertSheet('AnexosOS');
            sheet.appendRow(['Número OS', 'Nome', 'URL', 'FileId', 'Tipo', 'Data Upload']);
            sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#e8f0fe');
            sheet.setFrozenRows(1);
        }
        var dataUpload = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
        sheet.appendRow([numeroOS, nome, url, fileId, tipo, dataUpload]);
    } catch (err) {
        Logger.log('_registrarAnexoNaAba erro: ' + err.message);
    }
}

// === Acao: deletarAnexo ===

function deletarAnexo(fileId) {
    if (!fileId) return { sucesso: false, erro: 'fileId obrigatorio' };
    try {
        DriveApp.getFileById(fileId).setTrashed(true);
        _removerLinhaAnexo(fileId);
        Logger.log('deletarAnexo: ' + fileId + ' movido para lixeira');
        return { sucesso: true };
    } catch (err) {
        Logger.log('deletarAnexo erro: ' + err.message);
        return { sucesso: false, erro: err.message };
    }
}

function _removerLinhaAnexo(fileId) {
    try {
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('AnexosOS');
        if (!sheet) return;
        var dados  = sheet.getDataRange().getValues();
        var colFid = _findColSafe(dados[0].map(function(h) { return h.toString().trim(); }), 'FileId');
        if (colFid < 0) return;
        for (var i = dados.length - 1; i >= 1; i--) {
            if ((dados[i][colFid] || '').toString().trim() === fileId.trim()) {
                sheet.deleteRow(i + 1);
                break;
            }
        }
    } catch (err) {
        Logger.log('_removerLinhaAnexo erro: ' + err.message);
    }
}

// === Helpers ===

function _obterOuCriarAbaGestaoOS(ss) {
    var sheet = ss.getSheetByName('GestaoOS');
    if (!sheet) {
        sheet = ss.insertSheet('GestaoOS');
        sheet.appendRow(['Número OS', 'Status', 'GE/Via', 'Nota', 'Mediu', 'Anexos', 'Atualizado Em', 'Urgente', 'Reprovacoes']);
        var hr = sheet.getRange(1, 1, 1, 9);
        hr.setFontWeight('bold').setBackground('#f3f3f3');
        sheet.setColumnWidth(1, 130); sheet.setColumnWidth(2, 180); sheet.setColumnWidth(3, 120);
        sheet.setColumnWidth(4, 350); sheet.setColumnWidth(5, 100); sheet.setColumnWidth(6, 400);
        sheet.setColumnWidth(7, 160); sheet.setColumnWidth(8, 90); sheet.setColumnWidth(9, 400);
        sheet.setFrozenRows(1);
        Logger.log('[GestaoOS] Aba criada automaticamente');
    }
    // Migração automática: adiciona colunas novas em planilhas antigas
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        .map(function(h) { return h.toString().trim(); });
    var novasColunas = ['Urgente', 'Reprovacoes'];
    for (var i = 0; i < novasColunas.length; i++) {
        if (_findColSafe(header, novasColunas[i]) < 0) {
            var col = sheet.getLastColumn() + 1;
            sheet.getRange(1, col).setValue(novasColunas[i]).setFontWeight('bold').setBackground('#f3f3f3');
            Logger.log('[GestaoOS] Coluna "' + novasColunas[i] + '" adicionada (col ' + col + ')');
        }
    }
    return sheet;
}

/** Retorna índice de coluna (lança erro se não encontrar). */
function _findCol(header, nome) {
    var nomeLower = nome.toLowerCase();
    for (var i = 0; i < header.length; i++) {
        if (header[i].toLowerCase() === nomeLower) return i;
    }
    throw new Error('Coluna "' + nome + '" nao encontrada. Cabecalho: ' + header.join(', '));
}

/** Retorna índice de coluna ou -1 se não encontrar (não lança erro). */
function _findColSafe(header, nome) {
    var nomeLower = nome.toLowerCase();
    for (var i = 0; i < header.length; i++) {
        if (header[i].toLowerCase() === nomeLower) return i;
    }
    return -1;
}

function _resposta(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

// === Acao: atualizarOSCascata ===

function atualizarOSCascata(antigaOS, novaOS) {
    if (!antigaOS || !novaOS) return { sucesso: false, erro: 'Parametros obrigatorios: antigaOS e novaOS' };

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return { sucesso: false, erro: 'Servidor ocupado. Tente novamente em alguns segundos.' };
    try {
        return _atualizarOSCascataInterno(antigaOS, novaOS);
    } finally {
        lock.releaseLock();
    }
}

function _atualizarOSCascataInterno(antigaOS, novaOS) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var abas = ['RDO', 'Servicos', 'HorasImprodutivas', 'Efetivo',
                'Equipamentos', 'Materiais', 'TransporteSucatas', 'Acompanhamento'];
    var resultado = { sucesso: true, abas: {} };

    for (var a = 0; a < abas.length; a++) {
        var nomeAba = abas[a];
        var sheet = ss.getSheetByName(nomeAba);
        if (!sheet) { resultado.abas[nomeAba] = 'aba nao existe'; continue; }

        var range = sheet.getDataRange();
        var dados = range.getValues();
        var header = dados[0].map(function(h) { return h.toString().trim(); });
        var colOS = _findColSafe(header, 'Número OS');
        if (colOS < 0) { resultado.abas[nomeAba] = 'sem coluna Numero OS'; continue; }

        var count = 0;
        for (var i = 1; i < dados.length; i++) {
            if ((dados[i][colOS] || '').toString().trim() === antigaOS.trim()) {
                dados[i][colOS] = novaOS;
                count++;
            }
        }
        if (count > 0) { range.setValues(dados); SpreadsheetApp.flush(); }
        resultado.abas[nomeAba] = count;
    }

    Logger.log('[atualizarOSCascata] ' + antigaOS + ' -> ' + novaOS + ' | ' + JSON.stringify(resultado.abas));
    return resultado;
}

// === Acao: renomearRDO ===

function renomearRDO(dados) {
    var oldNumeroRDO = dados.oldNumeroRDO;
    var newNumeroRDO = dados.newNumeroRDO;
    var novaOS       = dados.novaOS;

    if (!oldNumeroRDO || !newNumeroRDO || !novaOS) {
        return { sucesso: false, erro: 'Parâmetros insuficientes para renomear RDO' };
    }

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return { sucesso: false, erro: 'Servidor ocupado. Tente novamente.' };

    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var abas = ['RDO', 'Servicos', 'Materiais', 'HorasImprodutivas', 'TransporteSucatas', 'Efetivo', 'Equipamentos'];
        var totalAlteracoes = 0;

        for (var a = 0; a < abas.length; a++) {
            var sheet = ss.getSheetByName(abas[a]);
            if (!sheet) continue;

            var dataValues = sheet.getDataRange().getValues();
            if (dataValues.length < 2) continue;

            var header = dataValues[0].map(function(h) { return h.toString().trim(); });
            var rdoCol = _findColSafe(header, 'Número RDO');
            if (rdoCol < 0) continue;
            var osCol = _findColSafe(header, 'Número OS');

            for (var r = 1; r < dataValues.length; r++) {
                if ((dataValues[r][rdoCol] || '').toString().trim() === oldNumeroRDO.trim()) {
                    sheet.getRange(r + 1, rdoCol + 1).setValue(newNumeroRDO);
                    if (osCol >= 0) sheet.getRange(r + 1, osCol + 1).setValue(novaOS);
                    totalAlteracoes++;
                }
            }
        }

        SpreadsheetApp.flush();
        Logger.log('[renomearRDO] ' + oldNumeroRDO + ' → ' + newNumeroRDO + ' | ' + totalAlteracoes + ' linha(s)');
        return { sucesso: true, alteracoes: totalAlteracoes };

    } finally {
        lock.releaseLock();
    }
}

// === Acao: dividirOS ===

function dividirOS(dados) {
    var numeroRDO   = dados.numeroRDO;
    var os1         = dados.os1;
    var os2         = dados.os2;
    var servicosOS2 = dados.servicosOS2 || [];
    var hiOS2       = dados.hiOS2       || [];

    if (!numeroRDO || !os1 || !os2) {
        return { sucesso: false, erro: 'Parâmetros insuficientes para dividir O.S' };
    }

    var partes        = numeroRDO.split('-');
    var sufixo        = partes.slice(1).join('-');
    var novoNumeroRDO = os2 + '-' + sufixo;

    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);

    try {
        // ── 1. Aba RDO ────────────────────────────────────────────────────────
        var rdoSheet  = ss.getSheetByName('RDO');
        var rdoValues = rdoSheet.getDataRange().getValues();
        var rdoHdr    = rdoValues[0].map(function(h) { return h.toString().trim(); });
        var rdoNumCol = _findColSafe(rdoHdr, 'Número RDO');
        var rdoOsCol  = _findColSafe(rdoHdr, 'Número OS');
        if (rdoNumCol < 0) return { sucesso: false, erro: 'Coluna "Número RDO" não encontrada na aba RDO' };

        var rdoOrigRow = -1, rdoOrigLinha = null;
        for (var r = 1; r < rdoValues.length; r++) {
            if ((rdoValues[r][rdoNumCol] || '').toString().trim() === numeroRDO.trim()) {
                rdoOrigRow   = r + 1;
                rdoOrigLinha = rdoValues[r].slice();
                break;
            }
        }
        if (rdoOrigRow < 0) return { sucesso: false, erro: 'RDO não encontrado: ' + numeroRDO };

        if (rdoOsCol >= 0) rdoSheet.getRange(rdoOrigRow, rdoOsCol + 1).setValue(os1);

        var novaLinhaRDO = rdoOrigLinha.slice();
        novaLinhaRDO[rdoNumCol] = novoNumeroRDO;
        if (rdoOsCol >= 0) novaLinhaRDO[rdoOsCol] = os2;
        rdoSheet.appendRow(novaLinhaRDO);

        // ── 2. Aba Servicos ───────────────────────────────────────────────────
        var svcSheet  = ss.getSheetByName('Servicos');
        var svcValues = svcSheet.getDataRange().getValues();
        var svcHdr    = svcValues[0].map(function(h) { return h.toString().trim(); });
        var svcRdoCol = _findColSafe(svcHdr, 'Número RDO');
        var svcOsCol  = _findColSafe(svcHdr, 'Número OS');
        var svcDescCol = _findColSafe(svcHdr, 'Descrição');
        var svcQtyCol  = _findColSafe(svcHdr, 'Quantidade');

        var svcOS2Set = {};
        for (var i = 0; i < servicosOS2.length; i++) {
            var pts = servicosOS2[i].split('|');
            svcOS2Set[pts[0] + '|' + pts[1]] = true;
        }
        for (var r = 1; r < svcValues.length; r++) {
            if ((svcValues[r][svcRdoCol] || '').toString().trim() !== numeroRDO.trim()) continue;
            var desc = svcDescCol >= 0 ? String(svcValues[r][svcDescCol] || '').trim() : '';
            var qty  = svcQtyCol  >= 0 ? String(svcValues[r][svcQtyCol]  || '').trim() : '';
            if (svcOS2Set[desc + '|' + qty]) {
                svcSheet.getRange(r + 1, svcRdoCol + 1).setValue(novoNumeroRDO);
                if (svcOsCol >= 0) svcSheet.getRange(r + 1, svcOsCol + 1).setValue(os2);
            }
        }

        // ── 3. Aba HorasImprodutivas ──────────────────────────────────────────
        var hiSheet  = ss.getSheetByName('HorasImprodutivas');
        var hiValues = hiSheet.getDataRange().getValues();
        var hiHdr    = hiValues[0].map(function(h) { return h.toString().trim(); });
        var hiRdoCol  = _findColSafe(hiHdr, 'Número RDO');
        var hiOsCol   = _findColSafe(hiHdr, 'Número OS');
        var hiTipoCol = _findColSafe(hiHdr, 'Tipo');
        var hiIniCol  = _findColSafe(hiHdr, 'Hora Início');
        var hiFimCol  = _findColSafe(hiHdr, 'Hora Fim');

        var hiOS2Set = {};
        for (var i = 0; i < hiOS2.length; i++) {
            var pts = hiOS2[i].split('|');
            hiOS2Set[pts[1] + '|' + pts[2] + '|' + pts[3]] = true;
        }
        for (var r = 1; r < hiValues.length; r++) {
            if ((hiValues[r][hiRdoCol] || '').toString().trim() !== numeroRDO.trim()) continue;
            var tipo = hiTipoCol >= 0 ? String(hiValues[r][hiTipoCol] || '').trim() : '';
            var ini  = hiIniCol  >= 0 ? String(hiValues[r][hiIniCol]  || '').trim() : '';
            var fim  = hiFimCol  >= 0 ? String(hiValues[r][hiFimCol]  || '').trim() : '';
            if (hiOS2Set[tipo + '|' + ini + '|' + fim]) {
                hiSheet.getRange(r + 1, hiRdoCol + 1).setValue(novoNumeroRDO);
                if (hiOsCol >= 0) hiSheet.getRange(r + 1, hiOsCol + 1).setValue(os2);
            }
        }

        // ── 4. Aba Efetivo — duplicar para o novo RDO ─────────────────────────
        var efSheet = ss.getSheetByName('Efetivo');
        if (efSheet) {
            var efValues = efSheet.getDataRange().getValues();
            var efHdr    = efValues[0].map(function(h) { return h.toString().trim(); });
            var efRdoCol = _findColSafe(efHdr, 'Número RDO');
            var efOsCol  = _findColSafe(efHdr, 'Número OS');
            for (var r = 1; r < efValues.length; r++) {
                if ((efValues[r][efRdoCol] || '').toString().trim() === numeroRDO.trim()) {
                    var novaEf = efValues[r].slice();
                    novaEf[efRdoCol] = novoNumeroRDO;
                    if (efOsCol >= 0) novaEf[efOsCol] = os2;
                    efSheet.appendRow(novaEf);
                    break;
                }
            }
        }

        SpreadsheetApp.flush();
        Logger.log('[dividirOS] ' + numeroRDO + ' → OS1=' + os1 + ' OS2=' + os2 + ' novoRDO=' + novoNumeroRDO);
        return { sucesso: true, novoNumeroRDO: novoNumeroRDO };

    } catch (err) {
        return { sucesso: false, erro: err.message };
    } finally {
        lock.releaseLock();
    }
}

// === Acao: duplicarRDO ===

/**
 * Duplica um RDO completo com um novo Número RDO sequencial no mesmo
 * dia/O.S (ex: 998070-05.07.26-001 → 998070-05.07.26-002).
 * Copia a linha da aba RDO e todas as linhas relacionadas em
 * Servicos, HorasImprodutivas, Efetivo, Equipamentos, Materiais e
 * TransporteSucatas.
 */
function duplicarRDO(dados) {
    var numeroRDO = (dados.numeroRDO || '').toString().trim();
    if (!numeroRDO) return { sucesso: false, erro: 'numeroRDO é obrigatório' };

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return { sucesso: false, erro: 'Servidor ocupado. Tente novamente.' };

    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var rdoSheet = ss.getSheetByName('RDO');
        if (!rdoSheet) return { sucesso: false, erro: 'Aba "RDO" não encontrada' };

        var rdoValues = rdoSheet.getDataRange().getValues();
        var header    = rdoValues[0].map(function(h) { return h.toString().trim(); });
        var colRDO    = _findColSafe(header, 'Número RDO');
        if (colRDO < 0) return { sucesso: false, erro: 'Coluna "Número RDO" não encontrada' };

        // Localizar a linha original e o maior sequencial do mesmo prefixo OS-DD.MM.YY
        var idx     = numeroRDO.lastIndexOf('-');
        var prefixo = idx > 0 ? numeroRDO.substring(0, idx) : numeroRDO;
        var linhaOrig = null;
        var maxSeq    = 0;
        for (var i = 1; i < rdoValues.length; i++) {
            var n = (rdoValues[i][colRDO] || '').toString().trim();
            if (n === numeroRDO && !linhaOrig) linhaOrig = rdoValues[i].slice();
            if (n.indexOf(prefixo + '-') === 0) {
                var seq = parseInt(n.substring(prefixo.length + 1), 10);
                if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
            }
        }
        if (!linhaOrig) return { sucesso: false, erro: 'RDO não encontrado: ' + numeroRDO };

        var seqStr = String(maxSeq + 1);
        while (seqStr.length < 3) seqStr = '0' + seqStr;
        var novoNumeroRDO = prefixo + '-' + seqStr;

        // Duplicar a linha na aba RDO (garantindo Deletado vazio)
        var novaLinha = linhaOrig.slice();
        novaLinha[colRDO] = novoNumeroRDO;
        var colDeletado = _findColSafe(header, 'Deletado');
        if (colDeletado >= 0) novaLinha[colDeletado] = '';
        rdoSheet.appendRow(novaLinha);

        // Duplicar linhas das abas relacionadas
        var abas = ['Servicos', 'HorasImprodutivas', 'Efetivo', 'Equipamentos', 'Materiais', 'TransporteSucatas'];
        var copiadas = {};
        for (var a = 0; a < abas.length; a++) {
            var sheet = ss.getSheetByName(abas[a]);
            if (!sheet) continue;
            var vals = sheet.getDataRange().getValues();
            if (vals.length < 2) { copiadas[abas[a]] = 0; continue; }
            var hdr  = vals[0].map(function(h) { return h.toString().trim(); });
            var cRdo = _findColSafe(hdr, 'Número RDO');
            if (cRdo < 0) continue;
            var novas = [];
            for (var r = 1; r < vals.length; r++) {
                if ((vals[r][cRdo] || '').toString().trim() === numeroRDO) {
                    var nova = vals[r].slice();
                    nova[cRdo] = novoNumeroRDO;
                    novas.push(nova);
                }
            }
            for (var x = 0; x < novas.length; x++) sheet.appendRow(novas[x]);
            copiadas[abas[a]] = novas.length;
        }

        SpreadsheetApp.flush();
        Logger.log('[duplicarRDO] ' + numeroRDO + ' → ' + novoNumeroRDO + ' | ' + JSON.stringify(copiadas));
        return { sucesso: true, novoNumeroRDO: novoNumeroRDO, copiadas: copiadas };

    } catch (err) {
        return { sucesso: false, erro: err.message };
    } finally {
        lock.releaseLock();
    }
}

// ════════════════════════════════════════════════════════════════════
// EDIÇÃO VIA DASHBOARD
// ════════════════════════════════════════════════════════════════════

function _linhasDaAba(sheet, numeroRDO) {
    var dados = sheet.getDataRange().getValues();
    var linhas = [];
    for (var i = 1; i < dados.length; i++) {
        if ((dados[i][0] || '').toString().trim() === (numeroRDO || '').toString().trim()) {
            linhas.push(i + 1);
        }
    }
    return linhas;
}

function atualizarCampoRDO(body) {
    var numeroRDO = (body.numeroRDO || '').toString().trim();
    var campos    = body.campos;
    if (!numeroRDO || !campos || typeof campos !== 'object') {
        return { sucesso: false, erro: 'numeroRDO e campos são obrigatórios' };
    }

    var MAPA_CAMPOS = {
        local: 'Local', numeroOS: 'Número OS', statusOS: 'Status OS',
        kmInicio: 'KM Início', kmFim: 'KM Fim',
        horarioInicio: 'Horário Início', horarioFim: 'Horário Fim',
        temaDDS: 'Tema DDS', observacoes: 'Observações'
    };

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('RDO');
        if (!sheet) return { sucesso: false, erro: 'Aba "RDO" não encontrada' };

        var dados  = sheet.getDataRange().getValues();
        var header = dados[0].map(function(h) { return h.toString().trim(); });
        var colRDO = _findColSafe(header, 'Número RDO');
        if (colRDO < 0) return { sucesso: false, erro: 'Coluna "Número RDO" não encontrada' };

        var linhaAtualizar = -1;
        for (var i = 1; i < dados.length; i++) {
            if ((dados[i][colRDO] || '').toString().trim() === numeroRDO) {
                linhaAtualizar = i + 1;
                break;
            }
        }
        if (linhaAtualizar === -1) return { sucesso: false, erro: 'Número RDO "' + numeroRDO + '" não encontrado' };

        var atualizados = [];
        for (var chave in campos) {
            if (!campos.hasOwnProperty(chave)) continue;
            var nomeColuna = MAPA_CAMPOS[chave];
            if (!nomeColuna) continue;
            var colIdx = _findColSafe(header, nomeColuna);
            if (colIdx < 0) { Logger.log('[atualizarCampoRDO] Coluna não encontrada: ' + nomeColuna); continue; }
            sheet.getRange(linhaAtualizar, colIdx + 1).setValue(campos[chave]);
            atualizados.push(nomeColuna);
        }

        if (atualizados.length === 0) return { sucesso: false, erro: 'Nenhum campo válido informado' };
        SpreadsheetApp.flush();
        Logger.log('[atualizarCampoRDO] RDO ' + numeroRDO + ' | ' + atualizados.join(', '));
        return { sucesso: true, linha: linhaAtualizar, camposAtualizados: atualizados };

    } finally { lock.releaseLock(); }
}

function atualizarServico(body) {
    if (!body.numeroRDO || body.indice === undefined || body.indice === null) {
        return { sucesso: false, erro: 'numeroRDO e indice são obrigatórios' };
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('Servicos');
        if (!sheet) return { sucesso: false, erro: 'Aba "Servicos" não encontrada' };

        var linhas = _linhasDaAba(sheet, body.numeroRDO);
        if (body.indice < 0 || body.indice >= linhas.length) {
            return { sucesso: false, erro: 'indice ' + body.indice + ' inválido. RDO tem ' + linhas.length + ' serviço(s)' };
        }

        var linha  = linhas[body.indice];
        var header = sheet.getDataRange().getValues()[0].map(function(h) { return h.toString().trim(); });

        var colDesc = _findColSafe(header, 'Descrição');
        var colQty  = _findColSafe(header, 'Quantidade');
        var colUn   = _findColSafe(header, 'Unidade');
        var colObs  = _findColSafe(header, 'Observações');

        if (body.descricao   !== undefined && colDesc >= 0) sheet.getRange(linha, colDesc + 1).setValue(body.descricao);
        if (body.quantidade  !== undefined && colQty  >= 0) sheet.getRange(linha, colQty  + 1).setValue(body.quantidade);
        if (body.unidade     !== undefined && colUn   >= 0) sheet.getRange(linha, colUn   + 1).setValue(body.unidade);
        if (body.observacoes !== undefined && colObs  >= 0) sheet.getRange(linha, colObs  + 1).setValue(body.observacoes);

        SpreadsheetApp.flush();
        Logger.log('[atualizarServico] RDO ' + body.numeroRDO + ' indice ' + body.indice + ' (linha ' + linha + ')');
        return { sucesso: true, linha: linha };
    } finally { lock.releaseLock(); }
}

function adicionarServico(body) {
    if (!body.numeroRDO || !body.descricao || body.quantidade === undefined) {
        return { sucesso: false, erro: 'numeroRDO, descricao e quantidade são obrigatórios' };
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('Servicos');
        if (!sheet) return { sucesso: false, erro: 'Aba "Servicos" não encontrada' };

        sheet.appendRow([
            body.numeroRDO, body.numeroOS || '', body.data || '',
            body.codigoTurma || '', body.encarregado || '',
            body.descricao, body.quantidade, body.unidade || 'UN',
            body.observacoes || '', 'NÃO', ''
        ]);
        SpreadsheetApp.flush();
        Logger.log('[adicionarServico] RDO ' + body.numeroRDO + ' | ' + body.descricao);
        return { sucesso: true, ultimaLinha: sheet.getLastRow() };
    } finally { lock.releaseLock(); }
}

function excluirServico(body) {
    if (!body.numeroRDO || body.indice === undefined) {
        return { sucesso: false, erro: 'numeroRDO e indice são obrigatórios' };
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('Servicos');
        if (!sheet) return { sucesso: false, erro: 'Aba "Servicos" não encontrada' };

        var linhas = _linhasDaAba(sheet, body.numeroRDO);
        if (body.indice < 0 || body.indice >= linhas.length) {
            return { sucesso: false, erro: 'indice ' + body.indice + ' inválido. RDO tem ' + linhas.length + ' serviço(s)' };
        }
        sheet.deleteRow(linhas[body.indice]);
        SpreadsheetApp.flush();
        Logger.log('[excluirServico] RDO ' + body.numeroRDO + ' indice ' + body.indice + ' excluído');
        return { sucesso: true };
    } finally { lock.releaseLock(); }
}

function atualizarHI(body) {
    if (!body.numeroRDO || body.indice === undefined || body.indice === null) {
        return { sucesso: false, erro: 'numeroRDO e indice são obrigatórios' };
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('HorasImprodutivas');
        if (!sheet) return { sucesso: false, erro: 'Aba "HorasImprodutivas" não encontrada' };

        var linhas = _linhasDaAba(sheet, body.numeroRDO);
        if (body.indice < 0 || body.indice >= linhas.length) {
            return { sucesso: false, erro: 'indice ' + body.indice + ' inválido. RDO tem ' + linhas.length + ' HI(s)' };
        }

        var linha  = linhas[body.indice];
        var header = sheet.getDataRange().getValues()[0].map(function(h) { return h.toString().trim(); });

        var colTipo = _findColSafe(header, 'Tipo');
        var colDesc = _findColSafe(header, 'Descrição');
        var colIni  = _findColSafe(header, 'Hora Início');
        var colFim  = _findColSafe(header, 'Hora Fim');
        var colOps  = _findColSafe(header, 'Operadores');

        if (body.tipo       !== undefined && colTipo >= 0) sheet.getRange(linha, colTipo + 1).setValue(body.tipo);
        if (body.descricao  !== undefined && colDesc >= 0) sheet.getRange(linha, colDesc + 1).setValue(body.descricao);
        if (body.horaInicio !== undefined && colIni  >= 0) sheet.getRange(linha, colIni  + 1).setValue(body.horaInicio);
        if (body.horaFim    !== undefined && colFim  >= 0) sheet.getRange(linha, colFim  + 1).setValue(body.horaFim);
        if (body.operadores !== undefined && colOps  >= 0) sheet.getRange(linha, colOps  + 1).setValue(body.operadores);

        SpreadsheetApp.flush();
        Logger.log('[atualizarHI] RDO ' + body.numeroRDO + ' indice ' + body.indice + ' (linha ' + linha + ')');
        return { sucesso: true, linha: linha };
    } finally { lock.releaseLock(); }
}

function adicionarHI(body) {
    if (!body.numeroRDO || !body.tipo || !body.horaInicio || !body.horaFim) {
        return { sucesso: false, erro: 'numeroRDO, tipo, horaInicio e horaFim são obrigatórios' };
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('HorasImprodutivas');
        if (!sheet) return { sucesso: false, erro: 'Aba "HorasImprodutivas" não encontrada' };

        sheet.appendRow([
            body.numeroRDO, body.numeroOS || '', body.data || '',
            body.codigoTurma || '', body.encarregado || '',
            body.tipo, body.descricao || '', body.horaInicio, body.horaFim,
            body.operadores !== undefined ? body.operadores : 12
        ]);
        SpreadsheetApp.flush();
        Logger.log('[adicionarHI] RDO ' + body.numeroRDO + ' | ' + body.tipo + ' ' + body.horaInicio + '-' + body.horaFim);
        return { sucesso: true, ultimaLinha: sheet.getLastRow() };
    } finally { lock.releaseLock(); }
}

function excluirHI(body) {
    if (!body.numeroRDO || body.indice === undefined) {
        return { sucesso: false, erro: 'numeroRDO e indice são obrigatórios' };
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('HorasImprodutivas');
        if (!sheet) return { sucesso: false, erro: 'Aba "HorasImprodutivas" não encontrada' };

        var linhas = _linhasDaAba(sheet, body.numeroRDO);
        if (body.indice < 0 || body.indice >= linhas.length) {
            return { sucesso: false, erro: 'indice ' + body.indice + ' inválido. RDO tem ' + linhas.length + ' HI(s)' };
        }
        sheet.deleteRow(linhas[body.indice]);
        SpreadsheetApp.flush();
        Logger.log('[excluirHI] RDO ' + body.numeroRDO + ' indice ' + body.indice + ' excluído');
        return { sucesso: true };
    } finally { lock.releaseLock(); }
}

function deletarRDO(dados) {
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('RDO');
        var ultimaCol = sheet.getLastColumn();
        var headerRow = sheet.getRange(1, 1, 1, ultimaCol).getValues()[0];

        var colNumeroRDO = -1, colDeletado = -1;
        for (var c = 0; c < headerRow.length; c++) {
            if (headerRow[c] === 'Número RDO') colNumeroRDO = c + 1;
            if (headerRow[c] === 'Deletado')   colDeletado  = c + 1;
        }
        if (colNumeroRDO < 0 || colDeletado < 0) {
            return { sucesso: false, erro: 'Colunas "Número RDO" ou "Deletado" não encontradas' };
        }

        var ultimaLinha = sheet.getLastRow();
        var rdoVals = sheet.getRange(2, colNumeroRDO, ultimaLinha - 1, 1).getValues();
        for (var i = 0; i < rdoVals.length; i++) {
            if (String(rdoVals[i][0]).trim() === String(dados.numeroRDO).trim()) {
                sheet.getRange(i + 2, colDeletado).setValue('Sim');
                SpreadsheetApp.flush();
                return { sucesso: true };
            }
        }
        return { sucesso: false, erro: 'RDO não encontrado: ' + dados.numeroRDO };
    } finally { lock.releaseLock(); }
}

/**
 * Normaliza a célula de data da aba Notas para "dd/MM/yyyy".
 * O Sheets converte automaticamente textos como "05/07/2026" em Date —
 * sem esta normalização a comparação/leitura nunca casa com o dashboard.
 */
function _notaDataStr(v) {
    if (v instanceof Date) {
        return Utilities.formatDate(v, 'America/Sao_Paulo', 'dd/MM/yyyy');
    }
    return (v || '').toString().trim();
}

// IMPORTANTE: retornar objeto simples (doPost já envolve com _resposta).
// A versão anterior retornava ContentService.TextOutput e o _resposta
// re-serializava para "{}" — o dashboard nunca recebia as notas.
function salvarNotaDia(dados) {
    var turma = (dados.turma || '').toString().trim();
    var data  = (dados.data  || '').toString().trim();
    var nota  = dados.nota;
    if (!turma || !data) return { sucesso: false, erro: 'turma e data são obrigatórios' };

    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var notas = ss.getSheetByName('Notas');
    if (!notas) {
        notas = ss.insertSheet('Notas');
        notas.appendRow(['Turma', 'Data', 'Nota', 'Atualizado Em']);
    }
    var rows = notas.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
        if ((rows[i][0] || '').toString().trim() === turma && _notaDataStr(rows[i][1]) === data) {
            if (nota) notas.getRange(i + 1, 3, 1, 2).setValues([[nota, new Date().toISOString()]]);
            else notas.deleteRow(i + 1);
            SpreadsheetApp.flush();
            return { sucesso: true };
        }
    }
    if (nota) notas.appendRow([turma, data, nota, new Date().toISOString()]);
    SpreadsheetApp.flush();
    return { sucesso: true };
}

function obterNotasDia() {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var notas = ss.getSheetByName('Notas');
    var arr   = [];
    if (notas) {
        var rows = notas.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
            if (!rows[i][0] || !rows[i][1]) continue;
            arr.push({
                turma: (rows[i][0] || '').toString().trim(),
                data:  _notaDataStr(rows[i][1]),
                nota:  (rows[i][2] || '').toString()
            });
        }
    }
    return { sucesso: true, notas: arr };
}
