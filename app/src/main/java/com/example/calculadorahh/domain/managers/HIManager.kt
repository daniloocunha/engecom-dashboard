package com.example.calculadorahh.domain.managers

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.view.LayoutInflater
import android.widget.*
import com.example.calculadorahh.data.models.HIItem
import com.example.calculadorahh.R
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.data.models.*
import com.example.calculadorahh.ui.adapters.*
import com.example.calculadorahh.utils.*
import com.example.calculadorahh.utils.ValidationHelper

/**
 * Gerencia a lista dinâmica de Horas Improdutivas no formulário RDO
 */
class HIManager(
    context: Context,
    layoutInflater: LayoutInflater,
    containerView: LinearLayout
) : BaseItemManager<HIItem>(context, layoutInflater, containerView) {

    /**
     * Retorna lista de HI adicionados (alias para compatibilidade)
     */
    fun getHorasImprodutivas(): List<HIItem> = getItens()

    override fun mostrarDialogAdicionar() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_adicionar_hi_rdo, null)
        val dialog = AlertDialog.Builder(context)
            .setView(dialogView)
            .create()


        val spinnerTipo = dialogView.findViewById<Spinner>(R.id.spinnerTipoHI)
        val etDescricao = dialogView.findViewById<EditText>(R.id.etDescricaoHI)
        val etHorarioInicio = dialogView.findViewById<EditText>(R.id.etHorarioInicioHI)
        val etHorarioFim = dialogView.findViewById<EditText>(R.id.etHorarioFimHI)
        val etOperadores = dialogView.findViewById<EditText>(R.id.etOperadoresHI)
        val btnCancelar = dialogView.findViewById<Button>(R.id.btnCancelarHI)
        val btnConfirmar = dialogView.findViewById<Button>(R.id.btnConfirmarHI)

        // Aplicar formatação automática de horário (0800 -> 08:00)
        TimeInputMask.apply(etHorarioInicio)
        TimeInputMask.apply(etHorarioFim)


        // Configurar spinner de tipos de HI
        val tiposHI = listOf(
            "Chuva",
            "Falta de Material",
            "Aguardando Liberação",
            "Passagens de Trem",
            "Treinamento",
            "Almoço/Refeição",
            "Deslocamento",
            "Outros"
        )
        val adapter = ArrayAdapter(context, android.R.layout.simple_spinner_item, tiposHI)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerTipo.adapter = adapter

        btnCancelar.setOnClickListener {
            dialog.dismiss()
        }

        btnConfirmar.setOnClickListener {
            val tipo = spinnerTipo.selectedItem.toString()
            val descricao = etDescricao.text.toString().trim()
            val horarioInicio = etHorarioInicio.text.toString().trim()
            val horarioFim = etHorarioFim.text.toString().trim()
            val operadores = etOperadores.text.toString().trim().toIntOrNull() ?: 12

            if (descricao.isEmpty()) {
                Toast.makeText(context, "Digite a descrição", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (operadores < 1 || operadores > 20) {
                Toast.makeText(context, "Operadores deve ser entre 1 e 20", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val erroHorario = ValidationHelper.validarParHorario(horarioInicio, horarioFim)
            if (erroHorario != null) {
                Toast.makeText(context, erroHorario, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            // Criar o objeto HIItem com operadores
            val hiItem = HIItem(tipo, descricao, horarioInicio, horarioFim, operadores)

            // Adicionar à lista e exibir na UI
            adicionarItem(hiItem)

            dialog.dismiss()
            Toast.makeText(context, getMensagemAdicao(), Toast.LENGTH_SHORT).show()
        }

        dialog.show()
    }

    @SuppressLint("SetTextI18n")
    override fun adicionarView(hi: HIItem) {
        val itemView = layoutInflater.inflate(R.layout.item_hi_rdo, containerView, false)

        val tvTipo = itemView.findViewById<TextView>(R.id.tvTipoHI)
        val tvDescricao = itemView.findViewById<TextView>(R.id.tvDescricaoHI)
        val tvHorario = itemView.findViewById<TextView>(R.id.tvHorarioHI)
        val tvOperadores = itemView.findViewById<TextView>(R.id.tvOperadoresHI)
        val btnEditar = itemView.findViewById<ImageButton>(R.id.btnEditarHI)
        val btnRemover = itemView.findViewById<ImageButton>(R.id.btnRemoverHI)

        val operadoresEfetivos = if (hi.operadores > 0) hi.operadores else 12

        tvTipo.text = hi.tipo
        tvDescricao.text = hi.descricao
        tvHorario.text = "${hi.horaInicio} - ${hi.horaFim}"
        tvOperadores.text = "$operadoresEfetivos operadores"

        btnEditar.setOnClickListener {
            mostrarDialogEditar(hi, itemView)
        }

        btnRemover.setOnClickListener {
            removerItem(hi, itemView)
        }

        containerView.addView(itemView)
    }

    override fun mostrarDialogEditar(hiAtual: HIItem, itemViewAtual: android.view.View) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_adicionar_hi_rdo, null)
        val dialog = AlertDialog.Builder(context)
            .setView(dialogView)
            .create()

        val spinnerTipo = dialogView.findViewById<Spinner>(R.id.spinnerTipoHI)
        val etDescricao = dialogView.findViewById<EditText>(R.id.etDescricaoHI)
        val etHorarioInicio = dialogView.findViewById<EditText>(R.id.etHorarioInicioHI)
        val etHorarioFim = dialogView.findViewById<EditText>(R.id.etHorarioFimHI)
        val etOperadores = dialogView.findViewById<EditText>(R.id.etOperadoresHI)
        val btnCancelar = dialogView.findViewById<Button>(R.id.btnCancelarHI)
        val btnConfirmar = dialogView.findViewById<Button>(R.id.btnConfirmarHI)

        // Aplicar formatação automática de horário
        TimeInputMask.apply(etHorarioInicio)
        TimeInputMask.apply(etHorarioFim)


        // Configurar spinner de tipos de HI
        val tiposHI = listOf(
            "Chuva",
            "Falta de Material",
            "Aguardando Liberação",
            "Passagens de Trem",
            "Treinamento",
            "Almoço/Refeição",
            "Deslocamento",
            "Outros"
        )
        val adapter = ArrayAdapter(context, android.R.layout.simple_spinner_item, tiposHI)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerTipo.adapter = adapter

        // Pré-preencher com dados atuais
        val tipoIndex = tiposHI.indexOf(hiAtual.tipo)
        if (tipoIndex >= 0) {
            spinnerTipo.setSelection(tipoIndex)
        }
        etDescricao.setText(hiAtual.descricao)
        etHorarioInicio.setText(hiAtual.horaInicio)
        etHorarioFim.setText(hiAtual.horaFim)
        val operadoresAtual = if (hiAtual.operadores > 0) hiAtual.operadores else 12
        etOperadores.setText(operadoresAtual.toString())

        btnCancelar.setOnClickListener {
            dialog.dismiss()
        }

        btnConfirmar.setOnClickListener {
            val tipo = spinnerTipo.selectedItem.toString()
            val descricao = etDescricao.text.toString().trim()
            val horarioInicio = etHorarioInicio.text.toString().trim()
            val horarioFim = etHorarioFim.text.toString().trim()
            val operadores = etOperadores.text.toString().trim().toIntOrNull() ?: 12

            if (descricao.isEmpty()) {
                Toast.makeText(context, "Digite a descrição", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (operadores < 1 || operadores > 20) {
                Toast.makeText(context, "Operadores deve ser entre 1 e 20", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val erroHorario = ValidationHelper.validarParHorario(horarioInicio, horarioFim)
            if (erroHorario != null) {
                Toast.makeText(context, erroHorario, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val hiEditado = HIItem(tipo, descricao, horarioInicio, horarioFim, operadores)

            atualizarItem(hiAtual, hiEditado, itemViewAtual)

            dialog.dismiss()
        }

        dialog.show()
    }

    override fun getMensagemRemocao(): String = "HI removida"
    override fun getMensagemAtualizacao(): String = "HI atualizada"
    override fun getMensagemAdicao(): String = "Hora Improdutiva Adicionada"
}
