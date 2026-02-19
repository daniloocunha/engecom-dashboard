package com.example.calculadorahh.domain.managers

import android.content.Context
import android.widget.EditText
import android.widget.Spinner
import android.widget.Toast
import com.example.calculadorahh.data.models.RDODataCompleto

/**
 * Carrega dados de um modelo RDO no formulário
 */
class ModeloLoader(private val context: Context) {

    /**
     * Carrega modelo completo no formulário
     */
    fun carregarModelo(
        rdoModelo: RDODataCompleto,
        views: FormularioViews,
        servicosManager: ServicosManager,
        materiaisManager: MateriaisManager,
        hiManager: HIManager,
        transportesManager: TransportesManager
    ) {
        // Carregar dados básicos
        views.etLocal.setText(rdoModelo.local)
        views.etNumeroOS.setText(rdoModelo.numeroOS)
        views.etKmInicio.setText(rdoModelo.kmInicio)
        views.etKmFim.setText(rdoModelo.kmFim)

        // Selecionar nos spinners
        selecionarSpinnerPorValor(views.spinnerCodigoTurma, rdoModelo.codigoTurma)
        selecionarSpinnerPorValor(views.spinnerEncarregado, rdoModelo.encarregado)
        selecionarSpinnerPorValor(views.spinnerStatusOS, rdoModelo.statusOS)
        selecionarSpinnerPorValor(views.spinnerClima, rdoModelo.clima)

        // Carregar horários
        views.etHorarioInicio.setText(rdoModelo.horarioInicio)
        views.etHorarioFim.setText(rdoModelo.horarioFim)

        // Carregar tema DDS
        views.etTemaDDS.setText(rdoModelo.temaDDS)

        // Carregar efetivo
        views.etEfetivoEncarregado.setText(rdoModelo.efetivo.encarregado.toString())
        views.etEfetivoOperadores.setText(rdoModelo.efetivo.operadores.toString())
        views.etEfetivoOperadorEGP.setText(rdoModelo.efetivo.operadorEGP.toString())
        views.etEfetivoTecnicoSeguranca.setText(rdoModelo.efetivo.tecnicoSeguranca.toString())
        views.etEfetivoSoldador.setText(rdoModelo.efetivo.soldador.toString())
        views.etEfetivoMotoristas.setText(rdoModelo.efetivo.motoristas.toString())

        // Carregar equipamentos
        for (equipamento in rdoModelo.equipamentos) {
            when (equipamento.tipo) {
                "Caminhão Cabinado" -> views.etEquipCaminhaoCabinado.setText(equipamento.placa)
                "Caminhão Munck" -> views.etEquipCaminhaoMunck.setText(equipamento.placa)
                "Micro-ônibus" -> views.etEquipMicroOnibus.setText(equipamento.placa)
                "Mini Escavadeira" -> views.etEquipMiniEscavadeira.setText(equipamento.placa)
            }
        }

        // Carregar serviços
        for (servico in rdoModelo.servicos) {
            servicosManager.adicionarItem(servico)
        }

        // Carregar materiais
        for (material in rdoModelo.materiais) {
            materiaisManager.adicionarItem(material)
        }

        // Carregar horas improdutivas
        for (hi in rdoModelo.horasImprodutivas) {
            hiManager.adicionarItem(hi)
        }

        // Carregar transportes
        for (transporte in rdoModelo.transportes) {
            transportesManager.adicionarItem(transporte)
        }

        Toast.makeText(context, "Modelo carregado com sucesso!", Toast.LENGTH_SHORT).show()
    }

    /**
     * Seleciona item no spinner pelo valor
     */
    private fun selecionarSpinnerPorValor(spinner: Spinner, valor: String) {
        val adapter = spinner.adapter
        for (i in 0 until adapter.count) {
            if (adapter.getItem(i).toString() == valor) {
                spinner.setSelection(i)
                break
            }
        }
    }

    /**
     * Data class para agrupar todas as views do formulário
     */
    data class FormularioViews(
        // Básico
        val etLocal: EditText,
        val etNumeroOS: EditText,
        val etKmInicio: EditText,
        val etKmFim: EditText,
        val etHorarioInicio: EditText,
        val etHorarioFim: EditText,
        val etTemaDDS: EditText,

        // Spinners
        val spinnerCodigoTurma: Spinner,
        val spinnerEncarregado: Spinner,
        val spinnerStatusOS: Spinner,
        val spinnerClima: Spinner,

        // Efetivo
        val etEfetivoEncarregado: EditText,
        val etEfetivoOperadores: EditText,
        val etEfetivoOperadorEGP: EditText,
        val etEfetivoTecnicoSeguranca: EditText,
        val etEfetivoSoldador: EditText,
        val etEfetivoMotoristas: EditText,

        // Equipamentos
        val etEquipCaminhaoCabinado: EditText,
        val etEquipCaminhaoMunck: EditText,
        val etEquipMicroOnibus: EditText,
        val etEquipMiniEscavadeira: EditText
    )
}
