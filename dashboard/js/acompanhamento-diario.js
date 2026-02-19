/**
 * Acompanhamento Diário
 * Visualização detalhada por dia com filtros
 */

/**
 * Escapa HTML para prevenir XSS em campos de texto livre.
 * Uso: escapeHtml(rdo.observacoes) antes de inserir em innerHTML.
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

class AcompanhamentoDiario {
    constructor() {
        this.dados = null;
        this.filtroData = null;
        this.filtroMes = null;
        this.filtroAno = null;
    }

    /**
     * Carrega dados
     */
    carregarDados(rdos, servicos, horasImprodutivas, efetivos) {
        this.dados = {
            rdos: rdos || [],
            servicos: servicos || [],
            horasImprodutivas: horasImprodutivas || [],
            efetivos: efetivos || []  // ✅ Adicionar efetivos
        };
        console.log('[AcompanhamentoDiario] Dados carregados:', {
            rdos: this.dados.rdos.length,
            servicos: this.dados.servicos.length,
            horasImprodutivas: this.dados.horasImprodutivas.length,
            efetivos: this.dados.efetivos.length
        });
    }

    /**
     * Define filtros de mês/ano do dashboard principal
     */
    setFiltros(mes, ano) {
        this.filtroMes = mes;
        this.filtroAno = ano;
        console.log('[AcompanhamentoDiario] Filtros definidos:', { mes, ano });
    }

    /**
     * Extrai datas únicas dos RDOs (filtradas por mês/ano se definido)
     */
    extrairDatasUnicas() {
        const datasSet = new Set();

        this.dados.rdos.forEach(rdo => {
            const data = rdo.Data || rdo.data || '';
            if (!data || data.trim() === '') return;

            // Aplicar filtro de mês/ano se definido
            if (this.filtroMes && this.filtroAno) {
                const [dia, mes, ano] = data.split('/');
                if (parseInt(mes) !== this.filtroMes || parseInt(ano) !== this.filtroAno) {
                    return; // Ignorar datas fora do período
                }
            }

            datasSet.add(data.trim());
        });

        // Ordenar datas (dd/MM/yyyy)
        return Array.from(datasSet).sort((a, b) => {
            const [diaA, mesA, anoA] = a.split('/');
            const [diaB, mesB, anoB] = b.split('/');
            const dataA = new Date(anoA, mesA - 1, diaA);
            const dataB = new Date(anoB, mesB - 1, diaB);
            return dataB - dataA; // Mais recente primeiro
        });
    }

    /**
     * Popular select de datas
     */
    popularSelectDatas() {
        const select = document.getElementById('filtroDiaAcompanhamento');
        if (!select) return;

        const datas = this.extrairDatasUnicas();

        // Limpar options
        select.innerHTML = '<option value="todos">Todos os dias</option>';

        datas.forEach(data => {
            const option = document.createElement('option');
            option.value = data;
            option.textContent = data;
            select.appendChild(option);
        });

        // Selecionar data mais recente por padrão
        if (datas.length > 0) {
            select.value = datas[0];
            this.filtroData = datas[0];
        }
    }

    /**
     * Filtra RDOs por data
     */
    filtrarPorData(data) {
        if (!data || data === 'todos') {
            return this.dados.rdos;
        }

        return this.dados.rdos.filter(rdo => {
            const dataRDO = rdo.Data || rdo.data || '';
            return dataRDO === data;
        });
    }

    /**
     * Agrupa RDOs por turma
     */
    agruparPorTurma(rdos) {
        const grupos = {};

        rdos.forEach(rdo => {
            const turma = rdo['Código Turma'] || rdo.codigoTurma || 'Sem Turma';

            if (!grupos[turma]) {
                grupos[turma] = {
                    turma: turma,
                    rdos: [],
                    encarregado: escapeHtml(rdo.Encarregado || rdo.encarregado || '-'),
                    hhTotal: 0,
                    hiTotal: 0,
                    observacoes: [],
                    servicos: []
                };
            }

            grupos[turma].rdos.push(rdo);
        });

        return grupos;
    }

    /**
     * Calcula HH de uma turma
     * Busca por Número OS + Data RDO (não pelo número RDO completo)
     */
    calcularHHTurma(numeroOS, dataRDO) {
        let hhTotal = 0;

        const servicosDaTurma = this.dados.servicos.filter(s => {
            const numOS = getCampoNormalizado(s, 'Número OS');
            const data = getCampoNormalizado(s, 'Data RDO');
            return numOS === numeroOS && data === dataRDO;
        });

        console.log(`[AcompanhamentoDiario] OS ${numeroOS} Data ${dataRDO}: ${servicosDaTurma.length} serviços encontrados`);

        servicosDaTurma.forEach(servico => {
            const quantidade = parseFloat(getCampoNormalizado(servico, 'Quantidade', 0));
            const coeficiente = parseFloat(getCampoNormalizado(servico, 'Coeficiente', 0));
            const hh = quantidade * coeficiente;
            console.log(`  - ${getCampoNormalizado(servico, 'Descrição')}: ${quantidade} × ${coeficiente} = ${hh.toFixed(2)} HH`);
            hhTotal += hh;
        });

        console.log(`[AcompanhamentoDiario] Total HH para OS ${numeroOS} Data ${dataRDO}: ${hhTotal.toFixed(2)}`);
        return hhTotal;
    }

    /**
     * Calcula HI de uma turma
     * Busca por Número OS + Data RDO (não pelo número RDO completo)
     */
    calcularHITurma(numeroOS, dataRDO) {
        let hiTotal = 0;

        const hisDaTurma = this.dados.horasImprodutivas.filter(hi => {
            const numOS = getCampoNormalizado(hi, 'Número OS');
            const data = getCampoNormalizado(hi, 'Data RDO');
            return numOS === numeroOS && data === dataRDO;
        });

        console.log(`[AcompanhamentoDiario] OS ${numeroOS} Data ${dataRDO}: ${hisDaTurma.length} HIs encontradas`);

        hisDaTurma.forEach(hi => {
            const hhImprodutivas = parseFloat(getCampoNormalizado(hi, 'HH Improdutivas', 0));
            console.log(`  - ${getCampoNormalizado(hi, 'Tipo', 'Sem tipo')}: ${hhImprodutivas.toFixed(2)} HH`);
            hiTotal += hhImprodutivas;
        });

        console.log(`[AcompanhamentoDiario] Total HI para OS ${numeroOS} Data ${dataRDO}: ${hiTotal.toFixed(2)}`);
        return hiTotal;
    }

    /**
     * Busca serviços de um RDO
     * Busca por Número OS + Data RDO
     */
    buscarServicos(numeroOS, dataRDO) {
        return this.dados.servicos.filter(s => {
            const numOS = getCampoNormalizado(s, 'Número OS');
            const data = getCampoNormalizado(s, 'Data RDO');
            return numOS === numeroOS && data === dataRDO;
        }).map(s => ({
            descricao: s['Descrição'] || s.descricao || '-',
            quantidade: parseFloat(s.Quantidade || s.quantidade || 0),
            unidade: s.Unidade || s.unidade || 'UN',
            hh: (parseFloat(s.Quantidade || s.quantidade || 0) * parseFloat(s.Coeficiente || s.coeficiente || 0)).toFixed(2)
        }));
    }

    /**
     * ✅ Busca quantidade de Operadores do Efetivo
     */
    buscarOperadores(numeroRDO) {
        const efetivo = this.dados.efetivos.find(ef => {
            const efNumRDO = ef['Número RDO'] || ef.numeroRDO || '';
            return efNumRDO === numeroRDO;
        });
        return efetivo ? parseInt(efetivo['Operadores'] || efetivo.operadores || 0) : 0;
    }

    /**
     * Busca materiais de um RDO
     */
    buscarMateriais(numeroOS, dataRDO) {
        return this.dados.servicos.filter(m => {
            // Nota: Materiais também podem estar na aba Servicos ou ter aba própria
            // Ajustar conforme estrutura real da planilha
            return false;  // TODO: Implementar quando houver aba Materiais
        });
    }

    /**
     * Busca equipamentos de um RDO
     */
    buscarEquipamentos(numeroRDO) {
        // TODO: Adicionar dados.equipamentos ao carregarDados()
        return [];  // TODO: Implementar quando dados estiverem disponíveis
    }

    /**
     * Busca transportes de um RDO
     */
    buscarTransportes(numeroOS, dataRDO) {
        // TODO: Adicionar dados.transportes ao carregarDados()
        return [];  // TODO: Implementar quando dados estiverem disponíveis
    }

    /**
     * ✅ Busca HIs de um RDO
     */
    buscarHIs(numeroOS, dataRDO) {
        return this.dados.horasImprodutivas.filter(hi => {
            const numOS = hi['Número OS'] || hi.numeroOS || '';
            const data = hi['Data RDO'] || hi.data || '';
            return numOS === numeroOS && data === dataRDO;
        }).map(hi => {
            const tipo = hi.tipo || '-';
            const horaInicio = hi.horaInicio || hi['Hora Início'] || '';
            const horaFim = hi.horaFim || hi['Hora Fim'] || '';

            // ✅ Usar HH já calculado (já vem zerado se for trem < 15 min)
            const hh = parseFloat(hi.hhImprodutivas || hi['HH Improdutivas'] || 0);

            // ✅ Usar flag calculada em sheets-api.js
            const isTremCurto = hi.isTremCurto || false;
            const duracao = hi.duracaoHoras || this.calcularDiferencaHoras(horaInicio, horaFim);

            return {
                tipo: tipo,
                descricao: hi.descricao || '-',
                horaInicio: horaInicio,
                horaFim: horaFim,
                operadores: hi.operadores || 0,
                hh: hh.toFixed(2),  // ✅ Já vem zerado se for trem curto
                isTremCurto: isTremCurto,  // ✅ Flag do cálculo central
                duracao: duracao
            };
        });
    }

    /**
     * Calcula diferença entre duas horas (HH:MM).
     * Delega para CalculadoraMedicao (fonte única de verdade).
     */
    calcularDiferencaHoras(horaInicio, horaFim) {
        if (!horaInicio || !horaFim) return 0;
        if (typeof dashboardMain !== 'undefined' && dashboardMain.calculadora) {
            return dashboardMain.calculadora.calcularDiferencaHoras(horaInicio, horaFim);
        }
        // Fallback mínimo se calculadora não disponível
        try {
            const [hi, mi] = horaInicio.split(':').map(Number);
            const [hf, mf] = horaFim.split(':').map(Number);
            const totalInicio = hi + mi / 60;
            const totalFim = hf + mf / 60;
            return totalFim >= totalInicio ? totalFim - totalInicio : (24 - totalInicio) + totalFim;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Renderiza resumo diário
     */
    renderizar() {
        const container = document.getElementById('acompanhamentoDiarioContainer');
        if (!container) return;

        const data = this.filtroData || 'todos';
        const rdosFiltrados = this.filtrarPorData(data);

        if (rdosFiltrados.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Nenhum RDO encontrado para ${data === 'todos' ? 'esta seleção' : 'a data ' + data}.
                </div>
            `;
            return;
        }

        const grupos = this.agruparPorTurma(rdosFiltrados);
        let html = '';

        // Header com resumo geral
        const totalTurmas = Object.keys(grupos).length;
        const totalRDOs = rdosFiltrados.length;

        html += `
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card bg-light">
                        <div class="card-body">
                            <h5 class="card-title mb-3">
                                <i class="fas fa-calendar-day me-2"></i>
                                Resumo de ${data === 'todos' ? 'Todos os Dias' : data}
                            </h5>
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="text-center">
                                        <h3 class="text-primary">${totalTurmas}</h3>
                                        <small class="text-muted">Turmas que lançaram</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center">
                                        <h3 class="text-info">${totalRDOs}</h3>
                                        <small class="text-muted">RDOs criados</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Cards por turma
        Object.values(grupos).forEach(grupo => {
            grupo.rdos.forEach(rdo => {
                const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || '-';
                const numeroOS = rdo['Número OS'] || rdo.numeroOS || rdo.numeroOs || '';
                const dataRDO = rdo.Data || rdo.data || '';

                const hhTotal = this.calcularHHTurma(numeroOS, dataRDO);
                const hiTotal = this.calcularHITurma(numeroOS, dataRDO);
                const observacoes = escapeHtml(rdo.Observações || rdo.observacoes || '');
                const servicos = this.buscarServicos(numeroOS, dataRDO);
                const operadores = this.buscarOperadores(numeroRDO);  // ✅ Buscar operadores
                const his = this.buscarHIs(numeroOS, dataRDO);  // ✅ Buscar HIs

                // Buscar dados adicionais do RDO (escapados contra XSS)
                const local = escapeHtml(rdo.Local || rdo.local || '-');
                const statusOS = escapeHtml(rdo['Status OS'] || rdo.statusOS || '-');
                const kmInicio = escapeHtml(rdo['KM Início'] || rdo.kmInicio || '-');
                const kmFim = escapeHtml(rdo['KM Fim'] || rdo.kmFim || '-');
                const horarioInicio = escapeHtml(rdo['Horário Início'] || rdo.horarioInicio || '-');
                const horarioFim = escapeHtml(rdo['Horário Fim'] || rdo.horarioFim || '-');
                const clima = escapeHtml(rdo.Clima || rdo.clima || '-');
                const temaDDS = escapeHtml(rdo['Tema DDS'] || rdo.temaDDS || '-');

                html += `
                    <div class="card mb-3 shadow-sm">
                        <div class="card-header bg-primary text-white">
                            <div class="row align-items-center">
                                <div class="col-md-6">
                                    <h5 class="mb-0">
                                        <i class="fas fa-users me-2"></i>
                                        ${grupo.turma}
                                    </h5>
                                    <small>RDO: ${numeroRDO} | OS: ${numeroOS}</small>
                                </div>
                                <div class="col-md-6 text-end">
                                    <span class="badge bg-light text-dark me-2">
                                        <i class="fas fa-user me-1"></i>${grupo.encarregado}
                                    </span>
                                    <span class="badge bg-light text-dark">
                                        <i class="fas fa-map-marker-alt me-1"></i>${local}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="card-body">
                            <!-- Métricas -->
                            <div class="row mb-3">
                                <div class="col-md-3">
                                    <div class="d-flex align-items-center" style="cursor: pointer;" onclick="acompanhamentoDiario.mostrarDetalhesServicos(\`${numeroRDO}\`, \`${numeroOS}\`, \`${dataRDO}\`)">
                                        <div class="flex-shrink-0">
                                            <div class="rounded-circle bg-success bg-opacity-10 p-3">
                                                <i class="fas fa-hammer text-success fa-lg"></i>
                                            </div>
                                        </div>
                                        <div class="flex-grow-1 ms-3">
                                            <h6 class="mb-0 text-muted">HH Produtivas ${servicos.length > 0 ? '<i class="fas fa-eye ms-1" title="Clique para ver detalhes"></i>' : ''}</h6>
                                            <h4 class="mb-0 text-success">${hhTotal.toFixed(2)}</h4>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="d-flex align-items-center" style="cursor: pointer;" onclick="acompanhamentoDiario.mostrarDetalhesHI(\`${numeroRDO}\`, \`${numeroOS}\`, \`${dataRDO}\`)">
                                        <div class="flex-shrink-0">
                                            <div class="rounded-circle bg-warning bg-opacity-10 p-3">
                                                <i class="fas fa-pause-circle text-warning fa-lg"></i>
                                            </div>
                                        </div>
                                        <div class="flex-grow-1 ms-3">
                                            <h6 class="mb-0 text-muted">HH Improdutivas ${his.length > 0 ? '<i class="fas fa-eye ms-1" title="Clique para ver detalhes"></i>' : ''}</h6>
                                            <h4 class="mb-0 text-warning">${hiTotal.toFixed(2)}</h4>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="d-flex align-items-center">
                                        <div class="flex-shrink-0">
                                            <div class="rounded-circle bg-primary bg-opacity-10 p-3">
                                                <i class="fas fa-clock text-primary fa-lg"></i>
                                            </div>
                                        </div>
                                        <div class="flex-grow-1 ms-3">
                                            <h6 class="mb-0 text-muted">Total HH</h6>
                                            <h4 class="mb-0 text-primary">${(hhTotal + hiTotal).toFixed(2)}</h4>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="d-flex align-items-center">
                                        <div class="flex-shrink-0">
                                            <div class="rounded-circle bg-info bg-opacity-10 p-3">
                                                <i class="fas fa-users text-info fa-lg"></i>
                                            </div>
                                        </div>
                                        <div class="flex-grow-1 ms-3">
                                            <h6 class="mb-0 text-muted">Efetivo</h6>
                                            <h4 class="mb-0 text-info">${operadores}</h4>
                                            <small class="text-muted">operadores no dia</small>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Detalhes da OS -->
                            <div class="row mb-3">
                                <div class="col-12">
                                    <div class="card bg-light">
                                        <div class="card-body p-3">
                                            <h6 class="card-title mb-3">
                                                <i class="fas fa-clipboard-list me-2 text-secondary"></i>
                                                Dados da OS
                                            </h6>
                                            <div class="row small">
                                                <div class="col-md-3">
                                                    <strong>Status:</strong> ${statusOS}
                                                </div>
                                                <div class="col-md-3">
                                                    <strong>KM Início:</strong> ${kmInicio}
                                                </div>
                                                <div class="col-md-3">
                                                    <strong>KM Fim:</strong> ${kmFim}
                                                </div>
                                                <div class="col-md-3">
                                                    <strong>Horário:</strong> ${horarioInicio} - ${horarioFim}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Clima e Segurança -->
                            <div class="row mb-3">
                                <div class="col-12">
                                    <div class="card bg-light">
                                        <div class="card-body p-3">
                                            <h6 class="card-title mb-3">
                                                <i class="fas fa-cloud-sun me-2 text-warning"></i>
                                                Clima e Segurança
                                            </h6>
                                            <div class="row small">
                                                <div class="col-md-6">
                                                    <strong>Clima:</strong> ${clima}
                                                </div>
                                                <div class="col-md-6">
                                                    <strong>Tema DDS:</strong> ${temaDDS}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Observações -->
                            ${observacoes && observacoes.trim() !== '' ? `
                                <div class="alert alert-info mb-0">
                                    <h6 class="alert-heading">
                                        <i class="fas fa-comment-dots me-2"></i>Observações
                                    </h6>
                                    <p class="mb-0">${observacoes}</p>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
        });

        container.innerHTML = html;
    }

    /**
     * Aplicar filtro de data
     */
    aplicarFiltroData() {
        const select = document.getElementById('filtroDiaAcompanhamento');
        if (select) {
            this.filtroData = select.value === 'todos' ? null : select.value;
            this.renderizar();
        }
    }

    /**
     * Inicializar
     */
    inicializar() {
        this.popularSelectDatas();
        this.renderizar();

        // Event listener para filtro de data
        const select = document.getElementById('filtroDiaAcompanhamento');
        if (select) {
            select.addEventListener('change', () => this.aplicarFiltroData());
        }
    }

    /**
     * ✅ Mostra modal com detalhes das HI
     */
    mostrarDetalhesHI(numeroRDO, numeroOS, dataRDO) {
        const his = this.buscarHIs(numeroOS, dataRDO);

        if (his.length === 0) {
            alert('Nenhuma hora improdutiva registrada para este RDO.');
            return;
        }

        // Criar modal dinâmico
        const modalId = 'modalDetalhesHI';
        let modal = document.getElementById(modalId);

        // Remover modal existente
        if (modal) {
            modal.remove();
        }

        // Criar novo modal
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-pause-circle me-2"></i>
                            Detalhes das Horas Improdutivas
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-3">
                            <strong>RDO:</strong> ${numeroRDO}<br>
                            <strong>Número OS:</strong> ${numeroOS}<br>
                            <strong>Data:</strong> ${dataRDO}
                        </p>
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead class="table-light">
                                    <tr>
                                        <th>Tipo</th>
                                        <th>Descrição</th>
                                        <th class="text-center">Hora Início</th>
                                        <th class="text-center">Hora Fim</th>
                                        <th class="text-center">Operadores</th>
                                        <th class="text-end">HH</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${his.map((hi, index) => `
                                        <tr ${hi.isTremCurto ? 'class="table-danger"' : ''}>
                                            <td>
                                                <span class="badge ${hi.isTremCurto ? 'bg-danger' : 'bg-warning'}">${hi.tipo}</span>
                                                ${hi.isTremCurto ? '<span class="badge bg-danger ms-1" title="Trem < 15 min - HH zerado"><i class="fas fa-exclamation-triangle"></i></span>' : ''}
                                            </td>
                                            <td>${hi.descricao}</td>
                                            <td class="text-center">${hi.horaInicio}</td>
                                            <td class="text-center">${hi.horaFim}</td>
                                            <td class="text-center">
                                                <input type="number" class="form-control form-control-sm text-center hi-operadores-input"
                                                    value="${hi.operadores}"
                                                    min="1" max="20"
                                                    data-index="${index}"
                                                    data-numero-rdo="${escapeHtml(numeroRDO)}"
                                                    data-hora-inicio="${escapeHtml(hi.horaInicio)}"
                                                    data-hora-fim="${escapeHtml(hi.horaFim)}"
                                                    data-duracao="${hi.duracao}"
                                                    style="width: 70px; display: inline-block;"
                                                    onchange="acompanhamentoDiario.recalcularHHModal(this)">
                                            </td>
                                            <td class="text-end">
                                                <strong ${hi.isTremCurto ? 'class="text-danger"' : ''} id="hiHH_${index}">${hi.hh}</strong>
                                                ${hi.isTremCurto ? '<br><small class="text-danger">HH zerado</small>' : ''}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                                <tfoot class="table-light">
                                    <tr>
                                        <th colspan="5" class="text-end">Total HH Improdutivas:</th>
                                        <th class="text-end" id="hiTotalModal">${his.reduce((sum, hi) => sum + parseFloat(hi.hh), 0).toFixed(2)}</th>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <div id="hiSaveStatus" class="mt-2" style="display: none;"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" id="btnSalvarOperadoresHI"
                            onclick="acompanhamentoDiario.salvarOperadoresHI('${escapeHtml(numeroRDO)}')">
                            <i class="fas fa-save me-2"></i>Salvar Alterações
                        </button>
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Mostrar modal (Bootstrap 5)
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        // Remover modal do DOM quando fechar
        modal.addEventListener('hidden.bs.modal', () => modal.remove());
    }

    /**
     * Recalcula HH no modal quando operadores é alterado
     */
    recalcularHHModal(input) {
        const index = input.dataset.index;
        const operadores = parseInt(input.value) || 0;
        const duracao = parseFloat(input.dataset.duracao) || 0;
        const novoHH = (duracao * operadores).toFixed(2);

        // Atualizar HH na linha
        const hhElement = document.getElementById(`hiHH_${index}`);
        if (hhElement) {
            hhElement.textContent = novoHH;
        }

        // Recalcular total
        const inputs = document.querySelectorAll('.hi-operadores-input');
        let total = 0;
        inputs.forEach(inp => {
            const op = parseInt(inp.value) || 0;
            const dur = parseFloat(inp.dataset.duracao) || 0;
            total += dur * op;
        });

        const totalElement = document.getElementById('hiTotalModal');
        if (totalElement) {
            totalElement.textContent = total.toFixed(2);
        }
    }

    /**
     * Salva operadores alterados via Google Apps Script
     */
    async salvarOperadoresHI(numeroRDO) {
        const inputs = document.querySelectorAll('.hi-operadores-input');
        const statusDiv = document.getElementById('hiSaveStatus');
        const btnSalvar = document.getElementById('btnSalvarOperadoresHI');

        if (!CONFIG.APPS_SCRIPT_URL) {
            if (statusDiv) {
                statusDiv.style.display = 'block';
                statusDiv.innerHTML = `
                    <div class="alert alert-warning mb-0">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        <strong>Apps Script não configurado.</strong> Adicione APPS_SCRIPT_URL em config.js.
                    </div>
                `;
            }
            return;
        }

        // Desabilitar botão durante salvamento
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Salvando...';
        }

        let sucessos = 0;
        let erros = 0;

        for (const input of inputs) {
            const operadores = parseInt(input.value) || 12;
            const horaInicio = input.dataset.horaInicio;
            const horaFim = input.dataset.horaFim;

            try {
                const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sheetName: 'HorasImprodutivas',
                        numeroRDO: numeroRDO,
                        horaInicio: horaInicio,
                        horaFim: horaFim,
                        operadores: operadores
                    })
                });

                const result = await response.json();
                if (result.success) {
                    sucessos++;
                } else {
                    erros++;
                    console.error('[HI] Erro ao salvar:', result);
                }
            } catch (error) {
                erros++;
                console.error('[HI] Erro de rede:', error);
            }
        }

        // Mostrar resultado
        if (statusDiv) {
            statusDiv.style.display = 'block';
            if (erros === 0) {
                statusDiv.innerHTML = `
                    <div class="alert alert-success mb-0">
                        <i class="fas fa-check-circle me-2"></i>
                        ${sucessos} registro(s) salvo(s) com sucesso! Os dados serão atualizados no próximo reload.
                    </div>
                `;
                // Limpar cache para forçar refresh no próximo carregamento
                sheetsAPI.limparCache();
            } else {
                statusDiv.innerHTML = `
                    <div class="alert alert-danger mb-0">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        ${sucessos} salvo(s), ${erros} erro(s). Tente novamente.
                    </div>
                `;
            }
        }

        // Restaurar botão
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save me-2"></i>Salvar Alterações';
        }
    }

    /**
     * ✅ Mostra modal com detalhes dos Serviços
     */
    mostrarDetalhesServicos(numeroRDO, numeroOS, dataRDO) {
        const servicos = this.buscarServicos(numeroOS, dataRDO);

        if (servicos.length === 0) {
            alert('Nenhum serviço registrado para este RDO.');
            return;
        }

        const modalId = 'modalDetalhesServicos';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-hammer me-2"></i>
                            Detalhes dos Serviços Realizados
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-3">
                            <strong>RDO:</strong> ${numeroRDO}<br>
                            <strong>Número OS:</strong> ${numeroOS}<br>
                            <strong>Data:</strong> ${dataRDO}
                        </p>
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead class="table-light">
                                    <tr>
                                        <th>Descrição</th>
                                        <th class="text-center">Quantidade</th>
                                        <th class="text-center">Coeficiente</th>
                                        <th class="text-end">Total HH</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${servicos.map(s => `
                                        <tr>
                                            <td>${s.descricao}</td>
                                            <td class="text-center">${s.quantidade}</td>
                                            <td class="text-center">${(parseFloat(s.hh) / s.quantidade).toFixed(2)}</td>
                                            <td class="text-end"><strong>${s.hh}</strong></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                                <tfoot class="table-light">
                                    <tr>
                                        <th colspan="3" class="text-end">Total HH Produtivas:</th>
                                        <th class="text-end">${servicos.reduce((sum, s) => sum + parseFloat(s.hh), 0).toFixed(2)}</th>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());
    }
}

// Instância global
const acompanhamentoDiario = new AcompanhamentoDiario();
