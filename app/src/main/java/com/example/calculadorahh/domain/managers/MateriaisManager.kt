package com.example.calculadorahh.domain.managers

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.view.LayoutInflater
import android.widget.*
import com.example.calculadorahh.data.models.MaterialRDO
import com.example.calculadorahh.R
import com.example.calculadorahh.utils.ValidationHelper

/**
 * Gerencia a lista dinâmica de materiais no formulário RDO
 */
class MateriaisManager(
    context: Context,
    layoutInflater: LayoutInflater,
    containerView: LinearLayout
) : BaseItemManager<MaterialRDO>(context, layoutInflater, containerView) {

    /**
     * Retorna lista de materiais adicionados (alias para compatibilidade)
     */
    fun getMateriais(): List<MaterialRDO> = getItens()

    override fun mostrarDialogAdicionar() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_adicionar_material_rdo, null)
        val dialog = AlertDialog.Builder(context)
            .setView(dialogView)
            .create()

        val etDescricao = dialogView.findViewById<EditText>(R.id.etDescricaoMaterialRDO)
        val etQuantidade = dialogView.findViewById<EditText>(R.id.etQuantidadeMaterialRDO)
        val spinnerUnidade = dialogView.findViewById<Spinner>(R.id.spinnerUnidadeMaterialRDO)
        val btnCancelar = dialogView.findViewById<Button>(R.id.btnCancelarMaterialRDO)
        val btnConfirmar = dialogView.findViewById<Button>(R.id.btnConfirmarMaterialRDO)

        // Configurar spinner de unidades
        val unidades = listOf("uni", "m","m²", "m³", "kg", "L", "cx", "PC")
        val adapter = ArrayAdapter(context, android.R.layout.simple_spinner_item, unidades)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerUnidade.adapter = adapter

        btnCancelar.setOnClickListener {
            dialog.dismiss()
        }

        btnConfirmar.setOnClickListener {
            val descricao = etDescricao.text.toString().trim()
            val quantidade = etQuantidade.text.toString().toDoubleOrNull()
            val unidade = spinnerUnidade.selectedItem.toString()

            if (descricao.isEmpty()) {
                Toast.makeText(context, "Digite a descrição do material", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (!ValidationHelper.validarQuantidade(quantidade)) {
                Toast.makeText(context, "Digite uma quantidade válida (maior que zero)", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val materialRDO = MaterialRDO(
                descricao = descricao,
                quantidade = quantidade!!, // Sabemos que não é null após validação
                unidade = unidade
            )

            adicionarItem(materialRDO)

            dialog.dismiss()
            Toast.makeText(context, getMensagemAdicao(), Toast.LENGTH_SHORT).show()
        }

        dialog.show()
    }

    @SuppressLint("SetTextI18n")
    override fun adicionarView(material: MaterialRDO) {
        val itemView = layoutInflater.inflate(R.layout.item_material_rdo, containerView, false)

        val tvDescricao = itemView.findViewById<TextView>(R.id.tvDescricaoMaterialRDO)
        val tvQuantidade = itemView.findViewById<TextView>(R.id.tvQuantidadeMaterialRDO)
        val btnEditar = itemView.findViewById<ImageButton>(R.id.btnEditarMaterialRDO)
        val btnRemover = itemView.findViewById<ImageButton>(R.id.btnRemoverMaterialRDO)

        tvDescricao.text = material.descricao
        tvQuantidade.text = "Quantidade: ${material.quantidade} | Unidade: ${material.unidade}"

        btnEditar.setOnClickListener {
            mostrarDialogEditar(material, itemView)
        }

        btnRemover.setOnClickListener {
            removerItem(material, itemView)
        }

        containerView.addView(itemView)
    }

    override fun mostrarDialogEditar(materialAtual: MaterialRDO, itemViewAtual: android.view.View) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_adicionar_material_rdo, null)
        val dialog = AlertDialog.Builder(context)
            .setView(dialogView)
            .create()

        val etDescricao = dialogView.findViewById<EditText>(R.id.etDescricaoMaterialRDO)
        val etQuantidade = dialogView.findViewById<EditText>(R.id.etQuantidadeMaterialRDO)
        val spinnerUnidade = dialogView.findViewById<Spinner>(R.id.spinnerUnidadeMaterialRDO)
        val btnCancelar = dialogView.findViewById<Button>(R.id.btnCancelarMaterialRDO)
        val btnConfirmar = dialogView.findViewById<Button>(R.id.btnConfirmarMaterialRDO)

        // Configurar spinner de unidades
        val unidades = listOf("uni", "m","m²", "m³", "kg", "L", "cx", "PC")
        val adapter = ArrayAdapter(context, android.R.layout.simple_spinner_item, unidades)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerUnidade.adapter = adapter

        // Pré-preencher com dados atuais
        etDescricao.setText(materialAtual.descricao)
        etQuantidade.setText(materialAtual.quantidade.toString())
        val unidadeIndex = unidades.indexOf(materialAtual.unidade)
        if (unidadeIndex >= 0) {
            spinnerUnidade.setSelection(unidadeIndex)
        }

        btnCancelar.setOnClickListener {
            dialog.dismiss()
        }

        btnConfirmar.setOnClickListener {
            val descricao = etDescricao.text.toString().trim()
            val quantidade = etQuantidade.text.toString().toDoubleOrNull()
            val unidade = spinnerUnidade.selectedItem.toString()

            if (descricao.isEmpty()) {
                Toast.makeText(context, "Digite a descrição do material", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (!ValidationHelper.validarQuantidade(quantidade)) {
                Toast.makeText(context, "Digite uma quantidade válida (maior que zero)", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val materialEditado = MaterialRDO(
                descricao = descricao,
                quantidade = quantidade!!, // Sabemos que não é null após validação
                unidade = unidade
            )

            atualizarItem(materialAtual, materialEditado, itemViewAtual)

            dialog.dismiss()
        }

        dialog.show()
    }

    override fun getMensagemRemocao(): String = "Material removido"
    override fun getMensagemAtualizacao(): String = "Material atualizado"
    override fun getMensagemAdicao(): String = "Material adicionado"
}
