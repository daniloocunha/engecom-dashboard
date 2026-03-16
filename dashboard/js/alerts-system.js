/**
 * Sistema de Alertas
 * Identifica e exibe alertas críticos sobre performance das turmas
 */

class AlertsSystem {
    constructor() {
        this.alerts = [];
        this.thresholds = {
            SLA_CRITICO: 0.70,      // < 70% = crítico
            SLA_ALERTA: 0.80,       // < 80% = alerta
            SLA_OK: 0.96,           // >= 96% = ok
            // Mínimo operacional diário: usa a meta configurada em METAS.META_DIARIA_TP
            // para evitar divergência caso o valor seja ajustado no config.js.
            HH_MINIMO_TP: (typeof METAS !== 'undefined' ? METAS.META_DIARIA_TP : 96),
            DIAS_MINIMO_TMC: 15     // Mínimo dias trabalhados por TMC
        };
    }

    /**
     * Adiciona alertas de qualidade de dados (ex: serviços customizados sem HH Manual).
     * Deve ser chamado após carregarDados e antes de renderizarAlertas.
     */
    adicionarAlertasDados(customizadosSemHH = []) {
        if (!customizadosSemHH || customizadosSemHH.length === 0) return;

        // Agrupar por RDO para não poluir com uma entrada por serviço
        const rdosAfetados = [...new Set(customizadosSemHH.map(s => s.numeroRDO))];
        const descricoes = customizadosSemHH.map(s => `"${s.descricao}" (${s.numeroRDO})`).join(', ');

        this.alerts.push({
            id: 'dados-customizado-sem-hh',
            severity: 'alerta',
            type: 'DADOS',
            turma: '',
            tipoTurma: '',
            message: `${customizadosSemHH.length} serviço(s) customizado(s) sem HH Manual`,
            details: `Os seguintes serviços customizados têm HH Manual = 0 e não serão faturados: ${descricoes}. Preencha o campo "HH Manual" no app.`,
            action: 'Abrir o RDO no app e preencher o campo HH Manual para cada serviço customizado',
            icon: 'fa-exclamation-circle',
            color: 'warning'
        });
    }

