package com.example.calculadorahh.domain.managers

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.widget.LinearLayout
import android.widget.Toast

/**
 * Classe base abstrata para gerenciar listas dinâmicas de itens no RDO.
 * Elimina duplicação de código entre ServicosManager, MateriaisManager, HIManager e TransportesManager.
 *
 * @param T Tipo do item gerenciado (ServicoRDO, MaterialRDO, HIItem, TransporteItem)
 */
abstract class BaseItemManager<T>(
    protected val context: Context,
    protected val layoutInflater: LayoutInflater,
    protected val containerView: LinearLayout
) {
    /**
     * Lista de itens adicionados
     */
    protected val itensAdicionados = mutableListOf<T>()

    /**
     * Retorna lista imutável de itens adicionados
     */
    fun getItens(): List<T> = itensAdicionados.toList()

    /**
     * Retorna quantidade de itens
     */
    fun getQuantidade(): Int = itensAdicionados.size

    /**
     * Limpa todos os itens
     */
    fun limpar() {
        itensAdicionados.clear()
        containerView.removeAllViews()
        onListaAlterada()
    }

    /**
     * Adiciona um item à lista e cria a view correspondente
     */
    fun adicionarItem(item: T) {
        itensAdicionados.add(item)
        adicionarView(item)
        onListaAlterada()
    }

    /**
     * Remove um item da lista e remove a view correspondente
     */
    protected fun removerItem(item: T, itemView: View) {
        itensAdicionados.remove(item)
        containerView.removeView(itemView)
        onListaAlterada()
        Toast.makeText(context, getMensagemRemocao(), Toast.LENGTH_SHORT).show()
    }

    /**
     * Atualiza um item (remove o antigo e adiciona o novo)
     */
    protected fun atualizarItem(itemAntigo: T, itemNovo: T, itemViewAntigo: View) {
        itensAdicionados.remove(itemAntigo)
        containerView.removeView(itemViewAntigo)
        adicionarItem(itemNovo)
        Toast.makeText(context, getMensagemAtualizacao(), Toast.LENGTH_SHORT).show()
    }

    /**
     * Chamado após qualquer mudança na lista (adição, remoção, atualização ou
     * limpeza). Subclasses sobrescrevem para atualizar resumos na tela.
     */
    protected open fun onListaAlterada() {}

    // ========== MÉTODOS ABSTRATOS - Implementados pelas subclasses ==========

    /**
     * Mostra dialog para adicionar novo item
     */
    abstract fun mostrarDialogAdicionar()

    /**
     * Cria e adiciona a view do item no container
     */
    protected abstract fun adicionarView(item: T)

    /**
     * Mostra dialog para editar item existente
     */
    protected abstract fun mostrarDialogEditar(itemAtual: T, itemViewAtual: View)

    /**
     * Retorna mensagem de sucesso ao remover item
     */
    protected abstract fun getMensagemRemocao(): String

    /**
     * Retorna mensagem de sucesso ao atualizar item
     */
    protected abstract fun getMensagemAtualizacao(): String

    /**
     * Retorna mensagem de sucesso ao adicionar item
     */
    protected abstract fun getMensagemAdicao(): String
}
