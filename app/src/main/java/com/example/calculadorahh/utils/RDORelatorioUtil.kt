package com.example.calculadorahh.utils

import android.annotation.SuppressLint
import com.example.calculadorahh.data.models.*
import com.example.calculadorahh.domain.managers.JustificativasHIManager

object RDORelatorioUtil {

    /**
     * Monta o bloco de Horas Improdutivas separando as justificativas neutras
     * (almoço, DDS, trânsito) — elas compõem a jornada mas não são perda.
     *
     * Com [catalogo] nulo, cai no agrupamento simples por tipo (comportamento
     * anterior), o que mantém o util utilizável sem `Context`.
     */
    private fun appendHorasImprodutivas(
        sb: StringBuilder,
        itens: List<HIItem>,
        catalogo: CatalogoJustificativasHI?
    ) {
        if (itens.isEmpty()) return

        val neutras = if (catalogo == null) emptyList()
        else itens.filter { JustificativasHIManager.resolver(catalogo, it.tipo)?.ehNeutra == true }
        val improdutivas = itens - neutras.toSet()

        fun bloco(titulo: String, lista: List<HIItem>) {
            if (lista.isEmpty()) return
            sb.appendLine(titulo)
            sb.appendLine()
            lista.groupBy { it.tipo }.forEach { (tipo, doTipo) ->
                sb.appendLine("  *${tipo}:*")
                doTipo.forEachIndexed { index, hi ->
                    val descricao = if (hi.descricao.isBlank()) "" else "${hi.descricao} "
                    sb.appendLine("    ${index + 1}. $descricao*Horário:* ${hi.horaInicio} → ${hi.horaFim}")
                }
                sb.appendLine()
            }
        }

        bloco("*⏸️ Horas Improdutivas*", improdutivas)
        bloco("*🕐 Jornada (não conta como HI)*", neutras)
    }

