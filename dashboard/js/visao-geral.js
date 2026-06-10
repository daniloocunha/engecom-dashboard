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
        this._filtroTipoServicos = { tp: null, ts: null };
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

    /** Perdas não controláveis = passagem de trem + chuva. Verifica tipo e descrição. */
    _isNaoControlavel(tipo, descricao = '') {
        const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const t = norm(tipo) + ' ' + norm(descricao);
        return t.includes('trem') || t.includes('chuva');
    }

    // ── Cálculos ─────────────────────────────────────────────────────────────

    _calcularDados(tipoTurma, mes, ano, calc) {
        const turmas    = calc.getTurmasPorTipo(tipoTurma, mes, ano);
        const diasUteis = calc.getDiasUteis(mes, ano);
        const classPDM  = tipoTurma === 'TP' ? 'PDM_TPS'       : 'PDM_SOLDA';
        const metaDia   = tipoTurma === 'TP' ? METAS.META_DIARIA_TP : METAS.META_DIARIA_TS;

        let totalHHServ = 0, totalHHPDM = 0, totalHHCorr = 0, totalHHImprod = 0;
        const dadosTurmas = [], servicosGlobal = {}, perdasGlobal = {}, evolucaoDiaria = {};
        let rdosSemEfetivo = 0, hisSemHorario = 0, servicosSemCoef = 0;
        const listaRDOsSemEfetivo = [], listaHIsSemHorario = [], listaServicosSemCoef = [];

        turmas.forEach(turmaId => {
            const rdosTurma = calc.filtrarRDOsPorTurma(turmaId, mes, ano);
            if (!rdosTurma.length) return;

            let hhServ = 0, hhPDM = 0, hhCorr = 0;
            const servicosTurma = {}, perdasTurma = {}, osPorTurma = {};
            const hhServPorData = new Map();

            const encarregadosSet = new Set();
            let totalOps = 0, countOps = 0;

            rdosTurma.forEach(rdo => {
                const numRDO   = rdo['Número RDO'] || rdo.numeroRDO || '';
                const dataNorm = FieldHelper.normalizarData(rdo['Data'] || rdo.data || '');
                const osNumero = rdo['Número OS'] || rdo.numeroOS || '';
                const enc = rdo['Encarregado'] || rdo.encarregado || '';
                if (enc) encarregadosSet.add(enc);
                const efRDO = calc.indices.efetivosPorRDO.get(numRDO);
                if (efRDO) {
                    const ops = parseInt(efRDO['Operadores'] || efRDO.operadores || 0);
                    if (ops > 0) { totalOps += ops; countOps++; }
                }
                if (!calc.indices.efetivosPorRDO.has(numRDO)) { rdosSemEfetivo++; listaRDOsSemEfetivo.push({ numRDO, data: dataNorm, turma: turmaId }); }

                // Tracking de OS
                const local     = rdo['Local'] || rdo.local || '';
                const kmInicio  = rdo['KM Início'] || rdo.kmInicio || '';
                const kmFim     = rdo['KM Fim'] || rdo.kmFim || '';
                const horaIni   = rdo['Horário Início'] || rdo.horarioInicio || '';
                const horaFim   = rdo['Horário Fim'] || rdo.horarioFim || '';
                const obsRDO    = rdo['Observações'] || rdo.observacoes || '';
                if (osNumero && osNumero !== 'Sem O.S') {
                    if (!osPorTurma[osNumero]) osPorTurma[osNumero] = { os: osNumero, rdos: [], hhProd: 0, hhImpr: 0, datas: [], local, kmInicio, kmFim };
                    osPorTurma[osNumero].rdos.push({ numRDO, data: dataNorm, local, kmInicio, kmFim, horaInicio: horaIni, horaFim: horaFim, obs: obsRDO });
                    if (dataNorm) osPorTurma[osNumero].datas.push(dataNorm);
                }

                // ── Serviços ──
                let hhServDia = 0;
                (calc.indices.servicosPorRDO.get(numRDO) || []).forEach(s => {
                    const desc = s['Descrição'] || s.descricao || '';
                    const qty  = parseFloat(s['Quantidade'] || s.quantidade || 0) || 0;
                    const coef = parseFloat(s.coeficiente || s.Coeficiente || 0) || 0;
                    const hh   = (Number.isFinite(qty) && Number.isFinite(coef)) ? qty * coef : 0;
                    const cls  = this.classificarServicoV2(desc, tipoTurma);
                    if (coef === 0 && (s['É Customizado?'] || s.eCustomizado || '') !== 'SIM') { servicosSemCoef++; listaServicosSemCoef.push({ numRDO, data: dataNorm, turma: turmaId, desc }); }
                    hhServ += hh; hhServDia += hh;
                    if (cls === classPDM) hhPDM += hh; else hhCorr += hh;
                    const u = s['Unidade'] || s.unidade || '';
                    const dataRDO = dataNorm;
                    const osRDO  = rdo['Número OS'] || rdo.numeroOS || '';
                    [servicosGlobal, servicosTurma].forEach(m => {
                        if (!m[desc]) m[desc] = { hh: 0, qty: 0, ocorrencias: 0, classificacao: cls, unidade: u, detalhes: [] };
                        m[desc].hh += hh; m[desc].qty += qty; m[desc].ocorrencias++;
                        m[desc].detalhes.push({ numRDO, os: osRDO, data: dataRDO, qty, hh, turma: turmaId, kmInicio, kmFim });
                    });
                });

                // Acumular HH por data (dias únicos que bateram a meta)
                hhServPorData.set(dataNorm, (hhServPorData.get(dataNorm) || 0) + hhServDia);

                // ── HI ──
                const efetivo   = calc.indices.efetivosPorRDO.get(numRDO);
                const opPadrao  = operadoresPadraoTurma(turmaId); // TP=12, TS=5, TMC=6
                const opDefault = efetivo ? (parseInt(efetivo['Operadores'] || efetivo.operadores || 0) || opPadrao) : opPadrao;
                let hhHIDia = 0;
                (calc.indices.hiPorRDO.get(numRDO) || []).forEach(hi => {
                    const tipo   = (hi['Tipo'] || hi.tipo || '').trim();
                    const inicio = hi['Hora Início'] || hi.horaInicio || '';
                    const fim    = hi['Hora Fim']    || hi.horaFim    || '';
                    if (!inicio || !fim) { hisSemHorario++; listaHIsSemHorario.push({ numRDO, data: dataNorm, turma: turmaId, tipo }); return; }
                    const pm = t => { const p = (t||'').split(':').map(Number); return (p[0]||0)*60+(p[1]||0); };
                    let s = pm(inicio), e = pm(fim);
                    if (e <= s) e += 1440;
                    const dur = e - s;
                    const tl  = tipo.toLowerCase();
                    if (tl.includes('trem') && dur < METAS.MINUTOS_MINIMOS_TREM) return;
                    let op = parseInt(hi['Operadores'] || hi.operadores || 0);
                    if (op <= 0) op = opDefault;
                    let hh = (dur / 60) * op;
                    if (tl.includes('chuva')) hh /= 2;
                    hhHIDia += hh;
                    const hiDesc = hi['Descrição'] || hi.descricao || '';
                    const chave = tipo || hiDesc || 'Outros';
                    const nc    = this._isNaoControlavel(tipo, hiDesc);
                    const reg   = { numRDO, data: dataNorm, turma: turmaId, horaInicio: inicio, horaFim: fim, operadores: op, hh, descricao: hiDesc };
                    [perdasGlobal, perdasTurma].forEach(m => {
                        if (!m[chave]) m[chave] = { hh: 0, count: 0, tipo, controlavel: !nc, registros: [] };
                        m[chave].hh += hh; m[chave].count++;
                        m[chave].registros.push(reg);
                    });
                });

                // Acumular HH por OS
                if (osNumero && osNumero !== 'Sem O.S' && osPorTurma[osNumero]) {
                    osPorTurma[osNumero].hhProd += hhServDia;
                    osPorTurma[osNumero].hhImpr += hhHIDia;
                }

                if (dataNorm) {
                    if (!evolucaoDiaria[dataNorm]) evolucaoDiaria[dataNorm] = { hhServicos: 0, hhImprod: 0 };
                    evolucaoDiaria[dataNorm].hhServicos += hhServDia;
                    evolucaoDiaria[dataNorm].hhImprod   += hhHIDia;
                }
            });

            const diasBateuMeta = [...hhServPorData.values()].filter(hh => hh >= metaDia).length;
            const hhImprodOficial = calc.calcularHHImprodutivas(rdosTurma);
            const toArr  = m => Object.entries(m).map(([d, v]) => ({ descricao: d, ...v })).sort((a, b) => b.hh - a.hh);
            const pArr   = m => Object.entries(m).map(([c, v]) => ({ chave: c,   ...v })).sort((a, b) => b.hh - a.hh);

            // Total de soldas (quantidade de serviços PDM_SOLDA)
            const totalSoldas = Object.entries(servicosTurma)
                .filter(([, v]) => v.classificacao === 'PDM_SOLDA')
                .reduce((a, [, v]) => a + v.qty, 0);

            // Lista de OS ordenada por HH
            const ordensArray = Object.values(osPorTurma).sort((a, b) => (b.hhProd + b.hhImpr) - (a.hhProd + a.hhImpr));

            dadosTurmas.push({
                turma: turmaId, rdos: rdosTurma,
                numRDOs: rdosTurma.length,
                diasTrabalhados: calc.contarDiasUnicos(rdosTurma),
                diasBateuMeta,
                diasUteis,
                encarregados: [...encarregadosSet],
                mediaOperadores: countOps > 0 ? totalOps / countOps : 0,
                hhServicos: hhServ, hhPDM, hhCorrelato: hhCorr,
                hhImprodutivas: hhImprodOficial,
                servicos: toArr(servicosTurma),
                perdas:   pArr(perdasTurma),
                totalSoldas,
                ordens: ordensArray,
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
        const metaMensal         = n * metaDia * diasUteis;
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
            qualidade: { rdosSemEfetivo, hisSemHorario, servicosSemCoef, listaRDOsSemEfetivo, listaHIsSemHorario, listaServicosSemCoef },
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
        this._calculadora  = calculadora;
        this._dadosTPS = this._calcularDados('TP', mes, ano, calculadora);
        this._dadosTS  = this._calcularDados('TS', mes, ano, calculadora);
        this._renderizarSubAba('vg-tp', this._dadosTPS);
        this._renderizarSubAba('vg-ts', this._dadosTS);
        this._configurarEventosAbas();

        // Registrar _vgNavDia SEMPRE (não só quando há problemas de qualidade)
        // Navegar ao dia no calendário a partir do Número RDO
        window._vgNavDia = (numRDO, dataStr, turma) => {
            // Fechar offcanvas (painel lateral de serviços/turmas) se estiver aberto
            const oc = document.getElementById('vg-offcanvas');
            if (oc) bootstrap.Offcanvas.getInstance(oc)?.hide();
            // Fechar modal de Apontamentos HI se estiver aberto
            const hiModal = document.getElementById('vg-hi-detalhe-modal');
            if (hiModal) bootstrap.Modal.getInstance(hiModal)?.hide();

            const tipoTurma = (turma||'').toUpperCase().startsWith('TS') ? 'TS' : 'TP';
            const partes = (dataStr || '').split('/');
            if (partes.length < 3) return;
            const dia = parseInt(partes[0]);
            const mes = parseInt(partes[1]);
            const ano = parseInt(partes[2]);
            if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return;

            const abaId = tipoTurma === 'TS' ? 'nav-calendario-ts-tab' : 'nav-calendario-tp-tab';
            const abaEl = document.getElementById(abaId);
            if (abaEl) abaEl.click();

            setTimeout(() => {
                if (tipoTurma === 'TS' && typeof calendarioTS !== 'undefined') {
                    calendarioTS.mostrarDetalhesDia(turma, dia, mes, ano);
                } else if (typeof calendarioTP !== 'undefined') {
                    calendarioTP.mostrarDetalhesDia(turma, dia, mes, ano);
                }
            }, 350);
        };
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
            <!-- KPIs -->
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
                    <div class="card-body" style="position:relative; height:170px;">
                        <canvas id="chart-vg-comp-${s}"></canvas>
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

            <!-- Banner: Impacto das HI sobre Produção PDM (somente TP) -->
            <div id="vg-banner-dormentes-${s}" class="mb-4"></div>

            <!-- 9. Qualidade -->
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
                        <div class="col-6 col-md-4"><strong>Meta TP</strong> — 12 operadores × 6h × dias úteis = ${METAS.META_DIARIA_TP} HH/dia &nbsp;·&nbsp; <strong>Meta TS</strong> — 1 soldador × 6h × dias úteis = ${METAS.META_DIARIA_TS} HH/dia</div>
                        <div class="col-6 col-md-4"><strong>Taxa Prod</strong> — HH produtivo ÷ (produtivo + improdutivo)</div>
                    </div>
                </div>
            </div>`;

        // Renderizar todas as seções
        this._renderizarKPIs(`vg-kpis-${s}`, dados);
        this._renderizarGraficoComposicao(s, dados);
        this._renderizarScorecard(`vg-scorecard-${s}`, dados);
        this._renderizarGraficoProdutividade(s, dados);
        this._renderizarGraficoClassificacao(s, dados);
        this._renderizarTopServicos(`vg-top-servicos-${s}`, dados, s);
        this._renderizarPerdasSplit(`vg-perdas-split-${s}`, dados, s);
        this._renderizarGraficoPerdas(s, dados);
        this._renderizarResumoPerdas(`vg-resumo-perdas-${s}`, dados, s);
        this._renderizarBannerDormentes(`vg-banner-dormentes-${s}`, dados);
        this._renderizarQualidadeDados(`vg-qualidade-${s}`, dados);
    }

    // ── 1. Insights ───────────────────────────────────────────────────────────

    // ── 2. KPIs ───────────────────────────────────────────────────────────────

    _renderizarKPIs(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const { totais } = dados;
        const isTP = dados.tipoTurma === 'TP';
        const fmt    = n => Number.isFinite(n) ? n.toFixed(1) : '-';
        const fmtPct = n => Number.isFinite(n) ? n.toFixed(1) + '%' : '-%';

        const kpis = isTP ? [
            { label: 'HH Produtivo Total',        value: `${fmt(totais.hhServicos)} HH`,     icon: 'fa-clock',        color: 'success',
              sub: `${fmt(totais.hhPDM)} PDM + ${fmt(totais.hhCorrelato)} Correlato` },
            { label: 'HH Improdutivo Total',      value: `${fmt(totais.hhImprodutivas)} HH`, icon: 'fa-pause-circle', color: 'danger',
              sub: `${fmt(totais.hhNC)} não control. + ${fmt(totais.hhC)} control.` },
            { label: 'Total de Horas Entregues',  value: `${fmt(totais.hhTotal)} HH`,        icon: 'fa-layer-group',  color: 'info',
              sub: 'Produtivo + Improdutivo' },
            { label: 'Meta vs Realizado',          value: fmtPct(totais.percentualMeta),      icon: 'fa-bullseye',     color: totais.percentualMeta >= 80 ? 'info' : 'warning',
              sub: `Meta ${fmt(totais.metaMensal)} HH no mês` },
        ] : [
            { label: 'HH Soldador Total',         value: `${fmt(totais.hhServicos)} HH`,     icon: 'fa-fire',         color: 'warning',
              sub: `${fmt(totais.hhPDM)} PDM + ${fmt(totais.hhCorrelato)} Correlato` },
            { label: 'Soldas Aluminotérmicas',    value: dados.servicos.filter(s => s.classificacao === 'PDM_SOLDA').reduce((a,s) => a+s.qty,0).toFixed(0),
              icon: 'fa-certificate', color: 'success', sub: 'Quantidade total de soldas PDM' },
            { label: 'HH Improdutivo TS',         value: `${fmt(totais.hhImprodutivas)} HH`, icon: 'fa-pause-circle', color: 'danger',
              sub: `${fmt(totais.hhImprodutivas / (dados.turmas.length||1))} HH/turma` },
            { label: 'Total de Horas Entregues',  value: `${fmt(totais.hhTotal)} HH`,        icon: 'fa-layer-group',  color: 'info',
              sub: 'Soldador + Improdutivo' },
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

    // ── VG-05: Banner HI → Dormentes ─────────────────────────────────────────

    _renderizarBannerDormentes(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        // Só exibir para TP (dormentes são atividade TP)
        if (dados.tipoTurma !== 'TP' || !dados.totais.hhImprodutivas || dados.totais.hhImprodutivas <= 0) {
            el.innerHTML = '';
            return;
        }
        const COEF_DORMENTE = 0.81;
        const hhImpr = dados.totais.hhImprodutivas;
        const dormentes = hhImpr / COEF_DORMENTE;

        el.innerHTML = `
            <div class="card border-0 shadow-sm" style="border-left:4px solid #FF9800 !important; background:linear-gradient(135deg, #FFF3E0, #FFFFFF);">
                <div class="card-body py-3">
                    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div class="d-flex align-items-center gap-3">
                            <div class="rounded-circle d-flex align-items-center justify-content-center bg-warning bg-opacity-25" style="width:48px;height:48px;flex-shrink:0;">
                                <i class="fas fa-minus-circle text-warning fs-5"></i>
                            </div>
                            <div>
                                <p class="mb-0 small text-muted fw-semibold text-uppercase" style="letter-spacing:.04em;">Impacto das HI sobre Produção PDM</p>
                                <p class="mb-0 fw-bold text-warning" style="font-size:1.1rem;">
                                    ${hhImpr.toFixed(1)} HH improdutivas = <span class="text-danger">${dormentes.toFixed(0)} dormentes</span> que deixaram de ser trocados
                                </p>
                            </div>
                        </div>
                        <div class="text-end">
                            <p class="mb-0 small text-muted">Fórmula: HH ÷ ${COEF_DORMENTE} (coef. dormente)</p>
                            <p class="mb-0 small text-muted">${hhImpr.toFixed(1)} ÷ ${COEF_DORMENTE} = ${dormentes.toFixed(1)} dormentes</p>
                        </div>
                    </div>
                </div>
            </div>`;
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

        datasets.forEach(ds => { ds.barThickness = 60; });

        const metaComposicao = totais.metaMensal || 0;
        this._charts[id] = new Chart(canvas, {
            type: 'bar',
            data: { labels: [''], datasets },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 12 } } },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const v   = ctx.raw;
                                const tot = metaComposicao || 1;
                                return ` ${ctx.dataset.label} — ${(v/tot*100).toFixed(1)}% da meta`;
                            }
                        }
                    },
                    datalabels: {
                        display: ctx => ctx.raw > (metaComposicao * 0.03),
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
                         max: Math.ceil(Math.max(metaComposicao, totais.hhServicos + totais.hhImprodutivas) * 1.05) },
                    y: { stacked: true, display: false },
                },
            },
            plugins: [ChartDataLabels, {
                id: 'metaLineComp',
                afterDraw: chart => {
                    if (!metaComposicao) return;
                    const { ctx, chartArea, scales: { x } } = chart;
                    const xPx = x.getPixelForValue(metaComposicao);
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(xPx, chartArea.top);
                    ctx.lineTo(xPx, chartArea.bottom);
                    ctx.strokeStyle = '#dc3545';
                    ctx.lineWidth   = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle  = '#dc3545';
                    ctx.font       = 'bold 10px sans-serif';
                    ctx.textAlign  = 'center';
                    ctx.fillText('META', xPx, chartArea.top - 4);
                    ctx.restore();
                }
            }],
        });
    }

    // ── 4. Scorecard comparativo de turmas ────────────────────────────────────

    _renderizarScorecard(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (dados.turmas.length < 2) { el.innerHTML = ''; return; } // só faz sentido com ≥2 turmas

        const isTP        = dados.tipoTurma === 'TP';
        const metaDia     = isTP ? METAS.META_DIARIA_TP : METAS.META_DIARIA_TS;
        const painelSuffix = containerId.endsWith('-tp') ? 'tp' : 'ts';

        // Funções de semáforo
        const sem = (v, g, y) => {
            if (v >= g) return '<span class="text-success"><i class="fas fa-circle"></i></span>';
            if (v >= y) return '<span class="text-warning"><i class="fas fa-circle"></i></span>';
            return '<span class="text-danger"><i class="fas fa-circle"></i></span>';
        };

        // Calcular métricas por turma
        const linhas = dados.turmas.map(t => {
            const hhEntregues = t.hhServicos + t.hhImprodutivas;
            const metaTurma   = metaDia * t.diasUteis;
            const pctMeta     = metaTurma > 0 ? hhEntregues / metaTurma * 100 : 0;
            const hhDia       = t.diasTrabalhados > 0 ? t.hhServicos / t.diasTrabalhados : 0;
            const pctDias     = t.diasTrabalhados > 0 ? t.diasBateuMeta / t.diasTrabalhados * 100 : 0;
            const pctPDM      = t.hhServicos > 0 ? t.hhPDM / t.hhServicos * 100 : 0;
            const pctImprod   = hhEntregues > 0 ? t.hhImprodutivas / hhEntregues * 100 : 0;
            const totalSoldas = t.totalSoldas || 0;
            return { t, hhEntregues, pctMeta, hhDia, pctDias, pctPDM, pctImprod, totalSoldas };
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
                                    <th class="text-center" style="background:rgba(25,118,210,.07);" title="(HH Produtivo + HH Improdutivo) ÷ meta mensal da turma (${isTP?'12 op × 6h × dias úteis':'1 soldador × 6h × dias úteis'})">% Meta ↑</th>
                                    <th class="text-end" title="HH produtivo médio por dia trabalhado (registros com serviços)">HH/dia</th>
                                    <th class="text-center" title="Total de HH entregues = HH Produtivo + HH Improdutivo">Total Entregues</th>
                                    <th class="text-center" title="Número de dias em que o HH produtivo atingiu ou superou a meta diária de ${metaDia} HH.">Dias ≥ META</th>
                                    <th class="text-center" title="Percentual de PDM (Produtos Diretos de Manutenção) sobre o HH produtivo total. Maior = mais atividades de alta prioridade.">PDM%</th>
                                    <th class="text-center" title="Percentual de HH improdutivo sobre o total (produtivo + improdutivo). Menor = melhor.">% Improd</th>
                                    ${!isTP ? '<th class="text-center" title="Total de soldas realizadas no mês (meta: 30/mês)">Soldas</th>' : ''}
                                    <th class="text-end" title="Total de HH produtivo no período">HH Prod</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${linhas.map(({ t, hhEntregues, pctMeta, hhDia, pctDias, pctPDM, pctImprod, totalSoldas }) => `
                                <tr style="cursor:pointer;" onclick="visaoGeral._abrirDetalhesTurma('${escAttr(t.turma)}', '${escAttr(painelSuffix)}')">
                                    <td class="fw-semibold text-primary text-decoration-underline" style="cursor:pointer;">${escapeHtml(t.turma)}<i class="fas fa-external-link-alt ms-1" style="font-size:.6rem; opacity:.5;"></i></td>
                                    <td class="text-center fw-bold" style="background:rgba(25,118,210,.05);">${sem(pctMeta, 80, 50)} <span class="small">${pctMeta.toFixed(1)}%</span></td>
                                    <td class="text-end">${hhDia.toFixed(1)}</td>
                                    <td class="text-center fw-semibold"><span class="small">${hhEntregues.toFixed(0)} HH</span></td>
                                    <td class="text-center">${sem(pctDias, 60, 30)} <span class="small">${t.diasBateuMeta}/${t.diasTrabalhados} <span class="text-muted">(${pctDias.toFixed(0)}%)</span></span></td>
                                    <td class="text-center"><span class="small">${pctPDM.toFixed(0)}%</span></td>
                                    <td class="text-center">${sem(100-pctImprod, 70, 55)} <span class="small">${pctImprod.toFixed(1)}%</span></td>
                                    ${!isTP ? `<td class="text-center">${sem(totalSoldas, 30, 20)} <span class="small fw-bold">${totalSoldas.toFixed(0)}</span></td>` : ''}
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
                            <strong>"Dias ≥ META"</strong> = dias com HH produtivo ≥ ${metaDia} HH &nbsp;·&nbsp;
                            <strong>"% Meta"</strong> = (HH Produtivo + HH Improdutivo) ÷ meta mensal (${isTP ? '12 op × 6h' : '1 soldador × 6h'} × dias úteis) &nbsp;·&nbsp;
                            <i class="fas fa-hand-pointer text-primary me-1"></i>Clique em uma turma para ver detalhes completos
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
        this._renderizarGraficoClassificacao(suffix, dados);
        this._renderizarGraficoPerdas(suffix, dados);
        // Atualizar também o split e resumo de perdas com dados da turma filtrada
        this._renderizarPerdasSplit(`vg-perdas-split-${suffix}`, dados, suffix);
        this._renderizarResumoPerdas(`vg-resumo-perdas-${suffix}`, dados, suffix);
        this._renderizarBannerDormentes(`vg-banner-dormentes-${suffix}`, dados);
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

        const chartH = Math.max(300, labels.length * 80);
        canvas.parentElement.style.height = `${chartH}px`;
        const metaDia = isTP ? METAS.META_DIARIA_TP : METAS.META_DIARIA_TS;

        this._charts[id] = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [
                { label: isTP ? 'PDM TPS'       : 'PDM Solda',       data: hhPDM,    backgroundColor: '#1976D2', stack: 'hh', barThickness: 32 },
                { label: isTP ? 'Correlato TPS' : 'Correlato Solda', data: hhCorr,   backgroundColor: '#64B5F6', stack: 'hh', barThickness: 32 },
                { label: 'HI (Improdutivas)',                          data: hhImprod, backgroundColor: '#EF5350', stack: 'hh', barThickness: 32 },
            ]},
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                onClick: (_, els) => { if (els.length) this._aplicarFiltroTurma(suffix, labels[els[0].index]); },
                plugins: {
                    legend: { position: 'top', labels: { font: { size: 13 } } },
                    tooltip: { callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)} ${unit} (${totais[ctx.dataIndex] > 0 ? (ctx.raw/totais[ctx.dataIndex]*100).toFixed(1) : 0}%)`,
                        footer: ctx => ctx.length ? `Total: ${totais[ctx[0].dataIndex].toFixed(1)} ${unit}` : '',
                    }},
                    datalabels: {
                        display: ctx => ctx.dataset.data[ctx.dataIndex] >= (escala==='total' ? 10 : 0.5),
                        color: '#fff', font: { size: 11, weight: 'bold' },
                        formatter: v => v > 0 ? v.toFixed(escala==='total' ? 0 : 1) : '',
                    },
                },
                scales: {
                    x: { stacked: true, title: { display: true, text: unit }, ticks: { font: { size: 12 } } },
                    y: { stacked: true, ticks: { font: { size: 13 } } },
                },
            },
            plugins: [ChartDataLabels, {
                id: 'metaLineProd',
                afterDraw: chart => {
                    // Linha de meta visível apenas na escala "por dia"
                    if (escala !== 'por_dia') return;
                    const { ctx, chartArea, scales: { x } } = chart;
                    const xPx = x.getPixelForValue(metaDia);
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(xPx, chartArea.top);
                    ctx.lineTo(xPx, chartArea.bottom);
                    ctx.strokeStyle = '#dc3545';
                    ctx.lineWidth   = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle  = '#dc3545';
                    ctx.font       = 'bold 10px sans-serif';
                    ctx.textAlign  = 'center';
                    ctx.fillText(`META ${metaDia}`, xPx, chartArea.top - 4);
                    ctx.restore();
                }
            }],
        });
    }


    // ── 7a. Classificação (doughnut) ──────────────────────────────────────────

    _renderizarGraficoClassificacao(suffix, dados) {
        const id = `chart-vg-class-${suffix}`;
        this._destroyChart(id);
        const canvas = document.getElementById(id);
        if (!canvas) return;
        const isTP  = dados.tipoTurma === 'TP';

        // Respeitar filtro de turma ativa
        const turmaAtiva = this._filtroTurma[suffix];
        const fonte = turmaAtiva
            ? (dados.turmas.find(t => t.turma === turmaAtiva) || dados.totais)
            : dados.totais;
        const vals  = [+(fonte.hhPDM||0).toFixed(2), +(fonte.hhCorrelato||0).toFixed(2)];
        const total = vals.reduce((a,b) => a+b, 0);

        const classLabels = isTP ? ['PDM_TPS','CORRELATO_TPS'] : ['PDM_SOLDA','CORRELATO_SOLDA'];
        this._charts[id] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: isTP ? ['PDM TPS','Correlato TPS'] : ['PDM Solda','Correlato Solda'],
                datasets: [{ data: vals, backgroundColor: ['#1976D2','#90CAF9'], borderWidth: 2 }],
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                onClick: (_, els) => { if (els.length) this._abrirDrilldownClassificacao(suffix, classLabels[els[0].index]); },
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
        const tipoFiltro = this._filtroTipoServicos[suffix] || null;
        const isTP       = dados.tipoTurma === 'TP';
        const fullLista  = turmaAtiva
            ? (dados.turmas.find(t => t.turma === turmaAtiva)?.servicos || dados.servicos)
            : dados.servicos;
        const listaFiltrada = tipoFiltro
            ? fullLista.filter(s => {
                const isPDM = s.classificacao === (isTP ? 'PDM_TPS' : 'PDM_SOLDA');
                return tipoFiltro === 'pdm' ? isPDM : !isPDM;
            })
            : fullLista;
        const fns = {
            hh:          (a,b) => sort.dir==='desc' ? b.hh-a.hh : a.hh-b.hh,
            qty:         (a,b) => sort.dir==='desc' ? b.qty-a.qty : a.qty-b.qty,
            ocorrencias: (a,b) => sort.dir==='desc' ? b.ocorrencias-a.ocorrencias : a.ocorrencias-b.ocorrencias,
        };
        const lista = [...listaFiltrada].sort(fns[sort.col] || fns.hh).slice(0,15);
        if (!lista.length) { el.innerHTML = '<p class="text-muted text-center py-3 small">Nenhum serviço encontrado.</p>'; return; }

        // % calculado sobre o total REAL do período (não apenas o Top 15)
        const totalHH = listaFiltrada.reduce((a,s) => a+s.hh, 0) || 1;
        const maxHH   = lista[0]?.hh || 1;
        const suf     = escAttr(suffix);
        const btnTipo = (val, label, cor) => {
            const ativo = tipoFiltro === val;
            return `<button class="btn btn-sm ${ativo ? `btn-${cor}` : `btn-outline-${cor}`}" style="font-size:.7rem;padding:1px 7px;"
                onclick="visaoGeral._filtrarTipoTopServicos('${suf}','${val}')">${label}</button>`;
        };
        const ico = col => sort.col !== col
            ? '<i class="fas fa-sort text-muted ms-1" style="font-size:.65rem;"></i>'
            : sort.dir==='desc'
                ? '<i class="fas fa-sort-down text-primary ms-1" style="font-size:.65rem;"></i>'
                : '<i class="fas fa-sort-up text-primary ms-1" style="font-size:.65rem;"></i>';
        const th = 'cursor:pointer;user-select:none;white-space:nowrap;';

        el.innerHTML = `
            <div class="d-flex gap-1 px-3 pt-2 pb-1 border-bottom bg-white" style="position:sticky;top:0;z-index:3;">
                ${btnTipo(null,'Todos','secondary')}
                ${btnTipo('pdm','PDM','primary')}
                ${btnTipo('correlato','Correlato','info')}
            </div>
            <table class="table table-sm table-hover mb-0">
                <thead class="table-light" style="position:sticky;top:32px;z-index:2;">
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
                    return `<tr style="cursor:pointer;" onclick="visaoGeral._abrirDrilldownServico('${suf}', '${escAttr(s.descricao)}')">
                        <td style="max-width:150px;font-size:.82rem;word-break:break-word;white-space:normal;">
                            <div style="height:2px;width:${(s.hh/maxHH*100).toFixed(0)}%;background:${cor};border-radius:2px;margin-bottom:2px;"></div>
                            ${escapeHtml(s.descricao)} <i class="fas fa-external-link-alt ms-1" style="font-size:.55rem;opacity:.4;"></i>
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

    _filtrarTipoTopServicos(suffix, tipo) {
        // Toggle: clicar no mesmo tipo ativo limpa o filtro
        this._filtroTipoServicos[suffix] = this._filtroTipoServicos[suffix] === tipo ? null : tipo;
        const dados = suffix === 'tp' ? this._dadosTPS : this._dadosTS;
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
        canvas.style.cursor = 'pointer';
        canvas.title = 'Clique em uma barra para ver os apontamentos';

        this._charts[id] = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'HH perdido', data: vals, backgroundColor: colors, borderWidth: 0 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const perda = top10[elements[0].index];
                    if (perda?.registros?.length) this._abrirDetalhePerda(perda.chave, perda);
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        label: ctx => ` ${ctx.raw.toFixed(1)} HH (${totHH > 0 ? (ctx.raw/totHH*100).toFixed(1) : 0}% das perdas)`,
                        afterLabel: ctx => (top10[ctx.dataIndex].controlavel ? ' ⚠ Controlável' : ' 🚫 Não controlável') + ' · clique para detalhes',
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

    // ── 9. Qualidade dos dados ───────────────────────────────────────────────

    _renderizarQualidadeDados(containerId, dados) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const q = dados.qualidade;
        const total = q.rdosSemEfetivo + q.hisSemHorario + q.servicosSemCoef;
        if (!total) { el.innerHTML = ''; return; }

        // Armazena listas para uso no modal (acessíveis via closure no onclick)
        const listas = {
            semEfetivo: q.listaRDOsSemEfetivo || [],
            semHorario: q.listaHIsSemHorario  || [],
            semCoef:    q.listaServicosSemCoef || [],
        };

        const abrirDetalheQD = (tipo) => {
            this._criarOffcanvas();
            const lista = listas[tipo];
            const titles = { semEfetivo: 'RDOs sem Efetivo', semHorario: 'HIs sem Horário', semCoef: 'Serviços sem Coeficiente' };
            document.getElementById('vg-oc-title').textContent = titles[tipo];
            document.getElementById('vg-oc-subtitle').textContent = `${lista.length} ocorrência${lista.length !== 1 ? 's' : ''}`;
            const cols = tipo === 'semCoef'
                ? `<tr><th>RDO</th><th>Data</th><th>Turma</th><th>Serviço</th></tr>`
                : tipo === 'semHorario'
                ? `<tr><th>RDO</th><th>Data</th><th>Turma</th><th>Tipo HI</th></tr>`
                : `<tr><th>RDO</th><th>Data</th><th>Turma</th></tr>`;
            const rows = lista.map(r => {
                const extra = tipo === 'semCoef' ? `<td class="small text-muted">${escapeHtml(r.desc || '—')}</td>`
                            : tipo === 'semHorario' ? `<td class="small"><span class="badge bg-warning text-dark">${escapeHtml(r.tipo || '—')}</span></td>`
                            : '';
                // Navegar ao dia no calendário ao clicar no Número RDO
                const onclickNav = r.data && r.turma
                    ? `onclick="window._vgNavDia('${escapeHtml(r.numRDO||'')}','${escapeHtml(r.data||'')}','${escapeHtml(r.turma||'')}')" style="cursor:pointer;" title="Abrir dia no calendário"`
                    : '';
                return `<tr><td class="small fw-bold text-primary text-decoration-underline" ${onclickNav}>${escapeHtml(r.numRDO || '—')}</td><td class="small">${escapeHtml(r.data || '—')}</td><td class="small">${escapeHtml(r.turma || '—')}</td>${extra}</tr>`;
            }).join('');
            document.getElementById('vg-oc-body').innerHTML = `
                <div class="p-3">
                    <div class="table-responsive" style="max-height:75vh;overflow-y:auto;">
                        <table class="table table-sm table-hover mb-0">
                            <thead class="table-light" style="position:sticky;top:0;z-index:1;">${cols}</thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;
            bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('vg-offcanvas')).show();
        };

        // Registra handlers globais temporários
        window._vgQD = abrirDetalheQD;

        // Navegar ao dia no calendário a partir do Número RDO
        window._vgNavDia = (numRDO, dataStr, turma) => {
            // Fechar offcanvas (painel lateral de serviços/turmas) se estiver aberto
            const oc = document.getElementById('vg-offcanvas');
            if (oc) bootstrap.Offcanvas.getInstance(oc)?.hide();

            // Fechar modal de Apontamentos HI se estiver aberto
            const hiModal = document.getElementById('vg-hi-detalhe-modal');
            if (hiModal) bootstrap.Modal.getInstance(hiModal)?.hide();

            // Determinar se é TP ou TS
            const tipoTurma = turma.toUpperCase().startsWith('TS') ? 'TS' : 'TP';

            // Parsear data "DD/MM/YYYY"
            const partes = (dataStr || '').split('/');
            if (partes.length < 3) return;
            const dia = parseInt(partes[0]);
            const mes = parseInt(partes[1]);
            const ano = parseInt(partes[2]);
            if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return;

            // Navegar para a aba de Calendário correta
            const abaId = tipoTurma === 'TS' ? 'nav-calendario-ts-tab' : 'nav-calendario-tp-tab';
            const abaEl = document.getElementById(abaId);
            if (abaEl) abaEl.click();

            // Abrir o modal do dia com pequeno delay para a aba renderizar
            setTimeout(() => {
                if (tipoTurma === 'TS' && typeof calendarioTS !== 'undefined') {
                    calendarioTS.mostrarDetalhesDia(turma, dia, mes, ano);
                } else if (typeof calendarioTP !== 'undefined') {
                    calendarioTP.mostrarDetalhesDia(turma, dia, mes, ano);
                }
            }, 350);
        };

        const items = [
            { key: 'semEfetivo', label: 'RDOs sem efetivo',        count: q.rdosSemEfetivo,  icon: 'fa-users-slash', color: 'warning'  },
            { key: 'semHorario', label: 'HIs sem horário',          count: q.hisSemHorario,   icon: 'fa-clock',       color: 'danger'   },
            { key: 'semCoef',    label: 'Serviços sem coeficiente', count: q.servicosSemCoef, icon: 'fa-tools',       color: 'secondary'},
        ].filter(i => i.count > 0);

        el.innerHTML = `<div class="card border-0 shadow-sm">
            <div class="card-header bg-warning bg-opacity-10 d-flex justify-content-between align-items-center">
                <h6 class="mb-0 text-dark"><i class="fas fa-clipboard-check me-2 text-warning"></i>Qualidade dos Dados</h6>
                <span class="badge bg-warning text-dark">${total} inconsistência${total>1?'s':''}</span>
            </div>
            <div class="card-body">
                <div class="row g-2">${items.map(i=>`<div class="col-auto">
                    <div class="d-flex align-items-center gap-2 p-2 rounded border border-${i.color} border-opacity-25 bg-${i.color} bg-opacity-10"
                         style="cursor:pointer;" title="Clique para ver lista" onclick="window._vgQD('${i.key}')">
                        <i class="fas ${i.icon} text-${i.color}"></i>
                        <span class="fw-bold text-${i.color}">${i.count}</span>
                        <span class="small text-muted">${escapeHtml(i.label)}</span>
                        <i class="fas fa-external-link-alt text-muted" style="font-size:.6rem;"></i>
                    </div>
                </div>`).join('')}</div>
                <p class="small text-muted mt-2 mb-0"><i class="fas fa-info-circle me-1"></i>Clique em um badge para ver os RDOs afetados.</p>
            </div>
        </div>`;
    }

    // ── Detalhe de Turma (offcanvas) ──────────────────────────────────────────

    _criarOffcanvas() {
        if (document.getElementById('vg-offcanvas')) return;

        const el = document.createElement('div');
        el.className = 'offcanvas offcanvas-end';
        el.id = 'vg-offcanvas';
        el.setAttribute('tabindex', '-1');
        // Forçar largura com !important para sobrescrever CSS estático do Bootstrap build
        let savedW = 0;
        try { savedW = parseInt(localStorage.getItem('vg_oc_width') || '0'); } catch (_) { /* private browsing */ }
        const initW  = savedW > 0 ? savedW : Math.min(1000, Math.round(window.innerWidth * 0.9));
        el.style.setProperty('width', `${initW}px`, 'important');
        el.style.transition = 'none';

        el.innerHTML = `
            <!-- Alça de redimensionamento -->
            <div id="vg-oc-resizer" style="
                position:absolute; left:0; top:0; bottom:0; width:6px;
                cursor:ew-resize; z-index:10;
                background:transparent;
                border-left:3px solid rgba(255,255,255,0.25);
                transition:border-color .2s;
            " title="Arraste para redimensionar"></div>

            <div class="offcanvas-header border-bottom py-2" style="background:linear-gradient(135deg,#1565C0,#1976D2); padding-left:14px;">
                <div class="d-flex flex-column flex-grow-1 overflow-hidden">
                    <h5 class="offcanvas-title text-white mb-0" id="vg-oc-title"></h5>
                    <small class="text-white text-opacity-75 text-truncate" id="vg-oc-subtitle"></small>
                </div>
                <div class="d-flex align-items-center gap-2 ms-2 flex-shrink-0">
                    <!-- Botões de tamanho rápido -->
                    <div class="btn-group btn-group-sm" title="Tamanho rápido">
                        <button class="btn btn-sm btn-outline-light py-0 px-1" style="font-size:.65rem;" onclick="visaoGeral._redimensionarOffcanvas(480)"  title="Estreito">◀◀</button>
                        <button class="btn btn-sm btn-outline-light py-0 px-1" style="font-size:.65rem;" onclick="visaoGeral._redimensionarOffcanvas(760)"  title="Médio">◀▶</button>
                        <button class="btn btn-sm btn-outline-light py-0 px-1" style="font-size:.65rem;" onclick="visaoGeral._redimensionarOffcanvas(1100)" title="Largo">▶▶</button>
                    </div>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas"></button>
                </div>
            </div>
            <div class="offcanvas-body p-0" id="vg-oc-body" style="overflow-y:auto;"></div>`;

        document.body.appendChild(el);
        this._inicializarResizer(el);
    }

    _redimensionarOffcanvas(px) {
        const el = document.getElementById('vg-offcanvas');
        if (!el) return;
        const w = Math.max(340, Math.min(px, Math.round(window.innerWidth * 0.96)));
        el.style.setProperty('width', `${w}px`, 'important');
        localStorage.setItem('vg_oc_width', w);
    }

    _inicializarResizer(ocEl) {
        const resizer = document.getElementById('vg-oc-resizer');
        if (!resizer) return;

        resizer.addEventListener('mouseenter', () => {
            resizer.style.borderLeftColor = 'rgba(255,255,255,0.8)';
        });
        resizer.addEventListener('mouseleave', () => {
            resizer.style.borderLeftColor = 'rgba(255,255,255,0.25)';
        });

        let startX, startW;

        resizer.addEventListener('mousedown', e => {
            e.preventDefault();
            startX = e.clientX;
            startW = ocEl.getBoundingClientRect().width;  // largura real renderizada
            resizer.style.borderLeftColor = '#fff';
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ew-resize';

            const onMove = e => {
                const delta = startX - e.clientX;          // arrastar para a esquerda = alargar
                const newW  = Math.max(340, Math.min(startW + delta, window.innerWidth * 0.96));
                ocEl.style.setProperty('width', `${newW}px`, 'important');
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                resizer.style.borderLeftColor = 'rgba(255,255,255,0.25)';
                const w = Math.round(ocEl.getBoundingClientRect().width);
                if (w > 0) localStorage.setItem('vg_oc_width', w);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // Touch support
        resizer.addEventListener('touchstart', e => {
            e.preventDefault();
            startX = e.touches[0].clientX;
            startW = ocEl.getBoundingClientRect().width;

            const onMove = e => {
                const delta = startX - e.touches[0].clientX;
                const newW  = Math.max(340, Math.min(startW + delta, window.innerWidth * 0.96));
                ocEl.style.setProperty('width', `${newW}px`, 'important');
            };
            const onUp = () => {
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onUp);
                const w = Math.round(ocEl.getBoundingClientRect().width);
                if (w > 0) localStorage.setItem('vg_oc_width', w);
            };
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
        }, { passive: false });
    }

    _abrirDetalhesTurma(turmaId, suffix) {
        this._criarOffcanvas();
        const dados   = suffix === 'tp' ? this._dadosTPS : this._dadosTS;
        const turma   = dados?.turmas.find(t => t.turma === turmaId);
        if (!turma || !dados) return;
        this._offcanvasTurmaAtual = turma;

        const isTP     = dados.tipoTurma === 'TP';
        const metaDia  = isTP ? METAS.META_DIARIA_TP : METAS.META_DIARIA_TS;
        const metaTurma = metaDia * turma.diasUteis;
        const hhEntregues = turma.hhServicos + turma.hhImprodutivas;
        const pctMeta  = metaTurma > 0 ? hhEntregues / metaTurma * 100 : 0;
        const hhDia    = turma.diasTrabalhados > 0 ? turma.hhServicos / turma.diasTrabalhados : 0;
        const gap      = Math.max(0, metaTurma - turma.hhServicos - turma.hhImprodutivas);
        const pctDias  = turma.diasTrabalhados > 0 ? turma.diasBateuMeta / turma.diasTrabalhados * 100 : 0;

        const enc   = turma.encarregados?.join(', ') || '—';
        const medOp = turma.mediaOperadores > 0 ? turma.mediaOperadores.toFixed(1) : '—';

        const sem = (v, g, y) => {
            if (v >= g) return 'text-success';
            if (v >= y) return 'text-warning';
            return 'text-danger';
        };

        // Colorir barra de composição da meta
        const barPDM    = metaTurma > 0 ? (turma.hhPDM / metaTurma * 100) : 0;
        const barCorr   = metaTurma > 0 ? (turma.hhCorrelato / metaTurma * 100) : 0;
        const barNC     = metaTurma > 0 ? (turma.perdas.filter(p=>!p.controlavel).reduce((a,p)=>a+p.hh,0) / metaTurma * 100) : 0;
        const barC      = metaTurma > 0 ? (turma.perdas.filter(p=>p.controlavel).reduce((a,p)=>a+p.hh,0) / metaTurma * 100) : 0;
        const barGap    = metaTurma > 0 ? (gap / metaTurma * 100) : 0;

        const topServicos = turma.servicos.slice(0, 8);
        const topPerdas   = turma.perdas.slice(0, 8);
        const maxSHH = topServicos[0]?.hh || 1;
        const maxPHH = topPerdas[0]?.hh || 1;
        const classPDM = isTP ? 'PDM_TPS' : 'PDM_SOLDA';

        document.getElementById('vg-oc-title').textContent = `${turmaId}`;
        document.getElementById('vg-oc-subtitle').textContent =
            `${turma.numRDOs} RDOs · ${turma.diasTrabalhados} dias trabalhados · ${turma.diasUteis} dias úteis no mês`;

        document.getElementById('vg-oc-body').innerHTML = `
            <!-- Info operacional -->
            <div class="px-3 py-2 border-bottom bg-light">
                <div class="row g-2 align-items-center">
                    <div class="col-auto"><i class="fas fa-user-tie text-primary me-1"></i><strong>Encarregado(a):</strong> ${escapeHtml(enc)}</div>
                    <div class="col-auto text-muted">|</div>
                    <div class="col-auto"><i class="fas fa-users text-secondary me-1"></i><strong>Méd. Operadores:</strong> ${escapeHtml(medOp)}</div>
                    <div class="col-auto text-muted">|</div>
                    <div class="col-auto"><i class="fas fa-calendar-check text-success me-1"></i><strong>Dias ≥ META:</strong> ${turma.diasBateuMeta}/${turma.diasTrabalhados} <span class="text-muted">(${pctDias.toFixed(0)}%)</span></div>
                    ${!isTP && turma.totalSoldas > 0 ? `<div class="col-auto text-muted">|</div>
                    <div class="col-auto"><i class="fas fa-fire text-danger me-1"></i><strong>Soldas:</strong> <span class="${turma.totalSoldas >= 30 ? 'text-success' : turma.totalSoldas >= 20 ? 'text-warning' : 'text-danger'} fw-bold">${turma.totalSoldas.toFixed(0)}</span> <span class="text-muted">(meta: 30)</span></div>` : ''}
                </div>
            </div>

            <!-- KPIs -->
            <div class="row g-0 border-bottom text-center">
                <div class="col border-end py-3">
                    <p class="small text-muted mb-1">HH Produtivo</p>
                    <h5 class="fw-bold text-success mb-0">${turma.hhServicos.toFixed(0)}</h5>
                    <small class="text-muted">${hhDia.toFixed(1)} HH/dia</small>
                </div>
                <div class="col border-end py-3">
                    <p class="small text-muted mb-1">HH Improdut.</p>
                    <h5 class="fw-bold text-danger mb-0">${turma.hhImprodutivas.toFixed(0)}</h5>
                    <small class="text-muted">${hhEntregues > 0 ? (turma.hhImprodutivas/hhEntregues*100).toFixed(1) : 0}% do total</small>
                </div>
                <div class="col border-end py-3">
                    <p class="small text-muted mb-1">Total Entregues</p>
                    <h5 class="fw-bold text-info mb-0">${hhEntregues.toFixed(0)}</h5>
                    <small class="text-muted">prod + improdut.</small>
                </div>
                <div class="col py-3">
                    <p class="small text-muted mb-1">% da Meta</p>
                    <h5 class="fw-bold ${sem(pctMeta,80,50)} mb-0">${pctMeta.toFixed(1)}%</h5>
                    <small class="text-muted">meta: ${metaTurma.toFixed(0)} HH</small>
                </div>
            </div>

            <!-- Barra de composição da meta -->
            <div class="px-3 py-2 border-bottom">
                <p class="small text-muted mb-2 fw-semibold">Composição da Meta (${metaTurma.toFixed(0)} HH = 100%)</p>
                <div class="d-flex rounded overflow-hidden mb-2" style="height:22px;">
                    ${barPDM  > 0.5 ? `<div style="width:${barPDM.toFixed(1)}%;background:#1565C0;" title="PDM: ${turma.hhPDM.toFixed(0)} HH"></div>` : ''}
                    ${barCorr > 0.5 ? `<div style="width:${barCorr.toFixed(1)}%;background:#42A5F5;" title="Correlato: ${turma.hhCorrelato.toFixed(0)} HH"></div>` : ''}
                    ${barNC   > 0.5 ? `<div style="width:${barNC.toFixed(1)}%;background:#C62828;" title="NC: ${(barNC/100*metaTurma).toFixed(0)} HH"></div>` : ''}
                    ${barC    > 0.5 ? `<div style="width:${barC.toFixed(1)}%;background:#FF7043;" title="Controláveis: ${(barC/100*metaTurma).toFixed(0)} HH"></div>` : ''}
                    ${barGap  > 0.5 ? `<div style="width:${barGap.toFixed(1)}%;background:#BDBDBD;" title="Gap/Não trabalhado: ${gap.toFixed(0)} HH"></div>` : ''}
                </div>
                <div class="d-flex flex-wrap gap-3" style="font-size:.72rem;">
                    <span><span style="display:inline-block;width:10px;height:10px;background:#1565C0;border-radius:2px;"></span> PDM ${turma.hhPDM.toFixed(0)} HH</span>
                    <span><span style="display:inline-block;width:10px;height:10px;background:#42A5F5;border-radius:2px;"></span> Correlato ${turma.hhCorrelato.toFixed(0)} HH</span>
                    <span><span style="display:inline-block;width:10px;height:10px;background:#C62828;border-radius:2px;"></span> Perdas NC ${(barNC/100*metaTurma).toFixed(0)} HH</span>
                    <span><span style="display:inline-block;width:10px;height:10px;background:#FF7043;border-radius:2px;"></span> Controláveis ${(barC/100*metaTurma).toFixed(0)} HH</span>
                    ${gap > 0 ? `<span><span style="display:inline-block;width:10px;height:10px;background:#BDBDBD;border-radius:2px;"></span> Gap ${gap.toFixed(0)} HH</span>` : ''}
                </div>
            </div>

            <!-- Gráficos -->
            <div class="row g-0 border-bottom">
                <div class="col-md-5 border-end p-3">
                    <p class="small text-muted fw-semibold mb-2"><i class="fas fa-chart-pie me-1 text-warning"></i>Composição das Horas</p>
                    <canvas id="vg-oc-chart-comp" height="200"></canvas>
                </div>
                <div class="col-md-7 p-3">
                    <p class="small text-muted fw-semibold mb-2"><i class="fas fa-chart-bar me-1 text-primary"></i>Top Serviços por HH</p>
                    <canvas id="vg-oc-chart-serv" height="200"></canvas>
                </div>
            </div>

            <!-- Listas lado a lado -->
            <div class="row g-0">
                <!-- Lista serviços -->
                <div class="col-md-6 border-end p-3">
                    <p class="small text-muted fw-semibold mb-2"><i class="fas fa-list-ul me-1 text-success"></i>Serviços Realizados (${turma.servicos.length})</p>
                    <div style="max-height:280px;overflow-y:auto;">
                        <table class="table table-sm table-hover mb-0">
                            <thead class="table-light" style="position:sticky;top:0;z-index:1;"><tr>
                                <th style="font-size:.72rem;">Serviço</th>
                                <th class="text-center" style="font-size:.72rem;width:44px;">Tipo</th>
                                <th class="text-end" style="font-size:.72rem;width:46px;">Qtd</th>
                                <th class="text-end" style="font-size:.72rem;width:54px;">HH</th>
                                <th class="text-end" style="font-size:.72rem;width:40px;">Ocr</th>
                            </tr></thead>
                            <tbody>${turma.servicos.map(s => {
                                const isPDM = s.classificacao === classPDM;
                                const qtdFmt = Number.isFinite(s.qty) ? (Number.isInteger(s.qty) ? s.qty : s.qty.toFixed(1)) : '–';
                                return `<tr style="cursor:pointer;" onclick="visaoGeral._abrirDrilldownServico('${escAttr(isTP?'tp':'ts')}', '${escAttr(s.descricao)}', '${escAttr(turmaId)}')">
                                    <td style="font-size:.75rem;max-width:130px;" class="text-truncate" title="${escAttr(s.descricao)}">
                                        <div style="height:2px;width:${(s.hh/maxSHH*100).toFixed(0)}%;background:${isPDM?'#1976D2':'#90CAF9'};border-radius:2px;margin-bottom:1px;"></div>
                                        ${escapeHtml(s.descricao)} <i class="fas fa-external-link-alt ms-1" style="font-size:.5rem;opacity:.4;"></i>
                                    </td>
                                    <td class="text-center">${isPDM?'<span class="badge bg-primary bg-opacity-75" style="font-size:.6rem;">PDM</span>':'<span class="badge bg-secondary bg-opacity-50" style="font-size:.6rem;">Corr</span>'}</td>
                                    <td class="text-end text-muted" style="font-size:.75rem;">${qtdFmt}</td>
                                    <td class="text-end fw-bold" style="font-size:.75rem;">${s.hh.toFixed(1)}</td>
                                    <td class="text-end text-muted" style="font-size:.75rem;">${s.ocorrencias}</td>
                                </tr>`;
                            }).join('')}</tbody>
                        </table>
                    </div>
                </div>
                <!-- Lista perdas -->
                <div class="col-md-6 p-3">
                    <p class="small text-muted fw-semibold mb-2"><i class="fas fa-exclamation-triangle me-1 text-danger"></i>Horas Improdutivas (${turma.perdas.length} tipos)</p>
                    <div style="max-height:280px;overflow-y:auto;">
                        ${turma.perdas.length ? `<table class="table table-sm table-hover mb-0">
                            <thead class="table-light" style="position:sticky;top:0;z-index:1;"><tr>
                                <th style="font-size:.72rem;">Tipo / Causa</th>
                                <th class="text-center" style="font-size:.72rem;width:44px;"></th>
                                <th class="text-end" style="font-size:.72rem;width:54px;">HH</th>
                                <th class="text-end" style="font-size:.72rem;width:40px;">Ocr</th>
                            </tr></thead>
                            <tbody>${turma.perdas.map(p => {
                                const isNC = !p.controlavel;
                                return `<tr style="cursor:pointer;" title="Clique para ver apontamentos" data-perda-chave="${escAttr(p.chave)}" onclick="visaoGeral._abrirDetalhePerda(this.dataset.perdaChave)">
                                    <td style="font-size:.75rem;max-width:150px;" class="text-truncate" title="${escAttr(p.chave)}">
                                        <div style="height:2px;width:${(p.hh/maxPHH*100).toFixed(0)}%;background:${isNC?'#C62828':'#FF7043'};border-radius:2px;margin-bottom:1px;"></div>
                                        <i class="fas fa-search" style="font-size:.6rem;opacity:.5;margin-right:2px;"></i>${escapeHtml(p.chave)}
                                    </td>
                                    <td class="text-center">${isNC?'<span class="badge bg-danger bg-opacity-75" style="font-size:.6rem;">NC</span>':'<span class="badge bg-warning text-dark bg-opacity-75" style="font-size:.6rem;">Ctrl</span>'}</td>
                                    <td class="text-end fw-bold text-danger" style="font-size:.75rem;">${p.hh.toFixed(1)}</td>
                                    <td class="text-end text-muted" style="font-size:.75rem;">${p.count}</td>
                                </tr>`;
                            }).join('')}</tbody>
                        </table>` : '<p class="text-muted small text-center py-3">Nenhuma HI registrada.</p>'}
                    </div>
                </div>
            </div>

            <!-- VG-01: Lista de OS -->
            ${turma.ordens?.length > 0 ? `
            <div class="border-top p-3">
                <p class="small text-muted fw-semibold mb-2"><i class="fas fa-clipboard-list me-1 text-info"></i>Ordens de Serviço (${turma.ordens.length})</p>
                <div style="max-height:420px;overflow-y:auto;">
                    <table class="table table-sm table-hover mb-0">
                        <thead class="table-light" style="position:sticky;top:0;z-index:1;">
                            <tr>
                                <th style="font-size:.78rem;">O.S</th>
                                <th style="font-size:.78rem;">KM</th>
                                <th style="font-size:.78rem;">Data(s)</th>
                                <th style="font-size:.78rem;">Local</th>
                                <th class="text-end" style="font-size:.78rem;">HH Prod</th>
                                <th class="text-end" style="font-size:.78rem;">HI</th>
                                <th class="text-end" style="font-size:.78rem;">Total</th>
                            </tr>
                        </thead>
                        <tbody>${turma.ordens.map(o => {
                            const totalOS = o.hhProd + o.hhImpr;
                            const datasUnicas = [...new Set(o.datas)].sort((a,b) => {
                                const [da,ma,ya] = a.split('/').map(Number);
                                const [db,mb,yb] = b.split('/').map(Number);
                                return new Date(ya,ma-1,da) - new Date(yb,mb-1,db);
                            });
                            const kmLabel = (o.kmInicio && o.kmFim) ? `${escapeHtml(o.kmInicio)}–${escapeHtml(o.kmFim)}` : (o.kmInicio ? escapeHtml(o.kmInicio) : '—');
                            return `<tr style="cursor:pointer;" onclick="visaoGeral._abrirDetalheOS('${escAttr(turma.turma)}', '${escAttr(o.os)}', '${escAttr(isTP ? 'tp' : 'ts')}')">
                                <td class="fw-bold text-primary" style="font-size:.82rem;">${escapeHtml(o.os)} <i class="fas fa-external-link-alt ms-1" style="font-size:.55rem;opacity:.4;"></i></td>
                                <td style="font-size:.8rem;" class="text-muted">${kmLabel}</td>
                                <td style="font-size:.8rem;" class="text-muted">${datasUnicas.length > 2 ? datasUnicas[0]+' … '+datasUnicas[datasUnicas.length-1] : datasUnicas.join(', ')}</td>
                                <td style="font-size:.8rem;max-width:110px;" class="text-truncate" title="${escAttr(o.local)}">${escapeHtml(o.local || '-')}</td>
                                <td class="text-end fw-bold text-primary" style="font-size:.82rem;">${o.hhProd.toFixed(1)}</td>
                                <td class="text-end text-warning" style="font-size:.82rem;">${o.hhImpr.toFixed(1)}</td>
                                <td class="text-end fw-bold" style="font-size:.82rem;">${totalOS.toFixed(1)}</td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table>
                </div>
            </div>` : ''}`;

        // Renderizar gráficos
        this._renderizarGraficoDetalheComp(turma, dados, gap, metaTurma);
        this._renderizarGraficoDetalheServ(turma, dados);

        // Abrir offcanvas
        const ocEl = document.getElementById('vg-offcanvas');
        const oc   = bootstrap.Offcanvas.getOrCreateInstance(ocEl);
        oc.show();
    }

    _renderizarGraficoDetalheComp(turma, dados, gap, metaTurma) {
        this._destroyChart('vg-oc-chart-comp');
        const canvas = document.getElementById('vg-oc-chart-comp');
        if (!canvas) return;
        const isTP = dados.tipoTurma === 'TP';
        const nc   = turma.perdas.filter(p => !p.controlavel).reduce((a,p) => a+p.hh, 0);
        const c    = turma.perdas.filter(p =>  p.controlavel).reduce((a,p) => a+p.hh, 0);
        const labels = [isTP ? 'PDM TPS' : 'PDM Solda', isTP ? 'Correlato TPS' : 'Correlato Solda', 'Perdas NC', 'Controláveis'];
        const vals   = [turma.hhPDM, turma.hhCorrelato, nc, c];
        const colors = ['#1565C0', '#42A5F5', '#C62828', '#FF7043'];
        if (gap > 0.5) { labels.push('Gap/Meta não atingida'); vals.push(gap); colors.push('#BDBDBD'); }
        this._charts['vg-oc-chart-comp'] = new Chart(canvas, {
            type: 'doughnut',
            data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderWidth: 2 }] },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw.toFixed(0)} HH (${(ctx.raw/(metaTurma||1)*100).toFixed(1)}% da meta)` } },
                    datalabels: {
                        color: ctx => ['#1565C0','#C62828'].includes(colors[ctx.dataIndex]) ? '#fff' : '#333',
                        font: { size: 10, weight: 'bold' },
                        formatter: (v, ctx) => {
                            const tot = ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
                            return tot > 0 && v/tot > 0.05 ? `${(v/tot*100).toFixed(0)}%` : '';
                        },
                    },
                },
            },
            plugins: [ChartDataLabels],
        });
    }

    _renderizarGraficoDetalheServ(turma, dados) {
        this._destroyChart('vg-oc-chart-serv');
        const canvas = document.getElementById('vg-oc-chart-serv');
        if (!canvas) return;
        const isTP     = dados.tipoTurma === 'TP';
        const suffix   = isTP ? 'tp' : 'ts';
        const turmaId  = turma.turma;
        const classPDM = isTP ? 'PDM_TPS' : 'PDM_SOLDA';
        const top8     = turma.servicos.slice(0, 8);
        if (!top8.length) return;
        const fullDesc = top8.map(s => s.descricao); // descrições originais para o drill-down
        const labels   = top8.map(s => s.descricao.length > 25 ? s.descricao.substring(0,23)+'…' : s.descricao);
        const vals     = top8.map(s => +s.hh.toFixed(1));
        const colors   = top8.map(s => s.classificacao === classPDM ? '#1976D2' : '#64B5F6');
        canvas.height  = Math.max(160, top8.length * 32);
        this._charts['vg-oc-chart-serv'] = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderWidth: 0 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    subtitle: {
                        display: true,
                        text: 'Clique para ver detalhes do serviço',
                        font: { size: 10 },
                        color: '#6c757d',
                        padding: { bottom: 4 }
                    },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toFixed(1)} HH` } },
                    datalabels: {
                        anchor: 'end', align: 'right', color: '#333', font: { size: 10 },
                        formatter: v => v.toFixed(0),
                    },
                },
                onClick: (event, elements) => {
                    if (!elements.length) return;
                    this._abrirDrilldownServico(suffix, fullDesc[elements[0].index], turmaId);
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                scales: {
                    x: { beginAtZero: true, title: { display: true, text: 'HH' } },
                    y: { ticks: { font: { size: 10 } } },
                },
                layout: { padding: { right: 30 } },
            },
            plugins: [ChartDataLabels],
        });
    }

    // ── Detalhe de apontamentos de HI ────────────────────────────────────────

    _abrirDetalhePerda(chave, perdaObj) {
        // Se chamado do offcanvas, buscar na turma atual; se chamado do chart, usar perdaObj passado
        const perda = perdaObj || this._offcanvasTurmaAtual?.perdas?.find(p => p.chave === chave);
        if (!perda) return;
        const regs = perda.registros || [];

        const existingId = 'vg-hi-detalhe-modal';
        let modal = document.getElementById(existingId);
        if (modal) modal.remove();

        const isNC = !perda.controlavel;
        const badgeHtml = isNC
            ? '<span class="badge bg-danger ms-2" style="font-size:.7rem;">Não Controlável</span>'
            : '<span class="badge bg-warning text-dark ms-2" style="font-size:.7rem;">Controlável</span>';

        const toMin = t => { const [h,m] = (t||'').split(':').map(Number); return isNaN(h)||isNaN(m) ? null : h*60+m; };
        const fmtDur = (ini, fim) => {
            const a = toMin(ini), b = toMin(fim);
            if (a === null || b === null) return '–';
            const d = b >= a ? b - a : (1440 - a + b);
            return d >= 60 ? `${Math.floor(d/60)}h${String(d%60).padStart(2,'0')}m` : `${d}min`;
        };

        // Ordem atual: null | 'dur-asc' | 'dur-desc' | 'hh-asc' | 'hh-desc'
        let _ordemAptm = null;
        let _regsOrdenados = regs.slice(); // cópia mutável

        const renderRows = arr => arr.map(r => {
            const navAttr = (r.numRDO && r.data && r.turma)
                ? `style="cursor:pointer;" title="Abrir dia ${escapeHtml(r.data)} no calendário"
                   onclick="window._vgNavDia('${escapeHtml(r.numRDO)}','${escapeHtml(r.data)}','${escapeHtml(r.turma)}')"`
                : '';
            return `
            <tr ${navAttr}>
                <td style="font-size:.78rem;white-space:nowrap;">${escapeHtml(r.data || '–')}</td>
                <td style="font-size:.78rem;white-space:nowrap;"><span class="badge bg-secondary bg-opacity-75">${escapeHtml(r.turma || '–')}</span></td>
                <td style="font-size:.78rem;white-space:nowrap;" class="fw-bold text-primary text-decoration-underline">
                    ${escapeHtml(r.numRDO || '–')}
                    ${r.numRDO ? '<i class="fas fa-external-link-alt ms-1" style="font-size:.55rem;opacity:.5;"></i>' : ''}
                </td>
                <td style="font-size:.78rem;">${r.horaInicio || '–'} → ${r.horaFim || '–'}</td>
                <td class="text-center text-muted" style="font-size:.78rem;">${fmtDur(r.horaInicio, r.horaFim)}</td>
                <td class="text-center" style="font-size:.78rem;">${r.operadores || '–'}</td>
                ${r.descricao ? `<td style="font-size:.78rem;word-break:break-word;white-space:normal;">${escapeHtml(r.descricao)}</td>` : '<td class="text-muted" style="font-size:.78rem;">–</td>'}
                <td class="text-end fw-bold text-danger" style="font-size:.78rem;">${r.hh.toFixed(2)}</td>
            </tr>`;
        }).join('');

        // Função de sort acessível pelo onclick inline do thead
        window._vgSortAptm = (campo, dir) => {
            const chaveOrdem = `${campo}-${dir}`;
            if (_ordemAptm === chaveOrdem) {
                _ordemAptm = null;
                _regsOrdenados = regs.slice(); // restaurar ordem original
            } else {
                _ordemAptm = chaveOrdem;
                _regsOrdenados = regs.slice().sort((a, b) => {
                    let va, vb;
                    if (campo === 'dur') {
                        va = toMin(a.horaFim) - toMin(a.horaInicio);
                        vb = toMin(b.horaFim) - toMin(b.horaInicio);
                        if (va < 0) va += 1440; if (vb < 0) vb += 1440;
                    } else {
                        va = a.hh || 0; vb = b.hh || 0;
                    }
                    return dir === 'asc' ? va - vb : vb - va;
                });
            }
            const tbody = document.getElementById('vg-hi-aptm-tbody');
            if (tbody) tbody.innerHTML = renderRows(_regsOrdenados);
            // Atualizar aparência dos botões
            ['dur-asc','dur-desc','hh-asc','hh-desc'].forEach(id => {
                const btn = document.getElementById('vgaptm-' + id);
                if (btn) {
                    const ativo = _ordemAptm === id.replace('-', '-');
                    btn.className = ativo
                        ? 'btn btn-secondary btn-sm py-0 px-1'
                        : 'btn btn-outline-secondary btn-sm py-0 px-1';
                }
            });
        };

        const sortBtn = (campo, dir, label) =>
            `<button id="vgaptm-${campo}-${dir}" class="btn btn-outline-secondary btn-sm py-0 px-1 ms-1"
                     style="font-size:.6rem;" onclick="window._vgSortAptm('${campo}','${dir}')"
                     title="${dir==='asc'?'Menor':'Maior'} primeiro">${label}</button>`;

        const html = `
        <div class="modal fade" id="${existingId}" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header py-2 px-3" style="background:${isNC?'#C62828':'#FF7043'};color:#fff;">
                <h6 class="modal-title mb-0">
                  <i class="fas fa-list-ul me-2"></i>Apontamentos — ${escapeHtml(chave)}${badgeHtml}
                </h6>
                <button type="button" class="btn-close btn-close-white btn-sm" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body p-0">
                ${regs.length ? `
                <table class="table table-sm table-hover mb-0">
                  <thead class="table-light" style="position:sticky;top:0;z-index:1;">
                    <tr>
                      <th style="font-size:.72rem;">Data</th>
                      <th style="font-size:.72rem;">Turma</th>
                      <th style="font-size:.72rem;">Número RDO</th>
                      <th style="font-size:.72rem;">Horário</th>
                      <th class="text-center" style="font-size:.72rem;">
                        Duração${sortBtn('dur','asc','▲')}${sortBtn('dur','desc','▼')}
                      </th>
                      <th class="text-center" style="font-size:.72rem;">Op.</th>
                      <th style="font-size:.72rem;">Descrição</th>
                      <th class="text-end" style="font-size:.72rem;">
                        HH${sortBtn('hh','asc','▲')}${sortBtn('hh','desc','▼')}
                      </th>
                    </tr>
                  </thead>
                  <tbody id="vg-hi-aptm-tbody">${renderRows(_regsOrdenados)}</tbody>
                  <tfoot class="table-light">
                    <tr>
                      <td colspan="7" class="text-end fw-semibold" style="font-size:.78rem;">Total</td>
                      <td class="text-end fw-bold text-danger" style="font-size:.78rem;">${regs.reduce((a,r)=>a+r.hh,0).toFixed(2)} HH</td>
                    </tr>
                  </tfoot>
                </table>` : '<p class="text-muted text-center py-4 small">Nenhum apontamento encontrado.</p>'}
              </div>
              <div class="modal-footer py-2">
                <small class="text-muted me-auto">${regs.length} apontamento${regs.length !== 1 ? 's' : ''}</small>
                <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Fechar</button>
              </div>
            </div>
          </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        const el = document.getElementById(existingId);
        const bsModal = new bootstrap.Modal(el, { backdrop: true });
        el.addEventListener('hidden.bs.modal', () => el.remove(), { once: true });
        bsModal.show();
    }

    // ── VG-04: Drill-down por classificação (PDM / Correlato) ───────────────

    _abrirDrilldownClassificacao(suffix, classificacao) {
        this._criarOffcanvas();
        const dados = suffix === 'tp' ? this._dadosTPS : this._dadosTS;
        if (!dados) return;
        const turmaAtiva = this._filtroTurma[suffix];
        const lista = turmaAtiva
            ? (dados.turmas.find(t => t.turma === turmaAtiva)?.servicos || dados.servicos)
            : dados.servicos;
        const filtrados = lista.filter(s => s.classificacao === classificacao);
        if (!filtrados.length) return;
        const totalHH = filtrados.reduce((a, s) => a + s.hh, 0);
        const labelClass = classificacao.includes('PDM') ? 'PDM' : 'Correlato';

        document.getElementById('vg-oc-title').textContent = `${labelClass} — Serviços`;
        document.getElementById('vg-oc-subtitle').textContent =
            `${filtrados.length} serviços · ${totalHH.toFixed(1)} HH total${turmaAtiva ? ` · Filtro: ${turmaAtiva}` : ''}`;

        document.getElementById('vg-oc-body').innerHTML = `
            <div class="p-3">
                <div class="table-responsive" style="max-height:70vh;overflow-y:auto;">
                    <table class="table table-sm table-hover mb-0">
                        <thead class="table-light" style="position:sticky;top:0;z-index:1;">
                            <tr>
                                <th>Serviço</th>
                                <th class="text-end" style="width:70px;">HH</th>
                                <th class="text-end" style="width:60px;">Qtd</th>
                                <th class="text-end" style="width:50px;">Ocorr</th>
                            </tr>
                        </thead>
                        <tbody>${filtrados.map(s => `
                            <tr style="cursor:pointer;" onclick="visaoGeral._abrirDrilldownServico('${escAttr(suffix)}', '${escAttr(s.descricao)}')">
                                <td class="small" title="${escAttr(s.descricao)}">${escapeHtml(s.descricao)} <i class="fas fa-external-link-alt ms-1" style="font-size:.5rem;opacity:.4;"></i></td>
                                <td class="text-end fw-bold small">${s.hh.toFixed(1)}</td>
                                <td class="text-end small">${s.qty.toFixed(1)}</td>
                                <td class="text-end small text-muted">${s.ocorrencias}</td>
                            </tr>`).join('')}
                        </tbody>
                        <tfoot class="table-light">
                            <tr>
                                <th>Total</th>
                                <th class="text-end">${totalHH.toFixed(1)}</th>
                                <th class="text-end">${filtrados.reduce((a,s)=>a+s.qty,0).toFixed(1)}</th>
                                <th class="text-end text-muted">${filtrados.reduce((a,s)=>a+s.ocorrencias,0)}</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>`;

        const ocEl = document.getElementById('vg-offcanvas');
        bootstrap.Offcanvas.getOrCreateInstance(ocEl).show();
    }

    // ── VG-02: Drill-down de serviço → OSs ───────────────────────────────────

    _abrirDrilldownServico(suffix, descricao, turmaId = null) {
        const dados = suffix === 'tp' ? this._dadosTPS : this._dadosTS;
        if (!dados) return;
        const servico = dados.servicos.find(s => s.descricao === descricao);
        if (!servico || !servico.detalhes?.length) return;
        // Filtrar por turma se contexto vier de _abrirDetalhesTurma
        const detalhes = turmaId
            ? servico.detalhes.filter(d => d.turma === turmaId)
            : servico.detalhes;
        if (!detalhes.length) return;
        const totalHH = detalhes.reduce((a, d) => a + d.hh, 0);
        const totalQty = detalhes.reduce((a, d) => a + d.qty, 0);
        const isPDM = servico.classificacao?.includes('PDM');

        document.getElementById('vg-ms-title').textContent = descricao;
        document.getElementById('vg-ms-subtitle').textContent =
            `${isPDM ? 'PDM' : 'Correlato'}${turmaId ? ` · ${turmaId}` : ''} · ${detalhes.length} ocorrências · ${totalHH.toFixed(1)} HH total`;

        document.getElementById('vg-ms-body').innerHTML = `
            ${turmaId ? `
            <div class="px-3 pt-2 pb-1 border-bottom">
                <button class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-arrow-left me-1"></i>Voltar para ${escapeHtml(turmaId)}
                </button>
            </div>` : ''}
            <div class="p-3">
                <div class="d-flex gap-3 mb-3">
                    <div class="p-2 rounded bg-primary bg-opacity-10 text-center flex-fill">
                        <p class="small text-muted mb-0">HH Total</p>
                        <h5 class="fw-bold text-primary mb-0">${totalHH.toFixed(1)}</h5>
                    </div>
                    <div class="p-2 rounded bg-success bg-opacity-10 text-center flex-fill">
                        <p class="small text-dark mb-0">Quantidade</p>
                        <h5 class="fw-bold text-success mb-0">${totalQty.toFixed(1)}</h5>
                    </div>
                    <div class="p-2 rounded bg-info bg-opacity-10 text-center flex-fill">
                        <p class="small text-muted mb-0">Ocorrências</p>
                        <h5 class="fw-bold text-info mb-0">${detalhes.length}</h5>
                    </div>
                </div>
                <div class="table-responsive" style="max-height:60vh;overflow-y:auto;">
                    <table class="table table-sm table-hover mb-0">
                        <thead class="table-light" style="position:sticky;top:0;z-index:1;">
                            <tr>
                                <th>O.S</th>
                                <th>KM</th>
                                <th>Data</th>
                                <th>Turma</th>
                                <th class="text-end">Qtd</th>
                                <th class="text-end">HH</th>
                            </tr>
                        </thead>
                        <tbody>${detalhes.map(d => {
                            const kmLabel = (d.kmInicio && d.kmFim) ? `${escapeHtml(d.kmInicio)}–${escapeHtml(d.kmFim)}` : (d.kmInicio ? escapeHtml(d.kmInicio) : '—');
                            return `<tr style="cursor:pointer;" title="Ver detalhe da O.S" onclick="visaoGeral._navegarParaOS('${escAttr(d.turma)}', '${escAttr(d.os)}', '${escAttr(suffix)}')">
                                <td class="small fw-bold text-primary">${escapeHtml(d.os || '-')} <i class="fas fa-external-link-alt ms-1" style="font-size:.5rem;opacity:.4;"></i></td>
                                <td class="small text-muted">${kmLabel}</td>
                                <td class="small">${escapeHtml(d.data || '-')}</td>
                                <td class="small">${escapeHtml(d.turma || '-')}</td>
                                <td class="text-end small">${d.qty.toFixed(1)}</td>
                                <td class="text-end fw-bold small">${d.hh.toFixed(1)}</td>
                            </tr>`;
                        }).join('')}
                        </tbody>
                        <tfoot class="table-light">
                            <tr>
                                <th colspan="4">Total</th>
                                <th class="text-end">${detalhes.reduce((a,d)=>a+d.qty,0).toFixed(1)}</th>
                                <th class="text-end">${totalHH.toFixed(1)}</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>`;

        bootstrap.Modal.getOrCreateInstance(document.getElementById('vg-modal-servico')).show();
    }

    _navegarParaOS(turmaId, osNumero, suffix) {
        const msEl = document.getElementById('vg-modal-servico');
        const modal = msEl ? bootstrap.Modal.getInstance(msEl) : null;
        if (modal) {
            msEl.addEventListener('hidden.bs.modal', () => this._abrirDetalheOS(turmaId, osNumero, suffix), {once: true});
            modal.hide();
        } else {
            this._abrirDetalheOS(turmaId, osNumero, suffix);
        }
    }

    // ── VG-01: Drill-down de OS ──────────────────────────────────────────────

    _abrirDetalheOS(turmaId, osNumero, suffix) {
        this._criarOffcanvas();
        const dados = suffix === 'tp' ? this._dadosTPS : this._dadosTS;
        if (!dados) return;
        const turma = dados.turmas.find(t => t.turma === turmaId);
        const os = turma?.ordens?.find(o => o.os === osNumero);
        if (!os) return;
        const calc = this._calculadora;
        const totalHH = os.hhProd + os.hhImpr;

        // Função auxiliar: duração entre dois horários HH:MM (suporta virada de meia-noite)
        const calcDurMin = (ini, fim) => {
            const toMin = t => { const [h,m] = (t||'').split(':').map(Number); return isNaN(h)||isNaN(m) ? null : h*60+m; };
            const a = toMin(ini), b = toMin(fim);
            if (a === null || b === null) return null;
            return b >= a ? b - a : (1440 - a + b);
        };
        const fmtDur = min => min === null ? '—' : min >= 60 ? `${Math.floor(min/60)}h${String(min%60).padStart(2,'0')}m` : `${min}min`;

        // Buscar serviços, HI e efetivos desta OS
        const servicosOS = [];
        const hiOS = [];
        let somaOperadores = 0, countEfetivo = 0;
        os.rdos.forEach(r => {
            (calc?.indices?.servicosPorRDO?.get(r.numRDO) || []).forEach(s => {
                const desc = s['Descrição'] || s.descricao || '';
                const qty  = parseFloat(s['Quantidade'] || s.quantidade || 0) || 0;
                const coef = parseFloat(s.coeficiente || s.Coeficiente || 0) || 0;
                servicosOS.push({ desc, qty, hh: qty * coef, data: r.data });
            });
            (calc?.indices?.hiPorRDO?.get(r.numRDO) || []).forEach(hi => {
                const tipo   = hi['Tipo'] || hi.tipo || '';
                const inicio = hi['Hora Início'] || hi.horaInicio || '';
                const fim    = hi['Hora Fim'] || hi.horaFim || '';
                const hhVal  = parseFloat(hi.hhImprodutivas || hi['HH Improdutivas'] || 0);
                const durMin = calcDurMin(inicio, fim);
                hiOS.push({ tipo, inicio, fim, durMin, hh: hhVal, data: r.data });
            });
            const ef = calc?.indices?.efetivosPorRDO?.get(r.numRDO);
            if (ef) { somaOperadores += parseInt(ef['Operadores'] || ef.operadores || 0); countEfetivo++; }
        });
        const medOp = countEfetivo > 0 ? (somaOperadores / countEfetivo).toFixed(1) : '—';

        document.getElementById('vg-oc-title').textContent = `O.S ${osNumero}`;
        document.getElementById('vg-oc-subtitle').textContent =
            `${turmaId} · ${os.rdos.length} RDO(s) · ${totalHH.toFixed(1)} HH total`;

        document.getElementById('vg-oc-body').innerHTML = `
            <!-- Botão Voltar -->
            <div class="px-3 pt-2 pb-1 border-bottom">
                <button class="btn btn-sm btn-outline-secondary" onclick="visaoGeral._abrirDetalhesTurma('${escAttr(turmaId)}', '${escAttr(suffix)}')">
                    <i class="fas fa-arrow-left me-1"></i>Voltar para ${escapeHtml(turmaId)}
                </button>
            </div>
            <!-- Info operacional -->
            <div class="px-3 py-2 border-bottom bg-light">
                <div class="row g-2 align-items-center small">
                    <div class="col-auto"><i class="fas fa-map-marker-alt text-primary me-1"></i>${escapeHtml(os.local || '-')}</div>
                    <div class="col-auto text-muted">|</div>
                    <div class="col-auto"><i class="fas fa-ruler text-secondary me-1"></i>KM: ${escapeHtml(os.kmInicio || '-')} → ${escapeHtml(os.kmFim || '-')}</div>
                    <div class="col-auto text-muted">|</div>
                    <div class="col-auto"><i class="fas fa-users text-info me-1"></i>Méd. operadores: <strong>${medOp}</strong></div>
                </div>
            </div>
            <!-- KPIs -->
            <div class="row g-0 border-bottom text-center">
                <div class="col border-end py-3">
                    <p class="small text-muted mb-1">HH Produtivo</p>
                    <h5 class="fw-bold text-success mb-0">${os.hhProd.toFixed(1)}</h5>
                </div>
                <div class="col border-end py-3">
                    <p class="small text-muted mb-1">HH Improdutivo</p>
                    <h5 class="fw-bold text-danger mb-0">${os.hhImpr.toFixed(1)}</h5>
                </div>
                <div class="col py-3">
                    <p class="small text-muted mb-1">Total</p>
                    <h5 class="fw-bold text-primary mb-0">${totalHH.toFixed(1)}</h5>
                </div>
            </div>
            <!-- Dias trabalhados -->
            <div class="p-3 border-bottom">
                <p class="small text-muted fw-semibold mb-2"><i class="fas fa-calendar me-1"></i>Dias Trabalhados (${os.rdos.length})</p>
                <div class="d-flex flex-wrap gap-2">${os.rdos.map(r => `
                    <span class="badge bg-light text-dark border small">${escapeHtml(r.data || '-')} <span class="text-muted">${escapeHtml(r.horaInicio || '')}–${escapeHtml(r.horaFim || '')}</span></span>`).join('')}
                </div>
            </div>
            <!-- Serviços -->
            ${servicosOS.length ? `
            <div class="p-3 border-bottom">
                <p class="small text-muted fw-semibold mb-2"><i class="fas fa-tools me-1 text-success"></i>Serviços (${servicosOS.length})</p>
                <div style="max-height:200px;overflow-y:auto;">
                    <table class="table table-sm table-hover mb-0">
                        <thead class="table-light" style="position:sticky;top:0;z-index:1;">
                            <tr><th style="font-size:.72rem;">Serviço</th><th style="font-size:.72rem;">Data</th><th class="text-end" style="font-size:.72rem;">Qtd</th><th class="text-end" style="font-size:.72rem;">HH</th></tr>
                        </thead>
                        <tbody>${servicosOS.map(s => `
                            <tr><td class="small">${escapeHtml(s.desc)}</td><td class="small text-muted">${escapeHtml(s.data)}</td><td class="text-end small">${s.qty.toFixed(1)}</td><td class="text-end fw-bold small">${s.hh.toFixed(1)}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>` : ''}
            <!-- HI -->
            ${hiOS.length ? `
            <div class="p-3 border-bottom">
                <p class="small text-muted fw-semibold mb-2"><i class="fas fa-pause-circle me-1 text-danger"></i>Horas Improdutivas (${hiOS.length})</p>
                <div style="max-height:200px;overflow-y:auto;">
                    <table class="table table-sm table-hover mb-0">
                        <thead class="table-light" style="position:sticky;top:0;z-index:1;">
                            <tr><th style="font-size:.72rem;">Tipo</th><th style="font-size:.72rem;">Data</th><th style="font-size:.72rem;">Horário</th><th style="font-size:.72rem;">Duração</th><th class="text-end" style="font-size:.72rem;">HH</th></tr>
                        </thead>
                        <tbody>${hiOS.map(h => `
                            <tr>
                                <td class="small"><span class="badge bg-warning text-dark">${escapeHtml(h.tipo)}</span></td>
                                <td class="small text-muted">${escapeHtml(h.data)}</td>
                                <td class="small">${escapeHtml(h.inicio)}–${escapeHtml(h.fim)}</td>
                                <td class="small text-muted">${fmtDur(h.durMin)}</td>
                                <td class="text-end fw-bold small">${h.hh.toFixed(1)}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>` : ''}
            <!-- Observações dos RDOs -->
            ${os.rdos.filter(r => r.obs).length ? `
            <div class="p-3">
                <p class="small text-muted fw-semibold mb-2"><i class="fas fa-comment-dots me-1 text-info"></i>Observações</p>
                ${os.rdos.filter(r => r.obs).map(r => `
                    <div class="alert alert-light small py-2 mb-2"><strong>${escapeHtml(r.data)}:</strong> ${escapeHtml(r.obs)}</div>`).join('')}
            </div>` : ''}`;

        const ocEl = document.getElementById('vg-offcanvas');
        bootstrap.Offcanvas.getOrCreateInstance(ocEl).show();
    }

    // ── Utilitário ────────────────────────────────────────────────────────────

    _destroyChart(id) {
        if (this._charts[id]) { try { this._charts[id].destroy(); } catch(_) {} delete this._charts[id]; }
    }
}

const visaoGeral = new VisaoGeral();
