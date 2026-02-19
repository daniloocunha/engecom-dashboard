package com.example.calculadorahh.data.database

import com.example.calculadorahh.data.models.RDODataCompleto
import com.example.calculadorahh.utils.AppConstants
import com.example.calculadorahh.utils.AppLogger
import com.google.gson.Gson
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Extensões para DatabaseHelper com funcionalidades adicionais.
 *
 * Separa funcionalidades auxiliares do arquivo principal para
 * melhorar organização e manutenibilidade.
 *
 * @since v2.5.0
 */

private const val TAG = "DatabaseHelperExt"

// extrairRDODoCursor agora é internal em DatabaseHelper — sem duplicação

/**
 * Obtém RDOs com paginação.
 *
 * Evita carregar todos os RDOs de uma vez, prevenindo OutOfMemoryError
 * com grandes volumes de dados.
 *
 * @param offset Número de itens a pular
 * @param limit Número máximo de itens a retornar (default: 20)
 * @return Lista paginada de RDOs
 *
 * @sample
 * ```kotlin
 * // Primeira página
 * val page1 = db.obterRDOsPaginados(offset = 0, limit = 20)
 *
 * // Segunda página
 * val page2 = db.obterRDOsPaginados(offset = 20, limit = 20)
 * ```
 */
fun DatabaseHelper.obterRDOsPaginados(
    offset: Int = 0,
    limit: Int = AppConstants.PAGE_SIZE_DEFAULT
): List<RDODataCompleto> {
    val db = readableDatabase
    val rdos = mutableListOf<RDODataCompleto>()
    val gson = Gson()

    AppLogger.measureTime(TAG, "obterRDOsPaginados(offset=$offset, limit=$limit)") {
        // 🔥 FIX: Ordenar por data convertida para formato sortable (yyyy-MM-dd)
        val dataSortavel = "substr(data,7,4)||'-'||substr(data,4,2)||'-'||substr(data,1,2)"
        db.query(
            "rdo",
            null,
            null,
            null,
            null,
            null,
            "$dataSortavel DESC LIMIT $limit OFFSET $offset"
        ).use { cursor ->
            while (cursor.moveToNext()) {
                try {
                    val rdo = extrairRDODoCursor(cursor, gson)
                    rdos.add(rdo)
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Erro ao extrair RDO do cursor na posição ${cursor.position}", e)
                    // Continua para próximo RDO ao invés de falhar completamente
                }
            }
        }
    }

    AppLogger.d(TAG, "Carregados ${rdos.size} RDOs (offset=$offset)")
    return rdos
}


/**
 * Conta total de RDOs no banco.
 *
 * Útil para calcular número de páginas em paginação.
 *
 * @return Total de RDOs
 */
fun DatabaseHelper.contarRDOs(): Int {
    val db = readableDatabase
    return db.query(
        "rdo",
        arrayOf("COUNT(*) as total"),
        null,
        null,
        null,
        null,
        null
    ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getInt(0) else 0
    }
}


/**
 * Obtém RDOs filtrados por data.
 *
 * @param dataInicio Data inicial (dd/MM/yyyy) - opcional
 * @param dataFim Data final (dd/MM/yyyy) - opcional
 * @param offset Offset para paginação
 * @param limit Limite de resultados
 * @return Lista de RDOs no período
 */
fun DatabaseHelper.obterRDOsPorPeriodo(
    dataInicio: String? = null,
    dataFim: String? = null,
    offset: Int = 0,
    limit: Int = AppConstants.PAGE_SIZE_DEFAULT
): List<RDODataCompleto> {
    val db = readableDatabase
    val rdos = mutableListOf<RDODataCompleto>()
    val gson = Gson()

    // 🔥 FIX: Converter dd/MM/yyyy para yyyy-MM-dd (formato sortable) para comparação correta
    // SQLite BETWEEN faz comparação lexicográfica — dd/MM/yyyy não é ordenável assim
    val dataSortavel = "substr(data,7,4)||'-'||substr(data,4,2)||'-'||substr(data,1,2)"

    // Converter datas de entrada para formato sortable
    val sdfInput = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
    val sdfSortable = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())

    fun converterParaSortavel(data: String): String? {
        return try {
            val date = sdfInput.parse(data) ?: return null
            sdfSortable.format(date)
        } catch (e: Exception) {
            null
        }
    }

    val inicioSortavel = dataInicio?.let { converterParaSortavel(it) }
    val fimSortavel = dataFim?.let { converterParaSortavel(it) }

    // Construir WHERE clause usando formato sortable
    val whereClause = buildString {
        if (inicioSortavel != null && fimSortavel != null) {
            append("$dataSortavel BETWEEN ? AND ?")
        } else if (inicioSortavel != null) {
            append("$dataSortavel >= ?")
        } else if (fimSortavel != null) {
            append("$dataSortavel <= ?")
        }
    }.takeIf { it.isNotBlank() }

    // Argumentos em formato sortable
    val whereArgs = buildList {
        if (inicioSortavel != null) add(inicioSortavel)
        if (fimSortavel != null && inicioSortavel != null) add(fimSortavel)
        else if (fimSortavel != null) add(fimSortavel)
    }.toTypedArray()

    AppLogger.d(TAG, "Buscando RDOs - WHERE: $whereClause, Args: ${whereArgs.contentToString()}")

    db.query(
        "rdo",
        null,
        whereClause,
        whereArgs,
        null,
        null,
        "$dataSortavel DESC LIMIT $limit OFFSET $offset"
    ).use { cursor ->
        while (cursor.moveToNext()) {
            try {
                val rdo = extrairRDODoCursor(cursor, gson)
                rdos.add(rdo)
            } catch (e: Exception) {
                AppLogger.e(TAG, "Erro ao extrair RDO filtrado do cursor", e)
            }
        }
    }

    return rdos
}


