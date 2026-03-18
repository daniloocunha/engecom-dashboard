/**
 * Gerenciador de Visualizações
 * Controla alternância entre dashboard clássico e minimalista
 */

class ViewManager {
    constructor() {
        this.currentView = 'classic'; // 'classic' ou 'minimal'
        this.initialized = false;
    }

    /**
     * Inicializa o gerenciador de visualizações
     */
    inicializar() {
        try {
            // Ler preferência salva do localStorage
            const savedView = localStorage.getItem('dashboardView') || 'classic';
            this.currentView = savedView;

            // Verificar se elementos existem
            const viewClassic = document.getElementById('viewClassic');
            const viewMinimal = document.getElementById('viewMinimal');

            if (!viewClassic || !viewMinimal) {
                console.warn('[ViewManager] Elementos de toggle não encontrados');
                return;
            }

            // Configurar event listeners para os radio buttons
            viewClassic.addEventListener('change', () => {
                if (viewClassic.checked) {
                    this.switchToClassic();
                }
            });

            viewMinimal.addEventListener('change', () => {
                if (viewMinimal.checked) {
                    this.switchToMinimal();
                }
            });

            // Aplicar view salva
            if (savedView === 'minimal') {
                viewMinimal.checked = true;
                this.showMinimal();
            } else {
                viewClassic.checked = true;
                this.showClassic();
            }

            this.initialized = true;
            debugLog(`[ViewManager] Inicializado em modo: ${this.currentView}`);
        } catch (error) {
            console.error('[ViewManager] Erro ao inicializar:', error);
            // Garantir que pelo menos a view clássica funcione
            this.showClassic();
        }
    }

    /**
     * Muda para visualização clássica
     */
    switchToClassic() {
        debugLog('[ViewManager] Mudando para visualização clássica');
        this.currentView = 'classic';
        localStorage.setItem('dashboardView', 'classic');

        this.showClassic();

        // Recarregar dados na view clássica
        if (typeof dashboardMain !== 'undefined' && dashboardMain.dados) {
            dashboardMain.renderizarDashboard();
        }
    }

    /**
     * Muda para visualização minimalista
     */
    switchToMinimal() {
        this.currentView = 'minimal';
        localStorage.setItem('dashboardView', 'minimal');

        this.showMinimal();

        // Carregar dados na view minimalista
        if (typeof dashboardMain !== 'undefined' && dashboardMain.dados) {
            this.renderizarViewMinimal();
        }
    }

    /**
     * Mostra visualização clássica
     */
    showClassic() {
        const classicView = document.getElementById('classicView');
        const minimalView = document.getElementById('minimalView');
        const btnFloat = document.getElementById('btnFiltrosFloat');

        // 🎨 Transição suave: fade out minimal, fade in classic
        if (minimalView) {
            minimalView.classList.remove('active');
            setTimeout(() => {
                minimalView.style.display = 'none';
            }, 300); // Aguardar animação
        }

        if (classicView) {
            classicView.style.display = 'block';
            classicView.classList.add('view-container');
            // Force reflow
            classicView.offsetHeight;
            classicView.classList.add('active');
        }

        if (btnFloat) btnFloat.style.display = 'none';
    }

    /**
     * Mostra visualização minimalista
     */
    showMinimal() {
        const classicView = document.getElementById('classicView');
        const minimalView = document.getElementById('minimalView');
        const btnFloat = document.getElementById('btnFiltrosFloat');

        // 🎨 Transição suave: fade out classic, fade in minimal
        if (classicView) {
            classicView.classList.remove('active');
            setTimeout(() => {
                classicView.style.display = 'none';
            }, 300);
        }

        if (minimalView) {
            minimalView.style.display = 'block';
            minimalView.classList.add('view-container');
            // Force reflow para garantir animação
            minimalView.offsetHeight;
            minimalView.classList.add('active');
        }

        if (btnFloat) {
            btnFloat.style.display = 'flex';
            btnFloat.style.opacity = '0';
            setTimeout(() => {
                btnFloat.style.transition = 'opacity 0.3s';
                btnFloat.style.opacity = '1';
            }, 100);
        }
    }

