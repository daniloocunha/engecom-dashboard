package com.example.calculadorahh.data.models

/**
 * Status de sincronização de um RDO
 */
enum class SyncStatus(val displayName: String, val description: String) {
    /**
     * RDO ainda não foi sincronizado com Google Sheets
     */
    PENDING("Pendente", "Aguardando sincronização"),

    /**
     * RDO sincronizado com sucesso
     */
    SYNCED("Sincronizado", "Sincronizado com sucesso"),

    /**
     * Tentativa de sincronização em andamento
     */
    SYNCING("Sincronizando", "Sincronização em andamento"),

    /**
     * Erro ao tentar sincronizar (após tentativas)
     */
    ERROR("Erro", "Erro na sincronização"),

    /**
     * Falha temporária (irá retentar)
     */
    RETRY("Aguardando retry", "Tentará novamente em breve");

    companion object {
        fun fromString(value: String?): SyncStatus {
            return when (value?.lowercase()) {
                "pending" -> PENDING
                "synced" -> SYNCED
                "syncing" -> SYNCING
                "error" -> ERROR
                "retry" -> RETRY
                else -> PENDING
            }
        }
    }

    fun toDbValue(): String = name.lowercase()
}
