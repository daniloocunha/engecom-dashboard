package com.example.calculadorahh.ui.activities

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.data.models.ChecklistPreenchido
import com.example.calculadorahh.data.models.ChecklistTemplate
import com.example.calculadorahh.data.models.ItemTemplate
import com.example.calculadorahh.data.models.RespostaItem
import com.example.calculadorahh.data.models.SecaoTemplate
import com.example.calculadorahh.databinding.ActivityChecklistInspecaoBinding
import com.example.calculadorahh.domain.managers.ChecklistManager
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout

/**
 * Tela de autoinspeção de qualidade, espelhando o formulário de auditoria da
 * RUMO. Renderiza dinamicamente o template (res/raw/checklist_<tipo>.json) e
 * calcula em tempo real o veredito (Aprovada/Reprovada).
 *
 * Extras esperados:
 * - EXTRA_TIPO (padrão "solda")
 * - EXTRA_NUMERO_RDO, EXTRA_NUMERO_OS, EXTRA_DATA, EXTRA_ENCARREGADO, EXTRA_LOCAL
 */
class ChecklistInspecaoActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_TIPO = "checklist_tipo"
        const val EXTRA_NUMERO_RDO = "checklist_numero_rdo"
        const val EXTRA_NUMERO_OS = "checklist_numero_os"
        const val EXTRA_DATA = "checklist_data"
        const val EXTRA_ENCARREGADO = "checklist_encarregado"
        const val EXTRA_LOCAL = "checklist_local"

        private const val MAX_SOLDAS = 30
    }

    private lateinit var binding: ActivityChecklistInspecaoBinding
    private lateinit var db: DatabaseHelper
    private lateinit var template: ChecklistTemplate

    private lateinit var preenchido: ChecklistPreenchido

    /** Container que hospeda as soldas de uma seção de repetição (re-renderizado). */
    private var containerRepeticao: LinearLayout? = null
    private var secaoRepeticao: SecaoTemplate? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityChecklistInspecaoBinding.inflate(layoutInflater)
        setContentView(binding.root)

        db = DatabaseHelper.getInstance(this)

        val tipo = intent.getStringExtra(EXTRA_TIPO) ?: "solda"
        val carregado = ChecklistManager.carregarTemplate(this, tipo)
        if (carregado == null) {
            Toast.makeText(this, "Checklist indisponível para este tipo", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        template = carregado

        val numeroRDO = intent.getStringExtra(EXTRA_NUMERO_RDO) ?: ""

        // Carrega checklist existente ou cria um novo a partir dos dados do RDO
        preenchido = db.obterChecklist(numeroRDO, tipo) ?: ChecklistPreenchido(
            tipo = tipo,
            numeroRDO = numeroRDO,
            numeroOS = intent.getStringExtra(EXTRA_NUMERO_OS) ?: "",
            data = intent.getStringExtra(EXTRA_DATA) ?: "",
            encarregado = intent.getStringExtra(EXTRA_ENCARREGADO) ?: "",
            local = intent.getStringExtra(EXTRA_LOCAL) ?: "",
            qtdSoldas = 1
        )

        binding.toolbar.title = template.titulo
        binding.toolbar.setNavigationOnClickListener { finish() }

        // Quando há um RDO vinculado, mostra-o como contexto (não editável).
        if (preenchido.numeroRDO.isNotBlank()) {
            binding.txtCabecalho.text = "RDO ${preenchido.numeroRDO}"
        } else {
            binding.txtCabecalho.visibility = View.GONE
        }

        renderizarIdentificacao()
        renderizarSecoes()
        atualizarVeredito()

        binding.fabSalvar.setOnClickListener { salvar() }
    }

    /**
     * Seção de identificação editável (O.S, encarregado, data, local).
     * Preenchida a partir do RDO quando aberto por ele; digitável quando
     * aberto avulso pela tela inicial.
     */
    private fun renderizarIdentificacao() {
        val card = novoCard()
        val col = card.getChildAt(0) as LinearLayout
        col.addView(tituloSecao("Identificação"))

        col.addView(campoTexto("Número da O.S", preenchido.numeroOS) { texto ->
            preenchido = preenchido.copy(numeroOS = texto)
        })
        col.addView(campoTexto("Encarregado", preenchido.encarregado) { texto ->
            preenchido = preenchido.copy(encarregado = texto)
        })
        col.addView(campoTexto("Data (dd/MM/aaaa)", preenchido.data) { texto ->
            preenchido = preenchido.copy(data = texto)
        })
        col.addView(campoTexto("Local", preenchido.local) { texto ->
            preenchido = preenchido.copy(local = texto)
        })

        binding.containerSecoes.addView(card)
    }

    /** Campo de texto rotulado que devolve o valor digitado via [onChange]. */
    private fun campoTexto(rotulo: String, valor: String, onChange: (String) -> Unit): View {
        val til = TextInputLayout(this).apply {
            hint = rotulo
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(8) }
        }
        val edit = TextInputEditText(til.context).apply {
            setText(valor)
            setSingleLine(true)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    onChange(s?.toString()?.trim() ?: "")
                }
            })
        }
        til.addView(edit)
        return til
    }

    // ==================================================================
    // Renderização dinâmica
    // ==================================================================

    private fun renderizarSecoes() {
        binding.containerSecoes.removeAllViews()
        for (secao in template.secoes) {
            if (secao.isRepeticao) {
                renderizarSecaoRepeticao(secao)
            } else {
                renderizarSecaoGeral(secao)
            }
        }
    }

    private fun renderizarSecaoGeral(secao: SecaoTemplate) {
        val card = novoCard()
        val col = card.getChildAt(0) as LinearLayout
        col.addView(tituloSecao(secao.titulo))
        for (item in secao.itens) {
            val chave = ChecklistPreenchido.chaveResposta(secao.id, item.id)
            col.addView(blocoItem(item, chave))
        }
        binding.containerSecoes.addView(card)
    }

    private fun renderizarSecaoRepeticao(secao: SecaoTemplate) {
        secaoRepeticao = secao

        // Cabeçalho da seção + controle de quantidade
        val card = novoCard()
        val col = card.getChildAt(0) as LinearLayout
        col.addView(tituloSecao(secao.titulo))

        val linha = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(4) }
        }
        linha.addView(TextView(this).apply {
            text = "Quantidade de ${secao.rotuloItem.lowercase()}s:"
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        })
        val btnMenos = botaoQtd("–")
        val txtQtd = TextView(this).apply {
            text = preenchido.qtdSoldas.toString()
            textSize = 18f
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(dp(48), ViewGroup.LayoutParams.WRAP_CONTENT)
        }
        val btnMais = botaoQtd("+")
        btnMenos.setOnClickListener {
            if (preenchido.qtdSoldas > 1) {
                preenchido = preenchido.copy(qtdSoldas = preenchido.qtdSoldas - 1)
                txtQtd.text = preenchido.qtdSoldas.toString()
                renderizarItensRepeticao()
                atualizarVeredito()
            }
        }
        btnMais.setOnClickListener {
            if (preenchido.qtdSoldas < MAX_SOLDAS) {
                preenchido = preenchido.copy(qtdSoldas = preenchido.qtdSoldas + 1)
                txtQtd.text = preenchido.qtdSoldas.toString()
                renderizarItensRepeticao()
                atualizarVeredito()
            }
        }
        linha.addView(btnMenos)
        linha.addView(txtQtd)
        linha.addView(btnMais)
        col.addView(linha)
        binding.containerSecoes.addView(card)

        // Container das soldas
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        containerRepeticao = container
        binding.containerSecoes.addView(container)
        renderizarItensRepeticao()
    }

    private fun renderizarItensRepeticao() {
        val secao = secaoRepeticao ?: return
        val container = containerRepeticao ?: return
        container.removeAllViews()
        for (index in 0 until preenchido.qtdSoldas) {
            val card = novoCard()
            val col = card.getChildAt(0) as LinearLayout
            col.addView(tituloSecao("${secao.rotuloItem} #${index + 1}"))
            for (item in secao.itens) {
                val chave = ChecklistPreenchido.chaveResposta(secao.id, index, item.id)
                col.addView(blocoItem(item, chave))
            }
            container.addView(card)
        }
    }

    /** Bloco de uma pergunta: enunciado + opções (radio) + observação opcional. */
    private fun blocoItem(item: ItemTemplate, chave: String): View {
        val bloco = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(12) }
        }

        // Enunciado (marca item crítico)
        val enunciado = TextView(this).apply {
            text = if (item.critico) "⚠ ${item.pergunta}  (ITEM CRÍTICO)" else item.pergunta
            setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
            if (item.critico) setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        bloco.addView(enunciado)

        // Opções
        val valorAtual = preenchido.resposta(chave).valor
        val grupo = RadioGroup(this).apply {
            orientation = RadioGroup.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(2) }
        }
        item.opcoesEfetivas().forEachIndexed { i, valor ->
            val rb = RadioButton(this).apply {
                id = View.generateViewId()
                text = rotuloCurto(valor)
                tag = valor
                isChecked = valor == valorAtual
                layoutParams = RadioGroup.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { if (i > 0) marginStart = dp(8) }
            }
            grupo.addView(rb)
        }
        grupo.setOnCheckedChangeListener { _, checkedId ->
            val rb = grupo.findViewById<RadioButton>(checkedId)
            val valor = rb?.tag as? String ?: ""
            setResposta(chave) { it.copy(valor = valor) }
            atualizarVeredito()
        }
        bloco.addView(grupo)

        // Observação opcional
        if (item.observacao) {
            val til = TextInputLayout(this).apply {
                hint = "Observação"
                boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(4) }
            }
            val edit = TextInputEditText(til.context).apply {
                setText(preenchido.resposta(chave).observacao)
                addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                    override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                    override fun afterTextChanged(s: Editable?) {
                        setResposta(chave) { it.copy(observacao = s?.toString() ?: "") }
                    }
                })
            }
            til.addView(edit)
            bloco.addView(til)
        }

        return bloco
    }

    // ==================================================================
    // Estado e veredito
    // ==================================================================

    private inline fun setResposta(chave: String, transform: (RespostaItem) -> RespostaItem) {
        val atual = preenchido.resposta(chave)
        preenchido = ChecklistManager.comResposta(preenchido, chave, transform(atual))
    }

    private fun atualizarVeredito() {
        preenchido = ChecklistManager.avaliar(template, preenchido)
        val aprovada = preenchido.situacao == ChecklistPreenchido.SITUACAO_APROVADA

        val corBg: Int
        val corTxt: Int
        if (aprovada) {
            corBg = 0xFFE6F4EA.toInt(); corTxt = 0xFF1E7E34.toInt()
        } else {
            corBg = 0xFFFDECEA.toInt(); corTxt = 0xFFC62828.toInt()
        }
        binding.cardVeredito.setCardBackgroundColor(corBg)
        binding.txtVeredito.setTextColor(corTxt)
        binding.txtVeredito.text = if (aprovada) "✅ Aprovada" else "❌ Reprovada"

        val detalhe = StringBuilder()
        detalhe.append(
            when (preenchido.naoConformidades) {
                0 -> "Nenhuma não conformidade"
                1 -> "1 não conformidade"
                else -> "${preenchido.naoConformidades} não conformidades"
            }
        )
        if (preenchido.itensCriticosReprovados > 0) {
            detalhe.append(" · ${preenchido.itensCriticosReprovados} crítico(s)")
        }
        binding.txtVeredictoDetalhe.setTextColor(corTxt)
        binding.txtVeredictoDetalhe.text = detalhe.toString()
    }

    private fun salvar() {
        // Sem RDO vinculado, a O.S é a chave do registro — obrigatória.
        if (preenchido.numeroRDO.isBlank() && preenchido.numeroOS.isBlank()) {
            Toast.makeText(this, "Informe o número da O.S", Toast.LENGTH_LONG).show()
            return
        }
        atualizarVeredito()
        val id = db.salvarChecklist(preenchido)
        if (id > 0) {
            Toast.makeText(
                this,
                "Checklist salvo — situação: ${preenchido.situacao}",
                Toast.LENGTH_LONG
            ).show()
            finish()
        } else {
            Toast.makeText(this, "Erro ao salvar o checklist", Toast.LENGTH_LONG).show()
        }
    }

    // ==================================================================
    // Helpers de UI
    // ==================================================================

    private fun rotuloCurto(valor: String): String =
        if (valor == "Não Aplicável") "N/A" else valor

    private fun tituloSecao(texto: String): TextView = TextView(this).apply {
        text = texto
        setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleMedium)
        setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    private fun novoCard(): MaterialCardView {
        val card = MaterialCardView(this).apply {
            radius = dp(12).toFloat()
            cardElevation = 0f
            strokeWidth = dp(1)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(8) }
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        card.addView(col)
        return card
    }

    private fun botaoQtd(texto: String): TextView = TextView(this).apply {
        text = texto
        textSize = 22f
        gravity = Gravity.CENTER
        setTextColor(0xFF2196F3.toInt())
        layoutParams = LinearLayout.LayoutParams(dp(40), dp(40))
        isClickable = true
        isFocusable = true
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()
}
