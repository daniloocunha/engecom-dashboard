/\*\*

&nbsp;\* Google Apps Script - Endpoint para o Dashboard Engecom/Encogel

&nbsp;\*

&nbsp;\* ACOES SUPORTADAS:

&nbsp;\*   atualizarOS, listarGestaoOS, salvarGestaoOS, uploadAnexo, deletarAnexo,

&nbsp;\*   atualizarOSCascata, atualizarCampoRDO, atualizarServico, adicionarServico,

&nbsp;\*   excluirServico, atualizarHI, adicionarHI, excluirHI, deletarRDO,

&nbsp;\*   renomearRDO, dividirOS

&nbsp;\*/



// ID da pasta do Google Drive para os anexos (deixe '' para usar o Drive raiz)

var DRIVE\_FOLDER\_ID = '';



// === Handler principal ===



function doPost(e) {

&nbsp;   try {

&nbsp;       var dados = JSON.parse(e.postData.contents);



&nbsp;       if (dados.acao === 'atualizarOS')        { return \_resposta(atualizarNumerOS(dados.numeroRDO, dados.novaOS)); }

&nbsp;       if (dados.acao === 'listarGestaoOS')      { return \_resposta(listarGestaoOS()); }

&nbsp;       if (dados.acao === 'salvarGestaoOS')      { return \_resposta(salvarGestaoOS(dados.numeroOS, dados.status, dados.gevia, dados.nota, dados.mediu, dados.anexos)); }

&nbsp;       if (dados.acao === 'uploadAnexo')         { return \_resposta(uploadAnexo(dados.numeroOS, dados.nome, dados.tipo, dados.base64)); }

&nbsp;       if (dados.acao === 'deletarAnexo')        { return \_resposta(deletarAnexo(dados.fileId)); }

&nbsp;       if (dados.acao === 'atualizarOSCascata')  { return \_resposta(atualizarOSCascata(dados.antigaOS, dados.novaOS)); }

&nbsp;       if (dados.acao === 'atualizarCampoRDO')   { return \_resposta(atualizarCampoRDO(dados)); }

&nbsp;       if (dados.acao === 'atualizarServico')    { return \_resposta(atualizarServico(dados)); }

&nbsp;       if (dados.acao === 'adicionarServico')    { return \_resposta(adicionarServico(dados)); }

&nbsp;       if (dados.acao === 'excluirServico')      { return \_resposta(excluirServico(dados)); }

&nbsp;       if (dados.acao === 'atualizarHI')         { return \_resposta(atualizarHI(dados)); }

&nbsp;       if (dados.acao === 'adicionarHI')         { return \_resposta(adicionarHI(dados)); }

&nbsp;       if (dados.acao === 'excluirHI')           { return \_resposta(excluirHI(dados)); }

&nbsp;       if (dados.acao === 'deletarRDO')          { return \_resposta(deletarRDO(dados)); }

&nbsp;       if (dados.acao === 'renomearRDO')         { return \_resposta(renomearRDO(dados)); }   // ← CORRIGIDO: era 'acao'

&nbsp;       if (dados.acao === 'dividirOS')           { return \_resposta(dividirOS(dados)); }       // ← CORRIGIDO: era dividirOS(dados.numeroRDO, ...)

&nbsp;       if (dados.acao === 'salvarNotaDia')       { return \_resposta(salvarNotaDia(dados)); }

&nbsp;       if (dados.acao === 'obterNotasDia')       { return \_resposta(obterNotasDia()); }



&nbsp;       return \_resposta({ sucesso: false, erro: 'Acao desconhecida: ' + dados.acao });



&nbsp;   } catch (err) {

&nbsp;       return \_resposta({ sucesso: false, erro: err.message });

&nbsp;   }

}



function doGet(e) {

&nbsp;   return ContentService

&nbsp;       .createTextOutput(JSON.stringify({ status: 'ok', descricao: 'Endpoint Engecom - use POST' }))

&nbsp;       .setMimeType(ContentService.MimeType.JSON);

}



// === Acao: atualizarOS ===



function atualizarNumerOS(numeroRDO, novaOS) {

&nbsp;   if (!numeroRDO || !novaOS) {

&nbsp;       return { sucesso: false, erro: 'Parametros obrigatorios: numeroRDO e novaOS' };

&nbsp;   }



&nbsp;   var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;   var sheet = ss.getSheetByName('RDO');

&nbsp;   if (!sheet) return { sucesso: false, erro: 'Aba "RDO" nao encontrada na planilha' };



&nbsp;   var dados  = sheet.getDataRange().getValues();

&nbsp;   var header = dados\[0];

&nbsp;   var colRDO = \_findColSafe(header.map(function(h) { return h.toString().trim(); }), 'Número RDO');

&nbsp;   var colOS  = \_findColSafe(header.map(function(h) { return h.toString().trim(); }), 'Número OS');



&nbsp;   if (colRDO < 0) return { sucesso: false, erro: 'Coluna "Número RDO" nao encontrada na aba RDO' };

&nbsp;   if (colOS  < 0) return { sucesso: false, erro: 'Coluna "Número OS" nao encontrada na aba RDO' };



&nbsp;   for (var i = 1; i < dados.length; i++) {

&nbsp;       if ((dados\[i]\[colRDO] || '').toString().trim() === numeroRDO.trim()) {

&nbsp;           sheet.getRange(i + 1, colOS + 1).setValue(novaOS);

&nbsp;           SpreadsheetApp.flush();

&nbsp;           Logger.log('Atualizado: RDO ' + numeroRDO + ' -> OS ' + novaOS + ' (linha ' + (i + 1) + ')');

&nbsp;           return { sucesso: true, linhaAtualizada: i + 1 };

&nbsp;       }

&nbsp;   }

&nbsp;   return { sucesso: false, erro: 'Numero RDO "' + numeroRDO + '" nao encontrado na aba RDO' };

}



// === Acao: listarGestaoOS ===



