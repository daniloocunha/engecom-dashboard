/**
 * Módulo de Visão Geral — Análise de Produtividade Operacional
 *
 * Seções por sub-aba:
 *  1. Destaques do Período (insights)
 *  2. KPIs
 *  3. Composição das Horas   ← NOVO: onde foi a meta?
 *  4. Scorecard comparativo  ← NOVO: semáforo por turma
 *  5. Produtividade por turma (gráfico, toggle escala, drill-down)
 *  6. Evolução diária (linha + meta)
 *  7. Classificação PDM/Correlato + Top Serviços
 *  8. Perdas: Controláveis vs Não Controláveis  ← NOVO
 *  9. HI "Outros" — sugestões de reclassificação
 * 10. Qualidade dos dados
 */

class VisaoGeral {
    constructor() {
        this._charts       = {};
        this._dadosTPS     = null;
        this._dadosTS      = null;
        this._escala       = { tp: 'total', ts: 'total' };
        this._filtroTurma  = { tp: null,    ts: null    };
        this._sortServicos = {
            tp: { col: 'hh', dir: 'desc' },
            ts: { col: 'hh', dir: 'desc' },
        };
    }

    // ── Helpers de classificação ──────────────────────────────────────────────

    classificarServicoV2(descricao, tipoTurma) {
        const d = (descricao || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (tipoTurma === 'TS') {
            return d.includes('solda alumin') ? 'PDM_SOLDA' : 'CORRELATO_SOLDA';
        }
        const re = [
            /substitu[ic][ca][oa]o.*dormente/, /dormente.*(concreto|madeira|amv)/,
            /alivio/, /substitu[ic][ca][oa]o.*trilho/, /troca.*trilho/,
            /limp.*lastro/, /restaura[ca][oa]o.*passagem/, /conserva[ca][oa]o.*passagem/,
        ];
        return re.some(r => r.test(d)) ? 'PDM_TPS' : 'CORRELATO_TPS';
    }

    /** Perdas não controláveis = passagem de trem + chuva */
    _isNaoControlavel(tipo) {
        const t = (tipo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return t.includes('trem') || t.includes('chuva');
    }

    // ── Cálculos ─────────────────────────────────────────────────────────────

    _calcularDados(tipoTurma, mes, ano, calc) {
        const turmas    = calc.getTurmasPorTipo(tipoTurma, mes, ano);
        const diasUteis = calc.getDiasUteis(mes, ano);
        const classPDM  = tipoTurma === 'TP' ? 'PDM_TPS'       : 'PDM_SOLDA';
        const metaDia   = tipoTurma === 'TP' ? 96              : 8;

        let totalHHServ = 0, totalHHPDM = 0, totalHHCorr = 0, totalHHImprod = 0;
        const dadosTurmas = [], servicosGlobal = {}, perdasGlobal = {}, evolucaoDiaria = {};
        let rdosSemEfetivo = 0, hisSemHorario = 0, servicosSemCoef = 0;

        turmas.forEach(turmaId => {
            const rdosTurma = calc.filtrarRDOsPorTurma(turmaId, mes, ano);
            if (!rdosTurma.length) return;

            let hhServ = 0, hhPDM = 0, hhCorr = 0;
            const servicosTurma = {}, perdasTurma = {};
            let diasBateuMeta = 0;

            rdosTurma.forEach(rdo => {
                const numRDO   = rdo['Número RDO'] || rdo.numeroRDO || '';
                const dataNorm = FieldHelper.normalizarData(rdo['Data'] || rdo.data || '');
                if (!calc.indices.efetivosPorRDO.has(numRDO)) rdosSemEfetivo++;

                // ── Serviços ──
                let hhServDia = 0;
                (calc.indices.servicosPorRDO.get(numRDO) || []).forEach(s => {
                    const desc = s['Descrição'] || s.descricao || '';
                    const qty  = parseFloat(s['Quantidade'] || s.quantidade || 0);
                    const coef = parseFloat(s.coeficiente || s.Coeficiente || 0);
                    const hh   = qty * coef;
                    const cls  = this.classificarServicoV2(desc, tipoTurma);
                    if (coef === 0 && (s['É Customizado?'] || s.eCustomizado || '') !== 'SIM') servicosSemCoef++;
                    hhServ += hh; hhServDia += hh;
                    if (cls === classPDM) hhPDM += hh; else hhCorr += hh;
                    const u = s['Unidade'] || s.unidade || '';
                    [servicosGlobal, servicosTurma].forEach(m => {
                        if (!m[desc]) m[desc] = { hh: 0, qty: 0, ocorrencias: 0, classificacao: cls, unidade: u };
                        m[desc].hh += hh; m[desc].qty += qty; m[desc].ocorrencias++;
                    });
                });

                // Dia bateu a meta?
                if (hhServDia >= metaDia) diasBateuMeta++;

                // ── HI ──
                const efetivo   = calc.indices.efetivosPorRDO.get(numRDO);
                const opDefault = efetivo ? (parseInt(efetivo['Operadores'] || efetivo.operadores || 0) || 12) : 12;
                let hhHIDia = 0;
                (calc.indices.hiPorRDO.get(numRDO) || []).forEach(hi => {
                    const tipo   = (hi['Tipo'] || hi.tipo || '').trim();
                    const inicio = hi['Hora Início'] || hi.horaInicio || '';
                    const fim    = hi['Hora Fim']    || hi.horaFim    || '';
                    if (!inicio || !fim) { hisSemHorario++; return; }
                    const pm = t => { const p = (t||'').split(':').map(Number); return (p[0]||0)*60+(p[1]||0); };
                    let s = pm(inicio), e = pm(fim);
                    if (e <= s) e += 1440;
                    const dur = e - s;
                    const tl  = tipo.toLowerCase();
                    if (tl.includes('trem') && dur < 15) return;
                    let op = parseInt(hi['Operadores'] || hi.operadores || 0);
                    if (op <= 0) op = opDefault;
                    let hh = (dur / 60) * op;
                    if (tl.includes('chuva')) hh /= 2;
                    hhHIDia += hh;
                    const chave = tipo || (hi['Descrição'] || hi.descricao || '') || 'Outros';
                    const nc    = this._isNaoControlavel(tipo);
                    [perdasGlobal, perdasTurma].forEach(m => {
                        if (!m[chave]) m[chave] = { hh: 0, count: 0, tipo, controlavel: !nc };
                        m[chave].hh += hh; m[chave].count++;
                    });
                });

                if (dataNorm) {
                    if (!evolucaoDiaria[dataNorm]) evolucaoDiaria[dataNorm] = { hhServicos: 0, hhImprod: 0 };
                    evolucaoDiaria[dataNorm].hhServicos += hhServDia;
                    evolucaoDiaria[dataNorm].hhImprod   += hhHIDia;
                }
            });

            const hhImprodOficial = calc.calcularHHImprodutivas(rdosTurma);
            const toArr  = m => Object.entries(m).map(([d, v]) => ({ descricao: d, ...v })).sort((a, b) => b.hh - a.hh);
            const pArr   = m => Object.entries(m).map(([c, v]) => ({ chave: c,   ...v })).sort((a, b) => b.hh - a.hh);

            dadosTurmas.push({
                turma: turmaId, rdos: rdosTurma,
                numRDOs: rdosTurma.length,
                diasTrabalhados: calc.contarDiasUnicos(rdosTurma),
                diasBateuMeta,
                diasUteis,
                hhServicos: hhServ, hhPDM, hhCorrelato: hhCorr,
                hhImprodutivas: hhImprodOficial,
                servicos: toArr(servicosTurma),
                perdas:   pArr(perdasTurma),
            });

            totalHHServ   += hhServ;
            totalHHPDM    += hhPDM;
            totalHHCorr   += hhCorr;
            totalHHImprod += hhImprodOficial;
        });

        dadosTurmas.sort((a, b) => b.hhServicos - a.hhServicos);

        const toArr = m => Object.entries(m).map(([d, v]) => ({ descricao: d, ...v })).sort((a, b) => b.hh - a.hh);
        const pArr  = m => Object.entries(m).map(([c, v]) => ({ chave: c,   ...v })).sort((a, b) => b.hh - a.hh);

        const evolucaoArray = Object.entries(evolucaoDiaria)
            .map(([data, v]) => ({ data, ...v }))
            .sort((a, b) => {
                const [da, ma, ya] = a.data.split('/').map(Number);
                const [db, mb, yb] = b.data.split('/').map(Number);
                return new Date(ya, ma-1, da) - new Date(yb, mb-1, db);
            });

        const perdasOrdenadas    = pArr(perdasGlobal);
        const hhTotal            = totalHHServ + totalHHImprod;
        const taxaProdutividade  = hhTotal > 0 ? (totalHHServ / hhTotal) * 100 : 0;
        const n                  = dadosTurmas.length;
        const metaMensal         = tipoTurma === 'TP' ? n * 12 * 8 * diasUteis : n * 8 * diasUteis;
        const percentualMeta     = metaMensal > 0 ? (totalHHServ / metaMensal) * 100 : 0;
        const hhNaoTrabalhado    = Math.max(0, metaMensal - totalHHServ - totalHHImprod);
        const hhNC               = perdasOrdenadas.filter(p => !p.controlavel).reduce((a, p) => a + p.hh, 0);
        const hhC                = perdasOrdenadas.filter(p => p.controlavel).reduce((a, p) => a + p.hh, 0);

        return {
            tipoTurma,
            turmas:   dadosTurmas,
            servicos: toArr(servicosGlobal),
            perdas:   perdasOrdenadas,
            evolucao: evolucaoArray,
            qualidade: { rdosSemEfetivo, hisSemHorario, servicosSemCoef },
            totais: {
                hhServicos: totalHHServ, hhPDM: totalHHPDM, hhCorrelato: totalHHCorr,
                hhImprodutivas: totalHHImprod, hhTotal, taxaProdutividade,
                metaMensal, metaDiaria: metaDia * n, percentualMeta,
                hhNaoTrabalhado, hhNC, hhC,
                diasUteis, classPDM,
                numRDOs: dadosTurmas.reduce((a, t) => a + t.numRDOs, 0),
            },
        };
    }

    _transformarHH(hh, t, escala) {
        if (escala === 'por_dia') return t.diasTrabalhados > 0 ? hh / t.diasTrabalhados : 0;
        if (escala === 'por_rdo') return t.numRDOs         > 0 ? hh / t.numRDOs         : 0;
        return hh;
    }

    // ── Ponto de entrada ──────────────────────────────────────────────────────

    renderizar(estatisticas, calculadora, filtros) {
        const { mes, ano } = filtros;
        this._dadosTPS = this._calcularDados('TP', mes, ano, calculadora);
        this._dadosTS  = this._calcularDados('TS', mes, ano, calculadora);
        this._renderizarSubAba('vg-tp', this._dadosTPS);
        this._renderizarSubAba('vg-ts', this._dadosTS);
        this._configurarEventosAbas();
    }

    _configurarEventosAbas() {
        ['btn-vg-tp', 'btn-vg-ts'].forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (!btn || btn._vgListener) return;
            btn._vgListener = true;
            btn.addEventListener('shown.bs.tab', () => {
                const suffix = btnId === 'btn-vg-tp' ? 'tp' : 'ts';
                const dados  = suffix === 'tp' ? this._dadosTPS : this._dadosTS;
                if (!dados) return;
                this._renderizarGraficoComposicao(suffix, dados);
                this._renderizarGraficoProdutividade(suffix, dados);
                this._renderizarGraficoEvolucao(suffix, dados);
                this._renderizarGraficoClassificacao(suffix, dados);
                this._renderizarGraficoPerdas(suffix, dados);
            });
        });
    }

