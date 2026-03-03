/**
 * Calendário de Performance das TSs (Turmas de Solda)
 * Visualização mensal com detalhes diários - baseado em HH do Soldador
 * v3.0.8 - Mostra todos os calendários das TSs automaticamente (igual às TPs)
 */

class CalendarioTS {
    constructor() {
        this.dados = null;
        this.mesAtual = new Date().getMonth() + 1;
        this.anoAtual = new Date().getFullYear();
        this.turmaFiltro = null;
        this.modalCharts = []; // Rastrear charts do modal para evitar memory leaks
    }

    /**
     * Carrega dados
     */
    carregarDados(rdos, servicos, horasImprodutivas, efetivos) {
        this.dados = {
            rdos: rdos || [],
            servicos: servicos || [],
            horasImprodutivas: horasImprodutivas || [],
            efetivos: efetivos || []
        };
    }

    /**
     * Define filtros de mês/ano/turma
     */
    setFiltros(mes, ano, turma) {
        this.mesAtual = mes;
        this.anoAtual = ano;
        this.turmaFiltro = turma; // turmaFiltro ainda pode ser usado para filtrar uma TS específica
    }

    /**
     * Obtém dias do mês
     */
    getDiasDoMes(mes, ano) {
        const ultimoDia = new Date(ano, mes, 0).getDate();
        const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay();

        return {
            totalDias: ultimoDia,
            primeiroDiaSemana: primeiroDiaSemana
        };
    }

    /**
     * Calcula HH do soldador de um dia (serviços executados)
     */
    calcularHHSoldadorDia(numeroOS, data) {
        let hhTotal = 0;

        const servicosDoDia = this.dados.servicos.filter(s => {
            const numOS = s['Número OS'] || s.numeroOs || s.numeroOS || '';
            const dataServico = s['Data RDO'] || s.dataRdo || s.data || '';
            return numOS === numeroOS && dataServico === data;
        });

        servicosDoDia.forEach(servico => {
            const quantidade = parseFloat(servico.Quantidade || servico.quantidade || 0);
            const coeficiente = parseFloat(servico.Coeficiente || servico.coeficiente || 0);
            hhTotal += quantidade * coeficiente;
        });

        return hhTotal;
    }

    /**
     * Obtém efetivo de um dia
     */
    obterEfetivoDia(numeroOS, data) {
        const efetivoDia = this.dados.efetivos.find(ef => {
            const numOS = ef['Número OS'] || ef.numeroOs || ef.numeroOS || '';
            const dataEfetivo = ef['Data RDO'] || ef.dataRdo || ef.data || '';
            return numOS === numeroOS && dataEfetivo === data;
        });

        if (!efetivoDia) {
            return { total: 0, soldador: 0, operadores: 0, encarregado: 0, motorista: 0 };
        }

        const encarregado = parseInt(efetivoDia['Encarregado Qtd'] || efetivoDia.encarregadoQtd || 0);
        const soldador = parseInt(efetivoDia['Soldador'] || efetivoDia.soldador || 0);
        const operadores = parseInt(efetivoDia['Operadores'] || efetivoDia.operadores || 0);
        const motorista = parseInt(efetivoDia['Motoristas'] || efetivoDia.motoristas || 0);
        const total = encarregado + soldador + operadores + motorista;

        return { total, encarregado, soldador, operadores, motorista };
    }