/**
 * Obtém RDOs filtrados por número de OS.
 *
 * @param numeroOS Número da OS a buscar
 * @param offset Offset para paginação
 * @param limit Limite de resultados
 * @return Lista de RDOs da OS
 */
fun DatabaseHelper.obterRDOsPorOS(
    numeroOS: String,
    offset: Int = 0,
    limit: Int = AppConstants.PAGE_SIZE_DEFAULT
): List<RDODataCompleto> {
    val db = readableDatabase
    val rdos = mutableListOf<RDODataCompleto>()
    val gson = Gson()

    // 🔥 FIX: Ordenar por data convertida para formato sortable (yyyy-MM-dd)
    val dataSortavel = "substr(data,7,4)||'-'||substr(data,4,2)||'-'||substr(data,1,2)"
    db.query(
        "rdo",
        null,
        "numero_os = ?",
        arrayOf(numeroOS),
        null,
        null,
        "$dataSortavel DESC LIMIT $limit OFFSET $offset"
    ).use { cursor ->
        while (cursor.moveToNext()) {
            try {
                val rdo = extrairRDODoCursor(cursor, gson)
                rdos.add(rdo)
            } catch (e: Exception) {
                AppLogger.e(TAG, "Erro ao extrair RDO por OS do cursor", e)
            }
        }
    }

    return rdos
}


/**
 * Obtém RDOs pendentes de sincronização.
 *
 * Útil para sync workers.
 *
 * @param limit Máximo de RDOs a retornar (default: 100)
 * @return Lista de RDOs não sincronizados
 */
fun DatabaseHelper.obterRDOsPendentesSyncPaginados(
    limit: Int = 100
): List<RDODataCompleto> {
    val db = readableDatabase
    val rdos = mutableListOf<RDODataCompleto>()
    val gson = Gson()

    // 🔥 FIX: Ordenar por data convertida para formato sortable (yyyy-MM-dd)
    val dataSortavel = "substr(data,7,4)||'-'||substr(data,4,2)||'-'||substr(data,1,2)"
    db.query(
        "rdo",
        null,
        "sincronizado = 0 OR sync_status != 'synced'",
        null,
        null,
        null,
        "$dataSortavel ASC LIMIT $limit"  // Mais antigos primeiro
    ).use { cursor ->
        while (cursor.moveToNext()) {
            try {
                val rdo = extrairRDODoCursor(cursor, gson)
                rdos.add(rdo)
            } catch (e: Exception) {
                AppLogger.e(TAG, "Erro ao extrair RDO pendente do cursor", e)
            }
        }
    }

    AppLogger.d(TAG, "${rdos.size} RDOs pendentes de sincronização")
    return rdos
}


/**
 * Verifica se existe RDO com número específico.
 *
 * Mais eficiente que obter RDO completo apenas para verificar existência.
 *
 * @param numeroRDO Número do RDO a verificar
 * @return true se existe
 */
fun DatabaseHelper.existeRDOComNumero(numeroRDO: String): Boolean {
    val db = readableDatabase
    return db.query(
        "rdo",
        arrayOf("id"),
        "numero_rdo = ?",
        arrayOf(numeroRDO),
        null,
        null,
        null,
        "1"  // LIMIT 1
    ).use { cursor ->
        cursor.moveToFirst()
    }
}


/**
 * Obtém estatísticas básicas do banco de dados.
 *
 * Útil para debugging e monitoramento.
 *
 * @return Map com estatísticas
 */
fun DatabaseHelper.obterEstatisticas(): Map<String, Any> {
    val db = readableDatabase

    val stats = mutableMapOf<String, Any>()

    // Total de RDOs
    stats["total_rdos"] = db.query(
        "rdo",
        arrayOf("COUNT(*) as total"),
        null,
        null,
        null,
        null,
        null
    ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getInt(0) else 0
    }

    // RDOs sincronizados
    stats["rdos_sincronizados"] = db.query(
        "rdo",
        arrayOf("COUNT(*) as total"),
        "sincronizado = 1",
        null,
        null,
        null,
        null
    ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getInt(0) else 0
    }

    // RDOs pendentes
    stats["rdos_pendentes"] = db.query(
        "rdo",
        arrayOf("COUNT(*) as total"),
        "sincronizado = 0",
        null,
        null,
        null,
        null
    ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getInt(0) else 0
    }

    // 🔥 FIX: Ordenar por data convertida para formato sortable (yyyy-MM-dd)
    val dataSortavel = "substr(data,7,4)||'-'||substr(data,4,2)||'-'||substr(data,1,2)"

    // Data do RDO mais antigo
    stats["data_mais_antiga"] = db.query(
        "rdo",
        arrayOf("data"),
        null,
        null,
        null,
        null,
        "$dataSortavel ASC",
        "1"
    ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else "N/A"
    }

    // Data do RDO mais recente
    stats["data_mais_recente"] = db.query(
        "rdo",
        arrayOf("data"),
        null,
        null,
        null,
        null,
        "$dataSortavel DESC",
        "1"
    ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else "N/A"
    }

    // Tamanho do banco (estimativa)
    try {
        val dbFile = db.path?.let { java.io.File(it) }
        stats["tamanho_mb"] = String.format("%.2f", (dbFile?.length() ?: 0) / 1024.0 / 1024.0)
    } catch (e: Exception) {
        stats["tamanho_mb"] = "N/A"
    }

    return stats
}
