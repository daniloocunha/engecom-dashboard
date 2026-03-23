package com.example.calculadorahh.utils

import android.content.Context
import android.util.Log
import com.example.calculadorahh.BuildConfig
import com.example.calculadorahh.data.models.UpdateConfig
import com.example.calculadorahh.data.models.UpdateStatus
import com.example.calculadorahh.services.SheetsConstants
import com.google.api.services.sheets.v4.Sheets

/**
 * Verifica se há uma nova versão disponível consultando a aba "Config" do Google Sheets.
 *
 * Estrutura esperada na aba Config (colunas A e B):
 *   versao_minima        | 12
 *   versao_recomendada   | 13
 *   url_download         | https://github.com/.../releases/download/v3.1.0/app-release.apk
 *   hash_md5             | abc123...
 *   forcar_update        | NAO
 *   mensagem_aviso       | Nova versão disponível!
 *   mensagem_bloqueio    | Atualize para continuar.
 */
object UpdateChecker {

    private const val TAG = "UpdateChecker"

    // Chaves da aba Config
    private const val KEY_VERSAO_MINIMA = "versao_minima"
    private const val KEY_VERSAO_RECOMENDADA = "versao_recomendada"
    private const val KEY_URL_DOWNLOAD = "url_download"
    private const val KEY_HASH_MD5 = "hash_md5"
    private const val KEY_FORCAR_UPDATE = "forcar_update"
    private const val KEY_MENSAGEM_AVISO = "mensagem_aviso"
    private const val KEY_MENSAGEM_BLOQUEIO = "mensagem_bloqueio"

    // SharedPreferences
    private const val PREFS_NAME = "update_prefs"
    private const val PREF_STATUS = "update_status"
    private const val PREF_VERSAO_RECOMENDADA = "update_versao_recomendada"
    private const val PREF_URL = "update_url"
    private const val PREF_MD5 = "update_md5"
    private const val PREF_FORCAR = "update_forcar"
    private const val PREF_MSG_AVISO = "update_msg_aviso"
    private const val PREF_MSG_BLOQUEIO = "update_msg_bloqueio"
    private const val PREF_VERSAO_MINIMA = "update_versao_minima"

    private const val STATUS_NONE = "none"
    private const val STATUS_AVAILABLE = "available"
    private const val STATUS_REQUIRED = "required"

    /**
     * Lê a aba Config do Sheets e retorna UpdateConfig, ou null em caso de erro.
     * Deve ser chamado em Dispatchers.IO.
     */
    fun fetchUpdateConfig(sheetsService: Sheets, spreadsheetId: String): UpdateConfig? {
        return try {
            val response = sheetsService.spreadsheets().values()
                .get(spreadsheetId, "${SheetsConstants.SHEET_CONFIG}!A:B")
                .execute()

            val values = response.getValues() ?: return null

            // Montar mapa chave → valor
            val config = mutableMapOf<String, String>()
            for (row in values) {
                if (row.size >= 2) {
                    val chave = row[0].toString().trim().lowercase()
                    val valor = row[1].toString().trim()
                    config[chave] = valor
                }
            }

            val versaoMinima = config[KEY_VERSAO_MINIMA]?.toIntOrNull() ?: 0
            val versaoRecomendada = config[KEY_VERSAO_RECOMENDADA]?.toIntOrNull() ?: 0
            val urlDownload = config[KEY_URL_DOWNLOAD] ?: ""
            val hashMd5 = config[KEY_HASH_MD5] ?: ""
            val forcarUpdate = config[KEY_FORCAR_UPDATE]?.uppercase() == "SIM"
            val mensagemAviso = config[KEY_MENSAGEM_AVISO] ?: "Nova versão disponível!"
            val mensagemBloqueio = config[KEY_MENSAGEM_BLOQUEIO] ?: "Atualize para continuar usando o app."

            if (urlDownload.isBlank()) {
                Log.w(TAG, "url_download não configurada na aba Config")
                return null
            }

            UpdateConfig(
                versaoMinima = versaoMinima,
                versaoRecomendada = versaoRecomendada,
                urlDownload = urlDownload,
                hashMd5 = hashMd5,
                forcarUpdate = forcarUpdate,
                mensagemAviso = mensagemAviso,
                mensagemBloqueio = mensagemBloqueio
            ).also {
                Log.d(TAG, "Config lida: versaoMinima=${it.versaoMinima}, versaoRecomendada=${it.versaoRecomendada}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao ler config de update: ${e.message}", e)
            null
        }
    }

    /**
     * Compara a config remota com a versão instalada e retorna o status de update.
     */
    fun checkUpdate(config: UpdateConfig): UpdateStatus {
        val currentVersion = BuildConfig.VERSION_CODE
        return when {
            config.versaoMinima > currentVersion -> {
                Log.i(TAG, "Update OBRIGATÓRIO: versaoMinima=${config.versaoMinima} > instalada=$currentVersion")
                UpdateStatus.UpdateRequired(config)
            }
            config.versaoRecomendada > currentVersion -> {
                Log.i(TAG, "Update disponível: versaoRecomendada=${config.versaoRecomendada} > instalada=$currentVersion")
                UpdateStatus.UpdateAvailable(config)
            }
            else -> {
                Log.d(TAG, "App atualizado (versão $currentVersion)")
                UpdateStatus.NoUpdate
            }
        }
    }

    /**
     * Persiste o status de update em SharedPreferences para que HomeActivity possa ler.
     */
    fun salvarStatusUpdate(context: Context, status: UpdateStatus) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val editor = prefs.edit()
        when (status) {
            is UpdateStatus.NoUpdate -> editor.putString(PREF_STATUS, STATUS_NONE)
            is UpdateStatus.UpdateAvailable -> {
                editor.putString(PREF_STATUS, STATUS_AVAILABLE)
                salvarConfigPrefs(editor, status.config)
            }
            is UpdateStatus.UpdateRequired -> {
                editor.putString(PREF_STATUS, STATUS_REQUIRED)
                salvarConfigPrefs(editor, status.config)
            }
        }
        editor.apply()
        Log.d(TAG, "Status de update salvo: ${prefs.getString(PREF_STATUS, STATUS_NONE)}")
    }

