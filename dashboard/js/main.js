/**
 * Controlador Principal do Dashboard
 * Coordena carregamento, cálculos e visualizações
 */

class DashboardMain {
    constructor() {
        this.dados = null;
        this.calculadora = new CalculadoraMedicao();
        this.filtros = {
            mes: new Date().getMonth() + 1,
            ano: new Date().getFullYear(),
            turma: 'todas',
            tipo: 'todos'
        };
        this.estatisticas = null;
    }

    /**
     * Inicializa o dashboard
     */
    async inicializar() {
        debugLog('[Dashboard] Inicializando...');

        try {
            // 1. Carregar dados do Google Sheets
            await this.carregarDados();

            // 2. Configurar filtros iniciais
            this.configurarFiltros();

            // 3. Calcular estatísticas
            await this.calcularEstatisticas();

            // 4. Renderizar visualizações
            this.renderizarDashboard();

            // 5. Ocultar loading e mostrar conteúdo
            document.getElementById('loadingOverlay').style.display = 'none';
            document.getElementById('mainContainer').style.display = 'block';

            debugLog('[Dashboard] Inicialização concluída com sucesso!');

        } catch (error) {
            console.error('[Dashboard] Erro na inicialização:', error);
            throw error;
        }
    }

    /**
     * Carrega dados do Google Sheets
     */
    async carregarDados() {
        debugLog('[Dashboard] Carregando dados do Google Sheets...');

        this.dados = await sheetsAPI.carregarTodosDados();

        // 🚀 Limpar cache ao carregar novos dados
        this.calculadora.limparCache();

        // Carregar na calculadora
        await this.calculadora.carregarDados(
            this.dados.rdos,
            this.dados.servicos,
            this.dados.horasImprodutivas,
            this.dados.efetivos,
            this.dados.equipamentos
        );

        // Carregar dados no calendário de TPs
        calendarioTP.carregarDados(
            this.dados.rdos,
            this.dados.servicos,
            this.dados.horasImprodutivas,
            this.dados.efetivos
        );

        // Carregar dados no calendário de TSs
        calendarioTS.carregarDados(
            this.dados.rdos,
            this.dados.servicos,
            this.dados.horasImprodutivas,
            this.dados.efetivos
        );

        // Carregar dados na gestão de O.S
        gestaoOS.carregarDados(
            this.dados.rdos,
            this.dados.servicos,
            this.dados.horasImprodutivas,
            this.dados.efetivos
        );

        debugLog('[Dashboard] Dados carregados:', {
            rdos: this.dados.rdos.length,
            servicos: this.dados.servicos.length,
            hi: this.dados.horasImprodutivas.length
        });
    }

    /**
     * Extrai turmas únicas da planilha
     */
    extrairTurmasUnicas() {
        const turmasSet = new Set();

        this.dados.rdos.forEach(rdo => {
            const turma = rdo['Código Turma'] || rdo.codigoTurma || '';
            if (turma && turma.trim() !== '') {
                turmasSet.add(turma.trim());
            }
        });

        const turmas = Array.from(turmasSet).sort();
        debugLog('[Dashboard] Turmas encontradas na planilha:', turmas);

        return turmas;
    }

