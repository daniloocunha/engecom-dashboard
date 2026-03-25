package com.example.calculadorahh.services

import android.content.Context
import android.util.Log
import com.example.calculadorahh.BuildConfig
import com.example.calculadorahh.data.models.RDODataCompleto
import com.example.calculadorahh.data.models.UpdateConfig
import com.example.calculadorahh.utils.UpdateChecker
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.sheets.v4.Sheets
import com.google.api.services.sheets.v4.SheetsScopes
import com.google.api.services.sheets.v4.model.ValueRange
import com.google.auth.http.HttpCredentialsAdapter
import com.google.auth.oauth2.GoogleCredentials
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.*

/**
 * Facade para o Google Sheets API.
 * Orquestra inicialização, sync de RDOs e delegação para helpers especializados.
 *
 * API pública (usada por SyncHelper e DataCleanupWorker):
 * - initialize()
 * - syncRDO()
 * - verificarSeRDOExiste()
 * - getValidRDONumbers()
 * - cleanOrphanedData()
 * - syncMultipleRDOs()
 */
class GoogleSheetsService(private val context: Context) {

    private val tag = "GoogleSheetsService"

    private var sheetsService: Sheets? = null
    private val spreadsheetId = BuildConfig.GOOGLE_SHEETS_ID

    // Helpers (inicializados em initialize())
    private lateinit var headerManager: SheetsHeaderManager
    private lateinit var lookupHelper: SheetsLookupHelper
    private lateinit var auditService: SheetsAuditService
    private lateinit var dataManager: SheetsRelatedDataManager

