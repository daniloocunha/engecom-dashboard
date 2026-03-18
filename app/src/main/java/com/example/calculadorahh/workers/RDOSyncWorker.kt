package com.example.calculadorahh.workers

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import android.app.PendingIntent
import android.content.Intent
import com.example.calculadorahh.R
import com.example.calculadorahh.data.models.UpdateStatus
import com.example.calculadorahh.services.GoogleSheetsService
import com.example.calculadorahh.ui.activities.HomeActivity
import com.example.calculadorahh.utils.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Worker para sincronização periódica de RDOs com Google Sheets.
 *
 * Executa a cada 6 horas (configurável via WorkManager).
 * Sincroniza apenas RDOs pendentes para economizar recursos.
 *
 * @since v1.4.0
 * @updated v2.5.0 - Usa AppLogger e ErrorHandler
 */
class RDOSyncWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        private const val TAG = "RDOSyncWorker"
        const val WORK_NAME = AppConstants.WORK_NAME_SYNC
        private const val NOTIFICATION_ID = AppConstants.NOTIFICATION_ID_SYNC
        private const val NOTIFICATION_ID_UPDATE = AppConstants.NOTIFICATION_ID_UPDATE
        private const val CHANNEL_ID = AppConstants.NOTIFICATION_CHANNEL_SYNC
        private const val CHANNEL_ID_UPDATE = AppConstants.NOTIFICATION_CHANNEL_UPDATE
        private const val CHANNEL_NAME = "Sincronização de RDOs"
        private const val CHANNEL_NAME_UPDATE = "Atualizações do App"

        // Notification priorities
        private const val PRIORITY_PROGRESS = NotificationCompat.PRIORITY_LOW
        private const val PRIORITY_SUCCESS = NotificationCompat.PRIORITY_DEFAULT
        private const val PRIORITY_ERROR = NotificationCompat.PRIORITY_HIGH
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        AppLogger.d(TAG, "🔄 Iniciando sincronização automática de RDOs")

        try {
            // ✅ Verificar conectividade
            if (!SyncHelper.isNetworkAvailable(context)) {
                AppLogger.w(TAG, "⚠️ Sem conexão com internet. Agendando retry...")
                return@withContext Result.retry()
            }

            // ✅ Notificação de início (silenciosa)
            showNotification("Sincronizando RDOs...", PRIORITY_PROGRESS, autoCancel = false)

            // ✅ Sincronizar RDOs pendentes
            val successCount = SyncHelper.syncPendingRDOs(context, showToast = false) { current, total ->
                AppLogger.d(TAG, "Sincronizando RDO $current de $total")
                showNotification(
                    "Sincronizando RDOs... ($current/$total)",
                    PRIORITY_PROGRESS,
                    autoCancel = false
                )
            }

            // ✅ Notificação de conclusão
            if (successCount > 0) {
                AppLogger.i(TAG, "✅ Sincronização concluída: $successCount RDO(s) sincronizado(s)")
                showNotification(
                    "✓ $successCount RDO(s) sincronizado(s) com sucesso",
                    PRIORITY_SUCCESS,
                    autoCancel = true
                )
            } else {
                AppLogger.d(TAG, "Nenhum RDO pendente para sincronizar")
                cancelNotification()
            }

            // ✅ Verificar atualização do app (não-bloqueante)
            verificarAtualizacaoApp()

            Result.success()

        } catch (e: Exception) {
            // ✅ Usar ErrorHandler para mensagem amigável
            val userMessage = ErrorHandler.getUserFriendlyMessage(e, "sincronização")
            val technicalMessage = ErrorHandler.getTechnicalMessage(e, "RDOSyncWorker.doWork")

            AppLogger.e(TAG, technicalMessage, e)

            showNotification(
                "⚠ $userMessage Tentaremos novamente em breve.",
                PRIORITY_ERROR,
                autoCancel = true
            )

            Result.retry()
        }
    }

    /**
     * Verifica se há atualização disponível e notifica o usuário se houver.
     * Falhas são silenciosas — não afetam o resultado do sync.
     */
    private suspend fun verificarAtualizacaoApp() {
        try {
            val sheetsService = GoogleSheetsService(context)
            val config = sheetsService.verificarAtualizacao() ?: return

            val status = UpdateChecker.checkUpdate(config)
            UpdateChecker.salvarStatusUpdate(context, status)

            when (status) {
                is UpdateStatus.UpdateAvailable -> {
                    AppLogger.i(TAG, "🔔 Nova versão disponível: ${config.versaoRecomendada}")
                    showUpdateNotification(config.mensagemAviso, obrigatorio = false)
                }
                is UpdateStatus.UpdateRequired -> {
                    AppLogger.i(TAG, "🚨 Atualização obrigatória: ${config.versaoMinima}")
                    showUpdateNotification(config.mensagemBloqueio, obrigatorio = true)
                }
                is UpdateStatus.NoUpdate -> {
                    AppLogger.d(TAG, "App atualizado, nenhuma ação necessária")
                }
            }
        } catch (e: Exception) {
            AppLogger.w(TAG, "⚠️ Verificação de update falhou (não-crítico): ${e.message}")
        }
    }

    /**
     * Exibe notificação de atualização disponível.
     * Ao tocar, abre HomeActivity onde o banner de update estará visível.
     */
    private fun showUpdateNotification(mensagem: String, obrigatorio: Boolean) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID_UPDATE,
                CHANNEL_NAME_UPDATE,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notificações de atualização do Controle de Campo"
            }
            notificationManager.createNotificationChannel(channel)
        }

        val intent = Intent(context, HomeActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val titulo = if (obrigatorio) "Atualização obrigatória" else "Atualização disponível"

        val notification = NotificationCompat.Builder(context, CHANNEL_ID_UPDATE)
            .setContentTitle(titulo)
            .setContentText(mensagem)
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notify(NOTIFICATION_ID_UPDATE, notification)
    }

    /**
     * ✅ OTIMIZADO: Suporta diferentes prioridades para diferentes tipos de notificação
     */
    private fun showNotification(message: String, priority: Int, autoCancel: Boolean) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Create notification channel for Android O and above
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Importância baseada na prioridade da notificação
            val importance = when (priority) {
                PRIORITY_ERROR -> NotificationManager.IMPORTANCE_HIGH
                PRIORITY_SUCCESS -> NotificationManager.IMPORTANCE_DEFAULT
                else -> NotificationManager.IMPORTANCE_LOW
            }

            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                importance
            ).apply {
                description = "Notificações de sincronização de RDOs com Google Sheets"
                // Desabilitar som e vibração para progresso (LOW)
                if (priority == PRIORITY_PROGRESS) {
                    setSound(null, null)
                    enableVibration(false)
                }
            }
            notificationManager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle("Controle de Campo")
            .setContentText(message)
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(priority)
            .setAutoCancel(autoCancel)
            .setOnlyAlertOnce(priority == PRIORITY_PROGRESS)  // Só alerta uma vez se for progresso
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    /**
     * Cancela notificação em andamento
     */
    private fun cancelNotification() {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(NOTIFICATION_ID)
    }
}
