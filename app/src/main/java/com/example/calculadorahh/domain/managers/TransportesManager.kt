package com.example.calculadorahh.domain.managers

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.view.LayoutInflater
import android.widget.*
import com.example.calculadorahh.data.models.TransporteItem
import com.example.calculadorahh.R
import com.example.calculadorahh.utils.TimeInputMask
import com.example.calculadorahh.utils.KmInputMask
import com.example.calculadorahh.utils.KmUtils
import com.example.calculadorahh.utils.ValidationHelper
import com.google.android.material.textfield.TextInputEditText

/**
 * Gerencia a lista dinâmica de Transportes no formulário RDO
 */
class TransportesManager(
    context: Context,
    layoutInflater: LayoutInflater,
    containerView: LinearLayout
) : BaseItemManager<TransporteItem>(context, layoutInflater, containerView) {

    /**
     * Retorna lista de transportes adicionados (alias para compatibilidade)
     */
    fun getTransportes(): List<TransporteItem> = getItens()

    override fun mostrarDialogAdicionar() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_adicionar_transporte_rdo, null)
        val dialog = AlertDialog.Builder(context)
            .setView(dialogView)
            .create()

        val etDescricao = dialogView.findViewById<TextInputEditText>(R.id.etDescricaoTransporte)
        val etQuantidadeColaboradores = dialogView.findViewById<TextInputEditText>(R.id.etQuantidadeColaboradoresTransporte)
        val etHorarioInicio = dialogView.findViewById<TextInputEditText>(R.id.etHorarioInicioTransporte)
        val etHorarioFim = dialogView.findViewById<TextInputEditText>(R.id.etHorarioFimTransporte)
        val etKmInicio = dialogView.findViewById<TextInputEditText>(R.id.etKmInicioTransporte)
        val etKmFim = dialogView.findViewById<TextInputEditText>(R.id.etKmFimTransporte)
        val btnCancelar = dialogView.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnCancelarTransporte)
        val btnConfirmar = dialogView.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnConfirmarTransporte)

        // Aplicar formatação automática de horário
        TimeInputMask.apply(etHorarioInicio)
        TimeInputMask.apply(etHorarioFim)

        // Aplicar formatação automática de KM
        KmInputMask.apply(etKmInicio)
        KmInputMask.apply(etKmFim)

        btnCancelar.setOnClickListener {
            dialog.dismiss()
        }

        btnConfirmar.setOnClickListener {
            val descricao = etDescricao.text.toString().trim()
            val quantidadeColaboradores = etQuantidadeColaboradores.text.toString().toIntOrNull()
            val horarioInicio = etHorarioInicio.text.toString().trim()
            val horarioFim = etHorarioFim.text.toString().trim()
            val kmInicio = KmUtils.converterKmParaDouble(etKmInicio.text.toString())
            val kmFim = KmUtils.converterKmParaDouble(etKmFim.text.toString())

            // Validações
            if (descricao.isEmpty()) {
                Toast.makeText(context, "Digite a descrição do manejo realizado", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (!ValidationHelper.validarColaboradores(quantidadeColaboradores)) {
                Toast.makeText(context, "Digite uma quantidade válida de colaboradores (maior que zero)", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val erroHorario = ValidationHelper.validarParHorario(horarioInicio, horarioFim)
            if (erroHorario != null) {
                Toast.makeText(context, erroHorario, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val erroKm = ValidationHelper.validarParKM(kmInicio, kmFim)
            if (erroKm != null) {
                Toast.makeText(context, erroKm, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val transporteItem = TransporteItem(
                descricao = descricao,
                quantidadeColaboradores = quantidadeColaboradores!!, // Sabemos que não é null após validação
                horarioInicio = horarioInicio,
                horarioFim = horarioFim,
                kmInicio = kmInicio!!, // Sabemos que não é null após validação
                kmFim = kmFim!! // Sabemos que não é null após validação
            )

            adicionarItem(transporteItem)

            dialog.dismiss()
            Toast.makeText(context, getMensagemAdicao(), Toast.LENGTH_SHORT).show()
        }

        dialog.show()
    }

    @SuppressLint("SetTextI18n")
    override fun adicionarView(transporte: TransporteItem) {
        val itemView = layoutInflater.inflate(R.layout.item_transporte_rdo, containerView, false)

        val tvDescricao = itemView.findViewById<TextView>(R.id.tvDescricaoTransporte)
        val tvColaboradores = itemView.findViewById<TextView>(R.id.tvColaboradoresTransporte)
        val tvHorario = itemView.findViewById<TextView>(R.id.tvHorarioTransporte)
        val tvDistancia = itemView.findViewById<TextView>(R.id.tvDistanciaTransporte)
        val btnEditar = itemView.findViewById<ImageButton>(R.id.btnEditarTransporte)
        val btnRemover = itemView.findViewById<ImageButton>(R.id.btnRemoverTransporte)

        tvDescricao.text = transporte.descricao
        tvColaboradores.text = "👥 ${transporte.quantidadeColaboradores} colaboradores"
        tvHorario.text = "🕐 ${transporte.horarioInicio} - ${transporte.horarioFim}"
        tvDistancia.text = "📍 KM ${KmUtils.formatarKm(transporte.kmInicio)} → ${KmUtils.formatarKm(transporte.kmFim)} (${transporte.calcularDistanciaFormatada()} km)"

        btnEditar.setOnClickListener {
            mostrarDialogEditar(transporte, itemView)
        }

        btnRemover.setOnClickListener {
            removerItem(transporte, itemView)
        }

        containerView.addView(itemView)
    }

    override fun mostrarDialogEditar(transporteAtual: TransporteItem, itemViewAtual: android.view.View) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_adicionar_transporte_rdo, null)
        val dialog = AlertDialog.Builder(context)
            .setView(dialogView)
            .create()

        val etDescricao = dialogView.findViewById<TextInputEditText>(R.id.etDescricaoTransporte)
        val etQuantidadeColaboradores = dialogView.findViewById<TextInputEditText>(R.id.etQuantidadeColaboradoresTransporte)
        val etHorarioInicio = dialogView.findViewById<TextInputEditText>(R.id.etHorarioInicioTransporte)
        val etHorarioFim = dialogView.findViewById<TextInputEditText>(R.id.etHorarioFimTransporte)
        val etKmInicio = dialogView.findViewById<TextInputEditText>(R.id.etKmInicioTransporte)
        val etKmFim = dialogView.findViewById<TextInputEditText>(R.id.etKmFimTransporte)
        val btnCancelar = dialogView.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnCancelarTransporte)
        val btnConfirmar = dialogView.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnConfirmarTransporte)

        // Aplicar formatação automática de horário
        TimeInputMask.apply(etHorarioInicio)
        TimeInputMask.apply(etHorarioFim)

        // Aplicar formatação automática de KM
        KmInputMask.apply(etKmInicio)
        KmInputMask.apply(etKmFim)

        // Pré-preencher com dados atuais
        etDescricao.setText(transporteAtual.descricao)
        etQuantidadeColaboradores.setText(transporteAtual.quantidadeColaboradores.toString())
        etHorarioInicio.setText(transporteAtual.horarioInicio)
        etHorarioFim.setText(transporteAtual.horarioFim)
        etKmInicio.setText(KmUtils.formatarKm(transporteAtual.kmInicio))
        etKmFim.setText(KmUtils.formatarKm(transporteAtual.kmFim))

        btnCancelar.setOnClickListener {
            dialog.dismiss()
        }

        btnConfirmar.setOnClickListener {
            val descricao = etDescricao.text.toString().trim()
            val quantidadeColaboradores = etQuantidadeColaboradores.text.toString().toIntOrNull()
            val horarioInicio = etHorarioInicio.text.toString().trim()
            val horarioFim = etHorarioFim.text.toString().trim()
            val kmInicio = KmUtils.converterKmParaDouble(etKmInicio.text.toString())
            val kmFim = KmUtils.converterKmParaDouble(etKmFim.text.toString())

            // Validações
            if (descricao.isEmpty()) {
                Toast.makeText(context, "Digite a descrição do manejo de sucatas", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (!ValidationHelper.validarColaboradores(quantidadeColaboradores)) {
                Toast.makeText(context, "Digite uma quantidade válida de colaboradores (maior que zero)", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val erroHorario = ValidationHelper.validarParHorario(horarioInicio, horarioFim)
            if (erroHorario != null) {
                Toast.makeText(context, erroHorario, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val erroKm = ValidationHelper.validarParKM(kmInicio, kmFim)
            if (erroKm != null) {
                Toast.makeText(context, erroKm, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val transporteEditado = TransporteItem(
                descricao = descricao,
                quantidadeColaboradores = quantidadeColaboradores!!, // Sabemos que não é null após validação
                horarioInicio = horarioInicio,
                horarioFim = horarioFim,
                kmInicio = kmInicio!!, // Sabemos que não é null após validação
                kmFim = kmFim!! // Sabemos que não é null após validação
            )

            atualizarItem(transporteAtual, transporteEditado, itemViewAtual)

            dialog.dismiss()
        }

        dialog.show()
    }

    override fun getMensagemRemocao(): String = "Manejo de sucatas removido"
    override fun getMensagemAtualizacao(): String = "Manejo de sucatas atualizado"
    override fun getMensagemAdicao(): String = "Manejo de sucatas adicionado"
}
