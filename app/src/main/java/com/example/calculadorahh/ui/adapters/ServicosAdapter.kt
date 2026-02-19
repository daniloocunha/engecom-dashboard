package com.example.calculadorahh.ui.adapters

import android.annotation.SuppressLint
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.example.calculadorahh.data.models.ServicoCalculado
import com.example.calculadorahh.databinding.ItemServicoBinding

class ServicosAdapter(
    private val servicos: MutableList<ServicoCalculado>,
    private val onRemoveClicked: (ServicoCalculado) -> Unit
) : RecyclerView.Adapter<ServicosAdapter.ServicoViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ServicoViewHolder {
        val binding = ItemServicoBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ServicoViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ServicoViewHolder, position: Int) {
        val servico = servicos[position]
        holder.bind(servico, onRemoveClicked)
    }

    override fun getItemCount(): Int = servicos.size

    @SuppressLint("NotifyDataSetChanged")
    fun updateData(newServicos: List<ServicoCalculado>) {
        servicos.clear()
        servicos.addAll(newServicos)
        notifyDataSetChanged()
    }

    class ServicoViewHolder(private val binding: ItemServicoBinding) : RecyclerView.ViewHolder(binding.root) {
        @SuppressLint("SetTextI18n", "DefaultLocale")
        fun bind(servico: ServicoCalculado, onRemoveClicked: (ServicoCalculado) -> Unit) {
            binding.tvDescricaoServico.text = servico.descricao
            binding.tvDetalhesServico.text =
                "Qtd: ${servico.quantidade} × ${servico.coeficiente} = ${String.format("%.2f", servico.horas)}h"

            // Mostrar badge customizado
            if (servico.isCustomizado) {
                binding.tvBadgeCustomizado.visibility = android.view.View.VISIBLE
            } else {
                binding.tvBadgeCustomizado.visibility = android.view.View.GONE
            }

            // Mostrar observações
            val obs = servico.observacoes?.trim() ?: ""
            if (obs.isNotEmpty()) {
                binding.tvObservacoes.text = "Obs: $obs"
                binding.tvObservacoes.visibility = android.view.View.VISIBLE
            } else {
                binding.tvObservacoes.visibility = android.view.View.GONE
            }

            binding.btnRemover.setOnClickListener {
                onRemoveClicked(servico)
            }
        }
    }
}
