package com.example.calculadorahh.utils

import android.util.Log
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.*

/**
 * Utilitário centralizado para formatação e parsing de datas.
 *
 * Elimina duplicação de código de formatação de datas espalhado
 * por várias classes (DatabaseHelper, GoogleSheetsService, Fragments).
 *
 * Thread-safe: Cada método cria seu próprio SimpleDateFormat para
 * evitar problemas de concorrência.
 *
 * @since v2.5.0
 */
object DateFormatter {

    private const val TAG = "DateFormatter"

    // ========== PARSING ==========

    /**
     * Faz parse de uma string de data no formato dd/MM/yyyy.
     *
     * @param dateString String da data (ex: "13/11/2024")
     * @return Date parseada ou null se inválida
     *
     * @sample
     * ```kotlin
     * val date = DateFormatter.parseFullDate("13/11/2024")
     * ```
     */
    fun parseFullDate(dateString: String): Date? {
        return try {
            val formatter = SimpleDateFormat(AppConstants.PATTERN_FULL_DATE, Locale.getDefault())
            formatter.isLenient = false  // Modo estrito
            formatter.parse(dateString)
        } catch (e: ParseException) {
            Log.e(TAG, "Erro ao parsear data: $dateString", e)
            null
        }
    }

    /**
     * Faz parse de uma string de horário no formato HH:mm.
     *
     * @param timeString String do horário (ex: "14:30")
     * @return Date com horário parseado ou null se inválido
     */
    fun parseTime(timeString: String): Date? {
        return try {
            val formatter = SimpleDateFormat(AppConstants.PATTERN_TIME, Locale.getDefault())
            formatter.isLenient = false
            formatter.parse(timeString)
        } catch (e: ParseException) {
            Log.e(TAG, "Erro ao parsear horário: $timeString", e)
            null
        }
    }


    // ========== FORMATAÇÃO ==========

    /**
     * Formata Date para string no formato dd/MM/yyyy.
     *
     * @param date Data a formatar
     * @return String formatada (ex: "13/11/2024")
     */
    fun formatToFullDate(date: Date): String {
        val formatter = SimpleDateFormat(AppConstants.PATTERN_FULL_DATE, Locale.getDefault())
        return formatter.format(date)
    }

    /**
     * Formata Date para string no formato dd.MM.yy.
     *
     * Usado para geração de número RDO.
     *
     * @param date Data a formatar
     * @return String formatada (ex: "13.11.24")
     */
    fun formatToShortDate(date: Date): String {
        val formatter = SimpleDateFormat(AppConstants.PATTERN_SHORT_DATE, Locale.getDefault())
        return formatter.format(date)
    }

    /**
     * Converte data de formato completo (dd/MM/yyyy) para curto (dd.MM.yy).
     *
     * @param dateString Data em formato completo (ex: "13/11/2024")
     * @return Data em formato curto (ex: "13.11.24") ou null se parsing falhar
     */
    fun convertToShortDate(dateString: String): String? {
        return parseFullDate(dateString)?.let { formatToShortDate(it) }
    }

    /**
     * Formata Date para timestamp no formato yyyy-MM-dd HH:mm:ss.
     *
     * Usado para logs de auditoria no Google Sheets.
     *
     * @param date Data a formatar (default: agora)
     * @return String formatada (ex: "2024-11-13 14:30:45")
     */
    fun formatToTimestamp(date: Date = Date()): String {
        val formatter = SimpleDateFormat(AppConstants.PATTERN_TIMESTAMP, Locale.getDefault())
        return formatter.format(date)
    }

    /**
     * Formata Date para horário no formato HH:mm.
     *
     * @param date Data a formatar
     * @return String formatada (ex: "14:30")
     */
    fun formatToTime(date: Date): String {
        val formatter = SimpleDateFormat(AppConstants.PATTERN_TIME, Locale.getDefault())
        return formatter.format(date)
    }


    // ========== TIMESTAMP ATUAL ==========

    /**
     * Retorna timestamp atual no formato yyyy-MM-dd HH:mm:ss.
     *
     * Atalho para formatToTimestamp(Date()).
     *
     * @return String com timestamp atual
     */
    fun getCurrentTimestamp(): String {
        return formatToTimestamp()
    }

    /**
     * Retorna data atual no formato dd/MM/yyyy.
     *
     * @return String com data atual
     */
    fun getCurrentDate(): String {
        return formatToFullDate(Date())
    }

    /**
     * Retorna horário atual no formato HH:mm.
     *
     * @return String com horário atual
     */
    fun getCurrentTime(): String {
        return formatToTime(Date())
    }


    // ========== VALIDAÇÃO ==========

    /**
     * Valida se string está no formato dd/MM/yyyy válido.
     *
     * @param dateString String a validar
     * @return true se válida, false caso contrário
     *
     * @sample
     * ```kotlin
     * DateFormatter.isValidDateFormat("13/11/2024") // true
     * DateFormatter.isValidDateFormat("32/13/2024") // false
     * DateFormatter.isValidDateFormat("13-11-2024") // false
     * ```
     */
    fun isValidDateFormat(dateString: String): Boolean {
        if (!dateString.matches(Regex(AppConstants.REGEX_DATE_FORMAT))) {
            return false
        }
        return parseFullDate(dateString) != null
    }

    /**
     * Valida se string está no formato HH:mm válido.
     *
     * @param timeString String a validar
     * @return true se válida, false caso contrário
     *
     * @sample
     * ```kotlin
     * DateFormatter.isValidTimeFormat("14:30") // true
     * DateFormatter.isValidTimeFormat("25:00") // false
     * DateFormatter.isValidTimeFormat("14:60") // false
     * ```
     */
    fun isValidTimeFormat(timeString: String): Boolean {
        if (!timeString.matches(Regex(AppConstants.REGEX_TIME_FORMAT))) {
            return false
        }
        return parseTime(timeString) != null
    }


    // ========== COMPARAÇÃO ==========

    /**
     * Compara duas datas em formato string dd/MM/yyyy.
     *
     * @param date1 Primeira data
     * @param date2 Segunda data
     * @return -1 se date1 < date2, 0 se iguais, 1 se date1 > date2, null se parsing falhar
     */
    fun compareDates(date1: String, date2: String): Int? {
        val d1 = parseFullDate(date1) ?: return null
        val d2 = parseFullDate(date2) ?: return null
        return d1.compareTo(d2)
    }

    /**
     * Verifica se data1 é anterior a date2.
     *
     * @param date1 Primeira data (dd/MM/yyyy)
     * @param date2 Segunda data (dd/MM/yyyy)
     * @return true se date1 < date2, false caso contrário ou se parsing falhar
     */
    fun isBefore(date1: String, date2: String): Boolean {
        return compareDates(date1, date2) == -1
    }

    /**
     * Verifica se data1 é posterior a date2.
     *
     * @param date1 Primeira data (dd/MM/yyyy)
     * @param date2 Segunda data (dd/MM/yyyy)
     * @return true se date1 > date2, false caso contrário ou se parsing falhar
     */
    fun isAfter(date1: String, date2: String): Boolean {
        return compareDates(date1, date2) == 1
    }
}
