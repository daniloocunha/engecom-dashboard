package com.example.calculadorahh.ui.activities

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.calculadorahh.databinding.ActivityHistoricoRdoBinding
import com.example.calculadorahh.domain.managers.JustificativasHIManager
import com.example.calculadorahh.utils.RDORelatorioUtil
import com.example.calculadorahh.utils.SyncHelper
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.data.models.*
import com.example.calculadorahh.R
import com.example.calculadorahh.ui.adapters.HistoricoRDOAdapter
import com.example.calculadorahh.ui.components.BottomNavHelper
import java.text.SimpleDateFormat
import java.util.*

class HistoricoRDOActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHistoricoRdoBinding
    private lateinit var adapter: HistoricoRDOAdapter
    private lateinit var databaseHelper: DatabaseHelper
    private var currentData: String = ""

    /** Filtro de período ativo na lista. */
    private enum class Filtro { TODOS, HOJE, SEMANA, MES, DATA }

    private var filtroAtual = Filtro.HOJE
    private var termoBusca = ""
    /** Todos os RDOs carregados do banco; a lista exibida é derivada daqui. */
    private var todosRDOs: List<RDODataCompleto> = emptyList()

    @SuppressLint("SetTextI18n")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHistoricoRdoBinding.inflate(layoutInflater)
        setContentView(binding.root)

        databaseHelper = DatabaseHelper.getInstance(this)
        binding.rvHistoricoRDO.layoutManager = LinearLayoutManager(this)

        // Criar adapter uma única vez com callbacks que referenciam currentData
        adapter = HistoricoRDOAdapter(
            rdoList = mutableListOf(),
            context = this,
            onDeletar = { rdo -> deletarRDO(rdo, currentData) },
            onEnviar = { rdo -> compartilharRDO(rdo) },
            onUsarModelo = { rdo -> usarComoModelo(rdo) },
            onEditar = { rdo -> editarRDO(rdo) },
            onSyncIndividual = { rdo -> sincronizarRDOIndividual(rdo, currentData) }
        )
        binding.rvHistoricoRDO.adapter = adapter

        binding.toolbar.setNavigationOnClickListener { finish() }

        // 🔥 NOVO: Validar RDOs sincronizados (1x por sessão, a cada 10 RDOs criados)
        lifecycleScope.launch {
            val remarcados = SyncHelper.validarRDOsSincronizados(this@HistoricoRDOActivity)
            if (remarcados > 0) {
                Toast.makeText(
                    this@HistoricoRDOActivity,
                    "⚠️ $remarcados RDO(s) não encontrado(s) no Sheets - serão re-sincronizados",
                    Toast.LENGTH_LONG
                ).show()
            }
        }

        BottomNavHelper.configurar(this, BottomNavHelper.Aba.HISTORICO)

        val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        currentData = sdf.format(Calendar.getInstance().time)
        binding.tvDataSelecionada.text = "Data: $currentData"

        configurarFiltros()
        configurarBusca()

        // Listener para mudança de data no calendário
        binding.calendarView.setOnDateChangeListener { _, year, month, dayOfMonth ->
            val calendar = Calendar.getInstance()
            calendar.set(year, month, dayOfMonth)
            currentData = sdf.format(calendar.time)
            binding.tvDataSelecionada.text = "Data: $currentData"
            filtroAtual = Filtro.DATA
            atualizarChips()
            aplicarFiltros()
        }

        carregarRDOs()
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Filtros, busca e estatísticas
    // ──────────────────────────────────────────────────────────────────────────

    private fun configurarFiltros() {
        binding.chipTodos.setOnClickListener { selecionarFiltro(Filtro.TODOS) }
        binding.chipHoje.setOnClickListener { selecionarFiltro(Filtro.HOJE) }
        binding.chipSemana.setOnClickListener { selecionarFiltro(Filtro.SEMANA) }
        binding.chipMes.setOnClickListener { selecionarFiltro(Filtro.MES) }
        binding.chipCalendario.setOnClickListener {
            val visivel = binding.containerCalendario.visibility == View.VISIBLE
            binding.containerCalendario.visibility = if (visivel) View.GONE else View.VISIBLE
            if (!visivel) selecionarFiltro(Filtro.DATA) else atualizarChips()
        }
        atualizarChips()
    }

    private fun selecionarFiltro(filtro: Filtro) {
        filtroAtual = filtro
        atualizarChips()
        aplicarFiltros()
    }

    /** Destaca o chip do filtro ativo (o ativo deixa de ser clicável). */
    private fun atualizarChips() {
        val chips = listOf(
            binding.chipTodos to Filtro.TODOS,
            binding.chipHoje to Filtro.HOJE,
            binding.chipSemana to Filtro.SEMANA,
            binding.chipMes to Filtro.MES,
            binding.chipCalendario to Filtro.DATA
        )
        for ((chip, filtro) in chips) {
            val ativo = filtro == filtroAtual
            chip.setBackgroundResource(
                if (ativo) R.drawable.bg_chip_ativo else R.drawable.bg_chip_inativo
            )
            chip.setTextColor(
                ContextCompat.getColor(this, if (ativo) R.color.on_gold else R.color.text_muted)
            )
            (chip as TextView).setTypeface(
                chip.typeface,
                if (ativo) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL
            )
        }
    }

    private fun configurarBusca() {
        binding.etBusca.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                termoBusca = s?.toString()?.trim().orEmpty()
                aplicarFiltros()
            }
        })
    }

    /** Carrega tudo uma vez; filtro e busca são aplicados em memória. */
    private fun carregarRDOs() {
        lifecycleScope.launch {
            todosRDOs = withContext(Dispatchers.IO) { databaseHelper.obterTodosRDOs() }
            aplicarFiltros()
        }
    }

    @SuppressLint("SetTextI18n")
    private fun aplicarFiltros() {
        val filtrados = todosRDOs
            .filter { noPeriodo(it.data) }
            .filter { casaBusca(it) }

        binding.tvTotalRDOs.text = "Total de RDOs: ${filtrados.size}"
        binding.tvVazio.visibility = if (filtrados.isEmpty()) View.VISIBLE else View.GONE
        adapter.atualizarLista(filtrados)
        atualizarEstatisticas(filtrados)
    }

    /** Estatísticas do conjunto exibido (total, sincronizados, pendentes). */
    @SuppressLint("SetTextI18n")
    private fun atualizarEstatisticas(lista: List<RDODataCompleto>) {
        val sincronizados = lista.count {
            SyncStatus.fromString(it.syncStatus) == SyncStatus.SYNCED
        }
        binding.tvStatTotal.text = lista.size.toString()
        binding.tvStatSync.text = sincronizados.toString()
        binding.tvStatPendente.text = (lista.size - sincronizados).toString()
    }

    private fun casaBusca(rdo: RDODataCompleto): Boolean {
        if (termoBusca.isBlank()) return true
        val termo = termoBusca.lowercase()
        return listOf(rdo.numeroRDO, rdo.numeroOS, rdo.local, rdo.encarregado, rdo.codigoTurma)
            .any { it.lowercase().contains(termo) }
    }

    /** true se a data "dd/MM/yyyy" do RDO cai no período do filtro ativo. */
    private fun noPeriodo(data: String): Boolean {
        if (filtroAtual == Filtro.TODOS) return true
        if (filtroAtual == Filtro.DATA) return data == currentData

        val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        val dataRDO = try { sdf.parse(data) } catch (e: Exception) { null } ?: return false

        val hoje = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        val cal = Calendar.getInstance().apply { time = dataRDO }

        return when (filtroAtual) {
            Filtro.HOJE ->
                cal.get(Calendar.YEAR) == hoje.get(Calendar.YEAR) &&
                    cal.get(Calendar.DAY_OF_YEAR) == hoje.get(Calendar.DAY_OF_YEAR)
            Filtro.SEMANA -> {
                val inicioSemana = (hoje.clone() as Calendar).apply {
                    set(Calendar.DAY_OF_WEEK, firstDayOfWeek)
                }
                !cal.before(inicioSemana) && !cal.after(hoje)
            }
            Filtro.MES ->
                cal.get(Calendar.YEAR) == hoje.get(Calendar.YEAR) &&
                    cal.get(Calendar.MONTH) == hoje.get(Calendar.MONTH)
            else -> true
        }
    }

    override fun onResume() {
        super.onResume()
        carregarRDOs()
    }

    override fun onDestroy() {
        super.onDestroy()
        binding.calendarView.setOnDateChangeListener(null)
    }

    private fun deletarRDO(rdo: RDODataCompleto, data: String) {
        AlertDialog.Builder(this)
            .setTitle("Confirmar exclusão")
            .setMessage("Deseja realmente excluir o RDO ${rdo.numeroRDO}?")
            .setPositiveButton("Sim") { _, _ ->
                lifecycleScope.launch {
                    try {
                        // 1. Sincronizar marcação de deletado ANTES de remover localmente
                        val syncSuccess = SyncHelper.syncRDO(
                            this@HistoricoRDOActivity,
                            rdo.id,
                            isDelete = true,
                            showToast = false  // Não mostrar toast intermediário
                        )

                        if (syncSuccess) {
                            // 2. SOMENTE deletar localmente SE sync teve sucesso
                            withContext(Dispatchers.IO) {
                                databaseHelper.deletarRDO(rdo.id)
                            }
                            Toast.makeText(
                                this@HistoricoRDOActivity,
                                "RDO ${rdo.numeroRDO} excluído com sucesso",
                                Toast.LENGTH_SHORT
                            ).show()
                        } else {
                            // 3. Sync falhou - perguntar se deseja deletar apenas localmente
                            withContext(Dispatchers.Main) {
                                AlertDialog.Builder(this@HistoricoRDOActivity)
                                    .setTitle("Falha na sincronização")
                                    .setMessage(
                                        "Não foi possível marcar o RDO como deletado no Google Sheets.\n\n" +
                                        "Deseja excluir apenas localmente?\n\n" +
                                        "ATENÇÃO: O RDO permanecerá visível no Google Sheets."
                                    )
                                    .setPositiveButton("Excluir local") { _, _ ->
                                        lifecycleScope.launch {
                                            withContext(Dispatchers.IO) {
                                                databaseHelper.deletarRDO(rdo.id)
                                            }
                                            Toast.makeText(
                                                this@HistoricoRDOActivity,
                                                "RDO excluído localmente (não sincronizado)",
                                                Toast.LENGTH_LONG
                                            ).show()
                                            carregarRDOs()
                                        }
                                    }
                                    .setNegativeButton("Cancelar", null)
                                    .show()
                            }
                            return@launch  // Não recarregar lista ainda
                        }

                        carregarRDOs()

                    } catch (e: Exception) {
                        Toast.makeText(
                            this@HistoricoRDOActivity,
                            "Erro ao excluir: ${e.message}",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            }
            .setNegativeButton("Não", null)
            .show()
    }

    private fun compartilharRDO(rdo: RDODataCompleto) {
        val relatorio = RDORelatorioUtil.gerarRelatorioTexto(rdo, JustificativasHIManager.carregar(this))

        val shareIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, relatorio)
            type = "text/plain"
        }
        startActivity(Intent.createChooser(shareIntent, "Compartilhar RDO"))
    }

    private fun usarComoModelo(rdo: RDODataCompleto) {
        AlertDialog.Builder(this)
            .setTitle("Usar como modelo")
            .setMessage("Deseja usar o RDO ${rdo.numeroRDO} como modelo para um novo registro?")
            .setPositiveButton("Sim") { _, _ ->
                val intent = Intent()
                intent.putExtra("modelo_rdo", rdo)
                setResult(RESULT_OK, intent)
                finish()
            }
            .setNegativeButton("Não", null)
            .show()
    }

    private fun editarRDO(rdo: RDODataCompleto) {
        val intent = Intent(this, MainActivity::class.java).apply {
            putExtra("TAB_POSITION", 1) // Abre na aba RDO
            putExtra("EDITAR_RDO", true)
            putExtra("RDO_ID", rdo.id)
            putExtra("rdo_completo", rdo)
        }
        startActivity(intent)
        finish() // Fecha o histórico para recarregar após edição
    }

    /**
     * Sincronizar RDO individual manualmente
     */
    private fun sincronizarRDOIndividual(rdo: RDODataCompleto, data: String) {
        lifecycleScope.launch {
            try {
                // Resetar erro se houver (para permitir nova tentativa)
                if (rdo.syncStatus == "error" || rdo.syncStatus == "retry") {
                    withContext(Dispatchers.IO) {
                        databaseHelper.resetarErroSync(rdo.id)
                    }
                }

                // Mostrar progresso
                Toast.makeText(
                    this@HistoricoRDOActivity,
                    "Sincronizando RDO ${rdo.numeroRDO}...",
                    Toast.LENGTH_SHORT
                ).show()

                // Executar sincronização
                val success = SyncHelper.syncRDO(
                    this@HistoricoRDOActivity,
                    rdo.id,
                    isDelete = false,
                    showToast = true
                )

                // Recarregar lista para mostrar novo status
                carregarRDOs()

            } catch (e: Exception) {
                Toast.makeText(
                    this@HistoricoRDOActivity,
                    "Erro ao sincronizar: ${e.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }
}