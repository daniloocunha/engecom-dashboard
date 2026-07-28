package com.example.calculadorahh.domain.managers

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import com.example.calculadorahh.data.models.CatalogoJustificativasHI
import com.example.calculadorahh.data.models.CategoriaHI
import com.example.calculadorahh.data.models.HIItem
import com.example.calculadorahh.data.models.JustificativaHI
import com.example.calculadorahh.R
import com.example.calculadorahh.utils.TimeInputMask
import com.example.calculadorahh.utils.TimeValidator
import com.example.calculadorahh.utils.ValidationHelper
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup

/**
 * Gerencia a lista dinâmica de Horas Improdutivas no formulário RDO.
 *
 * O lançamento usa o catálogo de justificativas
 * (`res/raw/justificativas_hi.json`) e é feito em um clique: chips agrupados por
 * categoria (Não Controlável / Controlável / Neutro), com busca rápida e
 * justificativas usadas recentemente no topo.
 */
class HIManager(
    context: Context,
    layoutInflater: LayoutInflater,
    containerView: LinearLayout,
    /** Linha de resumo (HI x neutras) exibida abaixo da lista. Opcional. */
    private val resumoView: TextView? = null
) : BaseItemManager<HIItem>(context, layoutInflater, containerView) {

    private val catalogo: CatalogoJustificativasHI by lazy {
        JustificativasHIManager.carregar(context)
    }

    /**
     * Retorna lista de HI adicionados (alias para compatibilidade)
     */
    fun getHorasImprodutivas(): List<HIItem> = getItens()

    /**
     * Total de HH improdutivas do RDO, já aplicando as regras do catálogo
     * (neutros não contam; Chuva conta metade; trem abaixo do mínimo é
     * descartado).
     */
    fun getTotalHHImprodutivas(): Double = getItens().sumOf { hhDe(it, apenasNeutras = false) }

    /**
     * Total de HH das justificativas neutras (almoço, DDS, trânsito). Compõem a
     * jornada, mas não são perda — por isso ficam fora de [getTotalHHImprodutivas].
     */
    fun getTotalHHNeutras(): Double = getItens().sumOf { hhDe(it, apenasNeutras = true) }

    /** HH de um lançamento, conforme as regras do catálogo. */
    private fun hhDe(hi: HIItem, apenasNeutras: Boolean): Double {
        val justificativa = JustificativasHIManager.resolver(catalogo, hi.tipo)
        if (justificativa?.ehNeutra != apenasNeutras) return 0.0
        val horas = TimeValidator.calcularDiferencaHoras(hi.horaInicio, hi.horaFim) ?: 0.0
        val operadores = if (hi.colaboradores > 0) hi.colaboradores else OPERADORES_PADRAO
        val minutos = Math.round(horas * 60).toInt()
        // Neutras não geram HH de perda no catálogo; aqui queremos a jornada.
        return if (apenasNeutras) (minutos / 60.0) * operadores
        else JustificativasHIManager.calcularHH(justificativa, minutos, operadores)
    }

    /** Atualiza a linha de resumo abaixo da lista de HI. */
    override fun onListaAlterada() {
        val view = resumoView ?: return
        if (getItens().isEmpty()) {
            view.visibility = View.GONE
            return
        }
        val hh = getTotalHHImprodutivas()
        val neutras = getTotalHHNeutras()
        val texto = StringBuilder("Total: ${formatarHH(hh)} HH improdutivas")
        if (neutras > 0) {
            texto.append(" · ${formatarHH(neutras)} HH neutras (não contam)")
        }
        view.text = texto.toString()
        view.visibility = View.VISIBLE
    }

    private fun formatarHH(valor: Double): String =
        String.format(java.util.Locale.getDefault(), "%.1f", valor)

    override fun mostrarDialogAdicionar() = mostrarDialog(null, null)

    override fun mostrarDialogEditar(hiAtual: HIItem, itemViewAtual: View) =
        mostrarDialog(hiAtual, itemViewAtual)

    /**
     * Dialog único de lançamento/edição de HI.
     *
     * @param hiAtual null para adicionar; preenchido para editar.
     */
    @SuppressLint("SetTextI18n")
    private fun mostrarDialog(hiAtual: HIItem?, itemViewAtual: View?) {
        val editando = hiAtual != null
        val dialogView = layoutInflater.inflate(R.layout.dialog_adicionar_hi_rdo, null)
        val dialog = AlertDialog.Builder(context)
            .setView(dialogView)
            .create()

        val tvTitulo = dialogView.findViewById<TextView>(R.id.tvTituloHI)
        val etBusca = dialogView.findViewById<EditText>(R.id.etBuscaHI)
        val tvLabelRecentes = dialogView.findViewById<TextView>(R.id.tvLabelRecentesHI)
        val chipGroupRecentes = dialogView.findViewById<ChipGroup>(R.id.chipGroupRecentesHI)
        val containerCategorias = dialogView.findViewById<LinearLayout>(R.id.containerCategoriasHI)
        val tvVazio = dialogView.findViewById<TextView>(R.id.tvVazioHI)
        val tvAvisoNeutra = dialogView.findViewById<TextView>(R.id.tvAvisoNeutraHI)
        val tvLabelDescricao = dialogView.findViewById<TextView>(R.id.tvLabelDescricaoHI)
        val etDescricao = dialogView.findViewById<EditText>(R.id.etDescricaoHI)
        val etHorarioInicio = dialogView.findViewById<EditText>(R.id.etHorarioInicioHI)
        val etHorarioFim = dialogView.findViewById<EditText>(R.id.etHorarioFimHI)
        val etOperadores = dialogView.findViewById<EditText>(R.id.etOperadoresHI)
        val btnCancelar = dialogView.findViewById<Button>(R.id.btnCancelarHI)
        val btnConfirmar = dialogView.findViewById<Button>(R.id.btnConfirmarHI)

        TimeInputMask.apply(etHorarioInicio)
        TimeInputMask.apply(etHorarioFim)

        tvTitulo.text = if (editando) "Editar Hora Improdutiva" else "Adicionar Hora Improdutiva"
        btnConfirmar.text = if (editando) "Salvar" else context.getString(R.string.adicionar)

        // Justificativa selecionada. Ao editar, resolve pelo nome gravado no RDO
        // (tolera nomes antigos via aliases do catálogo).
        var selecionada: JustificativaHI? =
            hiAtual?.let { JustificativasHIManager.resolver(catalogo, it.tipo) }
        // Nome livre preservado quando o RDO tem um tipo fora do catálogo.
        val tipoOriginalDesconhecido: String? =
            hiAtual?.tipo?.takeIf { selecionada == null && it.isNotBlank() }

        /** Reflete a justificativa escolhida nos campos dependentes. */
        fun aplicarSelecao() {
            val j = selecionada
            tvAvisoNeutra.visibility = if (j?.ehNeutra == true) View.VISIBLE else View.GONE
            if (j?.ehNeutra == true) {
                tvAvisoNeutra.setBackgroundColor(corSegura(j.cor, 0xFF3B82F6.toInt(), alpha = 0x22))
            }
            val exige = j?.exigeDescricao == true
            tvLabelDescricao.text = if (exige) "Descrição (obrigatória)" else "Descrição (opcional)"
        }

        // ── Chips ────────────────────────────────────────────────────────────
        val chipsPorId = mutableMapOf<String, MutableList<Chip>>()

        /** Marca visualmente apenas os chips da justificativa escolhida. */
        fun sincronizarChips() {
            chipsPorId.forEach { (id, chips) ->
                chips.forEach { it.isChecked = id == selecionada?.id }
            }
        }

        fun novoChip(j: JustificativaHI): Chip = Chip(context).apply {
            text = j.rotulo
            isCheckable = true
            isCheckedIconVisible = true
            isChecked = j.id == selecionada?.id
            val cor = corSegura(j.cor, Color.GRAY)
            chipStrokeWidth = 2f
            chipStrokeColor = android.content.res.ColorStateList.valueOf(cor)
            setOnClickListener {
                selecionada = j
                aplicarSelecao()
                sincronizarChips()
            }
            chipsPorId.getOrPut(j.id) { mutableListOf() }.add(this)
        }

        /** (Re)constrói as seções por categoria conforme o texto buscado. */
        fun renderizarJustificativas(busca: String) {
            containerCategorias.removeAllViews()
            chipsPorId.values.forEach { it.removeAll { chip -> chip.parent !== chipGroupRecentes } }

            val filtradas = JustificativasHIManager.filtrar(catalogo, busca).map { it.id }.toSet()
            var exibidas = 0

            JustificativasHIManager.agrupadasPorCategoria(catalogo).forEach { (categoria, itens) ->
                val visiveis = itens.filter { it.id in filtradas }
                if (visiveis.isEmpty()) return@forEach
                exibidas += visiveis.size

                containerCategorias.addView(TextView(context).apply {
                    text = categoria.nome
                    textSize = 12f
                    setTypeface(typeface, android.graphics.Typeface.BOLD)
                    setTextColor(corSegura(categoria.cor, Color.DKGRAY))
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    ).apply { topMargin = dp(12) }
                })

                containerCategorias.addView(ChipGroup(context).apply {
                    isSingleSelection = true
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    )
                    visiveis.forEach { addView(novoChip(it)) }
                })
            }
            tvVazio.visibility = if (exibidas == 0) View.VISIBLE else View.GONE
        }

        // Recentes (só ao adicionar — ao editar, a escolha já está feita)
        val recentes = if (editando) emptyList()
        else JustificativasHIManager.recentes(context, catalogo)
        if (recentes.isNotEmpty()) {
            tvLabelRecentes.visibility = View.VISIBLE
            chipGroupRecentes.visibility = View.VISIBLE
            recentes.forEach { chipGroupRecentes.addView(novoChip(it)) }
        }

        renderizarJustificativas("")
        aplicarSelecao()

        etBusca.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                renderizarJustificativas(s?.toString().orEmpty())
                sincronizarChips()
            }
        })

        // ── Pré-preenchimento ao editar ──────────────────────────────────────
        if (hiAtual != null) {
            etDescricao.setText(hiAtual.descricao)
            etHorarioInicio.setText(hiAtual.horaInicio)
            etHorarioFim.setText(hiAtual.horaFim)
            val operadoresAtual =
                if (hiAtual.colaboradores > 0) hiAtual.colaboradores else OPERADORES_PADRAO
            etOperadores.setText(operadoresAtual.toString())
            if (tipoOriginalDesconhecido != null) {
                tvVazio.visibility = View.VISIBLE
                tvVazio.text = "Justificativa atual (\"$tipoOriginalDesconhecido\") não está no " +
                    "catálogo. Escolha uma das opções acima para padronizar."
            }
        }

        btnCancelar.setOnClickListener { dialog.dismiss() }

        btnConfirmar.setOnClickListener {
            val justificativa = selecionada
            if (justificativa == null) {
                Toast.makeText(context, "Escolha a justificativa da HI", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val descricao = etDescricao.text.toString().trim()
            if (justificativa.exigeDescricao && descricao.isEmpty()) {
                Toast.makeText(
                    context,
                    "Descreva o ocorrido para a justificativa \"${justificativa.nome}\"",
                    Toast.LENGTH_SHORT
                ).show()
                return@setOnClickListener
            }

            val horarioInicio = etHorarioInicio.text.toString().trim()
            val horarioFim = etHorarioFim.text.toString().trim()
            val operadores = etOperadores.text.toString().trim().toIntOrNull() ?: OPERADORES_PADRAO

            if (operadores < 1 || operadores > 20) {
                Toast.makeText(context, "Operadores deve ser entre 1 e 20", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val erroHorario = ValidationHelper.validarParHorario(horarioInicio, horarioFim)
            if (erroHorario != null) {
                Toast.makeText(context, erroHorario, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val hiNovo = HIItem(
                justificativa.nome, descricao, horarioInicio, horarioFim, operadores
            )
            JustificativasHIManager.registrarUso(context, justificativa.id)

            if (hiAtual != null && itemViewAtual != null) {
                atualizarItem(hiAtual, hiNovo, itemViewAtual)
            } else {
                adicionarItem(hiNovo)
                Toast.makeText(context, getMensagemAdicao(), Toast.LENGTH_SHORT).show()
            }
            dialog.dismiss()
        }

        dialog.show()
    }

    @SuppressLint("SetTextI18n")
    override fun adicionarView(hi: HIItem) {
        val itemView = layoutInflater.inflate(R.layout.item_hi_rdo, containerView, false)

        val tvTipo = itemView.findViewById<TextView>(R.id.tvTipoHI)
        val tvCategoria = itemView.findViewById<TextView>(R.id.tvCategoriaHI)
        val tvDescricao = itemView.findViewById<TextView>(R.id.tvDescricaoHI)
        val tvHorario = itemView.findViewById<TextView>(R.id.tvHorarioHI)
        val tvOperadores = itemView.findViewById<TextView>(R.id.tvOperadoresHI)
        val btnEditar = itemView.findViewById<ImageButton>(R.id.btnEditarHI)
        val btnRemover = itemView.findViewById<ImageButton>(R.id.btnRemoverHI)

        val justificativa = JustificativasHIManager.resolver(catalogo, hi.tipo)
        val operadoresEfetivos = if (hi.colaboradores > 0) hi.colaboradores else OPERADORES_PADRAO

        tvTipo.text = justificativa?.rotulo ?: hi.tipo

        // Badge da categoria — deixa explícito o que conta (ou não) como HI.
        val categoria = justificativa?.let { j ->
            catalogo.categorias.firstOrNull { it.id == j.categoria }
        }
        if (categoria != null) {
            tvCategoria.visibility = View.VISIBLE
            tvCategoria.text = if (justificativa.ehNeutra) "Neutro · não conta como HI"
            else categoria.nome
            tvCategoria.setTextColor(corSegura(categoria.cor, Color.DKGRAY))
        } else {
            tvCategoria.visibility = View.GONE
        }

        tvDescricao.visibility = if (hi.descricao.isBlank()) View.GONE else View.VISIBLE
        tvDescricao.text = hi.descricao
        tvHorario.text = "${hi.horaInicio} - ${hi.horaFim}"
        tvOperadores.text = "$operadoresEfetivos operadores"

        btnEditar.setOnClickListener { mostrarDialogEditar(hi, itemView) }
        btnRemover.setOnClickListener { removerItem(hi, itemView) }

        containerView.addView(itemView)
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Converte a cor do catálogo, caindo no padrão se o valor for inválido. */
    private fun corSegura(hex: String, padrao: Int, alpha: Int? = null): Int {
        val base = try {
            Color.parseColor(hex)
        } catch (e: IllegalArgumentException) {
            padrao
        }
        return if (alpha == null) base
        else Color.argb(alpha, Color.red(base), Color.green(base), Color.blue(base))
    }

    private fun dp(value: Int): Int =
        (value * context.resources.displayMetrics.density).toInt()

    override fun getMensagemRemocao(): String = "HI removida"
    override fun getMensagemAtualizacao(): String = "HI atualizada"
    override fun getMensagemAdicao(): String = "Hora Improdutiva Adicionada"

    companion object {
        /** Operadores assumidos quando o RDO não informa (registros antigos). */
        private const val OPERADORES_PADRAO = 12
    }
}