    /**
     * Analisa estatísticas e gera alertas
     */
    analisarEstatisticas(estatisticas) {
        this.alerts = [];

        if (!estatisticas) return this.alerts;

        // Analisar TPs
        this.analisarTPs(estatisticas.tps);

        // Analisar TMCs
        this.analisarTMCs(estatisticas.tmcs);

        // Analisar TSs
        this.analisarTSs(estatisticas.tss);

        // Ordenar por severidade (crítico > alerta > info)
        this.alerts.sort((a, b) => {
            const severityOrder = { critico: 0, alerta: 1, info: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });

        debugLog(`[Alerts] ⚠️ ${this.alerts.length} alertas gerados`);
        return this.alerts;
    }

    /**
     * Analisa TPs e gera alertas
     */
    analisarTPs(tps) {
        if (!tps || tps.length === 0) return;

        tps.forEach(tp => {
            const sla = tp.percentualSLA || 0;
            const hhTotal = tp.hh?.total || 0;

            // Alerta: SLA crítico
            if (sla < this.thresholds.SLA_CRITICO) {
                this.alerts.push({
                    id: `tp-sla-critico-${tp.turma}`,
                    severity: 'critico',
                    type: 'SLA',
                    turma: tp.turma,
                    tipoTurma: 'TP',
                    message: `SLA crítico: ${(sla * 100).toFixed(1)}%`,
                    details: `TP ${tp.turma} está com SLA de ${(sla * 100).toFixed(1)}% (abaixo de 70%)`,
                    action: 'Verificar produtividade e alocação de recursos',
                    icon: 'fa-exclamation-triangle',
                    color: 'danger'
                });
            }
            // Alerta: SLA baixo
            else if (sla < this.thresholds.SLA_ALERTA) {
                this.alerts.push({
                    id: `tp-sla-alerta-${tp.turma}`,
                    severity: 'alerta',
                    type: 'SLA',
                    turma: tp.turma,
                    tipoTurma: 'TP',
                    message: `SLA abaixo do esperado: ${(sla * 100).toFixed(1)}%`,
                    details: `TP ${tp.turma} está com SLA de ${(sla * 100).toFixed(1)}% (meta: 96%)`,
                    action: 'Monitorar performance',
                    icon: 'fa-exclamation-circle',
                    color: 'warning'
                });
            }

            // Alerta: HH muito baixo
            if (hhTotal < this.thresholds.HH_MINIMO_TP) {
                this.alerts.push({
                    id: `tp-hh-baixo-${tp.turma}`,
                    severity: 'alerta',
                    type: 'HH',
                    turma: tp.turma,
                    tipoTurma: 'TP',
                    message: `HH total baixo: ${hhTotal.toFixed(1)} HH`,
                    details: `TP ${tp.turma} registrou apenas ${hhTotal.toFixed(1)} HH no período`,
                    action: 'Verificar se houve trabalho no período',
                    icon: 'fa-chart-line',
                    color: 'warning'
                });
            }

            // Info: SLA excelente (>100%)
            if (sla > 1.0) {
                this.alerts.push({
                    id: `tp-sla-excelente-${tp.turma}`,
                    severity: 'info',
                    type: 'SLA',
                    turma: tp.turma,
                    tipoTurma: 'TP',
                    message: `SLA acima da meta: ${(sla * 100).toFixed(1)}%`,
                    details: `TP ${tp.turma} superou a meta com ${(sla * 100).toFixed(1)}% de SLA`,
                    action: 'Desempenho excelente!',
                    icon: 'fa-trophy',
                    color: 'success'
                });
            }
        });
    }

    /**
     * Analisa TMCs e gera alertas
     */
    analisarTMCs(tmcs) {
        if (!tmcs || tmcs.length === 0) return;

        tmcs.forEach(tmc => {
            const diasTrabalhados = tmc.diasTrabalhados || 0;
            const diasUteis = tmc.diasUteis || 22;

            // Alerta: Poucos dias trabalhados
            if (diasTrabalhados < this.thresholds.DIAS_MINIMO_TMC) {
                this.alerts.push({
                    id: `tmc-dias-baixo-${tmc.turma}`,
                    severity: 'alerta',
                    type: 'Dias',
                    turma: tmc.turma,
                    tipoTurma: 'TMC',
                    message: `Poucos dias trabalhados: ${diasTrabalhados}`,
                    details: `TMC ${tmc.turma} trabalhou apenas ${diasTrabalhados} dias de ${diasUteis} dias úteis`,
                    action: 'Verificar disponibilidade da turma',
                    icon: 'fa-calendar-times',
                    color: 'warning'
                });
            }

            // Info: Alta utilização
            const utilizacao = diasTrabalhados / diasUteis;
            if (utilizacao >= 0.95) {
                this.alerts.push({
                    id: `tmc-utilizacao-alta-${tmc.turma}`,
                    severity: 'info',
                    type: 'Utilização',
                    turma: tmc.turma,
                    tipoTurma: 'TMC',
                    message: `Alta utilização: ${(utilizacao * 100).toFixed(1)}%`,
                    details: `TMC ${tmc.turma} trabalhou ${diasTrabalhados} de ${diasUteis} dias (${(utilizacao * 100).toFixed(1)}%)`,
                    action: 'Excelente aproveitamento',
                    icon: 'fa-check-circle',
                    color: 'success'
                });
            }
        });
    }

    /**
     * Analisa TSs e gera alertas
     */
    analisarTSs(tss) {
        if (!tss || tss.length === 0) return;

        tss.forEach(ts => {
            const sla = ts.percentualSLA || 0;
            const hhSoldador = ts.hhSoldador || 0;

            // Alerta: SLA crítico
            if (sla < this.thresholds.SLA_CRITICO) {
                this.alerts.push({
                    id: `ts-sla-critico-${ts.turma}`,
                    severity: 'critico',
                    type: 'SLA',
                    turma: ts.turma,
                    tipoTurma: 'TS',
                    message: `SLA crítico: ${(sla * 100).toFixed(1)}%`,
                    details: `TS ${ts.turma} está com SLA de ${(sla * 100).toFixed(1)}% (abaixo de 70%)`,
                    action: 'Urgente: revisar soldagem',
                    icon: 'fa-exclamation-triangle',
                    color: 'danger'
                });
            }
            // Alerta: SLA baixo
            else if (sla < this.thresholds.SLA_ALERTA) {
                this.alerts.push({
                    id: `ts-sla-alerta-${ts.turma}`,
                    severity: 'alerta',
                    type: 'SLA',
                    turma: ts.turma,
                    tipoTurma: 'TS',
                    message: `SLA abaixo do esperado: ${(sla * 100).toFixed(1)}%`,
                    details: `TS ${ts.turma} está com SLA de ${(sla * 100).toFixed(1)}% (meta: 96%)`,
                    action: 'Monitorar trabalhos de soldagem',
                    icon: 'fa-exclamation-circle',
                    color: 'warning'
                });
            }

            // Info: SLA excelente
            if (sla > 1.0) {
                this.alerts.push({
                    id: `ts-sla-excelente-${ts.turma}`,
                    severity: 'info',
                    type: 'SLA',
                    turma: ts.turma,
                    tipoTurma: 'TS',
                    message: `SLA acima da meta: ${(sla * 100).toFixed(1)}%`,
                    details: `TS ${ts.turma} superou a meta com ${(sla * 100).toFixed(1)}% de SLA`,
                    action: 'Excelente trabalho!',
                    icon: 'fa-trophy',
                    color: 'success'
                });
            }
        });
    }

    /**
     * Renderiza alertas no dashboard
     */
    renderizarAlertas(containerId = 'alertasContainer') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('[Alerts] Container de alertas não encontrado');
            return;
        }

