package com.example.calculadorahh.data.models

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

// ==========================================================================
// TEMPLATE — estrutura carregada de res/raw/checklist_*.json
// (Fonte única de verdade das perguntas, espelhando o formulário da RUMO.)
// ==========================================================================

/**
 * Template completo de um checklist de inspeção (ex.: solda, dormente).
 */
data class ChecklistTemplate(
    val id: String = "",
    val titulo: String = "",
    val formulario: String = "",
    val descricao: String = "",
    val secoes: List<SecaoTemplate> = emptyList()
)

/**
 * Seção do template.
 *
 * @param tipo "geral" (perguntas únicas) ou "repeticao" (repetido N vezes,
 *             ex.: uma vez por solda).
 * @param rotuloItem prefixo usado na UI quando [tipo] = "repeticao" (ex.: "Solda").
 */
data class SecaoTemplate(
    val id: String = "",
    val titulo: String = "",
    val tipo: String = "geral",
    val rotuloItem: String = "",
    val itens: List<ItemTemplate> = emptyList()
) {
    val isRepeticao: Boolean get() = tipo == "repeticao"
}

/**
 * Uma pergunta do checklist.
 *
 * @param tipo "sim_nao", "sim_nao_na", "opcoes" ou "foto" (somente fotos, sem
 *             opções de resposta — ex.: "Fotos das medidas de qualidade").
 * @param opcoes opções quando [tipo] = "opcoes".
 * @param critico item crítico — se não conforme, reprova automaticamente.
 * @param naoConforme resposta que caracteriza não conformidade. Em branco,
 *                    o item é apenas informativo e nunca reprova.
 * @param observacao se a pergunta aceita campo de observação.
 * @param observacaoObrigatoriaQuando valor de resposta que torna a observação
 *                                    obrigatória mesmo sem não conformidade
 *                                    (ex.: ressalva = "Sim").
 * @param foto se a pergunta aceita anexar fotos (espelha os campos "Fotos"
 *             do formulário da RUMO).
 * @param fotoObrigatoria se ao menos uma foto é exigida para salvar.
 */
data class ItemTemplate(
    val id: String = "",
    val pergunta: String = "",
    val tipo: String = "sim_nao",
    val opcoes: List<String> = emptyList(),
    val critico: Boolean = false,
    val naoConforme: String = "",
    val observacao: Boolean = false,
    val observacaoObrigatoriaQuando: String = "",
    val foto: Boolean = false,
    val fotoObrigatoria: Boolean = false
) {
    val isSomenteFoto: Boolean get() = tipo == "foto"

    /** Opções apresentadas ao usuário conforme o tipo. */
    fun opcoesEfetivas(): List<String> = when (tipo) {
        "sim_nao" -> listOf("Sim", "Não")
        "sim_nao_na" -> listOf("Sim", "Não", "Não Aplicável")
        "opcoes" -> opcoes
        "foto" -> emptyList()
        else -> listOf("Sim", "Não")
    }

    /**
     * true se [valor] é uma não conformidade para este item.
     * Itens sem [naoConforme] declarado são informativos; "Não Aplicável" e
     * resposta em branco nunca contam como não conformidade.
     */
    fun ehNaoConforme(valor: String): Boolean {
        if (naoConforme.isBlank()) return false
        if (valor.isBlank() || valor == "Não Aplicável") return false
        return valor.equals(naoConforme, ignoreCase = true)
    }
}

// ==========================================================================
// PREENCHIDO — respostas do usuário, serializado em JSON no SQLite.
// ==========================================================================

/**
 * Resposta de uma pergunta.
 *
 * @param fotos caminhos absolutos (storage interno do app) das fotos anexadas.
 */
@Parcelize
data class RespostaItem(
    val valor: String = "",
    val observacao: String = "",
    val fotos: List<String> = emptyList()
) : Parcelable

/**
 * Checklist preenchido, vinculado a um RDO/O.S.
 *
 * As respostas são guardadas num mapa plano. A chave é [chaveResposta]:
 * - seções "geral": "<secaoId>__<itemId>"
 * - seções "repeticao": "<secaoId>__<index>__<itemId>"
 */
@Parcelize
data class ChecklistPreenchido(
    val tipo: String = "solda",
    val numeroRDO: String = "",
    val numeroOS: String = "",
    val data: String = "",
    val encarregado: String = "",
    val encarregadoCodigo: String = "",
    val lider: String = "",
    val liderCodigo: String = "",
    val local: String = "",
    val qtdSoldas: Int = 1,
    val respostas: Map<String, RespostaItem> = emptyMap(),
    val situacao: String = "",
    val naoConformidades: Int = 0,
    val itensCriticosReprovados: Int = 0,
    val observacoesGerais: String = "",
    val dataCriacao: String = ""
) : Parcelable {

    companion object {
        const val SITUACAO_APROVADA = "Aprovada"
        const val SITUACAO_REPROVADA = "Reprovada"

        /** Monta a chave de resposta para uma seção geral. */
        fun chaveResposta(secaoId: String, itemId: String): String =
            "${secaoId}__${itemId}"

        /** Monta a chave de resposta para um item repetido (por índice). */
        fun chaveResposta(secaoId: String, index: Int, itemId: String): String =
            "${secaoId}__${index}__${itemId}"
    }

    fun resposta(chave: String): RespostaItem = respostas[chave] ?: RespostaItem()
}
