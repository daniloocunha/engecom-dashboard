package com.example.calculadorahh.ui.components

import android.app.AlertDialog
import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.util.AttributeSet
import android.view.LayoutInflater
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.ListView
import androidx.appcompat.widget.AppCompatSpinner
import com.example.calculadorahh.R

/**
 * Spinner com busca integrada
 * Exibe um dialog com campo de pesquisa ao clicar
 */
class SearchableSpinner @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = android.R.attr.spinnerStyle
) : AppCompatSpinner(context, attrs, defStyleAttr) {

    private var items: List<String> = emptyList()
    private var onItemSelectedListener: ((position: Int, item: String) -> Unit)? = null
    private var dialogTitle: String = "Selecione uma opção"

    init {
        // Interceptar clique para mostrar dialog customizado
        setOnClickListener {
            showSearchableDialog()
        }
    }

    /**
     * Define título do dialog de busca
     */
    fun setDialogTitle(title: String) {
        this.dialogTitle = title
    }

    /**
     * Define lista de itens
     */
    fun setItems(itemsList: List<String>) {
        this.items = itemsList

        // Configurar adapter do Spinner padrão
        val adapter = ArrayAdapter(context, android.R.layout.simple_spinner_item, items)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        setAdapter(adapter)
    }

    /**
     * Define listener de seleção
     */
    fun setOnItemSelectedListener(listener: (position: Int, item: String) -> Unit) {
        this.onItemSelectedListener = listener
    }

    /**
     * Seleciona item por posição
     */
    fun setSelectedPosition(position: Int) {
        if (position in items.indices) {
            setSelection(position)
        }
    }

    /**
     * Seleciona item por texto
     */
    fun setSelectedItem(item: String) {
        val position = items.indexOf(item)
        if (position >= 0) {
            setSelection(position)
        }
    }

    /**
     * Mostra dialog com busca
     */
    private fun showSearchableDialog() {
        val dialogView = LayoutInflater.from(context).inflate(R.layout.dialog_searchable_spinner, null)
        val searchEditText = dialogView.findViewById<EditText>(R.id.etSearchSpinner)
        val listView = dialogView.findViewById<ListView>(R.id.lvItemsSpinner)

        // Adapter com lista completa
        val adapter = ArrayAdapter(context, android.R.layout.simple_list_item_1, items.toMutableList())
        listView.adapter = adapter

        val dialog = AlertDialog.Builder(context)
            .setTitle(dialogTitle)
            .setView(dialogView)
            .setNegativeButton("Cancelar", null)
            .create()

        // Filtrar lista ao digitar
        searchEditText.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val query = s.toString().trim().lowercase()
                val filtered = if (query.isEmpty()) {
                    items
                } else {
                    items.filter { it.lowercase().contains(query) }
                }
                adapter.clear()
                adapter.addAll(filtered)
                adapter.notifyDataSetChanged()
            }
        })

        // Selecionar item
        listView.setOnItemClickListener { _, _, position, _ ->
            val selectedItem = adapter.getItem(position) ?: return@setOnItemClickListener
            val originalPosition = items.indexOf(selectedItem)

            setSelection(originalPosition)
            onItemSelectedListener?.invoke(originalPosition, selectedItem)

            dialog.dismiss()
        }

        dialog.show()
    }
}