    /**
     * Lê o status de update salvo anteriormente. Retorna null se não há dado salvo.
     */
    fun lerStatusUpdate(context: Context): UpdateStatus? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val statusStr = prefs.getString(PREF_STATUS, STATUS_NONE) ?: STATUS_NONE
        if (statusStr == STATUS_NONE) return null

        val config = UpdateConfig(
            versaoMinima = prefs.getInt(PREF_VERSAO_MINIMA, 0),
            versaoRecomendada = prefs.getInt(PREF_VERSAO_RECOMENDADA, 0),
            urlDownload = prefs.getString(PREF_URL, "") ?: "",
            hashMd5 = prefs.getString(PREF_MD5, "") ?: "",
            forcarUpdate = prefs.getBoolean(PREF_FORCAR, false),
            mensagemAviso = prefs.getString(PREF_MSG_AVISO, "Nova versão disponível!") ?: "",
            mensagemBloqueio = prefs.getString(PREF_MSG_BLOQUEIO, "Atualize para continuar.") ?: ""
        )

        if (config.urlDownload.isBlank()) return null

        // Revalidar se a versão instalada atual já é suficiente
        // (usuário pode ter atualizado manualmente sem passar pelo downloader)
        val currentVersion = BuildConfig.VERSION_CODE
        return when {
            statusStr == STATUS_REQUIRED && config.versaoMinima > currentVersion ->
                UpdateStatus.UpdateRequired(config)
            statusStr == STATUS_AVAILABLE && config.versaoRecomendada > currentVersion ->
                UpdateStatus.UpdateAvailable(config)
            else -> {
                // App já está atualizado — limpar status salvo
                limparStatusUpdate(context)
                null
            }
        }
    }

    /**
     * Remove o status de update salvo (chamar após instalação bem-sucedida).
     */
    fun limparStatusUpdate(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_STATUS, STATUS_NONE)
            .apply()
    }

    private fun salvarConfigPrefs(
        editor: android.content.SharedPreferences.Editor,
        config: UpdateConfig
    ) {
        editor.putInt(PREF_VERSAO_MINIMA, config.versaoMinima)
        editor.putInt(PREF_VERSAO_RECOMENDADA, config.versaoRecomendada)
        editor.putString(PREF_URL, config.urlDownload)
        editor.putString(PREF_MD5, config.hashMd5)
        editor.putBoolean(PREF_FORCAR, config.forcarUpdate)
        editor.putString(PREF_MSG_AVISO, config.mensagemAviso)
        editor.putString(PREF_MSG_BLOQUEIO, config.mensagemBloqueio)
    }
}