    /**
     * Inicializa o serviço Google Sheets com credenciais e instancia todos os helpers.
     */
    suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        try {
            val httpTransport = GoogleNetHttpTransport.newTrustedTransport()
            val jsonFactory = GsonFactory.getDefaultInstance()

            val credentials = context.assets.open("rdo-engecom-0cdcc15ed168.json").use { inputStream ->
                GoogleCredentials.fromStream(inputStream)
                    .createScoped(listOf(SheetsScopes.SPREADSHEETS))
            }

            val service = Sheets.Builder(httpTransport, jsonFactory, HttpCredentialsAdapter(credentials))
                .setApplicationName(SheetsConstants.APPLICATION_NAME)
                .build()

            sheetsService = service

            // Instanciar helpers
            headerManager = SheetsHeaderManager(service, spreadsheetId)
            lookupHelper = SheetsLookupHelper(service, spreadsheetId)
            auditService = SheetsAuditService(context, service, spreadsheetId, lookupHelper)
            dataManager = SheetsRelatedDataManager(service, spreadsheetId, auditService)

            // Garantir que abas e headers existam
            headerManager.ensureSheetsExist()

            true
        } catch (e: Exception) {
            Log.e(tag, "Erro ao inicializar: ${e.message}", e)
            false
        }
    }

    /**
     * Verifica se um RDO existe no Google Sheets pelo Número RDO.
     */
    fun verificarSeRDOExiste(numeroRDO: String): Boolean {
        return lookupHelper.verificarSeRDOExiste(numeroRDO)
    }

    /**
     * Obtém lista de Números RDO válidos (não deletados).
     */
    suspend fun getValidRDONumbers(): Set<String> {
        return auditService.getValidRDONumbers()
    }

    /**
     * Limpa dados órfãos de uma aba.
     */
    suspend fun cleanOrphanedData(sheetName: String, validRDOs: Set<String>): Int {
        return auditService.cleanOrphanedData(sheetName, validRDOs)
    }

    /**
     * Sincroniza um único RDO com o Google Sheets.
     * @param numeroRDOAntigo Se fornecido, deleta a entrada antiga antes de inserir com novo número
     */
    suspend fun syncRDO(
        rdo: RDODataCompleto,
        isDelete: Boolean = false,
        numeroRDOAntigo: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val service = sheetsService
        if (service == null) {
            if (!initialize()) {
                val erro = "Falha ao inicializar Google Sheets Service"
                Log.e(tag, erro)
                throw Exception(erro)
            }
        }

        try {
            // Validar campos obrigatórios
            if (rdo.numeroRDO.isEmpty()) {
                throw Exception("numeroRDO vazio para RDO ID ${rdo.id}")
            }
            if (rdo.data.isEmpty()) {
                throw Exception("data vazia para RDO ID ${rdo.id}")
            }
            if (rdo.numeroOS.isEmpty()) {
                throw Exception("numeroOS vazio para RDO ID ${rdo.id}")
            }

            val currentDateTime = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())

            // Buscar pelo número antigo (se fornecido) para suportar edição de data/OS
            val numeroRDOParaBuscar = numeroRDOAntigo ?: rdo.numeroRDO
            val rowNumber = lookupHelper.findRowNumberByNumeroRDO(numeroRDOParaBuscar)

            if (rowNumber != null) {
                updateRDOInSheet(rdo, isDelete, currentDateTime, numeroRDOAntigo, rowNumber)

                val acao = if (isDelete) "DELETE" else "UPDATE"
                val detalhes = if (isDelete) "RDO marcado como deletado" else "RDO atualizado com sucesso"
                auditService.logSyncAction(rdo.numeroRDO, acao, detalhes)
            } else {
                insertRDOInSheet(rdo, isDelete, currentDateTime)
                auditService.logSyncAction(rdo.numeroRDO, "INSERT", "RDO criado com sucesso")
            }

            true
        } catch (e: Exception) {
            Log.e(tag, "Erro ao sincronizar RDO: ${e.message}", e)
            auditService.logSyncAction(rdo.numeroRDO, "ERROR", "Falha ao sincronizar: ${e.message}", "ERROR")
            throw e
        }
    }

    /**
     * Atualiza um RDO existente na planilha.
     * @param preFetchedRowNumber Número da linha já encontrado pelo caller (evita lookup duplicado)
     */
    private fun updateRDOInSheet(
        rdo: RDODataCompleto,
        isDelete: Boolean,
        currentDateTime: String,
        numeroRDOAntigo: String? = null,
        preFetchedRowNumber: Int? = null
    ) {
        val service = sheetsService
            ?: throw IllegalStateException("sheetsService não inicializado")

        try {
            val rowNumber = preFetchedRowNumber ?: run {
                val numeroRDOParaBuscar = numeroRDOAntigo ?: rdo.numeroRDO
                lookupHelper.findRowNumberByNumeroRDO(numeroRDOParaBuscar)
                    ?: throw Exception("Linha não encontrada para Número RDO: $numeroRDOParaBuscar (possível deleção manual do Sheets)")
            }

            Log.d(tag, "Linha encontrada: $rowNumber para numeroRDO: ${numeroRDOAntigo ?: rdo.numeroRDO}")

            // Preservar Data Criação original (coluna U)
            var dataCriacaoOriginal: String? = null
            try {
                val existingDataResult = service.spreadsheets().values()
                    .get(spreadsheetId, "${SheetsConstants.SHEET_RDO}!U${rowNumber}")
                    .execute()
                val values = existingDataResult.getValues()
                if (values != null && values.isNotEmpty() && values[0].isNotEmpty()) {
                    dataCriacaoOriginal = values[0][0].toString()
                    Log.d(tag, "Data Criação original preservada: $dataCriacaoOriginal")
                }
            } catch (e: Exception) {
                Log.w(tag, "Não foi possível obter Data Criação original: ${e.message}")
            }

            // Atualizar linha principal
            val rdoRow = dataManager.buildRDORow(rdo, isDelete, currentDateTime, dataCriacaoOriginal)
            val valueRange = ValueRange().setValues(listOf(rdoRow))

            service.spreadsheets().values()
                .update(spreadsheetId, "${SheetsConstants.SHEET_RDO}!A${rowNumber}:V${rowNumber}", valueRange)
                .setValueInputOption("RAW")
                .execute()

            Log.d(tag, "Linha principal atualizada: linha $rowNumber, NumeroRDO: ${rdo.numeroRDO}")

            // Deletar dados relacionados (do antigo ou atual)
            if (numeroRDOAntigo != null && numeroRDOAntigo != rdo.numeroRDO) {
                Log.d(tag, "Número RDO mudou de $numeroRDOAntigo para ${rdo.numeroRDO}. Deletando dados relacionados do antigo...")
                dataManager.deleteRelatedDataByNumeroRDO(numeroRDOAntigo)
            } else {
                Log.d(tag, "Número RDO mantido: ${rdo.numeroRDO}. Deletando dados relacionados atuais para atualizar...")
                dataManager.deleteRelatedDataByNumeroRDO(rdo.numeroRDO)
            }

            // Re-inserir dados relacionados (se não for delete)
            if (!isDelete) {
                dataManager.insertRelatedData(rdo.numeroRDO, rdo, currentDateTime)
            }

            Log.d(tag, "UPDATE concluído com sucesso para NumeroRDO: ${rdo.numeroRDO}")

        } catch (e: Exception) {
            Log.e(tag, "Erro ao atualizar RDO: ${e.message}", e)
            throw e
        }
    }

    /**
     * Insere um novo RDO na planilha.
     */
    private fun insertRDOInSheet(rdo: RDODataCompleto, isDelete: Boolean, currentDateTime: String) {
        val service = sheetsService
            ?: throw IllegalStateException("sheetsService não inicializado")

        try {
            val rdoRow = dataManager.buildRDORow(rdo, isDelete, currentDateTime)
            val valueRange = ValueRange().setValues(listOf(rdoRow))

            service.spreadsheets().values()
                .append(spreadsheetId, "${SheetsConstants.SHEET_RDO}!A:V", valueRange)
                .setValueInputOption("RAW")
                .setInsertDataOption("INSERT_ROWS")
                .execute()

            Log.d(tag, "Linha principal inserida - NumeroRDO: ${rdo.numeroRDO}")

            if (!isDelete) {
                dataManager.insertRelatedData(rdo.numeroRDO, rdo, currentDateTime)
            }

            Log.d(tag, "INSERT concluído com sucesso para NumeroRDO: ${rdo.numeroRDO}")

        } catch (e: Exception) {
            Log.e(tag, "Erro ao inserir RDO: ${e.message}", e)
            throw e
        }
    }

    /**
     * Inicialização leve: autentica e constrói o serviço Sheets sem chamar ensureSheetsExist().
     * Usada apenas para verificarAtualizacao(), evitando falhas de cota/estrutura das abas.
     * Propaga a exceção para que o chamador possa exibir a mensagem real de erro.
     */
    private suspend fun inicializarLeve(): Sheets = withContext(Dispatchers.IO) {
        val httpTransport = GoogleNetHttpTransport.newTrustedTransport()
        val jsonFactory = GsonFactory.getDefaultInstance()
        val credentials = context.assets.open("rdo-engecom-0cdcc15ed168.json").use { inputStream ->
            GoogleCredentials.fromStream(inputStream)
                .createScoped(listOf(SheetsScopes.SPREADSHEETS))
        }
        Sheets.Builder(httpTransport, jsonFactory, HttpCredentialsAdapter(credentials))
            .setApplicationName(SheetsConstants.APPLICATION_NAME)
            .build()
    }

    /**
     * Verifica se há uma atualização disponível consultando a aba "Config" do Sheets.
     * Usa inicialização leve (sem ensureSheetsExist) para máxima confiabilidade.
     * Propaga exceções para que o chamador possa diagnosticar falhas.
     */
    suspend fun verificarAtualizacao(): UpdateConfig? = withContext(Dispatchers.IO) {
        val service = sheetsService ?: inicializarLeve()
        UpdateChecker.fetchUpdateConfig(service, spreadsheetId)
    }

    /**
     * Sincroniza múltiplos RDOs (para batch sync).
     */
    suspend fun syncMultipleRDOs(rdos: List<RDODataCompleto>, progressCallback: ((Int, Int) -> Unit)? = null): Int =
        withContext(Dispatchers.IO) {
            var successCount = 0

            rdos.forEachIndexed { index, rdo ->
                try {
                    if (syncRDO(rdo)) {
                        successCount++
                    }
                } catch (e: Exception) {
                    Log.e(tag, "Erro ao sincronizar RDO ${rdo.numeroRDO} em batch: ${e.message}")
                }
                progressCallback?.invoke(index + 1, rdos.size)
            }

            successCount
        }
}
