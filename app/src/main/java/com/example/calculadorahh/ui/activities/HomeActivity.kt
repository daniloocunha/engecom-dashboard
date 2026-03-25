package com.example.calculadorahh.ui.activities

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.calculadorahh.BuildConfig
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.data.models.RDODataCompleto
import com.example.calculadorahh.data.models.SyncStatus
import com.example.calculadorahh.data.models.UpdateConfig
import com.example.calculadorahh.data.models.UpdateStatus
import com.example.calculadorahh.databinding.ActivityHomeBinding
import com.example.calculadorahh.services.GoogleSheetsService
import com.example.calculadorahh.utils.SyncHelper
import com.example.calculadorahh.utils.UpdateChecker
import com.example.calculadorahh.utils.UpdateDownloader
import com.example.calculadorahh.utils.getParcelableCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Calendar

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding

    // Config de update pendente (usada ao voltar do Settings de permissão)
    private var pendingUpdateConfig: UpdateConfig? = null

    // Launcher para receber resultado do Histórico
    private val historicoLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            result.data?.let { data ->
                val rdoModelo = data.getParcelableCompat<RDODataCompleto>("modelo_rdo")
                rdoModelo?.let { rdo ->
                    val intent = Intent(this, MainActivity::class.java).apply {
                        putExtra("TAB_POSITION", 1)
                        putExtra("USAR_MODELO", true)
                        putExtra("modelo_rdo", rdo)
                    }
                    startActivity(intent)
                }
            }
        }
    }

    // Launcher para retornar do Settings de permissão de instalação
    private val permissaoInstalacaoLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        // Ao voltar do Settings, re-checar permissão e iniciar download se concedida
        val config = pendingUpdateConfig
        if (config != null && UpdateDownloader.temPermissaoInstalar(this)) {
            iniciarDownload(config)
        }
    }

    @SuppressLint("SetTextI18n")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.tvAppVersion.text = "Versão ${BuildConfig.VERSION_NAME} • Danilo Cunha"

        configurarListeners()
        verificarStatusUpdate()
    }

    override fun onResume() {
        super.onResume()
        // Re-verificar após voltar do Settings: se permissão concedida e update pendente, inicia download
        val config = pendingUpdateConfig
        if (config != null && UpdateDownloader.temPermissaoInstalar(this)) {
            pendingUpdateConfig = null
            iniciarDownload(config)
        }
        carregarEstatisticas()
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Listeners
    // ──────────────────────────────────────────────────────────────────────────

    private fun configurarListeners() {
        binding.cardCalculadora.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java).apply {
                putExtra("TAB_POSITION", 0)
            })
        }

        binding.cardRDO.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java).apply {
                putExtra("TAB_POSITION", 1)
            })
        }

        binding.cardHistorico.setOnClickListener {
            historicoLauncher.launch(Intent(this, HistoricoRDOActivity::class.java))
        }

        binding.btnSyncAllRDOs.setOnClickListener {
            sincronizarTodosRDOs()
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Estatísticas rápidas
    // ──────────────────────────────────────────────────────────────────────────

    @SuppressLint("SetTextI18n")
    private fun carregarEstatisticas() {
        lifecycleScope.launch {
            val db = DatabaseHelper.getInstance(this@HomeActivity)

            // Queries de banco em IO
            val hoje = withContext(Dispatchers.IO) {
                val cal = Calendar.getInstance()
                val dia = "%02d".format(cal.get(Calendar.DAY_OF_MONTH))
                val mes = "%02d".format(cal.get(Calendar.MONTH) + 1)
                val ano = cal.get(Calendar.YEAR)
                val dataHoje = "$dia/$mes/$ano"
                db.obterRDOsPorData(dataHoje).size
            }

            val pendentes = withContext(Dispatchers.IO) {
                db.obterRDOsNaoSincronizados().size
            }

            val totalMes = withContext(Dispatchers.IO) {
                val cal = Calendar.getInstance()
                val mes = "%02d".format(cal.get(Calendar.MONTH) + 1)
                val ano = cal.get(Calendar.YEAR)
                val prefixoMes = "/$mes/$ano"
                db.obterTodosRDOs().count { it.data.endsWith(prefixoMes) }
            }

            // Atualizar UI na main thread
            binding.tvStatHoje.text = hoje.toString()
            binding.tvStatPendentes.text = pendentes.toString()
            binding.tvStatMes.text = totalMes.toString()

            if (pendentes > 0) {
                binding.chipSyncStatus.text = "↑ $pendentes pendentes de sync"
            } else {
                binding.chipSyncStatus.text = "✓ Tudo sincronizado"
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Auto-update
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Lê o status de update salvo pelo RDOSyncWorker e exibe o banner ou dialog adequado.
     */
    private fun verificarStatusUpdate() {
        when (val status = UpdateChecker.lerStatusUpdate(this)) {
            is UpdateStatus.UpdateAvailable -> mostrarBannerUpdate(status.config, obrigatorio = false)
            is UpdateStatus.UpdateRequired -> mostrarDialogUpdateObrigatorio(status.config)
            else -> { /* nenhuma ação */ }
        }
    }

    /**
     * Exibe o banner azul não-bloqueante no topo da tela.
     */
    private fun mostrarBannerUpdate(config: UpdateConfig, obrigatorio: Boolean) {
        binding.cardUpdateBanner.visibility = View.VISIBLE
        binding.tvUpdateTitle.text = if (obrigatorio) "Atualização obrigatória" else "Atualização disponível"
        binding.tvUpdateMessage.text = config.mensagemAviso

        binding.btnAtualizar.setOnClickListener {
            solicitarAtualizacao(config)
        }
    }

    /**
     * Exibe dialog bloqueante para atualização obrigatória (sem botão de fechar).
     */
    private fun mostrarDialogUpdateObrigatorio(config: UpdateConfig) {
        AlertDialog.Builder(this)
            .setTitle("Atualização obrigatória")
            .setMessage(config.mensagemBloqueio)
            .setCancelable(false)
            .setPositiveButton("Atualizar agora") { _, _ ->
                solicitarAtualizacao(config)
            }
            .show()

        // Também mostrar o banner caso o dialog seja dispensado de alguma forma
        mostrarBannerUpdate(config, obrigatorio = true)
    }

    /**
     * Verifica permissão de instalação antes de iniciar o download.
     * Se não tiver permissão, explica e abre Settings.
     */
    private fun solicitarAtualizacao(config: UpdateConfig) {
        if (UpdateDownloader.temPermissaoInstalar(this)) {
            iniciarDownload(config)
        } else {
            mostrarDialogPermissao(config)
        }
    }

    /**
     * Explica por que a permissão é necessária e redireciona ao Settings.
     */
    private fun mostrarDialogPermissao(config: UpdateConfig) {
        pendingUpdateConfig = config
        AlertDialog.Builder(this)
            .setTitle("Permissão necessária")
            .setMessage(
                "Para instalar atualizações automaticamente, o app precisa de permissão " +
                "para instalar aplicativos.\n\nIsso é necessário apenas uma vez."
            )
            .setPositiveButton("Conceder permissão") { _, _ ->
                abrirSettingsPermissao()
            }
            .setNegativeButton("Agora não", null)
            .show()
    }

    /**
     * Abre a tela de Settings específica para permissão de instalação deste app.
     */
    private fun abrirSettingsPermissao() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:$packageName")
            )
            permissaoInstalacaoLauncher.launch(intent)
        }
    }

    /**
     * Inicia o download do APK com progress dialog e valida MD5.
     */
    private fun iniciarDownload(config: UpdateConfig) {
        // Desabilitar botão para evitar duplo clique
        binding.btnAtualizar.isEnabled = false
        binding.btnAtualizar.text = "Baixando... 0%"

        lifecycleScope.launch {
            try {
                val apkFile = UpdateDownloader.download(
                    url = config.urlDownload,
                    expectedMd5 = config.hashMd5,
                    context = this@HomeActivity
                ) { progress ->
                    runOnUiThread { binding.btnAtualizar.text = "Baixando... $progress%" }
                }

                if (apkFile != null) {
                    binding.btnAtualizar.text = "Instalando..."
                    UpdateChecker.limparStatusUpdate(this@HomeActivity)
                    UpdateDownloader.instalar(apkFile, this@HomeActivity)
                    // Após chamar instalar(), Android abre o instalador nativo
                    // O banner permanece até o app ser reiniciado após a instalação
                } else {
                    mostrarErroDownload()
                }
            } catch (e: Exception) {
                mostrarErroDownload()
            } finally {
                binding.btnAtualizar.isEnabled = true
                if (binding.btnAtualizar.text == "Instalando...") {
                    binding.btnAtualizar.text = "Atualizar"
                } else if (binding.btnAtualizar.text.startsWith("Baixando")) {
                    binding.btnAtualizar.text = "Atualizar"
                }
            }
        }
    }

    private fun mostrarErroDownload() {
        binding.btnAtualizar.text = "Atualizar"
        AlertDialog.Builder(this)
            .setTitle("Erro no download")
            .setMessage("Não foi possível baixar a atualização. Verifique sua conexão e tente novamente.")
            .setPositiveButton("OK", null)
            .show()
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Sync manual
    // ──────────────────────────────────────────────────────────────────────────

    @SuppressLint("SetTextI18n")
    private fun sincronizarTodosRDOs() {
        val db = DatabaseHelper.getInstance(this)
        val rdosNaoSincronizados = db.obterRDOsNaoSincronizados()

        if (rdosNaoSincronizados.isEmpty()) {
            // Mesmo sem RDOs pendentes, verifica se há update disponível
            binding.btnSyncAllRDOs.isEnabled = false
            binding.btnSyncAllRDOs.text = "Verificando atualizações..."
            lifecycleScope.launch {
                try {
                    val updateConfig = withContext(Dispatchers.IO) {
                        try { GoogleSheetsService(this@HomeActivity).verificarAtualizacao() }
                        catch (e: Exception) { null }
                    }
                    if (updateConfig != null) {
                        val status = UpdateChecker.checkUpdate(updateConfig)
                        UpdateChecker.salvarStatusUpdate(this@HomeActivity, status)
                        verificarStatusUpdate()
                    }
                } finally {
                    binding.btnSyncAllRDOs.isEnabled = true
                    binding.btnSyncAllRDOs.text = "Sincronizar todos os RDOs"
                }
                AlertDialog.Builder(this@HomeActivity)
                    .setTitle("Sincronização")
                    .setMessage("Todos os RDOs já estão sincronizados!")
                    .setPositiveButton("OK", null)
                    .show()
            }
            return
        }

        AlertDialog.Builder(this)
            .setTitle("Sincronizar RDOs")
            .setMessage("Deseja sincronizar ${rdosNaoSincronizados.size} RDO(s) pendente(s)?")
            .setPositiveButton("Sim") { _, _ ->
                binding.btnSyncAllRDOs.isEnabled = false
                binding.btnSyncAllRDOs.text = "Sincronizando..."

                lifecycleScope.launch {
                    try {
                        val successCount = SyncHelper.syncPendingRDOs(
                            this@HomeActivity,
                            showToast = true
                        ) { current, total ->
                            binding.btnSyncAllRDOs.text = "Sincronizando $current/$total..."
                        }

                        // Verificar update logo após o sync manual
                        binding.btnSyncAllRDOs.text = "Verificando atualizações..."
                        val updateConfig = withContext(Dispatchers.IO) {
                            try { GoogleSheetsService(this@HomeActivity).verificarAtualizacao() }
                            catch (e: Exception) { null }
                        }

                        if (updateConfig != null) {
                            val status = UpdateChecker.checkUpdate(updateConfig)
                            UpdateChecker.salvarStatusUpdate(this@HomeActivity, status)
                            verificarStatusUpdate()
                        }

                        AlertDialog.Builder(this@HomeActivity)
                            .setTitle("Sincronização concluída")
                            .setMessage("$successCount de ${rdosNaoSincronizados.size} RDO(s) sincronizado(s) com sucesso!")
                            .setPositiveButton("OK", null)
                            .show()
                    } finally {
                        binding.btnSyncAllRDOs.isEnabled = true
                        binding.btnSyncAllRDOs.text = "Sincronizar todos os RDOs"
                    }
                }
            }
            .setNegativeButton("Não", null)
            .show()
    }
}