    fun gerarRelatorioTexto(
        rdo: RDODataCompleto,
        catalogo: CatalogoJustificativasHI? = null
    ): String {
        val sb = StringBuilder()

        sb.appendLine("*RDO - Registro Diário de Obra*\n\n")

        // Informações Básicas
        sb.appendLine()
        sb.appendLine("*📅 Data:* ${rdo.data}")
        sb.appendLine("*👥 Código da Turma:* ${rdo.codigoTurma}")
        sb.appendLine("*👷 Encarregado:* ${rdo.encarregado}")
        sb.appendLine()

        sb.appendLine("*\uD83D\uDCCB Dados da O.S*")
        sb.appendLine()
        sb.appendLine("*Número OS:* ${rdo.numeroOS}")
        sb.appendLine("*Status:* ${rdo.statusOS}")
        sb.appendLine("*Local:* ${rdo.local}")
        sb.appendLine("*KM Início:* ${rdo.kmInicio}")
        sb.appendLine("*KM Fim:* ${rdo.kmFim}")
        sb.appendLine("*Hora Início:* ${rdo.horarioInicio}")
        sb.appendLine("*Hora Fim:* ${rdo.horarioFim}")
        sb.appendLine()

        sb.appendLine("*⛑\uFE0F Clima e Segurança*")
        sb.appendLine()

        sb.appendLine("*Clima:* ${rdo.clima}")
        sb.appendLine("*Tema DDS:* ${rdo.temaDDS}")
        sb.appendLine()

        if (rdo.servicos.isNotEmpty()) {
            sb.appendLine("*\uD83D\uDD27 Serviços Realizados*")
            sb.appendLine()
            rdo.servicos.forEachIndexed { index, servico ->
                val badge = if (servico.isCustomizado) " [CUSTOMIZADO]" else ""
                sb.appendLine("*${index + 1}.* ${servico.descricao}$badge")
                sb.appendLine("    *Qnt.:* ${servico.quantidade}${servico.unidade}")
                // ✅ Observações removidas - aparecerão apenas na seção consolidada com numeração
            }
            sb.appendLine()
        }

        if (rdo.materiais.isNotEmpty()) {
            sb.appendLine()
            sb.appendLine("*\uD83D\uDCE6Materiais Utilizados*")
            sb.appendLine()
            rdo.materiais.forEachIndexed { index, material ->
                sb.appendLine("*${index + 1}.* ${material.descricao}")
                sb.appendLine("    *Qut.:* ${material.quantidade}${material.unidade}")
            }
            sb.appendLine()
        }


        sb.appendLine("*\uD83D\uDC65Efetivo*")
        sb.appendLine()

        sb.appendLine("*Encarregado:* ${rdo.efetivo.encarregado}")
        sb.appendLine("*Operadores:* ${rdo.efetivo.operadores}")
        sb.appendLine("*Operador EGP:* ${rdo.efetivo.operadorEGP}")
        sb.appendLine("*Técnico de Segurança:* ${rdo.efetivo.tecnicoSeguranca}")
        sb.appendLine("*Soldador:* ${rdo.efetivo.soldador}")
        sb.appendLine("*Motoristas:* ${rdo.efetivo.motoristas}")
        sb.appendLine()

        if (rdo.equipamentos.isNotEmpty()) {
            sb.appendLine()
            sb.appendLine("*\uD83D\uDE9CVeículos*")
            sb.appendLine()
            rdo.equipamentos.forEachIndexed { index, equipamento ->
                sb.appendLine("*${index + 1}.* ${equipamento.tipo} - ${equipamento.placa}")
            }
            sb.appendLine()
        }


        if (rdo.horasImprodutivas.isNotEmpty()) {
            sb.appendLine()
            appendHorasImprodutivas(sb, rdo.horasImprodutivas, catalogo)
        }


        sb.appendLine("*\uD83D\uDDD1\uFE0FManejo de Materiais e Sucatas*")
        sb.appendLine()
        sb.appendLine("*Houve Transporte:* ${if (rdo.houveTransporte) "Sim" else "Não"}")
        sb.appendLine()

        if (rdo.transportes.isNotEmpty()) {
            sb.appendLine("*Transportes Realizados:*")
            rdo.transportes.forEachIndexed { index, transporte ->
                sb.appendLine("*${index + 1}.* ${transporte.descricao}")
                sb.appendLine("   Colaboradores: ${transporte.quantidadeColaboradores}")
                sb.appendLine("   Horário: ${transporte.horarioInicio} - ${transporte.horarioFim}")
                sb.appendLine("   KM: ${transporte.kmInicio} *→* ${transporte.kmFim} (${transporte.calcularDistancia()} km)")
            }
            sb.appendLine()
        }

        if (rdo.nomeColaboradores.isNotBlank()) {
            sb.appendLine("*\uD83D\uDC65Nome dos Colaboradores*")
            sb.appendLine()
            sb.appendLine(rdo.nomeColaboradores)
            sb.appendLine()
        }

        // Observações (incluindo observações dos serviços com numeração referente à lista acima)
        val observacoesServicos = rdo.servicos
            .mapIndexedNotNull { index, servico ->
                if (!servico.observacoes.isNullOrBlank()) {
                    val numeroServico = index + 1  // Numeração da lista de serviços acima
                    val badge = if (servico.isCustomizado) " [CUSTOMIZADO]" else ""
                    "*${numeroServico}.* ${servico.descricao}$badge: ${servico.observacoes}"
                } else {
                    null
                }
            }
            .joinToString("\n")

        val temObservacoes = rdo.observacoes.isNotBlank() || observacoesServicos.isNotBlank()

        if (temObservacoes) {
            sb.appendLine("*\uD83D\uDCDDObservações*")
            sb.appendLine()

            if (observacoesServicos.isNotBlank()) {
                sb.appendLine("*Serviços:*")
                sb.appendLine(observacoesServicos)
                if (rdo.observacoes.isNotBlank()) sb.appendLine()
            }

            if (rdo.observacoes.isNotBlank()) {
                sb.appendLine("*Gerais:*")
                sb.appendLine(rdo.observacoes)
            }
        }
        return sb.toString()
    }

