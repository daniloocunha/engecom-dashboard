package com.example.calculadorahh.data.models

/**
 * Catálogo de justificativas de Horas Improdutivas, carregado de
 * `res/raw/justificativas_hi.json`.
 *
 * É a **fonte única de verdade** da classificação de HI: reclassificar uma
 * justificativa (ex.: mover "Treinamento" de Controlável para Neutro) é editar
 * o JSON — nenhuma regra de negócio no código muda.
 */
data class CatalogoJustificativasHI(
    val versao: Int = 1,
    val descricao: String = "",
    val categorias: List<CategoriaHI> = emptyList(),
    val justificativas: List<JustificativaHI> = emptyList()
)

/**
 * Categoria de uma justificativa (Controlável, Não Controlável, Neutro).
 */
data class CategoriaHI(
    val id: String = "",
    val nome: String = "",
    val descricao: String = "",
    val cor: String = "#757575",
    val ordem: Int = 0
) {
    companion object {
        const val NAO_CONTROLAVEL = "NAO_CONTROLAVEL"
        const val CONTROLAVEL = "CONTROLAVEL"
        const val NEUTRO = "NEUTRO"
    }
}

/**
 * Uma justificativa de HI.
 *
 * @param categoria id de uma [CategoriaHI].
 * @param considerarHI se as horas entram no total de Horas Improdutivas.
 *                     Falso para itens neutros (almoço, DDS, trânsito), que são
 *                     registrados apenas para compor a jornada e rastreabilidade.
 * @param considerarPerdaRumo se a ocorrência conta como perda atribuída à Rumo.
 * @param fatorHH multiplicador aplicado às HH do evento (ex.: Chuva = 0,5).
 * @param minutosMinimos duração mínima, em minutos, para o evento ser
 *                       contabilizado (ex.: trem abaixo de 20 min é descartado).
 * @param emoji ícone usado no app Android (renderiza sem drawable).
 * @param icone nome do ícone no padrão do dashboard web (lucide).
 * @param exigeDescricao se o lançamento obriga uma descrição livre (ex.: "Outros").
 * @param aliases nomes históricos que devem resolver para esta justificativa,
 *                garantindo que RDOs antigos continuem classificados corretamente.
 */
data class JustificativaHI(
    val id: String = "",
    val nome: String = "",
    val categoria: String = CategoriaHI.CONTROLAVEL,
    val considerarHI: Boolean = true,
    val considerarPerdaRumo: Boolean = true,
    val fatorHH: Double = 1.0,
    val minutosMinimos: Int = 0,
    val cor: String = "#757575",
    val icone: String = "",
    val emoji: String = "",
    val ordem: Int = 999,
    val ativa: Boolean = true,
    val exigeDescricao: Boolean = false,
    val aliases: List<String> = emptyList()
) {
    val ehNeutra: Boolean get() = categoria == CategoriaHI.NEUTRO
    val ehControlavel: Boolean get() = categoria == CategoriaHI.CONTROLAVEL
    val ehNaoControlavel: Boolean get() = categoria == CategoriaHI.NAO_CONTROLAVEL

    /** Rótulo com ícone, usado nos chips e nos cards do RDO. */
    val rotulo: String get() = if (emoji.isBlank()) nome else "$emoji $nome"
}