    /**
     * Obtém dados completos de um dia
     */
    obterDadosDia(turma, dia, mes, ano) {
        const dataFormatada = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;

        const rdoDia = this.dados.rdos.find(rdo => {
            const codigoTurma = rdo['Código Turma'] || rdo.codigoTurma || '';
            const data = rdo.Data || rdo.data || '';
            const deletado = (rdo['Deletado'] || rdo.deletado || '').toLowerCase();
            return codigoTurma === turma && data === dataFormatada && deletado !== 'sim';
        });

        if (!rdoDia) return null;

        const numeroOS  = rdoDia['Número OS']  || rdoDia.numeroOS  || '';
        const numeroRDO = rdoDia['Número RDO'] || rdoDia.numeroRDO || '-';
        const horaInicio = rdoDia['Horário Início'] || rdoDia.horarioInicio || '-';
        const horaFim    = rdoDia['Horário Fim']    || rdoDia.horarioFim    || '-';
        const local      = rdoDia.Local || rdoDia.local || '-';
        const kmInicio   = (rdoDia['KM Início'] || rdoDia.kmInicio || rdoDia['Km Início'] || rdoDia['km_inicio'] || '').toString().trim();
        const kmFim      = (rdoDia['KM Fim']    || rdoDia.kmFim    || rdoDia['Km Fim']    || rdoDia['km_fim']    || '').toString().trim();

        const hhSoldador = this.calcularHHSoldadorDia(numeroOS, dataFormatada);
        const efetivo = this.obterEfetivoDia(numeroOS, dataFormatada);
        const observacoes = rdoDia['Observações'] || rdoDia.Observacoes || rdoDia.observacoes || '';

        // HI do dia — buscado por Número RDO (mais confiável que OS+data)
        const hisDoDia = this.dados.horasImprodutivas.filter(hi => {
            const hRDO = hi['Número RDO'] || hi.numeroRDO || hi.numeroRdo || '';
            return hRDO === numeroRDO;
        }).map(hi => ({
            tipo:       hi.Tipo || hi.tipo || '-',
            descricao:  hi['Descrição'] || hi.descricao || '-',
            horaInicio: hi['Hora Início'] || hi.horaInicio || '-',
            horaFim:    hi['Hora Fim']    || hi.horaFim   || '-',
            hh:         parseFloat(hi['HH Improdutivas'] || hi.hhImprodutivas || 0).toFixed(2),
            overlap:    false
        }));

        // Detectar sobreposição entre HIs do mesmo dia
        if (hisDoDia.length > 1) {
            const pm = t => { if (!t || t === '-') return -1; const p = t.split(':').map(Number); return (p[0]||0)*60+(p[1]||0); };
            const ivals = hisDoDia.map(h => { const s = pm(h.horaInicio); let e = pm(h.horaFim); if (s>=0&&e>=0&&e<=s) e+=1440; return {s,e}; });
            hisDoDia.forEach((h,i) => { h.overlap = ivals[i].s>=0 && ivals.some((iv,j)=>j!==i&&iv.s>=0&&ivals[i].s<iv.e&&iv.s<ivals[i].e); });
        }

        const hhImprodutivas = hisDoDia.reduce((sum, h) => sum + parseFloat(h.hh), 0);

        const metaDiaria = METAS.META_DIARIA_TS;
        const totalHHDia = hhSoldador + hhImprodutivas;
        const percentualMeta = metaDiaria > 0 ? totalHHDia / metaDiaria : 0;

        let status = 'vermelho';
        if (percentualMeta >= 1.0) {
            status = 'verde';
        } else if (percentualMeta >= 0.80) {
            status = 'amarelo';
        }

        return {
            data: dataFormatada,
            numeroOS,
            numeroRDO,
            horaInicio,
            horaFim,
            local,
            kmInicio,
            kmFim,
            hhSoldador,
            hhImprodutivas,
            metaDiaria,
            percentualMeta,
            status,
            efetivo,
            observacoes,
            horasImprodutivas: hisDoDia,
            rdo: rdoDia
        };
    }

    /**
     * Calcula estatísticas mensais de uma turma TS para o header do card
     */
    calcularEstatisticasTurma(turma) {
        const rdosTurma = this.dados.rdos.filter(rdo => {
            const turmaBanco = rdo['Código Turma'] || rdo.codigoTurma || '';
            const dataBanco = rdo['Data'] || rdo.data || '';
            const deletado = (rdo['Deletado'] || rdo.deletado || '').toLowerCase();
            if (!dataBanco) return false;
            const [, mes, ano] = dataBanco.split('/');
            return turmaBanco === turma
                && parseInt(mes) === this.mesAtual
                && parseInt(ano) === this.anoAtual
                && deletado !== 'sim';
        });

        // HH Soldador total
        let hhSoldadorTotal = 0;
        rdosTurma.forEach(rdo => {
            const numeroOS = rdo['Número OS'] || rdo.numeroOS || '';
            const dataBanco = rdo['Data'] || rdo.data || '';
            hhSoldadorTotal += this.calcularHHSoldadorDia(numeroOS, dataBanco);
        });

        // Dias trabalhados
        const diasTrabalhados = rdosTurma.length;

        // Meta mensal
        const metaMensal = METAS.META_DIARIA_TS * diasTrabalhados;
        const slaPercentual = metaMensal > 0 ? ((hhSoldadorTotal / metaMensal) * 100).toFixed(1) : '0.0';

        // Encarregado
        const encarregado = rdosTurma.length > 0
            ? (rdosTurma[0].Encarregado || rdosTurma[0].encarregado || '-')
            : '-';

        return {
            hhSoldadorTotal,
            diasTrabalhados,
            slaPercentual,
            encarregado
        };
    }

