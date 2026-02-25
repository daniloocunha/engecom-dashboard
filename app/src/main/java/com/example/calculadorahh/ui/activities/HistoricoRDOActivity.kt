package com.example.calculadorahh.ui.activities

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.calculadorahh.databinding.ActivityHistoricoRdoBinding
import com.example.calculadorahh.utils.RDORelatorioUtil
import com.example.calculadorahh.utils.SyncHelper
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.data.models.*
import com.example.calculadorahh.ui.adapters.HistoricoRDOAdapter
import java.text.SimpleDateFormat
import java.util.*

class HistoricoRDOActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHistoricoRdoBinding
    private lateinit var adapter: HistoricoRDOAdapter
    private lateinit var databaseHelper: DatabaseHelper
    private var currentData: String = ""

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

        // Carregar RDOs de hoje ao iniciar
        val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        val dataHoje = sdf.format(Calendar.getInstance().time)
        binding.tvDataSelecionada.text = "Data: $dataHoje"
        carregarRDOsDoDia(dataHoje)

        // Listener para mudança de data no calendário
        binding.calendarView.setOnDateChangeListener { _, year, month, dayOfMonth ->
            val calendar = Calendar.getInstance()
            calendar.set(year, month, dayOfMonth)
            val dataSelecionada = sdf.format(calendar.time)
            binding.tvDataSelecionada.text = "Data: $dataSelecionada"
            carregarRDOsDoDia(dataSelecionada)
        }
    }

    override fun onResume() {
        super.onResume()
        // Recarregar RDOs da data atualmente selecionada
        if (currentData.isNotEmpty()) {
            carregarRDOsDoDia(currentData)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        binding.calendarView.setOnDateChangeListener(null)
    }

    @SuppressLint("SetTextI18n")
    private fun carregarRDOsDoDia(data: String) {
        currentData = data
        lifecycleScope.launch {
            val rdos = withContext(Dispatchers.IO) {
                databaseHelper.obterRDOsPorData(data)
            }
            binding.tvTotalRDOs.text = "Total de RDOs: ${rdos.size}"
            adapter.atualizarLista(rdos)
        }
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
                                            carregarRDOsDoDia(data)
                                        }
                                    }
                                    .setNegativeButton("Cancelar", null)
                                    .show()
                            }
                            return@launch  // Não recarregar lista ainda
                        }

                        carregarRDOsDoDia(data)

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
        val relatorio = RDORelatorioUtil.gerarRelatorioTexto(rdo)

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
                carregarRDOsDoDia(data)

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