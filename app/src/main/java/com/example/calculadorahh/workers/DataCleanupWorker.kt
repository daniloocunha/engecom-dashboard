package com.example.calculadorahh.workers

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.calculadorahh.R
import com.example.calculadorahh.services.GoogleSheetsService
import com.example.calculadorahh.services.SheetsConstants
import com.example.calculadorahh.utils.AppLogger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 🆕 v2.4.0: Worker para limpeza semanal de dados órfãos no Google Sheets
 *
 * Remove linhas de abas relacionadas (Servicos, Materiais, etc.) cujos RDOs
 * foram deletados da aba principal.
 *
 * Frequência: Semanal (1x por semana)
 * Constraints: Rede conectada, bateria não baixa
 */
class DataCleanupWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        private const val TAG = "DataCleanupWorker"
        const val WORK_NAME = "DataCleanupWork"
        private const val NOTIFICATION_ID = 1002
        private const val CHANNEL_ID = "data_cleanup_channel"
        private const val CHANNEL_NAME = "Limpeza de Dados"
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        AppLogger.d(TAG, "🧹 Iniciando job de limpeza de dados órfãos")

        try {
            // Criar notificação de progresso
            showNotification("Verificando integridade dos dados...", autoCancel = false)

            // Inicializar Google Sheets Service
            val sheetsService = GoogleSheetsService(context)
            val initialized = sheetsService.initialize()

            if (!initialized) {
                AppLogger.e(TAG, "❌ Google Sheets Service não disponível")
                showNotification("⚠ Falha ao conectar ao Google Sheets", autoCancel = true)
                return@withContext Result.failure()
            }

            // 1. Obter lista de RDOs válidos (não deletados)
            AppLogger.d(TAG, "📋 Obtendo lista de RDOs válidos...")
            val validRDOs = sheetsService.getValidRDONumbers()

            if (validRDOs.isEmpty()) {
                AppLogger.w(TAG, "⚠ Nenhum RDO válido encontrado. Abortando limpeza.")
                cancelNotification()
                return@withContext Result.success()
            }

            AppLogger.i(TAG, "✅ ${validRDOs.size} RDOs válidos encontrados")

            // 2. Limpar cada aba relacionada
            val sheetsToClean = SheetsConstants.RELATED_DATA_SHEETS

            var totalOrphansRemoved = 0
            val cleanupResults = mutableMapOf<String, Int>()

            sheetsToClean.forEach { sheetName ->
                try {
                    AppLogger.d(TAG, "🔍 Verificando $sheetName...")
                    val orphansRemoved = sheetsService.cleanOrphanedData(sheetName, validRDOs)

                    cleanupResults[sheetName] = orphansRemoved
                    totalOrphansRemoved += orphansRemoved

                    if (orphansRemoved > 0) {
                        AppLogger.i(TAG, "✅ $sheetName: $orphansRemoved linha(s) órfã(s) removida(s)")
                    } else {
                        AppLogger.d(TAG, "✓ $sheetName: Nenhum órfão encontrado")
                    }
                } catch (e: Exception) {
                    AppLogger.e(TAG, "❌ Erro ao limpar $sheetName: ${e.message}", e)
                    cleanupResults[sheetName] = -1  // Indica erro
                }
            }

            // 3. Mostrar resultado final
            if (totalOrphansRemoved > 0) {
                AppLogger.i(TAG, "🎯 Limpeza concluída: $totalOrphansRemoved linha(s) órfã(s) removida(s)")
                showNotification(
                    "✓ Limpeza concluída: $totalOrphansRemoved dado(s) órfão(s) removido(s)",
                    autoCancel = true
                )
            } else {
                AppLogger.i(TAG, "✓ Nenhum dado órfão encontrado. Sistema íntegro!")
                showNotification("✓ Dados verificados. Sistema íntegro!", autoCancel = true)
            }

            // Log detalhado dos resultados
            AppLogger.d(TAG, "📊 Resultados da limpeza:")
            cleanupResults.forEach { (sheet, count) ->
                when {
                    count > 0 -> AppLogger.d(TAG, "  - $sheet: $count órfãos removidos")
                    count == 0 -> AppLogger.d(TAG, "  - $sheet: OK (sem órfãos)")
                    else -> AppLogger.e(TAG, "  - $sheet: ERRO durante limpeza")
                }
            }

            Result.success()

        } catch (e: Exception) {
            AppLogger.e(TAG, "❌ Erro durante job de limpeza: ${e.message}", e)
            e.printStackTrace()
            showNotification("⚠ Erro na verificação de dados", autoCancel = true)
            Result.retry()
        }
    }

    /**
     * Mostra notificação de progresso/resultado
     */
    private fun showNotification(message: String, autoCancel: Boolean) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Create notification channel for Android O and above
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW  // Baixa prioridade (silenciosa)
            ).apply {
                description = "Notificações de limpeza e verificação de integridade de dados"
                setSound(null, null)  // Sem som
                enableVibration(false)  // Sem vibração
            }
            notificationManager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle("Controle de Campo")
            .setContentText(message)
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(autoCancel)
            .setOnlyAlertOnce(true)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    /**
     * Cancela notificação
     */
    private fun cancelNotification() {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(NOTIFICATION_ID)
    }
}
