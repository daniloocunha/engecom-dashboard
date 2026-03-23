package com.example.calculadorahh.data.database

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteConstraintException
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.example.calculadorahh.data.models.*
import com.example.calculadorahh.utils.AppLogger
import java.text.SimpleDateFormat
import java.util.*
import androidx.core.database.sqlite.transaction
import kotlinx.coroutines.delay

class DatabaseHelper private constructor(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val TAG = "DatabaseHelper"
        private const val DATABASE_NAME = "rdo.db"
        private const val DATABASE_VERSION = 10

        @Volatile
        private var INSTANCE: DatabaseHelper? = null

        fun getInstance(context: Context): DatabaseHelper {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: DatabaseHelper(context.applicationContext).also { INSTANCE = it }
            }
        }

        private const val TABLE_RDO = "rdo"

        private const val COLUMN_ID = "id"
        private const val COLUMN_NUMERO_RDO = "numero_rdo"
        private const val COLUMN_DATA = "data"
        private const val COLUMN_CODIGO_TURMA = "codigo_turma"
        private const val COLUMN_ENCARREGADO = "encarregado"
        private const val COLUMN_LOCAL = "local"
        private const val COLUMN_NUMERO_OS = "numero_os"
        private const val COLUMN_STATUS_OS = "status_os"
        private const val COLUMN_KM_INICIO = "km_inicio"
        private const val COLUMN_KM_FIM = "km_fim"
        private const val COLUMN_HORARIO_INICIO = "horario_inicio"
        private const val COLUMN_HORARIO_FIM = "horario_fim"
        private const val COLUMN_CLIMA = "clima"
        private const val COLUMN_TEMA_DDS = "tema_dds"
        private const val COLUMN_HOUVE_SERVICO = "houve_servico"
        private const val COLUMN_SERVICOS = "servicos"
        private const val COLUMN_MATERIAIS = "materiais"
        private const val COLUMN_EFETIVO = "efetivo"
        private const val COLUMN_EQUIPAMENTOS = "equipamentos"
        private const val COLUMN_HI_ITENS = "hi_itens"
        private const val COLUMN_HOUVE_TRANSPORTE = "houve_transporte"
        private const val COLUMN_TRANSPORTES = "transportes"
        private const val COLUMN_NOME_COLABORADORES = "nome_colaboradores"
        private const val COLUMN_OBSERVACOES = "observacoes"
        private const val COLUMN_SINCRONIZADO = "sincronizado"
        private const val COLUMN_SYNC_STATUS = "sync_status"
        private const val COLUMN_ULTIMA_TENTATIVA_SYNC = "ultima_tentativa_sync"
        private const val COLUMN_MENSAGEM_ERRO_SYNC = "mensagem_erro_sync"
        private const val COLUMN_TENTATIVAS_SYNC = "tentativas_sync"
        private const val COLUMN_CAUSA_NAO_SERVICO = "causa_nao_servico"
    }

    override fun onCreate(db: SQLiteDatabase?) {
        val createTable = """
            CREATE TABLE $TABLE_RDO (
                $COLUMN_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COLUMN_NUMERO_RDO TEXT,
                $COLUMN_DATA TEXT,
                $COLUMN_CODIGO_TURMA TEXT,
                $COLUMN_ENCARREGADO TEXT,
                $COLUMN_LOCAL TEXT,
                $COLUMN_NUMERO_OS TEXT,
                $COLUMN_STATUS_OS TEXT,
                $COLUMN_KM_INICIO TEXT,
                $COLUMN_KM_FIM TEXT,
                $COLUMN_HORARIO_INICIO TEXT,
                $COLUMN_HORARIO_FIM TEXT,
                $COLUMN_CLIMA TEXT,
                $COLUMN_TEMA_DDS TEXT,
                $COLUMN_HOUVE_SERVICO INTEGER,
                $COLUMN_SERVICOS TEXT,
                $COLUMN_MATERIAIS TEXT,
                $COLUMN_EFETIVO TEXT,
                $COLUMN_EQUIPAMENTOS TEXT,
                $COLUMN_HI_ITENS TEXT,
                $COLUMN_HOUVE_TRANSPORTE INTEGER DEFAULT 0,
                $COLUMN_TRANSPORTES TEXT DEFAULT '[]',
                $COLUMN_NOME_COLABORADORES TEXT DEFAULT '',
                $COLUMN_OBSERVACOES TEXT,
                $COLUMN_SINCRONIZADO INTEGER DEFAULT 0,
                $COLUMN_SYNC_STATUS TEXT DEFAULT 'pending',
                $COLUMN_ULTIMA_TENTATIVA_SYNC TEXT DEFAULT '',
                $COLUMN_MENSAGEM_ERRO_SYNC TEXT DEFAULT '',
                $COLUMN_TENTATIVAS_SYNC INTEGER DEFAULT 0,
                $COLUMN_CAUSA_NAO_SERVICO TEXT DEFAULT ''
            )
        """.trimIndent()
        db?.execSQL(createTable)

        // Create indexes for frequently queried columns to improve performance
        db?.execSQL("CREATE INDEX idx_rdo_data ON $TABLE_RDO($COLUMN_DATA)")
        db?.execSQL("CREATE INDEX idx_rdo_numero_os ON $TABLE_RDO($COLUMN_NUMERO_OS)")
        db?.execSQL("CREATE INDEX idx_rdo_sincronizado ON $TABLE_RDO($COLUMN_SINCRONIZADO)")

        // Create UNIQUE index to prevent duplicate RDO numbers (v8+)
        db?.execSQL("CREATE UNIQUE INDEX idx_rdo_numero_rdo_unique ON $TABLE_RDO($COLUMN_NUMERO_RDO)")
    }

    override fun onUpgrade(db: SQLiteDatabase?, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_HORARIO_INICIO TEXT DEFAULT ''")
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_HORARIO_FIM TEXT DEFAULT ''")
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_TEMA_DDS TEXT DEFAULT ''")
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_EFETIVO TEXT DEFAULT '{}'")
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_EQUIPAMENTOS TEXT DEFAULT '[]'")
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_HI_ITENS TEXT DEFAULT '[]'")
        }
        if (oldVersion < 3) {
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_NUMERO_RDO TEXT DEFAULT ''")
            gerarNumerosParaRegistrosExistentes(db)
        }
        if (oldVersion < 4) {
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_HOUVE_TRANSPORTE INTEGER DEFAULT 0")
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_TRANSPORTES TEXT DEFAULT '[]'")
        }
        if (oldVersion < 5) {
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_NOME_COLABORADORES TEXT DEFAULT ''")
        }
        if (oldVersion < 6) {
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_SINCRONIZADO INTEGER DEFAULT 0")
        }
        if (oldVersion < 7) {
            db?.execSQL("CREATE INDEX IF NOT EXISTS idx_rdo_data ON $TABLE_RDO($COLUMN_DATA)")
            db?.execSQL("CREATE INDEX IF NOT EXISTS idx_rdo_numero_os ON $TABLE_RDO($COLUMN_NUMERO_OS)")
            db?.execSQL("CREATE INDEX IF NOT EXISTS idx_rdo_sincronizado ON $TABLE_RDO($COLUMN_SINCRONIZADO)")
            db?.execSQL("CREATE INDEX IF NOT EXISTS idx_rdo_numero_rdo ON $TABLE_RDO($COLUMN_NUMERO_RDO)")
        }
        if (oldVersion < 8) {
            db?.execSQL("DROP INDEX IF EXISTS idx_rdo_numero_rdo")

            // 🔥 LIMPAR DUPLICADOS ANTES DE CRIAR UNIQUE INDEX
            limparDuplicadosNumeroRDO(db)

            try {
                db?.execSQL("CREATE UNIQUE INDEX idx_rdo_numero_rdo_unique ON $TABLE_RDO($COLUMN_NUMERO_RDO)")
                Log.i(TAG, "UNIQUE index criado com sucesso em numero_rdo")
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao criar UNIQUE index - pode haver RDOs duplicados: ${e.message}", e)
                db?.execSQL("CREATE INDEX IF NOT EXISTS idx_rdo_numero_rdo ON $TABLE_RDO($COLUMN_NUMERO_RDO)")
            }
        }
        if (oldVersion < 9) {
            // Adicionar colunas de controle de sincronização
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_SYNC_STATUS TEXT DEFAULT 'pending'")
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_ULTIMA_TENTATIVA_SYNC TEXT DEFAULT ''")
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_MENSAGEM_ERRO_SYNC TEXT DEFAULT ''")
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_TENTATIVAS_SYNC INTEGER DEFAULT 0")

            // Atualizar status dos RDOs já sincronizados
            db?.execSQL("UPDATE $TABLE_RDO SET $COLUMN_SYNC_STATUS = 'synced' WHERE $COLUMN_SINCRONIZADO = 1")

            Log.i(TAG, "Colunas de controle de sincronização adicionadas com sucesso")
        }
        if (oldVersion < 10) {
            db?.execSQL("ALTER TABLE $TABLE_RDO ADD COLUMN $COLUMN_CAUSA_NAO_SERVICO TEXT DEFAULT ''")
            Log.i(TAG, "Coluna causa_nao_servico adicionada com sucesso")
        }
    }

    /**
     * 🔥 FIX: Limpar duplicados de numero_rdo antes de criar UNIQUE index
     * Mantém apenas o RDO com ID mais alto (mais recente) para cada numero_rdo duplicado
     */
    private fun limparDuplicadosNumeroRDO(db: SQLiteDatabase?) {
        db?.let {
            try {
                // Encontrar todos os numero_rdo duplicados
                val duplicadosQuery = """
                    SELECT $COLUMN_NUMERO_RDO, COUNT(*) as count
                    FROM $TABLE_RDO
                    GROUP BY $COLUMN_NUMERO_RDO
                    HAVING COUNT(*) > 1
                """.trimIndent()

                it.rawQuery(duplicadosQuery, null).use { cursor ->
                    val numerosDuplicados = mutableListOf<String>()
                    while (cursor.moveToNext()) {
                        val numeroRDO = cursor.getString(0)
                        numerosDuplicados.add(numeroRDO)
                    }

                    if (numerosDuplicados.isNotEmpty()) {
                        Log.w(TAG, "Encontrados ${numerosDuplicados.size} numero_rdo duplicados. Limpando...")

                        // Para cada numero_rdo duplicado, manter apenas o mais recente (ID mais alto)
                        numerosDuplicados.forEach { numeroRDO ->
                            // Deletar todos EXCETO o com ID mais alto
                            val deleteQuery = """
                                DELETE FROM $TABLE_RDO
                                WHERE $COLUMN_NUMERO_RDO = ?
                                AND $COLUMN_ID NOT IN (
                                    SELECT MAX($COLUMN_ID)
                                    FROM $TABLE_RDO
                                    WHERE $COLUMN_NUMERO_RDO = ?
                                )
                            """.trimIndent()

                            it.execSQL(deleteQuery, arrayOf(numeroRDO, numeroRDO))
                        }

                        Log.i(TAG, "Duplicados limpos com sucesso. ${numerosDuplicados.size} numero_rdo(s) tinham duplicatas.")
                    } else {
                        Log.d(TAG, "Nenhum numero_rdo duplicado encontrado.")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao limpar duplicados: ${e.message}", e)
            }
        }
    }

    /**
     * 🔥 FIX: Versão idempotente - só gera números para RDOs sem numero_rdo
     * Pode ser executada múltiplas vezes sem gerar duplicados
     */
    private fun gerarNumerosParaRegistrosExistentes(db: SQLiteDatabase?) {
        db?.let {
            // 🔥 Apenas RDOs sem numero_rdo (NULL ou vazio)
            val whereClause = "$COLUMN_NUMERO_RDO IS NULL OR $COLUMN_NUMERO_RDO = ''"

            it.query(
                TABLE_RDO,
                arrayOf(COLUMN_ID, COLUMN_NUMERO_OS, COLUMN_DATA),
                whereClause,
                null,
                null,
                null,
                "$COLUMN_DATA ASC, $COLUMN_ID ASC"
            ).use { cursor ->
                val updates = mutableMapOf<String, Int>()

                while (cursor.moveToNext()) {
                    val id = cursor.getLong(cursor.getColumnIndexOrThrow(COLUMN_ID))
                    val numeroOS = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_NUMERO_OS)) ?: "00000"
                    val data = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_DATA))

                    // Contar quantos RDOs já existem para essa OS+data
                    val chave = "$numeroOS-$data"
                    val contador = updates.getOrDefault(chave, 0) + 1
                    updates[chave] = contador

                    val numeroRDO = gerarNumeroRDOManual(numeroOS, data, contador)

                    val values = ContentValues().apply {
                        put(COLUMN_NUMERO_RDO, numeroRDO)
                    }
                    it.update(TABLE_RDO, values, "$COLUMN_ID = ?", arrayOf(id.toString()))

                    Log.d(TAG, "Número RDO gerado para ID $id: $numeroRDO")
                }

                if (cursor.count > 0) {
                    Log.i(TAG, "Gerados números para ${cursor.count} RDO(s) sem numero_rdo")
                }
            }
        }
    }

    private fun gerarNumeroRDOManual(numeroOS: String, data: String, contador: Int): String {
        return try {
            val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
            val date = sdf.parse(data)
            val sdfNumero = SimpleDateFormat("dd.MM.yy", Locale.getDefault())
            val dataFormatada = sdfNumero.format(date ?: Date())
            "$numeroOS-$dataFormatada-${contador.toString().padStart(3, '0')}"
        } catch (e: Exception) {
            "$numeroOS-00.00.00-${contador.toString().padStart(3, '0')}"
        }
    }

    @Synchronized
    fun gerarNumeroRDO(numeroOS: String, data: String): String {
        val db = readableDatabase

        // 🔥 FIX: Usar .use {} para auto-close
        val contador = db.query(
            TABLE_RDO,
            arrayOf("COUNT(*) as total"),
            "$COLUMN_NUMERO_OS = ? AND $COLUMN_DATA = ?",
            arrayOf(numeroOS, data),
            null,
            null,
            null
        ).use { cursor ->
            if (cursor.moveToFirst()) cursor.getInt(0) + 1 else 1
        }

        // Formato: OS-DD.MM.YY-contador
        // Exemplo: 998070-11.12.25-001
        return try {
            val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
            val date = sdf.parse(data)
            val sdfNumero = SimpleDateFormat("dd.MM.yy", Locale.getDefault())
            val dataFormatada = sdfNumero.format(date ?: Date())
            "$numeroOS-$dataFormatada-${contador.toString().padStart(3, '0')}"
        } catch (e: Exception) {
            "$numeroOS-00.00.00-${contador.toString().padStart(3, '0')}"
        }
    }

    /**
     * 🔥 NOVO: Gera número RDO excluindo um ID específico da contagem
     * Usado ao editar RDO para não contar o próprio RDO sendo editado
     */
    @Synchronized
    private fun gerarNumeroRDOExcluindoId(numeroOS: String, data: String, idExcluir: Long): String {
        val db = readableDatabase

        // Contar RDOs com mesmo número de OS e data, EXCLUINDO o ID especificado
        // 🔥 FIX: Usar .use {} para auto-close
        val contador = db.query(
            TABLE_RDO,
            arrayOf("COUNT(*) as total"),
            "$COLUMN_NUMERO_OS = ? AND $COLUMN_DATA = ? AND $COLUMN_ID != ?",
            arrayOf(numeroOS, data, idExcluir.toString()),
            null,
            null,
            null
        ).use { cursor ->
            if (cursor.moveToFirst()) cursor.getInt(0) + 1 else 1
        }

        // Formato: OS-DD.MM.YY-contador
        return try {
            val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
            val date = sdf.parse(data)
            val sdfNumero = SimpleDateFormat("dd.MM.yy", Locale.getDefault())
            val dataFormatada = sdfNumero.format(date ?: Date())
            "$numeroOS-$dataFormatada-${contador.toString().padStart(3, '0')}"
        } catch (e: Exception) {
            "$numeroOS-00.00.00-${contador.toString().padStart(3, '0')}"
        }
    }

    /**
     * ✅ CORRIGIDO: Usa transação atômica para evitar race conditions
     * Nota: @Synchronized removido pois não é compatível com suspend functions
     * A transação do SQLite já garante atomicidade
     */
    suspend fun inserirRDO(rdoData: RDOData): Long {
        val db = writableDatabase
        val gson = Gson()
        val maxRetries = 10
        var attempt = 0
        var lastException: Exception? = null

        while (attempt < maxRetries) {
            var insertedId: Long = -1L
            var success = false

            try {
                // 🔥 INICIAR TRANSAÇÃO ATÔMICA
                db.transaction {
                    // 🔥 FIX: Gerar número RDO DENTRO da transação usando a MESMA conexão
                    val contador = query(
                        TABLE_RDO,
                        arrayOf("COUNT(*) as total"),
                        "$COLUMN_NUMERO_OS = ? AND $COLUMN_DATA = ?",
                        arrayOf(rdoData.numeroOS, rdoData.data),
                        null, null, null
                    ).use { cursor ->
                        if (cursor.moveToFirst()) cursor.getInt(0) + 1 else 1
                    }

                    val numeroRDO = try {
                        val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
                        val date = sdf.parse(rdoData.data)
                        val sdfNumero = SimpleDateFormat("dd.MM.yy", Locale.getDefault())
                        val dataFormatada = sdfNumero.format(date ?: Date())
                        "${rdoData.numeroOS}-$dataFormatada-${contador.toString().padStart(3, '0')}"
                    } catch (e: Exception) {
                        "${rdoData.numeroOS}-00.00.00-${contador.toString().padStart(3, '0')}"
                    }

                    Log.d(TAG, "Tentativa ${attempt + 1}: Gerando RDO com número $numeroRDO")

                    val values = ContentValues().apply {
                        put(COLUMN_NUMERO_RDO, numeroRDO)
                        put(COLUMN_DATA, rdoData.data)
                        put(COLUMN_CODIGO_TURMA, rdoData.codigoTurma)
                        put(COLUMN_ENCARREGADO, rdoData.encarregado)
                        put(COLUMN_LOCAL, rdoData.local)
                        put(COLUMN_NUMERO_OS, rdoData.numeroOS)
                        put(COLUMN_STATUS_OS, rdoData.statusOS)
                        put(COLUMN_KM_INICIO, rdoData.kmInicio)
                        put(COLUMN_KM_FIM, rdoData.kmFim)
                        put(COLUMN_HORARIO_INICIO, rdoData.horarioInicio)
                        put(COLUMN_HORARIO_FIM, rdoData.horarioFim)
                        put(COLUMN_CLIMA, rdoData.clima)
                        put(COLUMN_TEMA_DDS, rdoData.temaDDS)
                        put(COLUMN_HOUVE_SERVICO, if (rdoData.houveServico) 1 else 0)
                        put(COLUMN_CAUSA_NAO_SERVICO, rdoData.causaNaoServico)
                        put(COLUMN_SERVICOS, gson.toJson(rdoData.servicos))
                        put(COLUMN_MATERIAIS, gson.toJson(rdoData.materiais))
                        put(COLUMN_EFETIVO, gson.toJson(rdoData.efetivo))
                        put(COLUMN_EQUIPAMENTOS, gson.toJson(rdoData.equipamentos))
                        put(COLUMN_HI_ITENS, gson.toJson(rdoData.hiItens))
                        put(COLUMN_HOUVE_TRANSPORTE, if (rdoData.houveTransporte) 1 else 0)
                        put(COLUMN_TRANSPORTES, gson.toJson(rdoData.transportes))
                        put(COLUMN_NOME_COLABORADORES, rdoData.nomeColaboradores)
                        put(COLUMN_OBSERVACOES, rdoData.observacoes)
                        put(COLUMN_SINCRONIZADO, 0)
                        put(COLUMN_SYNC_STATUS, SyncStatus.PENDING.toDbValue())
                    }

                    insertedId = insert(TABLE_RDO, null, values)

                    if (insertedId == -1L) {
                        throw IllegalStateException("Insert retornou -1")
                    }

                    Log.i(TAG, "RDO inserido com sucesso: ID=$insertedId, Número=$numeroRDO")
                    success = true
                }
                // ✅ FIX: Transação commitada aqui - agora podemos retornar o ID com segurança

                if (success && insertedId > 0) {
                    Log.d(TAG, "Transação commitada com sucesso para RDO ID=$insertedId")
                    return insertedId
                }

            } catch (e: SQLiteConstraintException) {
                // Colisão detectada! Número RDO duplicado
                Log.w(TAG, "Colisão detectada na tentativa ${attempt + 1}: ${e.message}")
                lastException = e
                attempt++

                // 🔥 FIX: Usar coroutine delay() ao invés de Thread.sleep()
                if (attempt < maxRetries) {
                    delay(10L * attempt) // 10ms, 20ms, 30ms... (backoff exponencial)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao inserir RDO: ${e.message}", e)
                throw e
            }
        }

        // Se chegou aqui, todas as tentativas falharam
        Log.e(TAG, "Falha ao inserir RDO após $maxRetries tentativas")
        throw IllegalStateException("Não foi possível gerar número único para RDO após $maxRetries tentativas", lastException)
    }

    fun obterTodosRDOs(): List<RDODataCompleto> {
        val rdos = mutableListOf<RDODataCompleto>()
        val db = readableDatabase
        val gson = Gson()

        // 🔥 FIX: Usar .use {} para auto-close
        db.query(TABLE_RDO, null, null, null, null, null, "$COLUMN_ID DESC").use { cursor ->
            while (cursor.moveToNext()) {
                try {
                    val rdo = extrairRDODoCursor(cursor, gson)
                    rdos.add(rdo)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
        return rdos
    }

    /**
     * ✅ PAGINAÇÃO: Obter RDOs com limite e offset
     * @param limit Quantidade de itens por página (padrão: 20)
     * @param offset Deslocamento inicial (padrão: 0)
     * @return Lista paginada de RDOs ordenada por ID descendente
     */
    fun obterRDOsPaginados(limit: Int = 20, offset: Int = 0): List<RDODataCompleto> {
        val rdos = mutableListOf<RDODataCompleto>()
        val db = readableDatabase
        val gson = Gson()

        db.query(
            TABLE_RDO,
            null,
            null,
            null,
            null,
            null,
            "$COLUMN_ID DESC",
            "$offset, $limit"  // SQLite LIMIT offset, limit
        ).use { cursor ->
            while (cursor.moveToNext()) {
                try {
                    val rdo = extrairRDODoCursor(cursor, gson)
                    rdos.add(rdo)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        Log.d(TAG, "📄 Paginação: Carregados ${rdos.size} RDOs (offset: $offset, limit: $limit)")
        return rdos
    }

    /**
     * ✅ Conta total de RDOs no banco
     */
    fun contarTotalRDOs(): Int {
        val db = readableDatabase
        db.rawQuery("SELECT COUNT(*) FROM $TABLE_RDO", null).use { cursor ->
            if (cursor.moveToFirst()) {
                return cursor.getInt(0)
            }
        }
        return 0
    }

    fun obterRDOsPorData(data: String): List<RDODataCompleto> {
        val rdos = mutableListOf<RDODataCompleto>()
        val db = readableDatabase
        val gson = Gson()

        // 🔥 FIX: Usar .use {} para auto-close
        db.query(
            TABLE_RDO,
            null,
            "$COLUMN_DATA = ?",
            arrayOf(data),
            null,
            null,
            "$COLUMN_ID DESC"
        ).use { cursor ->
            while (cursor.moveToNext()) {
                try {
                    val rdo = extrairRDODoCursor(cursor, gson)
                    rdos.add(rdo)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
        return rdos
    }

    fun obterRDOPorId(id: Long): RDODataCompleto? {
        val db = readableDatabase
        val gson = Gson()

        // 🔥 FIX: Usar .use {} para auto-close
        return db.query(
            TABLE_RDO,
            null,
            "$COLUMN_ID = ?",
            arrayOf(id.toString()),
            null,
            null,
            null
        ).use { cursor ->
            if (cursor.moveToFirst()) {
                try {
                    extrairRDODoCursor(cursor, gson)
                } catch (e: Exception) {
                    e.printStackTrace()
                    null
                }
            } else {
                null
            }
        }
    }

    internal fun extrairRDODoCursor(cursor: android.database.Cursor, gson: Gson): RDODataCompleto {
        val id = cursor.getLong(cursor.getColumnIndexOrThrow(COLUMN_ID))
        val numeroRDO = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_NUMERO_RDO)) ?: ""
        val data = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_DATA)) ?: ""
        val codigoTurma = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_CODIGO_TURMA)) ?: ""
        val encarregado = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_ENCARREGADO)) ?: ""
        val local = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_LOCAL)) ?: ""
        val numeroOS = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_NUMERO_OS)) ?: ""
        val statusOS = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_STATUS_OS)) ?: ""
        val kmInicio = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_KM_INICIO)) ?: ""
        val kmFim = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_KM_FIM)) ?: ""
        val horarioInicio = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_HORARIO_INICIO)) ?: ""
        val horarioFim = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_HORARIO_FIM)) ?: ""
        val temaDDS = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_TEMA_DDS)) ?: ""
        val clima = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_CLIMA)) ?: ""
        val houveServico = cursor.getInt(cursor.getColumnIndexOrThrow(COLUMN_HOUVE_SERVICO)) == 1
        val causaNaoServico = try {
            cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_CAUSA_NAO_SERVICO)) ?: ""
        } catch (e: Exception) { "" }
        val observacoes = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_OBSERVACOES)) ?: ""

        val nomeColaboradores = try {
            cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_NOME_COLABORADORES)) ?: ""
        } catch (e: Exception) {
            ""
        }

        val servicosJson = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_SERVICOS)) ?: "[]"
        val materiaisJson = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_MATERIAIS)) ?: "[]"
        val efetivoJson = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_EFETIVO)) ?: """{"encarregado":0,"operadores":0,"operadorEGP":0,"tecnicoSeguranca":0,"soldador":0,"motoristas":0}"""
        val equipamentosJson = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_EQUIPAMENTOS)) ?: "[]"
        val hiItensJson = cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_HI_ITENS)) ?: "[]"

        val houveTransporte = try {
            cursor.getInt(cursor.getColumnIndexOrThrow(COLUMN_HOUVE_TRANSPORTE)) == 1
        } catch (e: Exception) {
            false
        }
        val transportesJson = try {
            cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_TRANSPORTES)) ?: "[]"
        } catch (e: Exception) {
            "[]"
        }

        val servicosType = object : TypeToken<List<ServicoRDO>>() {}.type
        val materiaisType = object : TypeToken<List<MaterialRDO>>() {}.type
        val equipamentosType = object : TypeToken<List<Equipamento>>() {}.type
        val hiItensType = object : TypeToken<List<HIItem>>() {}.type
        val transportesType = object : TypeToken<List<TransporteItem>>() {}.type

        val servicos: List<ServicoRDO> = try {
            gson.fromJson(servicosJson, servicosType) ?: emptyList()
        } catch (e: Exception) {
            AppLogger.w(TAG, "JSON inválido em 'servicos' para RDO id=$id ($numeroRDO): ${e.message}")
            emptyList()
        }

        val materiais: List<MaterialRDO> = try {
            gson.fromJson(materiaisJson, materiaisType) ?: emptyList()
        } catch (e: Exception) {
            AppLogger.w(TAG, "JSON inválido em 'materiais' para RDO id=$id ($numeroRDO): ${e.message}")
            emptyList()
        }

        val efetivo: Efetivo = try {
            gson.fromJson(efetivoJson, Efetivo::class.java) ?: Efetivo(0, 0, 0, 0, 0, 0)
        } catch (e: Exception) {
            AppLogger.w(TAG, "JSON inválido em 'efetivo' para RDO id=$id ($numeroRDO): ${e.message}")
            Efetivo(0, 0, 0, 0, 0, 0)
        }

        val equipamentos: List<Equipamento> = try {
            gson.fromJson(equipamentosJson, equipamentosType) ?: emptyList()
        } catch (e: Exception) {
            AppLogger.w(TAG, "JSON inválido em 'equipamentos' para RDO id=$id ($numeroRDO): ${e.message}")
            emptyList()
        }

        val horasImprodutivas: List<HIItem> = try {
            gson.fromJson(hiItensJson, hiItensType) ?: emptyList()
        } catch (e: Exception) {
            AppLogger.w(TAG, "JSON inválido em 'hiItens' para RDO id=$id ($numeroRDO): ${e.message}")
            emptyList()
        }

        val transportes: List<TransporteItem> = try {
            gson.fromJson(transportesJson, transportesType) ?: emptyList()
        } catch (e: Exception) {
            AppLogger.w(TAG, "JSON inválido em 'transportes' para RDO id=$id ($numeroRDO): ${e.message}")
            emptyList()
        }

        // Novos campos de sincronização
        val syncStatus = try {
            cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_SYNC_STATUS)) ?: "pending"
        } catch (e: Exception) {
            "pending"
        }

        val ultimaTentativaSync = try {
            cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_ULTIMA_TENTATIVA_SYNC)) ?: ""
        } catch (e: Exception) {
            ""
        }

        val mensagemErroSync = try {
            cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_MENSAGEM_ERRO_SYNC)) ?: ""
        } catch (e: Exception) {
            ""
        }

        val tentativasSync = try {
            cursor.getInt(cursor.getColumnIndexOrThrow(COLUMN_TENTATIVAS_SYNC))
        } catch (e: Exception) {
            0
        }

        return RDODataCompleto(
            id = id,
            numeroRDO = numeroRDO,
            data = data,
            codigoTurma = codigoTurma,
            encarregado = encarregado,
            local = local,
            numeroOS = numeroOS,
            statusOS = statusOS,
            kmInicio = kmInicio,
            kmFim = kmFim,
            horarioInicio = horarioInicio,
            horarioFim = horarioFim,
            temaDDS = temaDDS,
            clima = clima,
            houveServico = houveServico,
            causaNaoServico = causaNaoServico,
            servicos = servicos,
            materiais = materiais,
            horasImprodutivas = horasImprodutivas,
            efetivo = efetivo,
            equipamentos = equipamentos,
            houveTransporte = houveTransporte,
            transportes = transportes,
            nomeColaboradores = nomeColaboradores,
            observacoes = observacoes,
            syncStatus = syncStatus,
            ultimaTentativaSync = ultimaTentativaSync,
            mensagemErroSync = mensagemErroSync,
            tentativasSync = tentativasSync
        )
    }

    /**
     * 🔥 REFATORADO: Atualiza RDO e retorna par (rowsUpdated, numeroRDOAntigo)
     * @return Pair<Int, String?> onde:
     *   - first = número de linhas atualizadas (0 ou 1)
     *   - second = numeroRDO antigo se mudou, null caso contrário
     */
    fun atualizarRDO(id: Long, rdoData: RDOData): Pair<Int, String?> {
        val db = writableDatabase
        val gson = Gson()

        try {
            Log.d(TAG, "Atualizando RDO ID: $id com data: ${rdoData.data}")

            // 🔥 FIX: Transação atômica garante consistência entre leitura e escrita
            return db.transaction {
                // 1. Ler numeroRDO, data E numeroOS originais
                val (numeroRDOOriginal, dataOriginal, numeroOSOriginal) = query(
                    TABLE_RDO,
                    arrayOf(COLUMN_NUMERO_RDO, COLUMN_DATA, COLUMN_NUMERO_OS),
                    "$COLUMN_ID = ?",
                    arrayOf(id.toString()),
                    null, null, null
                ).use { cursor ->
                    if (cursor.moveToFirst()) {
                        Triple(
                            cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_NUMERO_RDO)),
                            cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_DATA)),
                            cursor.getString(cursor.getColumnIndexOrThrow(COLUMN_NUMERO_OS))
                        )
                    } else {
                        Triple("", "", "")
                    }
                }

                if (numeroRDOOriginal.isEmpty()) {
                    Log.e(TAG, "Erro: RDO ID $id não encontrado no banco de dados")
                    Pair(0, null)
                } else {
                    // 2. Regenerar número RDO se a data OU numeroOS foram alterados
                    val numeroRDO = if (dataOriginal != rdoData.data || numeroOSOriginal != rdoData.numeroOS) {
                        Log.d(TAG, "Data ou OS alterados (Data: $dataOriginal → ${rdoData.data}, OS: $numeroOSOriginal → ${rdoData.numeroOS}). Gerando novo número...")

                        val novoNumero = gerarNumeroRDOExcluindoId(rdoData.numeroOS, rdoData.data, id)
                        Log.d(TAG, "Novo número gerado: $novoNumero (anterior: $numeroRDOOriginal)")

                        // Verificar duplicata dentro da transação
                        query(
                            TABLE_RDO,
                            arrayOf(COLUMN_ID),
                            "$COLUMN_NUMERO_RDO = ? AND $COLUMN_ID != ?",
                            arrayOf(novoNumero, id.toString()),
                            null, null, null
                        ).use { checkCursor ->
                            if (checkCursor.count > 0) {
                                Log.e(TAG, "ERRO: Número $novoNumero já existe mesmo excluindo ID $id")
                                throw IllegalStateException("Conflict: número RDO $novoNumero já existe")
                            }
                        }

                        novoNumero
                    } else {
                        Log.d(TAG, "Mantendo número RDO original: $numeroRDOOriginal")
                        numeroRDOOriginal
                    }

                    // 3. Atualizar dados
                    val values = ContentValues().apply {
                        put(COLUMN_NUMERO_RDO, numeroRDO)
                        put(COLUMN_DATA, rdoData.data)
                        put(COLUMN_CODIGO_TURMA, rdoData.codigoTurma)
                        put(COLUMN_ENCARREGADO, rdoData.encarregado)
                        put(COLUMN_LOCAL, rdoData.local)
                        put(COLUMN_NUMERO_OS, rdoData.numeroOS)
                        put(COLUMN_STATUS_OS, rdoData.statusOS)
                        put(COLUMN_KM_INICIO, rdoData.kmInicio)
                        put(COLUMN_KM_FIM, rdoData.kmFim)
                        put(COLUMN_HORARIO_INICIO, rdoData.horarioInicio)
                        put(COLUMN_HORARIO_FIM, rdoData.horarioFim)
                        put(COLUMN_CLIMA, rdoData.clima)
                        put(COLUMN_TEMA_DDS, rdoData.temaDDS)
                        put(COLUMN_HOUVE_SERVICO, if (rdoData.houveServico) 1 else 0)
                        put(COLUMN_CAUSA_NAO_SERVICO, rdoData.causaNaoServico)
                        put(COLUMN_SERVICOS, gson.toJson(rdoData.servicos))
                        put(COLUMN_MATERIAIS, gson.toJson(rdoData.materiais))
                        put(COLUMN_EFETIVO, gson.toJson(rdoData.efetivo))
                        put(COLUMN_EQUIPAMENTOS, gson.toJson(rdoData.equipamentos))
                        put(COLUMN_HI_ITENS, gson.toJson(rdoData.hiItens))
                        put(COLUMN_HOUVE_TRANSPORTE, if (rdoData.houveTransporte) 1 else 0)
                        put(COLUMN_TRANSPORTES, gson.toJson(rdoData.transportes))
                        put(COLUMN_NOME_COLABORADORES, rdoData.nomeColaboradores)
                        put(COLUMN_OBSERVACOES, rdoData.observacoes)
                        put(COLUMN_SINCRONIZADO, 0)
                        put(COLUMN_SYNC_STATUS, SyncStatus.PENDING.toDbValue())
                    }

                    val rowsUpdated = update(TABLE_RDO, values, "$COLUMN_ID = ?", arrayOf(id.toString()))

                    val numeroRDOAntigo = if (numeroRDO != numeroRDOOriginal) {
                        Log.i(TAG, "RDO ID $id atualizado com NOVO número RDO: $numeroRDOOriginal → $numeroRDO")
                        numeroRDOOriginal
                    } else {
                        Log.i(TAG, "RDO ID $id atualizado mantendo número RDO: $numeroRDO")
                        null
                    }

                    if (rowsUpdated == 0) {
                        Log.w(TAG, "Nenhuma linha atualizada para RDO ID $id")
                    }

                    Pair(rowsUpdated, numeroRDOAntigo)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao atualizar RDO ID $id: ${e.message}", e)
            throw e
        }
    }

    fun deletarRDO(id: Long): Int {
        val db = writableDatabase
        val deleted = db.delete(TABLE_RDO, "$COLUMN_ID = ?", arrayOf(id.toString()))
        if (deleted > 0) {
            Log.i(TAG, "RDO ID $id deletado com sucesso")
        } else {
            Log.w(TAG, "Tentativa de deletar RDO ID $id - não encontrado")
        }
        return deleted
    }

    fun limparTodosRDOs(): Int {
        val db = writableDatabase
        val pendentes = db.query(
            TABLE_RDO,
            arrayOf("COUNT(*) as total"),
            "$COLUMN_SINCRONIZADO = 0",
            null, null, null, null
        ).use { cursor ->
            if (cursor.moveToFirst()) cursor.getInt(0) else 0
        }

        if (pendentes > 0) {
            Log.w(TAG, "⚠️ Limpando banco com $pendentes RDOs não sincronizados!")
        }

        val total = db.delete(TABLE_RDO, null, null)
        Log.i(TAG, "Todos os RDOs removidos: $total registros")
        return total
    }

    fun marcarRDOComoSincronizado(id: Long): Boolean {
        val db = writableDatabase
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        val agora = sdf.format(Date())

        val values = ContentValues().apply {
            put(COLUMN_SINCRONIZADO, 1)
            put(COLUMN_SYNC_STATUS, SyncStatus.SYNCED.toDbValue())
            put(COLUMN_ULTIMA_TENTATIVA_SYNC, agora)
            put(COLUMN_MENSAGEM_ERRO_SYNC, "")
            put(COLUMN_TENTATIVAS_SYNC, 0)
        }
        val rowsAffected = db.update(TABLE_RDO, values, "$COLUMN_ID = ?", arrayOf(id.toString()))
        Log.i(TAG, "RDO $id marcado como sincronizado")
        return rowsAffected > 0
    }

    /**
     * Atualizar status de sincronização para SYNCING
     */
    fun marcarRDOComoSincronizando(id: Long): Boolean {
        val db = writableDatabase
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        val agora = sdf.format(Date())

        // 🔥 FIX Bug 3: Manter sincronizado=0 enquanto não confirmado
        val values = ContentValues().apply {
            put(COLUMN_SINCRONIZADO, 0)
            put(COLUMN_SYNC_STATUS, SyncStatus.SYNCING.toDbValue())
            put(COLUMN_ULTIMA_TENTATIVA_SYNC, agora)
        }
        val rowsAffected = db.update(TABLE_RDO, values, "$COLUMN_ID = ?", arrayOf(id.toString()))
        return rowsAffected > 0
    }

    /**
     * Marcar RDO com erro de sincronização
     */
    fun marcarRDOComErroSync(id: Long, mensagemErro: String): Boolean {
        val db = writableDatabase
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        val agora = sdf.format(Date())

        val tentativasAtuais = db.query(
            TABLE_RDO,
            arrayOf(COLUMN_TENTATIVAS_SYNC),
            "$COLUMN_ID = ?",
            arrayOf(id.toString()),
            null, null, null
        ).use { cursor ->
            if (cursor.moveToFirst()) cursor.getInt(0) else 0
        }

        val novasTentativas = tentativasAtuais + 1
        val status = if (novasTentativas >= 3) {
            SyncStatus.ERROR.toDbValue()
        } else {
            SyncStatus.RETRY.toDbValue()
        }

        // 🔥 FIX Bug 3: Manter sincronizado=0 em estado de erro
        val values = ContentValues().apply {
            put(COLUMN_SINCRONIZADO, 0)
            put(COLUMN_SYNC_STATUS, status)
            put(COLUMN_ULTIMA_TENTATIVA_SYNC, agora)
            put(COLUMN_MENSAGEM_ERRO_SYNC, mensagemErro)
            put(COLUMN_TENTATIVAS_SYNC, novasTentativas)
        }
        val rowsAffected = db.update(TABLE_RDO, values, "$COLUMN_ID = ?", arrayOf(id.toString()))
        Log.w(TAG, "RDO $id marcado com erro (tentativa $novasTentativas/3): $mensagemErro")
        return rowsAffected > 0
    }

    /**
     * Resetar status de erro para permitir nova tentativa
     */
    fun resetarErroSync(id: Long): Boolean {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_SYNC_STATUS, SyncStatus.PENDING.toDbValue())
            put(COLUMN_MENSAGEM_ERRO_SYNC, "")
            put(COLUMN_TENTATIVAS_SYNC, 0)
        }
        val rowsAffected = db.update(TABLE_RDO, values, "$COLUMN_ID = ?", arrayOf(id.toString()))
        Log.i(TAG, "Status de erro resetado para RDO $id")
        return rowsAffected > 0
    }

    /**
     * Obter contagem de RDOs por status
     */
    fun contarRDOsPorStatus(status: SyncStatus): Int {
        val db = readableDatabase
        // 🔥 FIX: Usar .use {} para auto-close
        return db.query(
            TABLE_RDO,
            arrayOf("COUNT(*) as total"),
            "$COLUMN_SYNC_STATUS = ?",
            arrayOf(status.toDbValue()),
            null, null, null
        ).use { cursor ->
            if (cursor.moveToFirst()) cursor.getInt(0) else 0
        }
    }

    fun obterRDOsNaoSincronizados(): List<RDODataCompleto> {
        val rdos = mutableListOf<RDODataCompleto>()
        val db = readableDatabase
        val gson = Gson()

        // Busca RDOs PENDING e RETRY, e ERROR somente se tentativas < 10
        db.query(
            TABLE_RDO,
            null,
            "($COLUMN_SYNC_STATUS IN (?, ?)) OR ($COLUMN_SYNC_STATUS = ? AND $COLUMN_TENTATIVAS_SYNC < 10)",
            arrayOf(
                SyncStatus.PENDING.toDbValue(),
                SyncStatus.RETRY.toDbValue(),
                SyncStatus.ERROR.toDbValue()
            ),
            null,
            null,
            "$COLUMN_ID ASC"
        ).use { cursor ->
            while (cursor.moveToNext()) {
                try {
                    val rdo = extrairRDODoCursor(cursor, gson)
                    rdos.add(rdo)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
        return rdos
    }

    /**
     * Verifica se RDO está sincronizado — checa AMBAS as flags para consistência.
     */
    fun isRDOSincronizado(id: Long): Boolean {
        val db = readableDatabase
        // 🔥 FIX Bug 3: Verificar AMBAS as flags (sincronizado + sync_status)
        return db.query(
            TABLE_RDO,
            arrayOf(COLUMN_SINCRONIZADO, COLUMN_SYNC_STATUS),
            "$COLUMN_ID = ?",
            arrayOf(id.toString()),
            null,
            null,
            null
        ).use { cursor ->
            if (cursor.moveToFirst()) {
                val sincronizado = cursor.getInt(0) == 1
                val statusSynced = cursor.getString(1) == SyncStatus.SYNCED.toDbValue()
                sincronizado && statusSynced
            } else {
                false
            }
        }
    }

    /**
     * 🔥 NOVO: Obter os últimos N RDOs marcados como sincronizados
     * Usado para validação se realmente estão no Google Sheets
     */
    fun obterRDOsSincronizadosRecentes(limite: Int = 10): List<RDODataCompleto> {
        val rdos = mutableListOf<RDODataCompleto>()
        val db = readableDatabase
        val gson = Gson()

        db.query(
            TABLE_RDO,
            null,
            "$COLUMN_SYNC_STATUS = ?",
            arrayOf(SyncStatus.SYNCED.toDbValue()),
            null,
            null,
            "$COLUMN_ULTIMA_TENTATIVA_SYNC DESC",
            limite.toString()
        ).use { cursor ->
            while (cursor.moveToNext()) {
                try {
                    val rdo = extrairRDODoCursor(cursor, gson)
                    rdos.add(rdo)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
        return rdos
    }

    /**
     * 🔥 NOVO: Marcar RDO como pendente (para re-sincronização)
     */
    fun marcarRDOComoPendente(id: Long) {
        val db = writableDatabase
        val valores = ContentValues().apply {
            put(COLUMN_SYNC_STATUS, SyncStatus.PENDING.toDbValue())
            put(COLUMN_SINCRONIZADO, 0)
            putNull(COLUMN_MENSAGEM_ERRO_SYNC)
        }
        db.update(TABLE_RDO, valores, "$COLUMN_ID = ?", arrayOf(id.toString()))
    }

    /**
     * 🔥 FIX Bug 4: Resetar RDOs presos em estado SYNCING há mais de 15 minutos.
     * Isso acontece quando o app crasha durante sync — o RDO fica em "syncing" para sempre.
     * @return Número de RDOs resetados
     */
    fun resetarRDOsPresos(): Int {
        val db = writableDatabase
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        val calendar = java.util.Calendar.getInstance()
        calendar.add(java.util.Calendar.MINUTE, -15)
        val quinzeMinAtras = sdf.format(calendar.time)

        val values = ContentValues().apply {
            put(COLUMN_SYNC_STATUS, SyncStatus.PENDING.toDbValue())
            put(COLUMN_SINCRONIZADO, 0)
        }

        val resetados = db.update(
            TABLE_RDO,
            values,
            "$COLUMN_SYNC_STATUS = ? AND $COLUMN_ULTIMA_TENTATIVA_SYNC < ?",
            arrayOf(SyncStatus.SYNCING.toDbValue(), quinzeMinAtras)
        )

        if (resetados > 0) {
            Log.w(TAG, "⚠️ $resetados RDO(s) presos em SYNCING resetados para PENDING")
        }
        return resetados
    }

    /**
     * 🔥 NOVO: Obter o último RDO criado (maior ID)
     */
    fun obterUltimoRDO(): RDODataCompleto? {
        val db = readableDatabase
        val gson = Gson()

        db.query(
            TABLE_RDO,
            null,
            null,
            null,
            null,
            null,
            "$COLUMN_ID DESC",
            "1"
        ).use { cursor ->
            return if (cursor.moveToFirst()) {
                extrairRDODoCursor(cursor, gson)
            } else {
                null
            }
        }
    }

    fun fecharDatabase() {
        try {
            close()
            INSTANCE = null
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
