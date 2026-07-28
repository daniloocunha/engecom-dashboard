package com.example.calculadorahh.domain.managers

import android.content.Context
import android.util.Log
import com.example.calculadorahh.R
import com.example.calculadorahh.data.models.CatalogoJustificativasHI
import com.example.calculadorahh.data.models.CategoriaHI
import com.example.calculadorahh.data.models.JustificativaHI
import com.google.gson.Gson
import java.io.InputStreamReader
import java.util.Locale

/**
 * Carrega e consulta o catálogo de justificativas de HI
 * (`res/raw/justificativas_hi.json`).
 *
 * As funções de consulta são **puras** (recebem o catálogo por parâmetro), o que
 * as torna testáveis na JVM sem `Context`. Só [carregar] toca em recursos Android.
 */
object JustificativasHIManager {

    private const val TAG = "JustificativasHI"
    private const val PREFS = "hi_justificativas"
    private const val KEY_RECENTES = "recentes"
    private const val MAX_RECENTES = 5

    @Volatile
    private var cache: CatalogoJustificativasHI? = null

    /** Catálogo completo, cacheado. Devolve um catálogo vazio em caso de erro. */
    fun carregar(context: Context): CatalogoJustificativasHI {
        cache?.let { return it }
        synchronized(this) {
            cache?.let { return it }
            val carregado = try {
                context.resources.openRawResource(R.raw.justificativas_hi).use { input ->
                    InputStreamReader(input).use { reader ->
                        Gson().fromJson(reader, CatalogoJustificativasHI::class.java)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao carregar justificativas_hi.json", e)
                CatalogoJustificativasHI()
            }
            cache = carregado
            Log.d(TAG, "Catálogo carregado: ${carregado.justificativas.size} justificativas")
            return carregado
        }
    }

    // ==================================================================
    // Consultas puras (testáveis sem Android)
    // ==================================================================

    /** Justificativas ativas, na ordem de exibição definida no catálogo. */
    fun ativas(catalogo: CatalogoJustificativasHI): List<JustificativaHI> =
        catalogo.justificativas.filter { it.ativa }.sortedBy { it.ordem }

    /** Justificativas ativas agrupadas por categoria, ambas na ordem do catálogo. */
    fun agrupadasPorCategoria(
        catalogo: CatalogoJustificativasHI
    ): List<Pair<CategoriaHI, List<JustificativaHI>>> {
        val porId = ativas(catalogo).groupBy { it.categoria }
        return catalogo.categorias
            .sortedBy { it.ordem }
            .mapNotNull { categoria ->
                val itens = porId[categoria.id].orEmpty()
                if (itens.isEmpty()) null else categoria to itens
            }
    }

    /** Normaliza texto para comparação: minúsculo, sem acento e sem pontuação. */
    fun normalizar(texto: String): String =
        java.text.Normalizer.normalize(texto.trim().lowercase(Locale.getDefault()), java.text.Normalizer.Form.NFD)
            .replace(Regex("[\\p{Mn}]"), "")
            .replace(Regex("[^a-z0-9]+"), " ")
            .trim()

    /**
     * Resolve o nome gravado num RDO para a justificativa do catálogo.
     *
     * Tenta, nesta ordem: id, nome exato, alias e nome normalizado (tolera
     * acento, caixa e pontuação). Devolve null se não houver correspondência —
     * o chamador decide o fallback.
     */
    fun resolver(catalogo: CatalogoJustificativasHI, nome: String): JustificativaHI? {
        if (nome.isBlank()) return null
        val todas = catalogo.justificativas
        todas.firstOrNull { it.id == nome }?.let { return it }
        todas.firstOrNull { it.nome == nome }?.let { return it }
        todas.firstOrNull { j -> j.aliases.any { it == nome } }?.let { return it }

        val alvo = normalizar(nome)
        if (alvo.isEmpty()) return null
        return todas.firstOrNull { j ->
            normalizar(j.nome) == alvo || j.aliases.any { normalizar(it) == alvo }
        }
    }

    /** true se a justificativa deve entrar no total de HI (neutros não entram). */
    fun considerarHI(catalogo: CatalogoJustificativasHI, nome: String): Boolean =
        resolver(catalogo, nome)?.considerarHI ?: true

    /** Filtra por texto digitado, casando nome, categoria e aliases. */
    fun filtrar(catalogo: CatalogoJustificativasHI, busca: String): List<JustificativaHI> {
        val termo = normalizar(busca)
        val ativas = ativas(catalogo)
        if (termo.isEmpty()) return ativas
        return ativas.filter { j ->
            normalizar(j.nome).contains(termo) ||
                normalizar(j.categoria).contains(termo) ||
                j.aliases.any { normalizar(it).contains(termo) }
        }
    }

    /**
     * HH do evento, já aplicando as regras do catálogo:
     * - eventos abaixo de [JustificativaHI.minutosMinimos] são descartados (0.0);
     * - justificativas neutras não geram HH de perda (0.0);
     * - o total é multiplicado por [JustificativaHI.fatorHH] (ex.: Chuva = 0,5).
     *
     * @param minutos duração do evento em minutos.
     * @param operadores colaboradores envolvidos.
     */
    fun calcularHH(justificativa: JustificativaHI?, minutos: Int, operadores: Int): Double {
        if (justificativa == null) return (minutos / 60.0) * operadores
        if (!justificativa.considerarHI) return 0.0
        if (minutos < justificativa.minutosMinimos) return 0.0
        return (minutos / 60.0) * operadores * justificativa.fatorHH
    }

    // ==================================================================
    // Recentes (persistidos por dispositivo)
    // ==================================================================

    /** Registra o uso de uma justificativa, alimentando a lista de recentes. */
    fun registrarUso(context: Context, id: String) {
        if (id.isBlank()) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val atuais = prefs.getString(KEY_RECENTES, "").orEmpty()
            .split(",").filter { it.isNotBlank() }
        val novos = (listOf(id) + atuais.filter { it != id }).take(MAX_RECENTES)
        prefs.edit().putString(KEY_RECENTES, novos.joinToString(",")).apply()
    }

    /** Justificativas usadas recentemente, da mais recente para a mais antiga. */
    fun recentes(context: Context, catalogo: CatalogoJustificativasHI): List<JustificativaHI> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return prefs.getString(KEY_RECENTES, "").orEmpty()
            .split(",")
            .filter { it.isNotBlank() }
            .mapNotNull { id -> catalogo.justificativas.firstOrNull { it.id == id && it.ativa } }
    }
}
