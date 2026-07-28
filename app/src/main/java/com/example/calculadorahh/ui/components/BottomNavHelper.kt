package com.example.calculadorahh.ui.components

import android.app.Activity
import android.content.Intent
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.example.calculadorahh.R
import com.example.calculadorahh.ui.activities.HistoricoRDOActivity
import com.example.calculadorahh.ui.activities.HomeActivity
import com.example.calculadorahh.ui.activities.MainActivity

/**
 * Aplica estado e navegação à barra inferior (`view_bottom_nav.xml`).
 *
 * O app tem telas em Activities separadas (Início, RDO/Calculadora e
 * Histórico). Para o requisito "trocar de aba não reinicia o estado da tela",
 * a navegação usa `FLAG_ACTIVITY_REORDER_TO_FRONT` + `SINGLE_TOP`: as
 * Activities permanecem vivas na pilha e são apenas trazidas de volta, em vez
 * de recriadas.
 */
object BottomNavHelper {

    enum class Aba { INICIO, RDO, CALC, HISTORICO }

    /**
     * @param abaAtual aba destacada nesta tela.
     * @param onMesmaAba chamado quando o usuário toca na aba já ativa
     *                   (ex.: MainActivity troca a página do ViewPager em vez
     *                   de abrir outra Activity).
     */
    fun configurar(
        activity: Activity,
        abaAtual: Aba,
        onMesmaAba: ((Aba) -> Unit)? = null
    ) {
        aplicarEstado(activity, abaAtual)

        activity.findViewById<View>(R.id.navInicio)?.setOnClickListener {
            if (abaAtual == Aba.INICIO) return@setOnClickListener
            abrir(activity, HomeActivity::class.java)
        }
        activity.findViewById<View>(R.id.navRDO)?.setOnClickListener {
            if (abaAtual == Aba.RDO) return@setOnClickListener
            if (activity is MainActivity) onMesmaAba?.invoke(Aba.RDO)
            else abrirMain(activity, MainActivity.TAB_RDO)
        }
        activity.findViewById<View>(R.id.navCalc)?.setOnClickListener {
            if (abaAtual == Aba.CALC) return@setOnClickListener
            if (activity is MainActivity) onMesmaAba?.invoke(Aba.CALC)
            else abrirMain(activity, MainActivity.TAB_CALCULADORA)
        }
        activity.findViewById<View>(R.id.navHistorico)?.setOnClickListener {
            if (abaAtual == Aba.HISTORICO) return@setOnClickListener
            abrir(activity, HistoricoRDOActivity::class.java)
        }
    }

    /** Atualiza só o destaque — usado quando o ViewPager troca de página. */
    fun aplicarEstado(activity: Activity, abaAtual: Aba) {
        val ativo = ContextCompat.getColor(activity, R.color.gold_primary)
        val inativo = ContextCompat.getColor(activity, R.color.text_muted)

        data class Item(val indicador: Int, val icone: Int, val rotulo: Int, val aba: Aba)

        val itens = listOf(
            Item(R.id.indInicio, R.id.iconInicio, R.id.labelInicio, Aba.INICIO),
            Item(R.id.indRDO, R.id.iconRDO, R.id.labelRDO, Aba.RDO),
            Item(R.id.indCalc, R.id.iconCalc, R.id.labelCalc, Aba.CALC),
            Item(R.id.indHistorico, R.id.iconHistorico, R.id.labelHistorico, Aba.HISTORICO)
        )

        for (item in itens) {
            val selecionado = item.aba == abaAtual
            val cor = if (selecionado) ativo else inativo
            activity.findViewById<View>(item.indicador)?.visibility =
                if (selecionado) View.VISIBLE else View.INVISIBLE
            activity.findViewById<ImageView>(item.icone)?.setColorFilter(cor)
            activity.findViewById<TextView>(item.rotulo)?.apply {
                setTextColor(cor)
                setTypeface(
                    typeface,
                    if (selecionado) android.graphics.Typeface.BOLD
                    else android.graphics.Typeface.NORMAL
                )
            }
        }
    }

    private fun abrir(activity: Activity, destino: Class<*>) {
        activity.startActivity(
            Intent(activity, destino).apply {
                addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
        )
        activity.overridePendingTransition(0, 0)
    }

    private fun abrirMain(activity: Activity, tab: Int) {
        activity.startActivity(
            Intent(activity, MainActivity::class.java).apply {
                putExtra(MainActivity.EXTRA_TAB, tab)
                addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
        )
        activity.overridePendingTransition(0, 0)
    }
}
