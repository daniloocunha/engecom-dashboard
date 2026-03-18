package com.example.calculadorahh.data.models

/**
 * Configuração de atualização lida da aba "Config" do Google Sheets.
 */
data class UpdateConfig(
    val versaoMinima: Int,
    val versaoRecomendada: Int,
    val urlDownload: String,
    val hashMd5: String,
    val forcarUpdate: Boolean,
    val mensagemAviso: String,
    val mensagemBloqueio: String
)

/**
 * Resultado da verificação de update.
 */
sealed class UpdateStatus {
    object NoUpdate : UpdateStatus()
    data class UpdateAvailable(val config: UpdateConfig) : UpdateStatus()
    data class UpdateRequired(val config: UpdateConfig) : UpdateStatus()
}