function listarGestaoOS() {

&nbsp;   var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;   var sheet = \_obterOuCriarAbaGestaoOS(ss);

&nbsp;   var dados = sheet.getDataRange().getValues();

&nbsp;   if (dados.length <= 1) return { sucesso: true, dados: {} };



&nbsp;   var header = dados\[0].map(function(h) { return h.toString().trim(); });

&nbsp;   var colOS  = \_findCol(header, 'Número OS');

&nbsp;   var colSt  = \_findCol(header, 'Status');

&nbsp;   var colGV  = \_findCol(header, 'GE/Via');

&nbsp;   var colNt  = \_findCol(header, 'Nota');

&nbsp;   var colAt  = \_findCol(header, 'Atualizado Em');

&nbsp;   var colMd  = \_findColSafe(header, 'Mediu');

&nbsp;   var colAnx = \_findColSafe(header, 'Anexos');



&nbsp;   var resultado = {};

&nbsp;   for (var i = 1; i < dados.length; i++) {

&nbsp;       var row = dados\[i];

&nbsp;       var numeroOS = (row\[colOS] || '').toString().trim();

&nbsp;       if (!numeroOS) continue;

&nbsp;       resultado\[numeroOS] = {

&nbsp;           status:       (row\[colSt] || '').toString().trim() || null,

&nbsp;           gevia:        (row\[colGV] || '').toString().trim() || null,

&nbsp;           nota:         (row\[colNt] || '').toString(),

&nbsp;           mediu:        colMd  >= 0 ? (row\[colMd]  || '').toString().trim() || null : null,

&nbsp;           anexos:       colAnx >= 0 ? (row\[colAnx] || '').toString().trim() || '\[]' : '\[]',

&nbsp;           atualizadoEm: (row\[colAt] || '').toString()

&nbsp;       };

&nbsp;   }

&nbsp;   Logger.log('\[GestaoOS] Listagem: ' + Object.keys(resultado).length + ' registros');

&nbsp;   return { sucesso: true, dados: resultado };

}



// === Acao: salvarGestaoOS ===



function salvarGestaoOS(numeroOS, status, gevia, nota, mediu, anexos) {

&nbsp;   if (!numeroOS) return { sucesso: false, erro: 'Parametro obrigatorio: numeroOS' };



&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   try { lock.waitLock(8000); }

&nbsp;   catch (e) { return { sucesso: false, erro: 'Servidor ocupado. Tente novamente em instantes.' }; }



&nbsp;   try {

&nbsp;       return \_salvarGestaoOSInterno(numeroOS, status, gevia, nota, mediu, anexos);

&nbsp;   } finally {

&nbsp;       lock.releaseLock();

&nbsp;   }

}



function \_salvarGestaoOSInterno(numeroOS, status, gevia, nota, mediu, anexos) {

&nbsp;   var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;   var sheet = \_obterOuCriarAbaGestaoOS(ss);

&nbsp;   var dados  = sheet.getDataRange().getValues();

&nbsp;   var header = dados\[0].map(function(h) { return h.toString().trim(); });

&nbsp;   var colOS  = \_findCol(header, 'Número OS');

&nbsp;   var colSt  = \_findCol(header, 'Status');

&nbsp;   var colGV  = \_findCol(header, 'GE/Via');

&nbsp;   var colNt  = \_findCol(header, 'Nota');

&nbsp;   var colAt  = \_findCol(header, 'Atualizado Em');

&nbsp;   var colMediu = \_findColSafe(header, 'Mediu');

&nbsp;   var colAnx   = \_findColSafe(header, 'Anexos');

&nbsp;   var agora    = Utilities.formatDate(new Date(), 'America/Sao\_Paulo', 'dd/MM/yyyy HH:mm:ss');

&nbsp;   var anexosStr = (typeof anexos === 'string') ? anexos : (anexos ? JSON.stringify(anexos) : '\[]');



&nbsp;   for (var i = 1; i < dados.length; i++) {

&nbsp;       if ((dados\[i]\[colOS] || '').toString().trim() === numeroOS.trim()) {

&nbsp;           var row = i + 1;

&nbsp;           sheet.getRange(row, colSt + 1).setValue(status || '');

&nbsp;           sheet.getRange(row, colGV + 1).setValue(gevia  || '');

&nbsp;           sheet.getRange(row, colNt + 1).setValue(nota !== undefined ? nota : '');

&nbsp;           if (colMediu >= 0) sheet.getRange(row, colMediu + 1).setValue(mediu !== undefined ? mediu : '');

&nbsp;           if (colAnx   >= 0) sheet.getRange(row, colAnx   + 1).setValue(anexosStr);

&nbsp;           sheet.getRange(row, colAt + 1).setValue(agora);

&nbsp;           SpreadsheetApp.flush();

&nbsp;           Logger.log('\[GestaoOS] Atualizado: OS ' + numeroOS + ' (linha ' + row + ')');

&nbsp;           return { sucesso: true, acao: 'atualizado', linha: row };

&nbsp;       }

&nbsp;   }



&nbsp;   sheet.appendRow(\[numeroOS.trim(), status || '', gevia || '', nota !== undefined ? nota : '',

&nbsp;                    mediu !== undefined ? mediu : '', anexosStr, agora]);

&nbsp;   SpreadsheetApp.flush();

&nbsp;   Logger.log('\[GestaoOS] Inserido: OS ' + numeroOS);

&nbsp;   return { sucesso: true, acao: 'inserido' };

}



// === Acao: uploadAnexo ===



function uploadAnexo(numeroOS, nome, tipo, base64) {

&nbsp;   if (!base64) return { sucesso: false, erro: 'Conteudo base64 vazio' };

&nbsp;   if (!nome)   return { sucesso: false, erro: 'Nome do arquivo obrigatorio' };



&nbsp;   try {

&nbsp;       var bytes = Utilities.base64Decode(base64);

&nbsp;       var blob  = Utilities.newBlob(bytes, tipo || 'application/octet-stream', nome);



&nbsp;       var folder;

&nbsp;       if (DRIVE\_FOLDER\_ID \&\& DRIVE\_FOLDER\_ID.trim()) {

&nbsp;           try { folder = DriveApp.getFolderById(DRIVE\_FOLDER\_ID.trim()); }

&nbsp;           catch (e) { return { sucesso: false, erro: 'Pasta Drive "' + DRIVE\_FOLDER\_ID + '" nao encontrada.' }; }

&nbsp;       } else {

&nbsp;           folder = DriveApp.getRootFolder();

&nbsp;       }



&nbsp;       var file = folder.createFile(blob);

&nbsp;       file.setSharing(DriveApp.Access.ANYONE\_WITH\_LINK, DriveApp.Permission.VIEW);

&nbsp;       var fileId  = file.getId();

&nbsp;       var fileUrl = 'https://drive.google.com/uc?export=view\&id=' + fileId;



&nbsp;       \_registrarAnexoNaAba(numeroOS, nome, fileUrl, fileId, tipo || '');

&nbsp;       Logger.log('uploadAnexo: ' + nome + ' -> ' + fileUrl);

&nbsp;       return { sucesso: true, url: fileUrl, fileId: fileId, nome: nome };



&nbsp;   } catch (err) {

&nbsp;       Logger.log('uploadAnexo erro: ' + err.message);

&nbsp;       return { sucesso: false, erro: err.message };

&nbsp;   }

}



