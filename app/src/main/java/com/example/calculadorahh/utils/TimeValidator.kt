package com.example.calculadorahh.utils

/**
 * Validador especializado para horários e cálculos de tempo.
 *
 * Fornece validação robusta de formatos HH:mm e cálculos
 * de diferença de horas incluindo períodos overnight.
 *
 * @since v2.5.0
 */
object TimeValidator {

    /**
     * Resultado de validação de horário.
     */
    sealed class ValidationResult {
        object Valid : ValidationResult()
        data class Invalid(val reason: String) : ValidationResult()
    }

    /**
     * Dados de horário parseados e validados.
     */
    data class ParsedTime(
        val hour: Int,
        val minute: Int
    ) {
        fun toMinutes(): Int = hour * 60 + minute
        fun toHours(): Double = hour + (minute / 60.0)
    }


    /**
     * Valida e faz parse de horário no formato HH:mm.
     *
     * @param timeString Horário a validar (ex: "14:30")
     * @return ValidationResult.Valid com ParsedTime ou Invalid com motivo
     *
     * @sample
     * ```kotlin
     * when (val result = TimeValidator.validateAndParse("14:30")) {
     *     is ValidationResult.Valid -> println("Válido!")
     *     is ValidationResult.Invalid -> println("Erro: ${result.reason}")
     * }
     * ```
     */
    fun validateAndParse(timeString: String): Pair<ValidationResult, ParsedTime?> {
        // Validação de formato
        if (!timeString.matches(Regex(AppConstants.REGEX_TIME_FORMAT))) {
            return ValidationResult.Invalid("Formato inválido. Use HH:mm (ex: 14:30)") to null
        }

        // Parse
        val parts = timeString.split(":")
        if (parts.size != 2) {
            return ValidationResult.Invalid("Formato inválido") to null
        }

        val hour = parts[0].toIntOrNull()
        val minute = parts[1].toIntOrNull()

        if (hour == null || minute == null) {
            return ValidationResult.Invalid("Horário contém caracteres inválidos") to null
        }

        // Validação de range
        if (hour !in AppConstants.VALID_HOUR_RANGE) {
            return ValidationResult.Invalid("Hora deve estar entre 00 e 23") to null
        }

        if (minute !in AppConstants.VALID_MINUTE_RANGE) {
            return ValidationResult.Invalid("Minuto deve estar entre 00 e 59") to null
        }

        return ValidationResult.Valid to ParsedTime(hour, minute)
    }


    /**
     * Calcula diferença em horas entre dois horários.
     *
     * Suporta períodos overnight (ex: 23:00 até 02:00 = 3 horas).
     *
     * @param inicio Horário inicial (HH:mm)
     * @param fim Horário final (HH:mm)
     * @return Diferença em horas ou null se horários inválidos
     *
     * @sample
     * ```kotlin
     * TimeValidator.calcularDiferencaHoras("14:00", "16:30") // 2.5
     * TimeValidator.calcularDiferencaHoras("23:00", "02:00") // 3.0 (overnight)
     * ```
     */
    fun calcularDiferencaHoras(inicio: String, fim: String): Double? {
        val (validInicio, parsedInicio) = validateAndParse(inicio)
        if (validInicio !is ValidationResult.Valid || parsedInicio == null) {
            return null
        }

        val (validFim, parsedFim) = validateAndParse(fim)
        if (validFim !is ValidationResult.Valid || parsedFim == null) {
            return null
        }

        return calcularDiferencaHoras(parsedInicio, parsedFim)
    }


    /**
     * Calcula diferença em horas entre dois ParsedTime.
     *
     * @param inicio ParsedTime inicial
     * @param fim ParsedTime final
     * @return Diferença em horas (sempre positiva, suporta overnight)
     */
    fun calcularDiferencaHoras(inicio: ParsedTime, fim: ParsedTime): Double {
        val minutosInicio = inicio.toMinutes()
        val minutosFim = fim.toMinutes()

        val diferencaMinutos = if (minutosFim >= minutosInicio) {
            // Mesmo dia
            minutosFim - minutosInicio
        } else {
            // Overnight: até meia-noite + desde meia-noite até fim
            (24 * 60 - minutosInicio) + minutosFim
        }

        return diferencaMinutos / 60.0
    }


    /**
     * Valida período de horário (início e fim).
     *
     * @param inicio Horário inicial
     * @param fim Horário final
     * @return ValidationResult explicando se válido ou motivo de invalidade
     */
    fun validatePeriodo(inicio: String, fim: String): ValidationResult {
        val (validInicio, parsedInicio) = validateAndParse(inicio)
        if (validInicio !is ValidationResult.Valid) {
            return ValidationResult.Invalid("Horário inicial inválido: ${(validInicio as ValidationResult.Invalid).reason}")
        }

        val (validFim, parsedFim) = validateAndParse(fim)
        if (validFim !is ValidationResult.Valid) {
            return ValidationResult.Invalid("Horário final inválido: ${(validFim as ValidationResult.Invalid).reason}")
        }

        // Ambos válidos
        return ValidationResult.Valid
    }


    /**
     * Formata minutos para string HH:mm.
     *
     * @param totalMinutes Total de minutos
     * @return String formatada (ex: 90 min -> "01:30")
     */
    fun formatMinutesToTime(totalMinutes: Int): String {
        val hours = totalMinutes / 60
        val minutes = totalMinutes % 60
        return String.format("%02d:%02d", hours, minutes)
    }


    /**
     * Formata horas (double) para string HH:mm.
     *
     * @param totalHours Total de horas (ex: 2.5)
     * @return String formatada (ex: "02:30")
     */
    fun formatHoursToTime(totalHours: Double): String {
        val totalMinutes = (totalHours * 60).toInt()
        return formatMinutesToTime(totalMinutes)
    }
}
