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
    carregarDados(rdos, servicos, horasImprodutivas, efetivos, notas) {
        this.dados = {
            rdos: rdos || [],
            servicos: servicos || [],
            horasImprodutivas: horasImprodutivas || [],
            efetivos: efetivos || []
        };
        this.notas = notas || [];
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
     * Calcula HH do soldador por Número RDO (mais confiável que OS+data)
     */
    calcularHHSoldadorDia(numeroRDO) {
        let hhTotal = 0;

        const servicosDoDia = this.dados.servicos.filter(s => {
            const numRDO = s['Número RDO'] || s.numeroRDO || s.numeroRdo || '';
            return numRDO === numeroRDO;
        });

        servicosDoDia.forEach(servico => {
            const quantidade = parseFloat(servico.Quantidade || servico.quantidade || 0);
            const coeficiente = parseFloat(servico.Coeficiente || servico.coeficiente || 0);
            hhTotal += quantidade * coeficiente;
        });

        return hhTotal;
    }

    /**
     * Obtém efetivo por Número RDO (mais confiável que OS+data)
     */
    obterEfetivoDia(numeroRDO) {
        const efetivoDia = this.dados.efetivos.find(ef => {
            const numRDO = ef['Número RDO'] || ef.numeroRDO || ef.numeroRdo || '';
            return numRDO === numeroRDO;
        });

        if (!efetivoDia) {
            return { total: 0, encarregado: 0, operadores: 0, motoristas: 0, soldador: 0, operadorEGP: 0, tecnicoSeguranca: 0 };
        }

        const encarregado      = parseInt(efetivoDia['Encarregado Qtd']   || efetivoDia.encarregadoQtd    || 0);
        const soldador         = parseInt(efetivoDia['Soldador']           || efetivoDia.soldador           || 0);
        const operadores       = parseInt(efetivoDia['Operadores']         || efetivoDia.operadores         || 0);
        const motoristas       = parseInt(efetivoDia['Motoristas']         || efetivoDia.motoristas         || 0);
        const operadorEGP      = parseInt(efetivoDia['Operador EGP']       || efetivoDia.operadorEGP        || efetivoDia.operadorEgp || 0);
        const tecnicoSeguranca = parseInt(efetivoDia['Técnico Segurança']  || efetivoDia.tecnicoSeguranca   || 0);
        const total = encarregado + soldador + operadores + motoristas + operadorEGP + tecnicoSeguranca;

        return { total, encarregado, soldador, operadores, motoristas, operadorEGP, tecnicoSeguranca };
    }

    /**
     * Algoritmo sweep-line para merge de HI sobrepostas (mesmo do calculations.js)
     * Evita dupla contagem quando intervalos se sobrepõem
     */
    _calcularHHMerged(hisArray, operadoresDefault = 12) {
        if (!hisArray || hisArray.length === 0) return 0;

        const parseMin = (t) => {
            const parts = (t || '').split(':').map(Number);
            return (parts[0] || 0) * 60 + (parts[1] || 0);
        };

        const intervals = [];
        hisArray.forEach(hi => {
            const horaInicio = hi['Hora Início'] || hi.horaInicio || '';
            const horaFim    = hi['Hora Fim']    || hi.horaFim    || '';
            if (!horaInicio || !horaFim) return;

            let startMin = parseMin(horaInicio);
            let endMin   = parseMin(horaFim);
            if (endMin <= startMin) endMin += 1440;

            const tipo = (hi.Tipo || hi.tipo || '').toLowerCase();
            let operadores = parseInt(hi['Operadores'] || hi.operadores || 0);
            if (operadores <= 0) operadores = operadoresDefault;

            // Pré-filtro: trens < 15 min descartados
            if (tipo.includes('trem') && (endMin - startMin) < METAS.MINUTOS_MINIMOS_TREM) return;

            intervals.push({ startMin, endMin, tipo, operadores });
        });

        if (intervals.length === 0) return 0;

        // Sweep line: breakpoints para cada segmento único
        const breakpoints = new Set();
        intervals.forEach(iv => { breakpoints.add(iv.startMin); breakpoints.add(iv.endMin); });
        const timeline = [...breakpoints].sort((a, b) => a - b);

        let totalHH = 0;
        for (let i = 0; i < timeline.length - 1; i++) {
            const segStart = timeline[i];
            const segEnd   = timeline[i + 1];
            const duracaoHoras = (segEnd - segStart) / 60;
            if (duracaoHoras <= 0) continue;

            const active = intervals.filter(iv => iv.startMin <= segStart && iv.endMin >= segEnd);
            if (active.length === 0) continue;

            const operadores = Math.max(...active.map(iv => iv.operadores));
            const hasChuva = active.some(iv => iv.tipo.includes('chuva'));

            if (hasChuva) {
                totalHH += (duracaoHoras * operadores) / METAS.DIVISOR_CHUVA;
            } else {
                totalHH += duracaoHoras * operadores;
            }
        }

        return totalHH;
    }

    /**
     * Obtém dados completos de um dia — agrega múltiplos RDOs da mesma turma+dia
     */
    obterDadosDia(turma, dia, mes, ano) {
        const dataFormatada = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;

        // Buscar TODOS os RDOs do dia (não apenas o primeiro)
        const _rdosDiaBruto = this.dados.rdos.filter(rdo => {
            const codigoTurma = rdo['Código Turma'] || rdo.codigoTurma || '';
            const data = rdo.Data || rdo.data || '';
            const deletado = (rdo['Deletado'] || rdo.deletado || '').toLowerCase();
            return codigoTurma === turma && data === dataFormatada && deletado !== 'sim';
        });
        // Deduplicar por Número RDO — duplicatas reais (mesmo Número RDO) são
        // ignoradas para evitar que renomear/excluir afete dois registros ao mesmo tempo
        const _rdosVistos = new Set();
        const rdosDia = _rdosDiaBruto.filter(rdo => {
            const n = (rdo['Número RDO'] || rdo.numeroRDO || '').trim();
            if (_rdosVistos.has(n)) return false;
            _rdosVistos.add(n);
            return true;
        });

        if (rdosDia.length === 0) return null;

        // Usar primeiro RDO para campos de contexto, mas agregar HH de todos
        const rdoPrincipal = rdosDia[0];
        const numeroOS  = rdoPrincipal['Número OS']  || rdoPrincipal.numeroOS  || '';
        const numeroRDO = rdoPrincipal['Número RDO'] || rdoPrincipal.numeroRDO || '-';
        const horaInicio = rdoPrincipal['Horário Início'] || rdoPrincipal.horarioInicio || '-';
        const horaFim    = rdoPrincipal['Horário Fim']    || rdoPrincipal.horarioFim    || '-';
        const local      = rdoPrincipal.Local || rdoPrincipal.local || '-';
        const kmInicio   = (rdoPrincipal['KM Início'] || rdoPrincipal.kmInicio || rdoPrincipal['Km Início'] || rdoPrincipal['km_inicio'] || '').toString().trim();
        const kmFim      = (rdoPrincipal['KM Fim']    || rdoPrincipal.kmFim    || rdoPrincipal['Km Fim']    || rdoPrincipal['km_fim']    || '').toString().trim();
        const observacoes = rdoPrincipal['Observações'] || rdoPrincipal.Observacoes || rdoPrincipal.observacoes || '';

        // Agregar HH Soldador de TODOS os RDOs do dia (join por Número RDO)
        let hhSoldador = 0;
        let efetivo = { total: 0, encarregado: 0, operadores: 0, motoristas: 0, soldador: 0, operadorEGP: 0, tecnicoSeguranca: 0 };
        const allHIs = [];
        const numerosRDO = [];

        rdosDia.forEach(rdo => {
            const nRDO = rdo['Número RDO'] || rdo.numeroRDO || '';
            numerosRDO.push(nRDO);
            hhSoldador += this.calcularHHSoldadorDia(nRDO);

            // Usar efetivo do primeiro RDO que tenha dados
            const ef = this.obterEfetivoDia(nRDO);
            if (ef.total > efetivo.total) efetivo = ef;

            // Coletar todas as HIs de todos os RDOs do dia
            this.dados.horasImprodutivas.filter(hi => {
                const hRDO = hi['Número RDO'] || hi.numeroRDO || hi.numeroRdo || '';
                return hRDO === nRDO;
            }).forEach(hi => allHIs.push(hi));
        });

        // Formatar HIs para exibição no modal
        const hisDoDia = allHIs.map(hi => ({
            tipo:       hi.Tipo || hi.tipo || '-',
            descricao:  hi['Descrição'] || hi.descricao || '-',
            horaInicio: hi['Hora Início'] || hi.horaInicio || '-',
            horaFim:    hi['Hora Fim']    || hi.horaFim   || '-',
            hh:         parseFloat(hi['HH Improdutivas'] || hi.hhImprodutivas || 0).toFixed(2),
            overlap:    false
        }));

        // Detectar sobreposição visual entre HIs
        if (hisDoDia.length > 1) {
            const pm = t => { if (!t || t === '-') return -1; const p = t.split(':').map(Number); return (p[0]||0)*60+(p[1]||0); };
            const ivals = hisDoDia.map(h => { const s = pm(h.horaInicio); let e = pm(h.horaFim); if (s>=0&&e>=0&&e<=s) e+=1440; return {s,e}; });
            hisDoDia.forEach((h,i) => { h.overlap = ivals[i].s>=0 && ivals.some((iv,j)=>j!==i&&iv.s>=0&&ivals[i].s<iv.e&&iv.s<ivals[i].e); });
        }

        // Calcular HH Improdutivas via merge (evita dupla contagem)
        const opDefault = efetivo.operadores > 0 ? efetivo.operadores : 12;
        const hhImprodutivas = this._calcularHHMerged(allHIs, opDefault);

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
            numeroRDO: rdosDia.length > 1 ? numerosRDO.join(', ') : numeroRDO,
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
            rdo: rdoPrincipal
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

        // HH Soldador total (join por Número RDO)
        let hhSoldadorTotal = 0;
        rdosTurma.forEach(rdo => {
            const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || '';
            hhSoldadorTotal += this.calcularHHSoldadorDia(numeroRDO);
        });

        // Dias trabalhados
        const diasTrabalhados = rdosTurma.length;

        // SLA baseado em dias úteis (consistente com TP/TMC)
        const diasUteis = typeof calculadoraMedicao !== 'undefined'
            ? calculadoraMedicao.getDiasUteis(this.mesAtual, this.anoAtual)
            : diasTrabalhados;
        const metaMensal = METAS.META_DIARIA_TS * diasUteis;
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
                            <h5 class="mb-0"><i class="fas fa-fire me-2"></i>${escapeHtml(turma)}</h5>
                            <small class="opacity-75">Encarregado: ${escapeHtml(stats.encarregado)}</small>
                        </div>
                        <div class="col-md-8">
                            <div class="row g-1">
                                <div class="col-4 text-center">
                                    <small class="d-block opacity-75" style="font-size:.7rem;">Dias Trabalhados</small>
                                    <strong class="d-block">${stats.diasTrabalhados}</strong>
                                </div>
                                <div class="col-4 text-center">
                                    <small class="d-block opacity-75" style="font-size:.7rem;">HH Produtivas</small>
                                    <strong class="d-block">${stats.hhSoldadorTotal.toFixed(1)}</strong>
                                </div>
                                <div class="col-4 text-center">
                                    <small class="d-block opacity-75" style="font-size:.7rem;">SLA %</small>
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
                         data-turma="${escapeHtml(turma)}" data-dia="${dia}" data-mes="${this.mesAtual}" data-ano="${this.anoAtual}"
                         onclick="calendarioTS.mostrarDetalhesDia(this.dataset.turma, +this.dataset.dia, +this.dataset.mes, +this.dataset.ano)">
                        <div class="dia-numero">${dia}</div>
                        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:2px;">
                            <span style="font-size:1.05em; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55%;">${escapeHtml(dadosDia.numeroOS)}</span>
                            <strong class="dia-hh" style="margin:0; font-size:1.05em;">${(dadosDia.hhSoldador + dadosDia.hhImprodutivas).toFixed(1)} HH</strong>
                        </div>
                        <div class="dia-meta" style="display:flex; justify-content:space-between; align-items:center; gap:4px; flex-wrap:wrap;">
                            <span>${(dadosDia.percentualMeta * 100).toFixed(0)}% da meta</span>
                            ${(dadosDia.kmInicio || dadosDia.kmFim) ? `<span style="font-size:0.80em; color:#555; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60%;">📍 ${escapeHtml(dadosDia.kmInicio || '-')} – ${escapeHtml(dadosDia.kmFim || '-')}</span>` : ''}
                        </div>
                        <div class="dia-efetivo">
                            ${[
                                dadosDia.efetivo.encarregado      ? `Enc:${dadosDia.efetivo.encarregado}`      : '',
                                dadosDia.efetivo.operadores       ? `Op:${dadosDia.efetivo.operadores}`         : '',
                                dadosDia.efetivo.motoristas       ? `Mot:${dadosDia.efetivo.motoristas}`        : '',
                                dadosDia.efetivo.soldador         ? `Sold:${dadosDia.efetivo.soldador}`         : '',
                                dadosDia.efetivo.operadorEGP      ? `EGP:${dadosDia.efetivo.operadorEGP}`       : '',
                                dadosDia.efetivo.tecnicoSeguranca ? `Tec:${dadosDia.efetivo.tecnicoSeguranca}`  : ''
                            ].filter(Boolean).join(' · ')}
                        </div>
                        ${dadosDia.observacoes ? `
                            <div class="dia-obs" style="margin-top: 4px; color: #ff9800;">
                                📝 ${escapeHtml(dadosDia.observacoes.substring(0, 30))}${dadosDia.observacoes.length > 30 ? '...' : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            } else {
                // Dia sem trabalho — verificar nota no Sheets (cache local)
                const _dataFmtNota = `${String(dia).padStart(2,'0')}/${String(this.mesAtual).padStart(2,'0')}/${this.anoAtual}`;
                const _notaSemRDO = (this.notas || []).find(n => n.turma === turma && n.data === _dataFmtNota)?.nota || '';
                html += `
                    <div class="calendario-dia sem-trabalho${_notaSemRDO ? ' tem-nota-local' : ''}"
                         data-turma="${escapeHtml(turma)}" data-dia="${dia}" data-mes="${this.mesAtual}" data-ano="${this.anoAtual}"
                         onclick="calendarioTS.abrirNotaDiaSemRDO(this.dataset.turma, +this.dataset.dia, +this.dataset.mes, +this.dataset.ano)"
                         style="cursor:pointer;" title="${_notaSemRDO ? escapeHtml(_notaSemRDO) : 'Adicionar nota (feriado, folga…)'}">
                        <div class="dia-numero">${dia}</div>
                        ${_notaSemRDO
                            ? `<div class="dia-nota-sem-rdo">📝 ${escapeHtml(_notaSemRDO)}</div>`
                            : '<div class="dia-status" style="opacity:.25;font-size:.6rem;margin-top:4px;">+ nota</div>'}
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

        // Serviços buscados por Número(s) RDO
        const numerosRDOArr = dados.numeroRDO.split(', ').map(s => s.trim());
        const servicosFormatados = this.dados.servicos
            .filter(s => numerosRDOArr.includes(s['Número RDO'] || s.numeroRDO || s.numeroRdo || ''))
            .map(s => ({
                descricao:   s['Descrição'] || s.descricao || '-',
                quantidade:  parseFloat(s.Quantidade  || s.quantidade  || 0).toFixed(2),
                coeficiente: parseFloat(s.Coeficiente || s.coeficiente || 0).toFixed(4),
                unidade:     s.Unidade || s.unidade || '-',
                hh: (parseFloat(s.Quantidade  || s.quantidade  || 0) *
                     parseFloat(s.Coeficiente || s.coeficiente || 0)).toFixed(2),
                observacao: (s['Observações'] || s['Observacoes'] || s.observacoes || s.observações || '').trim(),
                isCustomizado: (s['É Customizado?'] || s.eCustomizado || '').toString().toUpperCase() === 'SIM'
            }));

        const encarregado = dados.rdo?.Encarregado || dados.rdo?.encarregado || '-';
        const totalHH = dados.hhSoldador + dados.hhImprodutivas;

        editorRDO.inicializar(
            { ...dados, turma, multiplosRDOs: false, hhPorOS: [{ numeroOS: dados.numeroOS }] },
            'TS',
            servicosFormatados
        );

        const modalHTML = `
            <div class="modal fade" id="modalDetalhesDiaTS" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-fire me-2"></i>
                                Detalhes do Dia — ${escapeHtml(dados.data)} | ${escapeHtml(turma)}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div id="editor-alerta-ts" class="alert alert-danger py-2 mb-2" style="display:none;"></div>
                            <div id="editor-banner-ts" class="alert alert-warning py-2 mb-2" style="display:none;">
                                <i class="fas fa-pen-to-square me-2"></i><strong>Modo de edição ativo</strong> — as alterações são salvas imediatamente no Google Sheets.
                            </div>
                            <!-- Cabeçalho info -->
                            <div class="row mb-4">
                                <div class="col-md-12">
                                    <h6 class="text-muted mb-1">
                                        <i class="fas fa-user me-1"></i>${escapeHtml(encarregado)} &nbsp;|&nbsp;
                                        <i class="fas fa-file-alt me-1"></i>RDO: <span id="cab-view-rdo">${escapeHtml(dados.numeroRDO)}</span>
                                    </h6>
                                    <div id="cabecalho-view" class="d-flex flex-wrap align-items-center gap-1 text-muted small">
                                        <i class="fas fa-hashtag me-1"></i>OS:&nbsp;<span id="cab-view-os" class="fw-semibold">${escapeHtml(dados.numeroOS)}</span>
                                        <span class="edit-ctrl" style="display:none;">
                                            <button class="btn btn-link btn-sm p-0" onclick="editorRDO.mostrarEditCabecalho()" title="Editar cabeçalho"><i class="fas fa-pencil-alt" style="font-size:.7rem;"></i></button>
                                        </span>
                                        &nbsp;|&nbsp;<i class="fas fa-map-marker-alt me-1"></i><span id="cab-view-local">${escapeHtml(dados.local)}</span>
                                        &nbsp;|&nbsp;<i class="fas fa-road me-1"></i>KM <span id="cab-view-km-ini">${escapeHtml(dados.kmInicio || '-')}</span> – <span id="cab-view-km-fim">${escapeHtml(dados.kmFim || '-')}</span>
                                        &nbsp;|&nbsp;<i class="fas fa-clock me-1"></i><span id="cab-view-hr-ini">${escapeHtml(dados.horaInicio)}</span> – <span id="cab-view-hr-fim">${escapeHtml(dados.horaFim)}</span>
                                    </div>
                                    <div id="cabecalho-form" class="card card-body p-2 mt-2" style="display:none;">
                                        <div class="row g-2">
                                            <div class="col-6 col-md-2">
                                                <label class="form-label form-label-sm mb-0 text-muted">O.S</label>
                                                <input id="cab-os" type="text" class="form-control form-control-sm">
                                            </div>
                                            <div class="col-6 col-md-3">
                                                <label class="form-label form-label-sm mb-0 text-muted">Local</label>
                                                <input id="cab-local" type="text" class="form-control form-control-sm">
                                            </div>
                                            <div class="col-4 col-md-2">
                                                <label class="form-label form-label-sm mb-0 text-muted">KM Início</label>
                                                <input id="cab-km-ini" type="text" class="form-control form-control-sm" placeholder="000+000">
                                            </div>
                                            <div class="col-4 col-md-2">
                                                <label class="form-label form-label-sm mb-0 text-muted">KM Fim</label>
                                                <input id="cab-km-fim" type="text" class="form-control form-control-sm" placeholder="000+000">
                                            </div>
                                            <div class="col-4 col-md-1">
                                                <label class="form-label form-label-sm mb-0 text-muted">Início</label>
                                                <input id="cab-hr-ini" type="text" class="form-control form-control-sm" placeholder="HH:MM" maxlength="5">
                                            </div>
                                            <div class="col-4 col-md-1">
                                                <label class="form-label form-label-sm mb-0 text-muted">Fim</label>
                                                <input id="cab-hr-fim" type="text" class="form-control form-control-sm" placeholder="HH:MM" maxlength="5">
                                            </div>
                                            <div class="col-8 col-md-1 d-flex align-items-end gap-1">
                                                <button class="btn btn-sm btn-success flex-fill" onclick="editorRDO.salvarCabecalho(this)"><i class="fas fa-save"></i></button>
                                                <button class="btn btn-sm btn-outline-secondary" onclick="editorRDO.cancelarEditCabecalho()"><i class="fas fa-times"></i></button>
                                            </div>
                                        </div>
                                    </div>
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
                                                ${[
                                                    dados.efetivo?.encarregado      ? `Enc: ${dados.efetivo.encarregado}`      : '',
                                                    dados.efetivo?.soldador         ? `Sold: ${dados.efetivo.soldador}`         : '',
                                                    dados.efetivo?.operadores       ? `Op: ${dados.efetivo.operadores}`         : '',
                                                    dados.efetivo?.motoristas       ? `Mot: ${dados.efetivo.motoristas}`        : '',
                                                    dados.efetivo?.operadorEGP      ? `EGP: ${dados.efetivo.operadorEGP}`       : '',
                                                    dados.efetivo?.tecnicoSeguranca ? `Tec: ${dados.efetivo.tecnicoSeguranca}`  : ''
                                                ].filter(Boolean).join(' | ')}
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
                            <div class="mb-4">
                                <h6 class="text-muted mb-3"><i class="fas fa-fire me-2"></i>Soldas Realizadas</h6>
                                ${servicosFormatados.length === 0 ? '<p class="text-muted mb-2 view-only"><i class="fas fa-info-circle me-2"></i>Nenhum serviço registrado</p>' : `
                                <div class="table-responsive">
                                    <table class="table table-sm table-hover">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Descrição</th>
                                                <th class="text-center">Qtd</th>
                                                <th class="text-center">Coef.</th>
                                                <th class="text-center">Unidade</th>
                                                <th class="text-end">HH</th>
                                                <th class="edit-ctrl" style="display:none;"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="tbody-servicos">
                                            ${servicosFormatados.map((s, i) => `
                                                <tr id="srv-row-${i}">
                                                    <td>
                                                        ${escapeHtml(s.descricao)}
                                                        ${s.isCustomizado ? '<span class="badge bg-info ms-1" style="font-size:.6rem;">Custom</span>' : ''}
                                                        ${s.observacao ? `<div class="text-muted small mt-1"><i class="fas fa-comment-dots me-1"></i>${escapeHtml(s.observacao)}</div>` : ''}
                                                    </td>
                                                    <td class="text-center">${s.quantidade}</td>
                                                    <td class="text-center">${s.coeficiente}</td>
                                                    <td class="text-center">${s.unidade}</td>
                                                    <td class="text-end"><strong>${s.hh}</strong></td>
                                                    <td class="edit-ctrl text-center" style="display:none;">
                                                        <div class="edit-ctrl-btns-srv">${editorRDO._htmlSrvBtns(i)}</div>
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                        <tfoot class="table-light">
                                            <tr>
                                                <th colspan="4" class="text-end">TOTAL HH Soldador:</th>
                                                <th class="text-end">${dados.hhSoldador.toFixed(2)}</th>
                                                <th class="edit-ctrl" style="display:none;"></th>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                `}
                                <div class="edit-ctrl" style="display:none;">
                                    <button class="btn btn-sm btn-outline-success mt-1" onclick="editorRDO.toggleFormAdicionarServico()">
                                        <i class="fas fa-plus me-1"></i>Adicionar Solda
                                    </button>
                                    <div id="form-adicionar-servico" class="card card-body mt-2 p-2" style="display:none;">
                                        <div class="row g-2 align-items-end">
                                            <div class="col-12 col-md-5">
                                                <label class="form-label form-label-sm mb-0 text-muted">Solda / Serviço</label>
                                                <select id="novo-srv-sel" class="form-select form-select-sm" onchange="editorRDO._previewNovoHH()">
                                                    <option value="">-- Selecione o serviço --</option>
                                                    ${editorRDO._buildServicosOptions('')}
                                                </select>
                                            </div>
                                            <div class="col-4 col-md-2">
                                                <label class="form-label form-label-sm mb-0 text-muted">Qtd</label>
                                                <input id="novo-srv-qty" type="number" class="form-control form-control-sm" step="0.01" min="0.01" placeholder="0" oninput="editorRDO._previewNovoHH()">
                                            </div>
                                            <div class="col-4 col-md-1">
                                                <label class="form-label form-label-sm mb-0 text-muted">Un.</label>
                                                <select id="novo-srv-un" class="form-select form-select-sm">
                                                    <option>M</option><option>M²</option><option>M³</option>
                                                    <option>KG</option><option selected>UN</option><option>T</option><option>L</option>
                                                </select>
                                            </div>
                                            <div class="col-4 col-md-1 text-center">
                                                <label class="form-label form-label-sm mb-0 text-muted">HH</label>
                                                <div class="badge bg-info text-dark w-100 py-2"><span id="novo-srv-hh-pre">?</span></div>
                                            </div>
                                            <div class="col-12 col-md-3">
                                                <button class="btn btn-sm btn-success w-100" onclick="editorRDO.salvarNovoServico(this)">
                                                    <i class="fas fa-save me-1"></i>Salvar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Horas Improdutivas -->
                            <div class="mb-4">
                                <h6 class="text-muted mb-3"><i class="fas fa-pause-circle me-2"></i>Horas Improdutivas</h6>
                                ${dados.horasImprodutivas.length === 0 ? '<p class="text-muted mb-2 view-only"><i class="fas fa-info-circle me-2"></i>Nenhuma hora improdutiva registrada</p>' : `
                                <div class="table-responsive">
                                    <table class="table table-sm table-hover">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Tipo</th>
                                                <th>Descrição</th>
                                                <th class="text-center">Início</th>
                                                <th class="text-center">Fim</th>
                                                <th class="text-center">
                                                    Dur.
                                                    <button id="hi-sort-asc" class="btn btn-outline-secondary btn-sm py-0 px-1 ms-1" style="font-size:.65rem;" onclick="editorRDO.ordenarHI('asc')" title="Menor duração primeiro">▲</button>
                                                    <button id="hi-sort-desc" class="btn btn-outline-secondary btn-sm py-0 px-1" style="font-size:.65rem;" onclick="editorRDO.ordenarHI('desc')" title="Maior duração primeiro">▼</button>
                                                </th>
                                                <th class="text-end">HH</th>
                                                <th class="edit-ctrl" style="display:none;"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="tbody-hi">
                                            ${dados.horasImprodutivas.map((hi, i) => `<tr id="hi-row-${i}">${editorRDO._htmlHIRow(i, hi)}</tr>`).join('')}
                                        </tbody>
                                    </table>
                                </div>
                                `}
                                <div class="edit-ctrl" style="display:none;">
                                    <button class="btn btn-sm btn-outline-warning mt-1" onclick="editorRDO.toggleFormAdicionarHI()">
                                        <i class="fas fa-plus me-1"></i>Adicionar HI
                                    </button>
                                    <div id="form-adicionar-hi" class="card card-body mt-2 p-2" style="display:none;">
                                        <div class="row g-2">
                                            <div class="col-12 col-md-3">
                                                <select id="nova-hi-tipo" class="form-select form-select-sm">
                                                    <option>Chuva</option><option>Falta de Material</option>
                                                    <option>Aguardando Liberação</option><option>Passagens de Trem</option>
                                                    <option>Treinamento</option><option>Almoço/Refeição</option>
                                                    <option>Deslocamento</option><option>Outros</option>
                                                </select>
                                            </div>
                                            <div class="col-12 col-md-3">
                                                <input id="nova-hi-desc" type="text" class="form-control form-control-sm" placeholder="Descrição (opcional)">
                                            </div>
                                            <div class="col-4 col-md-2">
                                                <input id="nova-hi-ini" type="text" class="form-control form-control-sm" placeholder="HH:MM" maxlength="5">
                                            </div>
                                            <div class="col-4 col-md-2">
                                                <input id="nova-hi-fim" type="text" class="form-control form-control-sm" placeholder="HH:MM" maxlength="5">
                                            </div>
                                            <div class="col-4 col-md-1">
                                                <input id="nova-hi-ops" type="number" class="form-control form-control-sm" value="1" min="1" title="Operadores">
                                            </div>
                                            <div class="col-12 col-md-1">
                                                <button class="btn btn-sm btn-warning w-100" onclick="editorRDO.salvarNovaHI(this)">
                                                    <i class="fas fa-save"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Observações (salvas no Sheets) -->
                            <div class="alert alert-info mb-2">
                                <h6 class="alert-heading d-flex align-items-center gap-2">
                                    <i class="fas fa-comment-dots me-1"></i>Observações do RDO
                                    <span class="edit-ctrl" style="display:none;">
                                        <button class="btn btn-link btn-sm p-0" onclick="editorRDO.mostrarEditObservacoes()" title="Editar observações"><i class="fas fa-pencil-alt" style="font-size:.75rem;"></i></button>
                                    </span>
                                </h6>
                                <div id="obs-view" class="view-only">${dados.observacoes ? escapeHtml(dados.observacoes) : '<em class="text-muted">Sem observações</em>'}</div>
                                <div id="obs-form" style="display:none;">
                                    <textarea id="obs-input" class="form-control form-control-sm mb-2" rows="2" placeholder="Observações..."></textarea>
                                    <div class="d-flex gap-2">
                                        <button class="btn btn-sm btn-success" onclick="editorRDO.salvarObservacoes(this)"><i class="fas fa-save me-1"></i>Salvar</button>
                                        <button class="btn btn-sm btn-outline-secondary" onclick="editorRDO.cancelarEditObservacoes()"><i class="fas fa-times me-1"></i>Cancelar</button>
                                    </div>
                                </div>
                            </div>

                        </div>
                        <div class="modal-footer">
                            <button id="btn-toggle-edicao" type="button" class="btn btn-outline-warning me-auto"
                                    onclick="editorRDO.ativarModoEdicao()">
                                <i class="fas fa-edit me-1"></i>Editar
                            </button>
                            <button class="btn btn-outline-danger edit-ctrl" style="display:none;"
                                    onclick="editorRDO.excluirRDO()">
                                <i class="fas fa-trash me-1"></i>Excluir RDO
                            </button>
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

    /**
     * Abre um pequeno modal para anotar observações em dias sem RDO (feriados, folgas…).
     * A nota é salva no Google Sheets via Apps Script — visível em todos os dispositivos.
     */
    abrirNotaDiaSemRDO(turma, dia, mes, ano) {
        const dataFmt   = `${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${ano}`;
        const notaAtual = (this.notas || []).find(n => n.turma === turma && n.data === dataFmt)?.nota || '';

        const modalId = 'modalNotaSemRDO';
        document.getElementById(modalId)?.remove();

        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-sm">
                    <div class="modal-content">
                        <div class="modal-header py-2" style="background:#9c27b0;color:#fff;">
                            <h6 class="modal-title mb-0">
                                <i class="fas fa-sticky-note me-1"></i>${escapeHtml(dataFmt)} · ${escapeHtml(turma)}
                            </h6>
                            <button type="button" class="btn-close btn-close-white btn-sm" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body pb-2">
                            <label class="form-label small text-muted mb-1">
                                Observação do dia <span class="badge" style="background:#9c27b0;font-size:.6rem;">Google Sheets</span>
                            </label>
                            <textarea id="nota-sem-rdo-input" class="form-control form-control-sm" rows="3"
                                      placeholder="Ex: Feriado Nacional, Folga compensatória…">${escapeHtml(notaAtual)}</textarea>
                            <div class="d-flex gap-2 mt-2">
                                <button id="nota-sem-rdo-salvar" class="btn btn-sm flex-fill" style="background:#9c27b0;color:#fff;">
                                    <i class="fas fa-save me-1"></i>Salvar
                                </button>
                                ${notaAtual ? `<button id="nota-sem-rdo-apagar" class="btn btn-sm btn-outline-danger">
                                    <i class="fas fa-trash me-1"></i>Apagar
                                </button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`);

        const modal = new bootstrap.Modal(document.getElementById(modalId));

        const _salvar = async (val) => {
            const btn = document.getElementById('nota-sem-rdo-salvar');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
            try {
                await editorRDO._api({ acao: 'salvarNotaDia', turma, data: dataFmt, nota: val });
                const idx = (this.notas || []).findIndex(n => n.turma === turma && n.data === dataFmt);
                if (val) {
                    if (idx >= 0) this.notas[idx].nota = val;
                    else (this.notas = this.notas || []).push({ turma, data: dataFmt, nota: val });
                } else {
                    if (idx >= 0) this.notas.splice(idx, 1);
                }
                modal.hide();
                setTimeout(() => this.renderizarTodos(), 60);
            } catch (err) {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i>Salvar'; }
                alert('Erro ao salvar nota: ' + err.message);
            }
        };

        document.getElementById('nota-sem-rdo-salvar').addEventListener('click', () => {
            _salvar((document.getElementById('nota-sem-rdo-input')?.value || '').trim());
        });
        document.getElementById('nota-sem-rdo-apagar')?.addEventListener('click', () => { _salvar(''); });

        modal.show();
        setTimeout(() => document.getElementById('nota-sem-rdo-input')?.focus(), 350);
    }
}

// Instância global
const calendarioTS = new CalendarioTS();
