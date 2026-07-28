package com.example.calculadorahh

import android.app.Application
import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.work.*
import com.example.calculadorahh.workers.DataCleanupWorker
import com.example.calculadorahh.workers.RDOSyncWorker
import java.util.concurrent.TimeUnit

/**
 * Application class para configurações globais do app
 */
class CalculadoraHHApplication : Application() {

    companion object {
        private const val PREFS_TEMA = "tema_app"
        private const val KEY_MODO_ESCURO = "modo_escuro"

        /** true se o app deve abrir no tema escuro (padrão do design). */
        fun temaEscuro(context: Context): Boolean =
            context.getSharedPreferences(PREFS_TEMA, Context.MODE_PRIVATE)
                .getBoolean(KEY_MODO_ESCURO, true)

        /** Persiste e aplica a escolha de tema imediatamente. */
        fun definirTemaEscuro(context: Context, escuro: Boolean) {
            context.getSharedPreferences(PREFS_TEMA, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_MODO_ESCURO, escuro).apply()
            aplicarTema(escuro)
        }

        private fun aplicarTema(escuro: Boolean) {
            AppCompatDelegate.setDefaultNightMode(
                if (escuro) AppCompatDelegate.MODE_NIGHT_YES
                else AppCompatDelegate.MODE_NIGHT_NO
            )
        }
    }

    override fun onCreate() {
        super.onCreate()

        // Tema escuro por padrão (identidade visual do redesign). O claro
        // continua disponível pelo botão de tema na tela inicial.
        //
        // Material You (DynamicColors) foi removido de propósito: as cores do
        // papel de parede sobrescreveriam o dourado da Engecom no Android 12+.
        aplicarTema(temaEscuro(this))

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
