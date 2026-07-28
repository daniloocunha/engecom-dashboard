package com.example.calculadorahh.ui.activities

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.viewpager2.widget.ViewPager2
import com.example.calculadorahh.databinding.ActivityMainBinding
import com.example.calculadorahh.ui.adapters.ViewPagerAdapter
import com.example.calculadorahh.ui.components.BottomNavHelper

/**
 * Container das telas de RDO e Calculadora HH.
 *
 * O ViewPager2 continua sendo o host dos dois fragmentos (preserva o estado do
 * formulário ao alternar), mas a navegação passou a ser feita pela barra
 * inferior do redesign — o TabLayout foi removido.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_TAB = "TAB_POSITION"
        const val TAB_CALCULADORA = 0
        const val TAB_RDO = 1
    }

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.viewPager.adapter = ViewPagerAdapter(this)
        // Formulário do RDO é longo: trocar de aba não pode descartar o estado.
        binding.viewPager.offscreenPageLimit = 1

        // Consumir e limpar o extra para não re-aplicar na rotação
        val tabInicial = intent.getIntExtra(EXTRA_TAB, TAB_CALCULADORA)
        intent.removeExtra(EXTRA_TAB)
        binding.viewPager.setCurrentItem(tabInicial, false)

        configurarNavegacao()
        aplicarAbaAtiva(tabInicial)

        binding.viewPager.registerOnPageChangeCallback(
            object : ViewPager2.OnPageChangeCallback() {
                override fun onPageSelected(position: Int) {
                    aplicarAbaAtiva(position)
                }
            }
        )
    }

    /**
     * Reentrada pela barra inferior (a Activity é trazida de volta com
     * REORDER_TO_FRONT, então onCreate não roda de novo).
     */
    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val tab = intent.getIntExtra(EXTRA_TAB, -1)
        if (tab >= 0) {
            intent.removeExtra(EXTRA_TAB)
            binding.viewPager.setCurrentItem(tab, false)
            aplicarAbaAtiva(tab)
        }
    }

    private fun configurarNavegacao() {
        BottomNavHelper.configurar(this, abaAtual(binding.viewPager.currentItem)) { aba ->
            binding.viewPager.setCurrentItem(
                if (aba == BottomNavHelper.Aba.RDO) TAB_RDO else TAB_CALCULADORA,
                false
            )
        }
    }

    /** Reaplica o destaque e os listeners para a aba correspondente à página. */
    private fun aplicarAbaAtiva(posicao: Int) {
        BottomNavHelper.configurar(this, abaAtual(posicao)) { aba ->
            binding.viewPager.setCurrentItem(
                if (aba == BottomNavHelper.Aba.RDO) TAB_RDO else TAB_CALCULADORA,
                false
            )
        }
    }

    private fun abaAtual(posicao: Int): BottomNavHelper.Aba =
        if (posicao == TAB_RDO) BottomNavHelper.Aba.RDO else BottomNavHelper.Aba.CALC
}
