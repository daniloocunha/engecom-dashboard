package com.example.calculadorahh

import android.app.Application
import android.os.Build
import androidx.work.*
import com.example.calculadorahh.workers.DataCleanupWorker
import com.example.calculadorahh.workers.RDOSyncWorker
import com.google.android.material.color.DynamicColors
import java.util.concurrent.TimeUnit

/**
 * Application class para configurações globais do app
 */
class CalculadoraHHApplication : Application() {

    override fun onCreate() {
        super.onCreate()

        // Habilitar cores dinâmicas do Material You (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            DynamicColors.applyToActivitiesIfAvailable(this)
        }

        // Configurar sincronização periódica de RDOs
        setupPeriodicSync()

        // 🆕 v2.4.0: Configurar limpeza semanal de dados órfãos
        setupDataCleanup()
    }

    private fun setupPeriodicSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true) // Não executar se bateria baixa
            .build()

        val syncWorkRequest = PeriodicWorkRequestBuilder<RDOSyncWorker>(
            6, TimeUnit.HOURS // Sync every 6 hours
        )
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                15, TimeUnit.MINUTES
            )
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            RDOSyncWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            syncWorkRequest
        )
    }

    /**
     * 🆕 v2.4.0: Configurar job de limpeza semanal de dados órfãos
     * Executa 1x por semana para remover dados de RDOs deletados
     */
    private fun setupDataCleanup() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val cleanupWorkRequest = PeriodicWorkRequestBuilder<DataCleanupWorker>(
            7, TimeUnit.DAYS  // 🧹 Executa 1x por semana
        )
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                1, TimeUnit.HOURS
            )
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            DataCleanupWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            cleanupWorkRequest
        )
    }
}