    // ── Layout da sub-aba ─────────────────────────────────────────────────────

    _renderizarSubAba(painelId, dados) {
        const painel = document.getElementById(painelId);
        if (!painel) return;
        const s = painelId === 'vg-tp' ? 'tp' : 'ts';

        if (!dados.turmas.length) {
            painel.innerHTML = `<div class="text-center text-muted py-5">
                <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                <p class="mb-0">Nenhum dado encontrado para o período selecionado.</p></div>`;
            return;
        }

        painel.innerHTML = `
            <!-- 1. Insights -->
            <div id="vg-insights-${s}" class="mb-4"></div>

            <!-- 2. KPIs -->
            <div class="row g-3 mb-4" id="vg-kpis-${s}"></div>

            <!-- 3. Composição das Horas -->
            <div class="row mb-4"><div class="col-12">
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white">
                        <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
                            <h6 class="mb-0"><i class="fas fa-layer-group me-2 text-primary"></i>Composição das Horas — Onde foi a Meta?</h6>
                            <small class="text-muted fst-italic">A barra soma 100% da meta mensal. Blocos cinzas = horas não alocadas (meta não atingida).</small>
                        </div>
                    </div>
                    <div class="card-body" style="position:relative; min-height:90px;">
                        <canvas id="chart-vg-comp-${s}" height="80"></canvas>
                    </div>
                </div>
            </div></div>

            <!-- 4. Scorecard comparativo -->
            <div class="mb-4" id="vg-scorecard-${s}"></div>

            <!-- 5. Produtividade por turma -->
            <div class="row mb-4"><div class="col-12">
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <h6 class="mb-0"><i class="fas fa-chart-bar me-2 text-primary"></i>Produtividade por Turma</h6>
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <div id="vg-chip-${s}"></div>
                            <div class="btn-group btn-group-sm" id="vg-escala-${s}">
                                <button class="btn btn-outline-secondary active" data-escala="total"   onclick="visaoGeral._alterarEscala('${s}','total')">HH Total</button>
                                <button class="btn btn-outline-secondary"        data-escala="por_dia" onclick="visaoGeral._alterarEscala('${s}','por_dia')">HH/dia</button>
                                <button class="btn btn-outline-secondary"        data-escala="por_rdo" onclick="visaoGeral._alterarEscala('${s}','por_rdo')">HH/RDO</button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body" style="position:relative; min-height:200px;">
                        <canvas id="chart-vg-prod-${s}"></canvas>
                    </div>
                </div>
            </div></div>

            <!-- 6. Evolução diária -->
            <div class="row mb-4"><div class="col-12">
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white">
                        <h6 class="mb-0"><i class="fas fa-chart-line me-2 text-success"></i>Evolução Diária de HH</h6>
                    </div>
                    <div class="card-body" style="position:relative; min-height:200px;">
                        <canvas id="chart-vg-evolucao-${s}"></canvas>
                    </div>
                </div>
            </div></div>

            <!-- 7. Classificação + Top Serviços -->
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-white">
                            <h6 class="mb-0"><i class="fas fa-chart-pie me-2 text-warning"></i>Classificação de Atividades</h6>
                        </div>
                        <div class="card-body d-flex align-items-center justify-content-center">
                            <canvas id="chart-vg-class-${s}" style="max-height:260px;"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-8">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-white d-flex justify-content-between align-items-center">
                            <h6 class="mb-0"><i class="fas fa-list-ul me-2 text-info"></i>Top Serviços por HH</h6>
                            <small class="text-muted fst-italic" id="vg-filtro-label-${s}"></small>
                        </div>
                        <div class="card-body p-0" style="max-height:320px; overflow-y:auto;" id="vg-top-servicos-${s}"></div>
                    </div>
                </div>
            </div>

            <!-- 8. Perdas controláveis vs não controláveis -->
            <div class="mb-3">
                <p class="text-muted small fw-semibold text-uppercase mb-1" style="letter-spacing:.05em;">
                    <i class="fas fa-exclamation-triangle me-1 text-danger"></i>Análise de Perdas (HI)
                    <span class="badge bg-secondary bg-opacity-50 small fw-normal ms-1" title="HI = Horas Improdutivas: períodos registrados em que a equipe estava presente mas não realizou serviços produtivos.">O que é HI?</span>
                </p>
                <p class="text-muted mb-2" style="font-size:.75rem;">
                    <i class="fas fa-ban text-danger me-1"></i><strong>Não Controláveis</strong>: passagem de trem e chuva — inerentes à operação ferrroviária &nbsp;·&nbsp;
                    <i class="fas fa-tools text-warning me-1"></i><strong>Controláveis</strong>: fatores que a gestão pode reduzir (deslocamento, aguardando liberação, etc.)
                    &nbsp;·&nbsp; HI Chuva conta como <strong>metade</strong> das horas na fórmula de medição.
                </p>
            </div>
            <div class="row mb-2" id="vg-perdas-split-${s}"></div>
            <div class="row mb-4">
                <div class="col-md-7">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-white">
                            <h6 class="mb-0"><i class="fas fa-ranking-star me-2 text-danger"></i>Ranking Completo de Perdas</h6>
                        </div>
                        <div class="card-body" style="position:relative; min-height:200px;" id="vg-perdas-container-${s}">
                            <canvas id="chart-vg-perdas-${s}"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-5">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-white">
                            <h6 class="mb-0"><i class="fas fa-tachometer-alt me-2 text-danger"></i>Resumo de Perdas</h6>
                        </div>
                        <div class="card-body" id="vg-resumo-perdas-${s}"></div>
                    </div>
                </div>
            </div>

            <!-- 9. Outros + 10. Qualidade -->
            <div class="row mb-4" id="vg-outros-container-${s}"></div>
            <div id="vg-qualidade-${s}" class="mb-4"></div>

            <!-- 11. Mini-glossário -->
            <div class="card border-0 bg-light mb-2">
                <div class="card-body py-2 px-3">
                    <p class="small text-muted mb-1 fw-semibold"><i class="fas fa-info-circle me-1"></i>Glossário rápido</p>
                    <div class="row g-1" style="font-size:.72rem; color:#666;">
                        <div class="col-6 col-md-4"><strong>HH</strong> — Homem·Hora (quantidade × coeficiente)</div>
                        <div class="col-6 col-md-4"><strong>PDM</strong> — Produto Direto de Manutenção (atividade principal de via)</div>
                        <div class="col-6 col-md-4"><strong>Correlato</strong> — Atividade de apoio / manutenção geral</div>
                        <div class="col-6 col-md-4"><strong>HI</strong> — Horas Improdutivas (equipe presente, sem serviço)</div>
                        <div class="col-6 col-md-4"><strong>Meta</strong> — ${s === 'tp' ? '12 operadores × 8h × dias úteis do mês' : '1 soldador × 8h × dias úteis do mês'}</div>
                        <div class="col-6 col-md-4"><strong>Taxa Prod</strong> — HH produtivo ÷ (produtivo + improdutivo)</div>
                    </div>
                </div>
            </div>`;

        // Renderizar todas as seções
        this._renderizarInsights(`vg-insights-${s}`, dados);
        this._renderizarKPIs(`vg-kpis-${s}`, dados);
        this._renderizarGraficoComposicao(s, dados);
        this._renderizarScorecard(`vg-scorecard-${s}`, dados);
        this._renderizarGraficoProdutividade(s, dados);
        this._renderizarGraficoEvolucao(s, dados);
        this._renderizarGraficoClassificacao(s, dados);
        this._renderizarTopServicos(`vg-top-servicos-${s}`, dados, s);
        this._renderizarPerdasSplit(`vg-perdas-split-${s}`, dados, s);
        this._renderizarGraficoPerdas(s, dados);
        this._renderizarResumoPerdas(`vg-resumo-perdas-${s}`, dados, s);
        this._renderizarAnaliseOutros(`vg-outros-container-${s}`, dados);
        this._renderizarQualidadeDados(`vg-qualidade-${s}`, dados);
    }

