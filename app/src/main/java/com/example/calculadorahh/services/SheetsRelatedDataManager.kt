package com.example.calculadorahh.services

import android.util.Log
import com.example.calculadorahh.BuildConfig
import com.example.calculadorahh.data.models.RDODataCompleto
import com.google.api.services.sheets.v4.Sheets
import com.google.api.services.sheets.v4.model.*

/**
 * Gerencia construção de linhas RDO, inserção e deleção de dados relacionados no Google Sheets.
 */
class SheetsRelatedDataManager(
    private val sheetsService: Sheets,
    private val spreadsheetId: String,
    private val auditService: SheetsAuditService
) {
    private val tag = "SheetsRelatedDataMgr"

    /**
     * Constrói uma linha para a aba RDO.
     * @param dataCriacao Se fornecido, usa esse valor para coluna U. Caso contrário, usa currentDateTime.
     */
    fun buildRDORow(
        rdo: RDODataCompleto,
        isDelete: Boolean,
        currentDateTime: String,
        dataCriacao: String? = null
    ): List<Any> {
        return listOf(
            rdo.id.toString(),                           // A: ID do banco local
            rdo.numeroRDO,                               // B: Número RDO (IDENTIFICADOR ÚNICO!)
            rdo.data,                                    // C: Data
            rdo.codigoTurma,                             // D: Código Turma
            rdo.encarregado,                             // E: Encarregado
            rdo.local,                                   // F: Local
            rdo.numeroOS,                                // G: Número OS
            rdo.statusOS,                                // H: Status OS
            rdo.kmInicio,                                // I: KM Início
            rdo.kmFim,                                   // J: KM Fim
            rdo.horarioInicio,                           // K: Horário Início
            rdo.horarioFim,                              // L: Horário Fim
            rdo.clima,                                   // M: Clima
            rdo.temaDDS,                                 // N: Tema DDS
            if (rdo.houveServico) "Sim" else "Não",      // O: Houve Serviço
            if (rdo.houveTransporte) "Sim" else "Não",   // P: Houve Transporte
            rdo.nomeColaboradores,                       // Q: Nome Colaboradores
            rdo.observacoes,                             // R: Observações
            if (isDelete) "Sim" else "Não",              // S: Deletado
            currentDateTime,                             // T: Data Sincronização
            dataCriacao ?: currentDateTime,              // U: Data Criação
            BuildConfig.VERSION_CODE.toString()          // V: Versão App
        )
    }

    /**
     * Insere dados relacionados (serviços, materiais, HI, transportes, efetivo, equipamentos).
     */
    fun insertRelatedData(numeroRDO: String, rdo: RDODataCompleto, currentDateTime: String) {
        try {
            val updates = mutableListOf<ValueRange>()

            // Servicos
            if (rdo.servicos.isNotEmpty()) {
                val servicosRows = rdo.servicos.map { servico ->
                    listOf(
                        numeroRDO, rdo.numeroOS, rdo.data, rdo.codigoTurma, rdo.encarregado,
                        servico.descricao, servico.quantidade, servico.unidade,
                        servico.observacoes.orEmpty(),
                        if (servico.isCustomizado) "SIM" else "NÃO",
                        servico.hhManual ?: ""
                    )
                }
                updates.add(ValueRange().setRange("${SheetsConstants.SHEET_SERVICOS}!A:K").setValues(servicosRows))
                Log.d(tag, "Preparando ${servicosRows.size} serviços para NumeroRDO: $numeroRDO")
            }

            // Materiais
            if (rdo.materiais.isNotEmpty()) {
                val materiaisRows = rdo.materiais.map { material ->
                    listOf(
                        numeroRDO, rdo.numeroOS, rdo.data, rdo.codigoTurma, rdo.encarregado,
                        material.descricao, material.quantidade, material.unidade
                    )
                }
                updates.add(ValueRange().setRange("${SheetsConstants.SHEET_MATERIAIS}!A:H").setValues(materiaisRows))
                Log.d(tag, "Preparando ${materiaisRows.size} materiais para NumeroRDO: $numeroRDO")
            }

            // Horas Improdutivas
            if (rdo.horasImprodutivas.isNotEmpty()) {
                val hiRows = rdo.horasImprodutivas.map { hi ->
                    listOf(
                        numeroRDO, rdo.numeroOS, rdo.data, rdo.codigoTurma, rdo.encarregado,
                        hi.tipo, hi.descricao, hi.horaInicio, hi.horaFim,
                        hi.colaboradores.takeIf { it > 0 } ?: 12  // Default 12 para records antigos (Gson retorna 0)
                    )
                }
                updates.add(ValueRange().setRange("${SheetsConstants.SHEET_HI}!A:J").setValues(hiRows))
                Log.d(tag, "Preparando ${hiRows.size} HIs para NumeroRDO: $numeroRDO")
            }

            // Transportes
            if (rdo.transportes.isNotEmpty()) {
                val transportesRows = rdo.transportes.map { transporte ->
                    listOf(
                        numeroRDO, rdo.numeroOS, rdo.data, rdo.codigoTurma, rdo.encarregado,
                        transporte.descricao, transporte.quantidadeColaboradores,
                        transporte.horarioInicio, transporte.horarioFim,
                        transporte.kmInicio, transporte.kmFim
                    )
                }
                updates.add(ValueRange().setRange("${SheetsConstants.SHEET_TRANSPORTES}!A:K").setValues(transportesRows))
                Log.d(tag, "Preparando ${transportesRows.size} transportes para NumeroRDO: $numeroRDO")
            }

            // Efetivo
            if (rdo.efetivo.encarregado > 0 || rdo.efetivo.operadores > 0 || rdo.efetivo.operadorEGP > 0 ||
                rdo.efetivo.tecnicoSeguranca > 0 || rdo.efetivo.soldador > 0 || rdo.efetivo.motoristas > 0) {
                val efetivoRow = listOf(
                    listOf(
                        numeroRDO, rdo.numeroOS, rdo.data, rdo.codigoTurma, rdo.encarregado,
                        rdo.efetivo.encarregado, rdo.efetivo.operadores, rdo.efetivo.operadorEGP,
                        rdo.efetivo.tecnicoSeguranca, rdo.efetivo.soldador, rdo.efetivo.motoristas
                    )
                )
                updates.add(ValueRange().setRange("${SheetsConstants.SHEET_EFETIVO}!A:K").setValues(efetivoRow))
                Log.d(tag, "Preparando efetivo para NumeroRDO: $numeroRDO")
            }

            // Equipamentos
            if (rdo.equipamentos.isNotEmpty()) {
                val equipamentosRows = rdo.equipamentos.map { equipamento ->
                    listOf(
                        numeroRDO, rdo.numeroOS, rdo.data, rdo.codigoTurma, rdo.encarregado,
                        equipamento.tipo, equipamento.placa
                    )
                }
                updates.add(ValueRange().setRange("${SheetsConstants.SHEET_EQUIPAMENTOS}!A:G").setValues(equipamentosRows))
                Log.d(tag, "Preparando ${equipamentosRows.size} equipamentos para NumeroRDO: $numeroRDO")
            }

            // Executar inserções com controle de erro para pseudo-atomicidade
            if (updates.isNotEmpty()) {
                val insertedRanges = mutableListOf<String>()
                try {
                    updates.forEach { update ->
                        sheetsService.spreadsheets().values()
                            .append(spreadsheetId, update.range, update)
                            .setValueInputOption("RAW")
                            .setInsertDataOption("INSERT_ROWS")
                            .execute()
                        insertedRanges.add(update.range!!)
                        Log.d(tag, "✓ Inserido em ${update.range}")
                    }
                    Log.d(tag, "✅ Todos os dados relacionados inseridos com sucesso para NumeroRDO: $numeroRDO (${updates.size} abas)")

                } catch (e: Exception) {
                    Log.e(tag, "❌ ERRO CRÍTICO: Falha ao inserir dados em ${insertedRanges.size}/${updates.size} abas", e)

                    // Rollback cirúrgico: apagar APENAS as abas que foram inseridas com sucesso.
                    // Evita tentar deletar de abas que nunca foram tocadas (falha em cascata de cota).
                    if (insertedRanges.isNotEmpty()) {
                        Log.w(tag, "Rollback cirúrgico: apagando ${insertedRanges.size} aba(s) inseridas: ${insertedRanges.joinToString(", ")}")
                        try {
                            deleteRelatedDataByNumeroRDOInSheets(numeroRDO, insertedRanges)
                            Log.w(tag, "⚠️ Rollback cirúrgico executado com sucesso")
                        } catch (rollbackError: Exception) {
                            Log.e(tag, "❌ ROLLBACK_FAILED para NumeroRDO: $numeroRDO " +
                                "| Abas com dados órfãos: ${insertedRanges.joinToString(", ")} " +
                                "| Erro rollback: ${rollbackError.message}", rollbackError)
                        }
                    }

                    throw e
                }
            }

        } catch (e: Exception) {
            Log.e(tag, "Erro ao preparar dados relacionados: ${e.message}", e)
            throw e
        }
    }

    /**
     * Deleta todos os dados relacionados de um RDO pelo Número RDO.
     * Verifica proteção de versão antes de deletar.
     */
    fun deleteRelatedDataByNumeroRDO(numeroRDO: String) {
        Log.d(tag, "Deletando dados relacionados para NumeroRDO: $numeroRDO")

        // Verificar versão do app que criou o RDO
        val rdoVersion = auditService.getRDOAppVersion(numeroRDO)

        if (rdoVersion != null && rdoVersion > BuildConfig.VERSION_CODE) {
            val msg = "⚠️ RDO $numeroRDO foi criado por versão mais nova (v$rdoVersion > v${BuildConfig.VERSION_CODE}). " +
                "Abortando sync para evitar perda de dados."
            Log.w(tag, msg)
            throw Exception(msg)
        }

        // Coletar TODOS os erros antes de falhar
        val errors = mutableListOf<String>()
        val deletedSheets = mutableListOf<String>()

        SheetsConstants.RELATED_DATA_SHEETS.forEach { sheetName ->
            try {
                val response = sheetsService.spreadsheets().values()
                    .get(spreadsheetId, "${sheetName}!A:A")
                    .execute()

                val values = response.getValues() ?: return@forEach
                val rowsToDelete = mutableListOf<Int>()

                values.forEachIndexed { index, row ->
                    if (index > 0 && row.isNotEmpty()) {
                        val numero = row[0].toString()
                        if (numero == numeroRDO) {
                            rowsToDelete.add(index)
                        }
                    }
                }

                auditService.deleteSheetRows(sheetName, rowsToDelete)

                Log.d(tag, "Deletadas ${rowsToDelete.size} linhas de $sheetName para NumeroRDO: $numeroRDO")
                deletedSheets.add(sheetName)

            } catch (e: Exception) {
                val error = "Erro em $sheetName: ${e.message}"
                Log.e(tag, error, e)
                errors.add(error)
            }
        }

        if (errors.isNotEmpty()) {
            val errorMessage = """
                Falha ao deletar dados relacionados (${errors.size}/${SheetsConstants.RELATED_DATA_SHEETS.size} abas falharam):
                ${errors.joinToString("\n")}

                Abas deletadas com sucesso: ${deletedSheets.joinToString(", ")}
            """.trimIndent()

            Log.e(tag, errorMessage)
            throw Exception(errorMessage)
        }
    }

    /**
     * Rollback cirúrgico: deleta dados do numeroRDO APENAS nas abas especificadas em [ranges].
     * Usado após falha parcial de insertRelatedData para não tocar abas que nunca foram inseridas.
     * [ranges] contém os range notation strings (ex: "Servicos!A:K") das abas já inseridas.
     */
    private fun deleteRelatedDataByNumeroRDOInSheets(numeroRDO: String, ranges: List<String>) {
        // Extrair nomes de aba a partir dos range notation ("Servicos!A:K" → "Servicos")
        val sheetNames = ranges.mapNotNull { it.substringBefore("!").takeIf { n -> n.isNotBlank() } }.distinct()

        sheetNames.forEach { sheetName ->
            try {
                val response = sheetsService.spreadsheets().values()
                    .get(spreadsheetId, "${sheetName}!A:A")
                    .execute()

                val values = response.getValues() ?: return@forEach
                val rowsToDelete = mutableListOf<Int>()

                values.forEachIndexed { index, row ->
                    if (index > 0 && row.isNotEmpty() && row[0].toString() == numeroRDO) {
                        rowsToDelete.add(index)
                    }
                }

                if (rowsToDelete.isNotEmpty()) {
                    auditService.deleteSheetRows(sheetName, rowsToDelete)
                    Log.d(tag, "Rollback: deletadas ${rowsToDelete.size} linhas de $sheetName para NumeroRDO: $numeroRDO")
                }
            } catch (e: Exception) {
                Log.e(tag, "Rollback falhou em $sheetName: ${e.message}", e)
                throw e
            }
        }
    }
}
