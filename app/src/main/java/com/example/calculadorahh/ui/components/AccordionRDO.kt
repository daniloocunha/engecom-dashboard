package com.example.calculadorahh.ui.components

import android.animation.LayoutTransition
import android.content.Context
import android.graphics.Typeface
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import android.transition.AutoTransition
import android.transition.TransitionManager
import com.example.calculadorahh.R
import com.google.android.material.card.MaterialCardView

/**
 * Transforma os cards de seção do formulário de RDO em um accordion, seguindo
 * o redesign: cabeçalho com dot colorido + chevron, uma seção aberta por vez e
 * borda dourada na seção ativa.
 *
 * A conversão é feita em runtime a partir da estrutura já existente no XML
 * (`MaterialCardView > LinearLayout > [título, ...conteúdo]`), o que evita
 * reescrever as ~1.000 linhas de `fragment_rdo.xml` e, principalmente, evita
 * trocar os ids das views — todo o `RDOFragment` continua funcionando.
 *
 * O design desenhou só 5 das 11 seções do formulário; as demais recebem o mesmo
 * tratamento, com cores de dot seguindo a mesma paleta.
 */
class AccordionRDO(private val context: Context) {

    /** Uma seção convertida. */
    class Secao(
        val card: MaterialCardView,
        val titulo: String,
        val header: LinearLayout,
        val conteudo: LinearLayout,
        val chevron: ImageView,
        val label: TextView
    ) {
        val aberta: Boolean get() = conteudo.visibility == View.VISIBLE
    }

    private val secoes = mutableListOf<Secao>()

    /** Cores dos dots, na ordem das seções (ciclam se houver mais seções). */
    private val paletaDots = listOf(
        R.color.gold_primary,
        R.color.blue_accent,
        R.color.green_sync,
        R.color.purple_accent,
        R.color.amber_pending
    )

    /** Chamado sempre que uma seção abre/fecha ou o preenchimento muda. */
    var onProgressoAlterado: (() -> Unit)? = null

    /**
     * Converte todos os cards de seção filhos de [raiz].
     *
     * Cards cujo primeiro filho não é um título (ex.: o card de "Houve
     * Serviço", que é um controle) são apenas re-estilizados e permanecem
     * sempre visíveis.
     *
     * @param indiceInicialAberto seção que começa aberta.
     */
    fun aplicar(raiz: LinearLayout, indiceInicialAberto: Int = 0) {
        secoes.clear()
        var indiceCor = 0

        for (i in 0 until raiz.childCount) {
            val card = raiz.getChildAt(i) as? MaterialCardView ?: continue
            val inner = card.getChildAt(0) as? LinearLayout ?: continue

            estilizarCard(card)

            val titulo = inner.getChildAt(0) as? TextView
            if (titulo == null || titulo.text.isNullOrBlank()) {
                // Não é uma seção com título: mantém como está, só re-estilizado.
                continue
            }

            val secao = converter(card, inner, titulo, paletaDots[indiceCor % paletaDots.size])
            indiceCor++
            secoes.add(secao)
        }

        secoes.forEachIndexed { indice, secao ->
            definirAberta(secao, indice == indiceInicialAberto, animar = false)
        }
        onProgressoAlterado?.invoke()
    }

    private fun estilizarCard(card: MaterialCardView) {
        card.radius = dp(16).toFloat()
        card.cardElevation = 0f
        card.strokeWidth = dp(1)
        card.strokeColor = ContextCompat.getColor(context, R.color.border_default)
        card.setCardBackgroundColor(ContextCompat.getColor(context, R.color.bg_surface))
    }

    /** Extrai o título, monta o cabeçalho clicável e move o conteúdo. */
    private fun converter(
        card: MaterialCardView,
        inner: LinearLayout,
        titulo: TextView,
        corDot: Int
    ): Secao {
        val texto = titulo.text.toString()

        // O conteúdo passa a viver em um container próprio, que é o que
        // aparece/some ao expandir e recolher.
        val conteudo = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
            setPadding(dp(18), 0, dp(18), dp(18))
        }

        inner.removeView(titulo)
        while (inner.childCount > 0) {
            val filho = inner.getChildAt(0)
            inner.removeViewAt(0)
            conteudo.addView(filho)
        }

        inner.setPadding(0, 0, 0, 0)
        inner.layoutTransition = LayoutTransition().apply {
            enableTransitionType(LayoutTransition.CHANGING)
        }

        val header = criarHeader(texto, corDot)
        val chevron = header.getChildAt(2) as ImageView
        val label = header.getChildAt(1) as TextView

        inner.addView(header)
        inner.addView(conteudo)