    // ── 1. Insights ───────────────────────────────────────────────────────────

    _renderizarInsights(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el || !dados.turmas.length) return;
        const { totais, turmas, servicos, perdas } = dados;
        const isTP   = dados.tipoTurma === 'TP';
        const melhor = turmas.reduce((a, b) => a.hhServicos > b.hhServicos ? a : b, turmas[0]);
        const trunc  = (s, n) => s && s.length > n ? s.substring(0, n-1) + '…' : (s || '—');
        const perdaNC = perdas.find(p => !p.controlavel);
        const perdaC  = perdas.find(p => p.controlavel);

        const cards = [
            { icon: 'fa-trophy',      color: 'success',
              titulo: 'Melhor Turma',          valor: trunc(melhor?.turma, 20),
              detalhe: melhor ? `${melhor.hhServicos.toFixed(0)} HH produtivo` : '' },
            { icon: 'fa-ban',         color: 'danger',
              titulo: 'Maior Perda NC',         valor: trunc(perdaNC?.chave, 20),
              detalhe: perdaNC ? `${perdaNC.hh.toFixed(0)} HH — não controlável` : 'Nenhuma' },
            { icon: 'fa-tools',       color: 'warning',
              titulo: 'Maior Perda Controlável',valor: trunc(perdaC?.chave, 20),
              detalhe: perdaC ? `${perdaC.hh.toFixed(0)} HH — pode ser reduzida` : 'Nenhuma' },
            { icon: 'fa-bullseye',    color: totais.percentualMeta >= 80 ? 'info' : 'warning',
              titulo: 'Meta Atingida',          valor: `${totais.percentualMeta.toFixed(1)}%`,
              detalhe: `de ${totais.metaMensal.toFixed(0)} HH no mês` },
        ];