function \_registrarAnexoNaAba(numeroOS, nome, url, fileId, tipo) {

&nbsp;   try {

&nbsp;       var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;       var sheet = ss.getSheetByName('AnexosOS');

&nbsp;       if (!sheet) {

&nbsp;           sheet = ss.insertSheet('AnexosOS');

&nbsp;           sheet.appendRow(\['Número OS', 'Nome', 'URL', 'FileId', 'Tipo', 'Data Upload']);

&nbsp;           sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#e8f0fe');

&nbsp;           sheet.setFrozenRows(1);

&nbsp;       }

&nbsp;       var dataUpload = Utilities.formatDate(new Date(), 'America/Sao\_Paulo', 'dd/MM/yyyy HH:mm');

&nbsp;       sheet.appendRow(\[numeroOS, nome, url, fileId, tipo, dataUpload]);

&nbsp;   } catch (err) {

&nbsp;       Logger.log('\_registrarAnexoNaAba erro: ' + err.message);

&nbsp;   }

}



// === Acao: deletarAnexo ===



function deletarAnexo(fileId) {

&nbsp;   if (!fileId) return { sucesso: false, erro: 'fileId obrigatorio' };

&nbsp;   try {

&nbsp;       DriveApp.getFileById(fileId).setTrashed(true);

&nbsp;       \_removerLinhaAnexo(fileId);

&nbsp;       Logger.log('deletarAnexo: ' + fileId + ' movido para lixeira');

&nbsp;       return { sucesso: true };

&nbsp;   } catch (err) {

&nbsp;       Logger.log('deletarAnexo erro: ' + err.message);

&nbsp;       return { sucesso: false, erro: err.message };

&nbsp;   }

}



function \_removerLinhaAnexo(fileId) {

&nbsp;   try {

&nbsp;       var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;       var sheet = ss.getSheetByName('AnexosOS');

&nbsp;       if (!sheet) return;

&nbsp;       var dados  = sheet.getDataRange().getValues();

&nbsp;       var colFid = \_findColSafe(dados\[0].map(function(h) { return h.toString().trim(); }), 'FileId');

&nbsp;       if (colFid < 0) return;

&nbsp;       for (var i = dados.length - 1; i >= 1; i--) {

&nbsp;           if ((dados\[i]\[colFid] || '').toString().trim() === fileId.trim()) {

&nbsp;               sheet.deleteRow(i + 1);

&nbsp;               break;

&nbsp;           }

&nbsp;       }

&nbsp;   } catch (err) {

&nbsp;       Logger.log('\_removerLinhaAnexo erro: ' + err.message);

&nbsp;   }

}



// === Helpers ===



function \_obterOuCriarAbaGestaoOS(ss) {

&nbsp;   var sheet = ss.getSheetByName('GestaoOS');

&nbsp;   if (!sheet) {

&nbsp;       sheet = ss.insertSheet('GestaoOS');

&nbsp;       sheet.appendRow(\['Número OS', 'Status', 'GE/Via', 'Nota', 'Mediu', 'Anexos', 'Atualizado Em']);

&nbsp;       var hr = sheet.getRange(1, 1, 1, 7);

&nbsp;       hr.setFontWeight('bold').setBackground('#f3f3f3');

&nbsp;       sheet.setColumnWidth(1, 130); sheet.setColumnWidth(2, 180); sheet.setColumnWidth(3, 120);

&nbsp;       sheet.setColumnWidth(4, 350); sheet.setColumnWidth(5, 100); sheet.setColumnWidth(6, 400);

&nbsp;       sheet.setColumnWidth(7, 160); sheet.setFrozenRows(1);

&nbsp;       Logger.log('\[GestaoOS] Aba criada automaticamente');

&nbsp;   } else {

&nbsp;       // Migrar aba criada por versão antiga sem colunas Mediu e Anexos

&nbsp;       var lastCol = sheet.getLastColumn();

&nbsp;       if (lastCol >= 1) {

&nbsp;           var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()\[0];

&nbsp;           var headerLower = headerRow.map(function(h) { return h.toString().trim().toLowerCase(); });

&nbsp;           var temMediu  = headerLower.indexOf('mediu')  >= 0;

&nbsp;           var temAnexos = headerLower.indexOf('anexos') >= 0;

&nbsp;           if (!temMediu || !temAnexos) {

&nbsp;               // Sobrescrever as 7 primeiras células do cabeçalho com a estrutura correta

&nbsp;               var novoHeader = \[\['Número OS', 'Status', 'GE/Via', 'Nota', 'Mediu', 'Anexos', 'Atualizado Em'\]\];

&nbsp;               sheet.getRange(1, 1, 1, 7).setValues(novoHeader);

&nbsp;               sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#f3f3f3');

&nbsp;               Logger.log('\[GestaoOS] Cabecalho migrado: adicionadas colunas Mediu e/ou Anexos');

&nbsp;           }

&nbsp;       }

&nbsp;   }

&nbsp;   return sheet;

}



/\*\* Retorna índice de coluna (lança erro se não encontrar). \*/

function \_findCol(header, nome) {

&nbsp;   var nomeLower = nome.toLowerCase();

&nbsp;   for (var i = 0; i < header.length; i++) {

&nbsp;       if (header\[i].toLowerCase() === nomeLower) return i;

&nbsp;   }

&nbsp;   throw new Error('Coluna "' + nome + '" nao encontrada. Cabecalho: ' + header.join(', '));

}



/\*\* Retorna índice de coluna ou -1 se não encontrar (não lança erro). \*/

function \_findColSafe(header, nome) {

&nbsp;   var nomeLower = nome.toLowerCase();

&nbsp;   for (var i = 0; i < header.length; i++) {

&nbsp;       if (header\[i].toLowerCase() === nomeLower) return i;

&nbsp;   }

&nbsp;   return -1;

}



