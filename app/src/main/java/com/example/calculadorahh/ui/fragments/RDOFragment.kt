package com.example.calculadorahh.ui.fragments

import com.example.calculadorahh.R
import com.example.calculadorahh.data.models.*
import com.example.calculadorahh.domain.managers.*
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.utils.*
import com.example.calculadorahh.ui.activities.HistoricoRDOActivity

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.DatePickerDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.fragment.app.Fragment
import java.util.*
import android.content.Intent
import android.widget.AdapterView
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.activity.result.contract.ActivityResultContracts



class RDOFragment : Fragment() {

    // Database
    private lateinit var databaseHelper: DatabaseHelper
    // Managers
    private lateinit var servicosManager: ServicosManager
    private lateinit var materiaisManager: MateriaisManager
    private lateinit var hiManager: HIManager
    private lateinit var transportesManager: TransportesManager
    private lateinit var modeloLoader: ModeloLoader

    // Edit mode tracking
    private var isEditMode = false
    private var editRdoId: Long = -1L

    // Launcher para receber resultado do Histórico
    private val historicoLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            result.data?.let { data ->
                val rdoModelo = data.getParcelableCompat<RDODataCompleto>("modelo_rdo")
                rdoModelo?.let { rdo ->
                    // Carregar modelo diretamente no fragment
                    carregarModeloDireto(rdo)
                }
            }
        }
    }


    // Views - Informações Básicas
    private lateinit var btnData: Button
    private lateinit var spinnerCodigoTurma: Spinner
    private lateinit var spinnerEncarregado: Spinner
    private lateinit var etLocal: EditText
    private lateinit var spinnerHouveServico: Spinner

    // Views - Dados da OS
    private lateinit var etNumeroOS: EditText
    private lateinit var spinnerStatusOS: Spinner
    private lateinit var etKmInicio: EditText
    private lateinit var etKmFim: EditText
    private lateinit var etHorarioInicio: EditText
    private lateinit var etHorarioFim: EditText

    // Views - Clima e Segurança
    private lateinit var spinnerClima: Spinner
    private lateinit var etTemaDDS: EditText

    // Views - Serviços e Materiais
    private lateinit var btnAdicionarServico: Button
    private lateinit var llServicosRDO: LinearLayout
    private lateinit var btnAdicionarMaterial: Button
    private lateinit var llMateriaisRDO: LinearLayout

    // Efetivo
    private lateinit var etEfetivoEncarregado: EditText
    private lateinit var etEfetivoOperadores: EditText
    private lateinit var etEfetivoOperadorEGP: EditText
    private lateinit var etEfetivoTecnicoSeguranca: EditText
    private lateinit var etEfetivoSoldador: EditText
    private lateinit var etEfetivoMotoristas: EditText

    // Equipamentos
    private lateinit var etEquipCaminhaoCabinado: EditText
    private lateinit var etEquipCaminhaoMunck: EditText
    private lateinit var etEquipMicroOnibus: EditText
    private lateinit var etEquipMiniEscavadeira: EditText



    // Views - Nome dos Colaboradores
    private lateinit var etNomeColaboradores: EditText

    // Views - Observações
    private lateinit var etObservacoes: EditText

    // Views - Botões de Ação
    private lateinit var btnGerarRelatorio: Button
    private lateinit var btnCompartilhar: Button
    private lateinit var btnVerHistorico: Button
    private lateinit var btnLimparFormulario: Button

    // Containers para controle de visibilidade
    private lateinit var sectionClimaSeguranca: View
    private lateinit var sectionServicos: View
    private lateinit var sectionMateriais: View
    private lateinit var containerEquipamentos: View
    private lateinit var containerHI: View
    private lateinit var containerEfetivo: View
    private lateinit var containerTransportes: View

    // Dados
    private var dataSelecionada: String = ""

    // Flags de confirmação para validações
    private var kmFimMenorConfirmado = false
    private var horarioCruzaMeiaNoiteConfirmado = false
    private var pendingAction: (() -> Unit)? = null

    private val codigosTurma = listOf(
        "TP-273",
        "TP-274",
        "TP-764",
        "TP-891",
        "TP-876",
        "TP-900",
        "TP-911",
        "TP-920",
        "TP-922",
        "TS-910",
        "TS-912",
        "TMC 806 - Paranaguá 1",
        "TMC 807 - Paranaguá 2",
        "TMC 810 - Iguaçu",
        "TMC 806 - Corupá",
        "TMC 807 - São Francisco",
        "TMC 811 - Paranaguá 3",
        "TMC 805 - Rio Negro"
    )

    private val nomesEncarregado = listOf(
        "Adalton Trindade da Paixão",
        "Ilson Soares de Oliveira",
        "Leandro Morais da Silva",
        "Tharlleson M. Sobrinho",
        "Werbet Santos dos Santos",
        "Wilson Puff",
        "Sergio de Almeida Oliveira Bispo",
        "Marcos Jorge Marinho",
        "Weividy Fernandes",
        "Carlos Alexandre Heupa",
        "Odair José Miranda da Silva"
    )

    private val statusOSOpcoes = listOf("Em Andamento", "Concluída", "Parada", "Cancelada")
    private val climaOpcoes = listOf("Ensolarado", "Nublado", "Chuvoso", "Parcialmente Nublado")

    // Views - HI Dinâmico
    private lateinit var btnAdicionarHI: Button
    private lateinit var llHIRDO: LinearLayout

    // Views - Transportes
    private lateinit var spinnerHouveTransporte: Spinner
    private lateinit var btnAdicionarTransporte: Button
    private lateinit var llTransportesRDO: LinearLayout


    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?

    ): View? {
        return inflater.inflate(R.layout.fragment_rdo, container, false)
    }


    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        databaseHelper = DatabaseHelper.getInstance(requireContext())

        inicializarViews(view)

        // Inicializar managers
        servicosManager = ServicosManager(requireContext(), layoutInflater, llServicosRDO)
        materiaisManager = MateriaisManager(requireContext(), layoutInflater, llMateriaisRDO)
        hiManager = HIManager(requireContext(), layoutInflater, llHIRDO)
        transportesManager = TransportesManager(requireContext(), layoutInflater, llTransportesRDO)
        modeloLoader = ModeloLoader(requireContext())

        configurarSpinners()
        configurarListeners()
        configurarFormatadores()
        verificarModoEdicao()
        carregarModelo()
    }

    private fun inicializarViews(view: View) {
        // Informações Básicas
        btnData = view.findViewById(R.id.btnData)
        spinnerCodigoTurma = view.findViewById(R.id.spinnerCodigoTurma)
        spinnerEncarregado = view.findViewById(R.id.spinnerEncarregado)
        etLocal = view.findViewById(R.id.etLocal)
        spinnerHouveServico = view.findViewById(R.id.spinnerHouveServico)

        // Dados da OS
        etNumeroOS = view.findViewById(R.id.etNumeroOS)
        spinnerStatusOS = view.findViewById(R.id.spinnerStatusOS)
        etKmInicio = view.findViewById(R.id.etKmInicio)
        etKmFim = view.findViewById(R.id.etKmFim)
        etHorarioInicio = view.findViewById(R.id.etHorarioInicio)
        etHorarioFim = view.findViewById(R.id.etHorarioFim)

        // Adicionar formatação de horário
        TimeInputMask.apply(etHorarioInicio)
        TimeInputMask.apply(etHorarioFim)

        // Clima e Segurança
        spinnerClima = view.findViewById(R.id.spinnerClima)
        etTemaDDS = view.findViewById(R.id.etTemaDDS)

        // Containers para controle de visibilidade
        // CORREÇÃO: Usar View genérico para todos
        sectionClimaSeguranca = view.findViewById(R.id.cardClimaSeguranca)  // LinearLayout
        sectionServicos = view.findViewById(R.id.cardServicos)              // CardView
        sectionMateriais = view.findViewById(R.id.cardMateriais)            // CardView
        containerEquipamentos = view.findViewById(R.id.cardEquipamentos)    // LinearLayout
        containerHI = view.findViewById(R.id.cardHI)                        // LinearLayout
        containerEfetivo = view.findViewById(R.id.cardEfetivo)              // LinearLayout
        containerTransportes = view.findViewById(R.id.cardTransportes)      // CardView

        // Serviços e Materiais
        btnAdicionarServico = view.findViewById(R.id.btnAdicionarServico)
        llServicosRDO = view.findViewById(R.id.llServicosRDO)
        btnAdicionarMaterial = view.findViewById(R.id.btnAdicionarMaterial)
        llMateriaisRDO = view.findViewById(R.id.llMateriaisRDO)

        // Efetivo
        etEfetivoEncarregado = view.findViewById(R.id.etEfetivoEncarregado)
        etEfetivoOperadores = view.findViewById(R.id.etEfetivoOperadores)
        etEfetivoOperadorEGP = view.findViewById(R.id.etEfetivoOperadorEGP)
        etEfetivoTecnicoSeguranca = view.findViewById(R.id.etEfetivoTecnicoSeguranca)
        etEfetivoSoldador = view.findViewById(R.id.etEfetivoSoldador)
        etEfetivoMotoristas = view.findViewById(R.id.etEfetivoMotoristas)

        // Equipamentos
        etEquipCaminhaoCabinado = view.findViewById(R.id.etEquipCaminhaoCabinado)
        etEquipCaminhaoMunck = view.findViewById(R.id.etEquipCaminhaoMunck)
        etEquipMicroOnibus = view.findViewById(R.id.etEquipMicroOnibus)
        etEquipMiniEscavadeira = view.findViewById(R.id.etEquipMiniEscavadeira)

        // HI Dinâmico
        btnAdicionarHI = view.findViewById(R.id.btnAdicionarHI)
        llHIRDO = view.findViewById(R.id.llHIRDO)

        // Transportes
        spinnerHouveTransporte = view.findViewById(R.id.spinnerHouveTransporte)
        btnAdicionarTransporte = view.findViewById(R.id.btnAdicionarTransporte)
        llTransportesRDO = view.findViewById(R.id.llTransportesRDO)

        // Nome dos Colaboradores
        etNomeColaboradores = view.findViewById(R.id.etNomeColaboradores)

        // Observações
        etObservacoes = view.findViewById(R.id.etObservacoes)

        // Botões
        btnGerarRelatorio = view.findViewById(R.id.btnGerarRelatorio)
        btnCompartilhar = view.findViewById(R.id.btnCompartilhar)
        btnVerHistorico = view.findViewById(R.id.btnVerHistorico)
        btnLimparFormulario = view.findViewById(R.id.btnLimparFormulario)

        // Configurar listeners dos Spinners (APÓS inicialização)
        // Configurar listener do Spinner Houve Serviço
        spinnerHouveServico.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val houveServico = spinnerHouveServico.selectedItem.toString() == "SIM"
                val visibilidade = if (houveServico) View.VISIBLE else View.GONE

                sectionClimaSeguranca.visibility = visibilidade
                sectionServicos.visibility = visibilidade
                sectionMateriais.visibility = visibilidade
                containerEquipamentos.visibility = visibilidade
                containerHI.visibility = visibilidade
                containerEfetivo.visibility = visibilidade
                containerTransportes.visibility = visibilidade
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        // Configurar listener do Spinner Houve Transporte
        spinnerHouveTransporte.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val houveTransporte = spinnerHouveTransporte.selectedItem.toString() == "SIM"
                btnAdicionarTransporte.visibility = if (houveTransporte) View.VISIBLE else View.GONE
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    private fun configurarSpinners() {
        // Spinner Código da Turma
        val adapterTurma = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, codigosTurma)
        adapterTurma.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerCodigoTurma.adapter = adapterTurma

        // Spinner Encarregado
        val adapterEncarregado = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, nomesEncarregado)
        adapterEncarregado.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerEncarregado.adapter = adapterEncarregado

        // Spinner Status OS
        val adapterStatusOS = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, statusOSOpcoes)
        adapterStatusOS.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerStatusOS.adapter = adapterStatusOS

        // Spinner Clima
        val adapterClima = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, climaOpcoes)
        adapterClima.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerClima.adapter = adapterClima
        // Spinner Houve Serviço
        val houveServicoOpcoes = listOf("SIM", "NÃO")
        val adapterHouveServico = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, houveServicoOpcoes)
        adapterHouveServico.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerHouveServico.adapter = adapterHouveServico
    }

    private fun configurarListeners() {
        btnData.setOnClickListener {
            mostrarDatePicker()
        }
        btnAdicionarServico.setOnClickListener {
            servicosManager.mostrarDialogAdicionar()
        }
        btnAdicionarMaterial.setOnClickListener {
            materiaisManager.mostrarDialogAdicionar()
        }
        btnAdicionarHI.setOnClickListener {
            hiManager.mostrarDialogAdicionar()
        }
        btnAdicionarTransporte.setOnClickListener {
            transportesManager.mostrarDialogAdicionar()
        }
        btnGerarRelatorio.setOnClickListener {
            // Define ação pendente caso haja confirmações necessárias
            pendingAction = { btnGerarRelatorio.performClick() }

            if (!validarDados()) {
                return@setOnClickListener
            }

            // Limpar ação pendente e flags de confirmação após validação bem-sucedida
            pendingAction = null
            kmFimMenorConfirmado = false
            horarioCruzaMeiaNoiteConfirmado = false

            val dados = coletarDadosFormulario()

            // Desabilitar botão durante processamento
            btnGerarRelatorio.isEnabled = false
            btnCompartilhar.isEnabled = false

            lifecycleScope.launch {
                try {
                    if (isEditMode) {
                        // Modo edição: Atualizar RDO existente

                        // 🔥 FIX: atualizarRDO agora retorna Pair<Int, String?> = (rowsUpdated, numeroRDOAntigo)
                        val (rowsUpdated, numeroRDOAntigo) = withContext(Dispatchers.IO) {
                            databaseHelper.atualizarRDO(editRdoId, dados)
                        }

                        if (rowsUpdated > 0) {
                            Toast.makeText(requireContext(), "RDO atualizado com sucesso!", Toast.LENGTH_SHORT).show()

                            // Sincronizar com Google Sheets (passando número antigo se mudou)
                            SyncHelper.syncRDO(
                                context = requireContext(),
                                rdoId = editRdoId,
                                isDelete = false,
                                showToast = true,
                                numeroRDOAntigo = numeroRDOAntigo  // ✅ Agora vem do retorno de atualizarRDO
                            )

                            // Gerar relatório atualizado
                            val relatorio = RDORelatorioUtil.gerarRelatorioTextoSimples(dados)
                            val builder = AlertDialog.Builder(requireContext())
                            builder.setTitle("Visualizar Relatório Atualizado")
                            builder.setMessage(relatorio)
                            builder.setPositiveButton("Compartilhar") { dialog, which ->
                                compartilharRelatorio(relatorio)
                            }
                            builder.setNegativeButton("Fechar") { dialog, which ->
                                // Voltar para histórico
                                requireActivity().finish()
                            }
                            builder.show()
                        } else {
                            Toast.makeText(requireContext(), "Erro ao atualizar RDO", Toast.LENGTH_LONG).show()
                        }
                    } else {
                        // Modo novo: Salvar novo RDO
                        val id = withContext(Dispatchers.IO) {
                            // ✅ FIX: inserirRDO agora garante que transação está commitada antes de retornar
                            databaseHelper.inserirRDO(dados)
                        }

                        // Retornar para UI thread
                        if (id > 0) {
                            Toast.makeText(requireContext(), "RDO salvo com sucesso!", Toast.LENGTH_SHORT).show()

                            // ✅ FIX: Entrar em modo edição para prevenir duplicatas
                            // Se usuário clicar novamente em "Compartilhar", vai atualizar ao invés de inserir
                            isEditMode = true
                            editRdoId = id

                            // Sincronizar com Google Sheets (agora RDO está garantidamente no banco)
                            SyncHelper.syncRDO(requireContext(), id,
                                isDelete = false,
                                showToast = true
                            )

                            // ✅ GERAR RELATÓRIO PADRONIZADO
                            val relatorio = RDORelatorioUtil.gerarRelatorioTextoSimples(dados)
                            val builder = AlertDialog.Builder(requireContext())
                            builder.setTitle("Visualizar Relatório")
                            builder.setMessage(relatorio)
                            builder.setPositiveButton("Compartilhar") { dialog, which ->
                                compartilharRelatorio(relatorio)
                            }
                            builder.setNegativeButton("Fechar", null)
                            builder.show()
                        } else {
                            Toast.makeText(requireContext(), "Erro ao salvar RDO no banco de dados", Toast.LENGTH_LONG).show()
                        }
                    }
                } catch (e: Exception) {
                    val mensagem = if (isEditMode) "Erro ao atualizar RDO: ${e.message}" else "Erro ao gerar relatório: ${e.message}"
                    Toast.makeText(requireContext(), mensagem, Toast.LENGTH_LONG).show()
                    e.printStackTrace()
                } finally {
                    // Re-habilitar botões
                    btnGerarRelatorio.isEnabled = true
                    btnCompartilhar.isEnabled = true
                }
            }
        }
        btnCompartilhar.setOnClickListener {
            // Define ação pendente caso haja confirmações necessárias
            pendingAction = { btnCompartilhar.performClick() }

            if (!validarDados()) {
                return@setOnClickListener
            }

            // Limpar ação pendente e flags de confirmação após validação bem-sucedida
            pendingAction = null
            kmFimMenorConfirmado = false
            horarioCruzaMeiaNoiteConfirmado = false

            val dados = coletarDadosFormulario()

            // Desabilitar botões durante processamento
            btnGerarRelatorio.isEnabled = false
            btnCompartilhar.isEnabled = false

            lifecycleScope.launch {
                try {
                    if (isEditMode) {
                        // Modo edição: Atualizar e compartilhar

                        // 🔥 FIX: atualizarRDO agora retorna Pair<Int, String?> = (rowsUpdated, numeroRDOAntigo)
                        val (rowsUpdated, numeroRDOAntigo) = withContext(Dispatchers.IO) {
                            databaseHelper.atualizarRDO(editRdoId, dados)
                        }

                        if (rowsUpdated > 0) {
                            Toast.makeText(requireContext(), "RDO atualizado e compartilhado!", Toast.LENGTH_SHORT).show()

                            // Sincronizar com Google Sheets (passando número antigo se mudou)
                            SyncHelper.syncRDO(
                                context = requireContext(),
                                rdoId = editRdoId,
                                isDelete = false,
                                showToast = true,
                                numeroRDOAntigo = numeroRDOAntigo  // ✅ Agora vem do retorno de atualizarRDO
                            )

                            // Gerar relatório e compartilhar imediatamente
                            val relatorio = RDORelatorioUtil.gerarRelatorioTextoSimples(dados)
                            compartilharRelatorio(relatorio)

                            // Voltar para histórico após compartilhar
                            requireActivity().finish()
                        } else {
                            Toast.makeText(requireContext(), "Erro ao atualizar RDO", Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        // Modo novo: Salvar e compartilhar
                        val idSalvo = withContext(Dispatchers.IO) {
                            // ✅ FIX: inserirRDO agora garante que transação está commitada antes de retornar
                            databaseHelper.inserirRDO(dados)
                        }

                        // Retornar para UI thread
                        if (idSalvo > 0) {
                            Toast.makeText(requireContext(), "RDO salvo e compartilhado!", Toast.LENGTH_SHORT).show()

                            // Sincronizar com Google Sheets (agora RDO está garantidamente no banco)
                            SyncHelper.syncRDO(requireContext(), idSalvo,
                                isDelete = false,
                                showToast = true
                            )

                            // Gerar relatório e compartilhar imediatamente
                            val relatorio = RDORelatorioUtil.gerarRelatorioTextoSimples(dados)
                            compartilharRelatorio(relatorio)
                        } else {
                            Toast.makeText(requireContext(), "Erro ao salvar RDO", Toast.LENGTH_SHORT).show()
                        }
                    }
                } catch (e: Exception) {
                    Toast.makeText(requireContext(), "Erro ao compartilhar: ${e.message}", Toast.LENGTH_LONG).show()
                    e.printStackTrace()
                } finally {
                    // Re-habilitar botões
                    btnGerarRelatorio.isEnabled = true
                    btnCompartilhar.isEnabled = true
                }
            }
        }
        btnVerHistorico.setOnClickListener {
            val intent = Intent(requireContext(), HistoricoRDOActivity::class.java)
            historicoLauncher.launch(intent)
        }
        btnLimparFormulario.setOnClickListener {
            limparFormulario()
        }
    }
    private fun configurarFormatadores() {
        // Aplicar máscara de KM (formato: 123.456)
        KmInputMask.apply(etKmInicio)
        KmInputMask.apply(etKmFim)
    }

    @SuppressLint("DefaultLocale")
    private fun mostrarDatePicker() {
        val calendar = Calendar.getInstance()
        val ano = calendar.get(Calendar.YEAR)
        val mes = calendar.get(Calendar.MONTH)
        val dia = calendar.get(Calendar.DAY_OF_MONTH)

        DatePickerDialog(requireContext(), { _, anoSelecionado, mesSelecionado, diaSelecionado ->
            dataSelecionada = String.format("%02d/%02d/%04d", diaSelecionado, mesSelecionado + 1, anoSelecionado)
            btnData.text = dataSelecionada
        }, ano, mes, dia).show()
    }

    // Métodos de adição de servicos, materiais e HI agora são gerenciados pelos managers

    @SuppressLint("DefaultLocale")
    private fun validarDados(): Boolean {
        // Limpar erros anteriores
        etLocal.error = null
        etNumeroOS.error = null
        etKmInicio.error = null
        etKmFim.error = null
        etHorarioInicio.error = null
        etHorarioFim.error = null
        etTemaDDS.error = null

        // Coletar dados do formulário
        val formData = RDOFormData(
            dataSelecionada = dataSelecionada,
            codigoTurmaPosition = spinnerCodigoTurma.selectedItemPosition,
            encarregadoPosition = spinnerEncarregado.selectedItemPosition,
            local = etLocal.text.toString().trim(),
            numeroOS = etNumeroOS.text.toString().trim(),
            kmInicioText = etKmInicio.text.toString(),
            kmFimText = etKmFim.text.toString(),
            horarioInicio = etHorarioInicio.text.toString().trim(),
            horarioFim = etHorarioFim.text.toString().trim(),
            temaDDS = etTemaDDS.text.toString().trim(),
            houveServico = spinnerHouveServico.selectedItem.toString() == "SIM",
            houveTransporte = spinnerHouveTransporte.selectedItem.toString() == "SIM",
            servicosCount = servicosManager.getQuantidade(),
            materiaisCount = materiaisManager.getQuantidade(),
            temEquipamento = etEquipCaminhaoCabinado.text.toString().trim().isNotEmpty() ||
                             etEquipCaminhaoMunck.text.toString().trim().isNotEmpty() ||
                             etEquipMicroOnibus.text.toString().trim().isNotEmpty() ||
                             etEquipMiniEscavadeira.text.toString().trim().isNotEmpty(),
            nomeColaboradores = etNomeColaboradores.text.toString().trim(),
            observacoes = etObservacoes.text.toString().trim(),
            transportesCount = transportesManager.getQuantidade(),
            kmFimMenorConfirmado = kmFimMenorConfirmado,
            horarioCruzaMeiaNoiteConfirmado = horarioCruzaMeiaNoiteConfirmado
        )

        // Validar usando lógica pura
        return when (val result = RDOValidator.validar(formData)) {
            is RDOValidationResult.Valid -> true

            is RDOValidationResult.Error -> {
                Toast.makeText(requireContext(), result.mensagem, Toast.LENGTH_SHORT).show()
                val campo = findFieldByName(result.campo)
                if (result.setFieldError && campo is EditText) {
                    campo.error = result.mensagem
                }
                campo?.requestFocus()
                false
            }

            is RDOValidationResult.ConfirmacaoNecessaria -> {
                val focusField = when (result.tipo) {
                    ConfirmationType.KM_FIM_MENOR -> etKmFim
                    ConfirmationType.HORARIO_CRUZA_MEIA_NOITE -> etHorarioFim
                }
                mostrarDialogoConfirmacao(
                    titulo = result.titulo,
                    mensagem = result.mensagem,
                    onConfirmar = {
                        when (result.tipo) {
                            ConfirmationType.KM_FIM_MENOR -> kmFimMenorConfirmado = true
                            ConfirmationType.HORARIO_CRUZA_MEIA_NOITE -> horarioCruzaMeiaNoiteConfirmado = true
                        }
                        pendingAction?.invoke()
                        pendingAction = null
                    },
                    onCancelar = {
                        pendingAction = null
                        focusField.requestFocus()
                    }
                )
                false
            }
        }
    }

    /**
     * Mapeia nome de campo (string do RDOValidator) para a View correspondente.
     */
    private fun findFieldByName(name: String): View? {
        return when (name) {
            "btnData" -> btnData
            "spinnerCodigoTurma" -> spinnerCodigoTurma
            "spinnerEncarregado" -> spinnerEncarregado
            "etLocal" -> etLocal
            "etNumeroOS" -> etNumeroOS
            "etKmInicio" -> etKmInicio
            "etKmFim" -> etKmFim
            "etHorarioInicio" -> etHorarioInicio
            "etHorarioFim" -> etHorarioFim
            "etTemaDDS" -> etTemaDDS
            "etNomeColaboradores" -> etNomeColaboradores
            "etObservacoes" -> etObservacoes
            else -> null
        }
    }

    private fun compartilharRelatorio(relatorio: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, relatorio)
        }
        startActivity(Intent.createChooser(intent, "Compartilhar RDO via"))
    }

    @SuppressLint("SetTextI18n")
    private fun verificarModoEdicao() {
        val intent = requireActivity().intent
        if (intent.getBooleanExtra("EDITAR_RDO", false)) {
            isEditMode = true
            editRdoId = intent.getLongExtra("RDO_ID", -1L)

            val rdoCompleto = intent.getParcelableCompat<RDODataCompleto>("rdo_completo")

            if (rdoCompleto != null && editRdoId != -1L) {
                // Mudar texto do botão para "Atualizar RDO"
                btnGerarRelatorio.text = "ATUALIZAR RDO"
                btnCompartilhar.text = "ATUALIZAR E COMPARTILHAR"

                // Carregar dados do RDO no formulário
                carregarRDOParaEdicao(rdoCompleto)

                // Limpar flags para não recarregar
                requireActivity().intent.removeExtra("EDITAR_RDO")
                requireActivity().intent.removeExtra("RDO_ID")
                requireActivity().intent.removeExtra("rdo_completo")
            }
        }
    }

    private fun carregarModelo() {
        val intent = requireActivity().intent
        if (intent.getBooleanExtra("USAR_MODELO", false)) {
            val rdoModelo = intent.getParcelableCompat<RDODataCompleto>("modelo_rdo")

            if (rdoModelo != null) {
                carregarModeloDireto(rdoModelo)

                // Limpar flags para não recarregar
                requireActivity().intent.removeExtra("USAR_MODELO")
                requireActivity().intent.removeExtra("modelo_rdo")
            }
        }
    }

    /**
     * Carrega um RDO para edição no formulário
     */
    @SuppressLint("SetTextI18n")
    private fun carregarRDOParaEdicao(rdoCompleto: RDODataCompleto) {
        // Carregar data
        dataSelecionada = rdoCompleto.data
        btnData.text = rdoCompleto.data

        // Carregar spinners
        val indexTurma = codigosTurma.indexOf(rdoCompleto.codigoTurma)
        if (indexTurma >= 0) spinnerCodigoTurma.setSelection(indexTurma)

        val indexEncarregado = nomesEncarregado.indexOf(rdoCompleto.encarregado)
        if (indexEncarregado >= 0) spinnerEncarregado.setSelection(indexEncarregado)

        val indexStatusOS = statusOSOpcoes.indexOf(rdoCompleto.statusOS)
        if (indexStatusOS >= 0) spinnerStatusOS.setSelection(indexStatusOS)

        val indexClima = climaOpcoes.indexOf(rdoCompleto.clima)
        if (indexClima >= 0) spinnerClima.setSelection(indexClima)

        // Carregar campos de texto
        etLocal.setText(rdoCompleto.local)
        etNumeroOS.setText(rdoCompleto.numeroOS)
        etKmInicio.setText(rdoCompleto.kmInicio)
        etKmFim.setText(rdoCompleto.kmFim)
        etHorarioInicio.setText(rdoCompleto.horarioInicio)
        etHorarioFim.setText(rdoCompleto.horarioFim)
        etTemaDDS.setText(rdoCompleto.temaDDS)
        etNomeColaboradores.setText(rdoCompleto.nomeColaboradores)
        etObservacoes.setText(rdoCompleto.observacoes)

        // Carregar houve serviço
        spinnerHouveServico.setSelection(if (rdoCompleto.houveServico) 0 else 1) // 0=SIM, 1=NÃO

        // Carregar houve transporte
        spinnerHouveTransporte.setSelection(if (rdoCompleto.houveTransporte) 0 else 1)

        // Carregar efetivo
        etEfetivoEncarregado.setText(rdoCompleto.efetivo.encarregado.toString())
        etEfetivoOperadores.setText(rdoCompleto.efetivo.operadores.toString())
        etEfetivoOperadorEGP.setText(rdoCompleto.efetivo.operadorEGP.toString())
        etEfetivoTecnicoSeguranca.setText(rdoCompleto.efetivo.tecnicoSeguranca.toString())
        etEfetivoSoldador.setText(rdoCompleto.efetivo.soldador.toString())
        etEfetivoMotoristas.setText(rdoCompleto.efetivo.motoristas.toString())

        // Carregar equipamentos
        rdoCompleto.equipamentos.forEach { equip ->
            when (equip.tipo) {
                "Caminhão Cabinado" -> etEquipCaminhaoCabinado.setText(equip.placa)
                "Caminhão Munck" -> etEquipCaminhaoMunck.setText(equip.placa)
                "Micro-ônibus" -> etEquipMicroOnibus.setText(equip.placa)
                "Mini Escavadeira" -> etEquipMiniEscavadeira.setText(equip.placa)
            }
        }

        // Carregar serviços
        rdoCompleto.servicos.forEach { servico ->
            servicosManager.adicionarItem(servico)
        }

        // Carregar materiais
        rdoCompleto.materiais.forEach { material ->
            materiaisManager.adicionarItem(material)
        }

        // Carregar HI
        rdoCompleto.horasImprodutivas.forEach { hi ->
            hiManager.adicionarItem(hi)
        }

        // Carregar transportes
        rdoCompleto.transportes.forEach { transporte ->
            transportesManager.adicionarItem(transporte)
        }
    }

    /**
     * Carrega um RDO como modelo no formulário
     */
    private fun carregarModeloDireto(rdoModelo: RDODataCompleto) {
        val views = ModeloLoader.FormularioViews(
            etLocal = etLocal,
            etNumeroOS = etNumeroOS,
            etKmInicio = etKmInicio,
            etKmFim = etKmFim,
            etHorarioInicio = etHorarioInicio,
            etHorarioFim = etHorarioFim,
            etTemaDDS = etTemaDDS,
            spinnerCodigoTurma = spinnerCodigoTurma,
            spinnerEncarregado = spinnerEncarregado,
            spinnerStatusOS = spinnerStatusOS,
            spinnerClima = spinnerClima,
            etEfetivoEncarregado = etEfetivoEncarregado,
            etEfetivoOperadores = etEfetivoOperadores,
            etEfetivoOperadorEGP = etEfetivoOperadorEGP,
            etEfetivoTecnicoSeguranca = etEfetivoTecnicoSeguranca,
            etEfetivoSoldador = etEfetivoSoldador,
            etEfetivoMotoristas = etEfetivoMotoristas,
            etEquipCaminhaoCabinado = etEquipCaminhaoCabinado,
            etEquipCaminhaoMunck = etEquipCaminhaoMunck,
            etEquipMicroOnibus = etEquipMicroOnibus,
            etEquipMiniEscavadeira = etEquipMiniEscavadeira
        )

        modeloLoader.carregarModelo(rdoModelo, views, servicosManager, materiaisManager, hiManager, transportesManager)
    }

    private fun coletarDadosFormulario(): RDOData {
        // Coletar efetivo
        val efetivo = Efetivo(
            encarregado = etEfetivoEncarregado.text.toString().toIntOrNull() ?: 0,
            operadores = etEfetivoOperadores.text.toString().toIntOrNull() ?: 0,
            operadorEGP = etEfetivoOperadorEGP.text.toString().toIntOrNull() ?: 0,
            tecnicoSeguranca = etEfetivoTecnicoSeguranca.text.toString().toIntOrNull() ?: 0,
            soldador = etEfetivoSoldador.text.toString().toIntOrNull() ?: 0,
            motoristas = etEfetivoMotoristas.text.toString().toIntOrNull() ?: 0
        )

        // Coletar equipamentos
        val equipamentos = mutableListOf<Equipamento>()
        if (etEquipCaminhaoCabinado.text.toString().trim().isNotEmpty()) {
            equipamentos.add(Equipamento("Caminhão Cabinado", etEquipCaminhaoCabinado.text.toString().trim()))
        }
        if (etEquipCaminhaoMunck.text.toString().trim().isNotEmpty()) {
            equipamentos.add(Equipamento("Caminhão Munck", etEquipCaminhaoMunck.text.toString().trim()))
        }
        if (etEquipMicroOnibus.text.toString().trim().isNotEmpty()) {
            equipamentos.add(Equipamento("Micro-ônibus", etEquipMicroOnibus.text.toString().trim()))
        }
        if (etEquipMiniEscavadeira.text.toString().trim().isNotEmpty()) {
            equipamentos.add(Equipamento("Mini Escavadeira", etEquipMiniEscavadeira.text.toString().trim()))
        }

        return RDOData(
            data = dataSelecionada,
            codigoTurma = codigosTurma[spinnerCodigoTurma.selectedItemPosition],
            encarregado = nomesEncarregado[spinnerEncarregado.selectedItemPosition],
            local = etLocal.text.toString(),
            numeroOS = etNumeroOS.text.toString(),
            statusOS = statusOSOpcoes[spinnerStatusOS.selectedItemPosition],
            kmInicio = etKmInicio.text.toString(),
            kmFim = etKmFim.text.toString(),
            horarioInicio = etHorarioInicio.text.toString().trim(),
            horarioFim = etHorarioFim.text.toString().trim(),
            clima = climaOpcoes[spinnerClima.selectedItemPosition],
            temaDDS = etTemaDDS.text.toString().trim(),
            houveServico = spinnerHouveServico.selectedItem.toString() == "SIM",
            servicos = servicosManager.getServicos(),
            materiais = materiaisManager.getMateriais(),
            efetivo = efetivo,
            equipamentos = equipamentos,
            hiItens = hiManager.getHorasImprodutivas(),
            houveTransporte = spinnerHouveTransporte.selectedItem.toString() == "SIM",
            transportes = transportesManager.getTransportes(),
            nomeColaboradores = etNomeColaboradores.text.toString(),
            observacoes = etObservacoes.text.toString()
        )
    }

    @SuppressLint("SetTextI18n")
    private fun limparFormulario() {
        btnData.text = "Selecionar Data"
        dataSelecionada = ""
        spinnerCodigoTurma.setSelection(0)
        spinnerEncarregado.setSelection(0)
        etLocal.text.clear()
        etNumeroOS.text.clear()
        spinnerStatusOS.setSelection(0)
        etKmInicio.text.clear()
        etKmFim.text.clear()
        etHorarioInicio.text.clear()
        etHorarioFim.text.clear()
        spinnerClima.setSelection(0)
        etTemaDDS.text.clear()
        spinnerHouveServico.setSelection(0)

        // Limpar efetivo
        etEfetivoEncarregado.text.clear()
        etEfetivoOperadores.text.clear()
        etEfetivoOperadorEGP.text.clear()
        etEfetivoTecnicoSeguranca.text.clear()
        etEfetivoSoldador.text.clear()
        etEfetivoMotoristas.text.clear()

        // Limpar equipamentos
        etEquipCaminhaoCabinado.text.clear()
        etEquipCaminhaoMunck.text.clear()
        etEquipMicroOnibus.text.clear()
        etEquipMiniEscavadeira.text.clear()

        // Limpar HI
        hiManager.limpar()

        // Limpar transportes
        transportesManager.limpar()
        spinnerHouveTransporte.setSelection(0)

        // Limpar listas
        servicosManager.limpar()
        materiaisManager.limpar()

        // Limpar campos de texto
        etNomeColaboradores.text.clear()
        etObservacoes.text.clear()

        // Limpar flags de confirmação
        kmFimMenorConfirmado = false
        horarioCruzaMeiaNoiteConfirmado = false
        pendingAction = null

        Toast.makeText(requireContext(), "Formulário limpo", Toast.LENGTH_SHORT).show()
    }

    /**
     * Exibe um diálogo de confirmação com título e mensagem customizados
     */
    private fun mostrarDialogoConfirmacao(
        titulo: String,
        mensagem: String,
        onConfirmar: () -> Unit,
        onCancelar: () -> Unit
    ) {
        AlertDialog.Builder(requireContext())
            .setTitle(titulo)
            .setMessage(mensagem)
            .setPositiveButton("Sim") { _, _ ->
                onConfirmar()
            }
            .setNegativeButton("Não") { _, _ ->
                onCancelar()
            }
            .setCancelable(false)
            .show()
    }

}
