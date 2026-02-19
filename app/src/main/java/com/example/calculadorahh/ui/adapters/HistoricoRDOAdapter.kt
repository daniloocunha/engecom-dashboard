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
        val cardView: MaterialCardView = itemView as MaterialCardView
        val tvNumeroRDO: TextView = itemView.findViewById(R.id.tvNumeroRDO)
        val ivSyncStatus: ImageView = itemView.findViewById(R.id.ivSyncStatus)
        val tvSyncStatus: TextView = itemView.findViewById(R.id.tvSyncStatus)
        val tvData: TextView = itemView.findViewById(R.id.tvData)
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

        holder.tvNumeroRDO.text = "RDO: ${rdo.numeroRDO}"
        holder.tvData.text = "Data: ${rdo.data}"
        holder.tvLocal.text = "Local: ${rdo.local}"
        holder.tvEncarregado.text = "Encarregado: ${rdo.encarregado}"
        holder.tvNumeroOS.text = "OS: ${rdo.numeroOS}"
        holder.tvStatusOS.text = "Status: ${rdo.statusOS}"

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
        when (status) {
            SyncStatus.SYNCED -> {
                // ✅ SINCRONIZADO
                holder.ivSyncStatus.setImageResource(android.R.drawable.ic_menu_upload_you_tube)
                holder.ivSyncStatus.setColorFilter(ContextCompat.getColor(context, android.R.color.holo_green_dark))
                holder.tvSyncStatus.text = "✓ Sincronizado"
                holder.tvSyncStatus.setTextColor(ContextCompat.getColor(context, android.R.color.holo_green_dark))
                holder.cardView.setCardBackgroundColor(ContextCompat.getColor(context, android.R.color.white))
                holder.btnSyncIndividual.visibility = View.GONE
            }

            SyncStatus.PENDING -> {
                // ⏳ PENDENTE
                holder.ivSyncStatus.setImageResource(android.R.drawable.ic_popup_sync)
                holder.ivSyncStatus.setColorFilter(ContextCompat.getColor(context, android.R.color.holo_orange_light))
                holder.tvSyncStatus.text = "⏳ Aguardando sincronização"
                holder.tvSyncStatus.setTextColor(ContextCompat.getColor(context, android.R.color.holo_orange_light))
                holder.cardView.setCardBackgroundColor("#FFF9E6".toColorInt()) // Amarelo muito claro
                holder.btnSyncIndividual.visibility = View.VISIBLE
            }

            SyncStatus.SYNCING -> {
                // 🔄 SINCRONIZANDO
                holder.ivSyncStatus.setImageResource(android.R.drawable.ic_popup_sync)
                holder.ivSyncStatus.setColorFilter(ContextCompat.getColor(context, android.R.color.holo_blue_light))
                holder.tvSyncStatus.text = "🔄 Sincronizando..."
                holder.tvSyncStatus.setTextColor(ContextCompat.getColor(context, android.R.color.holo_blue_light))
                holder.cardView.setCardBackgroundColor("#E3F2FD".toColorInt()) // Azul muito claro
                holder.btnSyncIndividual.visibility = View.GONE
            }

            SyncStatus.RETRY -> {
                // 🔁 TENTARÁ NOVAMENTE
                holder.ivSyncStatus.setImageResource(android.R.drawable.ic_popup_sync)
                holder.ivSyncStatus.setColorFilter(ContextCompat.getColor(context, android.R.color.holo_orange_dark))
                holder.tvSyncStatus.text = "🔁 Tentando novamente... (${rdo.tentativasSync}/3)"
                holder.tvSyncStatus.setTextColor(ContextCompat.getColor(context, android.R.color.holo_orange_dark))
                holder.cardView.setCardBackgroundColor("#FFE0B2".toColorInt()) // Laranja claro
                holder.btnSyncIndividual.visibility = View.VISIBLE
            }

            SyncStatus.ERROR -> {
                // ❌ ERRO
                holder.ivSyncStatus.setImageResource(android.R.drawable.ic_dialog_alert)
                holder.ivSyncStatus.setColorFilter(ContextCompat.getColor(context, android.R.color.holo_red_dark))
                val mensagem = if (rdo.mensagemErroSync.isNotEmpty()) {
                    "❌ Erro: ${rdo.mensagemErroSync.take(30)}..."
                } else {
                    "❌ Erro na sincronização"
                }
                holder.tvSyncStatus.text = "$mensagem\n⚠️ Toque em sincronizar para tentar novamente"
                holder.tvSyncStatus.setTextColor(ContextCompat.getColor(context, android.R.color.holo_red_dark))
                holder.cardView.setCardBackgroundColor("#FFEBEE".toColorInt()) // Vermelho muito claro
                holder.btnSyncIndividual.visibility = View.VISIBLE
            }
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