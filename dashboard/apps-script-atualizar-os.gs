/**
 * Google Apps Script - Endpoint para o Dashboard Engecom/Encogel
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
 *   { "acao": "uploadAnexo",    "numeroOS": "...", "nome": "...", "tipo": "...", "base64": "..." }
 *   { "acao": "deletarAnexo",   "fileId": "..." }
 *
 * CONFIGURACAO OPCIONAL:
 *   DRIVE_FOLDER_ID - ID da pasta do Google Drive onde os anexos serao salvos.
 *   Deixe vazio ('') para usar o Drive raiz da conta.
 */

// ID da pasta do Google Drive para os anexos (deixe '' para usar o Drive raiz)
var DRIVE_FOLDER_ID = '';

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
            return _resposta(salvarGestaoOS(dados.numeroOS, dados.status, dados.gevia, dados.nota, dados.mediu, dados.anexos));
        }

        if (dados.acao === 'uploadAnexo') {
            return _resposta(uploadAnexo(dados.numeroOS, dados.nome, dados.tipo, dados.base64));
        }

        if (dados.acao === 'deletarAnexo') {
            return _resposta(deletarAnexo(dados.fileId));
        }

        if (dados.acao === 'atualizarOSCascata') {
            return _resposta(atualizarOSCascata(dados.antigaOS, dados.novaOS));
        }

        if (dados.acao === 'dividirOS') {
            return _resposta(dividirOS(
                dados.numeroRDO, dados.os1, dados.os2,
                dados.servicosOS2 || [], dados.hiOS2 || [], dados.movimentacao || []
            ));
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
    var colMd  = _findColSafe(header, 'Mediu');
    var colAnx = _findColSafe(header, 'Anexos');

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
function salvarGestaoOS(numeroOS, status, gevia, nota, mediu, anexos) {
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
        return _salvarGestaoOSInterno(numeroOS, status, gevia, nota, mediu, anexos);
    } finally {
        lock.releaseLock();
    }
}

function _salvarGestaoOSInterno(numeroOS, status, gevia, nota, mediu, anexos) {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = _obterOuCriarAbaGestaoOS(ss);

    var dados  = sheet.getDataRange().getValues();
    var header = dados[0].map(function(h) { return h.toString().trim(); });
    var colOS  = _findCol(header, 'N\u00famero OS');
    var colSt  = _findCol(header, 'Status');
    var colGV  = _findCol(header, 'GE/Via');
    var colNt  = _findCol(header, 'Nota');
    var colAt  = _findCol(header, 'Atualizado Em');
    var colMediu = _findColSafe(header, 'Mediu');
    var colAnx   = _findColSafe(header, 'Anexos');
    var agora  = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
    var anexosStr = (typeof anexos === 'string') ? anexos : (anexos ? JSON.stringify(anexos) : '[]');

    // Procurar linha existente com esse Numero OS
    for (var i = 1; i < dados.length; i++) {
        var osNaLinha = (dados[i][colOS] || '').toString().trim();
        if (osNaLinha === numeroOS.trim()) {
            var row = i + 1;
            sheet.getRange(row, colSt + 1).setValue(status || '');
            sheet.getRange(row, colGV + 1).setValue(gevia  || '');
            sheet.getRange(row, colNt + 1).setValue(nota !== undefined ? nota : '');
            if (colMediu >= 0) sheet.getRange(row, colMediu + 1).setValue(mediu !== undefined ? mediu : '');
            if (colAnx   >= 0) sheet.getRange(row, colAnx   + 1).setValue(anexosStr);
            sheet.getRange(row, colAt + 1).setValue(agora);
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
        mediu !== undefined ? mediu : '',
        anexosStr,
        agora
    ]);
    SpreadsheetApp.flush();
    Logger.log('[GestaoOS] Inserido: OS ' + numeroOS);
    return { sucesso: true, acao: 'inserido' };
}

// === Acao: uploadAnexo ===

/**
 * Recebe um arquivo em base64 e salva no Google Drive.
 * Registra os metadados na aba "AnexosOS".
 */
