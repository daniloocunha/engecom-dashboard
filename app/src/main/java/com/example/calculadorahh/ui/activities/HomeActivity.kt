package com.example.calculadorahh.ui.activities

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.data.models.RDODataCompleto
import com.example.calculadorahh.databinding.ActivityHomeBinding
import com.example.calculadorahh.utils.SyncHelper
import com.example.calculadorahh.utils.getParcelableCompat
import kotlinx.coroutines.launch

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding

    // Launcher para receber resultado do Histórico
    private val historicoLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            result.data?.let { data ->
                val rdoModelo = data.getParcelableCompat<RDODataCompleto>("modelo_rdo")
                rdoModelo?.let { rdo ->
                    // Abrir MainActivity na aba RDO com os dados do modelo
                    val intent = Intent(this, MainActivity::class.java).apply {
                        putExtra("TAB_POSITION", 1) // Abre na aba RDO
                        putExtra("USAR_MODELO", true)
                        putExtra("modelo_rdo", rdo)
                    }
                    startActivity(intent)
                }
            }
        }
    }

    @SuppressLint("SetTextI18n")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Exibir versão do app dinamicamente
        binding.tvAppVersion.text = "Versão ${com.example.calculadorahh.BuildConfig.VERSION_NAME} • Danilo Cunha"


        configurarListeners()
    }

    private fun configurarListeners() {
        binding.cardCalculadora.setOnClickListener {
            val intent = Intent(this, MainActivity::class.java)
            intent.putExtra("TAB_POSITION", 0) // Abre na aba Calculadora
            startActivity(intent)
        }

        binding.cardRDO.setOnClickListener {
            val intent = Intent(this, MainActivity::class.java)
            intent.putExtra("TAB_POSITION", 1) // Abre na aba RDO
            startActivity(intent)
        }

        binding.cardHistorico.setOnClickListener {
            val intent = Intent(this, HistoricoRDOActivity::class.java)
            historicoLauncher.launch(intent)
        }

        binding.btnSyncAllRDOs.setOnClickListener {
            sincronizarTodosRDOs()
        }
    }

    @SuppressLint("SetTextI18n")
    private fun sincronizarTodosRDOs() {
        // Get count of unsynchronized RDOs
        val db = DatabaseHelper.getInstance(this)
        val rdosNaoSincronizados = db.obterRDOsNaoSincronizados()

        if (rdosNaoSincronizados.isEmpty()) {
            AlertDialog.Builder(this)
                .setTitle("Sincronização")
                .setMessage("Todos os RDOs já estão sincronizados!")
                .setPositiveButton("OK", null)
                .show()
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