        if (this.alerts.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info" role="alert">
                    <i class="fas fa-check-circle me-2"></i>
                    Nenhum alerta no momento. Tudo funcionando normalmente!
                </div>
            `;
            return;
        }

        // Agrupar por severidade
        const criticos = this.alerts.filter(a => a.severity === 'critico');
        const alertas = this.alerts.filter(a => a.severity === 'alerta');
        const infos = this.alerts.filter(a => a.severity === 'info');

        let html = '';

        // Badge com resumo
        html += `
            <div class="mb-3 d-flex gap-2">
                ${criticos.length > 0 ? `<span class="badge bg-danger"><i class="fas fa-exclamation-triangle me-1"></i>${criticos.length} Crítico(s)</span>` : ''}
                ${alertas.length > 0 ? `<span class="badge bg-warning text-dark"><i class="fas fa-exclamation-circle me-1"></i>${alertas.length} Alerta(s)</span>` : ''}
                ${infos.length > 0 ? `<span class="badge bg-success"><i class="fas fa-info-circle me-1"></i>${infos.length} Info(s)</span>` : ''}
            </div>
        `;

        // Renderizar cada alerta
        this.alerts.forEach(alert => {
            html += `
                <div class="alert alert-${alert.color} alert-dismissible fade show" role="alert">
                    <div class="d-flex align-items-start">
                        <i class="fas ${alert.icon} me-3 mt-1" style="font-size: 1.2rem;"></i>
                        <div class="flex-grow-1">
                            <h6 class="alert-heading mb-1">
                                <strong>${alert.tipoTurma} ${alert.turma}</strong> - ${alert.message}
                            </h6>
                            <p class="mb-1 small">${alert.details}</p>
                            <small class="text-muted"><strong>Ação:</strong> ${alert.action}</small>
                        </div>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            `;
        });

        container.innerHTML = html;
        debugLog(`[Alerts] ✅ ${this.alerts.length} alertas renderizados`);
    }

    /**
     * Retorna contagem de alertas por severidade
     */
    getContadores() {
        return {
            critico: this.alerts.filter(a => a.severity === 'critico').length,
            alerta: this.alerts.filter(a => a.severity === 'alerta').length,
            info: this.alerts.filter(a => a.severity === 'info').length,
            total: this.alerts.length
        };
    }

    /**
     * Filtra alertas por tipo de turma
     */
    filtrarPorTipo(tipo) {
        return this.alerts.filter(a => a.tipoTurma === tipo);
    }

    /**
     * Filtra alertas por severidade
     */
    filtrarPorSeveridade(severity) {
        return this.alerts.filter(a => a.severity === severity);
    }
}

// Exportar instância global
if (typeof window !== 'undefined') {
    window.alertsSystem = new AlertsSystem();
}
