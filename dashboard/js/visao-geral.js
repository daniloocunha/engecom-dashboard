/**
 * Módulo de Visão Geral — Análise de Produtividade Operacional
 * Fases 1-3: escala, drill-down, insights, qualidade de dados
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

    // ── Classificação ────────────────────────────────────────────────────────

    classificarServicoV2(descricao, tipoTurma) {
        const desc = (descricao || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (tipoTurma === 'TS') {
            return desc.includes('solda alumin') ? 'PDM_SOLDA' : 'CORRELATO_SOLDA';
        }
        const regexPDM = [
            /substitu[ic][ca][oa]o.*dormente/, /dormente.*(concreto|madeira|amv)/,
            /alivio/, /substitu[ic][ca][oa]o.*trilho/, /troca.*trilho/,
            /limp.*lastro/, /restaura[ca][oa]o.*passagem/, /conserva[ca][oa]o.*passagem/,
        ];
        return regexPDM.some(re => re.test(desc)) ? 'PDM_TPS' : 'CORRELATO_TPS';
    }

    // ── Cálculos ─────────────────────────────────────────────────────────────

    _calcularDados(tipoTurma, mes, ano, calc) {
        const turmas    = calc.getTurmasPorTipo(tipoTurma, mes, ano);
        const diasUteis = calc.getDiasUteis(mes, ano);
        const classPDM  = tipoTurma === 'TP' ? 'PDM_TPS'       : 'PDM_SOLDA';
        const classCorr = tipoTurma === 'TP' ? 'CORRELATO_TPS' : 'CORRELATO_SOLDA';

        let totalHHServ = 0, totalHHPDM = 0, totalHHCorr = 0, totalHHImprod = 0;
        const dadosTurmas = [], servicosGlobal = {}, perdasGlobal = {}, evolucaoDiaria = {};
        let rdosSemEfetivo = 0, hisSemHorario = 0, servicosSemCoef = 0;

        turmas.forEach(turmaId => {
            const rdosTurma = calc.filtrarRDOsPorTurma(turmaId, mes, ano);
            if (!rdosTurma.length) return;

            let hhServ = 0, hhPDM = 0, hhCorr = 0;
            const servicosTurma = {}, perdasTurma = {};

            rdosTurma.forEach(rdo => {
                const numRDO   = rdo['Número RDO'] || rdo.numeroRDO || '';
                const dataNorm = FieldHelper.normalizarData(rdo['Data'] || rdo.data || '');
                if (!calc.indices.efetivosPorRDO.has(numRDO)) rdosSemEfetivo++;

                // Serviços
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
                    const unidade = s['Unidade'] || s.unidade || '';
                    [servicosGlobal, servicosTurma].forEach(map => {
                        if (!map[desc]) map[desc] = { hh: 0, qty: 0, ocorrencias: 0, classificacao: cls, unidade };
                        map[desc].hh += hh; map[desc].qty += qty; map[desc].ocorrencias++;
                    });
                });

                // HI
                const efetivo    = calc.indices.efetivosPorRDO.get(numRDO);
                const opDefault  = efetivo ? (parseInt(efetivo['Operadores'] || efetivo.operadores || 0) || 12) : 12;
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
                    [perdasGlobal, perdasTurma].forEach(map => {
                        if (!map[chave]) map[chave] = { hh: 0, count: 0, tipo };
                        map[chave].hh += hh; map[chave].count++;
                    });
                });

                if (dataNorm) {
                    if (!evolucaoDiaria[dataNorm]) evolucaoDiaria[dataNorm] = { hhServicos: 0, hhImprod: 0 };
                    evolucaoDiaria[dataNorm].hhServicos += hhServDia;
                    evolucaoDiaria[dataNorm].hhImprod   += hhHIDia;
                }
            });

            const hhImprodOficial = calc.calcularHHImprodutivas(rdosTurma);
            const toArr = map => Object.entries(map)
                .map(([desc, v]) => ({ descricao: desc, ...v }))
                .sort((a, b) => b.hh - a.hh);
            const perdasArr = map => Object.entries(map)
                .map(([chave, v]) => ({ chave, ...v }))
                .sort((a, b) => b.hh - a.hh);

            dadosTurmas.push({
                turma: turmaId, rdos: rdosTurma,
                numRDOs: rdosTurma.length,
                diasTrabalhados: calc.contarDiasUnicos(rdosTurma),
                diasUteis,
                hhServicos: hhServ, hhPDM, hhCorrelato: hhCorr,
                hhImprodutivas: hhImprodOficial,
                servicos: toArr(servicosTurma),
                perdas:   perdasArr(perdasTurma),
            });

            totalHHServ   += hhServ;
            totalHHPDM    += hhPDM;
            totalHHCorr   += hhCorr;
            totalHHImprod += hhImprodOficial;
        });

        dadosTurmas.sort((a, b) => b.hhServicos - a.hhServicos);

        const toArr = map => Object.entries(map)
            .map(([desc, v]) => ({ descricao: desc, ...v }))
            .sort((a, b) => b.hh - a.hh);
        const perdasArr = map => Object.entries(map)
            .map(([chave, v]) => ({ chave, ...v }))
            .sort((a, b) => b.hh - a.hh);

        const evolucaoArray = Object.entries(evolucaoDiaria)
            .map(([data, v]) => ({ data, ...v }))
            .sort((a, b) => {
                const [da, ma, ya] = a.data.split('/').map(Number);
                const [db, mb, yb] = b.data.split('/').map(Number);
                return new Date(ya, ma-1, da) - new Date(yb, mb-1, db);
            });

        const hhTotal           = totalHHServ + totalHHImprod;
        const taxaProdutividade = hhTotal > 0 ? (totalHHServ / hhTotal) * 100 : 0;
        const n                 = dadosTurmas.length;
        const metaMensal        = tipoTurma === 'TP' ? n * 12 * 8 * diasUteis : n * 8 * diasUteis;
        const percentualMeta    = metaMensal > 0 ? (totalHHServ / metaMensal) * 100 : 0;
        const metaDiaria        = tipoTurma === 'TP' ? 96 * n : 8 * n;

        return {
            tipoTurma,
            turmas:   dadosTurmas,
            servicos: toArr(servicosGlobal),
            perdas:   perdasArr(perdasGlobal),
            evolucao: evolucaoArray,
            qualidade: { rdosSemEfetivo, hisSemHorario, servicosSemCoef },
            totais: {
                hhServicos: totalHHServ, hhPDM: totalHHPDM, hhCorrelato: totalHHCorr,
                hhImprodutivas: totalHHImprod, hhTotal, taxaProdutividade,
                metaMensal, metaDiaria, percentualMeta, diasUteis, classPDM, classCorr,
                numRDOs: dadosTurmas.reduce((a, t) => a + t.numRDOs, 0),
            },
        };
    }

    _transformarHH(hh, t, escala) {
        if (escala === 'por_dia') return t.diasTrabalhados > 0 ? hh / t.diasTrabalhados : 0;
        if (escala === 'por_rdo') return t.numRDOs         > 0 ? hh / t.numRDOs         : 0;
        return hh;
    }

    // ── Ponto de entrada ─────────────────────────────────────────────────────

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
                this._renderizarGraficoProdutividade(suffix, dados);
                this._renderizarGraficoEvolucao(suffix, dados);
                this._renderizarGraficoClassificacao(suffix, dados);
                this._renderizarGraficoPerdas(suffix, dados);
            });
        });
    }

    // ── Sub-aba completa ──────────────────────────────────────────────────────

    _renderizarSubAba(painelId, dados) {
        const painel = document.getElementById(painelId);
        if (!painel) return;
        const suffix = painelId === 'vg-tp' ? 'tp' : 'ts';

        if (!dados.turmas.length) {
            painel.innerHTML = `<div class="text-center text-muted py-5">
                <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                <p class="mb-0">Nenhum dado encontrado para o período selecionado.</p></div>`;
            return;
        }

        painel.innerHTML = `
            <div id="vg-insights-${suffix}" class="mb-4"></div>
            <div class="row g-3 mb-4" id="vg-kpis-${suffix}"></div>

            <!-- Produtividade por Turma -->
            <div class="row mb-4"><div class="col-12">
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <h6 class="mb-0"><i class="fas fa-chart-bar me-2 text-primary"></i>Produtividade por Turma</h6>
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <div id="vg-chip-${suffix}"></div>
                            <div class="btn-group btn-group-sm" id="vg-escala-${suffix}">
                                <button class="btn btn-outline-secondary active" data-escala="total"   onclick="visaoGeral._alterarEscala('${suffix}','total')">HH Total</button>
                                <button class="btn btn-outline-secondary"        data-escala="por_dia" onclick="visaoGeral._alterarEscala('${suffix}','por_dia')">HH/dia</button>
                                <button class="btn btn-outline-secondary"        data-escala="por_rdo" onclick="visaoGeral._alterarEscala('${suffix}','por_rdo')">HH/RDO</button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body" style="position:relative; min-height:200px;">
                        <canvas id="chart-vg-prod-${suffix}"></canvas>
                    </div>
                </div>
            </div></div>

            <!-- Evolução -->
            <div class="row mb-4"><div class="col-12">
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white">
                        <h6 class="mb-0"><i class="fas fa-chart-line me-2 text-success"></i>Evolução Diária de HH</h6>
                    </div>
                    <div class="card-body" style="position:relative; min-height:200px;">
                        <canvas id="chart-vg-evolucao-${suffix}"></canvas>
                    </div>
                </div>
            </div></div>

            <!-- Classificação + Top Serviços -->
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
                        <div class="card-header bg-white d-flex justify-content-between align-items-center">
                            <h6 class="mb-0"><i class="fas fa-list-ul me-2 text-info"></i>Top Serviços por HH</h6>
                            <small class="text-muted fst-italic" id="vg-filtro-label-${suffix}"></small>
                        </div>
                        <div class="card-body p-0" style="max-height:320px; overflow-y:auto;" id="vg-top-servicos-${suffix}"></div>
                    </div>
                </div>
            </div>

            <!-- Perdas -->
            <div class="row mb-4">
                <div class="col-md-7">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bg-white">
                            <h6 class="mb-0"><i class="fas fa-exclamation-triangle me-2 text-danger"></i>Ranking de Perdas (HI por Tipo)</h6>
                        </div>
                        <div class="card-body" style="position:relative; min-height:200px;" id="vg-perdas-container-${suffix}">
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

            <div class="row mb-4" id="vg-outros-container-${suffix}"></div>
            <div id="vg-qualidade-${suffix}" class="mb-4"></div>`;

        this._renderizarInsights(`vg-insights-${suffix}`, dados);
        this._renderizarKPIs(`vg-kpis-${suffix}`, dados);
        this._renderizarGraficoProdutividade(suffix, dados);
        this._renderizarGraficoEvolucao(suffix, dados);
        this._renderizarGraficoClassificacao(suffix, dados);
        this._renderizarTopServicos(`vg-top-servicos-${suffix}`, dados, suffix);
        this._renderizarGraficoPerdas(suffix, dados);
        this._renderizarResumoPerdas(`vg-resumo-perdas-${suffix}`, dados);
        this._renderizarAnaliseOutros(`vg-outros-container-${suffix}`, dados);
        this._renderizarQualidadeDados(`vg-qualidade-${suffix}`, dados);
    }

    // ── Insights do Mês ───────────────────────────────────────────────────────

    _renderizarInsights(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el || !dados.turmas.length) return;
        const { totais, turmas, servicos, perdas } = dados;
        const isTP = dados.tipoTurma === 'TP';
        const melhor   = turmas.reduce((a, b) => a.hhServicos > b.hhServicos ? a : b, turmas[0]);
        const top1serv = servicos[0];
        const top1perd = perdas[0];

        const trunc = (s, n) => s && s.length > n ? s.substring(0, n-1) + '…' : (s || '—');

        const cards = [
            { icon: 'fa-trophy',      color: 'success',
              titulo: 'Melhor Turma',
              valor: trunc(melhor?.turma, 22),
              detalhe: melhor ? `${melhor.hhServicos.toFixed(0)} HH produtivo` : '' },
            { icon: 'fa-exclamation-triangle', color: 'danger',
              titulo: 'Maior Causa de Perda',
              valor: trunc(top1perd?.chave, 22),
              detalhe: top1perd ? `${top1perd.hh.toFixed(1)} HH · ${top1perd.count} registros` : 'Nenhuma' },
            { icon: isTP ? 'fa-hard-hat' : 'fa-fire', color: 'primary',
              titulo: 'Serviço Líder',
              valor: trunc(top1serv?.descricao, 22),
              detalhe: top1serv ? `${top1serv.hh.toFixed(0)} HH · ${top1serv.ocorrencias}x` : '—' },
            { icon: 'fa-bullseye',    color: totais.percentualMeta >= 80 ? 'info' : 'warning',
              titulo: 'Meta Atingida',
              valor: `${totais.percentualMeta.toFixed(1)}%`,
              detalhe: `de ${totais.metaMensal.toFixed(0)} HH no mês` },
        ];

        el.innerHTML = `
            <p class="text-muted small fw-semibold mb-2 text-uppercase" style="letter-spacing:.05em;">
                <i class="fas fa-lightbulb me-1 text-warning"></i>Destaques do Período
            </p>
            <div class="row g-2">
                ${cards.map(c => `
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

    // ── KPIs ─────────────────────────────────────────────────────────────────

    _renderizarKPIs(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const { totais } = dados;
        const isTP = dados.tipoTurma === 'TP';
        const fmt    = n => Number.isFinite(n) ? n.toFixed(1) : '-';
        const fmtPct = n => Number.isFinite(n) ? n.toFixed(1) + '%' : '-%';

        const kpis = isTP ? [
            { label: 'HH Produtivo Total',     value: `${fmt(totais.hhServicos)} HH`,      icon: 'fa-clock',         color: 'success',
              sub: `${fmt(totais.hhPDM)} PDM + ${fmt(totais.hhCorrelato)} Correlato` },
            { label: 'HH Improdutivo Total',    value: `${fmt(totais.hhImprodutivas)} HH`,  icon: 'fa-pause-circle',  color: 'danger',
              sub: `${fmt(totais.hhImprodutivas / (dados.turmas.length||1))} HH/turma` },
            { label: 'Taxa de Produtividade',   value: fmtPct(totais.taxaProdutividade),    icon: 'fa-percentage',    color: totais.taxaProdutividade >= 70 ? 'primary' : 'warning',
              sub: 'Produtivo / (Produtivo + Improdutivo)' },
            { label: 'Meta vs Realizado',        value: fmtPct(totais.percentualMeta),       icon: 'fa-bullseye',      color: totais.percentualMeta >= 80 ? 'info' : 'warning',
              sub: `Meta ${fmt(totais.metaMensal)} HH no mês` },
        ] : [
            { label: 'HH Soldador Total',        value: `${fmt(totais.hhServicos)} HH`,      icon: 'fa-fire',          color: 'warning',
              sub: `${fmt(totais.hhPDM)} PDM + ${fmt(totais.hhCorrelato)} Correlato` },
            { label: 'Soldas Aluminotérmicas',   value: dados.servicos.filter(s => s.classificacao === 'PDM_SOLDA').reduce((a,s) => a+s.qty, 0).toFixed(0),
              icon: 'fa-certificate', color: 'success', sub: 'Quantidade total de soldas PDM' },
            { label: 'HH Improdutivo TS',        value: `${fmt(totais.hhImprodutivas)} HH`,  icon: 'fa-pause-circle',  color: 'danger',
              sub: `${fmt(totais.hhImprodutivas / (dados.turmas.length||1))} HH/turma` },
            { label: 'Taxa de Produtividade',    value: fmtPct(totais.taxaProdutividade),    icon: 'fa-percentage',    color: totais.taxaProdutividade >= 70 ? 'primary' : 'warning',
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

    // ── Gráfico: Produtividade por Turma ──────────────────────────────────────

    _renderizarGraficoProdutividade(suffix, dados) {
        const id = `chart-vg-prod-${suffix}`;
        this._destroyChart(id);
        const canvas = document.getElementById(id);
        if (!canvas) return;

        const escala = this._escala[suffix] || 'total';
        const unit   = { total: 'HH', por_dia: 'HH/dia', por_rdo: 'HH/RDO' }[escala];
        const isTP   = dados.tipoTurma === 'TP';

        const labels  = dados.turmas.map(t => t.turma);
        const hhPDM   = dados.turmas.map(t => +this._transformarHH(t.hhPDM,           t, escala).toFixed(2));
        const hhCorr  = dados.turmas.map(t => +this._transformarHH(t.hhCorrelato,      t, escala).toFixed(2));
        const hhImprod= dados.turmas.map(t => +this._transformarHH(t.hhImprodutivas,   t, escala).toFixed(2));
        const totais  = labels.map((_, i) => hhPDM[i] + hhCorr[i] + hhImprod[i]);

        canvas.height = Math.max(200, labels.length * 48);

        this._charts[id] = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [
                { label: isTP ? 'PDM TPS'       : 'PDM Solda',        data: hhPDM,    backgroundColor: '#1976D2', stack: 'hh' },
                { label: isTP ? 'Correlato TPS'  : 'Correlato Solda', data: hhCorr,   backgroundColor: '#64B5F6', stack: 'hh' },
                { label: 'HI (Improdutivas)',                          data: hhImprod, backgroundColor: '#EF5350', stack: 'hh' },
            ]},
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                onClick: (_, els) => { if (els.length) this._aplicarFiltroTurma(suffix, labels[els[0].index]); },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)} ${unit} (${(ctx.raw/totais[ctx.dataIndex]*100).toFixed(1)}%)`,
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

    // ── Gráfico: Evolução Diária ──────────────────────────────────────────────

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
                { label: `Meta diária (${meta.toFixed(0)} HH)`, data: Array(labels.length).fill(meta),
                  borderColor: '#FF9800', borderDash: [8,4], borderWidth: 2, fill: false, pointRadius: 0, tension: 0 },
            ]},
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: {
                        label: ctx => ctx.datasetIndex === 2 ? ` ${ctx.dataset.label}` : ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)} HH`,
                        afterBody: ctx => {
                            const prod = ctx.find(c => c.datasetIndex === 0)?.raw || 0;
                            const imp  = ctx.find(c => c.datasetIndex === 1)?.raw || 0;
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

    // ── Gráfico: Classificação (doughnut) ─────────────────────────────────────

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
                labels: isTP ? ['PDM TPS', 'Correlato TPS'] : ['PDM Solda', 'Correlato Solda'],
                datasets: [{ data: vals, backgroundColor: ['#1976D2','#90CAF9'], borderWidth: 2 }],
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.raw.toFixed(1)} HH (${total > 0 ? (ctx.raw/total*100).toFixed(1) : 0}%)`,
                    }},
                    datalabels: {
                        color: '#fff', font: { size: 12, weight: 'bold' },
                        formatter: v => total > 0 ? `${(v/total*100).toFixed(1)}%` : '',
                    },
                },
            },
            plugins: [ChartDataLabels],
        });
    }

    // ── Tabela: Top Serviços (ordenável, % coluna, drill-down) ────────────────

    _renderizarTopServicos(containerId, dados, suffix) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const turmaAtiva = this._filtroTurma[suffix];
        const sort       = this._sortServicos[suffix] || { col: 'hh', dir: 'desc' };

        // Se turma ativa, usar serviços daquela turma
        let lista = turmaAtiva
            ? (dados.turmas.find(t => t.turma === turmaAtiva)?.servicos || dados.servicos)
            : dados.servicos;

        const sortFns = {
            hh:          (a,b) => sort.dir==='desc' ? b.hh-a.hh : a.hh-b.hh,
            qty:         (a,b) => sort.dir==='desc' ? b.qty-a.qty : a.qty-b.qty,
            ocorrencias: (a,b) => sort.dir==='desc' ? b.ocorrencias-a.ocorrencias : a.ocorrencias-b.ocorrencias,
        };
        lista = [...lista].sort(sortFns[sort.col] || sortFns.hh).slice(0, 15);

        if (!lista.length) { el.innerHTML = '<p class="text-muted text-center py-3 small">Nenhum serviço encontrado.</p>'; return; }

        const totalHH = lista.reduce((a,s) => a+s.hh, 0) || 1;
        const maxHH   = lista[0].hh || 1;
        const isTP    = dados.tipoTurma === 'TP';
        const suf     = escAttr(suffix);
        const ico     = col => sort.col !== col
            ? '<i class="fas fa-sort text-muted ms-1" style="font-size:.65rem;"></i>'
            : sort.dir === 'desc'
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
                        <th class="text-end" style="width:48px;">%</th>
                        <th class="text-end" style="width:52px;${th}" onclick="visaoGeral._sortTopServicos('${suf}','qty')">Qtd${ico('qty')}</th>
                        <th class="text-end" style="width:52px;${th}" onclick="visaoGeral._sortTopServicos('${suf}','ocorrencias')">Ocorr${ico('ocorrencias')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(s => {
                        const isPDM = s.classificacao === (isTP ? 'PDM_TPS' : 'PDM_SOLDA');
                        const cor   = isPDM ? '#1976D2' : '#90CAF9';
                        const pct   = (s.hh / totalHH * 100).toFixed(1);
                        return `<tr>
                            <td class="text-truncate" style="max-width:190px;font-size:.8rem;" title="${escAttr(s.descricao)}">
                                <div style="height:2px;width:${(s.hh/maxHH*100).toFixed(0)}%;background:${cor};border-radius:2px;margin-bottom:2px;"></div>
                                ${escapeHtml(s.descricao)}
                            </td>
                            <td class="text-center">${isPDM ? '<span class="badge bg-primary bg-opacity-75 small">PDM</span>' : '<span class="badge bg-secondary bg-opacity-75 small">Corr</span>'}</td>
                            <td class="text-end fw-bold small">${s.hh.toFixed(1)}</td>
                            <td class="text-end small text-muted">${pct}%</td>
                            <td class="text-end small">${s.qty.toFixed(1)}</td>
                            <td class="text-end small text-muted">${s.ocorrencias}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    }

    _sortTopServicos(suffix, col) {
        const s = this._sortServicos[suffix] || { col: 'hh', dir: 'desc' };
        this._sortServicos[suffix] = { col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' };
        const dados = suffix === 'tp' ? this._dadosTPS : this._dadosTS;
        if (dados) this._renderizarTopServicos(`vg-top-servicos-${suffix}`, dados, suffix);
    }

    // ── Gráfico: Ranking de Perdas ────────────────────────────────────────────

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

        const top10  = perdas.slice(0, 10);
        const labels = top10.map(p => p.chave.length > 28 ? p.chave.substring(0,26)+'…' : p.chave);
        const vals   = top10.map(p => +p.hh.toFixed(2));
        const totHH  = vals.reduce((a,b) => a+b, 0);
        canvas.height = Math.max(180, top10.length * 36);

        this._charts[id] = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'HH perdido', data: vals, backgroundColor: top10.map((_,i) => `hsl(${i*14},70%,${44+i}%)`), borderWidth: 0 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toFixed(1)} HH (${totHH > 0 ? (ctx.raw/totHH*100).toFixed(1) : 0}% das perdas)` } },
                    datalabels: {
                        anchor: 'end', align: 'right', color: '#333', font: { size: 11 },
                        formatter: v => `${v.toFixed(1)} (${totHH > 0 ? (v/totHH*100).toFixed(0) : 0}%)`,
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

    // ── Resumo de Perdas ──────────────────────────────────────────────────────

    _renderizarResumoPerdas(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const { perdas, totais } = dados;
        if (!perdas.length) { el.innerHTML = '<p class="text-muted text-center py-3 small">Nenhuma perda registrada.</p>'; return; }

        const totPerdas = perdas.reduce((a,p) => a+p.hh, 0);
        const pct       = (totais.hhServicos + totPerdas) > 0 ? (totPerdas / (totais.hhServicos + totPerdas) * 100) : 0;

        el.innerHTML = `
            <div class="mb-3 p-3 rounded bg-danger bg-opacity-10 d-flex justify-content-between align-items-center">
                <div><p class="small text-muted mb-0">Total HH perdido</p><h4 class="text-danger fw-bold mb-0">${totPerdas.toFixed(1)} HH</h4></div>
                <div class="text-end"><p class="small text-muted mb-0">% sobre total</p><h4 class="text-danger fw-bold mb-0">${pct.toFixed(1)}%</h4></div>
            </div>
            <p class="small text-muted fw-bold mb-2">Top causas:</p>
            ${perdas.slice(0,3).map(p => {
                const pp = totPerdas > 0 ? (p.hh / totPerdas * 100) : 0;
                return `<div class="mb-2">
                    <div class="d-flex justify-content-between small">
                        <span class="text-truncate me-2" style="max-width:150px;" title="${escAttr(p.chave)}">${escapeHtml(p.chave)}</span>
                        <span class="fw-bold">${p.hh.toFixed(1)} HH</span>
                    </div>
                    <div class="progress" style="height:5px;"><div class="progress-bar bg-danger" style="width:${pp.toFixed(0)}%"></div></div>
                </div>`;
            }).join('')}
            ${perdas.length > 3 ? `<p class="small text-muted mt-2 mb-0">+ ${perdas.length - 3} outros tipos</p>` : ''}`;
    }

    // ── Análise de "Outros" ───────────────────────────────────────────────────

    _renderizarAnaliseOutros(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const outros = dados.perdas.filter(p => p.chave.toLowerCase().includes('outro') || !p.tipo);
        if (!outros.length) { el.innerHTML = ''; return; }

        const sugestoes = {
            'intersticio': 'Interstício', 'sem o.s': 'Sem Frente de Serviço',
            'sem os': 'Sem Frente de Serviço', 'finalizacao': 'Finalização de O.S.',
            'dds': 'Treinamento / DDS', 'treinamento': 'Treinamento / DDS',
            'aguardando': 'Aguardando Liberação', 'falta de material': 'Falta de Material', 'deslocamento': 'Deslocamento',
        };
        const getSugestao = chave => {
            const k = chave.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
            for (const [pat, val] of Object.entries(sugestoes)) if (k.includes(pat)) return val;
            return '—';
        };

        el.innerHTML = `<div class="col-12"><div class="card border-0 shadow-sm">
            <div class="card-header bg-warning bg-opacity-10">
                <h6 class="mb-0 text-warning"><i class="fas fa-lightbulb me-2"></i>HI "Outros" — Sugestões de Reclassificação</h6>
            </div>
            <div class="card-body p-0">
                <table class="table table-sm table-hover mb-0">
                    <thead class="table-light"><tr><th>Descrição</th><th class="text-end" style="width:80px;">HH</th><th class="text-center" style="width:60px;">Ocorr</th><th>Sugestão</th></tr></thead>
                    <tbody>${outros.map(p => {
                        const s = getSugestao(p.chave);
                        return `<tr>
                            <td class="small">${escapeHtml(p.chave)}</td>
                            <td class="text-end small fw-bold">${p.hh.toFixed(1)}</td>
                            <td class="text-center small text-muted">${p.count}</td>
                            <td class="small">${s !== '—' ? `<span class="badge bg-success bg-opacity-75">${escapeHtml(s)}</span>` : '<span class="text-muted">—</span>'}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
        </div></div>`;
    }

    // ── Qualidade dos Dados ───────────────────────────────────────────────────

    _renderizarQualidadeDados(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const q = dados.qualidade;
        const total = q.rdosSemEfetivo + q.hisSemHorario + q.servicosSemCoef;
        if (!total) { el.innerHTML = ''; return; }

        const items = [
            { label: 'RDOs sem efetivo',       count: q.rdosSemEfetivo,  icon: 'fa-users-slash', color: 'warning' },
            { label: 'HIs sem horário',         count: q.hisSemHorario,   icon: 'fa-clock',       color: 'danger'  },
            { label: 'Serviços sem coeficiente',count: q.servicosSemCoef, icon: 'fa-tools',       color: 'secondary'},
        ].filter(i => i.count > 0);

        el.innerHTML = `<div class="card border-0 shadow-sm">
            <div class="card-header bg-warning bg-opacity-10 d-flex justify-content-between align-items-center">
                <h6 class="mb-0 text-warning"><i class="fas fa-clipboard-check me-2"></i>Qualidade dos Dados</h6>
                <span class="badge bg-warning text-dark">${total} inconsistência${total>1?'s':''}</span>
            </div>
            <div class="card-body">
                <div class="row g-2">
                    ${items.map(i => `<div class="col-auto">
                        <div class="d-flex align-items-center gap-2 p-2 rounded border border-${i.color} border-opacity-25 bg-${i.color} bg-opacity-10">
                            <i class="fas ${i.icon} text-${i.color}"></i>
                            <span class="fw-bold text-${i.color}">${i.count}</span>
                            <span class="small text-muted">${escapeHtml(i.label)}</span>
                        </div>
                    </div>`).join('')}
                </div>
                <p class="small text-muted mt-2 mb-0"><i class="fas fa-info-circle me-1"></i>Inconsistências podem afetar cálculos de HH e médias de efetivo.</p>
            </div>
        </div>`;
    }

    // ── Utilitário ────────────────────────────────────────────────────────────

    _destroyChart(id) {
        if (this._charts[id]) { try { this._charts[id].destroy(); } catch (_) {} delete this._charts[id]; }
    }
}

const visaoGeral = new VisaoGeral();