    /**
     * Renderiza o card de calendário para uma turma TS (retorna HTML string)
     */
    renderizarCalendario(turma) {
        const { totalDias, primeiroDiaSemana } = this.getDiasDoMes(this.mesAtual, this.anoAtual);
        const META_DIARIA = METAS.META_DIARIA_TS;
        const stats = this.calcularEstatisticasTurma(turma);

        let html = `
            <div class="card mb-4 shadow-sm">
                <div class="card-header bg-danger text-white">
                    <div class="row align-items-center">
                        <div class="col-md-4">
                            <h5 class="mb-0"><i class="fas fa-fire me-2"></i>${turma}</h5>
                            <small class="opacity-75">Encarregado: ${stats.encarregado}</small>
                        </div>
                        <div class="col-md-8">
                            <div class="row g-2">
                                <div class="col-4 text-center">
                                    <small class="d-block opacity-75 mb-1">Dias Trabalhados</small>
                                    <strong class="d-block">${stats.diasTrabalhados}</strong>
                                </div>
                                <div class="col-4 text-center">
                                    <small class="d-block opacity-75 mb-1">HH Soldador</small>
                                    <strong class="d-block">${stats.hhSoldadorTotal.toFixed(1)}</strong>
                                </div>
                                <div class="col-4 text-center">
                                    <small class="d-block opacity-75 mb-1">SLA %</small>
                                    <strong class="d-block">${stats.slaPercentual}%</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card-body">
                    <div class="calendario-mes">
                        <div class="calendario-header">
                            <div class="dia-semana">Dom</div>
                            <div class="dia-semana">Seg</div>
                            <div class="dia-semana">Ter</div>
                            <div class="dia-semana">Qua</div>
                            <div class="dia-semana">Qui</div>
                            <div class="dia-semana">Sex</div>
                            <div class="dia-semana">Sáb</div>
                        </div>
                        <div class="calendario-grid">
        `;

        // Células vazias antes do primeiro dia
        for (let i = 0; i < primeiroDiaSemana; i++) {
            html += '<div class="calendario-dia vazio"></div>';
        }

        // Dias do mês
        for (let dia = 1; dia <= totalDias; dia++) {
            const dadosDia = this.obterDadosDia(turma, dia, this.mesAtual, this.anoAtual);

            if (dadosDia) {
                const corStatus = dadosDia.status === 'verde' ? '#4CAF50' :
                                 dadosDia.status === 'amarelo' ? '#FFC107' : '#F44336';

                html += `
                    <div class="calendario-dia trabalhado ${dadosDia.status}"
                         style="border-left: 4px solid ${corStatus}; cursor: pointer;"
                         onclick="calendarioTS.mostrarDetalhesDia('${turma}', ${dia}, ${this.mesAtual}, ${this.anoAtual})">
                        <div class="dia-numero">${dia}</div>
                        <div class="dia-hh">
                            <strong>${(dadosDia.hhSoldador + dadosDia.hhImprodutivas).toFixed(1)}</strong> HH
                        </div>
                        ${(dadosDia.kmInicio || dadosDia.kmFim) ? `
                            <div style="font-size:0.72em; color:#555; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                📍 ${dadosDia.kmInicio || '-'} – ${dadosDia.kmFim || '-'}
                            </div>
                        ` : ''}
                        <div class="dia-meta">
                            ${(dadosDia.percentualMeta * 100).toFixed(0)}% da meta
                        </div>
                        <div class="dia-efetivo" style="color: #666;">
                            👷 ${dadosDia.efetivo.total} pessoas
                        </div>
                        ${dadosDia.observacoes ? `
                            <div class="dia-obs" style="margin-top: 4px; color: #ff9800;">
                                📝 ${dadosDia.observacoes.substring(0, 30)}${dadosDia.observacoes.length > 30 ? '...' : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            } else {
                html += `
                    <div class="calendario-dia sem-trabalho">
                        <div class="dia-numero">${dia}</div>
                        <div class="dia-status">-</div>
                    </div>
                `;
            }
        }

        html += `
                        </div>
                    </div>
                    <!-- Legenda -->
                    <div class="calendario-legenda mt-3">
                        <div class="d-flex gap-3 flex-wrap">
                            <div><span class="badge" style="background-color: #4CAF50">Verde</span> ≥ 100% da meta (≥ ${META_DIARIA} HH)</div>
                            <div><span class="badge" style="background-color: #FFC107">Amarelo</span> 80-99% da meta</div>
                            <div><span class="badge" style="background-color: #F44336">Vermelho</span> < 80% da meta</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Renderiza todos os calendários das TSs (igual ao comportamento das TPs)
     */
    renderizarTodos() {
        const container = document.getElementById('calendarioTSContainer');
        if (!container) {
            debugLog('[CalendarioTS] Container #calendarioTSContainer não encontrado');
            return;
        }

        if (!this.dados) {
            container.innerHTML = '<p class="text-center text-muted">Carregando dados...</p>';
            return;
        }

        debugLog(`[CalendarioTS] Renderizando calendários para ${this.mesAtual}/${this.anoAtual}`);

        // Extrair TSs que têm RDOs no mês/ano filtrado
        const tssSet = new Set();
        this.dados.rdos.forEach(rdo => {
            const turma = rdo['Código Turma'] || rdo.codigoTurma || '';
            const dataBanco = rdo['Data'] || rdo.data || '';
            const deletado = (rdo['Deletado'] || rdo.deletado || '').toLowerCase();

            if (!turma || deletado === 'sim') return;

            // Verificar tipo TS
            const tipoTurma = typeof getTipoTurma === 'function' ? getTipoTurma(turma) : null;
            const isTS = tipoTurma === 'TS'
                || turma.startsWith('TS-')
                || turma.startsWith('TS ');

            if (!isTS) return;

            // Verificar se é do mês/ano filtrado
            if (dataBanco) {
                const partes = dataBanco.split('/');
                if (partes.length === 3) {
                    const mes = parseInt(partes[1]);
                    const ano = parseInt(partes[2]);
                    if (mes === this.mesAtual && ano === this.anoAtual) {
                        tssSet.add(turma);
                    }
                }
            }
        });

        const tss = Array.from(tssSet).sort();
        debugLog(`[CalendarioTS] TSs encontradas no mês: ${tss.join(', ') || 'nenhuma'}`);

        if (tss.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Nenhuma TS com RDOs lançados em ${this.mesAtual}/${this.anoAtual}.
                </div>
            `;
            return;
        }

        let html = '';
        tss.forEach(turma => {
            // Respeitar filtro de turma específica (se selecionada no filtro global)
            if (this.turmaFiltro && this.turmaFiltro !== 'todas' && this.turmaFiltro !== turma) {
                return;
            }
            html += this.renderizarCalendario(turma);
        });

        if (!html) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Nenhuma TS encontrada para o filtro selecionado.
                </div>
            `;
            return;
        }

        container.innerHTML = html;
        debugLog(`[CalendarioTS] ✅ ${tss.length} calendários de TS renderizados`);
    }

    /**
     * Mostra detalhes de um dia em modal
     */
    mostrarDetalhesDia(turma, dia, mes, ano) {
        const dados = this.obterDadosDia(turma, dia, mes, ano);
        if (!dados) return;

        const numeroOS = dados.numeroOS;
        const dataFormatada = dados.data;

        // Serviços buscados por Número RDO (mais confiável que OS+data)
        const servicosFormatados = this.dados.servicos
            .filter(s => (s['Número RDO'] || s.numeroRDO || s.numeroRdo || '') === dados.numeroRDO)
            .map(s => ({
                descricao:   s['Descrição'] || s.descricao || '-',
                quantidade:  parseFloat(s.Quantidade  || s.quantidade  || 0).toFixed(2),
                coeficiente: parseFloat(s.Coeficiente || s.coeficiente || 0).toFixed(4),
                unidade:     s.Unidade || s.unidade || '-',
                hh: (parseFloat(s.Quantidade  || s.quantidade  || 0) *
                     parseFloat(s.Coeficiente || s.coeficiente || 0)).toFixed(2)
            }));

        const encarregado = dados.rdo?.Encarregado || dados.rdo?.encarregado || '-';
        const totalHH = dados.hhSoldador + dados.hhImprodutivas;

        const modalHTML = `
            <div class="modal fade" id="modalDetalhesDiaTS" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-fire me-2"></i>
                                Detalhes do Dia — ${dados.data} | ${turma}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <!-- Cabeçalho info -->
                            <div class="row mb-4">
                                <div class="col-md-12">
                                    <h6 class="text-muted mb-1">
                                        <i class="fas fa-user me-2"></i>${encarregado} &nbsp;|&nbsp;
                                        <i class="fas fa-file-alt me-2"></i>RDO: ${dados.numeroRDO} &nbsp;|&nbsp;
                                        <i class="fas fa-hashtag me-2"></i>OS: ${dados.numeroOS}
                                    </h6>
                                    <h6 class="text-muted mb-0">
                                        <i class="fas fa-map-marker-alt me-2"></i>${dados.local} &nbsp;|&nbsp;
                                        <i class="fas fa-clock me-2"></i>${dados.horaInicio} – ${dados.horaFim}
                                    </h6>
                                </div>
                            </div>

                            <!-- Métricas -->
                            <div class="row mb-4">
                                <div class="col-md-3">
                                    <div class="text-center p-3 bg-danger bg-opacity-10 rounded">
                                        <h4 class="mb-1 fw-bold">${dados.hhSoldador.toFixed(2)}</h4>
                                        <small class="text-muted">HH Soldador</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center p-3 bg-warning bg-opacity-10 rounded">
                                        <h4 class="mb-1 fw-bold">${dados.hhImprodutivas.toFixed(2)}</h4>
                                        <small class="text-muted">HH Improdutivas</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center p-3 bg-primary bg-opacity-10 rounded">
                                        <h4 class="mb-1 fw-bold">${totalHH.toFixed(2)}</h4>
                                        <small class="text-muted">Total HH</small>
                                        <div class="mt-1"><small class="text-muted">Meta: ${dados.metaDiaria.toFixed(2)} HH</small></div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center p-3 bg-info bg-opacity-10 rounded">
                                        <h4 class="mb-1 fw-bold">${dados.efetivo?.total || 0}</h4>
                                        <small class="text-muted">Efetivo Total</small>
                                        <div class="mt-1">
                                            <small class="text-muted">
                                                Enc: ${dados.efetivo?.encarregado || 0} |
                                                Sold: ${dados.efetivo?.soldador || 0} |
                                                Op: ${dados.efetivo?.operadores || 0} |
                                                Mot: ${dados.efetivo?.motorista || 0}
                                            </small>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Gráficos -->
                            <div class="row mb-4">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header bg-light">
                                            <h6 class="mb-0"><i class="fas fa-chart-pie me-2"></i>Distribuição HH</h6>
                                        </div>
                                        <div class="card-body">
                                            <canvas id="chartDistribuicaoHHTS" style="max-height: 250px;"></canvas>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header bg-light">
                                            <h6 class="mb-0"><i class="fas fa-chart-pie me-2"></i>Performance vs Meta</h6>
                                        </div>
                                        <div class="card-body">
                                            <canvas id="chartPerformanceTS" style="max-height: 250px;"></canvas>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Serviços -->
                            ${servicosFormatados.length > 0 ? `
                                <div class="mb-4">
                                    <h6 class="text-muted mb-3">
                                        <i class="fas fa-fire me-2"></i>Soldas Realizadas
                                    </h6>
                                    <div class="table-responsive">
                                        <table class="table table-sm table-hover">
                                            <thead class="table-light">
                                                <tr>
                                                    <th>Descrição</th>
                                                    <th class="text-center">Qtd</th>
                                                    <th class="text-center">Coef.</th>
                                                    <th class="text-center">Unidade</th>
                                                    <th class="text-end">HH</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${servicosFormatados.map(s => `
                                                    <tr>
                                                        <td>${s.descricao}</td>
                                                        <td class="text-center">${s.quantidade}</td>
                                                        <td class="text-center">${s.coeficiente}</td>
                                                        <td class="text-center">${s.unidade}</td>
                                                        <td class="text-end"><strong>${s.hh}</strong></td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                            <tfoot class="table-light">
                                                <tr>
                                                    <th colspan="4" class="text-end">TOTAL HH Soldador:</th>
                                                    <th class="text-end">${dados.hhSoldador.toFixed(2)}</th>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            ` : '<p class="text-muted mb-4"><i class="fas fa-info-circle me-2"></i>Nenhum serviço registrado</p>'}

                            <!-- Horas Improdutivas -->
                            ${dados.horasImprodutivas.length > 0 ? `
                                <div class="mb-4">
                                    <h6 class="text-muted mb-3">
                                        <i class="fas fa-pause-circle me-2"></i>Horas Improdutivas
                                    </h6>
                                    <div class="table-responsive">
                                        <table class="table table-sm table-hover">
                                            <thead class="table-light">
                                                <tr>
                                                    <th>Tipo</th>
                                                    <th>Descrição</th>
                                                    <th class="text-center">Hora Início</th>
                                                    <th class="text-center">Hora Fim</th>
                                                    <th class="text-end">HH</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${dados.horasImprodutivas.map(hi => `
                                                    <tr${hi.overlap ? ' class="table-warning"' : ''}>
                                                        <td>
                                                            <span class="badge bg-warning text-dark">${hi.tipo}</span>
                                                            ${hi.overlap ? '<span class="badge bg-danger ms-1" title="Intervalo se sobrepõe com outra HI deste RDO">⚠️ sobreposição</span>' : ''}
                                                        </td>
                                                        <td>${hi.descricao}</td>
                                                        <td class="text-center">${hi.horaInicio}</td>
                                                        <td class="text-center">${hi.horaFim}</td>
                                                        <td class="text-end"><strong>${hi.hh}</strong></td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ` : '<p class="text-muted mb-4"><i class="fas fa-info-circle me-2"></i>Nenhuma hora improdutiva registrada</p>'}

                            <!-- Observações -->
                            ${dados.observacoes ? `
                                <div class="alert alert-info mb-0">
                                    <h6 class="alert-heading">
                                        <i class="fas fa-sticky-note me-2"></i>Observações
                                    </h6>
                                    <p class="mb-0">${dados.observacoes}</p>
                                </div>
                            ` : ''}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remover modal anterior se existir
        const modalAntigo = document.getElementById('modalDetalhesDiaTS');
        if (modalAntigo) modalAntigo.remove();

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modalElement = document.getElementById('modalDetalhesDiaTS');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        // Renderizar gráfico após modal ser exibido
        modalElement.addEventListener('shown.bs.modal', () => {
            this.renderizarGraficoPerformance(dados);
        });

        // Limpar modal do DOM após fechar (destruir charts para evitar memory leaks)
        modalElement.addEventListener('hidden.bs.modal', () => {
            this.modalCharts.forEach(chart => chart.destroy());
            this.modalCharts = [];
            modalElement.remove();
        });
    }

    /**
     * Renderiza gráficos do modal de detalhes do dia
     */
    renderizarGraficoPerformance(dados) {
        const corStatus = dados.status === 'verde' ? '#4CAF50' :
                          dados.status === 'amarelo' ? '#FFC107' : '#F44336';
        const percentualMeta = dados.metaDiaria > 0
            ? (dados.hhSoldador / dados.metaDiaria) * 100
            : 0;

        const tooltipHH = context => `${context.label}: ${(context.parsed || 0).toFixed(2)} HH`;

        // Gráfico 1: Distribuição HH Soldador vs Improdutivas
        const ctxDist = document.getElementById('chartDistribuicaoHHTS');
        if (ctxDist) {
            const chartDist = new Chart(ctxDist, {
                type: 'doughnut',
                data: {
                    labels: ['HH Soldador', 'HH Improdutivas'],
                    datasets: [{
                        data: [dados.hhSoldador, dados.hhImprodutivas],
                        backgroundColor: [corStatus, '#FFC107'],
                        borderWidth: 2, borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' },
                        title: { display: true, text: `${(dados.hhSoldador + dados.hhImprodutivas).toFixed(2)} HH Total`, font: { size: 14, weight: 'bold' } },
                        tooltip: { callbacks: { label: tooltipHH } }
                    }
                }
            });
            this.modalCharts.push(chartDist);
        }

        // Gráfico 2: Performance do Soldador vs Meta
        const ctxPerf = document.getElementById('chartPerformanceTS');
        if (ctxPerf) {
            const chartPerf = new Chart(ctxPerf, {
                type: 'doughnut',
                data: {
                    labels: ['HH Soldador', 'Falta para Meta'],
                    datasets: [{
                        data: [dados.hhSoldador, Math.max(0, dados.metaDiaria - dados.hhSoldador)],
                        backgroundColor: [corStatus, '#e0e0e0'],
                        borderWidth: 2, borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom' },
                        title: { display: true, text: `${percentualMeta.toFixed(1)}% da Meta`, font: { size: 16, weight: 'bold' } },
                        tooltip: { callbacks: { label: tooltipHH } }
                    }
                }
            });
            this.modalCharts.push(chartPerf);
        }
    }
}

// Instância global
const calendarioTS = new CalendarioTS();
