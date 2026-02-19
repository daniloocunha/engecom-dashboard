/**
 * Comparação de Períodos
 * Compara métricas do período atual com o período anterior
 */

class PeriodComparison {
    constructor() {
        this.periodoAtual = null;
        this.periodoAnterior = null;
        this.comparacao = null;
    }

    /**
     * Calcula período anterior (mês anterior)
     */
    calcularPeriodoAnterior(mes, ano) {
        let mesAnterior = mes - 1;
        let anoAnterior = ano;

        if (mesAnterior === 0) {
            mesAnterior = 12;
            anoAnterior = ano - 1;
        }

        return { mes: mesAnterior, ano: anoAnterior };
    }

    /**
     * Compara dois períodos
     */
    compararPeriodos(estatisticasAtual, estatisticasAnterior) {
        if (!estatisticasAtual) {
            console.warn('[Comparison] Estatísticas atual não disponíveis');
            return null;
        }

        this.periodoAtual = estatisticasAtual;
        this.periodoAnterior = estatisticasAnterior;

        // Se não houver período anterior, retornar apenas atual
        if (!estatisticasAnterior) {
            console.log('[Comparison] Período anterior não disponível');
            return {
                temComparacao: false,
                atual: this.extrairMetricas(estatisticasAtual),
                anterior: null,
                evolucao: null
            };
        }

        const metricasAtual = this.extrairMetricas(estatisticasAtual);
        const metricasAnterior = this.extrairMetricas(estatisticasAnterior);
        const evolucao = this.calcularEvolucao(metricasAtual, metricasAnterior);

        this.comparacao = {
            temComparacao: true,
            atual: metricasAtual,
            anterior: metricasAnterior,
            evolucao: evolucao
        };

        console.log('[Comparison] ✅ Comparação calculada:', this.comparacao);
        return this.comparacao;
    }

    /**
     * Extrai métricas principais de um período
     */
    extrairMetricas(estatisticas) {
        const totalRDOs = (estatisticas.tmcs?.length || 0) + (estatisticas.tps?.length || 0) + (estatisticas.tss?.length || 0);

        // SLA médio de TPs
        const tps = estatisticas.tps || [];
        const mediaSLA = tps.length > 0
            ? tps.reduce((sum, tp) => sum + (tp.percentualSLA || 0), 0) / tps.length
            : 0;

        // HH total
        const hhTotal = tps.reduce((sum, tp) => sum + (tp.hh?.total || 0), 0);

        return {
            faturamentoTotal: (estatisticas.totalEngecom || 0) + (estatisticas.totalEncogel || 0),
            faturamentoEngecom: estatisticas.totalEngecom || 0,
            faturamentoEncogel: estatisticas.totalEncogel || 0,
            totalRDOs,
            totalTPs: tps.length,
            totalTMCs: estatisticas.tmcs?.length || 0,
            totalTSs: estatisticas.tss?.length || 0,
            mediaSLA,
            hhTotal
        };
    }

    /**
     * Calcula evolução percentual entre períodos
     */
    calcularEvolucao(atual, anterior) {
        const calcularVariacao = (valorAtual, valorAnterior) => {
            if (!valorAnterior || valorAnterior === 0) {
                return valorAtual > 0 ? 100 : 0;
            }
            return ((valorAtual - valorAnterior) / valorAnterior) * 100;
        };

        return {
            faturamentoTotal: calcularVariacao(atual.faturamentoTotal, anterior.faturamentoTotal),
            faturamentoEngecom: calcularVariacao(atual.faturamentoEngecom, anterior.faturamentoEngecom),
            faturamentoEncogel: calcularVariacao(atual.faturamentoEncogel, anterior.faturamentoEncogel),
            totalRDOs: calcularVariacao(atual.totalRDOs, anterior.totalRDOs),
            totalTPs: calcularVariacao(atual.totalTPs, anterior.totalTPs),
            totalTMCs: calcularVariacao(atual.totalTMCs, anterior.totalTMCs),
            totalTSs: calcularVariacao(atual.totalTSs, anterior.totalTSs),
            mediaSLA: calcularVariacao(atual.mediaSLA, anterior.mediaSLA),
            hhTotal: calcularVariacao(atual.hhTotal, anterior.hhTotal)
        };
    }

