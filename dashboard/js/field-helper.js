/**
 * Helper para acesso consistente a campos do Google Sheets
 * Resolve problema de normalização inconsistente
 */

// Fallback: garante que debugLog existe mesmo se config.js não a definir
// (ocorre quando config.js foi criado manualmente a partir de config.example.js)
if (typeof debugLog === 'undefined') {
    window.debugLog = () => {};
}

class FieldHelper {
    /**
     * Obtém valor de campo com fallback para múltiplas variações
     * @param {Object} obj - Objeto a buscar
     * @param {string} campoBase - Nome base do campo (camelCase)
     * @param {Array<string>} variantes - Variações alternativas
     * @param {*} defaultValue - Valor padrão se não encontrar
     * @returns {*} Valor do campo ou defaultValue
     */
    static getCampo(obj, campoBase, variantes = [], defaultValue = '') {
        if (!obj) return defaultValue;

        // Tentar campo base primeiro
        if (obj[campoBase] !== undefined && obj[campoBase] !== null && obj[campoBase] !== '') {
            return obj[campoBase];
        }

        // Tentar variantes
        for (const variante of variantes) {
            if (obj[variante] !== undefined && obj[variante] !== null && obj[variante] !== '') {
                return obj[variante];
            }
        }

        // Log warning apenas se for algo importante (não vazio)
        if (defaultValue !== '') {
            console.warn(`[FieldHelper] Campo '${campoBase}' não encontrado em:`, Object.keys(obj));
        }

        return defaultValue;
    }

    /**
     * Atalhos para campos comuns de RDO
     */
    static getRDOData(rdo) {
        return this.getCampo(rdo, 'data', ['Data', 'Data RDO', 'data_rdo']);
    }

    static getRDONumeroOS(rdo) {
        return this.getCampo(rdo, 'numeroOS', ['Número OS', 'numero_os', 'NumeroOS']);
    }

    static getRDONumeroRDO(rdo) {
        return this.getCampo(rdo, 'numeroRDO', ['Número RDO', 'numero_rdo', 'NumeroRDO']);
    }

    static getRDOCodigoTurma(rdo) {
        return this.getCampo(rdo, 'codigoTurma', ['Código Turma', 'codigo_turma', 'codigTurma']);
    }

    static getRDOEncarregado(rdo) {
        return this.getCampo(rdo, 'encarregado', ['Encarregado', 'encarregado_nome']);
    }

    static getRDOLocal(rdo) {
        return this.getCampo(rdo, 'local', ['Local', 'local_servico']);
    }

    /**
     * Atalhos para campos comuns de Serviço
     */
    static getServicoDescricao(servico) {
        return this.getCampo(servico, 'descricao', ['Descrição', 'descricao_servico']);
    }

    static getServicoQuantidade(servico) {
        const valor = this.getCampo(servico, 'quantidade', ['Quantidade', 'qtd'], '0');
        return parseFloat(valor) || 0;
    }

    static getServicoCoeficiente(servico) {
        const valor = this.getCampo(servico, 'coeficiente', ['Coeficiente', 'coef'], '0');
        return parseFloat(valor) || 0;
    }

    static getServicoCustomizado(servico) {
        return this.getCampo(servico, 'eCustomizado', ['É Customizado?', 'e_customizado', 'customizado'], 'NAO');
    }

    /**
     * Atalhos para campos comuns de HI (Horas Improdutivas)
     */
    static getHITipo(hi) {
        return this.getCampo(hi, 'tipo', ['Tipo', 'tipo_hi', 'categoria']);
    }

    static getHIDescricao(hi) {
        return this.getCampo(hi, 'descricao', ['Descrição', 'descricao_hi']);
    }

    static getHIHoraInicio(hi) {
        return this.getCampo(hi, 'horaInicio', ['Hora Início', 'hora_inicio', 'horaInicio']);
    }

    static getHIHoraFim(hi) {
        return this.getCampo(hi, 'horaFim', ['Hora Fim', 'hora_fim', 'horaFim']);
    }

    /**
     * Atalhos para campos comuns de Efetivo
     */
    static getEfetivoOperadores(efetivo) {
        const valor = this.getCampo(efetivo, 'operadores', ['Operadores', 'qtd_operadores'], '0');
        return parseInt(valor) || 0;
    }

    static getEfetivoEncarregadoQtd(efetivo) {
        const valor = this.getCampo(efetivo, 'encarregadoQtd', ['Encarregado Qtd', 'encarregado_qtd', 'EncarregadoQtd'], '0');
        return parseInt(valor) || 0;
    }

    static getEfetivoSoldador(efetivo) {
        const valor = this.getCampo(efetivo, 'soldador', ['Soldador', 'qtd_soldador'], '0');
        return parseInt(valor) || 0;
    }

    /**
     * Parse de data no formato DD/MM/YYYY
     */
    static parseData(dataStr) {
        if (!dataStr) return null;

        const partes = dataStr.split('/');
        if (partes.length !== 3) return null;

        const dia = parseInt(partes[0]);
        const mes = parseInt(partes[1]);
        const ano = parseInt(partes[2]);

        if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return null;

        return { dia, mes, ano };
    }

    /**
     * Verifica se RDO pertence ao período
     */
    static rdoNoPeriodo(rdo, mes, ano) {
        const dataStr = this.getRDOData(rdo);
        const parsed = this.parseData(dataStr);

        if (!parsed) return false;

        return parsed.mes === mes && parsed.ano === ano;
    }

    /**
     * Agrupa RDOs por turma
     */
    static agruparPorTurma(rdos) {
        const grupos = {};

        rdos.forEach(rdo => {
            const turma = this.getRDOCodigoTurma(rdo);
            if (!turma) return;

            if (!grupos[turma]) grupos[turma] = [];
            grupos[turma].push(rdo);
        });

        return grupos;
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.FieldHelper = FieldHelper;
}