function \_resposta(obj) {

&nbsp;   return ContentService

&nbsp;       .createTextOutput(JSON.stringify(obj))

&nbsp;       .setMimeType(ContentService.MimeType.JSON);

}



// === Acao: atualizarOSCascata ===



function atualizarOSCascata(antigaOS, novaOS) {

&nbsp;   if (!antigaOS || !novaOS) return { sucesso: false, erro: 'Parametros obrigatorios: antigaOS e novaOS' };



&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   if (!lock.tryLock(15000)) return { sucesso: false, erro: 'Servidor ocupado. Tente novamente em alguns segundos.' };

&nbsp;   try {

&nbsp;       return \_atualizarOSCascataInterno(antigaOS, novaOS);

&nbsp;   } finally {

&nbsp;       lock.releaseLock();

&nbsp;   }

}



function \_atualizarOSCascataInterno(antigaOS, novaOS) {

&nbsp;   var ss = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;   var abas = \['RDO', 'Servicos', 'HorasImprodutivas', 'Efetivo',

&nbsp;               'Equipamentos', 'Materiais', 'TransporteSucatas', 'Acompanhamento'];

&nbsp;   var resultado = { sucesso: true, abas: {} };



&nbsp;   for (var a = 0; a < abas.length; a++) {

&nbsp;       var nomeAba = abas\[a];

&nbsp;       var sheet = ss.getSheetByName(nomeAba);

&nbsp;       if (!sheet) { resultado.abas\[nomeAba] = 'aba nao existe'; continue; }



&nbsp;       var range = sheet.getDataRange();

&nbsp;       var dados = range.getValues();

&nbsp;       var header = dados\[0].map(function(h) { return h.toString().trim(); });

&nbsp;       var colOS = \_findColSafe(header, 'Número OS');

&nbsp;       if (colOS < 0) { resultado.abas\[nomeAba] = 'sem coluna Numero OS'; continue; }



&nbsp;       var count = 0;

&nbsp;       for (var i = 1; i < dados.length; i++) {

&nbsp;           if ((dados\[i]\[colOS] || '').toString().trim() === antigaOS.trim()) {

&nbsp;               dados\[i]\[colOS] = novaOS;

&nbsp;               count++;

&nbsp;           }

&nbsp;       }

&nbsp;       if (count > 0) { range.setValues(dados); SpreadsheetApp.flush(); }

&nbsp;       resultado.abas\[nomeAba] = count;

&nbsp;   }



&nbsp;   Logger.log('\[atualizarOSCascata] ' + antigaOS + ' -> ' + novaOS + ' | ' + JSON.stringify(resultado.abas));

&nbsp;   return resultado;

}



// === Acao: renomearRDO ===



function renomearRDO(dados) {

&nbsp;   var oldNumeroRDO = dados.oldNumeroRDO;

&nbsp;   var newNumeroRDO = dados.newNumeroRDO;

&nbsp;   var novaOS       = dados.novaOS;



&nbsp;   if (!oldNumeroRDO || !newNumeroRDO || !novaOS) {

&nbsp;       return { sucesso: false, erro: 'Parâmetros insuficientes para renomear RDO' };

&nbsp;   }



&nbsp;   // ← ADICIONADO: LockService para evitar gravações concorrentes

&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   if (!lock.tryLock(15000)) return { sucesso: false, erro: 'Servidor ocupado. Tente novamente.' };



&nbsp;   try {

&nbsp;       var ss = SpreadsheetApp.getActiveSpreadsheet(); // ← CORRIGIDO: era openById(SPREADSHEET\_ID)

&nbsp;       var abas = \['RDO', 'Servicos', 'Materiais', 'HorasImprodutivas', 'TransporteSucatas', 'Efetivo', 'Equipamentos'];

&nbsp;       var totalAlteracoes = 0;



&nbsp;       for (var a = 0; a < abas.length; a++) {

&nbsp;           var sheet = ss.getSheetByName(abas\[a]);

&nbsp;           if (!sheet) continue;



&nbsp;           var dataValues = sheet.getDataRange().getValues();

&nbsp;           if (dataValues.length < 2) continue;



&nbsp;           var header = dataValues\[0].map(function(h) { return h.toString().trim(); });

&nbsp;           var rdoCol = \_findColSafe(header, 'Número RDO');

&nbsp;           if (rdoCol < 0) continue;

&nbsp;           var osCol = \_findColSafe(header, 'Número OS');



&nbsp;           for (var r = 1; r < dataValues.length; r++) {

&nbsp;               if ((dataValues\[r]\[rdoCol] || '').toString().trim() === oldNumeroRDO.trim()) {

&nbsp;                   sheet.getRange(r + 1, rdoCol + 1).setValue(newNumeroRDO);

&nbsp;                   if (osCol >= 0) sheet.getRange(r + 1, osCol + 1).setValue(novaOS);

&nbsp;                   totalAlteracoes++;

&nbsp;               }

&nbsp;           }

&nbsp;       }



&nbsp;       SpreadsheetApp.flush();

&nbsp;       Logger.log('\[renomearRDO] ' + oldNumeroRDO + ' → ' + newNumeroRDO + ' | ' + totalAlteracoes + ' linha(s)');

&nbsp;       return { sucesso: true, alteracoes: totalAlteracoes };



&nbsp;   } finally {

&nbsp;       lock.releaseLock();

&nbsp;   }

}



// === Acao: dividirOS ===



