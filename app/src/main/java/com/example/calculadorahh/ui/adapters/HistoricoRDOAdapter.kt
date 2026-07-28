package com.example.calculadorahh.ui.adapters
import android.annotation.SuppressLint
import com.example.calculadorahh.R
import com.example.calculadorahh.data.models.*

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.card.MaterialCardView
import androidx.core.graphics.toColorInt

class HistoricoRDOAdapter(
    private val rdoList: MutableList<RDODataCompleto>,
    private val context: Context,
    private val onDeletar: (RDODataCompleto) -> Unit,
    private val onEnviar: (RDODataCompleto) -> Unit,
    private val onUsarModelo: (RDODataCompleto) -> Unit,
    private val onEditar: (RDODataCompleto) -> Unit,
    private val onSyncIndividual: (RDODataCompleto) -> Unit = {},
    private val onLoadMore: (() -> Unit)? = null  // ✅ NOVO: Callback para carregar mais
) : RecyclerView.Adapter<HistoricoRDOAdapter.RDOViewHolder>() {

    companion object {
        const val PAGE_SIZE = 20  // Quantidade de itens por página
        private const val LOAD_MORE_THRESHOLD = 5  // Carregar mais quando faltar X itens
    }

    class RDOViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val cardView: MaterialCardView = itemView.findViewById(R.id.cardRDO)
        val tvDayHeader: TextView = itemView.findViewById(R.id.tvDayHeader)
        val badgeStatus: View = itemView.findViewById(R.id.badgeStatus)
        val tvNumeroRDO: TextView = itemView.findViewById(R.id.tvNumeroRDO)
        val ivSyncStatus: ImageView = itemView.findViewById(R.id.ivSyncStatus)
        val tvSyncStatus: TextView = itemView.findViewById(R.id.tvSyncStatus)
        val tvLocal: TextView = itemView.findViewById(R.id.tvLocal)
        val tvEncarregado: TextView = itemView.findViewById(R.id.tvEncarregado)
        val tvNumeroOS: TextView = itemView.findViewById(R.id.tvNumeroOS)
        val tvStatusOS: TextView = itemView.findViewById(R.id.tvStatusOS)
        val btnSyncIndividual: ImageButton = itemView.findViewById(R.id.btnSyncIndividual)
        val btnEditar: ImageButton = itemView.findViewById(R.id.btnEditar)
        val btnDeletar: ImageButton = itemView.findViewById(R.id.btnDeletar)
        val btnEnviar: ImageButton = itemView.findViewById(R.id.btnEnviar)
        val btnUsarModelo: ImageButton = itemView.findViewById(R.id.btnUsarModelo)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RDOViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_historico_rdo, parent, false)
        return RDOViewHolder(view)
    }

    @SuppressLint("SetTextI18n")
    override fun onBindViewHolder(holder: RDOViewHolder, position: Int) {
        val rdo = rdoList[position]

        holder.tvNumeroRDO.text = rdo.numeroRDO
        holder.tvLocal.text = "📍 ${rdo.local}"
        holder.tvEncarregado.text = "👤 ${rdo.encarregado}"
        holder.tvNumeroOS.text = "OS: ${rdo.numeroOS}"
        holder.tvStatusOS.text = if (rdo.statusOS.isBlank()) "" else "· ${rdo.statusOS}"

        // Cabeçalho de dia: só no primeiro RDO de cada data (agrupamento do design)
        val dataAnterior = if (position > 0) rdoList[position - 1].data else null
        if (rdo.data != dataAnterior) {
            holder.tvDayHeader.visibility = View.VISIBLE
            holder.tvDayHeader.text = formatarCabecalhoDia(rdo.data)
        } else {
            holder.tvDayHeader.visibility = View.GONE
        }

        // 🔥 CONFIGURAR INDICADORES DE SINCRONIZAÇÃO
        val syncStatus = SyncStatus.fromString(rdo.syncStatus)
        configurarStatusSincronizacao(holder, rdo, syncStatus)

        // ✅ PAGINAÇÃO: Carregar mais quando se aproximar do final da lista
        if (onLoadMore != null && position >= rdoList.size - LOAD_MORE_THRESHOLD) {
            onLoadMore.invoke()
        }

        // Listeners dos botões
        holder.btnSyncIndividual.setOnClickListener {
            onSyncIndividual(rdo)
        }

        holder.btnEditar.setOnClickListener {
            onEditar(rdo)
        }

        holder.btnDeletar.setOnClickListener {
            onDeletar(rdo)
        }

        holder.btnEnviar.setOnClickListener {
            onEnviar(rdo)
        }

        holder.btnUsarModelo.setOnClickListener {
            onUsarModelo(rdo)
        }

        holder.itemView.setOnClickListener {
            // Opcional: abrir detalhes do RDO
        }
    }

    /**
     * 🎨 Configurar indicadores visuais de status de sincronização
     */
    @SuppressLint("SetTextI18n")
    private fun configurarStatusSincronizacao(holder: RDOViewHolder, rdo: RDODataCompleto, status: SyncStatus) {
        // Cor e rótulo do badge por status. As cores vêm dos tokens do tema
        // para funcionar em claro e escuro (antes eram hex claros fixos).
        val (corRes, rotulo, icone) = when (status) {
            SyncStatus.SYNCED -> Triple(R.color.green_sync, "SYNC", R.drawable.ic_check)
            SyncStatus.PENDING -> Triple(R.color.amber_pending, "PENDENTE", R.drawable.ic_sync)
            SyncStatus.SYNCING -> Triple(R.color.blue_accent, "SINCRONIZANDO", R.drawable.ic_sync)
            SyncStatus.RETRY -> Triple(
                R.color.amber_pending, "RETRY ${rdo.tentativasSync}/3", R.drawable.ic_sync
            )
            SyncStatus.ERROR -> Triple(R.color.red_delete, "ERRO", R.drawable.ic_close)
        }

        val cor = ContextCompat.getColor(context, corRes)
        holder.ivSyncStatus.setImageResource(icone)
        holder.ivSyncStatus.setColorFilter(cor)
        holder.tvSyncStatus.text = rotulo
        holder.tvSyncStatus.setTextColor(cor)
        holder.badgeStatus.setBackgroundResource(
            if (status == SyncStatus.SYNCED) R.drawable.bg_badge_sync
            else R.drawable.bg_badge_pendente
        )

        // Erro mostra a causa; o card ganha borda de alerta.
        holder.cardView.strokeColor = if (status == SyncStatus.ERROR) cor
        else ContextCompat.getColor(context, R.color.border_default)

        // Só faz sentido sincronizar manualmente o que não está sincronizado.
        holder.btnSyncIndividual.visibility =
            if (status == SyncStatus.SYNCED || status == SyncStatus.SYNCING) View.GONE
            else View.VISIBLE
    }

    /** "28/07/2026" -> "Seg, 28 de Julho" (cabeçalho de grupo do dia). */
    private fun formatarCabecalhoDia(data: String): String {
        val entrada = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
        val saida = java.text.SimpleDateFormat("EEE, dd 'de' MMMM", java.util.Locale("pt", "BR"))
        return try {
            entrada.parse(data)?.let { saida.format(it).replaceFirstChar { c -> c.uppercase() } }
                ?: data
        } catch (e: Exception) {
            data
        }
    }

    override fun getItemCount(): Int = rdoList.size

    fun atualizarLista(novaLista: List<RDODataCompleto>) {
        val diffCallback = RDODiffCallback(rdoList, novaLista)
        val diffResult = DiffUtil.calculateDiff(diffCallback)

        rdoList.clear()
        rdoList.addAll(novaLista)
        diffResult.dispatchUpdatesTo(this)
    }

    /**
     * ✅ PAGINAÇÃO: Adiciona mais itens ao final da lista existente
     */
    fun adicionarMaisItens(novosItens: List<RDODataCompleto>) {
        val posicaoInicial = rdoList.size
        rdoList.addAll(novosItens)
        notifyItemRangeInserted(posicaoInicial, novosItens.size)
    }

    fun removerItem(position: Int) {
        if (position >= 0 && position < rdoList.size) {
            rdoList.removeAt(position)
            notifyItemRemoved(position)
            notifyItemRangeChanged(position, rdoList.size)
        }
    }

    /**
     * DiffUtil.Callback para comparar listas de RDOs de forma eficiente
     */
    private class RDODiffCallback(
        private val oldList: List<RDODataCompleto>,
        private val newList: List<RDODataCompleto>
    ) : DiffUtil.Callback() {

        override fun getOldListSize(): Int = oldList.size

        override fun getNewListSize(): Int = newList.size

        override fun areItemsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean {
            return oldList[oldItemPosition].id == newList[newItemPosition].id
        }

        override fun areContentsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean {
            val oldRDO = oldList[oldItemPosition]
            val newRDO = newList[newItemPosition]

            return oldRDO.numeroRDO == newRDO.numeroRDO &&
                   oldRDO.data == newRDO.data &&
                   oldRDO.local == newRDO.local &&
                   oldRDO.encarregado == newRDO.encarregado &&
                   oldRDO.numeroOS == newRDO.numeroOS &&
                   oldRDO.statusOS == newRDO.statusOS
        }
    }
}