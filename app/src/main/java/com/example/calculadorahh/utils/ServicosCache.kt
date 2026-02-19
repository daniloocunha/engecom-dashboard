package com.example.calculadorahh.utils

import android.content.Context
import android.util.Log
import com.example.calculadorahh.R
import com.example.calculadorahh.data.models.Servico
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.InputStreamReader

/**
 * Cache Singleton para lista de serviços
 * Carrega servicos.json apenas uma vez na inicialização do app
 * Evita I/O repetido e melhora performance
 *
 * Uso:
 * ```kotlin
 * val servicos = ServicosCache.getInstance(context).getServicos()
 * ```
 */
class ServicosCache private constructor(context: Context) {

    private val servicosBase: List<Servico>

    init {
        servicosBase = carregarServicosDoRaw(context.applicationContext)
        Log.d(TAG, "✅ Cache inicializado com ${servicosBase.size} serviços")
    }

    companion object {
        private const val TAG = "ServicosCache"

        @Volatile
        private var INSTANCE: ServicosCache? = null

        /**
         * Obtém instância Singleton do cache
         * Thread-safe com double-checked locking
         */
        fun getInstance(context: Context): ServicosCache {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: ServicosCache(context.applicationContext).also {
                    INSTANCE = it
                }
            }
        }

        /**
         * Limpa o cache (útil para testes)
         * ATENÇÃO: Usar apenas em casos específicos
         */
        fun clearCache() {
            synchronized(this) {
                INSTANCE = null
                Log.d(TAG, "🗑️ Cache limpo")
            }
        }
    }

    /**
     * Retorna lista de serviços em cache
     * @return Lista imutável de serviços (sempre não-nula)
     */
    fun getServicos(): List<Servico> {
        return servicosBase
    }

    /**
     * Retorna número de serviços em cache
     */
    fun getCount(): Int {
        return servicosBase.size
    }

    /**
     * Busca serviço por descrição exata
     * @param descricao Descrição exata do serviço
     * @return Servico encontrado ou null
     */
    fun findByDescricao(descricao: String): Servico? {
        return servicosBase.find { it.descricao == descricao }
    }

    /**
     * Busca serviços que contenham o texto (case-insensitive)
     * @param query Texto a buscar
     * @return Lista de serviços que contêm o texto
     */
    fun search(query: String): List<Servico> {
        if (query.isBlank()) return servicosBase

        val queryLower = query.lowercase()
        return servicosBase.filter {
            it.descricao.lowercase().contains(queryLower)
        }
    }

    /**
     * Carrega serviços do arquivo raw/servicos.json
     * @param context Context da aplicação
     * @return Lista de serviços ou lista vazia em caso de erro
     */
    private fun carregarServicosDoRaw(context: Context): List<Servico> {
        return try {
            val inputStream = context.resources.openRawResource(R.raw.servicos)
            val reader = InputStreamReader(inputStream)
            val servicoListType = object : TypeToken<List<Servico>>() {}.type
            val servicos: List<Servico> = Gson().fromJson(reader, servicoListType)

            reader.close()
            inputStream.close()

            Log.d(TAG, "✅ Carregados ${servicos.size} serviços do raw/servicos.json")
            servicos

        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao carregar servicos.json", e)
            emptyList()
        }
    }
}