function dividirOS(dados) {                              // ← CORRIGIDO: recebe objeto, não argumentos separados

&nbsp;   var numeroRDO   = dados.numeroRDO;

&nbsp;   var os1         = dados.os1;

&nbsp;   var os2         = dados.os2;

&nbsp;   var servicosOS2 = dados.servicosOS2 || \[];

&nbsp;   var hiOS2       = dados.hiOS2       || \[];



&nbsp;   if (!numeroRDO || !os1 || !os2) {

&nbsp;       return { sucesso: false, erro: 'Parâmetros insuficientes para dividir O.S' };

&nbsp;   }



&nbsp;   var partes        = numeroRDO.split('-');

&nbsp;   var sufixo        = partes.slice(1).join('-');

&nbsp;   var novoNumeroRDO = os2 + '-' + sufixo;



&nbsp;   var ss   = SpreadsheetApp.getActiveSpreadsheet();  // ← CORRIGIDO: era openById(SPREADSHEET\_ID)

&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   lock.waitLock(20000);



&nbsp;   try {

&nbsp;       // ── 1. Aba RDO ────────────────────────────────────────────────────────

&nbsp;       var rdoSheet  = ss.getSheetByName('RDO');

&nbsp;       var rdoValues = rdoSheet.getDataRange().getValues();

&nbsp;       var rdoHdr    = rdoValues\[0].map(function(h) { return h.toString().trim(); });

&nbsp;       var rdoNumCol = \_findColSafe(rdoHdr, 'Número RDO');

&nbsp;       var rdoOsCol  = \_findColSafe(rdoHdr, 'Número OS');

&nbsp;       if (rdoNumCol < 0) return { sucesso: false, erro: 'Coluna "Número RDO" não encontrada na aba RDO' };



&nbsp;       var rdoOrigRow = -1, rdoOrigLinha = null;

&nbsp;       for (var r = 1; r < rdoValues.length; r++) {

&nbsp;           if ((rdoValues\[r]\[rdoNumCol] || '').toString().trim() === numeroRDO.trim()) {

&nbsp;               rdoOrigRow   = r + 1;

&nbsp;               rdoOrigLinha = rdoValues\[r].slice();

&nbsp;               break;

&nbsp;           }

&nbsp;       }

&nbsp;       if (rdoOrigRow < 0) return { sucesso: false, erro: 'RDO não encontrado: ' + numeroRDO };



&nbsp;       if (rdoOsCol >= 0) rdoSheet.getRange(rdoOrigRow, rdoOsCol + 1).setValue(os1);



&nbsp;       var novaLinhaRDO = rdoOrigLinha.slice();

&nbsp;       novaLinhaRDO\[rdoNumCol] = novoNumeroRDO;

&nbsp;       if (rdoOsCol >= 0) novaLinhaRDO\[rdoOsCol] = os2;

&nbsp;       rdoSheet.appendRow(novaLinhaRDO);



&nbsp;       // ── 2. Aba Servicos ───────────────────────────────────────────────────

&nbsp;       var svcSheet  = ss.getSheetByName('Servicos');

&nbsp;       var svcValues = svcSheet.getDataRange().getValues();

&nbsp;       var svcHdr    = svcValues\[0].map(function(h) { return h.toString().trim(); });

&nbsp;       var svcRdoCol = \_findColSafe(svcHdr, 'Número RDO');

&nbsp;       var svcOsCol  = \_findColSafe(svcHdr, 'Número OS');

&nbsp;       var svcDescCol = \_findColSafe(svcHdr, 'Descrição');

&nbsp;       var svcQtyCol  = \_findColSafe(svcHdr, 'Quantidade');



&nbsp;       var svcOS2Set = {};

&nbsp;       for (var i = 0; i < servicosOS2.length; i++) {

&nbsp;           var pts = servicosOS2\[i].split('|');

&nbsp;           svcOS2Set\[pts\[0] + '|' + pts\[1]] = true;

&nbsp;       }

&nbsp;       for (var r = 1; r < svcValues.length; r++) {

&nbsp;           if ((svcValues\[r]\[svcRdoCol] || '').toString().trim() !== numeroRDO.trim()) continue;

&nbsp;           var desc = svcDescCol >= 0 ? String(svcValues\[r]\[svcDescCol] || '').trim() : '';

&nbsp;           var qty  = svcQtyCol  >= 0 ? String(svcValues\[r]\[svcQtyCol]  || '').trim() : '';

&nbsp;           if (svcOS2Set\[desc + '|' + qty]) {

&nbsp;               svcSheet.getRange(r + 1, svcRdoCol + 1).setValue(novoNumeroRDO);

&nbsp;               if (svcOsCol >= 0) svcSheet.getRange(r + 1, svcOsCol + 1).setValue(os2);

&nbsp;           }

&nbsp;       }



&nbsp;       // ── 3. Aba HorasImprodutivas ──────────────────────────────────────────

&nbsp;       var hiSheet  = ss.getSheetByName('HorasImprodutivas');

&nbsp;       var hiValues = hiSheet.getDataRange().getValues();

&nbsp;       var hiHdr    = hiValues\[0].map(function(h) { return h.toString().trim(); });

&nbsp;       var hiRdoCol  = \_findColSafe(hiHdr, 'Número RDO');

&nbsp;       var hiOsCol   = \_findColSafe(hiHdr, 'Número OS');

&nbsp;       var hiTipoCol = \_findColSafe(hiHdr, 'Tipo');

&nbsp;       var hiIniCol  = \_findColSafe(hiHdr, 'Hora Início');

&nbsp;       var hiFimCol  = \_findColSafe(hiHdr, 'Hora Fim');



&nbsp;       var hiOS2Set = {};

&nbsp;       for (var i = 0; i < hiOS2.length; i++) {

&nbsp;           var pts = hiOS2\[i].split('|');

&nbsp;           hiOS2Set\[pts\[1] + '|' + pts\[2] + '|' + pts\[3]] = true;

&nbsp;       }

&nbsp;       for (var r = 1; r < hiValues.length; r++) {

&nbsp;           if ((hiValues\[r]\[hiRdoCol] || '').toString().trim() !== numeroRDO.trim()) continue;

&nbsp;           var tipo = hiTipoCol >= 0 ? String(hiValues\[r]\[hiTipoCol] || '').trim() : '';

&nbsp;           var ini  = hiIniCol  >= 0 ? String(hiValues\[r]\[hiIniCol]  || '').trim() : '';

&nbsp;           var fim  = hiFimCol  >= 0 ? String(hiValues\[r]\[hiFimCol]  || '').trim() : '';

&nbsp;           if (hiOS2Set\[tipo + '|' + ini + '|' + fim]) {

&nbsp;               hiSheet.getRange(r + 1, hiRdoCol + 1).setValue(novoNumeroRDO);

&nbsp;               if (hiOsCol >= 0) hiSheet.getRange(r + 1, hiOsCol + 1).setValue(os2);

&nbsp;           }

&nbsp;       }



&nbsp;       // ── 4. Aba Efetivo — duplicar para o novo RDO ─────────────────────────

&nbsp;       var efSheet = ss.getSheetByName('Efetivo');

&nbsp;       if (efSheet) {

&nbsp;           var efValues = efSheet.getDataRange().getValues();

&nbsp;           var efHdr    = efValues\[0].map(function(h) { return h.toString().trim(); });

&nbsp;           var efRdoCol = \_findColSafe(efHdr, 'Número RDO');

&nbsp;           var efOsCol  = \_findColSafe(efHdr, 'Número OS');

&nbsp;           for (var r = 1; r < efValues.length; r++) {

&nbsp;               if ((efValues\[r]\[efRdoCol] || '').toString().trim() === numeroRDO.trim()) {

&nbsp;                   var novaEf = efValues\[r].slice();

&nbsp;                   novaEf\[efRdoCol] = novoNumeroRDO;

&nbsp;                   if (efOsCol >= 0) novaEf\[efOsCol] = os2;

&nbsp;                   efSheet.appendRow(novaEf);

&nbsp;                   break;

&nbsp;               }

&nbsp;           }

&nbsp;       }



&nbsp;       SpreadsheetApp.flush();

&nbsp;       Logger.log('\[dividirOS] ' + numeroRDO + ' → OS1=' + os1 + ' OS2=' + os2 + ' novoRDO=' + novoNumeroRDO);

&nbsp;       return { sucesso: true, novoNumeroRDO: novoNumeroRDO };



&nbsp;   } catch (err) {

&nbsp;       return { sucesso: false, erro: err.message };

&nbsp;   } finally {

&nbsp;       lock.releaseLock();

&nbsp;   }

}