        el.innerHTML = `
            <p class="text-muted small fw-semibold mb-2 text-uppercase" style="letter-spacing:.05em;">
                <i class="fas fa-lightbulb me-1 text-warning"></i>Destaques do Período
            </p>
            <div class="row g-2">${cards.map(c => `
                <div class="col-6 col-md-3">
                    <div class="d-flex align-items-center gap-2 p-2 rounded border border-${c.color} border-opacity-25 bg-${c.color} bg-opacity-10">
                        <i class="fas ${c.icon} text-${c.color} fs-5" style="width:20px;text-align:center;flex-shrink:0;"></i>
                        <div class="overflow-hidden">
                            <p class="mb-0 text-muted" style="font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(c.titulo)}</p>
                            <p class="mb-0 fw-bold text-${c.color}" style="font-size:.88rem;" title="${escAttr(c.valor)}">${escapeHtml(c.valor)}</p>
                            <p class="mb-0 text-muted" style="font-size:.7rem;">${escapeHtml(c.detalhe)}</p>
                        </div>
                    </div>
                </div>`).join('')}
            </div>`;
    }

    // ── 2. KPIs ───────────────────────────────────────────────────────────────

    _renderizarKPIs(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const { totais } = dados;
        const isTP = dados.tipoTurma === 'TP';
        const fmt    = n => Number.isFinite(n) ? n.toFixed(1) : '-';
        const fmtPct = n => Number.isFinite(n) ? n.toFixed(1) + '%' : '-%';

        const kpis = isTP ? [
            { label: 'HH Produtivo Total',   value: `${fmt(totais.hhServicos)} HH`,     icon: 'fa-clock',        color: 'success',
              sub: `${fmt(totais.hhPDM)} PDM + ${fmt(totais.hhCorrelato)} Correlato` },
            { label: 'HH Improdutivo Total', value: `${fmt(totais.hhImprodutivas)} HH`, icon: 'fa-pause-circle', color: 'danger',
              sub: `${fmt(totais.hhNC)} não control. + ${fmt(totais.hhC)} control.` },
            { label: 'Taxa de Produtividade',value: fmtPct(totais.taxaProdutividade),   icon: 'fa-percentage',   color: totais.taxaProdutividade >= 70 ? 'primary' : 'warning',
              sub: 'Produtivo / (Produtivo + Improdutivo)' },
            { label: 'Meta vs Realizado',     value: fmtPct(totais.percentualMeta),      icon: 'fa-bullseye',     color: totais.percentualMeta >= 80 ? 'info' : 'warning',
              sub: `Meta ${fmt(totais.metaMensal)} HH no mês` },
        ] : [
            { label: 'HH Soldador Total',        value: `${fmt(totais.hhServicos)} HH`,     icon: 'fa-fire',         color: 'warning',
              sub: `${fmt(totais.hhPDM)} PDM + ${fmt(totais.hhCorrelato)} Correlato` },
            { label: 'Soldas Aluminotérmicas',   value: dados.servicos.filter(s => s.classificacao === 'PDM_SOLDA').reduce((a,s) => a+s.qty,0).toFixed(0),
              icon: 'fa-certificate', color: 'success', sub: 'Quantidade total de soldas PDM' },
            { label: 'HH Improdutivo TS',        value: `${fmt(totais.hhImprodutivas)} HH`, icon: 'fa-pause-circle', color: 'danger',
              sub: `${fmt(totais.hhImprodutivas / (dados.turmas.length||1))} HH/turma` },
            { label: 'Taxa de Produtividade',    value: fmtPct(totais.taxaProdutividade),   icon: 'fa-percentage',   color: totais.taxaProdutividade >= 70 ? 'primary' : 'warning',
              sub: 'Soldador / (Soldador + Improdutivo)' },
        ];

        el.innerHTML = kpis.map(k => `
            <div class="col-6 col-md-3">
                <div class="card border-0 shadow-sm kpi-card" style="border-left:4px solid var(--bs-${k.color}) !important;">
                    <div class="card-body py-3">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1 me-2">
                                <p class="text-muted small mb-1">${escapeHtml(k.label)}</p>
                                <h4 class="mb-1 fw-bold text-${k.color}">${escapeHtml(k.value)}</h4>
                                <small class="text-muted">${escapeHtml(k.sub)}</small>
                            </div>
                            <div class="rounded-circle d-flex align-items-center justify-content-center bg-${k.color} bg-opacity-10" style="width:42px;height:42px;flex-shrink:0;">
                                <i class="fas ${k.icon} text-${k.color}"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`).join('');
    }

    // ── 3. Composição das Horas ───────────────────────────────────────────────

    _renderizarGraficoComposicao(suffix, dados) {
        const id = `chart-vg-comp-${suffix}`;
        this._destroyChart(id);
        const canvas = document.getElementById(id);
        if (!canvas) return;

        const { totais, perdas } = dados;

        // Separar perdas em NC e C, pegar top 2 de cada + agrupar resto
        const perdasNC = perdas.filter(p => !p.controlavel);
        const perdasC  = perdas.filter(p =>  p.controlavel);

        const datasets = [];

        // Produtivo: PDM + Correlato
        datasets.push({ label: `PDM (${totais.hhPDM.toFixed(0)} HH)`,       data: [+totais.hhPDM.toFixed(1)],       backgroundColor: '#1565C0' });
        datasets.push({ label: `Correlato (${totais.hhCorrelato.toFixed(0)} HH)`, data: [+totais.hhCorrelato.toFixed(1)], backgroundColor: '#42A5F5' });

        // Perdas Não Controláveis
        let acumNC = 0;
        perdasNC.slice(0, 3).forEach((p, i) => {
            datasets.push({ label: `${p.chave} (${p.hh.toFixed(0)} HH)`, data: [+p.hh.toFixed(1)], backgroundColor: ['#B71C1C','#E53935','#EF9A9A'][i] });
            acumNC += p.hh;
        });
        const restoNC = perdasNC.slice(3).reduce((a, p) => a + p.hh, 0);
        if (restoNC > 0) datasets.push({ label: `Outras NC (${restoNC.toFixed(0)} HH)`, data: [+restoNC.toFixed(1)], backgroundColor: '#FFCDD2' });

        // Perdas Controláveis
        let acumC = 0;
        perdasC.slice(0, 3).forEach((p, i) => {
            datasets.push({ label: `${p.chave} (${p.hh.toFixed(0)} HH)`, data: [+p.hh.toFixed(1)], backgroundColor: ['#E65100','#FF7043','#FFAB91'][i] });
            acumC += p.hh;
        });
        const restoC = perdasC.slice(3).reduce((a, p) => a + p.hh, 0);
        if (restoC > 0) datasets.push({ label: `Outras Control. (${restoC.toFixed(0)} HH)`, data: [+restoC.toFixed(1)], backgroundColor: '#FFE0B2' });

        // Gap até a meta (horas não alocadas — meta não atingida)
        if (totais.hhNaoTrabalhado > 0.5) {
            datasets.push({
                label: `Não Trabalhado / Gap (${totais.hhNaoTrabalhado.toFixed(0)} HH)`,
                data: [+totais.hhNaoTrabalhado.toFixed(1)],
                backgroundColor: '#BDBDBD',
            });
        }

        this._charts[id] = new Chart(canvas, {
            type: 'bar',
            data: { labels: [''], datasets },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const v   = ctx.raw;
                                const tot = totais.metaMensal || 1;
                                return ` ${ctx.dataset.label} — ${(v/tot*100).toFixed(1)}% da meta`;
                            }
                        }
                    },
                    datalabels: {
                        display: ctx => ctx.raw > (totais.metaMensal * 0.03),
                        color: ctx => {
                            const bg = ctx.dataset.backgroundColor;
                            const dark = ['#1565C0','#B71C1C','#E53935','#E65100'];
                            return dark.includes(bg) ? '#fff' : '#333';
                        },
                        font: { size: 10, weight: 'bold' },
                        formatter: v => v > 0 ? v.toFixed(0) : '',
                    },
                },
                scales: {
                    x: { stacked: true, display: true, title: { display: true, text: 'HH' },
                         max: Math.ceil(totais.metaMensal * 1.05) },
                    y: { stacked: true, display: false },
                },
            },
            plugins: [ChartDataLabels],
        });
    }

    // ── 4. Scorecard comparativo de turmas ────────────────────────────────────

    _renderizarScorecard(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (dados.turmas.length < 2) { el.innerHTML = ''; return; } // só faz sentido com ≥2 turmas

        const isTP   = dados.tipoTurma === 'TP';
        const metaDia = isTP ? 96 : 8;

        // Funções de semáforo
        const sem = (v, g, y) => {
            if (v >= g) return '<span class="text-success"><i class="fas fa-circle"></i></span>';
            if (v >= y) return '<span class="text-warning"><i class="fas fa-circle"></i></span>';
            return '<span class="text-danger"><i class="fas fa-circle"></i></span>';
        };

        // Calcular métricas por turma
        const linhas = dados.turmas.map(t => {
            const taxaProd   = (t.hhServicos + t.hhImprodutivas) > 0
                ? t.hhServicos / (t.hhServicos + t.hhImprodutivas) * 100 : 0;
            const metaTurma  = isTP ? 12 * 8 * t.diasUteis : 8 * t.diasUteis;
            const pctMeta    = metaTurma > 0 ? t.hhServicos / metaTurma * 100 : 0;
            const hhDia      = t.diasTrabalhados > 0 ? t.hhServicos / t.diasTrabalhados : 0;
            const pctDias    = t.numRDOs > 0 ? t.diasBateuMeta / t.numRDOs * 100 : 0;
            const pctPDM     = t.hhServicos > 0 ? t.hhPDM / t.hhServicos * 100 : 0;
            const pctImprod  = (t.hhServicos + t.hhImprodutivas) > 0
                ? t.hhImprodutivas / (t.hhServicos + t.hhImprodutivas) * 100 : 0;
            return { t, taxaProd, pctMeta, hhDia, pctDias, pctPDM, pctImprod };
        });

        el.innerHTML = `
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h6 class="mb-0"><i class="fas fa-table me-2 text-primary"></i>Scorecard Comparativo de Turmas</h6>
                    <span class="badge bg-secondary bg-opacity-75 small">Global — todas as turmas do período</span>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-sm table-hover mb-0 align-middle">
                            <thead class="table-light">
                                <tr>
                                    <th title="Código identificador da turma">Turma</th>
                                    <th class="text-center" style="background:rgba(25,118,210,.07);" title="Percentual de HH produtivo em relação à meta mensal da turma (${isTP?'12 op × 8h × dias úteis':'1 soldador × 8h × dias úteis'})">% Meta ↑</th>
                                    <th class="text-end" title="HH produtivo médio por dia trabalhado (registros com serviços)">HH/dia</th>
                                    <th class="text-center" title="Taxa de produtividade = HH produtivo ÷ (HH produtivo + HH improdutivo). Indica eficiência do tempo presente.">Taxa Prod</th>
                                    <th class="text-center" title="Número de RDOs (registros diários) em que o HH produtivo atingiu ou superou a meta diária de ${metaDia} HH. Não são 'dias de calendário'.">RDOs ≥ meta</th>
                                    <th class="text-center" title="Percentual de PDM (Produtos Diretos de Manutenção) sobre o HH produtivo total. Maior = mais atividades de alta prioridade.">PDM%</th>
                                    <th class="text-center" title="Percentual de HH improdutivo sobre o total (produtivo + improdutivo). Menor = melhor.">% Improd</th>
                                    <th class="text-end" title="Total de HH produtivo no período">HH Prod</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${linhas.map(({ t, taxaProd, pctMeta, hhDia, pctDias, pctPDM, pctImprod }) => `
                                <tr>
                                    <td class="fw-semibold">${escapeHtml(t.turma)}</td>
                                    <td class="text-center fw-bold" style="background:rgba(25,118,210,.05);">${sem(pctMeta, 80, 50)} <span class="small">${pctMeta.toFixed(1)}%</span></td>
                                    <td class="text-end">${hhDia.toFixed(1)}</td>
                                    <td class="text-center">${sem(taxaProd, 70, 55)} <span class="small">${taxaProd.toFixed(1)}%</span></td>
                                    <td class="text-center">${sem(pctDias, 60, 30)} <span class="small">${t.diasBateuMeta}/${t.numRDOs} <span class="text-muted">(${pctDias.toFixed(0)}%)</span></span></td>
                                    <td class="text-center"><span class="small">${pctPDM.toFixed(0)}%</span></td>
                                    <td class="text-center">${sem(100-pctImprod, 70, 55)} <span class="small">${pctImprod.toFixed(1)}%</span></td>
                                    <td class="text-end small text-muted">${t.hhServicos.toFixed(0)}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="px-3 py-2 border-top bg-light">
                        <small class="text-muted">
                            <i class="fas fa-circle text-success me-1"></i>Bom &nbsp;
                            <i class="fas fa-circle text-warning me-1"></i>Atenção &nbsp;
                            <i class="fas fa-circle text-danger me-1"></i>Crítico &nbsp;·&nbsp;
                            <strong>"RDOs ≥ meta"</strong> = registros diários com HH produtivo ≥ ${metaDia} HH (não são dias corridos) &nbsp;·&nbsp;
                            <strong>"% Meta"</strong> = HH produtivo ÷ meta mensal &nbsp;·&nbsp;
                            Passe o mouse nos cabeçalhos para mais detalhes
                        </small>
                    </div>
                </div>
            </div>`;
    }

    // ── Escala & Drill-down ───────────────────────────────────────────────────

    _alterarEscala(suffix, escala) {
        this._escala[suffix] = escala;
        document.querySelectorAll(`#vg-escala-${suffix} button`).forEach(btn =>
            btn.classList.toggle('active', btn.dataset.escala === escala));
        const dados = suffix === 'tp' ? this._dadosTPS : this._dadosTS;
        if (dados) this._renderizarGraficoProdutividade(suffix, dados);
    }

    _aplicarFiltroTurma(suffix, turmaNome) {
        this._filtroTurma[suffix] = this._filtroTurma[suffix] === turmaNome ? null : turmaNome;
        const dados = suffix === 'tp' ? this._dadosTPS : this._dadosTS;
        if (!dados) return;
        this._renderizarChipFiltro(suffix);
        this._renderizarTopServicos(`vg-top-servicos-${suffix}`, dados, suffix);
        this._renderizarGraficoPerdas(suffix, dados);
        // Atualizar também o split e resumo de perdas com dados da turma filtrada
        this._renderizarPerdasSplit(`vg-perdas-split-${suffix}`, dados, suffix);
        this._renderizarResumoPerdas(`vg-resumo-perdas-${suffix}`, dados, suffix);
        const lbl = document.getElementById(`vg-filtro-label-${suffix}`);
        if (lbl) lbl.textContent = this._filtroTurma[suffix] ? `Filtro: ${this._filtroTurma[suffix]}` : '';
    }

    _renderizarChipFiltro(suffix) {
        const el = document.getElementById(`vg-chip-${suffix}`);
        if (!el) return;
        const t = this._filtroTurma[suffix];
        el.innerHTML = t ? `
            <span class="badge bg-primary d-flex align-items-center gap-1" style="font-size:.8rem;">
                <i class="fas fa-filter" style="font-size:.65rem;"></i>${escapeHtml(t)}
                <button class="btn-close btn-close-white" style="font-size:.5rem;"
                    onclick="visaoGeral._aplicarFiltroTurma('${escAttr(suffix)}', null)"></button>
            </span>` : '';
    }

    // ── 5. Produtividade por turma ────────────────────────────────────────────

    _renderizarGraficoProdutividade(suffix, dados) {
        const id = `chart-vg-prod-${suffix}`;
        this._destroyChart(id);
        const canvas = document.getElementById(id);
        if (!canvas) return;

        const escala = this._escala[suffix] || 'total';
        const unit   = { total: 'HH', por_dia: 'HH/dia', por_rdo: 'HH/RDO' }[escala];
        const isTP   = dados.tipoTurma === 'TP';
        const labels   = dados.turmas.map(t => t.turma);
        const hhPDM    = dados.turmas.map(t => +this._transformarHH(t.hhPDM,          t, escala).toFixed(2));
        const hhCorr   = dados.turmas.map(t => +this._transformarHH(t.hhCorrelato,     t, escala).toFixed(2));
        const hhImprod = dados.turmas.map(t => +this._transformarHH(t.hhImprodutivas,  t, escala).toFixed(2));
        const totais   = labels.map((_, i) => hhPDM[i] + hhCorr[i] + hhImprod[i]);

        canvas.height = Math.max(200, labels.length * 48);

        this._charts[id] = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [
                { label: isTP ? 'PDM TPS'      : 'PDM Solda',       data: hhPDM,    backgroundColor: '#1976D2', stack: 'hh' },
                { label: isTP ? 'Correlato TPS' : 'Correlato Solda', data: hhCorr,   backgroundColor: '#64B5F6', stack: 'hh' },
                { label: 'HI (Improdutivas)',                         data: hhImprod, backgroundColor: '#EF5350', stack: 'hh' },
            ]},
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                onClick: (_, els) => { if (els.length) this._aplicarFiltroTurma(suffix, labels[els[0].index]); },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)} ${unit} (${totais[ctx.dataIndex] > 0 ? (ctx.raw/totais[ctx.dataIndex]*100).toFixed(1) : 0}%)`,
                        footer: ctx => ctx.length ? `Total: ${totais[ctx[0].dataIndex].toFixed(1)} ${unit}` : '',
                    }},
                    datalabels: {
                        display: ctx => ctx.dataset.data[ctx.dataIndex] >= (escala==='total' ? 10 : 0.5),
                        color: '#fff', font: { size: 10, weight: 'bold' },
                        formatter: v => v > 0 ? v.toFixed(escala==='total' ? 0 : 1) : '',
                    },
                },
                scales: {
                    x: { stacked: true, title: { display: true, text: unit } },
                    y: { stacked: true, ticks: { font: { size: 11 } } },
                },
            },
            plugins: [ChartDataLabels],
        });
    }

    // ── 6. Evolução diária ────────────────────────────────────────────────────

    _renderizarGraficoEvolucao(suffix, dados) {
        const id = `chart-vg-evolucao-${suffix}`;
        this._destroyChart(id);
        const canvas = document.getElementById(id);
        if (!canvas || !dados.evolucao.length) return;

        const labels   = dados.evolucao.map(e => e.data);
        const hhProd   = dados.evolucao.map(e => +e.hhServicos.toFixed(2));
        const hhImprod = dados.evolucao.map(e => +e.hhImprod.toFixed(2));
        const meta     = dados.totais.metaDiaria;

        this._charts[id] = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets: [
                { label: 'HH Produtivo',   data: hhProd,   borderColor: '#43A047', backgroundColor: 'rgba(67,160,71,.12)',  fill: true, tension: .3, pointRadius: 3 },
                { label: 'HH Improdutivo', data: hhImprod, borderColor: '#EF5350', backgroundColor: 'rgba(239,83,80,.08)', fill: true, tension: .3, pointRadius: 3 },
                { label: `Meta diária (${meta.toFixed(0)} HH)`,
                  data: Array(labels.length).fill(meta),
                  borderColor: '#FF9800', borderDash: [8,4], borderWidth: 2, fill: false, pointRadius: 0 },
            ]},
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: {
                        label: ctx => ctx.datasetIndex === 2 ? ` ${ctx.dataset.label}` : ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)} HH`,
                        afterBody: ctx => {
                            const prod = ctx.find(c => c.datasetIndex===0)?.raw || 0;
                            const imp  = ctx.find(c => c.datasetIndex===1)?.raw || 0;
                            const tot  = prod + imp;
                            return tot > 0 ? ['', `Total: ${tot.toFixed(1)} HH`, `Produtividade: ${(prod/tot*100).toFixed(1)}%`] : [];
                        },
                    }},
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

    // ── 7a. Classificação (doughnut) ──────────────────────────────────────────

    _renderizarGraficoClassificacao(suffix, dados) {
        const id = `chart-vg-class-${suffix}`;
        this._destroyChart(id);
        const canvas = document.getElementById(id);
        if (!canvas) return;
        const { totais } = dados;
        const isTP  = dados.tipoTurma === 'TP';
        const vals  = [+totais.hhPDM.toFixed(2), +totais.hhCorrelato.toFixed(2)];
        const total = vals.reduce((a,b) => a+b, 0);

        this._charts[id] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: isTP ? ['PDM TPS','Correlato TPS'] : ['PDM Solda','Correlato Solda'],
                datasets: [{ data: vals, backgroundColor: ['#1976D2','#90CAF9'], borderWidth: 2 }],
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw.toFixed(1)} HH (${total > 0 ? (ctx.raw/total*100).toFixed(1) : 0}%)` } },
                    datalabels: {
                        color: '#fff', font: { size: 12, weight: 'bold' },
                        formatter: v => total > 0 ? `${(v/total*100).toFixed(1)}%` : '',
                    },
                },
            },
            plugins: [ChartDataLabels],
        });
    }

    // ── 7b. Top Serviços ──────────────────────────────────────────────────────

    _renderizarTopServicos(containerId, dados, suffix) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const turmaAtiva = this._filtroTurma[suffix];
        const sort       = this._sortServicos[suffix] || { col: 'hh', dir: 'desc' };
        const fullLista  = turmaAtiva
            ? (dados.turmas.find(t => t.turma === turmaAtiva)?.servicos || dados.servicos)
            : dados.servicos;
        const fns = {
            hh:          (a,b) => sort.dir==='desc' ? b.hh-a.hh : a.hh-b.hh,
            qty:         (a,b) => sort.dir==='desc' ? b.qty-a.qty : a.qty-b.qty,
            ocorrencias: (a,b) => sort.dir==='desc' ? b.ocorrencias-a.ocorrencias : a.ocorrencias-b.ocorrencias,
        };
        const lista = [...fullLista].sort(fns[sort.col] || fns.hh).slice(0,15);
        if (!lista.length) { el.innerHTML = '<p class="text-muted text-center py-3 small">Nenhum serviço encontrado.</p>'; return; }

        // % calculado sobre o total REAL do período (não apenas o Top 15)
        const totalHH = fullLista.reduce((a,s) => a+s.hh, 0) || 1;
        const maxHH   = lista[0]?.hh || 1;
        const isTP    = dados.tipoTurma === 'TP';
        const suf     = escAttr(suffix);
        const ico = col => sort.col !== col
            ? '<i class="fas fa-sort text-muted ms-1" style="font-size:.65rem;"></i>'
            : sort.dir==='desc'
                ? '<i class="fas fa-sort-down text-primary ms-1" style="font-size:.65rem;"></i>'
                : '<i class="fas fa-sort-up text-primary ms-1" style="font-size:.65rem;"></i>';
        const th = 'cursor:pointer;user-select:none;white-space:nowrap;';

        el.innerHTML = `
            <table class="table table-sm table-hover mb-0">
                <thead class="table-light" style="position:sticky;top:0;z-index:2;">
                    <tr>
                        <th>Serviço</th>
                        <th class="text-center" style="width:58px;">Tipo</th>
                        <th class="text-end" style="width:68px;${th}" onclick="visaoGeral._sortTopServicos('${suf}','hh')">HH${ico('hh')}</th>
                        <th class="text-end" style="width:52px;" title="Percentual sobre o total de HH produtivo do período (todos os serviços, não apenas os exibidos)">% Total</th>
                        <th class="text-end" style="width:52px;${th}" onclick="visaoGeral._sortTopServicos('${suf}','qty')">Qtd${ico('qty')}</th>
                        <th class="text-end" style="width:52px;${th}" onclick="visaoGeral._sortTopServicos('${suf}','ocorrencias')">Ocorr${ico('ocorrencias')}</th>
                    </tr>
                </thead>
                <tbody>${lista.map(s => {
                    const isPDM = s.classificacao === (isTP ? 'PDM_TPS' : 'PDM_SOLDA');
                    const cor   = isPDM ? '#1976D2' : '#90CAF9';
                    return `<tr>
                        <td class="text-truncate" style="max-width:190px;font-size:.8rem;" title="${escAttr(s.descricao)}">
                            <div style="height:2px;width:${(s.hh/maxHH*100).toFixed(0)}%;background:${cor};border-radius:2px;margin-bottom:2px;"></div>
                            ${escapeHtml(s.descricao)}
                        </td>
                        <td class="text-center">${isPDM ? '<span class="badge bg-primary bg-opacity-75 small">PDM</span>' : '<span class="badge bg-secondary bg-opacity-75 small">Corr</span>'}</td>
                        <td class="text-end fw-bold small">${s.hh.toFixed(1)}</td>
                        <td class="text-end small text-muted">${(s.hh/totalHH*100).toFixed(1)}%</td>
                        <td class="text-end small">${s.qty.toFixed(1)}</td>
                        <td class="text-end small text-muted">${s.ocorrencias}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>`;
    }

    _sortTopServicos(suffix, col) {
        const s = this._sortServicos[suffix] || { col: 'hh', dir: 'desc' };
        this._sortServicos[suffix] = { col, dir: s.col===col && s.dir==='desc' ? 'asc' : 'desc' };
        const dados = suffix==='tp' ? this._dadosTPS : this._dadosTS;
        if (dados) this._renderizarTopServicos(`vg-top-servicos-${suffix}`, dados, suffix);
    }

    // ── 8a. Perdas: Controláveis vs Não Controláveis ──────────────────────────

    _renderizarPerdasSplit(containerId, dados, suffix = null) {
        const el = document.getElementById(containerId);
        if (!el) return;

        // Usar perdas da turma filtrada, quando aplicável
        const turmaAtiva = suffix ? this._filtroTurma[suffix] : null;
        const perdas = turmaAtiva
            ? (dados.turmas.find(t => t.turma === turmaAtiva)?.perdas || dados.perdas)
            : dados.perdas;
        const escopoLabel = turmaAtiva ? turmaAtiva : 'Global';
        const escopoClass = turmaAtiva ? 'bg-primary' : 'bg-secondary';

        if (!perdas.length) { el.innerHTML = ''; return; }

        const nc     = perdas.filter(p => !p.controlavel);
        const c      = perdas.filter(p =>  p.controlavel);
        const hhNC   = nc.reduce((a,p) => a+p.hh, 0);
        const hhC    = c.reduce((a,p) => a+p.hh, 0);
        // % calculado sobre a soma das perdas do escopo atual (NC + C)
        const hhTot  = (hhNC + hhC) || 1;

        const lista = (arr, cor) => arr.slice(0,4).map(p => {
            const pct = (p.hh / hhTot * 100).toFixed(1);
            const bar = (p.hh / (arr[0]?.hh || 1) * 100).toFixed(0);
            return `<div class="mb-2">
                <div class="d-flex justify-content-between align-items-center small mb-1">
                    <span class="text-truncate me-2" style="max-width:160px;" title="${escAttr(p.chave)}">${escapeHtml(p.chave)}</span>
                    <span class="fw-bold text-nowrap">${p.hh.toFixed(0)} HH <span class="text-muted fw-normal">(${pct}%)</span></span>
                </div>
                <div class="progress" style="height:4px;">
                    <div class="progress-bar bg-${cor}" style="width:${bar}%"></div>
                </div>
            </div>`;
        }).join('');

        el.innerHTML = `
            <div class="col-12 mb-2">
                <div class="d-flex align-items-center gap-2">
                    <span class="small fw-semibold text-muted text-uppercase" style="letter-spacing:.05em;">Escopo:</span>
                    <span class="badge ${escopoClass}">${escapeHtml(escopoLabel)}</span>
                    ${turmaAtiva ? `<span class="text-muted small">— Clique na turma no gráfico acima para remover o filtro</span>` : ''}
                </div>
            </div>
            <div class="col-md-6 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-left:4px solid #C62828 !important;">
                    <div class="card-header d-flex justify-content-between align-items-center" style="background:rgba(198,40,40,.07);">
                        <div>
                            <h6 class="mb-0 text-danger"><i class="fas fa-ban me-2"></i>Não Controláveis</h6>
                            <small class="text-muted">Passagem de trem e chuva — operação não pode evitar</small>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-danger fs-6">${hhNC.toFixed(0)} HH</span><br>
                            <small class="text-muted">${(hhNC/hhTot*100).toFixed(1)}% do improdutivo</small>
                        </div>
                    </div>
                    <div class="card-body">${nc.length ? lista(nc, 'danger') : '<p class="text-muted small mb-0">Nenhuma registrada.</p>'}</div>
                </div>
            </div>
            <div class="col-md-6 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-left:4px solid #E65100 !important;">
                    <div class="card-header d-flex justify-content-between align-items-center" style="background:rgba(230,81,0,.07);">
                        <div>
                            <h6 class="mb-0 text-warning"><i class="fas fa-tools me-2"></i>Controláveis</h6>
                            <small class="text-muted">Perdas que a operação pode minimizar</small>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-warning text-dark fs-6">${hhC.toFixed(0)} HH</span><br>
                            <small class="text-muted">${(hhC/hhTot*100).toFixed(1)}% do improdutivo</small>
                        </div>
                    </div>
                    <div class="card-body">${c.length ? lista(c, 'warning') : '<p class="text-muted small mb-0">Nenhuma registrada.</p>'}</div>
                </div>
            </div>`;
    }

    // ── 8b. Ranking de perdas (gráfico) ───────────────────────────────────────

    _renderizarGraficoPerdas(suffix, dados) {
        const id        = `chart-vg-perdas-${suffix}`;
        const container = document.getElementById(`vg-perdas-container-${suffix}`);
        this._destroyChart(id);
        if (!container) return;

        const turmaAtiva = this._filtroTurma[suffix];
        const perdas = turmaAtiva
            ? (dados.turmas.find(t => t.turma === turmaAtiva)?.perdas || dados.perdas)
            : dados.perdas;

        if (!perdas.length) {
            container.innerHTML = '<p class="text-muted text-center py-3 small">Nenhuma HI registrada no período.</p>';
            return;
        }
        if (!document.getElementById(id)) container.innerHTML = `<canvas id="${id}"></canvas>`;
        const canvas = document.getElementById(id);
        if (!canvas) return;

        const top10 = perdas.slice(0,10);
        const labels = top10.map(p => p.chave.length > 28 ? p.chave.substring(0,26)+'…' : p.chave);
        const vals   = top10.map(p => +p.hh.toFixed(2));
        const totHH  = vals.reduce((a,b) => a+b, 0);
        // Colorir: não controlável = vermelho, controlável = laranja
        const colors = top10.map(p => p.controlavel ? '#FF7043' : '#C62828');

        canvas.height = Math.max(180, top10.length * 36);

        this._charts[id] = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'HH perdido', data: vals, backgroundColor: colors, borderWidth: 0 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        label: ctx => ` ${ctx.raw.toFixed(1)} HH (${totHH > 0 ? (ctx.raw/totHH*100).toFixed(1) : 0}% das perdas)`,
                        afterLabel: ctx => top10[ctx.dataIndex].controlavel ? ' ⚠ Controlável' : ' 🚫 Não controlável',
                    }},
                    datalabels: {
                        anchor: 'end', align: 'right', color: '#333', font: { size: 11 },
                        formatter: v => `${v.toFixed(0)} (${totHH > 0 ? (v/totHH*100).toFixed(0) : 0}%)`,
                    },
                },
                scales: {
                    x: { title: { display: true, text: 'HH' }, beginAtZero: true },
                    y: { ticks: { font: { size: 11 } } },
                },
                layout: { padding: { right: 80 } },
            },
            plugins: [ChartDataLabels],
        });
    }

    // ── 8c. Resumo de perdas ──────────────────────────────────────────────────

    _renderizarResumoPerdas(containerId, dados, suffix = null) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const { totais } = dados;

        // Usar perdas da turma filtrada, quando aplicável (consistente com o split)
        const turmaAtiva = suffix ? this._filtroTurma[suffix] : null;
        const perdas = turmaAtiva
            ? (dados.turmas.find(t => t.turma === turmaAtiva)?.perdas || dados.perdas)
            : dados.perdas;

        if (!perdas.length) { el.innerHTML = '<p class="text-muted text-center py-3 small">Nenhuma perda registrada.</p>'; return; }

        // NC e C calculados localmente sobre o escopo atual (global ou turma)
        const hhNC = perdas.filter(p => !p.controlavel).reduce((a,p) => a+p.hh, 0);
        const hhC  = perdas.filter(p =>  p.controlavel).reduce((a,p) => a+p.hh, 0);
        const totPerdas = perdas.reduce((a,p) => a+p.hh, 0);
        const hhServ = turmaAtiva
            ? (dados.turmas.find(t => t.turma === turmaAtiva)?.hhServicos || totais.hhServicos)
            : totais.hhServicos;
        const pct = (hhServ + totPerdas) > 0 ? (totPerdas/(hhServ+totPerdas)*100) : 0;
        el.innerHTML = `
            <div class="mb-3 p-3 rounded d-flex justify-content-between align-items-center" style="background:rgba(239,83,80,.09);">
                <div><p class="small text-muted mb-0">Total HH perdido</p><h4 class="text-danger fw-bold mb-0">${totPerdas.toFixed(1)} HH</h4></div>
                <div class="text-end"><p class="small text-muted mb-0">% sobre total</p><h4 class="text-danger fw-bold mb-0">${pct.toFixed(1)}%</h4></div>
            </div>
            <div class="d-flex gap-2 mb-3">
                <div class="flex-fill p-2 rounded text-center" style="background:rgba(198,40,40,.08);border-left:3px solid #C62828;">
                    <p class="small text-muted mb-0">Não Controla.</p>
                    <strong class="text-danger">${hhNC.toFixed(0)} HH</strong>
                    <p class="small text-muted mb-0">${totPerdas > 0 ? (hhNC/totPerdas*100).toFixed(0) : 0}%</p>
                </div>
                <div class="flex-fill p-2 rounded text-center" style="background:rgba(230,81,0,.08);border-left:3px solid #E65100;">
                    <p class="small text-muted mb-0">Controláveis</p>
                    <strong class="text-warning">${hhC.toFixed(0)} HH</strong>
                    <p class="small text-muted mb-0">${totPerdas > 0 ? (hhC/totPerdas*100).toFixed(0) : 0}%</p>
                </div>
            </div>
            <p class="small text-muted fw-bold mb-2">Top causas:</p>
            ${perdas.slice(0,3).map(p => {
                const pp = totPerdas > 0 ? (p.hh/totPerdas*100) : 0;
                const cor = p.controlavel ? 'warning' : 'danger';
                return `<div class="mb-2">
                    <div class="d-flex justify-content-between small">
                        <span class="text-truncate me-2" style="max-width:140px;" title="${escAttr(p.chave)}">${escapeHtml(p.chave)}</span>
                        <span class="fw-bold">${p.hh.toFixed(0)} HH</span>
                    </div>
                    <div class="progress" style="height:5px;"><div class="progress-bar bg-${cor}" style="width:${pp.toFixed(0)}%"></div></div>
                </div>`;
            }).join('')}
            ${perdas.length > 3 ? `<p class="small text-muted mt-2 mb-0">+ ${perdas.length-3} outros tipos</p>` : ''}`;
    }

    // ── 9. Análise de "Outros" ────────────────────────────────────────────────

    _renderizarAnaliseOutros(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const outros = dados.perdas.filter(p => p.chave.toLowerCase().includes('outro') || !p.tipo);
        if (!outros.length) { el.innerHTML = ''; return; }
        const sug = { 'intersticio':'Interstício','sem o.s':'Sem Frente','sem os':'Sem Frente',
            'finalizacao':'Finalização de O.S.','dds':'Treinamento/DDS','treinamento':'Treinamento/DDS',
            'aguardando':'Aguardando Liberação','falta de material':'Falta de Material','deslocamento':'Deslocamento' };
        const get = c => { const k = c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); for(const[p,v] of Object.entries(sug)) if(k.includes(p)) return v; return '—'; };
        el.innerHTML = `<div class="col-12"><div class="card border-0 shadow-sm">
            <div class="card-header bg-warning bg-opacity-10">
                <h6 class="mb-0 text-warning"><i class="fas fa-lightbulb me-2"></i>HI "Outros" — Sugestões de Reclassificação</h6>
            </div>
            <div class="card-body p-0"><table class="table table-sm table-hover mb-0">
                <thead class="table-light"><tr><th>Descrição</th><th class="text-end" style="width:80px;">HH</th><th class="text-center" style="width:60px;">Ocorr</th><th>Sugestão</th></tr></thead>
                <tbody>${outros.map(p=>{const s=get(p.chave);return`<tr>
                    <td class="small">${escapeHtml(p.chave)}</td>
                    <td class="text-end small fw-bold">${p.hh.toFixed(1)}</td>
                    <td class="text-center small text-muted">${p.count}</td>
                    <td class="small">${s!=='—'?`<span class="badge bg-success bg-opacity-75">${escapeHtml(s)}</span>`:'<span class="text-muted">—</span>'}</td>
                </tr>`;}).join('')}</tbody>
            </table></div>
        </div></div>`;
    }

    // ── 10. Qualidade dos dados ───────────────────────────────────────────────

    _renderizarQualidadeDados(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const q = dados.qualidade;
        const total = q.rdosSemEfetivo + q.hisSemHorario + q.servicosSemCoef;
        if (!total) { el.innerHTML = ''; return; }
        const items = [
            { label: 'RDOs sem efetivo',        count: q.rdosSemEfetivo,  icon: 'fa-users-slash', color: 'warning' },
            { label: 'HIs sem horário',          count: q.hisSemHorario,   icon: 'fa-clock',       color: 'danger'  },
            { label: 'Serviços sem coeficiente', count: q.servicosSemCoef, icon: 'fa-tools',       color: 'secondary'},
        ].filter(i => i.count > 0);
        el.innerHTML = `<div class="card border-0 shadow-sm">
            <div class="card-header bg-warning bg-opacity-10 d-flex justify-content-between align-items-center">
                <h6 class="mb-0 text-warning"><i class="fas fa-clipboard-check me-2"></i>Qualidade dos Dados</h6>
                <span class="badge bg-warning text-dark">${total} inconsistência${total>1?'s':''}</span>
            </div>
            <div class="card-body">
                <div class="row g-2">${items.map(i=>`<div class="col-auto">
                    <div class="d-flex align-items-center gap-2 p-2 rounded border border-${i.color} border-opacity-25 bg-${i.color} bg-opacity-10">
                        <i class="fas ${i.icon} text-${i.color}"></i>
                        <span class="fw-bold text-${i.color}">${i.count}</span>
                        <span class="small text-muted">${escapeHtml(i.label)}</span>
                    </div>
                </div>`).join('')}</div>
                <p class="small text-muted mt-2 mb-0"><i class="fas fa-info-circle me-1"></i>Inconsistências podem afetar cálculos de HH e médias de efetivo.</p>
            </div>
        </div>`;
    }

    // ── Utilitário ────────────────────────────────────────────────────────────

    _destroyChart(id) {
        if (this._charts[id]) { try { this._charts[id].destroy(); } catch(_) {} delete this._charts[id]; }
    }
}

const visaoGeral = new VisaoGeral();