    /**
     * Popula select de turmas dinamicamente
     */
    popularSelectTurmas() {
        const select = document.getElementById('filtroTurma');
        if (!select) return;

        const turmas = this.extrairTurmasUnicas();

        // Limpar options existentes (exceto "todas")
        while (select.options.length > 1) {
            select.remove(1);
        }

        // Separar TPs, TMCs e TSs
        const tps = turmas.filter(t => t.startsWith('TP-') || t.startsWith('TP '));
        const tmcs = turmas.filter(t => t.startsWith('TMC-') || t.startsWith('TMC '));
        const tss = turmas.filter(t => t.startsWith('TS-') || t.startsWith('TS '));
        const outras = turmas.filter(t => !tps.includes(t) && !tmcs.includes(t) && !tss.includes(t));

        // Criar optgroups
        if (tps.length > 0) {
            const optgroupTPs = document.createElement('optgroup');
            optgroupTPs.label = 'TPs - Turmas de Produção';
            tps.forEach(turma => {
                const option = document.createElement('option');
                option.value = turma;
                option.textContent = turma;
                optgroupTPs.appendChild(option);
            });
            select.appendChild(optgroupTPs);
        }

        if (tmcs.length > 0) {
            const optgroupTMCs = document.createElement('optgroup');
            optgroupTMCs.label = 'TMCs - Turmas de Manutenção';
            tmcs.forEach(turma => {
                const option = document.createElement('option');
                option.value = turma;
                option.textContent = turma;
                optgroupTMCs.appendChild(option);
            });
            select.appendChild(optgroupTMCs);
        }

        if (tss.length > 0) {
            const optgroupTSs = document.createElement('optgroup');
            optgroupTSs.label = 'TSs - Turmas de Solda';
            tss.forEach(turma => {
                const option = document.createElement('option');
                option.value = turma;
                option.textContent = turma;
                optgroupTSs.appendChild(option);
            });
            select.appendChild(optgroupTSs);
        }

        if (outras.length > 0) {
            const optgroupOutras = document.createElement('optgroup');
            optgroupOutras.label = 'Outras';
            outras.forEach(turma => {
                const option = document.createElement('option');
                option.value = turma;
                option.textContent = turma;
                optgroupOutras.appendChild(option);
            });
            select.appendChild(optgroupOutras);
        }
    }

    /**
     * Configura filtros iniciais (mês/ano atual)
     */
    configurarFiltros() {
        const now = new Date();
        this.filtros.mes = now.getMonth() + 1;
        this.filtros.ano = now.getFullYear();

        // Popular anos dinamicamente (2024 até ano atual + 1)
        this.popularSelectAnos();

        // Popular turmas dinamicamente do Google Sheets
        this.popularSelectTurmas();

        // Setar valores nos selects
        document.getElementById('filtroMes').value = this.filtros.mes;
        document.getElementById('filtroAno').value = this.filtros.ano;

        // Listener do filtro de Status da Gestão de O.S
        document.getElementById('filtroStatusGestaoOS')?.addEventListener('change', (e) => {
            gestaoOS.filtroStatus = e.target.value;
            gestaoOS.renderizar();
        });
    }