// ════════════════════════════════════════════════════════════════════

// EDIÇÃO VIA DASHBOARD

// ════════════════════════════════════════════════════════════════════



function \_linhasDaAba(sheet, numeroRDO) {

&nbsp;   var dados = sheet.getDataRange().getValues();

&nbsp;   var linhas = \[];

&nbsp;   for (var i = 1; i < dados.length; i++) {

&nbsp;       if ((dados\[i]\[0] || '').toString().trim() === (numeroRDO || '').toString().trim()) {

&nbsp;           linhas.push(i + 1);

&nbsp;       }

&nbsp;   }

&nbsp;   return linhas;

}



function atualizarCampoRDO(body) {

&nbsp;   var numeroRDO = (body.numeroRDO || '').toString().trim();

&nbsp;   var campos    = body.campos;

&nbsp;   if (!numeroRDO || !campos || typeof campos !== 'object') {

&nbsp;       return { sucesso: false, erro: 'numeroRDO e campos são obrigatórios' };

&nbsp;   }



&nbsp;   var MAPA\_CAMPOS = {

&nbsp;       local: 'Local', numeroOS: 'Número OS', statusOS: 'Status OS',

&nbsp;       kmInicio: 'KM Início', kmFim: 'KM Fim',

&nbsp;       horarioInicio: 'Horário Início', horarioFim: 'Horário Fim',

&nbsp;       temaDDS: 'Tema DDS', observacoes: 'Observações'

&nbsp;   };



&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   lock.waitLock(15000);

&nbsp;   try {

&nbsp;       var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;       var sheet = ss.getSheetByName('RDO');

&nbsp;       if (!sheet) return { sucesso: false, erro: 'Aba "RDO" não encontrada' };



&nbsp;       var dados  = sheet.getDataRange().getValues();

&nbsp;       var header = dados\[0].map(function(h) { return h.toString().trim(); });

&nbsp;       var colRDO = \_findColSafe(header, 'Número RDO');

&nbsp;       if (colRDO < 0) return { sucesso: false, erro: 'Coluna "Número RDO" não encontrada' };



&nbsp;       var linhaAtualizar = -1;

&nbsp;       for (var i = 1; i < dados.length; i++) {

&nbsp;           if ((dados\[i]\[colRDO] || '').toString().trim() === numeroRDO) {

&nbsp;               linhaAtualizar = i + 1;

&nbsp;               break;

&nbsp;           }

&nbsp;       }

&nbsp;       if (linhaAtualizar === -1) return { sucesso: false, erro: 'Número RDO "' + numeroRDO + '" não encontrado' };



&nbsp;       var atualizados = \[];

&nbsp;       for (var chave in campos) {

&nbsp;           if (!campos.hasOwnProperty(chave)) continue;

&nbsp;           var nomeColuna = MAPA\_CAMPOS\[chave];

&nbsp;           if (!nomeColuna) continue;

&nbsp;           var colIdx = \_findColSafe(header, nomeColuna);

&nbsp;           if (colIdx < 0) { Logger.log('\[atualizarCampoRDO] Coluna não encontrada: ' + nomeColuna); continue; }

&nbsp;           sheet.getRange(linhaAtualizar, colIdx + 1).setValue(campos\[chave]);

&nbsp;           atualizados.push(nomeColuna);

&nbsp;       }



&nbsp;       if (atualizados.length === 0) return { sucesso: false, erro: 'Nenhum campo válido informado' };

&nbsp;       SpreadsheetApp.flush();

&nbsp;       Logger.log('\[atualizarCampoRDO] RDO ' + numeroRDO + ' | ' + atualizados.join(', '));

&nbsp;       return { sucesso: true, linha: linhaAtualizar, camposAtualizados: atualizados };



&nbsp;   } finally { lock.releaseLock(); }

}



