package com.example.calculadorahh.data.models

import android.annotation.SuppressLint
import android.os.Parcelable
import kotlinx.parcelize.Parcelize

/**
 * Representa um item de transporte de sucatas ou materiais no RDO
 */
@Parcelize
data class TransporteItem(
    val descricao: String,
    val quantidadeColaboradores: Int,
    val horarioInicio: String,
    val horarioFim: String,
    val kmInicio: Double,
    val kmFim: Double
) : Parcelable {

    /**
     * Calcula a distância percorrida
     */
    fun calcularDistancia(): Double {
        return kmFim - kmInicio
    }

    /**
     * Calcula a distância percorrida formatada com 2 casas decimais
     */
    @SuppressLint("DefaultLocale")
    fun calcularDistanciaFormatada(): String {
        return String.format("%.2f", calcularDistancia())
    }

    /**
     * Formata para exibição
     */
    override fun toString(): String {
        return "$descricao - $quantidadeColaboradores colaboradores - $horarioInicio às $horarioFim - ${calcularDistanciaFormatada()} km"
    }
}
