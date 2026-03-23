/**
 * Análise Detalhada de TMCs
 * Mostra média de efetivo, horários, horas extras
 */

class AnaliseTMC {
    constructor() {
        this.dados = null;
        this.turmaFiltro = null;
        this.filtroMes = null;
        this.filtroAno = null;
    }

    /**
     * Carrega dados
     */
    carregarDados(rdos, efetivos) {
        this.dados = {
            rdos: rdos || [],
            efetivos: efetivos || []
        };
    }

    /**
     * Define filtros de mês/ano do dashboard principal
     */
    setFiltros(mes, ano) {
        this.filtroMes = mes;
        this.filtroAno = ano;
        console.log('[AnaliseTMC] Filtros definidos:', { mes, ano });
    }

    /**
     * Extrai TMCs únicas (filtradas por mês/ano se definido)
     */
    extrairTMCs() {
        const tmcsSet = new Set();

        this.dados.rdos.forEach(rdo => {
            const turma = rdo['Código Turma'] || rdo.codigoTurma || '';
            if (!turma || !(turma.startsWith('TMC-') || turma.startsWith('TMC '))) {
                return;
            }

            // Aplicar filtro de mês/ano se definido
            if (this.filtroMes && this.filtroAno) {
                if (!FieldHelper.rdoNoPeriodo(rdo, this.filtroMes, this.filtroAno)) return;
            }

            tmcsSet.add(turma.trim());
        });

        return Array.from(tmcsSet).sort();
    }

    /**
     * Popular select de TMCs
     */
    popularSelectTMCs() {
        const select = document.getElementById('filtroTMCAnalise');
        if (!select) return;

        const tmcs = this.extrairTMCs();

        select.innerHTML = '<option value="todas">Todas as TMCs</option>';

        tmcs.forEach(tmc => {
            const option = document.createElement('option');
            option.value = tmc;
            option.textContent = tmc;
            select.appendChild(option);
        });
    }

    /**
     * Filtra RDOs por TMC e período (mês/ano)
     */
    filtrarPorTMC(tmc) {
        let rdosFiltrados;

        if (!tmc || tmc === 'todas') {
            rdosFiltrados = this.dados.rdos.filter(rdo => {
                const turma = rdo['Código Turma'] || rdo.codigoTurma || '';
                return turma.startsWith('TMC-') || turma.startsWith('TMC ');
            });
        } else {
            rdosFiltrados = this.dados.rdos.filter(rdo => {
                const turma = rdo['Código Turma'] || rdo.codigoTurma || '';
                return turma === tmc;
            });
        }

        // Aplicar filtro de mês/ano se definido
        if (this.filtroMes && this.filtroAno) {
            rdosFiltrados = rdosFiltrados.filter(rdo =>
                FieldHelper.rdoNoPeriodo(rdo, this.filtroMes, this.filtroAno)
            );
        }

        return rdosFiltrados;
    }

    /**
     * Converte horário HH:MM em minutos
     */
    horarioParaMinutos(horario) {
        if (!horario || horario.trim() === '') return null;

        const partes = horario.split(':');
        if (partes.length !== 2) return null;

        const horas = parseInt(partes[0]);
        const minutos = parseInt(partes[1]);

        if (isNaN(horas) || isNaN(minutos)) return null;

        return horas * 60 + minutos;
    }