function atualizarServico(body) {

&nbsp;   if (!body.numeroRDO || body.indice === undefined || body.indice === null) {

&nbsp;       return { sucesso: false, erro: 'numeroRDO e indice são obrigatórios' };

&nbsp;   }

&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   lock.waitLock(15000);

&nbsp;   try {

&nbsp;       var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;       var sheet = ss.getSheetByName('Servicos');

&nbsp;       if (!sheet) return { sucesso: false, erro: 'Aba "Servicos" não encontrada' };



&nbsp;       var linhas = \_linhasDaAba(sheet, body.numeroRDO);

&nbsp;       if (body.indice < 0 || body.indice >= linhas.length) {

&nbsp;           return { sucesso: false, erro: 'indice ' + body.indice + ' inválido. RDO tem ' + linhas.length + ' serviço(s)' };

&nbsp;       }



&nbsp;       var linha  = linhas\[body.indice];

&nbsp;       var header = sheet.getDataRange().getValues()\[0].map(function(h) { return h.toString().trim(); });



&nbsp;       // ← CORRIGIDO: verifica colIdx >= 0 antes de escrever

&nbsp;       var colDesc = \_findColSafe(header, 'Descrição');

&nbsp;       var colQty  = \_findColSafe(header, 'Quantidade');

&nbsp;       var colUn   = \_findColSafe(header, 'Unidade');

&nbsp;       var colObs  = \_findColSafe(header, 'Observações');



&nbsp;       if (body.descricao   !== undefined \&\& colDesc >= 0) sheet.getRange(linha, colDesc + 1).setValue(body.descricao);

&nbsp;       if (body.quantidade  !== undefined \&\& colQty  >= 0) sheet.getRange(linha, colQty  + 1).setValue(body.quantidade);

&nbsp;       if (body.unidade     !== undefined \&\& colUn   >= 0) sheet.getRange(linha, colUn   + 1).setValue(body.unidade);

&nbsp;       if (body.observacoes !== undefined \&\& colObs  >= 0) sheet.getRange(linha, colObs  + 1).setValue(body.observacoes);



&nbsp;       SpreadsheetApp.flush();

&nbsp;       Logger.log('\[atualizarServico] RDO ' + body.numeroRDO + ' indice ' + body.indice + ' (linha ' + linha + ')');

&nbsp;       return { sucesso: true, linha: linha };

&nbsp;   } finally { lock.releaseLock(); }

}



function adicionarServico(body) {

&nbsp;   if (!body.numeroRDO || !body.descricao || body.quantidade === undefined) {

&nbsp;       return { sucesso: false, erro: 'numeroRDO, descricao e quantidade são obrigatórios' };

&nbsp;   }

&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   lock.waitLock(15000);

&nbsp;   try {

&nbsp;       var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;       var sheet = ss.getSheetByName('Servicos');

&nbsp;       if (!sheet) return { sucesso: false, erro: 'Aba "Servicos" não encontrada' };



&nbsp;       sheet.appendRow(\[

&nbsp;           body.numeroRDO, body.numeroOS || '', body.data || '',

&nbsp;           body.codigoTurma || '', body.encarregado || '',

&nbsp;           body.descricao, body.quantidade, body.unidade || 'UN',

&nbsp;           body.observacoes || '', 'NÃO', ''

&nbsp;       ]);

&nbsp;       SpreadsheetApp.flush();

&nbsp;       Logger.log('\[adicionarServico] RDO ' + body.numeroRDO + ' | ' + body.descricao);

&nbsp;       return { sucesso: true, ultimaLinha: sheet.getLastRow() };

&nbsp;   } finally { lock.releaseLock(); }

}



function excluirServico(body) {

&nbsp;   if (!body.numeroRDO || body.indice === undefined) {

&nbsp;       return { sucesso: false, erro: 'numeroRDO e indice são obrigatórios' };

&nbsp;   }

&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   lock.waitLock(15000);

&nbsp;   try {

&nbsp;       var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;       var sheet = ss.getSheetByName('Servicos');

&nbsp;       if (!sheet) return { sucesso: false, erro: 'Aba "Servicos" não encontrada' };



&nbsp;       var linhas = \_linhasDaAba(sheet, body.numeroRDO);

&nbsp;       if (body.indice < 0 || body.indice >= linhas.length) {

&nbsp;           return { sucesso: false, erro: 'indice ' + body.indice + ' inválido. RDO tem ' + linhas.length + ' serviço(s)' };

&nbsp;       }

&nbsp;       sheet.deleteRow(linhas\[body.indice]);

&nbsp;       SpreadsheetApp.flush();

&nbsp;       Logger.log('\[excluirServico] RDO ' + body.numeroRDO + ' indice ' + body.indice + ' excluído');

&nbsp;       return { sucesso: true };

&nbsp;   } finally { lock.releaseLock(); }

}



function atualizarHI(body) {

&nbsp;   if (!body.numeroRDO || body.indice === undefined || body.indice === null) {

&nbsp;       return { sucesso: false, erro: 'numeroRDO e indice são obrigatórios' };

&nbsp;   }

&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   lock.waitLock(15000);

&nbsp;   try {

&nbsp;       var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;       var sheet = ss.getSheetByName('HorasImprodutivas');

&nbsp;       if (!sheet) return { sucesso: false, erro: 'Aba "HorasImprodutivas" não encontrada' };



&nbsp;       var linhas = \_linhasDaAba(sheet, body.numeroRDO);

&nbsp;       if (body.indice < 0 || body.indice >= linhas.length) {

&nbsp;           return { sucesso: false, erro: 'indice ' + body.indice + ' inválido. RDO tem ' + linhas.length + ' HI(s)' };

&nbsp;       }



&nbsp;       var linha  = linhas\[body.indice];

&nbsp;       var header = sheet.getDataRange().getValues()\[0].map(function(h) { return h.toString().trim(); });



&nbsp;       // ← CORRIGIDO: verifica colIdx >= 0 antes de escrever

&nbsp;       var colTipo = \_findColSafe(header, 'Tipo');

&nbsp;       var colDesc = \_findColSafe(header, 'Descrição');

&nbsp;       var colIni  = \_findColSafe(header, 'Hora Início');

&nbsp;       var colFim  = \_findColSafe(header, 'Hora Fim');

&nbsp;       var colOps  = \_findColSafe(header, 'Operadores');



&nbsp;       if (body.tipo       !== undefined \&\& colTipo >= 0) sheet.getRange(linha, colTipo + 1).setValue(body.tipo);

&nbsp;       if (body.descricao  !== undefined \&\& colDesc >= 0) sheet.getRange(linha, colDesc + 1).setValue(body.descricao);

&nbsp;       if (body.horaInicio !== undefined \&\& colIni  >= 0) sheet.getRange(linha, colIni  + 1).setValue(body.horaInicio);

&nbsp;       if (body.horaFim    !== undefined \&\& colFim  >= 0) sheet.getRange(linha, colFim  + 1).setValue(body.horaFim);

&nbsp;       if (body.operadores !== undefined \&\& colOps  >= 0) sheet.getRange(linha, colOps  + 1).setValue(body.operadores);



&nbsp;       SpreadsheetApp.flush();

&nbsp;       Logger.log('\[atualizarHI] RDO ' + body.numeroRDO + ' indice ' + body.indice + ' (linha ' + linha + ')');

&nbsp;       return { sucesso: true, linha: linha };

&nbsp;   } finally { lock.releaseLock(); }

}



