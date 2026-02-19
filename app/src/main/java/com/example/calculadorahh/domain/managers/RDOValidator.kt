package com.example.calculadorahh.domain.managers

import com.example.calculadorahh.utils.KmUtils
import com.example.calculadorahh.utils.TimeValidator

/**
 * Dados do formulário RDO necessários para validação.
 * Coleta feita pelo Fragment, lógica pura sem dependências Android (UI).
 */
data class RDOFormData(
    val dataSelecionada: String,
    val codigoTurmaPosition: Int,
    val encarregadoPosition: Int,
    val local: String,
    val numeroOS: String,
    val kmInicioText: String,
    val kmFimText: String,
    val horarioInicio: String,
    val horarioFim: String,
    val temaDDS: String,
    val houveServico: Boolean,
    val houveTransporte: Boolean,
    val servicosCount: Int,
    val materiaisCount: Int,
    val temEquipamento: Boolean,
    val nomeColaboradores: String,
    val observacoes: String,
    val transportesCount: Int,
    val kmFimMenorConfirmado: Boolean,
    val horarioCruzaMeiaNoiteConfirmado: Boolean
)

/**
 * Resultado de validação do formulário RDO.
 */
sealed class RDOValidationResult {
    /** Todos os dados válidos, pode prosseguir. */
    object Valid : RDOValidationResult()

    /**
     * Erro de validação.
     * @param campo Identificador do campo com erro (para requestFocus)
     * @param mensagem Mensagem de erro para exibir ao usuário
     * @param setFieldError Se true, exibe error no campo (EditText.error)
     */
    data class Error(
        val campo: String,
        val mensagem: String,
        val setFieldError: Boolean = false
    ) : RDOValidationResult()

    /**
     * Necessita confirmação do usuário (diálogo).
     * @param tipo Tipo de confirmação necessária
     * @param titulo Título do diálogo
     * @param mensagem Corpo do diálogo
     */
    data class ConfirmacaoNecessaria(
        val tipo: ConfirmationType,
        val titulo: String,
        val mensagem: String
    ) : RDOValidationResult()
}

enum class ConfirmationType {
    KM_FIM_MENOR,
    HORARIO_CRUZA_MEIA_NOITE
}

/**
 * Validador de formulário RDO — lógica pura sem dependências de UI.
 */
object RDOValidator {

