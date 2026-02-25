package com.example.calculadorahh.utils

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import android.widget.Toast
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.services.GoogleSheetsService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.core.content.edit

object SyncHelper {

    private const val TAG = "SyncHelper"
    private const val PREFS_NAME = "sync_validation_prefs"
    private const val KEY_ULTIMO_ID_VALIDADO = "ultimo_id_validado"
    private const val INTERVALO_VALIDACAO = 10 // Validar a cada 10 RDOs novos

    @Volatile
    private var validacaoFeitaNestaSessao = false

    /**
     * Check if device has internet connection
     */
    fun isNetworkAvailable(context: Context): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return false
        val activeNetwork = connectivityManager.getNetworkCapabilities(network) ?: return false

        return when {
            activeNetwork.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> true
            activeNetwork.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> true
            activeNetwork.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> true
            else -> false
        }
    }

    /**
     * Initialize Google Sheets service
     * ✅ CORRIGIDO: Não usa mais variável estática para evitar memory leak
     */
    private suspend fun initializeService(context: Context): GoogleSheetsService? {
        return try {
            val service = GoogleSheetsService(context.applicationContext)
            if (service.initialize()) {
                service
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Erro ao inicializar serviço Google Sheets: ${e.message}", e)
            null
        }
    }

    /**
     * Sync a single RDO after save/update
     * 🔥 VERSÃO MELHORADA com controle robusto de status e retry
     * @param numeroRDOAntigo Se fornecido, deleta entrada antiga da planilha (quando número muda)
     */
    suspend fun syncRDO(
        context: Context,
        rdoId: Long,
        isDelete: Boolean = false,
        showToast: Boolean = true,
        numeroRDOAntigo: String? = null
    ): Boolean =
        withContext(Dispatchers.IO) {
            val databaseHelper = DatabaseHelper.getInstance(context)

            try {
                Log.d(TAG, "🔄 Iniciando sincronização - RDO ID: $rdoId (delete=$isDelete)")

                // Verificar conexão
                if (!isNetworkAvailable(context)) {
                    val mensagem = "Sem conexão com internet"
                    Log.w(TAG, "⚠️ $mensagem")
                    databaseHelper.marcarRDOComErroSync(rdoId, mensagem)

                    withContext(Dispatchers.Main) {
                        if (showToast) {
                            Toast.makeText(context, "Sem conexão. RDO será sincronizado quando houver internet", Toast.LENGTH_SHORT).show()
                        }
                    }
                    return@withContext false
                }

                // Marcar como sincronizando
                databaseHelper.marcarRDOComoSincronizando(rdoId)

                // Inicializar serviço
                val sheetsService = initializeService(context)
                if (sheetsService == null) {
                    val mensagem = "Falha ao inicializar serviço Google Sheets"
                    Log.e(TAG, "❌ $mensagem")
                    databaseHelper.marcarRDOComErroSync(rdoId, mensagem)

                    withContext(Dispatchers.Main) {
                        if (showToast) {
                            Toast.makeText(context, "Erro ao inicializar sincronização", Toast.LENGTH_SHORT).show()
                        }
                    }
                    return@withContext false
                }

                // Obter RDO
                val rdo = databaseHelper.obterRDOPorId(rdoId)
                if (rdo == null) {
                    val mensagem = "RDO não encontrado no banco de dados"
                    Log.e(TAG, "❌ $mensagem")
                    databaseHelper.marcarRDOComErroSync(rdoId, mensagem)

                    withContext(Dispatchers.Main) {
                        if (showToast) {
                            Toast.makeText(context, "Erro: RDO não encontrado", Toast.LENGTH_SHORT).show()
                        }
                    }
                    return@withContext false
                }

                // 🔥 SINCRONIZAR COM GOOGLE SHEETS
                Log.i(TAG, "📤 Enviando RDO ${rdo.numeroRDO} para Google Sheets...")
                val success = sheetsService.syncRDO(rdo, isDelete, numeroRDOAntigo)

                if (success) {
                    // ✅ SUCESSO
                    databaseHelper.marcarRDOComoSincronizado(rdoId)
                    Log.i(TAG, "✅ RDO ID $rdoId sincronizado com sucesso!")

                    withContext(Dispatchers.Main) {
                        if (showToast) {
                            Toast.makeText(context, "✓ RDO ${rdo.numeroRDO} sincronizado", Toast.LENGTH_SHORT).show()
                        }
                    }
                } else {
                    // ❌ FALHA
                    val mensagem = "Erro desconhecido ao enviar para Google Sheets"
                    Log.w(TAG, "⚠️ $mensagem - RDO ID $rdoId")
                    databaseHelper.marcarRDOComErroSync(rdoId, mensagem)

                    withContext(Dispatchers.Main) {
                        if (showToast) {
                            Toast.makeText(context, "Erro ao sincronizar. Tentaremos novamente depois", Toast.LENGTH_SHORT).show()
                        }
                    }
                }

                success

            } catch (e: Exception) {
                // 🔥 CAPTURAR ERROS E REGISTRAR
                val mensagem = e.message ?: "Erro desconhecido"
                Log.e(TAG, "❌ Exceção ao sincronizar RDO ID $rdoId: $mensagem", e)
                databaseHelper.marcarRDOComErroSync(rdoId, mensagem)

                withContext(Dispatchers.Main) {
                    if (showToast) {
                        Toast.makeText(context, "Erro na sincronização: ${e.message?.take(50)}", Toast.LENGTH_SHORT).show()
                    }
                }
                false
            }
        }

    /**
     * Sync all unsynchronized RDOs
     * 🔥 VERSÃO MELHORADA com controle robusto e continuidade em caso de falhas
     */
    suspend fun syncPendingRDOs(context: Context, showToast: Boolean = true, progressCallback: ((Int, Int) -> Unit)? = null): Int =
        withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "🔄 Iniciando sincronização de RDOs pendentes")

                if (!isNetworkAvailable(context)) {
                    Log.w(TAG, "⚠️ Sem conexão de rede disponível")
                    if (showToast) {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(context, "Sem conexão com a internet", Toast.LENGTH_SHORT).show()
                        }
                    }
                    return@withContext 0
                }

                // Inicializar serviço
                val sheetsService = initializeService(context)
                if (sheetsService == null) {
                    Log.e(TAG, "❌ Falha ao inicializar serviço Google Sheets")
                    if (showToast) {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(context, "Erro ao inicializar serviço de sincronização", Toast.LENGTH_SHORT).show()
                        }
                    }
                    return@withContext 0
                }

                // 🔥 FIX Bug 4: Resetar RDOs presos em SYNCING (ex: crash durante sync)
                val databaseHelper = DatabaseHelper.getInstance(context)
                val presosResetados = databaseHelper.resetarRDOsPresos()
                if (presosResetados > 0) {
                    Log.w(TAG, "⚠️ $presosResetados RDO(s) presos em SYNCING foram resetados para PENDING")
                }

                // Obter RDOs não sincronizados
                val rdos = databaseHelper.obterRDOsNaoSincronizados()

                if (rdos.isEmpty()) {
                    Log.d(TAG, "✓ Nenhum RDO pendente para sincronizar")
                    if (showToast) {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(context, "✓ Todos os RDOs já estão sincronizados", Toast.LENGTH_SHORT).show()
                        }
                    }
                    return@withContext 0
                }

                Log.i(TAG, "📋 Sincronizando ${rdos.size} RDO(s) pendente(s)")
                var successCount = 0
                var errorCount = 0

                rdos.forEachIndexed { index, rdo ->
                    try {
                        Log.d(TAG, "🔄 Sincronizando RDO ${index + 1}/${rdos.size} - ${rdo.numeroRDO} (ID: ${rdo.id})")

                        // Marcar como sincronizando
                        databaseHelper.marcarRDOComoSincronizando(rdo.id)

                        // 🔥 TENTAR SINCRONIZAR
                        val success = sheetsService.syncRDO(rdo, false)

                        if (success) {
                            // ✅ SUCESSO
                            databaseHelper.marcarRDOComoSincronizado(rdo.id)
                            successCount++
                            Log.i(TAG, "✅ RDO ${rdo.numeroRDO} sincronizado com sucesso")
                        } else {
                            // ❌ FALHA
                            val mensagem = "Falha ao enviar para Google Sheets"
                            databaseHelper.marcarRDOComErroSync(rdo.id, mensagem)
                            errorCount++
                            Log.w(TAG, "⚠️ Falha ao sincronizar RDO ${rdo.numeroRDO}")
                        }

                        // Callback de progresso
                        progressCallback?.invoke(index + 1, rdos.size)

                    } catch (e: Exception) {
                        // 🔥 CAPTURAR ERRO E CONTINUAR COM PRÓXIMOS
                        val mensagem = e.message ?: "Erro desconhecido"
                        databaseHelper.marcarRDOComErroSync(rdo.id, mensagem)
                        errorCount++
                        Log.e(TAG, "❌ Erro ao sincronizar RDO ${rdo.numeroRDO}: $mensagem", e)
                    }
                }

                // 📊 RESUMO
                Log.i(TAG, "📊 Sincronização concluída: ✅ $successCount sucesso | ❌ $errorCount erros | 📋 Total: ${rdos.size}")

                if (showToast) {
                    withContext(Dispatchers.Main) {
                        val mensagem = if (errorCount > 0) {
                            "✓ $successCount de ${rdos.size} RDOs sincronizados ($errorCount com erro)"
                        } else {
                            "✓ Todos os $successCount RDOs sincronizados com sucesso!"
                        }
                        Toast.makeText(context, mensagem, Toast.LENGTH_LONG).show()
                    }
                }

                successCount

            } catch (e: Exception) {
                Log.e(TAG, "❌ Exceção crítica ao sincronizar RDOs pendentes: ${e.message}", e)
                if (showToast) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(context, "Erro crítico na sincronização: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
                0
            }
        }

    /**
     * 🔥 NOVO: Valida se RDOs marcados como sincronizados realmente existem no Google Sheets
     * Valida de 10 em 10 RDOs criados, apenas 1 vez por sessão
     * @return Quantidade de RDOs remarcados como pendente
     */
    suspend fun validarRDOsSincronizados(context: Context): Int =
        withContext(Dispatchers.IO) {
            try {
                // ✅ Verificar se já validou nesta sessão
                if (validacaoFeitaNestaSessao) {
                    Log.d(TAG, "⏭️ Validação já feita nesta sessão - pulando")
                    return@withContext 0
                }

                if (!isNetworkAvailable(context)) {
                    Log.w(TAG, "⚠️ Sem conexão - validação adiada")
                    return@withContext 0
                }

                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val databaseHelper = DatabaseHelper.getInstance(context)

                // Obter ID do último RDO criado
                val ultimoRDOCriado = databaseHelper.obterUltimoRDO()
                if (ultimoRDOCriado == null) {
                    Log.d(TAG, "✓ Nenhum RDO no banco - validação não necessária")
                    validacaoFeitaNestaSessao = true
                    return@withContext 0
                }

                val ultimoIdCriado = ultimoRDOCriado.id
                val ultimoIdValidado = prefs.getLong(KEY_ULTIMO_ID_VALIDADO, 0)

                // ✅ Verificar se já criou pelo menos 10 RDOs desde a última validação
                val diferencaRDOs = ultimoIdCriado - ultimoIdValidado

                // Se nunca validou (ultimoIdValidado == 0), valida independente da quantidade
                if (ultimoIdValidado > 0 && diferencaRDOs < INTERVALO_VALIDACAO) {
                    Log.d(TAG, "⏭️ Apenas $diferencaRDOs RDO(s) novos desde última validação (necessário $INTERVALO_VALIDACAO) - pulando")
                    validacaoFeitaNestaSessao = true
                    return@withContext 0
                }

                Log.i(TAG, "🔍 Validando RDOs sincronizados ($diferencaRDOs novos desde última validação)...")

                // Inicializar serviço
                val sheetsService = initializeService(context)
                if (sheetsService == null) {
                    Log.e(TAG, "❌ Falha ao inicializar serviço para validação")
                    return@withContext 0
                }

                // Obter últimos 10 RDOs sincronizados
                val rdosSincronizados = databaseHelper.obterRDOsSincronizadosRecentes(INTERVALO_VALIDACAO)

                if (rdosSincronizados.isEmpty()) {
                    Log.d(TAG, "✓ Nenhum RDO sincronizado para validar")
                    validacaoFeitaNestaSessao = true
                    prefs.edit { putLong(KEY_ULTIMO_ID_VALIDADO, ultimoIdCriado) }
                    return@withContext 0
                }

                Log.i(TAG, "📋 Validando ${rdosSincronizados.size} RDO(s) sincronizado(s)")
                var remarcados = 0

                rdosSincronizados.forEach { rdo ->
                    try {
                        // 🔥 FIX: Verificar se RDO existe no Sheets pelo Número RDO (não pelo ID local)
                        val existeNoSheets = sheetsService.verificarSeRDOExiste(rdo.numeroRDO)

                        if (!existeNoSheets) {
                            // RDO marcado como sincronizado mas NÃO está no Sheets!
                            Log.w(TAG, "⚠️ RDO ${rdo.numeroRDO} (ID: ${rdo.id}) marcado como sincronizado MAS não encontrado no Sheets")
                            databaseHelper.marcarRDOComoPendente(rdo.id)
                            remarcados++


                        } else {
                            Log.d(TAG, "✓ RDO ${rdo.numeroRDO} (ID: ${rdo.id}) confirmado no Sheets")
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ Erro ao validar RDO ${rdo.numeroRDO}: ${e.message}", e)
                    }
                }

                if (remarcados > 0) {
                    Log.w(TAG, "⚠️ $remarcados RDO(s) remarcado(s) como pendente - serão re-sincronizados")
                } else {
                    Log.i(TAG, "✅ Todos os RDOs sincronizados estão confirmados no Sheets")
                }

                // ✅ Marcar que validação foi feita nesta sessão
                validacaoFeitaNestaSessao = true

                // ✅ Salvar último ID validado
                prefs.edit { putLong(KEY_ULTIMO_ID_VALIDADO, ultimoIdCriado) }

                remarcados

            } catch (e: Exception) {
                Log.e(TAG, "❌ Erro ao validar RDOs: ${e.message}", e)
                0
            }
        }
}
