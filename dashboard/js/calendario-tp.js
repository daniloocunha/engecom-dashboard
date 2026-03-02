/**
 * Calendário de Performance das TPs
 * Visualização mensal com detalhes diários
 */

class CalendarioTP {
    constructor() {
        this.dados = null;
        this.mesAtual = new Date().getMonth() + 1;
        this.anoAtual = new Date().getFullYear();
        this.turmaFiltro = null;
        this.modalCharts = []; // Track modal charts to prevent memory leaks
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
        this.turmaFiltro = turma;
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
     * Calcula HH produtivas de um dia
     * Usa Número RDO como chave de join (mais confiável que Número OS, que pode ser placeholder)
     */
    calcularHHDia(numeroRDO, data) {
        let hhTotal = 0;

        const servicosDoDia = this.dados.servicos.filter(s => {
            const numRDO = s['Número RDO'] || s.numeroRDO || s.numeroRdo || '';
            return numRDO === numeroRDO;
        });

        debugLog(`[CalendarioTP] Serviços encontrados para RDO=${numeroRDO}: ${servicosDoDia.length}`);

        servicosDoDia.forEach(servico => {
            const quantidade = parseFloat(servico.Quantidade || servico.quantidade || 0);
            const coeficiente = parseFloat(servico.Coeficiente || servico.coeficiente || 0);
            const hh = quantidade * coeficiente;
            debugLog(`[CalendarioTP] ${servico.descricao || servico.Descrição}: ${quantidade} × ${coeficiente} = ${hh} HH`);
            hhTotal += hh;
        });

        debugLog(`[CalendarioTP] ✅ HH Produtivas Total: ${hhTotal.toFixed(2)}`);
        return hhTotal;
    }

    /**
     * Calcula HH improdutivas de um dia
     * Usa Número RDO como chave de join (mais confiável que Número OS)
     */
    calcularHIDia(numeroRDO, data) {
        let hiTotal = 0;

        const hisDoDia = this.dados.horasImprodutivas.filter(hi => {
            const numRDO = hi['Número RDO'] || hi.numeroRDO || hi.numeroRdo || '';
            return numRDO === numeroRDO;
        });

        debugLog(`[CalendarioTP] HIs encontradas para RDO=${numeroRDO}: ${hisDoDia.length}`);

        hisDoDia.forEach(hi => {
            const hhImprodutivas = parseFloat(hi['HH Improdutivas'] || hi.hhImprodutivas || 0);
            debugLog(`[CalendarioTP] ${hi.tipo || hi.Tipo}: ${hhImprodutivas} HH`);
            hiTotal += hhImprodutivas;
        });

        debugLog(`[CalendarioTP] ✅ HH Improdutivas Total: ${hiTotal.toFixed(2)}`);
        return hiTotal;
    }

    /**
     * Obtém efetivo de um dia
     * Usa Número RDO como chave de join (mais confiável que Número OS)
     */
    obterEfetivoDia(numeroRDO, data) {
        debugLog(`[CalendarioTP] Buscando efetivo para RDO=${numeroRDO}`);

        const efetivoDia = this.dados.efetivos.find(ef => {
            const numRDO = ef['Número RDO'] || ef.numeroRDO || ef.numeroRdo || '';
            return numRDO === numeroRDO;
        });

        if (!efetivoDia) {
            debugLog(`[CalendarioTP] ⚠️ Efetivo NÃO encontrado para RDO=${numeroRDO}`);
            return { total: 0, operadores: 0, motoristas: 0, encarregado: 0, operadorEGP: 0, tecnicoSeguranca: 0, soldador: 0 };
        }

        // ✅ Calcular total somando TODAS as funções
        const encarregado = parseInt(efetivoDia['Encarregado Qtd'] || efetivoDia.encarregadoQtd || 0);
        const operadores = parseInt(efetivoDia['Operadores'] || efetivoDia.operadores || 0);
        const operadorEGP = parseInt(efetivoDia['Operador EGP'] || efetivoDia.operadorEGP || efetivoDia.operadorEgp || 0);
        const tecnicoSeguranca = parseInt(efetivoDia['Técnico Segurança'] || efetivoDia.tecnicoSeguranca || 0);
        const soldador = parseInt(efetivoDia['Soldador'] || efetivoDia.soldador || 0);
        const motoristas = parseInt(efetivoDia['Motoristas'] || efetivoDia.motoristas || 0);

        const total = encarregado + operadores + operadorEGP + tecnicoSeguranca + soldador + motoristas;

        debugLog(`[CalendarioTP] Efetivo detalhado: Enc=${encarregado}, Op=${operadores}, EGP=${operadorEGP}, TecSeg=${tecnicoSeguranca}, Sold=${soldador}, Mot=${motoristas} => TOTAL=${total}`);

        return {
            total,
            operadores,
            motoristas,
            encarregado,
            operadorEGP,
            tecnicoSeguranca,
            soldador
        };
    }

    /**
     * Obtém dados completos de um dia, agregando TODOS os RDOs.
     * Uma turma pode ter múltiplos RDOs no mesmo dia quando trabalha em 2+ O.S.
     */
    obterDadosDia(turma, dia, mes, ano) {
        const dataFormatada = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;

        // Buscar TODOS os RDOs do dia (pode haver mais de um quando a turma
        // trabalha em duas O.S e gera dois RDOs para a mesma data)
        const rdosDia = this.dados.rdos.filter(rdo => {
            const codigoTurma = rdo['Código Turma'] || rdo.codigoTurma || '';
            const data        = rdo.Data || rdo.data || '';
            const deletado    = (rdo['Deletado'] || rdo.deletado || '').toLowerCase();
            return codigoTurma === turma && data === dataFormatada && deletado !== 'sim';
        });

        if (rdosDia.length === 0) return null;

        const multiplosRDOs = rdosDia.length > 1;

        // Acumuladores para agregar os valores de todos os RDOs do dia
        let hhProdutivas   = 0;
        let hhImprodutivas = 0;
        const efetivo = { total: 0, operadores: 0, motoristas: 0, encarregado: 0, operadorEGP: 0, tecnicoSeguranca: 0, soldador: 0 };
        const servicos          = [];
        const horasImprodutivas = [];
        const numeroRDOs        = [];
        const encarregados      = new Set();
        const observacoesLista  = [];
        const hhPorOS           = []; // HH por O.S para exibição nas células do calendário

        rdosDia.forEach(rdoDia => {
            const numeroRDO = rdoDia['Número RDO'] || rdoDia.numeroRDO || '-';
            const numeroOS  = rdoDia['Número OS']  || rdoDia.numeroOS  || rdoDia.numeroOs || '';

            numeroRDOs.push(numeroRDO);

            const enc = rdoDia.Encarregado || rdoDia.encarregado || '';
            if (enc) encarregados.add(enc);

            // Cobrir todas as variações possíveis de normalização do campo Observações
            const obs = (rdoDia.Observações || rdoDia.observações || rdoDia.observacoes || rdoDia.Observacoes || '').trim();
            if (obs) observacoesLista.push(obs);

            // HH produtivas e improdutivas deste RDO
            const hhProdRDO  = this.calcularHHDia(numeroRDO, dataFormatada);
            const hhImprRDO  = this.calcularHIDia(numeroRDO, dataFormatada);
            hhProdutivas   += hhProdRDO;
            hhImprodutivas += hhImprRDO;

            // Normaliza a O.S para exibição: usa o campo ou extrai do prefixo do Número RDO
            const osDisplay = (() => {
                const os = numeroOS.trim();
                if (os && os.toLowerCase() !== 'sem o numero da os ainda' && os !== '0') return os;
                return numeroRDO.split('-')[0] || 'S/O.S';
            })();
            hhPorOS.push({ numeroOS: osDisplay, hhProdutivas: hhProdRDO, hhImprodutivas: hhImprRDO, totalHH: hhProdRDO + hhImprRDO });

            // Efetivo — soma os totais de cada RDO
            const ef = this.obterEfetivoDia(numeroRDO, dataFormatada);
            efetivo.total           += ef.total;
            efetivo.operadores      += ef.operadores;
            efetivo.motoristas      += ef.motoristas;
            efetivo.encarregado     += ef.encarregado;
            efetivo.operadorEGP     += ef.operadorEGP;
            efetivo.tecnicoSeguranca+= ef.tecnicoSeguranca;
            efetivo.soldador        += ef.soldador;

            // Serviços — inclui coluna O.S quando há múltiplos RDOs
            const servicosRDO = this.dados.servicos
                .filter(s => (s['Número RDO'] || s.numeroRDO || s.numeroRdo || '') === numeroRDO)
                .map(s => ({
                    numeroRDO: multiplosRDOs ? numeroRDO : null,
                    numeroOS:  multiplosRDOs ? numeroOS  : null,
                    descricao: s['Descrição'] || s.descricao || '-',
                    quantidade: parseFloat(s.Quantidade || s.quantidade || 0),
                    unidade:    s.Unidade || s.unidade || 'UN',
                    hh: (parseFloat(s.Quantidade || s.quantidade || 0) *
                         parseFloat(s.Coeficiente || s.coeficiente || 0)).toFixed(2)
                }));
            servicos.push(...servicosRDO);

            // Horas Improdutivas
            const hiRDO = this.dados.horasImprodutivas
                .filter(hi => (hi['Número RDO'] || hi.numeroRDO || hi.numeroRdo || '') === numeroRDO)
                .map(hi => ({
                    numeroRDO:  multiplosRDOs ? numeroRDO : null,
                    numeroOS:   multiplosRDOs ? osDisplay : null,
                    tipo:       hi.Tipo || hi.tipo || '-',
                    descricao:  hi['Descrição'] || hi.descricao || '-',
                    horaInicio: hi['Hora Início'] || hi.horaInicio || '-',
                    horaFim:    hi['Hora Fim']    || hi.horaFim   || '-',
                    hh: parseFloat(hi['HH Improdutivas'] || hi.hhImprodutivas || 0).toFixed(2)
                }));
            debugLog(`[CalendarioTP] HI para RDO=${numeroRDO} (OS ${osDisplay}): ${hiRDO.length} registro(s), ${hhImprRDO.toFixed(2)} HH improdutivas`);
            horasImprodutivas.push(...hiRDO);
        });

        const resultado = {
            numeroRDO:    numeroRDOs.join(', '),
            multiplosRDOs,
            qtdRDOs:      rdosDia.length,
            data:         dataFormatada,
            turma,
            encarregado:  Array.from(encarregados).join(', ') || '-',
            hhProdutivas,
            hhImprodutivas,
            totalHH:      hhProdutivas + hhImprodutivas,
            hhPorOS,
            efetivo,
            observacoes:  observacoesLista.join(' | '),
            servicos,
            horasImprodutivas
        };

        debugLog(`[CalendarioTP] ✅ Dados do dia compilados (${rdosDia.length} RDO(s)):`, {
            numeros:       resultado.numeroRDO,
            hhProdutivas:  resultado.hhProdutivas,
            hhImprodutivas:resultado.hhImprodutivas,
            totalHH:       resultado.totalHH,
            efetivoTotal:  resultado.efetivo.total
        });

        return resultado;
    }

    /**
     * Renderiza calendário para uma turma (estilo novo)
     */
    renderizarCalendario(turma) {
        const { totalDias, primeiroDiaSemana } = this.getDiasDoMes(this.mesAtual, this.anoAtual);
        const META_DIARIA = METAS.META_DIARIA_TP; // Meta dinâmica de HH/dia para TPs

        // Calcular estatísticas mensais da turma
        const stats = this.calcularEstatisticasTurma(turma);

        // Gerar ID único para o modal
        const modalId = `modalOS_${turma.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Injetar modal no body (Bootstrap requer que modais estejam fora de containers posicionados)
        const modalExistente = document.getElementById(modalId);
        if (modalExistente) modalExistente.remove();

        const modalHTML = `
            <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-list me-2"></i>O.S Trabalhadas - ${turma}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p class="text-muted mb-3">
                                <strong>Período:</strong> ${this.mesAtual}/${this.anoAtual}
                            </p>
                            <div class="list-group">
                                ${Array.from(stats.osSet).sort().map(os => `
                                    <div class="list-group-item d-flex align-items-center">
                                        <i class="fas fa-file-alt text-primary me-3"></i>
                                        <strong>${os}</strong>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="mt-3 alert alert-info mb-0">
                                <i class="fas fa-info-circle me-2"></i>
                                <strong>Total:</strong> ${stats.numeroOS} O.S únicas trabalhadas neste mês
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        let html = `
            <div class="card mb-4 shadow-sm">
                <div class="card-header bg-primary text-white">
                    <div class="row align-items-center">
                        <div class="col-md-3">
                            <h5 class="mb-0"><i class="fas fa-industry me-2"></i>${turma}</h5>
                        </div>
                        <div class="col-md-9">
                            <div class="row g-2">
                                <div class="col-3 text-center">
                                    <small class="d-block opacity-75 mb-1">Média Operadores</small>
                                    <strong class="d-block">${stats.mediaOperadores}</strong>
                                </div>
                                <div class="col-3 text-center">
                                    <small class="d-block opacity-75 mb-1">Nº de O.S</small>
                                    <span class="d-block fw-bold"
                                          data-bs-toggle="modal"
                                          data-bs-target="#${modalId}"
                                          role="button"
                                          tabindex="0"
                                          style="cursor: pointer; transition: opacity 0.2s;"
                                          onmouseover="this.style.opacity='0.7'"
                                          onmouseout="this.style.opacity='1'">
                                        ${stats.numeroOS} <i class="fas fa-list-ul ms-1" style="font-size: 0.7em; opacity: 0.8;"></i>
                                    </span>
                                </div>
                                <div class="col-3 text-center">
                                    <small class="d-block opacity-75 mb-1">HH Improdutivas</small>
                                    <strong class="d-block">${stats.hhImprodutivas.toFixed(1)}</strong>
                                </div>
                                <div class="col-3 text-center">
                                    <small class="d-block opacity-75 mb-1">HH Total</small>
                                    <strong class="d-block">${stats.hhTotal.toFixed(1)}</strong>
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

        // Adicionar células vazias antes do primeiro dia
        for (let i = 0; i < primeiroDiaSemana; i++) {
            html += '<div class="calendario-dia vazio"></div>';
        }

        // Adicionar dias do mês
        for (let dia = 1; dia <= totalDias; dia++) {
            const dadosDia = this.obterDadosDia(turma, dia, this.mesAtual, this.anoAtual);

            if (dadosDia) {
                const hhTotal = dadosDia.totalHH;
                const hhProdutivas = dadosDia.hhProdutivas || 0;
                const hhImprodutivas = dadosDia.hhImprodutivas || 0;
                const percentualMeta = hhTotal / META_DIARIA;

                // Determinar status (cor)
                let status = 'vermelho';
                let corStatus = '#F44336';

                if (hhTotal >= META_DIARIA) {
                    status = 'verde';
                    corStatus = '#4CAF50';
                } else if (hhTotal >= META_DIARIA * 0.83) {
                    status = 'amarelo';
                    corStatus = '#FFC107';
                } else if (hhProdutivas === 0 && hhTotal > 0) {
                    status = 'laranja';
                    corStatus = '#FF9800';
                }

                html += `
                    <div class="calendario-dia trabalhado ${status}"
                         style="border-left: 4px solid ${corStatus}; cursor: pointer;"
                         onclick="calendarioTP.mostrarDetalhesDia('${turma}', ${dia}, ${this.mesAtual}, ${this.anoAtual})">
                        <div class="dia-numero">${dia}</div>
                        ${dadosDia.hhPorOS.map(item => `
                            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:2px;">
                                <span style="font-size:1.05em; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55%;">${item.numeroOS}</span>
                                <strong class="dia-hh" style="margin:0; font-size:1.05em;">${item.totalHH.toFixed(1)} HH</strong>
                            </div>
                        `).join('')}
                        <div class="dia-meta">
                            ${(percentualMeta * 100).toFixed(0)}% da meta
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
                            <div class="dia-obs" style="color: #ff9800;">
                                📝 ${dadosDia.observacoes.substring(0, 30)}${dadosDia.observacoes.length > 30 ? '...' : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            } else {
                // Dia sem trabalho
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
                    <div class="calendario-legenda mt-4">
                        <h6>Legenda:</h6>
                        <div class="d-flex gap-3 flex-wrap">
                            <div><span class="badge" style="background-color: #4CAF50">Verde</span> ≥ 100% da meta (≥ ${META_DIARIA} HH)</div>
                            <div><span class="badge" style="background-color: #FFC107">Amarelo</span> 83-99% da meta (${Math.round(META_DIARIA * 0.83)}-${META_DIARIA - 1} HH)</div>
                            <div><span class="badge" style="background-color: #F44336">Vermelho</span> < 83% da meta (< ${Math.round(META_DIARIA * 0.83)} HH)</div>
                            <div><span class="badge" style="background-color: #FF9800">Laranja</span> Sem produção (só HI)</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Calcula estatísticas mensais de uma turma
     */
    calcularEstatisticasTurma(turma) {
        const rdosTurma = this.dados.rdos.filter(rdo => {
            const turmaBanco = rdo['Código Turma'] || rdo.codigoTurma || '';
            const dataBanco = rdo['Data'] || rdo.data || '';
            const deletado = (rdo['Deletado'] || rdo.deletado || '').toLowerCase();
            if (!dataBanco) return false;
            const [dia, mes, ano] = dataBanco.split('/');
            const mesRDO = parseInt(mes);
            const anoRDO = parseInt(ano);
            return turmaBanco === turma
                && mesRDO === this.mesAtual
                && anoRDO === this.anoAtual
                && deletado !== 'sim';
        });

        // Calcular média de operadores
        let totalOperadores = 0;
        let diasComEfetivo = 0;
        rdosTurma.forEach(rdo => {
            const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || '';
            const efetivo = this.dados.efetivos.find(e =>
                (e['Número RDO'] || e.numeroRDO) === numeroRDO
            );
            if (efetivo) {
                const operadores = parseInt(efetivo['Operadores'] || efetivo.operadores || 0);
                totalOperadores += operadores;
                diasComEfetivo++;
            }
        });
        const mediaOperadores = diasComEfetivo > 0 ? (totalOperadores / diasComEfetivo).toFixed(1) : 0;

        // Contar O.S únicas (excluindo valores inválidos)
        const osSet = new Set();
        rdosTurma.forEach(rdo => {
            const numeroOS = (rdo['Número OS'] || rdo.numeroOS || '').trim();
            if (numeroOS && numeroOS.toLowerCase() !== 'sem os' && numeroOS !== '0') {
                osSet.add(numeroOS);
            }
        });
        const numeroOS = osSet.size;

        // Calcular HH Improdutivas
        let hhImprodutivas = 0;
        rdosTurma.forEach(rdo => {
            const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || '';
            const his = this.dados.horasImprodutivas.filter(hi =>
                (hi['Número RDO'] || hi.numeroRDO) === numeroRDO
            );
            his.forEach(hi => {
                hhImprodutivas += parseFloat(hi['HH Improdutivas'] || hi.hhImprodutivas || 0);
            });
        });

        // Calcular HH Total (produtivas + improdutivas)
        let hhProdutivas = 0;
        rdosTurma.forEach(rdo => {
            const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || '';
            const servicos = this.dados.servicos.filter(s =>
                (s['Número RDO'] || s.numeroRDO) === numeroRDO
            );
            servicos.forEach(s => {
                const qtd = parseFloat(s['Quantidade'] || s.quantidade || 0);
                const coef = parseFloat(s['Coeficiente'] || s.coeficiente || 0);
                hhProdutivas += qtd * coef;
            });
        });
        const hhTotal = hhProdutivas + hhImprodutivas;

        return {
            mediaOperadores,
            numeroOS,
            osSet,  // Retornar o Set para usar no modal
            hhImprodutivas,
            hhTotal
        };
    }

    /**
     * Mostra detalhes de um dia em modal
     */
    mostrarDetalhesDia(turma, dia, mes, ano) {
        const dados = this.obterDadosDia(turma, dia, mes, ano);

        if (!dados) return;

        debugLog('[CalendarioTP] 🔵 Renderizando modal com dados:', {
            hhProdutivas: dados.hhProdutivas,
            hhImprodutivas: dados.hhImprodutivas,
            totalHH: dados.totalHH,
            efetivoTotal: dados.efetivo.total
        });

        const modalHTML = `
            <div class="modal fade" id="modalDetalhesDia" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-calendar-day me-2"></i>
                                Detalhes do Dia - ${dados.data}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <!-- Cabeçalho -->
                            <div class="row mb-4">
                                <div class="col-md-12">
                                    <h6 class="text-muted mb-2">
                                        <i class="fas fa-users me-2"></i>${dados.turma} |
                                        <i class="fas fa-user me-2"></i>${dados.encarregado} |
                                        <i class="fas fa-file-alt me-2"></i>RDO: ${dados.numeroRDO}
                                        ${dados.multiplosRDOs ? `<span class="badge bg-warning text-dark ms-2"><i class="fas fa-layer-group me-1"></i>${dados.qtdRDOs} RDOs neste dia</span>` : ''}
                                    </h6>
                                </div>
                            </div>

                            <!-- Métricas -->
                            <div class="row mb-4">
                                <div class="col-md-3">
                                    <div class="text-center p-3 bg-success bg-opacity-10 rounded">
                                        <h4 class="mb-1" style="color: #155724 !important; font-size: 2rem !important; font-weight: bold !important;">${(dados.hhProdutivas || 0).toFixed(2)}</h4>
                                        <small class="text-muted">HH Produtivas</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center p-3 bg-warning bg-opacity-10 rounded">
                                        <h4 class="mb-1" style="color: #856404 !important; font-size: 2rem !important; font-weight: bold !important;">${(dados.hhImprodutivas || 0).toFixed(2)}</h4>
                                        <small class="text-muted">HH Improdutivas</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center p-3 bg-primary bg-opacity-10 rounded">
                                        <h4 class="mb-1" style="color: #084298 !important; font-size: 2rem !important; font-weight: bold !important;">${(dados.totalHH || 0).toFixed(2)}</h4>
                                        <small class="text-muted">Total HH</small>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="text-center p-3 bg-info bg-opacity-10 rounded">
                                        <h4 class="mb-1" style="color: #055160 !important; font-size: 2rem !important; font-weight: bold !important;">${dados.efetivo?.total || 0}</h4>
                                        <small class="text-muted">Efetivo Total</small>
                                        <div class="mt-1">
                                            <small style="color: #6c757d !important;">${dados.efetivo?.operadores || 0} op. | ${dados.efetivo?.motoristas || 0} mot.</small>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Gráficos de Pizza -->
                            <div class="row mb-4">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header bg-light">
                                            <h6 class="mb-0"><i class="fas fa-chart-pie me-2"></i>Distribuição HH</h6>
                                        </div>
                                        <div class="card-body">
                                            <canvas id="chartDistribuicaoHH" style="max-height: 250px;"></canvas>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header bg-light">
                                            <h6 class="mb-0"><i class="fas fa-chart-pie me-2"></i>Detalhamento Completo</h6>
                                        </div>
                                        <div class="card-body">
                                            <canvas id="chartDetalhamentoCompleto" style="max-height: 250px;"></canvas>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Serviços -->
                            ${dados.servicos.length > 0 ? `
                                <div class="mb-4">
                                    <h6 class="text-muted mb-3">
                                        <i class="fas fa-tools me-2"></i>Serviços Realizados
                                    </h6>
                                    <div class="table-responsive">
                                        <table class="table table-sm table-hover">
                                            <thead class="table-light">
                                                <tr>
                                                    ${dados.multiplosRDOs ? '<th>O.S</th>' : ''}
                                                    <th>Descrição</th>
                                                    <th class="text-center">Quantidade</th>
                                                    <th class="text-center">Unidade</th>
                                                    <th class="text-end">HH</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${dados.servicos.map(s => `
                                                    <tr>
                                                        ${dados.multiplosRDOs ? `<td><span class="badge bg-secondary">${s.numeroOS || '-'}</span></td>` : ''}
                                                        <td>${s.descricao}</td>
                                                        <td class="text-center">${s.quantidade}</td>
                                                        <td class="text-center">${s.unidade}</td>
                                                        <td class="text-end"><strong>${s.hh}</strong></td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
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
                                                    ${dados.multiplosRDOs ? '<th>O.S</th>' : ''}
                                                    <th>Tipo</th>
                                                    <th>Descrição</th>
                                                    <th class="text-center">Hora Início</th>
                                                    <th class="text-center">Hora Fim</th>
                                                    <th class="text-end">HH</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${dados.horasImprodutivas.map(hi => `
                                                    <tr>
                                                        ${dados.multiplosRDOs ? `<td><span class="badge bg-secondary">${hi.numeroOS || '-'}</span></td>` : ''}
                                                        <td><span class="badge bg-warning">${hi.tipo}</span></td>
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
                            ${dados.observacoes && dados.observacoes.trim() !== '' ? `
                                <div class="alert alert-info mb-0">
                                    <h6 class="alert-heading">
                                        <i class="fas fa-comment-dots me-2"></i>Observações
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

        // Remover modal antigo se existir
        const modalAntigo = document.getElementById('modalDetalhesDia');
        if (modalAntigo) modalAntigo.remove();

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('modalDetalhesDia'));
        modal.show();

        // Renderizar gráficos após o modal ser exibido
        setTimeout(() => this.renderizarGraficosModal(dados), 100);
    }

    /**
     * Renderiza gráficos de pizza no modal
     */
    renderizarGraficosModal(dados) {
        // Destruir gráficos anteriores para evitar memory leak
        this.modalCharts.forEach(chart => chart.destroy());
        this.modalCharts = [];

        // Gráfico 1: Distribuição HH (Produtivas vs Improdutivas)
        const ctxDistribuicao = document.getElementById('chartDistribuicaoHH');
        if (ctxDistribuicao) {
            const chart1 = new Chart(ctxDistribuicao, {
                type: 'pie',
                data: {
                    labels: ['HH Produtivas', 'HH Improdutivas'],
                    datasets: [{
                        data: [dados.hhProdutivas || 0, dados.hhImprodutivas || 0],
                        backgroundColor: ['#28a745', '#ffc107'],
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                    return `${label}: ${value.toFixed(2)} HH (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
            this.modalCharts.push(chart1);
        }

        // Gráfico 2: Detalhamento Completo (todos os serviços e HIs)
        const ctxDetalhamento = document.getElementById('chartDetalhamentoCompleto');
        if (ctxDetalhamento && (dados.servicos.length > 0 || dados.horasImprodutivas.length > 0)) {
            const labels = [];
            const values = [];
            const colors = [];

            // Paleta de cores variadas
            const coresServicos = ['#28a745', '#20c997', '#17a2b8', '#0d6efd', '#6610f2', '#6f42c1'];
            const coresHI = ['#ffc107', '#fd7e14', '#dc3545', '#e83e8c', '#d63384', '#6c757d'];

            // Adicionar serviços (cores verdes variadas)
            dados.servicos.forEach((servico, index) => {
                labels.push(servico.descricao.length > 30 ? servico.descricao.substring(0, 27) + '...' : servico.descricao);
                values.push(parseFloat(servico.hh) || 0);
                colors.push(coresServicos[index % coresServicos.length]);
            });

            // Adicionar HIs (cores amarelas/laranjas variadas)
            dados.horasImprodutivas.forEach((hi, index) => {
                const label = hi.descricao.length > 30 ? hi.descricao.substring(0, 27) + '...' : hi.descricao;
                labels.push(`[HI] ${label}`);
                values.push(parseFloat(hi.hh) || 0);
                colors.push(coresHI[index % coresHI.length]);
            });

            const chart2 = new Chart(ctxDetalhamento, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: {
                                    size: 10
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                    return `${label}: ${value.toFixed(2)} HH (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
            this.modalCharts.push(chart2);
        }
    }

    /**
     * Renderiza todos os calendários das TPs
     */
    renderizarTodos() {
        const container = document.getElementById('calendarioTPContainer');
        if (!container) {
            debugLog('[CalendarioTP] Container calendarioTPContainer não encontrado');
            return;
        }

        debugLog('[CalendarioTP] Renderizando calendários...');

        // Extrair TPs
        const tpsSet = new Set();
        this.dados.rdos.forEach(rdo => {
            const turma = rdo['Código Turma'] || rdo.codigoTurma || '';
            if (turma && (turma.startsWith('TP-') || turma.startsWith('TP '))) {
                tpsSet.add(turma);
            }
        });

        const tps = Array.from(tpsSet).sort();

        debugLog('[CalendarioTP] TPs encontradas:', tps);
        debugLog('[CalendarioTP] Filtros:', { mes: this.mesAtual, ano: this.anoAtual, turma: this.turmaFiltro });

        if (tps.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Nenhuma TP encontrada para o período selecionado.
                </div>
            `;
            return;
        }

        let html = '';
        tps.forEach(tp => {
            // Se houver filtro de turma, mostrar apenas a selecionada
            if (this.turmaFiltro && this.turmaFiltro !== 'todas' && this.turmaFiltro !== tp) {
                return;
            }
            debugLog('[CalendarioTP] Renderizando calendário para:', tp);
            html += this.renderizarCalendario(tp);
        });

        container.innerHTML = html;
        debugLog('[CalendarioTP] Calendários renderizados com sucesso');
    }
}

// Instância global
const calendarioTP = new CalendarioTP();
