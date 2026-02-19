package com.example.calculadorahh.utils

/**
 * Constantes centralizadas do aplicativo.
 *
 * Organiza todos os valores hardcoded em um único local,
 * facilitando manutenção e configuração.
 *
 * @since v2.5.0
 */
object AppConstants {

    // ========== BUSINESS RULES ==========

    /** Meta de horas diárias padrão para cálculo de HH (12 operadores × 6h) */
    const val META_HORAS_DIARIAS_DEFAULT = 72.0

    /** Quantidade padrão para novos serviços */
    const val QUANTIDADE_DEFAULT = 1.0

    /** Máximo de tentativas para operações com retry */
    const val MAX_TENTATIVAS_OPERACAO = 5

    /** Máximo de tentativas de sincronização antes de marcar como erro */
    const val MAX_TENTATIVAS_SYNC = 3


    // ========== SYNC & BACKGROUND TASKS ==========

    /** Intervalo padrão entre sincronizações automáticas (em horas) */
    const val INTERVALO_SYNC_HORAS = 6L

    /** Intervalo para limpeza de dados órfãos (em dias) */
    const val INTERVALO_CLEANUP_DIAS = 7L

    /** Nome do trabalho de sincronização no WorkManager */
    const val WORK_NAME_SYNC = "RDOSyncWork"

    /** Nome do trabalho de limpeza no WorkManager */
    const val WORK_NAME_CLEANUP = "DataCleanupWork"


    // ========== NOTIFICATIONS ==========

    /** ID da notificação de sincronização */
    const val NOTIFICATION_ID_SYNC = 1001

    /** ID da notificação de limpeza de dados */
    const val NOTIFICATION_ID_CLEANUP = 1002

    /** ID da notificação de atualização do app */
    const val NOTIFICATION_ID_UPDATE = 1003

    /** Canal de notificação para sincronização */
    const val NOTIFICATION_CHANNEL_SYNC = "rdo_sync_channel"

    /** Canal de notificação para limpeza */
    const val NOTIFICATION_CHANNEL_CLEANUP = "data_cleanup_channel"

    /** Canal de notificação para atualizações */
    const val NOTIFICATION_CHANNEL_UPDATE = "app_update_channel"


    // ========== DATABASE ==========

    /** Backoff inicial para retry de inserção (em milissegundos) */
    const val BACKOFF_INICIAL_MS = 10L

    /** Multiplicador de backoff exponencial */
    const val BACKOFF_MULTIPLICADOR = 2.0

    /** Página padrão para queries paginadas */
    const val PAGE_SIZE_DEFAULT = 20

    /** Limite máximo de resultados por query */
    const val MAX_QUERY_LIMIT = 1000


    // ========== NETWORK ==========

    /** Timeout padrão para operações de rede (em milissegundos) */
    const val TIMEOUT_NETWORK_MS = 30_000L

    /** Timeout para download de APK (em milissegundos) */
    const val TIMEOUT_DOWNLOAD_APK_MS = 120_000L


    // ========== DATE & TIME FORMATS ==========

    /** Formato de data completa: dd/MM/yyyy */
    const val PATTERN_FULL_DATE = "dd/MM/yyyy"

    /** Formato de data curta: dd.MM.yy */
    const val PATTERN_SHORT_DATE = "dd.MM.yy"

    /** Formato de timestamp: yyyy-MM-dd HH:mm:ss */
    const val PATTERN_TIMESTAMP = "yyyy-MM-dd HH:mm:ss"

    /** Formato de horário: HH:mm */
    const val PATTERN_TIME = "HH:mm"


    // ========== VALIDATION ==========

    /** Range válido de horas (0-23) */
    val VALID_HOUR_RANGE = 0..23

    /** Range válido de minutos (0-59) */
    val VALID_MINUTE_RANGE = 0..59

    /** Regex para validação de formato de horário HH:mm */
    const val REGEX_TIME_FORMAT = "^([01]?[0-9]|2[0-3]):[0-5][0-9]$"

    /** Regex para validação de formato de data dd/MM/yyyy */
    const val REGEX_DATE_FORMAT = "^(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[012])/[0-9]{4}$"


    // ========== GOOGLE SHEETS ==========

    /** Versão dos headers do Google Sheets */
    const val SHEETS_HEADERS_VERSION = 4

    /** Delay entre operações batch para evitar quota (em milissegundos) */
    const val SHEETS_BATCH_DELAY_MS = 100L

    /** Tamanho do batch para operações em massa */
    const val SHEETS_BATCH_SIZE = 100


    // ========== LOGGING ==========

    /** Prefixo para tags de log */
    const val LOG_TAG_PREFIX = "CalculadoraHH"

    /** Habilitar logs verbose em debug */
    const val ENABLE_VERBOSE_LOGS = true


    // ========== UI ==========

    /** Duração padrão de Toast (em milissegundos) */
    const val TOAST_DURATION_SHORT = 2000

    /** Duração longa de Toast (em milissegundos) */
    const val TOAST_DURATION_LONG = 3500

    /** Atraso para animações de UI (em milissegundos) */
    const val UI_ANIMATION_DELAY_MS = 300L
}