    @SuppressLint("DefaultLocale")
    fun gerarRelatorioTextoSimples(
        rdoData: RDOData,
        catalogo: CatalogoJustificativasHI? = null
    ): String {
        val sb = StringBuilder()

        sb.appendLine("*RDO - Registro Diário de Obra*\n")

        // Informações Básicas
        sb.appendLine("*Data:* ${rdoData.data}")
        sb.appendLine("*Código da Turma:* ${rdoData.codigoTurma}")
        sb.appendLine("*Encarregado:* ${rdoData.encarregado}")

        sb.appendLine()
        sb.appendLine("*\uD83D\uDCCB Dados da O.S*")
        sb.appendLine()

        sb.appendLine("*Número OS:* ${rdoData.numeroOS}")
        sb.appendLine("*Status:* ${rdoData.statusOS}")
        sb.appendLine("*Local:* ${rdoData.local}")
        sb.appendLine("*KM Início:* ${rdoData.kmInicio}")
        sb.appendLine("*KM Fim:* ${rdoData.kmFim}")
        sb.appendLine("*Hora Início:* ${rdoData.horarioInicio}")
        sb.appendLine("*Hora Fim:* ${rdoData.horarioFim}")

        sb.appendLine()
        sb.appendLine("*⛑\uFE0F Clima e Segurança*")
        sb.appendLine()

        sb.appendLine("*Clima:* ${rdoData.clima}")
        sb.appendLine("*Tema DDS:* ${rdoData.temaDDS}")
        sb.appendLine()

        if (rdoData.servicos.isNotEmpty()) {
            sb.appendLine("*\uD83D\uDD27 Serviços Realizados*")
            sb.appendLine()
            rdoData.servicos.forEachIndexed { index, servico ->
                val badge = if (servico.isCustomizado) " [CUSTOMIZADO]" else ""
                sb.appendLine("*${index + 1}.* ${servico.descricao}$badge")
                sb.appendLine("   *Qnt.:* ${servico.quantidade}${servico.unidade}")
                // ✅ Observações removidas - aparecerão apenas na seção consolidada com numeração
            }
            sb.appendLine()
        }


        if (rdoData.materiais.isNotEmpty()) {
            sb.appendLine("*\uD83D\uDCE6Materiais Utilizados*")
            sb.appendLine()
            rdoData.materiais.forEachIndexed { index, material ->
                sb.appendLine("*${index + 1}.* ${material.descricao}")
                sb.appendLine("   *Qnt.:* ${material.quantidade} ${material.unidade}")
            }
            sb.appendLine()
        }

        sb.appendLine("*\uD83D\uDC65Efetivo*")
        sb.appendLine()

        sb.appendLine("*Encarregado:* ${rdoData.efetivo.encarregado}")
        sb.appendLine("*Operadores:* ${rdoData.efetivo.operadores}")
        sb.appendLine("*Operador EGP:* ${rdoData.efetivo.operadorEGP}")
        sb.appendLine("*Técnico de Segurança:* ${rdoData.efetivo.tecnicoSeguranca}")
        sb.appendLine("*Soldador:* ${rdoData.efetivo.soldador}")
        sb.appendLine("*Motoristas:* ${rdoData.efetivo.motoristas}")
        sb.appendLine()

        if (rdoData.equipamentos.isNotEmpty()) {
            sb.appendLine("*\uD83D\uDE9CVeículos*")
            sb.appendLine()
            rdoData.equipamentos.forEachIndexed { index, equipamento ->
                sb.appendLine("*${index + 1}.* ${equipamento.tipo} - ${equipamento.placa}")
            }
            sb.appendLine()
        }

        if (rdoData.hiItens.isNotEmpty()) {
            appendHorasImprodutivas(sb, rdoData.hiItens, catalogo)
        }

        sb.appendLine("*\uD83D\uDDD1\uFE0FManejo de Materiais e Sucatas*")
        sb.appendLine()
        sb.appendLine("*Houve Transporte:* ${if (rdoData.houveTransporte) "Sim" else "Não"}")
        sb.appendLine()


        if (rdoData.transportes.isNotEmpty()) {
            sb.appendLine("*Transportes Realizados:*")
            rdoData.transportes.forEachIndexed { index, transporte ->
                sb.appendLine("*${index + 1}.* ${transporte.descricao}")
                sb.appendLine("   *Colaboradores:* ${transporte.quantidadeColaboradores}")
                sb.appendLine("   *Horário:* ${transporte.horarioInicio} - ${transporte.horarioFim}")
                sb.appendLine("   *KM:* ${transporte.kmInicio} *→* ${transporte.kmFim} (${String.format("%.2f", transporte.calcularDistancia())}km)")
            }
            sb.appendLine()
        }

        if (rdoData.nomeColaboradores.isNotBlank()) {
            sb.appendLine("*\uD83D\uDC65 Nome dos Colaboradores*")
            sb.appendLine()
            sb.appendLine(rdoData.nomeColaboradores)
            sb.appendLine()
        }

        // Observações (incluindo observações dos serviços com numeração referente à lista acima)
        val observacoesServicos = rdoData.servicos
            .mapIndexedNotNull { index, servico ->
                if (!servico.observacoes.isNullOrBlank()) {
                    val numeroServico = index + 1  // Numeração da lista de serviços acima
                    val badge = if (servico.isCustomizado) " [CUSTOMIZADO]" else ""
                    "*${numeroServico}.* ${servico.descricao}$badge: ${servico.observacoes}"
                } else {
                    null
                }
            }
            .joinToString("\n")

        val temObservacoes = rdoData.observacoes.isNotBlank() || observacoesServicos.isNotBlank()

        if (temObservacoes) {
            sb.appendLine("*\uD83D\uDCDD Observações*")
            sb.appendLine()

            if (observacoesServicos.isNotBlank()) {
                sb.appendLine("*Serviços:*")
                sb.appendLine(observacoesServicos)
                if (rdoData.observacoes.isNotBlank()) sb.appendLine()
            }

            if (rdoData.observacoes.isNotBlank()) {
                sb.appendLine("*Gerais:*")
                sb.appendLine(rdoData.observacoes)
            }
        }

        return sb.toString()
    }
}