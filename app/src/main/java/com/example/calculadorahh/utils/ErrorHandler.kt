package com.example.calculadorahh.utils

import android.database.sqlite.SQLiteConstraintException
import android.database.sqlite.SQLiteException
import com.google.api.client.googleapis.json.GoogleJsonResponseException
import com.google.gson.JsonSyntaxException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * Gerenciador centralizado de erros e mensagens amigáveis.
 *
 * Converte exceções técnicas em mensagens compreensíveis
 * para o usuário final, melhorando a UX.
 *
 * @since v2.5.0
 */
object ErrorHandler {

    /**
     * Converte exceção técnica em mensagem amigável para usuário.
     *
     * @param exception Exceção ocorrida
     * @param context Contexto adicional da operação (opcional)
     * @return Mensagem amigável explicando o erro
     *
     * @sample
     * ```kotlin
     * try {
     *     syncRDO(rdo)
     * } catch (e: Exception) {
     *     val message = ErrorHandler.getUserFriendlyMessage(e, "sincronização")
     *     Toast.makeText(context, message, Toast.LENGTH_LONG).show()
     * }
     * ```
     */
    fun getUserFriendlyMessage(exception: Exception, context: String? = null): String {
        val contextSuffix = context?.let { " durante $it" } ?: ""

        return when (exception) {
            // ========== ERROS DE REDE ==========

            is UnknownHostException ->
                "Sem conexão com a internet. Verifique sua rede e tente novamente."

            is ConnectException ->
                "Não foi possível conectar ao servidor. Verifique sua conexão."

            is SocketTimeoutException ->
                "A operação demorou muito tempo. Tente novamente."

            is SSLException ->
                "Erro de segurança na conexão. Verifique a data/hora do dispositivo."


            // ========== ERROS DE BANCO DE DADOS ==========

            is SQLiteConstraintException -> {
                when {
                    exception.message?.contains("UNIQUE constraint failed", ignoreCase = true) == true ->
                        "Este registro já existe no banco de dados."
                    exception.message?.contains("NOT NULL constraint failed", ignoreCase = true) == true ->
                        "Campos obrigatórios não foram preenchidos."
                    exception.message?.contains("FOREIGN KEY constraint failed", ignoreCase = true) == true ->
                        "Erro de integridade nos dados relacionados."
                    else ->
                        "Erro ao salvar no banco de dados. Tente novamente."
                }
            }

            is SQLiteException ->
                "Erro no banco de dados local. Tente reiniciar o aplicativo."


            // ========== ERROS DE DADOS ==========

            is JsonSyntaxException ->
                "Dados corrompidos encontrados. Por favor, contacte o suporte."

            is NumberFormatException ->
                "Formato de número inválido. Verifique os valores digitados."

            is IllegalArgumentException ->
                exception.message ?: "Dados inválidos fornecidos."

            is IllegalStateException ->
                exception.message ?: "Operação inválida no estado atual."


            // ========== ERROS DO GOOGLE SHEETS ==========

            is GoogleJsonResponseException -> {
                when (exception.statusCode) {
                    400 -> "Requisição inválida ao servidor."
                    401 -> "Não autorizado. Contacte o administrador do sistema."
                    403 -> "Acesso negado. Verifique as permissões."
                    404 -> "Planilha não encontrada. Verifique a configuração."
                    429 -> "Muitas requisições. Aguarde alguns minutos e tente novamente."
                    500 -> "Erro interno do servidor. Tente novamente mais tarde."
                    503 -> "Servidor temporariamente indisponível. Tente mais tarde."
                    else -> "Erro no servidor (código ${exception.statusCode})$contextSuffix."
                }
            }


            // ========== ERRO GENÉRICO ==========

            else -> {
                val message = exception.message
                if (!message.isNullOrBlank() && message.length < 100) {
                    "Erro$contextSuffix: $message"
                } else {
                    "Erro inesperado$contextSuffix. Tente novamente."
                }
            }
        }
    }


    /**
     * Determina se erro é recuperável (retry pode ajudar).
     *
     * @param exception Exceção a analisar
     * @return true se vale a pena tentar novamente
     *
     * @sample
     * ```kotlin
     * catch (e: Exception) {
     *     if (ErrorHandler.isRecoverable(e)) {
     *         // Mostrar botão "Tentar Novamente"
     *     } else {
     *         // Mostrar botão "Voltar"
     *     }
     * }
     * ```
     */
    fun isRecoverable(exception: Exception): Boolean {
        return when (exception) {
            // Erros de rede temporários
            is UnknownHostException,
            is ConnectException,
            is SocketTimeoutException -> true

            // Quota exceeded do Google
            is GoogleJsonResponseException -> exception.statusCode in listOf(429, 500, 503)

            // Erros não recuperáveis
            is SQLiteConstraintException,
            is JsonSyntaxException,
            is IllegalArgumentException -> false

            // Por padrão, considerar recuperável
            else -> true
        }
    }


    /**
     * Determina severidade do erro.
     *
     * @param exception Exceção a analisar
     * @return Severidade (CRITICAL, HIGH, MEDIUM, LOW)
     */
    fun getSeverity(exception: Exception): ErrorSeverity {
        return when (exception) {
            // Crítico: corrupção de dados
            is JsonSyntaxException,
            is SQLiteException -> ErrorSeverity.CRITICAL

            // Alto: erros de autenticação/autorização
            is GoogleJsonResponseException -> {
                when (exception.statusCode) {
                    401, 403 -> ErrorSeverity.HIGH
                    429, 500, 503 -> ErrorSeverity.MEDIUM
                    else -> ErrorSeverity.LOW
                }
            }

            // Médio: erros de validação
            is SQLiteConstraintException,
            is IllegalArgumentException,
            is NumberFormatException -> ErrorSeverity.MEDIUM

            // Baixo: erros de rede temporários
            is UnknownHostException,
            is ConnectException,
            is SocketTimeoutException -> ErrorSeverity.LOW

            // Padrão
            else -> ErrorSeverity.MEDIUM
        }
    }


    /**
     * Gera mensagem técnica para logs.
     *
     * Mais detalhada que a mensagem para usuário,
     * útil para debugging.
     *
     * @param exception Exceção ocorrida
     * @param operation Operação sendo executada
     * @return Mensagem técnica detalhada
     */
    fun getTechnicalMessage(exception: Exception, operation: String): String {
        return buildString {
            append("Erro em '$operation': ")
            append(exception.javaClass.simpleName)

            exception.message?.let { msg ->
                append(" - $msg")
            }

            if (exception is GoogleJsonResponseException) {
                append(" [HTTP ${exception.statusCode}]")
                exception.details?.message?.let { details ->
                    append(" Details: $details")
                }
            }

            // Causa raiz
            exception.cause?.let { cause ->
                append(" | Causa: ${cause.javaClass.simpleName}")
                cause.message?.let { causeMsg ->
                    append(" - $causeMsg")
                }
            }
        }
    }


    /**
     * Níveis de severidade de erros.
     */
    enum class ErrorSeverity {
        /** Crítico: perda de dados, corrupção */
        CRITICAL,

        /** Alto: funcionalidade core quebrada */
        HIGH,

        /** Médio: funcionalidade parcialmente afetada */
        MEDIUM,

        /** Baixo: erro temporário, recuperável */
        LOW
    }
}
