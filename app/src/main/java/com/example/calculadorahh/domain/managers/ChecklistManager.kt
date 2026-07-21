package com.example.calculadorahh.domain.managers

import android.content.Context
import android.util.Log
import com.example.calculadorahh.R
import com.example.calculadorahh.data.models.ChecklistPreenchido
import com.example.calculadorahh.data.models.ChecklistTemplate
import com.example.calculadorahh.data.models.RespostaItem
import com.google.gson.Gson
import java.io.InputStreamReader

/**
 * Carrega templates de checklist de inspeção (res/raw/checklist_*.json) e
 * calcula o veredito (Aprovada/Reprovada) a partir das respostas.
 *
 * Fonte única de verdade das perguntas — espelha o formulário de auditoria
 * da RUMO. Novos tipos de atividade (dormente, etc.) são adicionados apenas
 * criando um novo JSON e registrando-o em [rawPorTipo].
 */
object ChecklistManager {

    private const val TAG = "ChecklistManager"

    /** Palavras que identificam um serviço de solda no RDO. */
    private val TERMOS_SOLDA = listOf("solda", "soldado", "aluminot")

    private val cache = mutableMapOf<String, ChecklistTemplate>()

    private fun rawPorTipo(tipo: String): Int? = when (tipo) {
        "solda" -> R.raw.checklist_solda
        else -> null
    }

    /**
     * Retorna o template do [tipo] indicado, ou null se inexistente.
     * O resultado é cacheado por tipo.
     */
    fun carregarTemplate(context: Context, tipo: String): ChecklistTemplate? {
        cache[tipo]?.let { return it }
        val rawId = rawPorTipo(tipo) ?: return null
        return try {
            context.resources.openRawResource(rawId).use { input ->
                InputStreamReader(input).use { reader ->
                    Gson().fromJson(reader, ChecklistTemplate::class.java).also {
                        cache[tipo] = it
                        Log.d(TAG, "Template '$tipo' carregado: ${it.secoes.size} seções")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao carregar checklist_$tipo.json", e)
            null
        }
    }

    /** true se a descrição do serviço indica um serviço de solda. */
    fun ehServicoSolda(descricao: String): Boolean {
        val d = descricao.lowercase()
        return TERMOS_SOLDA.any { d.contains(it) }
    }

    /**
     * Recalcula situação e contadores a partir das respostas atuais.
     * Reprova se houver qualquer item crítico não conforme OU qualquer
     * não conformidade nos itens técnicos por solda.
     */
    fun avaliar(
        template: ChecklistTemplate,
        preenchido: ChecklistPreenchido
    ): ChecklistPreenchido {
        var naoConformidades = 0
        var criticosReprovados = 0

        for (secao in template.secoes) {
            if (secao.isRepeticao) {
                for (index in 0 until preenchido.qtdSoldas) {
                    for (item in secao.itens) {
                        val chave = ChecklistPreenchido.chaveResposta(secao.id, index, item.id)
                        val valor = preenchido.resposta(chave).valor
                        if (item.ehNaoConforme(valor)) {
                            naoConformidades++
                            if (item.critico) criticosReprovados++
                        }
                    }
                }
            } else {
                for (item in secao.itens) {
                    val chave = ChecklistPreenchido.chaveResposta(secao.id, item.id)
                    val valor = preenchido.resposta(chave).valor
                    if (item.ehNaoConforme(valor)) {
                        naoConformidades++
                        if (item.critico) criticosReprovados++
                    }
                }
            }
        }

        val situacao = if (naoConformidades > 0)
            ChecklistPreenchido.SITUACAO_REPROVADA
        else
            ChecklistPreenchido.SITUACAO_APROVADA

        return preenchido.copy(
            naoConformidades = naoConformidades,
            itensCriticosReprovados = criticosReprovados,
            situacao = situacao
        )
    }

    /** Atalho para atualizar uma resposta imutavelmente dentro do mapa. */
    fun comResposta(
        preenchido: ChecklistPreenchido,
        chave: String,
        resposta: RespostaItem
    ): ChecklistPreenchido {
        val novo = preenchido.respostas.toMutableMap()
        novo[chave] = resposta
        return preenchido.copy(respostas = novo)
    }
}
