package com.example.calculadorahh.ui.activities

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.animation.AnimationUtils
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.example.calculadorahh.BuildConfig
import com.example.calculadorahh.CalculadoraHHApplication
import com.example.calculadorahh.R
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.domain.managers.ChecklistManager
import com.example.calculadorahh.data.models.RDODataCompleto
import com.example.calculadorahh.data.models.SyncStatus
import com.example.calculadorahh.data.models.UpdateConfig
import com.example.calculadorahh.data.models.UpdateStatus
import com.example.calculadorahh.databinding.ActivityHomeBinding
import com.example.calculadorahh.services.GoogleSheetsService
import com.example.calculadorahh.ui.components.BottomNavHelper
import com.example.calculadorahh.utils.SyncHelper
import com.example.calculadorahh.utils.UpdateChecker
import com.example.calculadorahh.utils.UpdateDownloader
import com.example.calculadorahh.utils.getParcelableCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class HomeActivity : AppCompatActivity() {

    companion object {
        /** Quantos RDOs recentes aparecem na tela inicial. */
        private const val MAX_RECENTES = 3
    }

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

    // Launcher do prompt de permissão de notificações (Android 13+).
    // Resultado não bloqueia nada — sync e updates funcionam sem notificações.
    private val permissaoNotificacaoLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* sem ação: permissão é opcional */ }

    @SuppressLint("SetTextI18n")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.tvAppVersion.text = "Versão ${BuildConfig.VERSION_NAME} • Danilo Cunha"

        BottomNavHelper.configurar(this, BottomNavHelper.Aba.INICIO)
        configurarHero()
        configurarBotaoTema()
        configurarListeners()
        verificarStatusUpdate()
        solicitarPermissaoNotificacao()
    }

    /**
     * Solicita POST_NOTIFICATIONS no Android 13+ (API 33).
     * Sem essa permissão as notificações de sync e de atualização obrigatória
     * do RDOSyncWorker falham silenciosamente. O sistema só exibe o prompt
     * enquanto o usuário não decidir; negações repetidas são respeitadas.
     */
    private fun solicitarPermissaoNotificacao() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            permissaoNotificacaoLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
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
        carregarRecentes()
        verificarUpdateEmBackground()
    }

    /**
     * Consulta a aba Config do Sheets em background toda vez que o app abre.
     * Não bloqueia a UI — exibe o banner apenas se houver update disponível.
     */
    private fun verificarUpdateEmBackground() {
        lifecycleScope.launch {
            val updateConfig = withContext(Dispatchers.IO) {
                try { GoogleSheetsService(this@HomeActivity).verificarAtualizacao() }
                catch (e: Exception) { null }
            }
            if (updateConfig != null) {
                val status = UpdateChecker.checkUpdate(updateConfig)
                UpdateChecker.salvarStatusUpdate(this@HomeActivity, status)
                verificarStatusUpdate()
            }
        }
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

        binding.cardChecklist.setOnClickListener {
            mostrarSeletorAtividade()
        }

        binding.btnSyncAllRDOs.setOnClickListener {
            sincronizarTodosRDOs()
        }
    }

    /** Diálogo de seleção do tipo de atividade antes de abrir o checklist. */
    private fun mostrarSeletorAtividade() {
        val tipos = ChecklistManager.TIPOS
        val nomes = tipos.map { it.nome }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Qual atividade inspecionar?")
            .setItems(nomes) { _, which ->
                val tipo = tipos[which]
                startActivity(Intent(this, ChecklistInspecaoActivity::class.java).apply {
                    putExtra(ChecklistInspecaoActivity.EXTRA_TIPO, tipo.id)
                })
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Hero e tema
    // ──────────────────────────────────────────────────────────────────────────

    /** Data por extenso, saudação conforme a hora e pulsar do dot de status. */
    @SuppressLint("SetTextI18n")
    private fun configurarHero() {
        val agora = Calendar.getInstance()
        val formato = SimpleDateFormat("EEE, dd 'de' MMMM 'de' yyyy", Locale("pt", "BR"))
        binding.tvHeroData.text = formato.format(agora.time)
            .replaceFirstChar { it.uppercase() }

        val hora = agora.get(Calendar.HOUR_OF_DAY)
        binding.tvHeroSaudacao.text = when {
            hora < 12 -> "Bom dia! 👋"
            hora < 18 -> "Boa tarde! 👋"
            else -> "Boa noite! 👋"
        }

        binding.dotSyncStatus.startAnimation(
            AnimationUtils.loadAnimation(this, R.anim.pulse)
        )
    }

    /**
     * Alterna entre tema escuro (padrão do redesign) e claro. O ícone mostra
     * para qual tema o toque leva.
     */
    private fun configurarBotaoTema() {
        atualizarIconeTema()
        binding.btnAlternarTema.setOnClickListener {
            val escuroAgora = CalculadoraHHApplication.temaEscuro(this)
            CalculadoraHHApplication.definirTemaEscuro(this, !escuroAgora)
            recreate()
        }
    }

    private fun atualizarIconeTema() {
        val escuro = CalculadoraHHApplication.temaEscuro(this)
        binding.btnAlternarTema.setImageResource(
            if (escuro) R.drawable.ic_light_mode else R.drawable.ic_dark_mode
        )
        binding.btnAlternarTema.contentDescription =
            if (escuro) "Mudar para tema claro" else "Mudar para tema escuro"
    }

    // ──────────────────────────────────────────────────────────────────────────
    // RDOs recentes
    // ──────────────────────────────────────────────────────────────────────────

    /** Lista os RDOs mais recentes na tela inicial (atalho para o Histórico). */
    @SuppressLint("SetTextI18n")
    private fun carregarRecentes() {
        lifecycleScope.launch {
            val recentes = withContext(Dispatchers.IO) {
                DatabaseHelper.getInstance(this@HomeActivity)
                    .obterTodosRDOs()
                    .take(MAX_RECENTES)
            }

            binding.containerRecentes.removeAllViews()
            binding.tvLabelRecentes.visibility =
                if (recentes.isEmpty()) View.GONE else View.VISIBLE

            val inflater = LayoutInflater.from(this@HomeActivity)
            for (rdo in recentes) {
                val item = inflater.inflate(
                    R.layout.item_home_recente, binding.containerRecentes, false
                )
                item.findViewById<TextView>(R.id.tvRecenteNumero).text = rdo.numeroRDO

                val detalhes = listOf(rdo.local, "OS ${rdo.numeroOS}", rdo.encarregado)
                    .filter { it.isNotBlank() && it != "OS " }
                item.findViewById<TextView>(R.id.tvRecenteDetalhe).text =
                    detalhes.joinToString(" · ")

                val sincronizado = SyncStatus.fromString(rdo.syncStatus) == SyncStatus.SYNCED
                item.findViewById<TextView>(R.id.tvRecenteStatus).apply {
                    text = if (sincronizado) "✓ SYNC" else "⏳ PENDENTE"
                    setBackgroundResource(
                        if (sincronizado) R.drawable.bg_badge_sync
                        else R.drawable.bg_badge_pendente
                    )
                    setTextColor(
                        ContextCompat.getColor(
                            this@HomeActivity,
                            if (sincronizado) R.color.green_sync else R.color.amber_pending
                        )
                    )
                }

                item.setOnClickListener {
                    historicoLauncher.launch(Intent(this@HomeActivity, HistoricoRDOActivity::class.java))
                }
                (binding.containerRecentes as LinearLayout).addView(item)
            }
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
