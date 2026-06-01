/**
 * Comparação de Períodos — period-comparison.js
 *
 * Modos suportados:
 *   'mes_anterior'           — mês atual vs mês imediatamente anterior
 *   'mesmo_mes_ano_anterior' — mês atual vs mesmo mês do ano passado
 *
 * Métricas: faturamento Engecom/Encogel, HH produtivo, HH improdutivo,
 *           SLA TP (em p.p.), número de turmas TP/TMC/TS.
 */

class PeriodComparison {
    constructor() {
        this._estatisticasAtual = null;
        this._calculadora       = null;
        this._mes               = null;
        this._ano               = null;
        this._modo              = 'mes_anterior';
        this._resultado         = null;
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Calcula a comparação entre o período atual e o período de referência.
     * @param {Object} estatisticasAtual — resultado de calcularEstatisticasConsolidadas() para o período atual
     * @param {CalculadoraMedicao} calculadora — instância com todos os dados carregados
     * @param {number} mes
     * @param {number} ano
     */
    analisar(estatisticasAtual, calculadora, mes, ano) {
        this._estatisticasAtual = estatisticasAtual;
        this._calculadora       = calculadora;
        this._mes               = mes;
        this._ano               = ano;
        this._resultado         = this._calcular(this._modo);
        return this;
    }

    renderizar(containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (!this._resultado) { el.innerHTML = ''; return; }
        el.innerHTML = this._htmlPainel();
    }

    // ── Cálculo ──────────────────────────────────────────────────────────────

    _calcular(modo) {
        if (!this._estatisticasAtual || !this._calculadora) return null;

        const { mes: mesC, ano: anoC } = this._periodoComparacao(modo);
        const statsComp = this._calculadora.calcularEstatisticasConsolidadas(mesC, anoC);

        const metAtual = this._extrairMetricas(this._estatisticasAtual);
        const metComp  = this._extrairMetricas(statsComp);
        const evolucao = this._calcularEvolucao(metAtual, metComp);

        return { modo, mesComp: mesC, anoComp: anoC, atual: metAtual, anterior: metComp, evolucao };
    }

    _periodoComparacao(modo) {
        if (modo === 'mesmo_mes_ano_anterior') return { mes: this._mes, ano: this._ano - 1 };
        return this._mes === 1
            ? { mes: 12, ano: this._ano - 1 }
            : { mes: this._mes - 1, ano: this._ano };
    }

    _extrairMetricas(stats) {
        const tps  = stats?.tps  || [];
        const tmcs = stats?.tmcs || [];
        const tss  = stats?.tss  || [];

        const mediaSLATP    = tps.length > 0
            ? tps.reduce((s, tp) => s + (tp.percentualSLA || 0), 0) / tps.length : 0;
        const hhProdutivo   = tps.reduce((s, tp) => s + (tp.hh?.servicos     || 0), 0);
        const hhImprodutivo = tps.reduce((s, tp) => s + (tp.hh?.improdutivas || 0), 0);
        const hhTotal       = tps.reduce((s, tp) => s + (tp.hh?.total        || 0), 0);

        return {
            faturamentoTotal:    (stats?.totalEngecom || 0) + (stats?.totalEncogel || 0),
            faturamentoEngecom:   stats?.totalEngecom || 0,
            faturamentoEncogel:   stats?.totalEncogel || 0,
            nrTPs:   tps.length,
            nrTMCs:  tmcs.length,
            nrTSs:   tss.length,
            mediaSLATP,
            hhProdutivo,
            hhImprodutivo,
            hhTotal,
        };
    }

    _calcularEvolucao(atual, anterior) {
        const pct = (a, b) => b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100;
        const pp  = (a, b) => (a - b) * 100; // pontos percentuais para SLA
        return {
            faturamentoTotal:    pct(atual.faturamentoTotal,    anterior.faturamentoTotal),
            faturamentoEngecom:  pct(atual.faturamentoEngecom,  anterior.faturamentoEngecom),
            faturamentoEncogel:  pct(atual.faturamentoEncogel,  anterior.faturamentoEncogel),
            nrTPs:               pct(atual.nrTPs,               anterior.nrTPs),
            nrTMCs:              pct(atual.nrTMCs,              anterior.nrTMCs),
            nrTSs:               pct(atual.nrTSs,               anterior.nrTSs),
            mediaSLATApp:        pp (atual.mediaSLATP,          anterior.mediaSLATP),
            hhProdutivo:         pct(atual.hhProdutivo,         anterior.hhProdutivo),
            hhImprodutivo:       pct(atual.hhImprodutivo,       anterior.hhImprodutivo),
            hhTotal:             pct(atual.hhTotal,             anterior.hhTotal),
        };
    }

    // ── Interpretação automática ─────────────────────────────────────────────

    _gerarInterpretacao({ atual, anterior, evolucao }) {
        const temDados = anterior.faturamentoTotal > 0 || anterior.nrTPs > 0;
        if (!temDados) return null;

        const frases = [];

        if (Math.abs(evolucao.faturamentoTotal) >= 1) {
            const dir = evolucao.faturamentoTotal > 0 ? 'cresceu' : 'recuou';
            frases.push(`O faturamento total ${dir} ${Math.abs(evolucao.faturamentoTotal).toFixed(1)}%`);
        }

        if (Math.abs(evolucao.mediaSLATApp) >= 1) {
            const dir = evolucao.mediaSLATApp > 0 ? 'melhorou' : 'caiu';
            frases.push(`o SLA médio das TPs ${dir} ${Math.abs(evolucao.mediaSLATApp).toFixed(1)} p.p.`);
        }

        if (Math.abs(evolucao.hhImprodutivo) >= 5) {
            const dir = evolucao.hhImprodutivo > 0 ? 'aumentaram' : 'reduziram';
            frases.push(`as HH improdutivas ${dir} ${Math.abs(evolucao.hhImprodutivo).toFixed(1)}%`);
        }

        // Só menciona HH produtivo se SLA não foi mencionado (evita redundância)
        if (Math.abs(evolucao.hhProdutivo) >= 5 && Math.abs(evolucao.mediaSLATApp) < 1) {
            const dir = evolucao.hhProdutivo > 0 ? 'cresceu' : 'caiu';
            frases.push(`o HH produtivo ${dir} ${Math.abs(evolucao.hhProdutivo).toFixed(1)}%`);
        }

        if (!frases.length) return 'Sem variações significativas em relação ao período de comparação.';

        return frases
            .map((f, i) => i === 0 ? f[0].toUpperCase() + f.slice(1) : f)
            .join('; ') + '.';
    }

    // ── HTML ─────────────────────────────────────────────────────────────────

    _htmlPainel() {
        const r            = this._resultado;
        const nomeAtual    = this._nomeMes(this._mes, this._ano);
        const nomeComp     = this._nomeMes(r.mesComp, r.anoComp);
        const interpretacao = this._gerarInterpretacao(r);
        const temDados     = r.anterior.faturamentoTotal > 0 || r.anterior.nrTPs > 0;

        return `
        <div class="card border-0 shadow-sm mb-4">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h6 class="mb-0">
                    <i class="fas fa-exchange-alt me-2 text-primary"></i>
                    Comparação — <strong class="text-primary">${escapeHtml(nomeAtual)}</strong>
                    <span class="text-muted small mx-1">vs</span>
                    <span class="text-muted">${escapeHtml(nomeComp)}</span>
                </h6>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-secondary pc-modo-btn ${this._modo === 'mes_anterior' ? 'active' : ''}"
                            onclick="periodComparison._trocarModo('mes_anterior')">
                        Mês anterior
                    </button>
                    <button class="btn btn-outline-secondary pc-modo-btn ${this._modo === 'mesmo_mes_ano_anterior' ? 'active' : ''}"
                            onclick="periodComparison._trocarModo('mesmo_mes_ano_anterior')">
                        Mesmo mês / ano anterior
                    </button>
                </div>
            </div>
            <div class="card-body pb-2">

                ${interpretacao ? `
                <div class="alert alert-light border-start border-primary border-3 d-flex align-items-start gap-2 mb-3 py-2 rounded-1">
                    <i class="fas fa-lightbulb text-primary mt-1 flex-shrink-0"></i>
                    <span class="small">${escapeHtml(interpretacao)}</span>
                </div>` : ''}

                <div class="row g-2 mb-3">
                    ${this._htmlCard('Faturamento',    r.atual.faturamentoTotal,  r.anterior.faturamentoTotal,  r.evolucao.faturamentoTotal,  'fa-dollar-sign',   'primary', true)}
                    ${this._htmlCard('HH Produtivo',   r.atual.hhProdutivo,       r.anterior.hhProdutivo,       r.evolucao.hhProdutivo,       'fa-tools',         'success', false, ' HH')}
                    ${this._htmlCard('HH Improdutivo', r.atual.hhImprodutivo,     r.anterior.hhImprodutivo,     r.evolucao.hhImprodutivo,     'fa-pause-circle',  'warning', false, ' HH', true)}
                    ${this._htmlCardPP('SLA TP (média)', r.atual.mediaSLATP * 100, r.anterior.mediaSLATP * 100, r.evolucao.mediaSLATApp, 'fa-chart-line', 'info')}
                </div>

                <div class="table-responsive">
                    <table class="table table-sm table-hover mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>Métrica</th>
                                <th class="text-end">${escapeHtml(nomeComp)}</th>
                                <th class="text-end">${escapeHtml(nomeAtual)}</th>
                                <th class="text-end" style="width:90px;">Variação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this._linha('Faturamento Total',    r.anterior.faturamentoTotal,   r.atual.faturamentoTotal,   r.evolucao.faturamentoTotal,   true)}
                            ${this._linha('Faturamento Engecom',  r.anterior.faturamentoEngecom, r.atual.faturamentoEngecom, r.evolucao.faturamentoEngecom, true)}
                            ${this._linha('Faturamento Encogel',  r.anterior.faturamentoEncogel, r.atual.faturamentoEncogel, r.evolucao.faturamentoEncogel, true)}
                            ${this._linha('HH Produtivo (TPs)',   r.anterior.hhProdutivo,        r.atual.hhProdutivo,        r.evolucao.hhProdutivo,        false, ' HH')}
                            ${this._linha('HH Improdutivo (TPs)', r.anterior.hhImprodutivo,      r.atual.hhImprodutivo,      r.evolucao.hhImprodutivo,      false, ' HH', true)}
                            ${this._linhaPP('SLA TP (média)',     r.anterior.mediaSLATP * 100,   r.atual.mediaSLATP * 100,   r.evolucao.mediaSLATApp)}
                            ${this._linha('Turmas TP',            r.anterior.nrTPs,              r.atual.nrTPs,              r.evolucao.nrTPs)}
                            ${this._linha('Turmas TMC',           r.anterior.nrTMCs,             r.atual.nrTMCs,             r.evolucao.nrTMCs)}
                            ${this._linha('Turmas TS',            r.anterior.nrTSs,              r.atual.nrTSs,              r.evolucao.nrTSs)}
                        </tbody>
                    </table>
                </div>

                ${!temDados ? `
                <p class="text-center text-muted small mt-2 mb-0">
                    <i class="fas fa-info-circle me-1"></i>
                    Sem dados registrados para ${escapeHtml(nomeComp)} — comparação indisponível.
                </p>` : ''}
            </div>
        </div>`;
    }

    _htmlCard(titulo, valorAtual, valorAnterior, evolucao, icon, cor, isMoeda, sufixo = '', inverterCor = false) {
        const fmt   = v => isMoeda ? formatarMoeda(v) : (v.toFixed(0) + sufixo);
        const pos   = inverterCor ? evolucao <= 0 : evolucao >= 0;
        const cEvol = evolucao === 0 ? 'secondary' : (pos ? 'success' : 'danger');
        const sinal = evolucao > 0 ? '+' : '';
        const icon2 = evolucao > 0 ? 'fa-arrow-trend-up' : (evolucao < 0 ? 'fa-arrow-trend-down' : 'fa-minus');

        return `
        <div class="col-6 col-lg-3">
            <div class="card border-0 bg-light h-100">
                <div class="card-body py-2 px-3">
                    <div class="d-flex justify-content-between align-items-start mb-1">
                        <span class="small text-muted">${titulo}</span>
                        <i class="fas ${icon} text-${cor} small"></i>
                    </div>
                    <div class="fw-bold">${fmt(valorAtual)}</div>
                    <div class="d-flex align-items-center gap-1 mt-1">
                        <span class="badge bg-${cEvol} small">
                            <i class="fas ${icon2} me-1"></i>${sinal}${Math.abs(evolucao).toFixed(1)}%
                        </span>
                        <span class="text-muted" style="font-size:.72rem;">vs ${fmt(valorAnterior)}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    _htmlCardPP(titulo, valorAtual, valorAnterior, evolucaoPP, icon, cor) {
        const pos   = evolucaoPP >= 0;
        const cEvol = evolucaoPP === 0 ? 'secondary' : (pos ? 'success' : 'danger');
        const sinal = evolucaoPP > 0 ? '+' : '';
        const icon2 = evolucaoPP > 0 ? 'fa-arrow-trend-up' : (evolucaoPP < 0 ? 'fa-arrow-trend-down' : 'fa-minus');

        return `
        <div class="col-6 col-lg-3">
            <div class="card border-0 bg-light h-100">
                <div class="card-body py-2 px-3">
                    <div class="d-flex justify-content-between align-items-start mb-1">
                        <span class="small text-muted">${titulo}</span>
                        <i class="fas ${icon} text-${cor} small"></i>
                    </div>
                    <div class="fw-bold">${valorAtual.toFixed(1)}%</div>
                    <div class="d-flex align-items-center gap-1 mt-1">
                        <span class="badge bg-${cEvol} small">
                            <i class="fas ${icon2} me-1"></i>${sinal}${Math.abs(evolucaoPP).toFixed(1)} p.p.
                        </span>
                        <span class="text-muted" style="font-size:.72rem;">vs ${valorAnterior.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    _linha(label, anterior, atual, evolucao, isMoeda = false, sufixo = '', inverterCor = false) {
        const fmt   = v => isMoeda ? formatarMoeda(v) : (v.toFixed(0) + sufixo);
        const pos   = inverterCor ? evolucao <= 0 : evolucao >= 0;
        const cEvol = evolucao === 0 ? 'secondary' : (pos ? 'success' : 'danger');
        const sinal = evolucao > 0 ? '+' : '';
        return `<tr>
            <td class="small">${label}</td>
            <td class="text-end small text-muted">${fmt(anterior)}</td>
            <td class="text-end small fw-semibold">${fmt(atual)}</td>
            <td class="text-end">
                <span class="badge bg-${cEvol} small">${sinal}${Math.abs(evolucao).toFixed(1)}%</span>
            </td>
        </tr>`;
    }

    _linhaPP(label, anterior, atual, evolucaoPP) {
        const pos   = evolucaoPP >= 0;
        const cEvol = evolucaoPP === 0 ? 'secondary' : (pos ? 'success' : 'danger');
        const sinal = evolucaoPP > 0 ? '+' : '';
        return `<tr>
            <td class="small">${label}</td>
            <td class="text-end small text-muted">${anterior.toFixed(1)}%</td>
            <td class="text-end small fw-semibold">${atual.toFixed(1)}%</td>
            <td class="text-end">
                <span class="badge bg-${cEvol} small">${sinal}${Math.abs(evolucaoPP).toFixed(1)} p.p.</span>
            </td>
        </tr>`;
    }

    _nomeMes(mes, ano) {
        const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        return `${nomes[(mes || 1) - 1]}/${String(ano || new Date().getFullYear()).slice(2)}`;
    }

    // ── Ação UI ───────────────────────────────────────────────────────────────

    _trocarModo(modo) {
        this._modo    = modo;
        this._resultado = this._calcular(modo);
        this.renderizar('comparacaoContainer');
    }

    // ── API legada (backward compat) ─────────────────────────────────────────

    calcularPeriodoAnterior(mes, ano) {
        return mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano };
    }

    compararPeriodos(estatisticasAtual, estatisticasAnterior) {
        const m = (stats) => {
            const tps = stats?.tps || [];
            return {
                faturamentoTotal:   (stats?.totalEngecom || 0) + (stats?.totalEncogel || 0),
                faturamentoEngecom:  stats?.totalEngecom || 0,
                faturamentoEncogel:  stats?.totalEncogel || 0,
                totalRDOs: tps.length + (stats?.tmcs?.length || 0) + (stats?.tss?.length || 0),
                mediaSLA:  tps.length ? tps.reduce((s, tp) => s + (tp.percentualSLA || 0), 0) / tps.length : 0,
                hhTotal:   tps.reduce((s, tp) => s + (tp.hh?.total || 0), 0),
            };
        };
        return { temComparacao: !!estatisticasAnterior, atual: m(estatisticasAtual), anterior: estatisticasAnterior ? m(estatisticasAnterior) : null };
    }

    extrairMetricas(stats) { return this.compararPeriodos(stats, null).atual; }

    renderizarComparacao(containerId = 'comparacaoContainer') { this.renderizar(containerId); }
}

if (typeof window !== 'undefined') window.periodComparison = new PeriodComparison();
