package com.example.calculadorahh.utils

import android.widget.EditText
import com.google.android.material.textfield.TextInputLayout

object ValidationHelper {

    fun validarHorario(
        etHorarioInicio: EditText,
        etHorarioFim: EditText,
        tilHorarioInicio: TextInputLayout,
        tilHorarioFim: TextInputLayout
    ): Boolean {
        val horarioInicio = etHorarioInicio.text.toString().trim()
        val horarioFim = etHorarioFim.text.toString().trim()

        // Limpar erros anteriores
        tilHorarioInicio.error = null
        tilHorarioFim.error = null
        tilHorarioInicio.isErrorEnabled = false
        tilHorarioFim.isErrorEnabled = false

        if (horarioInicio.isEmpty()) {
            tilHorarioInicio.error = "⚠️ Campo obrigatório"
            tilHorarioInicio.isErrorEnabled = true
            return false
        }

        if (horarioFim.isEmpty()) {
            tilHorarioFim.error = "⚠️ Campo obrigatório"
            tilHorarioFim.isErrorEnabled = true
            return false
        }

        // Delega validação de formato ao TimeValidator (fonte única de verdade)
        val (resultInicio, _) = TimeValidator.validateAndParse(horarioInicio)
        if (resultInicio is TimeValidator.ValidationResult.Invalid) {
            tilHorarioInicio.error = "⚠️ Formato inválido (use 00:00)"
            tilHorarioInicio.isErrorEnabled = true
            return false
        }

        val (resultFim, _) = TimeValidator.validateAndParse(horarioFim)
        if (resultFim is TimeValidator.ValidationResult.Invalid) {
            tilHorarioFim.error = "⚠️ Formato inválido (use 00:00)"
            tilHorarioFim.isErrorEnabled = true
            return false
        }

        // Horários iguais não são permitidos
        if (horarioInicio == horarioFim) {
            tilHorarioFim.error = "⚠️ Horário fim deve ser diferente do início ($horarioInicio)"
            tilHorarioFim.isErrorEnabled = true
            return false
        }

        // Nota: Não bloqueia overnight (23:00→01:00 é válido).
        // O RDOFragment trata overnight com diálogo de confirmação.

        return true
    }

    fun validarCampoObrigatorio(
        editText: EditText,
        textInputLayout: TextInputLayout,
        nomeCampo: String
    ): Boolean {
        textInputLayout.error = null
        textInputLayout.isErrorEnabled = false

        if (editText.text.toString().trim().isEmpty()) {
            textInputLayout.error = "⚠️ $nomeCampo é obrigatório"
            textInputLayout.isErrorEnabled = true
            return false
        }

        return true
    }

    /**
     * Valida se uma quantidade é válida (não nula e maior que zero)
     */
    fun validarQuantidade(quantidade: Double?): Boolean {
        return quantidade != null && quantidade > 0
    }

    /**
     * Valida se um valor de KM é válido (não nulo e não negativo)
     */
    fun validarKMValor(km: Double?): Boolean {
        return km != null && km >= 0
    }

    /**
     * Valida par de KMs (início e fim) - versão simples sem UI
     * @return null se válido, mensagem de erro caso contrário
     */
    fun validarParKM(kmInicio: Double?, kmFim: Double?): String? {
        if (kmInicio == null) return "KM de início inválido"
        if (kmInicio < 0) return "KM de início não pode ser negativo"
        if (kmFim == null) return "KM de fim inválido"
        if (kmFim < 0) return "KM de fim não pode ser negativo"
        if (kmFim <= kmInicio) return "KM de fim deve ser maior que KM de início"
        return null
    }

    /**
     * Valida par de horários (início e fim) - versão simples sem UI.
     * Delega validação de formato ao TimeValidator.
     * @return null se válido, mensagem de erro caso contrário
     */
    fun validarParHorario(horarioInicio: String?, horarioFim: String?): String? {
        if (horarioInicio.isNullOrEmpty()) return "Horário de início é obrigatório"
        if (horarioFim.isNullOrEmpty()) return "Horário de fim é obrigatório"

        val (resultInicio, _) = TimeValidator.validateAndParse(horarioInicio)
        if (resultInicio is TimeValidator.ValidationResult.Invalid) {
            return "Horário de início inválido"
        }

        val (resultFim, _) = TimeValidator.validateAndParse(horarioFim)
        if (resultFim is TimeValidator.ValidationResult.Invalid) {
            return "Horário de fim inválido"
        }

        if (horarioInicio == horarioFim) return "Horário de fim deve ser diferente do horário de início"

        return null
    }

    /**
     * Valida colaboradores (maior que zero)
     */
    fun validarColaboradores(quantidade: Int?): Boolean {
        return quantidade != null && quantidade > 0
    }
}
