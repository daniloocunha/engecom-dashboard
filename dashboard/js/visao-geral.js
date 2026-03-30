/**
 * Módulo de Visão Geral — Análise de Produtividade Operacional
 * Sub-abas: TPS (Produção) e TS (Solda)
 * Classificação PDM / Correlato por tipo de turma
 */

class VisaoGeral {
    constructor() {
        // Cache de instâncias Chart.js (destroy antes de recriar)
        this._charts = {};

        // Estado: sub-aba ativa ('tps' | 'ts')
        this._abaAtiva = 'tps';

        // Dados calculados mais recentes (para alternar sub-abas sem recalcular)
        this._dadosTPS = null;
        this._dadosTS  = null;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CLASSIFICAÇÃO DE SERVIÇOS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Classifica serviço como PDM ou Correlato, diferenciando TPS de TS.
     * @param {string} descricao - Descrição do serviço
     * @param {string} tipoTurma - 'TP' (turma TPS) ou 'TS' (turma TS)
     * @returns {'PDM_TPS'|'CORRELATO_TPS'|'PDM_SOLDA'|'CORRELATO_SOLDA'}
     */
    classificarServicoV2(descricao, tipoTurma) {
        const desc = (descricao || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos

        if (tipoTurma === 'TS') {
            // PDM Solda = apenas soldas aluminotérmicas
            if (desc.includes('solda alumin')) return 'PDM_SOLDA';
            return 'CORRELATO_SOLDA';
        }

        // TPS — PDM: dormentes, alívio, trilho, lastro, passagens de nível
        const regexPDM = [
            /substitu[ic][ca][oa]o.*dormente/,
            /dormente.*(concreto|madeira|amv)/,
            /alivio/,             // alívio de tensões (sem acento após normalize)
            /substitu[ic][ca][oa]o.*trilho/,
            /troca.*trilho/,
            /limp.*lastro/,
            /restaura[ca][oa]o.*passagem/,
            /conserva[ca][oa]o.*passagem/,
        ];

        for (const re of regexPDM) {
            if (re.test(desc)) return 'PDM_TPS';
        }

        return 'CORRELATO_TPS';
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CÁLCULOS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Calcula dados de produtividade para um conjunto de turmas.
     * @param {string} tipoTurma - 'TP' ou 'TS'
     * @param {number} mes
     * @param {number} ano
     * @param {CalculadoraMedicao} calc
     * @returns {Object} dados agregados para renderização
     */
    _calcularDados(tipoTurma, mes, ano, calc) {
        const turmas = calc.getTurmasPorTipo(tipoTurma, mes, ano);
        const diasUteis = calc.getDiasUteis(mes, ano);

        const classPDM     = tipoTurma === 'TP' ? 'PDM_TPS'      : 'PDM_SOLDA';
        const classCorr    = tipoTurma === 'TP' ? 'CORRELATO_TPS' : 'CORRELATO_SOLDA';

        // Agregadores globais
        let totalHHServicos = 0;
        let totalHHPDM      = 0;
        let totalHHCorr     = 0;
        let totalHHImprod   = 0;

        // Por turma
        const dadosTurmas = [];

        // Serviços agregados (para top-serviços e doughnut)
        const servicosMap = {}; // descricao → { hh, qty, ocorrencias, classificacao, unidade }

        // Perdas agregadas (para ranking de perdas)
        const perdasMap = {}; // tipo → { hh, count }

        // Evolução diária: data (DD/MM) → { hhServicos, hhImprod }
        const evolucaoDiaria = {};

        turmas.forEach(turmaId => {
            const rdosTurma = calc.filtrarRDOsPorTurma(turmaId, mes, ano);
            if (rdosTurma.length === 0) return;

            let hhServTurma = 0;
            let hhPDMTurma  = 0;
            let hhCorrTurma = 0;
            let hhImprodTurma = 0;

            // — Serviços da turma —
            rdosTurma.forEach(rdo => {
                const numRDO = rdo['Número RDO'] || rdo.numeroRDO || '';
                const dataRDO = rdo['Data'] || rdo.data || '';
                const dataNorm = FieldHelper.normalizarData(dataRDO);

                // Serviços
                const servs = calc.indices.servicosPorRDO.get(numRDO) || [];
                let hhServDia = 0;

                servs.forEach(s => {
                    const desc   = s['Descrição'] || s.descricao || '';
                    const qty    = parseFloat(s['Quantidade'] || s.quantidade || 0);
                    const coef   = parseFloat(s.coeficiente || s.Coeficiente || 0);
                    const hh     = qty * coef;
                    const cls    = this.classificarServicoV2(desc, tipoTurma);

                    hhServTurma += hh;
                    hhServDia   += hh;

                    if (cls === classPDM) hhPDMTurma  += hh;
                    else                 hhCorrTurma += hh;

                    // Agregar para tabela de serviços
                    if (!servicosMap[desc]) {
                        servicosMap[desc] = { hh: 0, qty: 0, ocorrencias: 0, classificacao: cls, unidade: s['Unidade'] || s.unidade || '' };
                    }
                    servicosMap[desc].hh         += hh;
                    servicosMap[desc].qty        += qty;
                    servicosMap[desc].ocorrencias += 1;
                });

                // HI da turma
                const his = calc.indices.hiPorRDO.get(numRDO) || [];
                const efetivo = calc.indices.efetivosPorRDO.get(numRDO);
                const operadoresDefault = efetivo
                    ? (parseInt(efetivo['Operadores'] || efetivo.operadores || 0) || 12)
                    : 12;

                let hhHIDia = 0;
                his.forEach(hi => {
                    const tipo    = (hi['Tipo'] || hi.tipo || '').trim();
                    const descHI  = (hi['Descrição'] || hi.descricao || '').trim();
                    const inicio  = hi['Hora Início'] || hi.horaInicio || '';
                    const fim     = hi['Hora Fim']    || hi.horaFim    || '';
                    if (!inicio || !fim) return;

                    const parseMin = t => { const p = (t||'').split(':').map(Number); return (p[0]||0)*60+(p[1]||0); };
                    let startMin = parseMin(inicio);
                    let endMin   = parseMin(fim);
                    if (endMin <= startMin) endMin += 1440;

                    const duracaoMin = endMin - startMin;
                    const tipoLower  = tipo.toLowerCase();

                    // Filtrar trens < 15 min
                    if (tipoLower.includes('trem') && duracaoMin < 15) return;

                    let operadores = parseInt(hi['Operadores'] || hi.operadores || 0);
                    if (operadores <= 0) operadores = operadoresDefault;

                    let hh = (duracaoMin / 60) * operadores;
                    if (tipoLower.includes('chuva')) hh /= 2;

                    hhImprodTurma += hh;
                    hhHIDia       += hh;

                    // Chave de agrupamento de perdas: usa Tipo; se vazio usa descrição
                    const chavePerdas = tipo || descHI || 'Outros';
                    if (!perdasMap[chavePerdas]) perdasMap[chavePerdas] = { hh: 0, count: 0, tipo };
                    perdasMap[chavePerdas].hh    += hh;
                    perdasMap[chavePerdas].count += 1;
                });

                // Evolução diária
                if (dataNorm) {
                    if (!evolucaoDiaria[dataNorm]) evolucaoDiaria[dataNorm] = { hhServicos: 0, hhImprod: 0 };
                    evolucaoDiaria[dataNorm].hhServicos += hhServDia;
                    evolucaoDiaria[dataNorm].hhImprod   += hhHIDia;
                }
            });

            // HH improdutivas calculadas com merge de sobreposições (usa método oficial)
            // Nota: calc.calcularHHImprodutivas já aplica merge — usamos aqui para total por turma
            const hhImprodOficial = calc.calcularHHImprodutivas(rdosTurma);

            dadosTurmas.push({
                turma:          turmaId,
                rdos:           rdosTurma,
                hhServicos:     hhServTurma,
                hhPDM:          hhPDMTurma,
                hhCorrelato:    hhCorrTurma,
                hhImprodutivas: hhImprodOficial,
            });

            totalHHServicos += hhServTurma;
            totalHHPDM      += hhPDMTurma;
            totalHHCorr     += hhCorrTurma;
            totalHHImprod   += hhImprodOficial;
        });

        // Ordenar turmas por HH produtivo (decrescente)
        dadosTurmas.sort((a, b) => b.hhServicos - a.hhServicos);

        // Converter servicosMap → array ordenado por HH
        const servicosOrdenados = Object.entries(servicosMap)
            .map(([desc, v]) => ({ descricao: desc, ...v }))
            .sort((a, b) => b.hh - a.hh);

        // Perdas ordenadas por HH
        const perdasOrdenadas = Object.entries(perdasMap)
            .map(([chave, v]) => ({ chave, ...v }))
            .sort((a, b) => b.hh - a.hh);

        // Evolução diária ordenada por data
        const evolucaoArray = Object.entries(evolucaoDiaria)
            .map(([data, v]) => ({ data, ...v }))
            .sort((a, b) => {
                const [da, ma, ya] = a.data.split('/').map(Number);
                const [db, mb, yb] = b.data.split('/').map(Number);
                return new Date(ya, ma-1, da) - new Date(yb, mb-1, db);
            });

        const hhTotal           = totalHHServicos + totalHHImprod;
        const taxaProdutividade = hhTotal > 0 ? (totalHHServicos / hhTotal) * 100 : 0;
        const diasUteisFinal    = diasUteis || 0;
        const metaMensal        = tipoTurma === 'TP'
            ? turmas.length * 12 * 8 * diasUteisFinal
            : turmas.length * 8 * diasUteisFinal;
        const percentualMeta    = metaMensal > 0 ? (totalHHServicos / metaMensal) * 100 : 0;

        return {
            tipoTurma,
            turmas:           dadosTurmas,
            servicos:         servicosOrdenados,
            perdas:           perdasOrdenadas,
            evolucao:         evolucaoArray,
            totais: {
                hhServicos:    totalHHServicos,
                hhPDM:         totalHHPDM,
                hhCorrelato:   totalHHCorr,
                hhImprodutivas: totalHHImprod,
                hhTotal,
                taxaProdutividade,
                metaMensal,
                percentualMeta,
                classPDM,
                classCorr,
            },
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PONTO DE ENTRADA
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Método principal chamado por main.js após renderizarDashboard().
     */
    renderizar(estatisticas, calculadora, filtros) {
        const { mes, ano } = filtros;

        this._dadosTPS = this._calcularDados('TP', mes, ano, calculadora);
        this._dadosTS  = this._calcularDados('TS', mes, ano, calculadora);

        this._renderizarSubAba('vg-tp', this._dadosTPS);
        this._renderizarSubAba('vg-ts', this._dadosTS);

        // Registrar troca de sub-aba para re-renderizar gráficos
        this._configurarEventosAbas();
    }

    _configurarEventosAbas() {
        ['btn-vg-tp', 'btn-vg-ts'].forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (!btn || btn._vgListener) return;
            btn._vgListener = true;
            btn.addEventListener('shown.bs.tab', () => {
                // Após transição Bootstrap, re-renderizar gráficos do painel ativo
                const isTP = btnId === 'btn-vg-tp';
                const dados = isTP ? this._dadosTPS : this._dadosTS;
                const suffix = isTP ? 'tp' : 'ts';
                if (dados) {
                    this._renderizarGraficoProdutividade(suffix, dados);
                    this._renderizarGraficoEvolucao(suffix, dados);
                    this._renderizarGraficoClassificacao(suffix, dados);
                    this._renderizarGraficoPerdas(suffix, dados);
                }
            });
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // RENDERIZAÇÃO DE SUB-ABA COMPLETA
    // ──────────────────────────────────────────────────────────────────────────

    _renderizarSubAba(painelId, dados) {
        const painel = document.getElementById(painelId);
        if (!painel) return;

        const suffix = painelId === 'vg-tp' ? 'tp' : 'ts';

        const nomeLabel = dados.tipoTurma === 'TP'
            ? { pdm: 'PDM TPS', corr: 'Correlato TPS', titulo: 'TPs (Produção)' }
            : { pdm: 'PDM Solda', corr: 'Correlato Solda', titulo: 'TSs (Solda)' };

        const semDados = dados.turmas.length === 0;

        if (semDados) {
            painel.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                    <p class="mb-0">Nenhum dado encontrado para o período selecionado.</p>
                </div>`;
            return;
        }

        painel.innerHTML = `
            <!-- ── Seção 1: KPIs ── -->
            <div class="row g-3 mb-4" id="vg-kpis-${suffix}"></div>

            <!-- ── Seção 2: Produtividade por Turma ── -->
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card border-0 shadow-sm">
                        <div class="card-header bg-white">
                            <h6 class="mb-0"><i class="fas fa-chart-bar me-2 text-primary"></i>Produtividade por Turma (HH)</h6>
                        </div>
                        <div class="card-body" style="position:relative; min-height:200px;">
                            <canvas id="chart-vg-prod-${suffix}"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Seção 3: Evolução Temporal ── -->
            <div class="row mb-4">
                <div class="col-12">
                    <div class="card border-0 shadow-sm">
                        <div class="card-header bg-white d-flex justify-content-between align-items-center">
                            <h6 class="mb-0"><i class="fas fa-chart-line me-2 text-success"></i>Evolução Diária de HH</h6>
                        </div>
                        <div class="card-body" style="position:relative; min-height:200px;">
                            <canvas id="chart-vg-evolucao-${suffix}"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Seção 4: Classificação + Top Serviços ── -->
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-white">
                            <h6 class="mb-0"><i class="fas fa-chart-pie me-2 text-warning"></i>Classificação de Atividades</h6>
                        </div>
                        <div class="card-body d-flex align-items-center justify-content-center">
                            <canvas id="chart-vg-class-${suffix}" style="max-height:260px;"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-8">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-white">
                            <h6 class="mb-0"><i class="fas fa-list-ul me-2 text-info"></i>Top Serviços por HH</h6>
                        </div>
                        <div class="card-body p-0" id="vg-top-servicos-${suffix}"></div>
                    </div>
                </div>
            </div>

            <!-- ── Seção 5: Análise de Perdas ── -->
            <div class="row mb-4">
                <div class="col-md-7">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-white">
                            <h6 class="mb-0"><i class="fas fa-exclamation-triangle me-2 text-danger"></i>Ranking de Perdas (HI por Tipo)</h6>
                        </div>
                        <div class="card-body" style="position:relative; min-height:200px;">
                            <canvas id="chart-vg-perdas-${suffix}"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-5">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-white">
                            <h6 class="mb-0"><i class="fas fa-tachometer-alt me-2 text-danger"></i>Resumo de Perdas</h6>
                        </div>
                        <div class="card-body" id="vg-resumo-perdas-${suffix}"></div>
                    </div>
                </div>
            </div>

            <!-- ── Seção 6: Análise de "Outros" ── -->
            <div class="row mb-4" id="vg-outros-container-${suffix}"></div>
        `;

        // Preencher seções
        this._renderizarKPIs(`vg-kpis-${suffix}`, dados, nomeLabel);
        this._renderizarGraficoProdutividade(suffix, dados);
        this._renderizarGraficoEvolucao(suffix, dados);
        this._renderizarGraficoClassificacao(suffix, dados);
        this._renderizarTopServicos(`vg-top-servicos-${suffix}`, dados, nomeLabel);
        this._renderizarGraficoPerdas(suffix, dados);
        this._renderizarResumoPerdas(`vg-resumo-perdas-${suffix}`, dados);
        this._renderizarAnaliseOutros(`vg-outros-container-${suffix}`, dados);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // KPIs
    // ──────────────────────────────────────────────────────────────────────────

    _renderizarKPIs(containerId, dados, label) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const { totais } = dados;
        const isTP = dados.tipoTurma === 'TP';

        const fmt = n => Number.isFinite(n) ? n.toFixed(1) : '-';
        const fmtPct = n => Number.isFinite(n) ? n.toFixed(1) + '%' : '-%';

        const kpis = isTP ? [
            {
                label: 'HH Produtivo Total',
                value: fmt(totais.hhServicos) + ' HH',
                icon: 'fa-clock',
                color: 'success',
                sub: `${fmt(totais.hhPDM)} HH PDM + ${fmt(totais.hhCorrelato)} HH Correlato`,
            },
            {
                label: 'HH Improdutivo Total',
                value: fmt(totais.hhImprodutivas) + ' HH',
                icon: 'fa-pause-circle',
                color: 'danger',
                sub: `${fmt(totais.hhImprodutivas / (dados.turmas.length || 1))} HH/turma`,
            },
            {
                label: 'Taxa de Produtividade',
                value: fmtPct(totais.taxaProdutividade),
                icon: 'fa-percentage',
                color: totais.taxaProdutividade >= 70 ? 'primary' : 'warning',
                sub: 'HH produtivo / (produtivo + improdutivo)',
            },
            {
                label: 'Meta vs Realizado',
                value: fmtPct(totais.percentualMeta),
                icon: 'fa-bullseye',
                color: totais.percentualMeta >= 80 ? 'info' : 'warning',
                sub: `Meta ${fmt(totais.metaMensal)} HH no mês`,
            },
        ] : [
            {
                label: 'HH Soldador Total',
                value: fmt(totais.hhServicos) + ' HH',
                icon: 'fa-fire',
                color: 'warning',
                sub: `${fmt(totais.hhPDM)} HH PDM + ${fmt(totais.hhCorrelato)} HH Correlato`,
            },
            {
                label: 'Soldas Aluminotérmicas',
                value: dados.servicos.filter(s => s.classificacao === 'PDM_SOLDA').reduce((a, s) => a + s.qty, 0).toFixed(0),
                icon: 'fa-certificate',
                color: 'success',
                sub: 'Quantidade total de soldas PDM',
            },
            {
                label: 'HH Improdutivo TS',
                value: fmt(totais.hhImprodutivas) + ' HH',
                icon: 'fa-pause-circle',
                color: 'danger',
                sub: `${fmt(totais.hhImprodutivas / (dados.turmas.length || 1))} HH/turma`,
            },
            {
                label: 'Taxa de Produtividade',
                value: fmtPct(totais.taxaProdutividade),
                icon: 'fa-percentage',
                color: totais.taxaProdutividade >= 70 ? 'primary' : 'warning',
                sub: 'HH soldador / (soldador + improdutivo)',
            },
        ];

        el.innerHTML = kpis.map(k => `
            <div class="col-6 col-md-3">
                <div class="card border-0 shadow-sm kpi-card" style="border-left: 4px solid var(--bs-${k.color}) !important;">
                    <div class="card-body py-3">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1 me-2">
                                <p class="text-muted small mb-1">${escapeHtml(k.label)}</p>
                                <h4 class="mb-1 fw-bold text-${k.color}">${escapeHtml(k.value)}</h4>
                                <small class="text-muted">${escapeHtml(k.sub)}</small>
                            </div>
                            <div class="rounded-circle d-flex align-items-center justify-content-center bg-${k.color} bg-opacity-10"
                                 style="width:42px;height:42px;flex-shrink:0;">
                                <i class="fas ${k.icon} text-${k.color}"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GRÁFICO: PRODUTIVIDADE POR TURMA (barras empilhadas horizontais)
    // ──────────────────────────────────────────────────────────────────────────

    _renderizarGraficoProdutividade(suffix, dados) {
        const canvasId = `chart-vg-prod-${suffix}`;
        this._destroyChart(canvasId);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const isTP = dados.tipoTurma === 'TP';
        const turmas       = dados.turmas.map(t => t.turma);
        const hhPDM        = dados.turmas.map(t => parseFloat(t.hhPDM.toFixed(2)));
        const hhCorr       = dados.turmas.map(t => parseFloat(t.hhCorrelato.toFixed(2)));
        const hhImprod     = dados.turmas.map(t => parseFloat(t.hhImprodutivas.toFixed(2)));

        const labelPDM  = isTP ? 'PDM TPS' : 'PDM Solda';
        const labelCorr = isTP ? 'Correlato TPS' : 'Correlato Solda';

        canvas.height = Math.max(200, turmas.length * 42);

        this._charts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: turmas,
                datasets: [
                    {
                        label: labelPDM,
                        data: hhPDM,
                        backgroundColor: '#1976D2',
                        stack: 'servicos',
                    },
                    {
                        label: labelCorr,
                        data: hhCorr,
                        backgroundColor: '#64B5F6',
                        stack: 'servicos',
                    },
                    {
                        label: 'HI (Improdutivas)',
                        data: hhImprod,
                        backgroundColor: '#EF5350',
                        stack: 'servicos',
                    },
                ],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    datalabels: {
                        display: ctx => ctx.dataset.data[ctx.dataIndex] > 0.5,
                        color: '#fff',
                        font: { size: 10, weight: 'bold' },
                        formatter: v => v > 0 ? v.toFixed(0) : '',
                    },
                },
                scales: {
                    x: { stacked: true, title: { display: true, text: 'HH' } },
                    y: { stacked: true },
                },
            },
            plugins: [ChartDataLabels],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GRÁFICO: EVOLUÇÃO DIÁRIA (linha)
    // ──────────────────────────────────────────────────────────────────────────

    _renderizarGraficoEvolucao(suffix, dados) {
        const canvasId = `chart-vg-evolucao-${suffix}`;
        this._destroyChart(canvasId);
        const canvas = document.getElementById(canvasId);
        if (!canvas || dados.evolucao.length === 0) return;

        const labels    = dados.evolucao.map(e => e.data);
        const hhProd    = dados.evolucao.map(e => parseFloat(e.hhServicos.toFixed(2)));
        const hhImprod  = dados.evolucao.map(e => parseFloat(e.hhImprod.toFixed(2)));

        this._charts[canvasId] = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'HH Produtivo',
                        data: hhProd,
                        borderColor: '#43A047',
                        backgroundColor: 'rgba(67,160,71,0.12)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 3,
                    },
                    {
                        label: 'HH Improdutivo',
                        data: hhImprod,
                        borderColor: '#EF5350',
                        backgroundColor: 'rgba(239,83,80,0.10)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' },
                    datalabels: { display: false },
                },
                scales: {
                    x: { ticks: { maxTicksLimit: 15, maxRotation: 45 } },
                    y: { title: { display: true, text: 'HH' }, beginAtZero: true },
                },
            },
            plugins: [ChartDataLabels],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GRÁFICO: CLASSIFICAÇÃO PDM / CORRELATO (doughnut)
    // ──────────────────────────────────────────────────────────────────────────

    _renderizarGraficoClassificacao(suffix, dados) {
        const canvasId = `chart-vg-class-${suffix}`;
        this._destroyChart(canvasId);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const { totais } = dados;
        const isTP = dados.tipoTurma === 'TP';

        const labels = isTP ? ['PDM TPS', 'Correlato TPS'] : ['PDM Solda', 'Correlato Solda'];
        const values = [
            parseFloat(totais.hhPDM.toFixed(2)),
            parseFloat(totais.hhCorrelato.toFixed(2)),
        ];

        this._charts[canvasId] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#1976D2', '#90CAF9'],
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom' },
                    datalabels: {
                        color: '#fff',
                        font: { size: 12, weight: 'bold' },
                        formatter: (v, ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            return total > 0 ? (v / total * 100).toFixed(1) + '%' : '';
                        },
                    },
                },
            },
            plugins: [ChartDataLabels],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TABELA: TOP SERVIÇOS POR HH
    // ──────────────────────────────────────────────────────────────────────────

    _renderizarTopServicos(containerId, dados, label) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const top15 = dados.servicos.slice(0, 15);
        if (top15.length === 0) {
            el.innerHTML = '<p class="text-muted text-center py-3 small">Nenhum serviço encontrado.</p>';
            return;
        }

        const maxHH = top15[0].hh || 1;
        const isTP  = dados.tipoTurma === 'TP';

        el.innerHTML = `
            <table class="table table-sm table-hover mb-0">
                <thead class="table-light">
                    <tr>
                        <th>Serviço</th>
                        <th class="text-center" style="width:70px;">Tipo</th>
                        <th class="text-end"   style="width:75px;">HH</th>
                        <th class="text-end"   style="width:55px;">Qtd</th>
                        <th class="text-end"   style="width:50px;">Ocorr</th>
                    </tr>
                </thead>
                <tbody>
                    ${top15.map(s => {
                        const isPDM  = s.classificacao === (isTP ? 'PDM_TPS' : 'PDM_SOLDA');
                        const badge  = isPDM
                            ? '<span class="badge bg-primary bg-opacity-75 small">PDM</span>'
                            : '<span class="badge bg-secondary bg-opacity-75 small">Corr</span>';
                        const barPct = (s.hh / maxHH * 100).toFixed(0);
                        return `
                        <tr>
                            <td class="text-truncate" style="max-width:200px; font-size:0.8rem;" title="${escAttr(s.descricao)}">
                                <div style="height:3px;width:${barPct}%;background:${isPDM?'#1976D2':'#64B5F6'};border-radius:2px;margin-bottom:3px;"></div>
                                ${escapeHtml(s.descricao)}
                            </td>
                            <td class="text-center">${badge}</td>
                            <td class="text-end fw-bold small">${s.hh.toFixed(1)}</td>
                            <td class="text-end small">${s.qty.toFixed(1)}</td>
                            <td class="text-end small text-muted">${s.ocorrencias}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GRÁFICO: RANKING DE PERDAS (barras horizontais)
    // ──────────────────────────────────────────────────────────────────────────

    _renderizarGraficoPerdas(suffix, dados) {
        const canvasId = `chart-vg-perdas-${suffix}`;
        this._destroyChart(canvasId);
        const canvas = document.getElementById(canvasId);
        if (!canvas || dados.perdas.length === 0) {
            if (canvas) {
                const parent = canvas.parentElement;
                parent.innerHTML = '<p class="text-muted text-center py-3 small">Nenhuma HI registrada no período.</p>';
            }
            return;
        }

        const top10   = dados.perdas.slice(0, 10);
        const labels  = top10.map(p => p.chave.length > 30 ? p.chave.substring(0, 28) + '…' : p.chave);
        const values  = top10.map(p => parseFloat(p.hh.toFixed(2)));
        const colors  = top10.map((_, i) => `hsl(${0 + i * 12}, 70%, ${45 + i * 2}%)`);

        canvas.height = Math.max(180, top10.length * 35);

        this._charts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'HH perdido',
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 0,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end',
                        align: 'right',
                        color: '#333',
                        font: { size: 11 },
                        formatter: v => v.toFixed(1) + ' HH',
                    },
                },
                scales: {
                    x: { title: { display: true, text: 'HH' }, beginAtZero: true },
                    y: { ticks: { font: { size: 11 } } },
                },
                layout: { padding: { right: 60 } },
            },
            plugins: [ChartDataLabels],
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // RESUMO DE PERDAS (cards KPI)
    // ──────────────────────────────────────────────────────────────────────────

    _renderizarResumoPerdas(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const { totais, perdas } = dados;

        if (perdas.length === 0) {
            el.innerHTML = '<p class="text-muted text-center py-3 small">Nenhuma perda registrada.</p>';
            return;
        }

        const totalHHPerdido = perdas.reduce((a, p) => a + p.hh, 0);
        const hhTotal        = totais.hhServicos + totalHHPerdido;
        const pctPerda       = hhTotal > 0 ? (totalHHPerdido / hhTotal * 100) : 0;
        const maioPerdas     = perdas.slice(0, 3);

        el.innerHTML = `
            <div class="mb-3 p-3 rounded bg-danger bg-opacity-10">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <p class="small text-muted mb-0">Total HH perdido</p>
                        <h4 class="text-danger fw-bold mb-0">${totalHHPerdido.toFixed(1)} HH</h4>
                    </div>
                    <div class="text-end">
                        <p class="small text-muted mb-0">% sobre total</p>
                        <h4 class="text-danger fw-bold mb-0">${pctPerda.toFixed(1)}%</h4>
                    </div>
                </div>
            </div>
            <p class="small text-muted fw-bold mb-2">Top causas:</p>
            ${maioPerdas.map((p, i) => {
                const pct = totalHHPerdido > 0 ? (p.hh / totalHHPerdido * 100) : 0;
                return `
                <div class="mb-2">
                    <div class="d-flex justify-content-between small">
                        <span class="text-truncate me-2" style="max-width:150px;" title="${escAttr(p.chave)}">${escapeHtml(p.chave)}</span>
                        <span class="fw-bold">${p.hh.toFixed(1)} HH</span>
                    </div>
                    <div class="progress" style="height:5px;">
                        <div class="progress-bar bg-danger" style="width:${pct.toFixed(0)}%"></div>
                    </div>
                </div>`;
            }).join('')}
            ${perdas.length > 3 ? `<p class="small text-muted mt-2 mb-0">+ ${perdas.length - 3} outros tipos de perda</p>` : ''}
        `;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ANÁLISE DE "OUTROS"
    // ──────────────────────────────────────────────────────────────────────────

    _renderizarAnaliseOutros(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;

        // Filtrar apenas perdas com chave contendo "Outros" ou tipo vazio
        const outros = dados.perdas.filter(p =>
            p.chave.toLowerCase().includes('outro') ||
            !p.tipo
        );

        // Buscar HIs de tipo "Outros" com suas descrições para sugestão
        // Vamos mostrar uma dica de reclassificação
        const sugestoes = {
            'intersticio':           'Interstício',
            'sem o.s':               'Sem Frente de Serviço',
            'sem os':                'Sem Frente de Serviço',
            'finalizacao':           'Finalização de O.S.',
            'dds':                   'Treinamento / DDS',
            'treinamento':           'Treinamento / DDS',
            'aguardando':            'Aguardando Liberação',
            'falta de material':     'Falta de Material',
            'deslocamento':          'Deslocamento',
        };

        if (outros.length === 0) {
            el.innerHTML = '';
            return;
        }

        el.innerHTML = `
            <div class="col-12">
                <div class="card border-0 shadow-sm border-warning">
                    <div class="card-header bg-warning bg-opacity-10">
                        <h6 class="mb-0 text-warning">
                            <i class="fas fa-lightbulb me-2"></i>
                            Análise de HI "Outros" — Sugestões de Reclassificação
                        </h6>
                    </div>
                    <div class="card-body p-0">
                        <table class="table table-sm table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Tipo / Descrição registrada</th>
                                    <th class="text-end" style="width:80px;">HH</th>
                                    <th class="text-center" style="width:60px;">Ocorr</th>
                                    <th>Sugestão de Categoria</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${outros.map(p => {
                                    const descLower = p.chave.toLowerCase()
                                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                    let sugestao = '—';
                                    for (const [chave, valor] of Object.entries(sugestoes)) {
                                        if (descLower.includes(chave)) { sugestao = valor; break; }
                                    }
                                    return `
                                    <tr>
                                        <td class="small">${escapeHtml(p.chave)}</td>
                                        <td class="text-end small fw-bold">${p.hh.toFixed(1)}</td>
                                        <td class="text-center small text-muted">${p.count}</td>
                                        <td class="small">
                                            ${sugestao !== '—'
                                                ? `<span class="badge bg-success bg-opacity-75">${escapeHtml(sugestao)}</span>`
                                                : `<span class="text-muted">—</span>`
                                            }
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // UTILITÁRIO: DESTRUIR CHART.JS
    // ──────────────────────────────────────────────────────────────────────────

    _destroyChart(canvasId) {
        if (this._charts[canvasId]) {
            try { this._charts[canvasId].destroy(); } catch (_) {}
            delete this._charts[canvasId];
        }
    }
}

// Global singleton
const visaoGeral = new VisaoGeral();