    /**
     * Converte minutos em HH:MM
     */
    minutosParaHorario(minutos) {
        if (minutos === null) return '-';

        const horas = Math.floor(minutos / 60);
        const mins = minutos % 60;

        return `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    /**
     * Calcula horas extras
     * 17:00 às 19:00 = 50%
     * Após 19:00 = 100%
     */
    calcularHorasExtras(horaFim) {
        if (!horaFim) return { tem: false, minutos50: 0, minutos100: 0, observacao: '' };

        const minutosFim = this.horarioParaMinutos(horaFim);
        if (minutosFim === null) return { tem: false, minutos50: 0, minutos100: 0, observacao: '' };

        const limite17h = 17 * 60; // 1020 minutos
        const limite19h = 19 * 60; // 1140 minutos

        if (minutosFim <= limite17h) {
            return { tem: false, minutos50: 0, minutos100: 0, observacao: '' };
        }

        let minutos50 = 0;
        let minutos100 = 0;

        if (minutosFim > limite17h && minutosFim <= limite19h) {
            // Entre 17:00 e 19:00 = 50%
            minutos50 = minutosFim - limite17h;
        } else if (minutosFim > limite19h) {
            // Até 19:00 = 50%, depois = 100%
            minutos50 = limite19h - limite17h; // 120 minutos (2h)
            minutos100 = minutosFim - limite19h;
        }

        const observacao = `Hora extra: ${minutos50 > 0 ? this.minutosParaHorario(minutos50) + ' (50%)' : ''} ${minutos100 > 0 ? this.minutosParaHorario(minutos100) + ' (100%)' : ''}`.trim();

        return {
            tem: true,
            minutos50: minutos50,
            minutos100: minutos100,
            observacao: observacao
        };
    }

    /**
     * Calcula estatísticas de uma TMC
     */
    calcularEstatisticasTMC(rdos) {
        if (rdos.length === 0) {
            return {
                totalRDOs: 0,
                mediaEfetivo: 0,
                mediaOperadores: 0,
                mediaMotoristas: 0,
                mediaHoraInicio: '-',
                mediaHoraFim: '-',
                diasComHoraExtra: 0,
                totalMinutos50: 0,
                totalMinutos100: 0,
                rdosComHoraExtra: []
            };
        }

        let totalEfetivo = 0;
        let totalOperadores = 0;
        let totalMotoristas = 0;
        let totalMinutosInicio = 0;
        let totalMinutosFim = 0;
        let countInicio = 0;
        let countFim = 0;
        let totalMinutos50 = 0;
        let totalMinutos100 = 0;
        const rdosComHoraExtra = [];

        rdos.forEach(rdo => {
            // Efetivo
            const efetivo = parseInt(rdo['Total Efetivo'] || rdo.totalEfetivo || 0);
            const operadores = parseInt(rdo['Total Operadores'] || rdo.totalOperadores || 0);
            const motoristas = parseInt(rdo['Total Motoristas'] || rdo.totalMotoristas || 0);

            totalEfetivo += efetivo;
            totalOperadores += operadores;
            totalMotoristas += motoristas;

            // Horários
            const horaInicio = rdo['Horário Início'] || rdo.horarioInicio || '';
            const horaFim = rdo['Horário Fim'] || rdo.horarioFim || '';

            const minutosInicio = this.horarioParaMinutos(horaInicio);
            if (minutosInicio !== null) {
                totalMinutosInicio += minutosInicio;
                countInicio++;
            }

            const minutosFim = this.horarioParaMinutos(horaFim);
            if (minutosFim !== null) {
                totalMinutosFim += minutosFim;
                countFim++;
            }

            // Horas extras
            const horaExtra = this.calcularHorasExtras(horaFim);
            if (horaExtra.tem) {
                totalMinutos50 += horaExtra.minutos50;
                totalMinutos100 += horaExtra.minutos100;
                rdosComHoraExtra.push({
                    numeroRDO: rdo['Número RDO'] || rdo.numeroRDO || '-',
                    data: rdo.Data || rdo.data || '-',
                    horaFim: horaFim,
                    observacao: horaExtra.observacao
                });
            }
        });

        return {
            totalRDOs: rdos.length,
            mediaEfetivo: (totalEfetivo / rdos.length).toFixed(1),
            mediaOperadores: (totalOperadores / rdos.length).toFixed(1),
            mediaMotoristas: (totalMotoristas / rdos.length).toFixed(1),
            mediaHoraInicio: countInicio > 0 ? this.minutosParaHorario(Math.round(totalMinutosInicio / countInicio)) : '-',
            mediaHoraFim: countFim > 0 ? this.minutosParaHorario(Math.round(totalMinutosFim / countFim)) : '-',
            diasComHoraExtra: rdosComHoraExtra.length,
            totalMinutos50: totalMinutos50,
            totalMinutos100: totalMinutos100,
            rdosComHoraExtra: rdosComHoraExtra
        };
    }

    /**
     * Renderiza análise
     */
    renderizar() {
        const container = document.getElementById('analiseTMCContainer');
        if (!container) return;

        const tmc = this.turmaFiltro || 'todas';
        const rdosFiltrados = this.filtrarPorTMC(tmc);

        if (rdosFiltrados.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Nenhum RDO de TMC encontrado.
                </div>
            `;
            return;
        }

        // Agrupar por TMC se "todas" estiver selecionado
        let grupos = {};
        if (tmc === 'todas') {
            rdosFiltrados.forEach(rdo => {
                const turma = rdo['Código Turma'] || rdo.codigoTurma || 'Sem TMC';
                if (!grupos[turma]) {
                    grupos[turma] = [];
                }
                grupos[turma].push(rdo);
            });
        } else {
            grupos[tmc] = rdosFiltrados;
        }

