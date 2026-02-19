package com.example.calculadorahh.services

import android.util.Log
import com.google.api.services.sheets.v4.Sheets

/**
 * Busca e verificação de existência de RDOs no Google Sheets.
 */
class SheetsLookupHelper(
    private val sheetsService: Sheets,
    private val spreadsheetId: String
) {
    private val tag = "SheetsLookupHelper"

    /**
     * Busca o número da linha pelo Número RDO (coluna B).
     * @return Número da linha (1-indexed) ou null se genuinamente não encontrado
     * @throws Exception se houver erro de rede/API (NÃO retorna null para erros!)
     */
    fun findRowNumberByNumeroRDO(numeroRDO: String): Int? {
        // 🔥 FIX: Não captura exceção — propaga para o caller distinguir
        // "não encontrado" (null) de "erro de rede" (exception)
        val response = sheetsService.spreadsheets().values()
            .get(spreadsheetId, "${SheetsConstants.SHEET_RDO}!B:B")
            .execute()

        val values = response.getValues() ?: return null

        values.forEachIndexed { index, row ->
            if (index > 0 && row.isNotEmpty()) { // Skip header
                val numero = row[0].toString()
                if (numero == numeroRDO) {
                    return index + 1 // Row numbers start at 1
                }
            }
        }

        return null  // Genuinamente não encontrado
    }

    /**
     * Verifica se um RDO existe no Google Sheets pelo Número RDO.
     * @return true se existe, false caso contrário
     */
    fun verificarSeRDOExiste(numeroRDO: String): Boolean {
        return findRowNumberByNumeroRDO(numeroRDO) != null
    }
}
