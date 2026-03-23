package com.example.calculadorahh.services

import android.content.Context
import android.provider.Settings
import android.util.Log
import com.example.calculadorahh.BuildConfig
import com.google.api.services.sheets.v4.Sheets
import com.google.api.services.sheets.v4.model.ValueRange
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.*

/**
 * Auditoria de sincronização, verificação de versão do app e limpeza de dados órfãos.
 */
class SheetsAuditService(
    private val context: Context,
    private val sheetsService: Sheets,
    private val spreadsheetId: String,
    private val lookupHelper: SheetsLookupHelper
) {
    private val tag = "SheetsAuditService"

    /**
     * Registra ação de sincronização na aba de auditoria.
     * Não-bloqueante: falhas na auditoria não afetam o sync principal.
     */
    suspend fun logSyncAction(
        numeroRDO: String,
        acao: String,
        detalhes: String,
        status: String = "SUCCESS"
    ) = withContext(Dispatchers.IO) {
        try {
            val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())
            val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
                .takeLast(8)

            val auditRow = listOf(
                timestamp,
                numeroRDO,
                acao,
                BuildConfig.VERSION_CODE.toString(),
                deviceId,
                detalhes,
                status
            )

            val valueRange = ValueRange().setValues(listOf(auditRow))
            sheetsService.spreadsheets().values()
                .append(spreadsheetId, "${SheetsConstants.SHEET_AUDIT}!A:G", valueRange)
                .setValueInputOption("RAW")
                .setInsertDataOption("INSERT_ROWS")
                .execute()

            Log.d(tag, "✅ Auditoria registrada: $acao em $numeroRDO")
        } catch (e: Exception) {
            Log.e(tag, "❌ Erro ao registrar auditoria: ${e.message}", e)
            // Não propagar erro - auditoria é não-crítica
        }
    }

    /**
     * Obtém a versão do app que criou/atualizou um RDO.
     * Usado para proteger dados de versões mais novas.
     * @return versionCode do app ou null se não encontrado
     */
    fun getRDOAppVersion(numeroRDO: String): Int? {
        try {
            val rowNumber = lookupHelper.findRowNumberByNumeroRDO(numeroRDO) ?: return null

            // Coluna V: Versão App
            val response = sheetsService.spreadsheets().values()
                .get(spreadsheetId, "${SheetsConstants.SHEET_RDO}!V$rowNumber")
                .execute()

            val values = response.getValues() ?: return null
            if (values.isNotEmpty() && values[0].isNotEmpty()) {
                return values[0][0].toString().toIntOrNull()
            }
        } catch (e: Exception) {
            Log.e(tag, "Erro ao obter versão do app: ${e.message}", e)
        }

        return null
    }

    /**
     * Obtém lista de Números RDO válidos (não deletados).
     * Usado pelo DataCleanupWorker para identificar órfãos.
     */
    suspend fun getValidRDONumbers(): Set<String> = withContext(Dispatchers.IO) {
        try {
            val response = sheetsService.spreadsheets().values()
                .get(spreadsheetId, "${SheetsConstants.SHEET_RDO}!B2:S")
                .execute()

            val values = response.getValues() ?: return@withContext emptySet()

            val validRDOs = mutableSetOf<String>()

            values.forEach { row ->
                if (row.isNotEmpty()) {
                    val numeroRDO = row.getOrNull(0)?.toString() ?: ""
                    val deletado = row.getOrNull(17)?.toString() ?: ""

                    if (numeroRDO.isNotBlank() && deletado != "Sim") {
                        validRDOs.add(numeroRDO)
                    }
                }
            }

            Log.d(tag, "✅ ${validRDOs.size} RDOs válidos encontrados")
            return@withContext validRDOs

        } catch (e: Exception) {
            Log.e(tag, "❌ Erro ao obter RDOs válidos: ${e.message}", e)
            return@withContext emptySet()
        }
    }

    /**
     * Limpa dados órfãos de uma aba.
     * Remove linhas cujo Número RDO não existe mais na aba principal.
     * @return Quantidade de linhas órfãs removidas
     */
    suspend fun cleanOrphanedData(sheetName: String, validRDOs: Set<String>): Int = withContext(Dispatchers.IO) {
        // Guard: se validRDOs estiver vazio, abortar para prevenir deleção em massa acidental
        if (validRDOs.isEmpty()) {
            Log.w(tag, "⚠ validRDOs está vazio — abortando limpeza de '$sheetName' para prevenir deleção em massa")
            return@withContext 0
        }

        try {
            val response = sheetsService.spreadsheets().values()
                .get(spreadsheetId, "${sheetName}!A2:A")
                .execute()

            val values = response.getValues() ?: return@withContext 0

            val orphanRows = mutableListOf<Int>()

            for (i in values.indices.reversed()) {
                val numeroRDO = values[i].getOrNull(0)?.toString() ?: ""

                if (numeroRDO.isNotBlank() && numeroRDO !in validRDOs) {
                    orphanRows.add(i + 2)  // +2: 1-indexed + skip header
                }
            }

            if (orphanRows.isEmpty()) {
                Log.d(tag, "✓ $sheetName: Nenhum órfão encontrado")
                return@withContext 0
            }

            // Buscar sheetId uma única vez (evita N GETs — causa do 429)
            val spreadsheet = sheetsService.spreadsheets().get(spreadsheetId).execute()
            val sheetId = spreadsheet.sheets.find { it.properties.title == sheetName }
                ?.properties?.sheetId
                ?: run {
                    Log.w(tag, "Aba '$sheetName' não encontrada ao tentar deletar órfãos")
                    return@withContext 0
                }

            // Enviar todas as deleções num único batchUpdate
            // orphanRows já está em ordem decrescente (reversed), garantindo índices corretos
            val requests = orphanRows.map { rowIndex ->
                com.google.api.services.sheets.v4.model.Request().setDeleteDimension(
                    com.google.api.services.sheets.v4.model.DeleteDimensionRequest()
                        .setRange(
                            com.google.api.services.sheets.v4.model.DimensionRange()
                                .setSheetId(sheetId)
                                .setDimension("ROWS")
                                .setStartIndex(rowIndex - 1)  // batchUpdate usa 0-indexed
                                .setEndIndex(rowIndex)
                        )
                )
            }

            sheetsService.spreadsheets()
                .batchUpdate(spreadsheetId,
                    com.google.api.services.sheets.v4.model.BatchUpdateSpreadsheetRequest()
                        .setRequests(requests))
                .execute()

            val deletedCount = orphanRows.size
            Log.i(tag, "✅ $sheetName: $deletedCount linha(s) órfã(s) removida(s) em 1 batchUpdate")

            return@withContext deletedCount

        } catch (e: Exception) {
            Log.e(tag, "❌ Erro ao limpar $sheetName: ${e.message}", e)
            throw e
        }
    }

    /**
     * Deleta múltiplas linhas de uma aba em um único batchUpdate.
     * Os índices devem estar em ordem DECRESCENTE para evitar deslocamento de linhas.
     * @param rowIndices Índices 0-based das linhas a deletar (ordem decrescente)
     * @return true se a operação foi bem-sucedida
     */
    internal fun deleteSheetRows(sheetName: String, rowIndices: List<Int>): Boolean {
        if (rowIndices.isEmpty()) return true
        return try {
            // Um único GET para obter o sheetId
            val spreadsheet = sheetsService.spreadsheets().get(spreadsheetId).execute()
            val sheetId = spreadsheet.sheets.find { it.properties.title == sheetName }
                ?.properties?.sheetId
                ?: run {
                    Log.w(tag, "Aba '$sheetName' não encontrada ao tentar deletar linhas")
                    return false
                }

            // Um único batchUpdate com todas as deleções
            val requests = rowIndices.sortedDescending().map { rowIndex ->
                com.google.api.services.sheets.v4.model.Request().setDeleteDimension(
                    com.google.api.services.sheets.v4.model.DeleteDimensionRequest()
                        .setRange(
                            com.google.api.services.sheets.v4.model.DimensionRange()
                                .setSheetId(sheetId)
                                .setDimension("ROWS")
                                .setStartIndex(rowIndex)
                                .setEndIndex(rowIndex + 1)
                        )
                )
            }

            sheetsService.spreadsheets()
                .batchUpdate(spreadsheetId,
                    com.google.api.services.sheets.v4.model.BatchUpdateSpreadsheetRequest()
                        .setRequests(requests))
                .execute()

            Log.d(tag, "✓ $sheetName: ${rowIndices.size} linha(s) deletada(s) em 1 batchUpdate")
            true

        } catch (e: Exception) {
            Log.e(tag, "Erro ao deletar ${rowIndices.size} linha(s) de '$sheetName': ${e.message}", e)
            false
        }
    }

    /**
     * Deleta uma única linha de uma aba.
     * Prefira deleteSheetRows() quando houver múltiplas linhas.
     */
    internal fun deleteSheetRow(sheetName: String, rowIndex: Int): Boolean =
        deleteSheetRows(sheetName, listOf(rowIndex))
}