    /**
     * Renderiza comparação no dashboard
     */
    renderizarComparacao(containerId = 'comparacaoContainer') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('[Comparison] Container não encontrado');
            return;
        }

        if (!this.comparacao || !this.comparacao.temComparacao) {
            container.innerHTML = `
                <div class="alert alert-info" role="alert">
                    <i class="fas fa-info-circle me-2"></i>
                    Dados do período anterior não disponíveis para comparação.
                </div>
            `;
            return;
        }

        const { atual, anterior, evolucao } = this.comparacao;

        let html = '<div class="row g-3">';

        // Card: Faturamento Total
        html += this.renderizarCardComparacao(
            'Faturamento Total',
            atual.faturamentoTotal,
            anterior.faturamentoTotal,
            evolucao.faturamentoTotal,
            'fa-dollar-sign',
            'primary',
            true
        );

        // Card: Total de RDOs
        html += this.renderizarCardComparacao(
            'Total de RDOs',
            atual.totalRDOs,
            anterior.totalRDOs,
            evolucao.totalRDOs,
            'fa-file-alt',
            'info',
            false
        );

        // Card: Média SLA
        html += this.renderizarCardComparacao(
            'Média SLA (TPs)',
            atual.mediaSLA * 100,
            anterior.mediaSLA * 100,
            evolucao.mediaSLA,
            'fa-chart-line',
            'success',
            false,
            '%'
        );

        // Card: HH Total
        html += this.renderizarCardComparacao(
            'HH Total',
            atual.hhTotal,
            anterior.hhTotal,
            evolucao.hhTotal,
            'fa-clock',
            'warning',
            false,
            ' HH'
        );

        html += '</div>';

        // Tabela detalhada
        html += `
            <div class="table-responsive mt-4">
                <table class="table table-sm table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>Métrica</th>
                            <th class="text-end">Período Anterior</th>
                            <th class="text-end">Período Atual</th>
                            <th class="text-end">Evolução</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.renderizarLinhaTabela('TPs', anterior.totalTPs, atual.totalTPs, evolucao.totalTPs)}
                        ${this.renderizarLinhaTabela('TMCs', anterior.totalTMCs, atual.totalTMCs, evolucao.totalTMCs)}
                        ${this.renderizarLinhaTabela('TSs', anterior.totalTSs, atual.totalTSs, evolucao.totalTSs)}
                        ${this.renderizarLinhaTabela('Faturamento Engecom', anterior.faturamentoEngecom, atual.faturamentoEngecom, evolucao.faturamentoEngecom, true)}
                        ${this.renderizarLinhaTabela('Faturamento Encogel', anterior.faturamentoEncogel, atual.faturamentoEncogel, evolucao.faturamentoEncogel, true)}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        console.log('[Comparison] ✅ Comparação renderizada');
    }

    /**
     * Renderiza card de comparação
     */
    renderizarCardComparacao(titulo, valorAtual, valorAnterior, evolucao, icon, color, isMoeda = false, suffix = '') {
        const formatarValor = (valor) => {
            if (isMoeda) {
                return formatarMoeda(valor);
            }
            return valor.toFixed(1) + suffix;
        };

        const iconEvolucao = evolucao >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
        const colorEvolucao = evolucao >= 0 ? 'success' : 'danger';
        const sinalEvolucao = evolucao >= 0 ? '+' : '';

        return `
            <div class="col-md-6 col-lg-3">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="text-muted mb-0">${titulo}</h6>
                            <i class="fas ${icon} text-${color}"></i>
                        </div>
                        <h4 class="mb-1">${formatarValor(valorAtual)}</h4>
                        <div class="d-flex align-items-center">
                            <span class="badge bg-${colorEvolucao} me-2">
                                <i class="fas ${iconEvolucao} me-1"></i>
                                ${sinalEvolucao}${Math.abs(evolucao).toFixed(1)}%
                            </span>
                            <small class="text-muted">vs ${formatarValor(valorAnterior)}</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renderiza linha da tabela de comparação
     */
    renderizarLinhaTabela(label, valorAnterior, valorAtual, evolucao, isMoeda = false) {
        const formatarValor = (valor) => {
            if (isMoeda) {
                return formatarMoeda(valor);
            }
            return valor.toFixed(0);
        };

        const iconEvolucao = evolucao >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
        const colorEvolucao = evolucao >= 0 ? 'success' : 'danger';
        const sinalEvolucao = evolucao >= 0 ? '+' : '';

        return `
            <tr>
                <td><strong>${label}</strong></td>
                <td class="text-end">${formatarValor(valorAnterior)}</td>
                <td class="text-end">${formatarValor(valorAtual)}</td>
                <td class="text-end">
                    <span class="badge bg-${colorEvolucao}">
                        <i class="fas ${iconEvolucao} me-1"></i>
                        ${sinalEvolucao}${Math.abs(evolucao).toFixed(1)}%
                    </span>
                </td>
            </tr>
        `;
    }
}

// Exportar instância global
if (typeof window !== 'undefined') {
    window.periodComparison = new PeriodComparison();
}
