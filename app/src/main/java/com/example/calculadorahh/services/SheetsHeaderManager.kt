package com.example.calculadorahh.services

import android.util.Log
import com.google.api.services.sheets.v4.Sheets
import com.google.api.services.sheets.v4.model.*

/**
 * Gerencia criação, detecção de versão e atualização de headers nas abas do Google Sheets.
 */
class SheetsHeaderManager(
    private val sheetsService: Sheets,
    private val spreadsheetId: String
) {
    private val tag = "SheetsHeaderManager"

    /**
     * Garante que todas as abas necessárias existam na planilha.
     */
    fun ensureSheetsExist() {
        try {
            val spreadsheet = sheetsService.spreadsheets().get(spreadsheetId).execute()
            val existingSheets = spreadsheet.sheets.map { it.properties.title }

            val requests = mutableListOf<Request>()

            SheetsConstants.ALL_SHEETS.forEach { sheetName ->
                if (sheetName !in existingSheets) {
                    requests.add(
                        Request().setAddSheet(
                            AddSheetRequest().setProperties(
                                SheetProperties().setTitle(sheetName)
                            )
                        )
                    )
                }
            }

            if (requests.isNotEmpty()) {
                val batchUpdateRequest = BatchUpdateSpreadsheetRequest().setRequests(requests)
                sheetsService.spreadsheets().batchUpdate(spreadsheetId, batchUpdateRequest).execute()
            }

            // Create headers for each sheet
            createHeaders()

            // Validar headers para garantir que ordem está correta
            validateHeaders()

        } catch (e: Exception) {
            Log.e(tag, "Erro ao garantir sheets: ${e.message}", e)
        }
    }

    /**
     * Detecta a versão dos headers na planilha.
     * @return 0 se não existe, HEADERS_VERSION se correto, ou 1 se desatualizado
     */
    fun detectarVersaoHeaders(sheetName: String, headersEsperados: List<String>): Int {
        try {
            val lastColumn = ('A'.code + headersEsperados.size - 1).toChar()
            val response = sheetsService.spreadsheets().values()
                .get(spreadsheetId, "${sheetName}!A1:${lastColumn}1")
                .execute()

            val headersAtuais = response.getValues()?.firstOrNull() ?: return 0

            if (headersAtuais.size == headersEsperados.size) {
                val todosCorretos = headersAtuais.indices.all { i ->
                    headersAtuais[i].toString() == headersEsperados[i]
                }
                if (todosCorretos) {
                    return SheetsConstants.HEADERS_VERSION
                }
            }

            Log.w(tag, "⚠️ Headers desatualizados em $sheetName: esperado ${headersEsperados.size} colunas, encontrado ${headersAtuais.size}")
            return 1

        } catch (e: Exception) {
            return 0
        }
    }

    /**
     * Força atualização de headers (sobrescreve).
     */
    fun atualizarHeaders(sheetName: String, headers: List<String>) {
        try {
            val lastColumn = ('A'.code + headers.size - 1).toChar()
            val valueRange = ValueRange().setValues(listOf(headers))

            sheetsService.spreadsheets().values()
                .update(spreadsheetId, "${sheetName}!A1:${lastColumn}1", valueRange)
                .setValueInputOption("RAW")
                .execute()

            Log.d(tag, "✅ Headers atualizados em $sheetName (${headers.size} colunas)")

        } catch (e: Exception) {
            Log.e(tag, "❌ Erro ao atualizar headers em $sheetName: ${e.message}", e)
        }
    }

    /**
     * Cria/atualiza headers para todas as abas com versionamento.
     */
    fun createHeaders() {
        try {
            val updates = mutableListOf<ValueRange>()

            // Iterar sobre todas as abas que têm headers (exceto Config e Audit que são especiais)
            val sheetsToCheck = listOf(
                SheetsConstants.SHEET_RDO to SheetsConstants.HEADERS_RDO,
                SheetsConstants.SHEET_SERVICOS to SheetsConstants.HEADERS_SERVICOS,
                SheetsConstants.SHEET_MATERIAIS to SheetsConstants.HEADERS_MATERIAIS,
                SheetsConstants.SHEET_HI to SheetsConstants.HEADERS_HI,
                SheetsConstants.SHEET_TRANSPORTES to SheetsConstants.HEADERS_TRANSPORTES,
                SheetsConstants.SHEET_EFETIVO to SheetsConstants.HEADERS_EFETIVO,
                SheetsConstants.SHEET_EQUIPAMENTOS to SheetsConstants.HEADERS_EQUIPAMENTOS
            )

            sheetsToCheck.forEach { (sheetName, headers) ->
                val versao = detectarVersaoHeaders(sheetName, headers)
                when {
                    versao == 0 -> {
                        Log.d(tag, "Criando headers para aba $sheetName")
                        val lastColumn = ('A'.code + headers.size - 1).toChar()
                        updates.add(
                            ValueRange()
                                .setRange("${sheetName}!A1:${lastColumn}1")
                                .setValues(listOf(headers))
                        )
                    }
                    versao < SheetsConstants.HEADERS_VERSION -> {
                        Log.w(tag, "⚠️ Atualizando headers desatualizados em $sheetName")
                        atualizarHeaders(sheetName, headers)
                    }
                    else -> {
                        Log.d(tag, "Headers já atualizados na aba $sheetName")
                    }
                }
            }

            if (updates.isNotEmpty()) {
                val batchUpdateRequest = BatchUpdateValuesRequest()
                    .setValueInputOption("RAW")
                    .setData(updates)

                sheetsService.spreadsheets().values()
                    .batchUpdate(spreadsheetId, batchUpdateRequest)
                    .execute()

                Log.d(tag, "Headers criados com sucesso (${updates.size} abas)")
            } else {
                Log.d(tag, "Todos os headers já existem - nenhuma aba foi modificada")
            }

        } catch (e: Exception) {
            Log.e(tag, "Erro ao criar headers: ${e.message}", e)
        }
    }

    /**
     * Valida se os headers da aba RDO estão na ordem esperada.
     */
    fun validateHeaders() {
        try {
            val headers = SheetsConstants.HEADERS_RDO
            val lastColumn = ('A'.code + headers.size - 1).toChar()
            val response = sheetsService.spreadsheets().values()
                .get(spreadsheetId, "${SheetsConstants.SHEET_RDO}!A1:${lastColumn}1")
                .execute()

            val currentHeaders = response.getValues()?.firstOrNull() ?: return

            currentHeaders.forEachIndexed { index, header ->
                if (index < headers.size && header.toString() != headers[index]) {
                    Log.e(
                        tag,
                        "⚠️ AVISO: Header na coluna ${index + 1} não está correto! " +
                        "Esperado: '${headers[index]}', Encontrado: '$header'. " +
                        "Não reorganize colunas manualmente na planilha!"
                    )
                }
            }

            Log.d(tag, "✓ Validação de headers concluída")

        } catch (e: Exception) {
            Log.w(tag, "Não foi possível validar headers: ${e.message}")
        }
    }
}