    fun validar(data: RDOFormData): RDOValidationResult {
        // === Validações básicas (sempre obrigatórias) ===

        if (data.dataSelecionada.isEmpty()) {
            return RDOValidationResult.Error("btnData", "Selecione a data")
        }

        if (data.codigoTurmaPosition == 0) {
            return RDOValidationResult.Error("spinnerCodigoTurma", "Selecione o Código da Turma")
        }

        if (data.encarregadoPosition == 0) {
            return RDOValidationResult.Error("spinnerEncarregado", "Selecione o Encarregado")
        }

        if (data.local.isEmpty()) {
            return RDOValidationResult.Error("etLocal", "Digite o local", setFieldError = true)
        }

        if (data.numeroOS.isEmpty()) {
            return RDOValidationResult.Error("etNumeroOS", "Digite o número da OS", setFieldError = true)
        }

        // === Validação de KM ===

        val kmInicio = KmUtils.converterKmParaDouble(data.kmInicioText)
        val kmFim = KmUtils.converterKmParaDouble(data.kmFimText)

        if (kmInicio == null) {
            return RDOValidationResult.Error("etKmInicio", "Digite o KM de início", setFieldError = true)
        }

        if (kmInicio < 0) {
            return RDOValidationResult.Error("etKmInicio", "KM de início não pode ser negativo", setFieldError = true)
        }

        if (kmFim == null) {
            return RDOValidationResult.Error("etKmFim", "Digite o KM de fim", setFieldError = true)
        }

        if (kmFim < 0) {
            return RDOValidationResult.Error("etKmFim", "KM de fim não pode ser negativo", setFieldError = true)
        }

        // KM fim menor que KM início → confirmação
        if (kmFim < kmInicio && !data.kmFimMenorConfirmado) {
            return RDOValidationResult.ConfirmacaoNecessaria(
                tipo = ConfirmationType.KM_FIM_MENOR,
                titulo = "Confirmar KM",
                mensagem = "Tem certeza que o KM Final (${String.format("%.1f", kmFim)}) é menor que o KM Inicial (${String.format("%.1f", kmInicio)})?\n\nIsso pode acontecer caso o estejam trabalhando em sentido decrescente."
            )
        }

        // === Validações condicionais (quando houveServico = true) ===

        if (data.houveServico) {
            if (data.temaDDS.isEmpty()) {
                return RDOValidationResult.Error("etTemaDDS", "Preencha o tema do DDS")
            }

            if (data.horarioInicio.isEmpty()) {
                return RDOValidationResult.Error("etHorarioInicio", "Preencha o horário de início")
            }

            if (data.horarioFim.isEmpty()) {
                return RDOValidationResult.Error("etHorarioFim", "Preencha o horário de fim")
            }

            // Validar formato de horários
            val (resultInicio, parsedInicio) = TimeValidator.validateAndParse(data.horarioInicio)
            if (resultInicio is TimeValidator.ValidationResult.Invalid) {
                return RDOValidationResult.Error(
                    "etHorarioInicio",
                    "Horário de início inválido. Use formato HH:mm (ex: 07:30)"
                )
            }

            val (resultFim, parsedFim) = TimeValidator.validateAndParse(data.horarioFim)
            if (resultFim is TimeValidator.ValidationResult.Invalid) {
                return RDOValidationResult.Error(
                    "etHorarioFim",
                    "Horário de fim inválido. Use formato HH:mm (ex: 17:30)"
                )
            }

            // Horário cruza meia-noite → confirmação
            val totalMinutosInicio = parsedInicio!!.toMinutes()
            val totalMinutosFim = parsedFim!!.toMinutes()

            if (totalMinutosFim < totalMinutosInicio && !data.horarioCruzaMeiaNoiteConfirmado) {
                return RDOValidationResult.ConfirmacaoNecessaria(
                    tipo = ConfirmationType.HORARIO_CRUZA_MEIA_NOITE,
                    titulo = "Confirmar Horário",
                    mensagem = "O horário de fim (${data.horarioFim}) é menor que o horário de início (${data.horarioInicio}).\n\nVocês trabalharam de um dia para o outro (cruzando meia-noite)?"
                )
            }

            val diferencaHoras = TimeValidator.calcularDiferencaHoras(data.horarioInicio, data.horarioFim) ?: -1.0

            if (diferencaHoras > 24) {
                return RDOValidationResult.Error(
                    "etHorarioFim",
                    "Diferença de horários não pode ultrapassar 24 horas"
                )
            }

            if (data.servicosCount == 0) {
                return RDOValidationResult.Error("servicos", "Adicione pelo menos um serviço")
            }

            if (data.materiaisCount == 0) {
                return RDOValidationResult.Error("materiais", "Adicione pelo menos um material")
            }

            if (!data.temEquipamento) {
                return RDOValidationResult.Error("equipamentos", "Adicione pelo menos um equipamento")
            }
        }

        // === Validações finais (sempre obrigatórias) ===

        if (data.nomeColaboradores.isEmpty()) {
            return RDOValidationResult.Error("etNomeColaboradores", "Preencha o nome dos colaboradores")
        }

        if (!data.houveServico && data.observacoes.isEmpty()) {
            return RDOValidationResult.Error("etObservacoes", "Preencha as observações")
        }

        // Transporte obrigatório se houveServico=SIM E houveTransporte=SIM
        if (data.houveServico && data.houveTransporte && data.transportesCount == 0) {
            return RDOValidationResult.Error("transportes", "Adicione pelo menos um transporte")
        }

        return RDOValidationResult.Valid
    }
}
