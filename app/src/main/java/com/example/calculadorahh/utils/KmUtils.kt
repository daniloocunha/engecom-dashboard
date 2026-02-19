package com.example.calculadorahh.utils

/**
 * Utilitários para conversão e formatação de KM no formato ferroviário.
 *
 * Formato: "123+456" = 123 km + 456 metros = 123.456 km
 *
 * @since v2.5.0 - Extraído de TransportesManager e RDOFragment para evitar duplicação
 */
object KmUtils {

    /**
     * Converte string no formato "123+456" para Double (123.456 km)
     *
     * @param kmText Texto no formato "123+456" ou número simples
     * @return Valor em km como Double, ou null se inválido
     */
    fun converterKmParaDouble(kmText: String): Double? {
        return try {
            // Remove espaços e pontos
            val texto = kmText.replace(".", "").replace(" ", "").trim()

            if (texto.isEmpty()) return null

            // Verifica se tem o separador "+"
            if (texto.contains("+")) {
                val partes = texto.split("+")
                if (partes.size != 2) return null

                val kmInteiros = partes[0].toIntOrNull() ?: return null
                val metros = partes[1].toIntOrNull() ?: return null

                // Converte metros para km (divide por 1000)
                kmInteiros + (metros / 1000.0)
            } else {
                // Se não tem "+", considera apenas km inteiros
                texto.toDoubleOrNull()
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Formata KM (Double) para exibição/edição no formato "123+456"
     *
     * @param km Valor em km como Double (ex: 123.456)
     * @return String formatada (ex: "123+456")
     */
    fun formatarKm(km: Double): String {
        val kmInteiros = km.toInt()
        val metros = ((km - kmInteiros) * 1000).toInt()

        return if (metros > 0) {
            "$kmInteiros+${metros.toString().padStart(3, '0')}"
        } else {
            kmInteiros.toString()
        }
    }
}
