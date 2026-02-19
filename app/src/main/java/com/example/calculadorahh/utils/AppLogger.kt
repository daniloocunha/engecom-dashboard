package com.example.calculadorahh.utils

import android.util.Log
import com.example.calculadorahh.BuildConfig

/**
 * Sistema de logging centralizado e consistente.
 *
 * Benefícios:
 * - Tags consistentes com prefixo do app
 * - Controle centralizado de níveis de log
 * - Fácil integração com Firebase Crashlytics (futuro)
 * - Logs de debug automaticamente removidos em release
 *
 * @since v2.5.0
 */
object AppLogger {

    /**
     * Habilita logs verbose (apenas em debug builds).
     * ProGuard remove automaticamente em release.
     */
    private val enableVerboseLogs = BuildConfig.DEBUG && AppConstants.ENABLE_VERBOSE_LOGS

    /**
     * Formata tag com prefixo do app.
     *
     * @param tag Tag da classe/componente
     * @return Tag formatada (ex: "CalculadoraHH:DatabaseHelper")
     */
    private fun formatTag(tag: String): String {
        return "${AppConstants.LOG_TAG_PREFIX}:$tag"
    }


    // ========== VERBOSE ==========

    /**
     * Log de nível VERBOSE (mais detalhado).
     *
     * Usado para debug profundo de fluxos.
     * Automaticamente removido em builds release.
     *
     * @param tag Tag da classe/componente
     * @param message Mensagem a logar
     *
     * @sample
     * ```kotlin
     * AppLogger.v("DatabaseHelper", "Query executada: SELECT * FROM rdo")
     * ```
     */
    fun v(tag: String, message: String) {
        if (enableVerboseLogs) {
            Log.v(formatTag(tag), message)
        }
    }


    // ========== DEBUG ==========

    /**
     * Log de nível DEBUG.
     *
     * Usado para informações de debug durante desenvolvimento.
     * Automaticamente removido em builds release pelo ProGuard.
     *
     * @param tag Tag da classe/componente
     * @param message Mensagem a logar
     *
     * @sample
     * ```kotlin
     * AppLogger.d("RDOSyncWorker", "Iniciando sincronização de 5 RDOs")
     * ```
     */
    fun d(tag: String, message: String) {
        if (BuildConfig.DEBUG) {
            Log.d(formatTag(tag), message)
        }
    }


    // ========== INFO ==========

    /**
     * Log de nível INFO.
     *
     * Usado para eventos importantes do fluxo da aplicação.
     * Automaticamente removido em builds release pelo ProGuard.
     *
     * @param tag Tag da classe/componente
     * @param message Mensagem a logar
     *
     * @sample
     * ```kotlin
     * AppLogger.i("GoogleSheetsService", "✅ 10 RDOs sincronizados com sucesso")
     * ```
     */
    fun i(tag: String, message: String) {
        Log.i(formatTag(tag), message)
    }


    // ========== WARNING ==========

    /**
     * Log de nível WARNING.
     *
     * Usado para situações anormais que não impedem funcionamento.
     * MANTIDO em builds release.
     *
     * @param tag Tag da classe/componente
     * @param message Mensagem a logar
     * @param throwable Exceção associada (opcional)
     *
     * @sample
     * ```kotlin
     * AppLogger.w("DatabaseHelper", "⚠️ Tentativa 2 de inserção após colisão")
     * ```
     */
    fun w(tag: String, message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.w(formatTag(tag), message, throwable)
        } else {
            Log.w(formatTag(tag), message)
        }
    }


    // ========== ERROR ==========

    /**
     * Log de nível ERROR.
     *
     * Usado para erros que afetam funcionalidade.
     * MANTIDO em builds release.
     *
     * @param tag Tag da classe/componente
     * @param message Mensagem a logar
     * @param throwable Exceção associada (opcional mas recomendado)
     *
     * @sample
     * ```kotlin
     * try {
     *     // operação
     * } catch (e: Exception) {
     *     AppLogger.e("RDOFragment", "Erro ao salvar RDO", e)
     * }
     * ```
     */
    fun e(tag: String, message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.e(formatTag(tag), message, throwable)
        } else {
            Log.e(formatTag(tag), message)
        }

        // TODO: Integração com Firebase Crashlytics (futuro)
        // if (throwable != null) {
        //     FirebaseCrashlytics.getInstance().apply {
        //         log("$tag: $message")
        //         recordException(throwable)
        //     }
        // }
    }


    // ========== WHAT A TERRIBLE FAILURE ==========

    /**
     * Log de nível WTF (What a Terrible Failure).
     *
     * Usado para erros que NUNCA deveriam acontecer.
     * MANTIDO em builds release.
     *
     * @param tag Tag da classe/componente
     * @param message Mensagem a logar
     * @param throwable Exceção associada (opcional)
     *
     * @sample
     * ```kotlin
     * if (rdo.numeroRDO.isEmpty()) {
     *     AppLogger.wtf("GoogleSheetsService", "RDO sem número - estado inválido!")
     * }
     * ```
     */
    fun wtf(tag: String, message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.wtf(formatTag(tag), message, throwable)
        } else {
            Log.wtf(formatTag(tag), message)
        }
    }


    // ========== HELPERS DE PERFORMANCE ==========

    /**
     * Mede tempo de execução de um bloco de código e loga resultado.
     *
     * Útil para identificar gargalos de performance.
     *
     * @param tag Tag da classe/componente
     * @param operationName Nome da operação sendo medida
     * @param block Bloco de código a executar
     * @return Resultado do bloco
     *
     * @sample
     * ```kotlin
     * val rdos = AppLogger.measureTime("DatabaseHelper", "Buscar todos RDOs") {
     *     obterTodosRDOs()
     * }
     * // Log: "DatabaseHelper: Buscar todos RDOs executado em 234ms"
     * ```
     */
    inline fun <T> measureTime(tag: String, operationName: String, block: () -> T): T {
        val startTime = System.currentTimeMillis()
        val result = block()
        val duration = System.currentTimeMillis() - startTime

        d(tag, "$operationName executado em ${duration}ms")

        return result
    }


    // ========== HELPERS DE DEBUGGING ==========

    /**
     * Loga stack trace atual (para debugging de fluxo).
     *
     * Apenas em debug builds.
     *
     * @param tag Tag da classe/componente
     * @param message Mensagem contextual
     */
    fun printStackTrace(tag: String, message: String = "Stack trace") {
        if (BuildConfig.DEBUG) {
            val stackTrace = Thread.currentThread().stackTrace
            val sb = StringBuilder("$message:\n")
            stackTrace.drop(3).take(10).forEach { element ->
                sb.append("  at $element\n")
            }
            d(tag, sb.toString())
        }
    }
}