    /**
     * Popula selects de ano dinamicamente (2024 até ano atual + 1)
     */
    popularSelectAnos() {
        const anoAtual = new Date().getFullYear();
        const selects = ['filtroAno', 'filtroAnoMinimal'];

        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;

            select.innerHTML = '';
            for (let ano = 2024; ano <= anoAtual + 1; ano++) {
                const option = document.createElement('option');
                option.value = ano;
                option.textContent = ano;
                if (ano === anoAtual) option.selected = true;
                select.appendChild(option);
            }
        });
    }

    /**
     * Filtra dados (servicos e HI) por período (mês/ano) e turma
     */
    filtrarDadosPorPeriodo() {
        const { mes, ano, turma, tipo } = this.filtros;

        debugLog(`[Dashboard] Filtrando dados: Mês ${mes}/${ano}, Turma: ${turma}, Tipo: ${tipo}`);

        // Primeiro, filtrar RDOs do período
        const rdosFiltrados = this.dados.rdos.filter(rdo => {
            const data = rdo.Data || rdo.data || '';
            if (!data) return false;

            const [dia, mesRDO, anoRDO] = data.split('/');

            // Filtrar por mês/ano
            if (parseInt(mesRDO) !== mes || parseInt(anoRDO) !== ano) {
                return false;
            }

            // Filtrar por turma se especificado
            if (turma && turma !== 'todas') {
                const codigoTurma = rdo['Código Turma'] || rdo.codigoTurma || '';
                if (codigoTurma !== turma) return false;
            }

            // Filtrar por tipo (TP/TMC) se especificado
            if (tipo && tipo !== 'todos') {
                const codigoTurma = rdo['Código Turma'] || rdo.codigoTurma || '';
                const tipoTurma = getTipoTurma(codigoTurma);
                if (tipoTurma !== tipo) return false;
            }

            return true;
        });

        // Extrair números de RDO filtrados para usar como critério
        const numerosRDOFiltrados = new Set(
            rdosFiltrados.map(rdo => rdo['Número RDO'] || rdo.numeroRDO || rdo.numeroRdo || '')
        );

        // Filtrar serviços que pertencem aos RDOs filtrados
        const servicosFiltrados = this.dados.servicos.filter(servico => {
            const numeroRDO = servico['Número RDO'] || servico.numeroRDO || '';
            return numerosRDOFiltrados.has(numeroRDO);
        });

        // Filtrar HI que pertencem aos RDOs filtrados
        const hiFiltradas = this.dados.horasImprodutivas.filter(hi => {
            const numeroRDO = hi['Número RDO'] || hi.numeroRDO || '';
            return numerosRDOFiltrados.has(numeroRDO);
        });

        debugLog(`[Dashboard] Dados filtrados: ${rdosFiltrados.length} RDOs, ${servicosFiltrados.length} serviços, ${hiFiltradas.length} HIs`);

        return {
            rdos: rdosFiltrados,
            servicos: servicosFiltrados,
            horasImprodutivas: hiFiltradas
        };
    }


    /**
     * Calcula estatísticas baseadas nos filtros
     */
    async calcularEstatisticas() {
        debugLog('[Dashboard] Calculando estatísticas...');

        const { mes, ano } = this.filtros;

        this.estatisticas = this.calculadora.calcularEstatisticasConsolidadas(mes, ano);

        debugLog('[Dashboard] Estatísticas calculadas');
    }

    /**
     * Renderiza todo o dashboard
     */
    renderizarDashboard() {
        debugLog('[Dashboard] Renderizando visualizações...');

        // Obter dados filtrados pelo período
        const dadosFiltrados = this.filtrarDadosPorPeriodo();

        // ✅ Empty state: mostrar aviso amigável quando não há dados no período
        this._atualizarAvisoPeriodoVazio(dadosFiltrados.rdos.length === 0);

        // 1. KPIs
        this.atualizarKPIs();

        // 1.5. 🔔 Alertas (Sprint 3)
        if (typeof alertsSystem !== 'undefined') {
            alertsSystem.analisarEstatisticas(this.estatisticas);
            alertsSystem.renderizarAlertas();
        }

        // 2. Gráficos (passar dados filtrados + calculadora para evolução real)
        dashboardCharts.renderizarTodos(this.estatisticas, this.calculadora);
        dashboardCharts.renderizarGraficosPizza(dadosFiltrados);
        dashboardCharts.renderizarTotaisMensais(dadosFiltrados);

        // 3. Tabelas
        // this.renderizarTabelaTPs(); // ❌ REMOVIDO: Tabela "Detalhamento das TPs" foi removida do HTML
        this.renderizarTabelaTMCs();
        this.renderizarTabelaTSs();

        // 4. Heatmap
        this.renderizarHeatmap();

        // 7. Inicializar calendário TP
        calendarioTP.setFiltros(this.filtros.mes, this.filtros.ano, this.filtros.turma);
        calendarioTP.renderizarTodos();

        // 8. Inicializar calendário TS
        calendarioTS.setFiltros(this.filtros.mes, this.filtros.ano, this.filtros.turma);
        calendarioTS.renderizarTodos();

        // 9. Renderizar gestão de O.S
        gestaoOS.setFiltros(this.filtros.mes, this.filtros.ano);
        gestaoOS.renderizar();
    }

    /**
     * Atualiza cards de KPIs (incluindo TSs)
     */
    atualizarKPIs() {
        const { tmcs, tps, tss, totalGeral } = this.estatisticas;

        // Total de RDOs
        const totalRDOs = this.dados.rdos.filter(rdo => {
            const data = rdo.Data || rdo.data || '';
            if (!data) return false;
            const [dia, mes, ano] = data.split('/');
            return parseInt(mes) === this.filtros.mes && parseInt(ano) === this.filtros.ano;
        }).length;

        document.getElementById('kpiTotalRdos').textContent = totalRDOs;

        // Total HH (TPs)
        const totalHH = tps.reduce((sum, tp) => sum + tp.hh.total, 0);
        document.getElementById('kpiTotalHH').textContent = totalHH.toFixed(0);

        // Faturamento Total
        document.getElementById('kpiFaturamento').textContent = formatarMoeda(totalGeral);

        // Média SLA (TPs)
        const mediaSLA = tps.length > 0
            ? tps.reduce((sum, tp) => sum + tp.percentualSLA, 0) / tps.length
            : 0;

        const kpiSLA = document.getElementById('kpiMediaSLA');
        kpiSLA.textContent = formatarPercentual(mediaSLA);

        // Colorir baseado no threshold
        kpiSLA.style.color = getCorPorSLA(mediaSLA);

        // Média de Efetivo (TPs)
        this.renderizarKPIMediaEfetivo('TP');

        // Média de Efetivo (TMCs)
        this.renderizarKPIMediaEfetivo('TMC');

        // Média de Efetivo (TSs)
        this.renderizarKPIMediaEfetivo('TS');

        // Média de Efetivo Geral (Acompanhamento)
        this.renderizarKPIMediaEfetivoGeral();
    }

    /**
     * Renderiza KPI de média de efetivo para um tipo de turma
     */
    renderizarKPIMediaEfetivo(tipo) {
        const mediaEfetivo = this.calculadora.calcularMediaEfetivoGeral(tipo, this.filtros.mes, this.filtros.ano);

        const sufixo = tipo === 'TP' ? 'TP' : tipo === 'TMC' ? 'TMC' : 'TS';
        const kpiOperadores = document.getElementById(`kpiMediaEfetivo${sufixo}`);
        const kpiTotal = document.getElementById(`kpiMediaEfetivoTotal${sufixo}`);

        if (kpiOperadores && kpiTotal) {
            kpiOperadores.textContent = mediaEfetivo.operadores.toFixed(1);
            kpiTotal.textContent = mediaEfetivo.total.toFixed(1);
        }
    }

    /**
     * Renderiza KPI de média de efetivo geral (todas as turmas)
     */
    renderizarKPIMediaEfetivoGeral() {
        const mediaTP = this.calculadora.calcularMediaEfetivoGeral('TP', this.filtros.mes, this.filtros.ano);
        const mediaTMC = this.calculadora.calcularMediaEfetivoGeral('TMC', this.filtros.mes, this.filtros.ano);
        const mediaTS = this.calculadora.calcularMediaEfetivoGeral('TS', this.filtros.mes, this.filtros.ano);

        const totalOperadores = mediaTP.operadores + mediaTMC.operadores + mediaTS.operadores;
        const totalGeral = mediaTP.total + mediaTMC.total + mediaTS.total;

        const kpiOperadores = document.getElementById('kpiMediaEfetivoAcomp');
        const kpiTotal = document.getElementById('kpiMediaEfetivoTotalAcomp');

        if (kpiOperadores && kpiTotal) {
            kpiOperadores.textContent = totalOperadores.toFixed(1);
            kpiTotal.textContent = totalGeral.toFixed(1);
        }
    }

    /**
     * Renderiza tabela de TPs
     */
    renderizarTabelaTPs() {
        const tbody = document.querySelector('#tabelaTPs tbody');
        tbody.innerHTML = '';

        const { tps } = this.estatisticas;

        if (tps.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhuma TP encontrada no período</td></tr>';
            return;
        }

        tps.forEach(tp => {
            // Buscar encarregado (do primeiro RDO da turma)
            const rdo = tp.rdos[0];
            const encarregado = rdo ? (rdo.Encarregado || rdo.encarregado || '-') : '-';

            // Calcular média de efetivo da turma
            const rdosTurma = this.calculadora.filtrarRDOsPorTurma(tp.turma, this.filtros.mes, this.filtros.ano);
            const diasUteis = this.calculadora.getDiasUteis(this.filtros.mes, this.filtros.ano);
            const mediaEfetivo = this.calculadora.calcularMediaEfetivo(rdosTurma, diasUteis);

            const tr = document.createElement('tr');

            // Status badge
            let statusBadge = '';
            if (tp.percentualSLA >= THRESHOLDS.SLA_OK) {
                statusBadge = '<span class="badge bg-success">Atingido</span>';
            } else if (tp.percentualSLA >= THRESHOLDS.SLA_ALERTA) {
                statusBadge = '<span class="badge bg-warning">Próximo</span>';
            } else {
                statusBadge = '<span class="badge bg-danger">Crítico</span>';
            }

            tr.innerHTML = `
                <td><strong>${_escHtml(tp.turma)}</strong></td>
                <td>${_escHtml(encarregado)}</td>
                <td>${tp.metaMensal.toFixed(0)} HH</td>
                <td>${tp.hh.total.toFixed(0)} HH</td>
                <td style="color: ${getCorPorSLA(tp.percentualSLA)}">
                    <strong>${formatarPercentual(tp.percentualSLA)}</strong>
                </td>
                <td>${mediaEfetivo.operadores.toFixed(1)} (${mediaEfetivo.total.toFixed(1)} total)</td>
                <td>${formatarMoeda(tp.totalGeral)}</td>
                <td>${statusBadge}</td>
            `;

            tbody.appendChild(tr);
        });
    }

    /**
     * Renderiza tabela de TMCs
     */
    renderizarTabelaTMCs() {
        const tbody = document.querySelector('#tabelaTMCs tbody');
        tbody.innerHTML = '';

        const { tmcs } = this.estatisticas;

        if (tmcs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Nenhuma TMC encontrada no período</td></tr>';
            return;
        }

        tmcs.forEach(tmc => {
            // Buscar local (do primeiro RDO da turma)
            const rdo = tmc.rdos[0];
            const local = rdo ? (rdo.Local || rdo.local || '-') : '-';

            // Calcular média de efetivo da turma
            const rdosTurma = this.calculadora.filtrarRDOsPorTurma(tmc.turma, this.filtros.mes, this.filtros.ano);
            const diasUteis = this.calculadora.getDiasUteis(this.filtros.mes, this.filtros.ano);
            const mediaEfetivo = this.calculadora.calcularMediaEfetivo(rdosTurma, diasUteis);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${_escHtml(tmc.turma)}</strong></td>
                <td>${_escHtml(local)}</td>
                <td>${tmc.diasUteis}</td>
                <td>${tmc.diasTrabalhados}</td>
                <td>${tmc.mediaEncarregado.toFixed(3)}</td>
                <td>${tmc.mediaOperadores.toFixed(2)}</td>
                <td>${mediaEfetivo.total.toFixed(2)}</td>
                <td>${formatarMoeda(tmc.engecom.total)}</td>
                <td>${formatarMoeda(tmc.encogel.total)}</td>
                <td><strong>${formatarMoeda(tmc.totalGeral)}</strong></td>
            `;

            tbody.appendChild(tr);
        });
    }

    /**
     * Renderiza tabela de TSs
     */
    renderizarTabelaTSs() {
        const tbody = document.querySelector('#tabelaTSs tbody');
        if (!tbody) return; // Elemento não existe ainda

        tbody.innerHTML = '';

        const { tss } = this.estatisticas;

        if (!tss || tss.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhuma TS encontrada no período</td></tr>';

            // Atualizar KPIs de TS com valores zero
            document.getElementById('kpiTotalTSs').textContent = '0';
            document.getElementById('kpiHHSoldador').textContent = '0';
            document.getElementById('kpiMediaSLATS').textContent = '0%';
            document.getElementById('kpiFaturamentoTS').textContent = 'R$ 0,00';

            return;
        }

        // Atualizar KPIs de TS
        const totalHHSoldador = tss.reduce((sum, ts) => sum + ts.hh.soldador, 0);
        const totalFaturamentoTS = tss.reduce((sum, ts) => sum + ts.totalGeral, 0);
        const mediaSLATS = tss.reduce((sum, ts) => sum + ts.percentualSLA, 0) / tss.length;

        document.getElementById('kpiTotalTSs').textContent = tss.length;
        document.getElementById('kpiHHSoldador').textContent = totalHHSoldador.toFixed(0);
        document.getElementById('kpiMediaSLATS').textContent = formatarPercentual(mediaSLATS);
        document.getElementById('kpiFaturamentoTS').textContent = formatarMoeda(totalFaturamentoTS);

        // Colorir média SLA
        const kpiSLATS = document.getElementById('kpiMediaSLATS');
        kpiSLATS.style.color = getCorPorSLA(mediaSLATS);

        // Renderizar tabela
        tss.forEach(ts => {
            // Buscar encarregado (do primeiro RDO da turma)
            const rdo = ts.rdos[0];
            const encarregado = rdo ? (rdo.Encarregado || rdo.encarregado || '-') : '-';

            // Calcular média de efetivo da turma
            const rdosTurma = this.calculadora.filtrarRDOsPorTurma(ts.turma, this.filtros.mes, this.filtros.ano);
            const diasUteis = this.calculadora.getDiasUteis(this.filtros.mes, this.filtros.ano);
            const mediaEfetivo = this.calculadora.calcularMediaEfetivo(rdosTurma, diasUteis);

            const tr = document.createElement('tr');

            // Status badge
            let statusBadge = '';
            if (ts.percentualSLA >= THRESHOLDS.SLA_OK) {
                statusBadge = '<span class="badge bg-success">Atingido</span>';
            } else if (ts.percentualSLA >= THRESHOLDS.SLA_ALERTA) {
                statusBadge = '<span class="badge bg-warning">Próximo</span>';
            } else {
                statusBadge = '<span class="badge bg-danger">Crítico</span>';
            }

            tr.innerHTML = `
                <td><strong>${_escHtml(ts.turma)}</strong></td>
                <td>${_escHtml(encarregado)}</td>
                <td>${ts.metaMensal.toFixed(0)} HH</td>
                <td>${ts.hh.soldador.toFixed(0)} HH</td>
                <td style="color: ${getCorPorSLA(ts.percentualSLA)}">
                    <strong>${formatarPercentual(ts.percentualSLA)}</strong>
                </td>
                <td>${mediaEfetivo.operadores.toFixed(1)} (${mediaEfetivo.total.toFixed(1)} total)</td>
                <td>${formatarMoeda(ts.totalGeral)}</td>
                <td>${statusBadge}</td>
            `;

            tbody.appendChild(tr);
        });
    }

    /**
     * Renderiza heatmap de produtividade diária
     */
    renderizarHeatmap() {
        const container = document.getElementById('heatmapContainer');

        const { tps } = this.estatisticas;

        if (tps.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">Selecione uma TP específica para ver o heatmap diário</p>';
            return;
        }

        // Se filtrou uma turma específica, mostrar heatmap
        if (this.filtros.turma !== 'todas') {
            const tpSelecionada = tps.find(tp => tp.turma === this.filtros.turma);

            if (tpSelecionada && tpSelecionada.analiseDiaria) {
                container.innerHTML = '<div class="heatmap-grid"></div>';
                const grid = container.querySelector('.heatmap-grid');

                tpSelecionada.analiseDiaria.forEach(dia => {
                    const [d, m, a] = dia.data.split('/');

                    const dayDiv = document.createElement('div');
                    dayDiv.className = `heatmap-day ${dia.status}`;
                    // ✅ Adicionar observações se existirem
                    let tooltipObservacoes = '';
                    if (dia.observacoes && dia.observacoes.length > 0) {
                        tooltipObservacoes = '<hr style="margin: 8px 0; border-color: rgba(255,255,255,0.3);">';
                        tooltipObservacoes += '<strong>Observações:</strong><br>';
                        tooltipObservacoes += dia.observacoes.map(obs => `• ${obs}`).join('<br>');
                    }

                    dayDiv.innerHTML = `
                        <div class="heatmap-day-number">${d}</div>
                        <div class="heatmap-day-hh">${dia.hhTotal.toFixed(0)} HH</div>
                        <div class="heatmap-tooltip">
                            ${dia.data}<br>
                            Serviços: ${dia.hhServicos.toFixed(1)} HH<br>
                            Improdutivas: ${dia.hhImprodutivas.toFixed(1)} HH<br>
                            Total: ${dia.hhTotal.toFixed(1)} HH<br>
                            Meta: ${formatarPercentual(dia.percentualMeta)}
                            ${tooltipObservacoes}
                        </div>
                    `;

                    grid.appendChild(dayDiv);
                });
            } else {
                container.innerHTML = '<p class="text-center text-muted">Nenhum dado disponível para heatmap</p>';
            }
        } else {
            container.innerHTML = '<p class="text-center text-muted">Selecione uma TP específica nos filtros para visualizar o heatmap diário</p>';
        }
    }

    /**
     * Aplica filtros e recalcula
     */
    async aplicarFiltros() {
        // Pegar valores dos filtros (com null guards)
        const elMes   = document.getElementById('filtroMes');
        const elAno   = document.getElementById('filtroAno');
        const elTurma = document.getElementById('filtroTurma');
        const elTipo  = document.getElementById('filtroTipo');

        if (!elMes || !elAno || !elTurma || !elTipo) {
            console.error('[Dashboard] Elementos de filtro não encontrados');
            return;
        }

        const mes   = parseInt(elMes.value);
        const ano   = parseInt(elAno.value);
        const turma = elTurma.value;
        const tipo  = elTipo.value;

        // ✅ VALIDAÇÃO: Verificar se mês/ano são válidos
        if (!mes || mes < 1 || mes > 12) {
            alert('Erro: Mês inválido. Selecione um mês entre 1 e 12.');
            return;
        }

        if (!ano || ano < 2020 || ano > 2030) {
            alert('Erro: Ano inválido. Selecione um ano entre 2020 e 2030.');
            return;
        }

        // ✅ VALIDAÇÃO: Verificar se há dados para o período selecionado
        const dataInicial = new Date(ano, mes - 1, 1);
        const dataAtual = new Date();

        if (dataInicial > dataAtual) {
            const optionEl = document.querySelector(`#filtroMes option[value="${mes}"]`);
            const mesNome = optionEl ? optionEl.text : mes;
            const confirmacao = confirm(
                `Atenção: Você selecionou ${mesNome}/${ano}, que é no futuro.\n\n` +
                `Provavelmente não há dados disponíveis para este período.\n\n` +
                `Deseja continuar mesmo assim?`
            );
            if (!confirmacao) {
                return;
            }
        }

        // Aplicar filtros validados
        this.filtros.mes = mes;
        this.filtros.ano = ano;
        this.filtros.turma = turma;
        this.filtros.tipo = tipo;

        debugLog('[Dashboard] Aplicando filtros:', this.filtros);

        // Mostrar loading
        document.getElementById('loadingOverlay').style.display = 'flex';
        document.getElementById('mainContainer').style.display = 'none';

        try {
            // Recalcular estatísticas
            await this.calcularEstatisticas();

            // Renderizar novamente
            this.renderizarDashboard();

            // Ocultar loading
            document.getElementById('loadingOverlay').style.display = 'none';
            document.getElementById('mainContainer').style.display = 'block';

        } catch (error) {
            console.error('[Dashboard] Erro ao aplicar filtros:', error);
            alert('Erro ao aplicar filtros. Tente novamente.');
        }
    }

    /**
     * Exibe ou remove o banner de "nenhum dado encontrado para o período"
     */
    _atualizarAvisoPeriodoVazio(semDados) {
        const bannerId = 'emptyStateBanner';
        let banner = document.getElementById(bannerId);

        if (semDados) {
            if (!banner) {
                const nomeMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][this.filtros.mes - 1];
                banner = document.createElement('div');
                banner.id = bannerId;
                banner.className = 'alert alert-warning alert-dismissible fade show mx-3 mt-3';
                banner.setAttribute('role', 'alert');
                banner.innerHTML = `
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Nenhum dado encontrado</strong> para o período
                    <strong>${nomeMes}/${this.filtros.ano}</strong>.
                    Verifique se há RDOs registrados para este mês ou selecione outro período.
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
                `;
                // Inserir após os filtros (antes do conteúdo principal)
                const mainContainer = document.getElementById('mainContainer');
                if (mainContainer) {
                    mainContainer.insertBefore(banner, mainContainer.firstChild);
                }
            }
        } else {
            // Remover banner quando há dados
            if (banner) banner.remove();
        }
    }

    /**
     * Recarrega dados (força atualização)
     */
    async recarregar() {
        if (confirm('Deseja recarregar os dados do Google Sheets? Isso pode levar alguns segundos.')) {
            document.getElementById('loadingOverlay').style.display = 'flex';
            document.getElementById('mainContainer').style.display = 'none';

            try {
                await this.carregarDados();
                await this.calcularEstatisticas();
                this.renderizarDashboard();

                document.getElementById('loadingOverlay').style.display = 'none';
                document.getElementById('mainContainer').style.display = 'block';

                alert('Dados recarregados com sucesso!');

            } catch (error) {
                console.error('[Dashboard] Erro ao recarregar:', error);
                alert('Erro ao recarregar dados. Tente novamente.');
            }
        }
    }
}

// Instância global
const dashboardMain = new DashboardMain();

/**
 * Escapa texto para inserção segura em HTML (XSS protection)
 * Reutiliza a função _esc() do gestao-os.js se disponível, senão cria equivalente
 */
function _escHtml(text) {
    if (text === null || text === undefined) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}