        let html = '';

        Object.keys(grupos).sort().forEach(nomeTMC => {
            const rdosTMC = grupos[nomeTMC];
            const stats = this.calcularEstatisticasTMC(rdosTMC);

            html += `
                <div class="card mb-4 shadow">
                    <div class="card-header bg-info text-white">
                        <h5 class="mb-0">
                            <i class="fas fa-hard-hat me-2"></i>
                            ${escapeHtml(nomeTMC)}
                        </h5>
                    </div>
                    <div class="card-body">
                        <!-- Métricas Gerais -->
                        <div class="row mb-4">
                            <div class="col-md-3">
                                <div class="text-center p-3 bg-light rounded">
                                    <h4 class="text-primary mb-1">${stats.totalRDOs}</h4>
                                    <small class="text-muted">RDOs no período</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="text-center p-3 bg-light rounded">
                                    <h4 class="text-success mb-1">${stats.mediaEfetivo}</h4>
                                    <small class="text-muted">Média Efetivo</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="text-center p-3 bg-light rounded">
                                    <h4 class="text-info mb-1">${stats.mediaOperadores}</h4>
                                    <small class="text-muted">Média Operadores</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="text-center p-3 bg-light rounded">
                                    <h4 class="text-warning mb-1">${stats.mediaMotoristas}</h4>
                                    <small class="text-muted">Média Motoristas</small>
                                </div>
                            </div>
                        </div>

                        <!-- Horários -->
                        <div class="row mb-4">
                            <div class="col-md-6">
                                <div class="d-flex align-items-center p-3 bg-light rounded">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-clock fa-2x text-primary"></i>
                                    </div>
                                    <div class="flex-grow-1 ms-3">
                                        <small class="text-muted">Horário Médio de Início</small>
                                        <h5 class="mb-0">${stats.mediaHoraInicio}</h5>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="d-flex align-items-center p-3 bg-light rounded">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-clock fa-2x text-danger"></i>
                                    </div>
                                    <div class="flex-grow-1 ms-3">
                                        <small class="text-muted">Horário Médio de Fim</small>
                                        <h5 class="mb-0">${stats.mediaHoraFim}</h5>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Horas Extras -->
                        ${stats.diasComHoraExtra > 0 ? `
                            <div class="alert alert-warning">
                                <h6 class="alert-heading">
                                    <i class="fas fa-exclamation-triangle me-2"></i>
                                    Horas Extras Detectadas
                                </h6>
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <strong>${stats.diasComHoraExtra}</strong> dia(s) com hora extra
                                    </div>
                                    <div class="col-md-4">
                                        <strong>${this.minutosParaHorario(stats.totalMinutos50)}</strong> em 50%
                                    </div>
                                    <div class="col-md-4">
                                        <strong>${this.minutosParaHorario(stats.totalMinutos100)}</strong> em 100%
                                    </div>
                                </div>

                                <h6 class="mt-3 mb-2">Detalhamento:</h6>
                                <div class="table-responsive">
                                    <table class="table table-sm table-hover mb-0">
                                        <thead class="table-light">
                                            <tr>
                                                <th>RDO</th>
                                                <th>Data</th>
                                                <th>Hora Fim</th>
                                                <th>Observação</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${stats.rdosComHoraExtra.map(rdo => `
                                                <tr>
                                                    <td><code>${escapeHtml(rdo.numeroRDO)}</code></td>
                                                    <td>${escapeHtml(rdo.data)}</td>
                                                    <td><strong>${escapeHtml(rdo.horaFim)}</strong></td>
                                                    <td><span class="badge bg-warning text-dark">${escapeHtml(rdo.observacao)}</span></td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ` : `
                            <div class="alert alert-success">
                                <i class="fas fa-check-circle me-2"></i>
                                Nenhuma hora extra detectada neste período.
                            </div>
                        `}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * Aplicar filtro de TMC
     */
    aplicarFiltroTMC() {
        const select = document.getElementById('filtroTMCAnalise');
        if (select) {
            this.turmaFiltro = select.value === 'todas' ? null : select.value;
            this.renderizar();
        }
    }

    /**
     * Inicializar
     */
    inicializar() {
        this.popularSelectTMCs();
        this.renderizar();

        // Event listener
        const select = document.getElementById('filtroTMCAnalise');
        if (select) {
            select.addEventListener('change', () => this.aplicarFiltroTMC());
        }
    }
}

// Instância global
const analiseTMC = new AnaliseTMC();