function uploadAnexo(numeroOS, nome, tipo, base64) {
    if (!base64) return { sucesso: false, erro: 'Conteudo base64 vazio' };
    if (!nome)   return { sucesso: false, erro: 'Nome do arquivo obrigatorio' };

    try {
        var bytes = Utilities.base64Decode(base64);
        var blob  = Utilities.newBlob(bytes, tipo || 'application/octet-stream', nome);

        var folder;
        if (DRIVE_FOLDER_ID && DRIVE_FOLDER_ID.trim()) {
            try {
                folder = DriveApp.getFolderById(DRIVE_FOLDER_ID.trim());
            } catch (e) {
                return { sucesso: false, erro: 'Pasta Drive "' + DRIVE_FOLDER_ID + '" nao encontrada.' };
            }
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
            sheet.appendRow(['N\u00famero OS', 'Nome', 'URL', 'FileId', 'Tipo', 'Data Upload']);
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

/**
 * Move um arquivo do Google Drive para a lixeira pelo fileId.
 * Remove tambem a linha correspondente da aba "AnexosOS".
 */
function deletarAnexo(fileId) {
    if (!fileId) return { sucesso: false, erro: 'fileId obrigatorio' };

    try {
        var file = DriveApp.getFileById(fileId);
        file.setTrashed(true);

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
        var header = dados[0];
        var colFid = header.findIndex(function(h) { return h.toString().trim() === 'FileId'; });
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

/**
 * Adiciona valores na lista de validacao (dropdown) de uma coluna.
 * Necessario quando os1/os2 sao numeros novos, fora da lista existente.
 * Se a coluna nao tiver validacao do tipo VALUE_IN_LIST, nao faz nada.
 */
function _adicionarOSNaValidacao(sheet, colIdx, novosValores) {
    try {
        var lastRow = sheet.getLastRow();
        if (lastRow < 2) return; // sem dados

        // Ler regra de validacao da primeira celula de dados da coluna
        var primeiraCell = sheet.getRange(2, colIdx + 1);
        var rule = primeiraCell.getDataValidation();
        if (!rule) return; // sem validacao, nao precisa fazer nada

        var tipo = rule.getCriteriaType();
        if (tipo !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) return;

        var criteriaValues = rule.getCriteriaValues();
        var listaAtual = criteriaValues[0] || [];     // array de strings permitidas
        var mostrarDropdown = criteriaValues[1] !== false;

        // Adicionar apenas os valores que ainda nao estao na lista
        var mudou = false;
        novosValores.forEach(function(v) {
            var val = (v || '').toString().trim();
            if (val && listaAtual.indexOf(val) === -1) {
                listaAtual.push(val);
                mudou = true;
            }
        });

        if (!mudou) return; // ja estavam na lista

        // Reaplicar a validacao com a lista expandida em toda a coluna de dados
        var novaRegra = SpreadsheetApp.newDataValidation()
            .requireValueInList(listaAtual, mostrarDropdown)
            .build();
        sheet.getRange(2, colIdx + 1, lastRow - 1, 1).setDataValidation(novaRegra);
        SpreadsheetApp.flush();

        Logger.log('[_adicionarOSNaValidacao] Adicionados: ' + novosValores.join(', '));
    } catch (e) {
        // Nao-fatal: se falhar, a escrita vai gerar o erro original de validacao
        Logger.log('[_adicionarOSNaValidacao] Erro (nao-fatal): ' + e.message);
    }
}

/**
 * Retorna a aba "GestaoOS", criando-a com cabecalho se nao existir.
 */
function _obterOuCriarAbaGestaoOS(ss) {
    var sheet = ss.getSheetByName('GestaoOS');
    if (!sheet) {
        sheet = ss.insertSheet('GestaoOS');
        sheet.appendRow(['N\u00famero OS', 'Status', 'GE/Via', 'Nota', 'Mediu', 'Anexos', 'Atualizado Em']);

        var headerRange = sheet.getRange(1, 1, 1, 7);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#f3f3f3');

        sheet.setColumnWidth(1, 130);
        sheet.setColumnWidth(2, 180);
        sheet.setColumnWidth(3, 120);
        sheet.setColumnWidth(4, 350);
        sheet.setColumnWidth(5, 100);
        sheet.setColumnWidth(6, 400);
        sheet.setColumnWidth(7, 160);

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
 * Retorna o indice de uma coluna pelo nome (case-insensitive).
 * Retorna -1 se nao encontrar (nao lanca erro).
 */
function _findColSafe(header, nome) {
    return header.findIndex(function(h) { return h.toLowerCase() === nome.toLowerCase(); });
}

/**
 * Serializa a resposta como JSON para o ContentService.
 */
function _resposta(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

// === Acao: atualizarOSCascata ===

/**
 * Atualiza o numero de O.S em cascata: percorre todas as abas e substitui
 * antigaOS por novaOS na coluna "Numero OS".
 * Usa batch write (setValues) para performance.
 */
function atualizarOSCascata(antigaOS, novaOS) {
    if (!antigaOS || !novaOS) return { sucesso: false, erro: 'Parametros obrigatorios: antigaOS e novaOS' };

    // Lock para evitar cascatas simultâneas
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) {
        return { sucesso: false, erro: 'Servidor ocupado. Tente novamente em alguns segundos.' };
    }

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

    abas.forEach(function(nomeAba) {
        var sheet = ss.getSheetByName(nomeAba);
        if (!sheet) { resultado.abas[nomeAba] = 'aba nao existe'; return; }

        var range = sheet.getDataRange();
        var dados = range.getValues();
        var colOS = _findColSafe(dados[0], 'Numero OS');
        if (colOS < 0) colOS = _findColSafe(dados[0].map(function(h) { return h.toString().trim(); }), 'N\u00famero OS');
        if (colOS < 0) { resultado.abas[nomeAba] = 'sem coluna Numero OS'; return; }

        var count = 0;
        for (var i = 1; i < dados.length; i++) {
            if ((dados[i][colOS] || '').toString().trim() === antigaOS.trim()) {
                dados[i][colOS] = novaOS;
                count++;
            }
        }
        if (count > 0) { range.setValues(dados); SpreadsheetApp.flush(); }
        resultado.abas[nomeAba] = count;
    });

    Logger.log('[atualizarOSCascata] ' + antigaOS + ' -> ' + novaOS + ' | ' + JSON.stringify(resultado.abas));
    return resultado;
}

// === Acao: dividirOS ===

/**
 * Divide uma O.S em duas:
 *   - RDO original fica com OS1
 *   - Novo RDO clonado e criado para OS2 com os servicos/HI atribuidos
 *
 * @param {string}   numeroRDO   - Numero RDO a dividir
 * @param {string}   os1         - O.S que fica no RDO original
 * @param {string}   os2         - Nova O.S para o RDO clonado
 * @param {string[]} servicosOS2 - Chaves "desc|qty|coef" dos servicos que vao para OS2
 * @param {string[]} hiOS2       - Chaves "data|tipo|ini|fim|ops" dos HIs que vao para OS2
 * @param {Object[]} movimentacao - Log de itens movidos (para auditoria)
 */
function dividirOS(numeroRDO, os1, os2, servicosOS2, hiOS2, movimentacao) {
    if (!numeroRDO || !os1 || !os2) {
        return { sucesso: false, erro: 'Parametros obrigatorios: numeroRDO, os1, os2' };
    }
    if (os1 === os2) {
        return { sucesso: false, erro: 'OS1 e OS2 devem ser diferentes' };
    }

    var lock = LockService.getScriptLock();
    try {
        lock.waitLock(15000);
    } catch (e) {
        return { sucesso: false, erro: 'Servidor ocupado. Tente novamente.' };
    }

    try {
        return _dividirOSInterno(numeroRDO, os1, os2, servicosOS2, hiOS2, movimentacao);
    } finally {
        lock.releaseLock();
    }
}

function _dividirOSInterno(numeroRDO, os1, os2, servicosOS2, hiOS2, movimentacao) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var abaRDO = ss.getSheetByName('RDO');
    if (!abaRDO) return { sucesso: false, erro: 'Aba RDO nao encontrada' };

    // 1. Localizar e atualizar RDO original com OS1
    var dadosRDO = abaRDO.getDataRange().getValues();
    var hdrRDO   = dadosRDO[0].map(function(h) { return h.toString().trim(); });
    var colRDONum = _findColSafe(hdrRDO, 'N\u00famero RDO');
    var colOS     = _findColSafe(hdrRDO, 'N\u00famero OS');
    if (colRDONum < 0) return { sucesso: false, erro: 'Coluna "Numero RDO" nao encontrada na aba RDO' };
    if (colOS < 0)     return { sucesso: false, erro: 'Coluna "Numero OS" nao encontrada na aba RDO' };

    var linhaOriginal = -1;
    var dadosRDOOriginal = null;
    for (var i = 1; i < dadosRDO.length; i++) {
        if ((dadosRDO[i][colRDONum] || '').toString().trim() === numeroRDO.trim()) {
            linhaOriginal = i;
            dadosRDOOriginal = dadosRDO[i].slice(); // copia
            break;
        }
    }
    if (linhaOriginal < 0) {
        return { sucesso: false, erro: 'Numero RDO "' + numeroRDO + '" nao encontrado' };
    }

    // Adicionar os1 e os2 na lista de validacao da coluna OS antes de qualquer escrita.
    // Tanto os1 quanto os2 podem ser numeros novos, fora do dropdown atual.
    _adicionarOSNaValidacao(abaRDO, colOS, [os1, os2]);

    // Atualizar OS do RDO original para OS1
    abaRDO.getRange(linhaOriginal + 1, colOS + 1).setValue(os1);
    SpreadsheetApp.flush();

    // 2. Gerar numero RDO para o novo RDO (OS2)
    var novoNumeroRDO = _proximoSequencial(ss, os2, dadosRDOOriginal, hdrRDO);

    // 3. Clonar linha do RDO original com OS2 e novo numeroRDO
    var novaLinhaRDO = dadosRDOOriginal.slice();
    novaLinhaRDO[colOS] = os2;
    if (colRDONum >= 0) novaLinhaRDO[colRDONum] = novoNumeroRDO;
    // Atualizar coluna Data Criacao se existir
    var colDataCriacao = _findColSafe(hdrRDO, 'Data Cria\u00e7\u00e3o');
    if (colDataCriacao >= 0) {
        novaLinhaRDO[colDataCriacao] = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
    }
    // Inserir nova linha (os2 ja foi adicionado na lista de validacao acima)
    var novaPosicao = abaRDO.getLastRow() + 1;
    abaRDO.insertRowAfter(abaRDO.getLastRow());
    abaRDO.getRange(novaPosicao, 1, 1, novaLinhaRDO.length).setValues([novaLinhaRDO]);
    SpreadsheetApp.flush();

    // 4. Mover servicos e HI para o novo RDO
    _moverLinhasParaNovoRDO(ss, 'Servicos', numeroRDO, novoNumeroRDO, os2, servicosOS2, 'servico');
    _moverLinhasParaNovoRDO(ss, 'HorasImprodutivas', numeroRDO, novoNumeroRDO, os2, hiOS2, 'hi');

    Logger.log('[dividirOS] RDO ' + numeroRDO + ' dividido: OS1=' + os1 + ' OS2=' + os2 +
               ' novoRDO=' + novoNumeroRDO +
               ' servicosMovidos=' + servicosOS2.length + ' hiMovidos=' + hiOS2.length);

    return {
        sucesso: true,
        novoNumeroRDO: novoNumeroRDO,
        os1: os1,
        os2: os2,
        servicosMovidos: servicosOS2.length,
        hiMovidos: hiOS2.length,
        movimentacao: movimentacao || []
    };
}

/**
 * Gera o proximo numero RDO sequencial para a OS2.
 * Formato: OS2-DD.MM.YY-XXX (mesma data do RDO original).
 */
function _proximoSequencial(ss, os2, dadosRDOOriginal, hdrRDO) {
    var colData = _findColSafe(hdrRDO, 'Data');
    var dataStr = colData >= 0 ? (dadosRDOOriginal[colData] || '').toString().trim() : '';

    // Formatar data como DD.MM.YY
    var dataPart = '';
    if (dataStr) {
        var partes = dataStr.split('/');
        if (partes.length === 3) {
            dataPart = partes[0] + '.' + partes[1] + '.' + partes[2].slice(-2);
        }
    }
    if (!dataPart) {
        var hoje = new Date();
        dataPart = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd.MM.yy');
    }

    var prefixo = os2.trim() + '-' + dataPart + '-';

    // Encontrar maior sequencial existente
    var abaRDO = ss.getSheetByName('RDO');
    var maior = 0;
    if (abaRDO) {
        var dados = abaRDO.getDataRange().getValues();
        var colRDONum = _findColSafe(dados[0].map(function(h) { return h.toString().trim(); }), 'N\u00famero RDO');
        if (colRDONum >= 0) {
            for (var i = 1; i < dados.length; i++) {
                var num = (dados[i][colRDONum] || '').toString().trim();
                if (num.indexOf(prefixo) === 0) {
                    var seq = parseInt(num.replace(prefixo, ''), 10);
                    if (!isNaN(seq) && seq > maior) maior = seq;
                }
            }
        }
    }

    var proximo = maior + 1;
    return prefixo + (proximo < 10 ? '00' + proximo : proximo < 100 ? '0' + proximo : '' + proximo);
}

/**
 * Move linhas de uma aba relacionada (Servicos ou HorasImprodutivas) para o novo RDO.
 * As linhas originais SAO removidas do RDO original (iteracao de tras pra frente).
 *
 * Para Servicos: chave = "desc|qty|coef"
 * Para HorasImprodutivas: chave = "data|tipo|ini|fim|ops"
 */
function _moverLinhasParaNovoRDO(ss, nomeAba, rdoOriginal, novoRDO, novaOS, chaves, tipo) {
    if (!chaves || chaves.length === 0) return;

    var sheet = ss.getSheetByName(nomeAba);
    if (!sheet) {
        Logger.log('[_moverLinhasParaNovoRDO] Aba "' + nomeAba + '" nao encontrada');
        return;
    }

    var dados = sheet.getDataRange().getValues();
    var hdr   = dados[0].map(function(h) { return h.toString().trim(); });
    var colRDONum = _findColSafe(hdr, 'N\u00famero RDO');
    var colOS     = _findColSafe(hdr, 'N\u00famero OS');
    if (colRDONum < 0) { Logger.log('[_moverLinhasParaNovoRDO] Sem coluna Numero RDO em ' + nomeAba); return; }

    // Pre-calcular indices de coluna fora do loop
    var colDesc = -1, colQty = -1, colCoef = -1, colDataRDO = -1, colTipo = -1, colIni = -1, colFim = -1, colOps = -1;
    if (tipo === 'servico') {
        colDesc = _findColSafe(hdr, 'Descri\u00e7\u00e3o');
        colQty  = _findColSafe(hdr, 'Quantidade');
        colCoef = _findColSafe(hdr, 'Coeficiente');
    } else if (tipo === 'hi') {
        colDataRDO = _findColSafe(hdr, 'Data RDO');
        colTipo    = _findColSafe(hdr, 'Tipo');
        colIni     = _findColSafe(hdr, 'Hora In\u00edcio');
        colFim     = _findColSafe(hdr, 'Hora Fim');
        colOps     = _findColSafe(hdr, 'Operadores');
    }

    // Construir set de chaves para lookup rapido
    var chavesSet = {};
    chaves.forEach(function(c) { chavesSet[c] = true; });

    // Identificar linhas a mover (indices das linhas de dados, 1-based)
    var linhasParaMover = []; // { idx: indice_em_dados, clone: linha_copiada }
    for (var i = 1; i < dados.length; i++) {
        var rdoNaLinha = (dados[i][colRDONum] || '').toString().trim();
        if (rdoNaLinha !== rdoOriginal.trim()) continue;

        var chave = '';
        if (tipo === 'servico') {
            var desc = colDesc >= 0 ? (dados[i][colDesc] || '').toString().trim() : '';
            var qty  = colQty  >= 0 ? (dados[i][colQty]  || '').toString().trim() : '';
            var coef = colCoef >= 0 ? (dados[i][colCoef] || '').toString().trim() : '';
            chave = desc + '|' + qty + '|' + coef;
        } else if (tipo === 'hi') {
            var dataRDO = colDataRDO >= 0 ? (dados[i][colDataRDO] || '').toString().trim() : '';
            var tipoHI  = colTipo    >= 0 ? (dados[i][colTipo]    || '').toString().trim() : '';
            var ini     = colIni     >= 0 ? (dados[i][colIni]     || '').toString().trim() : '';
            var fim     = colFim     >= 0 ? (dados[i][colFim]     || '').toString().trim() : '';
            var ops     = colOps     >= 0 ? (dados[i][colOps]     || '').toString().trim() : '';
            chave = dataRDO + '|' + tipoHI + '|' + ini + '|' + fim + '|' + ops;
        }

        if (chavesSet[chave]) {
            linhasParaMover.push({ idx: i, clone: dados[i].slice() });
        }
    }

    if (linhasParaMover.length === 0) return;

    // Inserir clones com novo RDO/OS
    linhasParaMover.forEach(function(item) {
        item.clone[colRDONum] = novoRDO;
        if (colOS >= 0) item.clone[colOS] = novaOS;
        sheet.appendRow(item.clone);
    });

    // Remover linhas originais de tras pra frente (para nao deslocar indices)
    for (var j = linhasParaMover.length - 1; j >= 0; j--) {
        sheet.deleteRow(linhasParaMover[j].idx + 1); // +1: planilha e 1-based
    }

    SpreadsheetApp.flush();
    Logger.log('[_moverLinhasParaNovoRDO] ' + nomeAba + ': ' + linhasParaMover.length + ' linha(s) movidas para ' + novoRDO);
}