        val secao = Secao(card, texto, header, conteudo, chevron, label)
        header.setOnClickListener { alternar(secao) }
        registrarMudancasDeTexto(conteudo)
        return secao
    }

    private fun criarHeader(texto: String, corDot: Int): LinearLayout {
        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            isClickable = true
            isFocusable = true
            setPadding(dp(18), dp(14), dp(18), dp(14))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val dot = View(context).apply {
            layoutParams = LinearLayout.LayoutParams(dp(5), dp(5)).apply {
                marginEnd = dp(10)
            }
            background = ContextCompat.getDrawable(context, R.drawable.bg_dot_secao)
            backgroundTintList =
                android.content.res.ColorStateList.valueOf(ContextCompat.getColor(context, corDot))
        }

        val label = TextView(context).apply {
            text = texto
            textSize = 11f
            isAllCaps = true
            letterSpacing = 0.09f
            setTypeface(typeface, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
            )
        }

        val chevron = ImageView(context).apply {
            layoutParams = LinearLayout.LayoutParams(dp(14), dp(14))
            setImageResource(R.drawable.ic_chevron_down)
            setColorFilter(ContextCompat.getColor(context, R.color.text_muted))
            contentDescription = "Expandir ou recolher seção"
        }

        header.addView(dot)
        header.addView(label)
        header.addView(chevron)
        // A cor do dot é reaproveitada no rótulo quando a seção está aberta.
        header.tag = corDot
        return header
    }

    /** Abre a seção tocada e fecha as demais (uma aberta por vez). */
    private fun alternar(secao: Secao) {
        val abrindo = !secao.aberta
        (secao.card.parent as? ViewGroup)?.let {
            TransitionManager.beginDelayedTransition(it, AutoTransition().setDuration(200))
        }
        for (outra in secoes) {
            definirAberta(outra, outra === secao && abrindo, animar = true)
        }
        onProgressoAlterado?.invoke()
    }

    private fun definirAberta(secao: Secao, aberta: Boolean, animar: Boolean) {
        secao.conteudo.visibility = if (aberta) View.VISIBLE else View.GONE
        secao.chevron.setImageResource(
            if (aberta) R.drawable.ic_chevron_up else R.drawable.ic_chevron_down
        )
        val corDot = secao.header.tag as? Int ?: R.color.gold_primary
        secao.label.setTextColor(
            ContextCompat.getColor(context, if (aberta) corDot else R.color.text_secondary)
        )
        secao.card.strokeColor = ContextCompat.getColor(
            context,
            if (aberta) R.color.gold_a22 else R.color.border_default
        )
    }

    /** Abre a seção cujo título contém [trecho] (usado ao apontar um erro). */
    fun abrirSecaoQueContem(trecho: String): Boolean {
        val alvo = secoes.firstOrNull {
            it.titulo.contains(trecho, ignoreCase = true)
        } ?: return false
        if (!alvo.aberta) alternar(alvo)
        return true
    }

    /** Abre a seção que contém [view], para que o usuário a enxergue. */
    fun abrirSecaoDe(view: View): Boolean {
        val alvo = secoes.firstOrNull { contem(it.conteudo, view) } ?: return false
        if (!alvo.aberta) alternar(alvo)
        return true
    }

    private fun contem(grupo: ViewGroup, view: View): Boolean {
        var atual: View? = view
        while (atual != null) {
            if (atual === grupo) return true
            atual = atual.parent as? View
        }
        return false
    }

    // ==================================================================
    // Progresso
    // ==================================================================

    /**
     * Seções consideradas preenchidas: as que têm ao menos um campo de texto
     * com conteúdo ou ao menos um item em suas listas dinâmicas.
     *
     * O protótipo trazia a barra fixa em "1 de 5 seções" — aqui ela reflete
     * o preenchimento real.
     */
    fun progresso(): Pair<Int, Int> {
        val preenchidas = secoes.count { temConteudo(it.conteudo) }
        return preenchidas to secoes.size
    }

    private fun temConteudo(grupo: ViewGroup): Boolean {
        for (i in 0 until grupo.childCount) {
            when (val filho = grupo.getChildAt(i)) {
                is EditText -> if (filho.text?.isNotBlank() == true) return true
                is ViewGroup -> {
                    // Containers de itens dinâmicos (serviços, HI, materiais...)
                    if (filho.id != View.NO_ID && filho.childCount > 0 &&
                        filho !is com.google.android.material.textfield.TextInputLayout &&
                        ehContainerDeItens(filho)
                    ) return true
                    if (temConteudo(filho)) return true
                }
            }
        }
        return false
    }

    /** Heurística: LinearLayout vertical sem padding que hospeda itens da lista. */
    private fun ehContainerDeItens(grupo: ViewGroup): Boolean =
        grupo is LinearLayout && grupo.orientation == LinearLayout.VERTICAL &&
            grupo.childCount > 0 && grupo.getChildAt(0) is MaterialCardView

    /** Recalcula o progresso sempre que um campo de texto muda. */
    private fun registrarMudancasDeTexto(grupo: ViewGroup) {
        for (i in 0 until grupo.childCount) {
            when (val filho = grupo.getChildAt(i)) {
                is EditText -> filho.addTextChangedListener(
                    object : android.text.TextWatcher {
                        override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                        override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                        override fun afterTextChanged(s: android.text.Editable?) {
                            onProgressoAlterado?.invoke()
                        }
                    }
                )
                is ViewGroup -> registrarMudancasDeTexto(filho)
            }
        }
    }

    private fun dp(valor: Int): Int =
        (valor * context.resources.displayMetrics.density).toInt()
}