function adicionarHI(body) {

&nbsp;   if (!body.numeroRDO || !body.tipo || !body.horaInicio || !body.horaFim) {

&nbsp;       return { sucesso: false, erro: 'numeroRDO, tipo, horaInicio e horaFim são obrigatórios' };

&nbsp;   }

&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   lock.waitLock(15000);

&nbsp;   try {

&nbsp;       var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;       var sheet = ss.getSheetByName('HorasImprodutivas');

&nbsp;       if (!sheet) return { sucesso: false, erro: 'Aba "HorasImprodutivas" não encontrada' };



&nbsp;       sheet.appendRow(\[

&nbsp;           body.numeroRDO, body.numeroOS || '', body.data || '',

&nbsp;           body.codigoTurma || '', body.encarregado || '',

&nbsp;           body.tipo, body.descricao || '', body.horaInicio, body.horaFim,

&nbsp;           body.operadores !== undefined ? body.operadores : 12

&nbsp;       ]);

&nbsp;       SpreadsheetApp.flush();

&nbsp;       Logger.log('\[adicionarHI] RDO ' + body.numeroRDO + ' | ' + body.tipo + ' ' + body.horaInicio + '-' + body.horaFim);

&nbsp;       return { sucesso: true, ultimaLinha: sheet.getLastRow() };

&nbsp;   } finally { lock.releaseLock(); }

}



function excluirHI(body) {

&nbsp;   if (!body.numeroRDO || body.indice === undefined) {

&nbsp;       return { sucesso: false, erro: 'numeroRDO e indice são obrigatórios' };

&nbsp;   }

&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   lock.waitLock(15000);

&nbsp;   try {

&nbsp;       var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;       var sheet = ss.getSheetByName('HorasImprodutivas');

&nbsp;       if (!sheet) return { sucesso: false, erro: 'Aba "HorasImprodutivas" não encontrada' };



&nbsp;       var linhas = \_linhasDaAba(sheet, body.numeroRDO);

&nbsp;       if (body.indice < 0 || body.indice >= linhas.length) {

&nbsp;           return { sucesso: false, erro: 'indice ' + body.indice + ' inválido. RDO tem ' + linhas.length + ' HI(s)' };

&nbsp;       }

&nbsp;       sheet.deleteRow(linhas\[body.indice]);

&nbsp;       SpreadsheetApp.flush();

&nbsp;       Logger.log('\[excluirHI] RDO ' + body.numeroRDO + ' indice ' + body.indice + ' excluído');

&nbsp;       return { sucesso: true };

&nbsp;   } finally { lock.releaseLock(); }

}



function deletarRDO(dados) {

&nbsp;   var lock = LockService.getScriptLock();

&nbsp;   lock.waitLock(15000);

&nbsp;   try {

&nbsp;       var ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp;       var sheet = ss.getSheetByName('RDO');

&nbsp;       var ultimaCol = sheet.getLastColumn();

&nbsp;       var headerRow = sheet.getRange(1, 1, 1, ultimaCol).getValues()\[0];



&nbsp;       var colNumeroRDO = -1, colDeletado = -1;

&nbsp;       for (var c = 0; c < headerRow.length; c++) {

&nbsp;           if (headerRow\[c] === 'Número RDO') colNumeroRDO = c + 1;

&nbsp;           if (headerRow\[c] === 'Deletado')   colDeletado  = c + 1;

&nbsp;       }

&nbsp;       if (colNumeroRDO < 0 || colDeletado < 0) {

&nbsp;           return { sucesso: false, erro: 'Colunas "Número RDO" ou "Deletado" não encontradas' };

&nbsp;       }



&nbsp;       var ultimaLinha = sheet.getLastRow();

&nbsp;       var rdoVals = sheet.getRange(2, colNumeroRDO, ultimaLinha - 1, 1).getValues();

&nbsp;       for (var i = 0; i < rdoVals.length; i++) {

&nbsp;           if (String(rdoVals\[i]\[0]).trim() === String(dados.numeroRDO).trim()) {

&nbsp;               sheet.getRange(i + 2, colDeletado).setValue('Sim');

&nbsp;               SpreadsheetApp.flush();

&nbsp;               return { sucesso: true };

&nbsp;           }

&nbsp;       }

&nbsp;       return { sucesso: false, erro: 'RDO não encontrado: ' + dados.numeroRDO };

&nbsp;   } finally { lock.releaseLock(); }

}



function salvarNotaDia(dados) {

&nbsp; const { turma, data, nota } = dados;

&nbsp; const ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp; let notas   = ss.getSheetByName('Notas');

&nbsp; if (!notas) {

&nbsp;   notas = ss.insertSheet('Notas');

&nbsp;   notas.appendRow(\['Turma', 'Data', 'Nota', 'Atualizado Em']);

&nbsp; }

&nbsp; const rows = notas.getDataRange().getValues();

&nbsp; for (let i = 1; i < rows.length; i++) {

&nbsp;   if (rows\[i]\[0] === turma \&\& rows\[i]\[1] === data) {

&nbsp;     if (nota) notas.getRange(i+1, 3, 1, 2).setValues(\[\[nota, new Date().toISOString()]]);

&nbsp;     else notas.deleteRow(i+1);

&nbsp;     return ContentService.createTextOutput(JSON.stringify({ sucesso: true }))

&nbsp;       .setMimeType(ContentService.MimeType.JSON);

&nbsp;   }

&nbsp; }

&nbsp; if (nota) notas.appendRow(\[turma, data, nota, new Date().toISOString()]);

&nbsp; return ContentService.createTextOutput(JSON.stringify({ sucesso: true }))

&nbsp;   .setMimeType(ContentService.MimeType.JSON);

}



function obterNotasDia() {

&nbsp; const ss    = SpreadsheetApp.getActiveSpreadsheet();

&nbsp; const notas = ss.getSheetByName('Notas');

&nbsp; const arr   = notas ? notas.getDataRange().getValues().slice(1)

&nbsp;   .filter(r => r\[0] \&\& r\[1])

&nbsp;   .map(r => ({ turma: String(r\[0]), data: String(r\[1]), nota: String(r\[2] || '') }))

&nbsp;   : \[];

&nbsp; return ContentService.createTextOutput(JSON.stringify({ sucesso: true, notas: arr }))

&nbsp;   .setMimeType(ContentService.MimeType.JSON);

}