    /**
     * Renderiza dados na view minimalista
     */
    renderizarViewMinimal() {
        if (!dashboardMain || !dashboardMain.estatisticas) {
            return;
        }

        const stats = dashboardMain.estatisticas;

        // Atualizar Card Hero
        this.atualizarHeroCard(stats);

        // Atualizar KPIs secundários
        this.atualizarKPIsSecundarios(stats);

        // Atualizar accordions
        this.atualizarAccordionTPs(stats.tps || []);
        this.atualizarAccordionTMCs(stats.tmcs || []);
        this.atualizarAccordionTSs(stats.tss || []);

        // Renderizar calendário (usando mesmo código do calendário TP)
        this.renderizarCalendarioMinimal();
    }

    /**
     * Atualiza o Card Hero com faturamento
     */
    atualizarHeroCard(stats) {
        const faturamentoTotal = stats.totalGeral || 0;

        document.getElementById('heroFaturamento').textContent = formatarMoeda(faturamentoTotal);

        // Período
        const mes = dashboardMain.filtros.mes;
        const ano = dashboardMain.filtros.ano;
        const nomeMes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                         'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][mes - 1];
        document.getElementById('heroPeriodo').textContent = `${nomeMes}/${ano}`;

        // Tendência calculada com dados reais
        const trendElement = document.getElementById('heroTrend');
        if (trendElement) {
            try {
                const periodoAnterior = mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano: ano };
                const statsAnterior = dashboardMain.calculadora.calcularEstatisticasConsolidadas(
                    periodoAnterior.mes, periodoAnterior.ano
                );
                const totalAnterior = statsAnterior.totalGeral || 0;

                // ✅ FIX: verificar denominator antes de dividir
                if (totalAnterior > 0) {
                    const variacao = ((faturamentoTotal - totalAnterior) / totalAnterior) * 100;
                    const icone = variacao >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
                    const classe = variacao >= 0 ? 'positive' : 'negative';
                    const sinal = variacao >= 0 ? '+' : '';
                    trendElement.innerHTML = `<i class="fas ${icone}"></i> ${sinal}${variacao.toFixed(1)}% vs mês anterior`;
                    trendElement.className = `hero-trend ${classe}`;
                } else {
                    trendElement.innerHTML = '<i class="fas fa-minus"></i> Sem dados do mês anterior';
                    trendElement.className = 'hero-trend neutral';
                }
            } catch (_e) {
                trendElement.innerHTML = '';
                trendElement.className = 'hero-trend';
            }
        }
    }

    /**
     * Atualiza KPIs secundários
     */
    atualizarKPIsSecundarios(stats) {
        const totalRDOs = stats.totalRDOs || 0;
        const totalHH = stats.totalHH || 0;
        const mediaSLA = stats.mediaSLA || 0;

        document.getElementById('kpiRDOs').textContent = totalRDOs;
        document.getElementById('kpiHH').textContent = totalHH.toFixed(1);
        document.getElementById('kpiSLA').textContent = (mediaSLA * 100).toFixed(1) + '%';
    }

    /**
     * Atualiza accordion de TPs
     */
    atualizarAccordionTPs(tps) {
        const totalTPs = tps.length;
        const totalHH = tps.reduce((sum, tp) => sum + (tp.hh?.total || 0), 0);
        const mediaSLA = tps.length > 0
            ? tps.reduce((sum, tp) => sum + (tp.percentualSLA || 0), 0) / tps.length
            : 0;

        // Atualizar badge e resumo
        document.getElementById('badgeTPs').textContent = `${totalTPs} turmas`;
        document.getElementById('resumoTPs').textContent =
            `${totalHH.toFixed(1)} HH | ${(mediaSLA * 100).toFixed(1)}% SLA`;

        // Renderizar tabela
        const tbody = document.getElementById('tabelaTPsMinimal');

        if (tps.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">
                        <em>Nenhuma TP encontrada para o período selecionado</em>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = tps.map(tp => {
            const sla = (tp.percentualSLA || 0) * 100;
            const faturamento = tp.engecom?.total + tp.encogel?.total || 0;

            let statusBadge = '';
            if (sla >= 100) {
                statusBadge = '<span class="badge bg-success">✓ Atingido</span>';
            } else if (sla >= 90) {
                statusBadge = '<span class="badge bg-warning">⚠ Próximo</span>';
            } else {
                statusBadge = '<span class="badge bg-danger">✗ Abaixo</span>';
            }

            return `
                <tr>
                    <td><strong>${escapeHtml(tp.turma)}</strong></td>
                    <td>${(tp.hh?.total || 0).toFixed(1)} HH</td>
                    <td>${sla.toFixed(1)}%</td>
                    <td>${formatarMoeda(faturamento)}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Atualiza accordion de TMCs
     */
    atualizarAccordionTMCs(tmcs) {
        const totalTMCs = tmcs.length;
        const totalDias = tmcs.reduce((sum, tmc) => sum + (tmc.diasTrabalhados || 0), 0);

        document.getElementById('badgeTMCs').textContent = `${totalTMCs} turmas`;
        document.getElementById('resumoTMCs').textContent = `${totalDias} dias trabalhados`;

        const tbody = document.getElementById('tabelaTMCsMinimal');

        if (tmcs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">
                        <em>Nenhuma TMC encontrada para o período selecionado</em>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = tmcs.map(tmc => {
            const faturamento = tmc.engecom?.total + tmc.encogel?.total || 0;

            return `
                <tr>
                    <td><strong>${escapeHtml(tmc.turma)}</strong></td>
                    <td>${tmc.diasTrabalhados || 0}</td>
                    <td>${(tmc.mediaOperadores || 0).toFixed(1)}</td>
                    <td>${formatarMoeda(faturamento)}</td>
                    <td><span class="badge bg-info">Ativo</span></td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Atualiza accordion de TSs
     */
    atualizarAccordionTSs(tss) {
        const totalTSs = tss.length;
        const totalHHSoldador = tss.reduce((sum, ts) => sum + (ts.hhSoldador || 0), 0);

        document.getElementById('badgeTSs').textContent = `${totalTSs} turmas`;
        document.getElementById('resumoTSs').textContent = `${totalHHSoldador.toFixed(1)} HH Soldador`;

        const tbody = document.getElementById('tabelaTSsMinimal');

        if (tss.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">
                        <em>Nenhuma TS encontrada para o período selecionado</em>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = tss.map(ts => {
            const sla = (ts.percentualSLA || 0) * 100;
            const faturamento = ts.engecom?.total + ts.encogel?.total || 0;

            let statusBadge = '';
            if (sla >= 100) {
                statusBadge = '<span class="badge bg-success">✓ Atingido</span>';
            } else if (sla >= 90) {
                statusBadge = '<span class="badge bg-warning">⚠ Próximo</span>';
            } else {
                statusBadge = '<span class="badge bg-danger">✗ Abaixo</span>';
            }

            return `
                <tr>
                    <td><strong>${escapeHtml(ts.turma)}</strong></td>
                    <td>${(ts.hhSoldador || 0).toFixed(1)} HH</td>
                    <td>${sla.toFixed(1)}%</td>
                    <td>${formatarMoeda(faturamento)}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Renderiza calendário na view minimalista
     */
    renderizarCalendarioMinimal() {
        const container = document.getElementById('calendarioMinimalContainer');

        // Usar mesma lógica do calendário TP
        if (typeof calendarioTP !== 'undefined' && calendarioTP.renderizar) {
            container.innerHTML = '';
            // Criar estrutura similar ao calendário TP
            const turmaAtiva = dashboardMain.filtros.turma !== 'todas'
                ? dashboardMain.filtros.turma
                : null;

            if (turmaAtiva && turmaAtiva.startsWith('TP-')) {
                calendarioTP.renderizar(turmaAtiva, dashboardMain.filtros.mes, dashboardMain.filtros.ano, container);
            } else {
                container.innerHTML = `
                    <div class="text-center text-muted py-5">
                        <i class="fas fa-info-circle fa-2x mb-3"></i>
                        <p>Selecione uma turma específica para visualizar o calendário detalhado</p>
                    </div>
                `;
            }
        }
    }
}

// Funções globais para filtros da view minimalista
function aplicarFiltrosMinimal() {
    const mes = parseInt(document.getElementById('filtroMesMinimal').value);
    const ano = parseInt(document.getElementById('filtroAnoMinimal').value);
    const turma = document.getElementById('filtroTurmaMinimal').value;

    // Atualizar filtros do dashboard principal
    dashboardMain.filtros.mes = mes;
    dashboardMain.filtros.ano = ano;
    dashboardMain.filtros.turma = turma;

    // Recalcular
    dashboardMain.estatisticas = dashboardMain.calculadora.calcularEstatisticasConsolidadas(mes, ano);

    // Atualizar view minimalista
    viewManager.renderizarViewMinimal();

    // Fechar offcanvas
    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('filtrosOffcanvas'));
    if (offcanvas) {
        offcanvas.hide();
    }

    // Atualizar badge de filtros ativos
    atualizarBadgeFiltros();
}

function limparFiltrosMinimal() {
    const now = new Date();
    document.getElementById('filtroMesMinimal').value = now.getMonth() + 1;
    document.getElementById('filtroAnoMinimal').value = now.getFullYear();
    document.getElementById('filtroTurmaMinimal').value = 'todas';
    document.getElementById('filtroTPMinimal').checked = true;
    document.getElementById('filtroTMCMinimal').checked = true;
    document.getElementById('filtroTSMinimal').checked = true;

    aplicarFiltrosMinimal();
}

function atualizarBadgeFiltros() {
    let filtrosAtivos = 0;

    if (dashboardMain.filtros.turma !== 'todas') filtrosAtivos++;
    if (!document.getElementById('filtroTPMinimal')?.checked) filtrosAtivos++;
    if (!document.getElementById('filtroTMCMinimal')?.checked) filtrosAtivos++;
    if (!document.getElementById('filtroTSMinimal')?.checked) filtrosAtivos++;

    const badge = document.getElementById('filterBadge');
    if (filtrosAtivos > 0) {
        badge.textContent = filtrosAtivos;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function abrirAnaliseAvancada() {
    // Mudar para view clássica e ir para aba de visão geral
    document.getElementById('viewClassic').checked = true;
    viewManager.switchToClassic();

    // Ativar aba de Visão Geral
    const tabEl = document.getElementById('tab-geral');
    if (tabEl) {
        const tab = new bootstrap.Tab(tabEl);
        tab.show();
    }
}

function exportarRelatorio() {
    debugLog('[Export] Iniciando exportação de relatório...');

    if (!dashboardMain || !dashboardMain.estatisticas) {
        mostrarToast('Nenhum dado disponível para exportar. Aguarde o carregamento.', 'warning');
        return;
    }

    try {
        ExportHelper.exportarEstatisticasCSV(dashboardMain.estatisticas, dashboardMain.filtros);

        // Mostrar feedback de sucesso
        const toastHTML = `
            <div class="toast align-items-center text-white bg-success border-0" role="alert" aria-live="assertive" aria-atomic="true" style="position: fixed; top: 80px; right: 20px; z-index: 9999;">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-check-circle me-2"></i>
                        Relatório exportado com sucesso!
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;

        const toastContainer = document.createElement('div');
        toastContainer.innerHTML = toastHTML;
        document.body.appendChild(toastContainer);

        const toastElement = toastContainer.querySelector('.toast');
        const toast = new bootstrap.Toast(toastElement, { delay: 3000 });
        toast.show();

        // Remover do DOM após fechar
        toastElement.addEventListener('hidden.bs.toast', () => {
            document.body.removeChild(toastContainer);
        });

    } catch (error) {
        console.error('[Export] Erro ao exportar relatório:', error);
        mostrarToast('Erro ao exportar relatório: ' + error.message, 'danger');
    }
}

// Instância global
try {
    window.viewManager = new ViewManager();
} catch (error) {
    console.error('[ViewManager] Erro ao criar instância:', error);
}
