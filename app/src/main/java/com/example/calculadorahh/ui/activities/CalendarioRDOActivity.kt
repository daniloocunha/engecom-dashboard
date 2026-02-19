package com.example.calculadorahh.ui.activities

import android.annotation.SuppressLint
import android.os.Bundle
import android.widget.CalendarView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.text.SimpleDateFormat
import java.util.*
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.example.calculadorahh.R
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.data.models.*
import com.example.calculadorahh.ui.adapters.HistoricoRDOAdapter
import com.example.calculadorahh.utils.SyncHelper
import com.example.calculadorahh.utils.RDORelatorioUtil
import com.google.android.material.appbar.MaterialToolbar

class CalendarioRDOActivity : AppCompatActivity() {

    private lateinit var calendarView: CalendarView
    private lateinit var recyclerView: RecyclerView
    private lateinit var tvDataSelecionada: TextView
    private lateinit var tvTotalRDOs: TextView
    private lateinit var toolbar: MaterialToolbar
    private lateinit var databaseHelper: DatabaseHelper
    private lateinit var adapter: HistoricoRDOAdapter

    @SuppressLint("SetTextI18n")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_calendario_rdo)

        calendarView = findViewById(R.id.calendarView)
        recyclerView = findViewById(R.id.rvRDOsDia)
        tvDataSelecionada = findViewById(R.id.tvDataSelecionada)
        tvTotalRDOs = findViewById(R.id.tvTotalRDOs)
        toolbar = findViewById(R.id.toolbar)

        databaseHelper = DatabaseHelper.getInstance(this)
        recyclerView.layoutManager = LinearLayoutManager(this)

        // Configurar toolbar
        toolbar.setNavigationOnClickListener {
            finish()
        }

        val hoje = Calendar.getInstance()
        val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        val dataHoje = sdf.format(hoje.time)
        tvDataSelecionada.text = "Data: $dataHoje"
        carregarRDOsDoDia(dataHoje)

        calendarView.setOnDateChangeListener { _, year, month, dayOfMonth ->
            val calendar = Calendar.getInstance()
            calendar.set(year, month, dayOfMonth)
            val dataSelecionada = sdf.format(calendar.time)
            tvDataSelecionada.text = "Data: $dataSelecionada"
            carregarRDOsDoDia(dataSelecionada)
        }
    }

    @SuppressLint("SetTextI18n")
    private fun carregarRDOsDoDia(data: String) {
        lifecycleScope.launch {
            // Buscar RDOs em background thread
            val rdos = withContext(Dispatchers.IO) {
                databaseHelper.obterRDOsPorData(data)
            }

            // Atualizar UI na main thread
            tvTotalRDOs.text = "Total de RDOs: ${rdos.size}"

            adapter = HistoricoRDOAdapter(
                rdoList = rdos.toMutableList(),
                context = this@CalendarioRDOActivity,
                onDeletar = { rdo -> deletarRDO(rdo, data) },
                onEnviar = { rdo -> compartilharRDO(rdo) },
                onUsarModelo = { rdo ->
                    Toast.makeText(this@CalendarioRDOActivity, "Usar como modelo: ${rdo.numeroRDO}", Toast.LENGTH_SHORT).show()
                },
                onEditar = { rdo ->
                    Toast.makeText(this@CalendarioRDOActivity, "Edição disponível apenas no Histórico RDO", Toast.LENGTH_SHORT).show()
                }
            )
            recyclerView.adapter = adapter
        }
    }

    private fun deletarRDO(rdo: RDODataCompleto, data: String) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Confirmar exclusão")
            .setMessage("Deseja realmente excluir o RDO ${rdo.numeroRDO}?")
            .setPositiveButton("Sim") { _, _ ->
                lifecycleScope.launch {
                    try {
                        // 1. Sincronizar marcação de deletado ANTES de remover localmente
                        val syncSuccess = SyncHelper.syncRDO(
                            this@CalendarioRDOActivity,
                            rdo.id,
                            isDelete = true,
                            showToast = false
                        )

                        if (syncSuccess) {
                            // 2. SOMENTE deletar localmente SE sync teve sucesso
                            withContext(Dispatchers.IO) {
                                databaseHelper.deletarRDO(rdo.id)
                            }
                            Toast.makeText(
                                this@CalendarioRDOActivity,
                                "RDO ${rdo.numeroRDO} excluído com sucesso",
                                Toast.LENGTH_SHORT
                            ).show()
                        } else {
                            // 3. Sync falhou - perguntar se deseja deletar apenas localmente
                            withContext(Dispatchers.Main) {
                                androidx.appcompat.app.AlertDialog.Builder(this@CalendarioRDOActivity)
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
                                                this@CalendarioRDOActivity,
                                                "RDO excluído localmente (não sincronizado)",
                                                Toast.LENGTH_LONG
                                            ).show()
                                            carregarRDOsDoDia(data)
                                        }
                                    }
                                    .setNegativeButton("Cancelar", null)
                                    .show()
                            }
                            return@launch
                        }

                        carregarRDOsDoDia(data)

                    } catch (e: Exception) {
                        Toast.makeText(
                            this@CalendarioRDOActivity,
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

        val shareIntent = android.content.Intent().apply {
            action = android.content.Intent.ACTION_SEND
            putExtra(android.content.Intent.EXTRA_TEXT, relatorio)
            type = "text/plain"
        }
        startActivity(android.content.Intent.createChooser(shareIntent, "Compartilhar RDO"))
    }
}