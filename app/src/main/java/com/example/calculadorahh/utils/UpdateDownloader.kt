package com.example.calculadorahh.utils

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import com.example.calculadorahh.utils.AppConstants.TIMEOUT_DOWNLOAD_APK_MS
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Responsável por baixar o APK de atualização, validar o MD5 e disparar a instalação nativa.
 */
object UpdateDownloader {

    private const val TAG = "UpdateDownloader"
    private const val APK_FILE_NAME = "update.apk"

    /**
     * Verifica se o app tem permissão para instalar pacotes.
     * No Android 8+ (API 26) é necessário concessão manual em Configurações.
     */
    fun temPermissaoInstalar(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    /**
     * Baixa o APK da [url] para o cache do app, reportando progresso via [onProgress] (0–100).
     * Valida o MD5 após o download se [expectedMd5] não for vazio.
     *
     * @return File do APK baixado, ou null em caso de erro ou MD5 inválido.
     */
    suspend fun download(
        url: String,
        expectedMd5: String,
        context: Context,
        onProgress: (Int) -> Unit = {}
    ): File? = withContext(Dispatchers.IO) {
        val destino = File(context.cacheDir, APK_FILE_NAME)
        var connection: HttpURLConnection? = null

        try {
            Log.d(TAG, "Iniciando download: $url")

            // Seguir redirecionamentos manualmente para suportar GitHub → objects.githubusercontent.com
            // HttpURLConnection.instanceFollowRedirects não segue HTTP→HTTPS nem cross-domain
            var currentUrl = url
            var finalConnection: HttpURLConnection? = null
            var responseCode: Int
            var redirectCount = 0

            while (redirectCount < 10) {
                val isRedirectUrl = redirectCount > 0  // URLs após o 1º redirect são do CDN/Azure
                val conn = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15_000
                    readTimeout = TIMEOUT_DOWNLOAD_APK_MS.toInt()
                    instanceFollowRedirects = false  // gerenciamos manualmente
                    setRequestProperty("User-Agent", "ControledeCampo-UpdateChecker")
                    // Accept: */* no CDN (Azure Blob rejeita application/octet-stream)
                    setRequestProperty("Accept", if (isRedirectUrl) "*/*" else "application/octet-stream")
                }
                responseCode = conn.responseCode
                if (responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                    responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                    responseCode == 307 || responseCode == 308) {
                    val location = conn.getHeaderField("Location")
                    conn.disconnect()
                    currentUrl = if (location.startsWith("http")) location
                                 else URL(URL(currentUrl), location).toString()
                    redirectCount++
                    Log.d(TAG, "Redirect $redirectCount → $currentUrl")
                } else {
                    finalConnection = conn
                    connection = conn
                    break
                }
            }

            val conn = finalConnection ?: run {
                Log.e(TAG, "Limite de redirects atingido")
                return@withContext null
            }

            responseCode = conn.responseCode
            if (responseCode != HttpURLConnection.HTTP_OK) {
                Log.e(TAG, "Download falhou: HTTP $responseCode para $currentUrl")
                return@withContext null
            }

            val totalBytes = conn.contentLengthLong
            var downloadedBytes = 0L
            Log.d(TAG, "Iniciando stream: totalBytes=$totalBytes")

            conn.inputStream.use { input ->
                FileOutputStream(destino).use { output ->
                    val buffer = ByteArray(8 * 1024)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        downloadedBytes += bytesRead
                        if (totalBytes > 0) {
                            val progress = ((downloadedBytes * 100) / totalBytes).toInt()
                            onProgress(progress)
                        }
                    }
                }
            }

            onProgress(100)
            Log.d(TAG, "Download concluído: ${destino.length()} bytes")

            // Validar MD5
            if (expectedMd5.isNotBlank()) {
                val md5Real = calcularMd5(destino)
                if (!md5Real.equals(expectedMd5.trim(), ignoreCase = true)) {
                    Log.e(TAG, "MD5 inválido! Esperado: $expectedMd5, Real: $md5Real")
                    destino.delete()
                    return@withContext null
                }
                Log.d(TAG, "MD5 válido: $md5Real")
            }

            destino

        } catch (e: Exception) {
            Log.e(TAG, "Erro no download: ${e.message}", e)
            destino.delete()
            null
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Dispara a instalação nativa do APK via FileProvider.
     * O Android abrirá a tela "Deseja instalar [app]?".
     */
    fun instalar(apkFile: File, context: Context) {
        try {
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            context.startActivity(intent)
            Log.d(TAG, "Instalador nativo aberto para: ${apkFile.name}")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao abrir instalador: ${e.message}", e)
        }
    }

    private fun calcularMd5(file: File): String {
        val digest = MessageDigest.getInstance("MD5")
        file.inputStream().use { input ->
            val buffer = ByteArray(8 * 1024)
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
