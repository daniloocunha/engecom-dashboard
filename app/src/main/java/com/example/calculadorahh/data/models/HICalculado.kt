package com.example.calculadorahh.data.models

data class HICalculado(
    val tipoHI: String,
    val horaInicio: String,
    val horaFim: String,
    val horas: Double
    // ✅ categoria e colaboradores removidos - estrutura real do Sheets
)