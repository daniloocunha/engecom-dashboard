package com.example.calculadorahh.ui.adapters
import android.annotation.SuppressLint
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.example.calculadorahh.data.models.HICalculado
import com.example.calculadorahh.databinding.ItemHiBinding

class HIsAdapter(
    private val his: MutableList<HICalculado>,
    private val onRemoveClicked: (HICalculado) -> Unit,
    private val onDuplicateClicked: (HICalculado) -> Unit
) : RecyclerView.Adapter<HIsAdapter.HIViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): HIViewHolder {
        val binding = ItemHiBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return HIViewHolder(binding)
    }

    override fun onBindViewHolder(holder: HIViewHolder, position: Int) {
        val hi = his[position]
        holder.bind(hi, onRemoveClicked, onDuplicateClicked)
    }

    override fun getItemCount(): Int = his.size

    @SuppressLint("NotifyDataSetChanged")
    fun updateData(newHIs: List<HICalculado>) {
        his.clear()
        his.addAll(newHIs)
        notifyDataSetChanged()
    }

    class HIViewHolder(private val binding: ItemHiBinding) : RecyclerView.ViewHolder(binding.root) {
        @SuppressLint("SetTextI18n", "DefaultLocale")
        fun bind(hi: HICalculado, onRemoveClicked: (HICalculado) -> Unit, onDuplicateClicked: (HICalculado) -> Unit) {
            binding.tvTipoHI.text = hi.tipoHI
            binding.tvDetalhesHI.text =
                "${hi.horaInicio}-${hi.horaFim} = ${String.format("%.2f", hi.horas)}h"

            binding.btnRemoverHI.setOnClickListener {
                onRemoveClicked(hi)
            }

            binding.btnDuplicarHI.setOnClickListener {
                onDuplicateClicked(hi)
            }
        }
    }
}
