package com.example.calculadorahh.services

/**
 * Constantes centralizadas para o Google Sheets.
 * Nomes de abas, versão de headers e definições de colunas.
 */
object SheetsConstants {

    const val APPLICATION_NAME = "Calculadora HH - RDO Sync"

    // Sheet names
    const val SHEET_CONFIG = "Config"
    const val SHEET_RDO = "RDO"
    const val SHEET_SERVICOS = "Servicos"
    const val SHEET_MATERIAIS = "Materiais"
    const val SHEET_HI = "HorasImprodutivas"
    const val SHEET_TRANSPORTES = "TransporteSucatas"
    const val SHEET_EFETIVO = "Efetivo"
    const val SHEET_EQUIPAMENTOS = "Equipamentos"
    const val SHEET_AUDIT = "AuditoriaSync"

    // Versão dos headers (incrementar quando mudar estrutura)
    const val HEADERS_VERSION = 4  // v1: headers originais, v2: HI com categoria e colaboradores, v3: HH Manual em Servicos, v4: Operadores em HI

    // Lista de todas as abas que devem existir
    val ALL_SHEETS = listOf(
        SHEET_CONFIG, SHEET_RDO, SHEET_SERVICOS, SHEET_MATERIAIS,
        SHEET_HI, SHEET_TRANSPORTES, SHEET_EFETIVO, SHEET_EQUIPAMENTOS,
        SHEET_AUDIT
    )

    // Lista de abas com dados relacionados (para deleção/limpeza)
    val RELATED_DATA_SHEETS = listOf(
        SHEET_SERVICOS, SHEET_MATERIAIS, SHEET_HI,
        SHEET_TRANSPORTES, SHEET_EFETIVO, SHEET_EQUIPAMENTOS
    )

    // Headers centralizados para cada aba
    val HEADERS_RDO = listOf(
        "ID", "Número RDO", "Data", "Código Turma", "Encarregado",
        "Local", "Número OS", "Status OS", "KM Início", "KM Fim",
        "Horário Início", "Horário Fim", "Clima", "Tema DDS",
        "Houve Serviço", "Houve Transporte", "Nome Colaboradores",
        "Observações", "Deletado", "Data Sincronização", "Data Criação",
        "Versão App"
    )

    val HEADERS_SERVICOS = listOf(
        "Número RDO", "Número OS", "Data RDO", "Código Turma",
        "Encarregado", "Descrição", "Quantidade", "Unidade", "Observações",
        "É Customizado?", "HH Manual"
    )

    val HEADERS_MATERIAIS = listOf(
        "Número RDO", "Número OS", "Data RDO", "Código Turma",
        "Encarregado", "Descrição", "Quantidade", "Unidade"
    )

    val HEADERS_HI = listOf(
        "Número RDO", "Número OS", "Data RDO", "Código Turma",
        "Encarregado", "Tipo", "Descrição", "Hora Início", "Hora Fim",
        "Operadores"
    )

    val HEADERS_TRANSPORTES = listOf(
        "Número RDO", "Número OS", "Data RDO", "Código Turma",
        "Encarregado", "Descrição", "Colaboradores", "Horário Início",
        "Horário Fim", "KM Início", "KM Fim"
    )

    val HEADERS_EFETIVO = listOf(
        "Número RDO", "Número OS", "Data RDO", "Código Turma",
        "Encarregado", "Encarregado Qtd", "Operadores", "Operador EGP",
        "Técnico Segurança", "Soldador", "Motoristas"
    )

    val HEADERS_EQUIPAMENTOS = listOf(
        "Número RDO", "Número OS", "Data RDO", "Código Turma",
        "Encarregado", "Tipo", "Placa"
    )

    val HEADERS_AUDIT = listOf(
        "Timestamp",
        "Número RDO",
        "Ação",              // INSERT, UPDATE, DELETE, ERROR
        "Versão App",
        "Device ID",
        "Detalhes",
        "Status"             // SUCCESS, ERROR
    )

    /**
     * Mapa de aba → headers esperados (útil para iteração)
     */
    val SHEET_HEADERS_MAP = mapOf(
        SHEET_RDO to HEADERS_RDO,
        SHEET_SERVICOS to HEADERS_SERVICOS,
        SHEET_MATERIAIS to HEADERS_MATERIAIS,
        SHEET_HI to HEADERS_HI,
        SHEET_TRANSPORTES to HEADERS_TRANSPORTES,
        SHEET_EFETIVO to HEADERS_EFETIVO,
        SHEET_EQUIPAMENTOS to HEADERS_EQUIPAMENTOS,
        SHEET_AUDIT to HEADERS_AUDIT
    )
}
