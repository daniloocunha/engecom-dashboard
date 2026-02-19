package com.example.calculadorahh.data.models

data class ServicoCalculado(
    val descricao: String,
    val quantidade: Double,
    val coeficiente: Double,
    val horas: Double,
    val observacoes: String = "",
    val isCustomizado: Boolean = false  // Marca serviços customizados (sem coeficiente)
)