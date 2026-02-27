/**
 * Cálculos Financeiros e de Medição
 * TMCs e TPs - Engecom/Encogel
 */

class CalculadoraMedicao {
    constructor() {
        this.rdos = [];
        this.servicos = [];
        this.horasImprodutivas = [];
        this.efetivos = [];
        this.equipamentos = [];

        // 🚀 Sistema de cache para otimização de performance
        this.cacheCalculos = new Map();
        this.cacheHabilitado = true;

        // ⚡ Índices Map para lookups O(1) (Sprint 3)
        this.indices = {
            servicosPorRDO: new Map(),
            hiPorRDO: new Map(),
            efetivosPorRDO: new Map(),
            rdosPorTurma: new Map(),
            turmasUnicas: new Set()
        };
    }

    /**
     * Gera chave de cache baseada nos parâmetros
     */
    gerarChaveCache(tipo, ...params) {
        return `${tipo}-${params.join('-')}`;
    }

    /**
     * Obtém valor do cache
     */
    obterCache(chave) {
        if (!this.cacheHabilitado) return null;
        return this.cacheCalculos.get(chave) || null;
    }

    /**
     * Salva valor no cache
     */
    salvarCache(chave, valor) {
        if (!this.cacheHabilitado) return;
        this.cacheCalculos.set(chave, valor);
        debugLog(`[Cache] ✅ Salvou: ${chave}`);
    }

    /**
     * Limpa todo o cache (usar ao recarregar dados)
     */
    limparCache() {
        const tamanhoAntes = this.cacheCalculos.size;
        this.cacheCalculos.clear();
        debugLog(`[Cache] 🗑️ Limpou ${tamanhoAntes} entradas`);
    }

    /**
     * ⚡ Constrói índices para lookups rápidos O(1) (Sprint 3)
     */
    construirIndices() {
        console.time('[Indices] Construção de índices');

        // Limpar índices anteriores
        this.indices.servicosPorRDO.clear();
        this.indices.hiPorRDO.clear();
        this.indices.efetivosPorRDO.clear();
        this.indices.rdosPorTurma.clear();
        this.indices.turmasUnicas.clear();

        // Indexar serviços por numeroRDO
        this.servicos.forEach(servico => {
            const numeroRDO = FieldHelper.getRDONumeroRDO(servico);
            if (!this.indices.servicosPorRDO.has(numeroRDO)) {
                this.indices.servicosPorRDO.set(numeroRDO, []);
            }
            this.indices.servicosPorRDO.get(numeroRDO).push(servico);
        });

        // Indexar HIs por numeroRDO
        this.horasImprodutivas.forEach(hi => {
            const numeroRDO = FieldHelper.getRDONumeroRDO(hi);
            if (!this.indices.hiPorRDO.has(numeroRDO)) {
                this.indices.hiPorRDO.set(numeroRDO, []);
            }
            this.indices.hiPorRDO.get(numeroRDO).push(hi);
        });

        // Indexar efetivos por numeroRDO
        this.efetivos.forEach(efetivo => {
            const numeroRDO = FieldHelper.getRDONumeroRDO(efetivo);
            this.indices.efetivosPorRDO.set(numeroRDO, efetivo);
        });

        // Indexar RDOs por turma
        this.rdos.forEach(rdo => {
            const turma = FieldHelper.getRDOCodigoTurma(rdo);
            if (!this.indices.rdosPorTurma.has(turma)) {
                this.indices.rdosPorTurma.set(turma, []);
            }
            this.indices.rdosPorTurma.get(turma).push(rdo);
            this.indices.turmasUnicas.add(turma);
        });

        console.timeEnd('[Indices] Construção de índices');
        debugLog('[Indices] ✅ Índices construídos:', {
            servicosIndexados: this.indices.servicosPorRDO.size,
            hisIndexados: this.indices.hiPorRDO.size,
            efetivosIndexados: this.indices.efetivosPorRDO.size,
            turmasUnicas: this.indices.turmasUnicas.size
        });
    }

    /**
     * Carrega dados do Google Sheets
     */
    async carregarDados(rdos, servicos, hi, efetivos, equipamentos) {
        this.rdos = rdos;
        this.servicos = servicos;
        this.horasImprodutivas = hi;
        this.efetivos = efetivos;
        this.equipamentos = equipamentos;

        // ⚡ Construir índices após carregar dados (Sprint 3)
        this.construirIndices();
    }

    // ====================================
    // CÁLCULOS PARA TMC
    // ====================================

    /**
     * Calcula medição de uma TMC
     * Regra: Valor fixo + proporcional se dias trabalhados > dias úteis
     */
    calcularMedicaoTMC(turma, mes, ano) {
        const rdosTurma = this.filtrarRDOsPorTurma(turma, mes, ano);

        if (rdosTurma.length === 0) {
            console.warn(`[TMC] Nenhum RDO para ${turma} em ${mes}/${ano}`);
            return null;
        }

        // Contar dias trabalhados (RUMO conta, ENGECOM não conta)
        const diasTrabalhados = this.contarDiasTrabalhadosMedicao(rdosTurma);

        // Dias úteis do mês (pode vir do usuário ou de uma função)
        const diasUteis = this.getDiasUteis(mes, ano);

        // ✅ URGENTE: Validar divisão por zero
        if (!diasUteis || diasUteis <= 0) {
            console.error(`❌ [CRÍTICO] Dias úteis inválido para ${mes}/${ano}: ${diasUteis}`);
            throw new Error(`Dias úteis inválido (${diasUteis}) para ${mes}/${ano}. Configure dias úteis corretamente.`);
        }

        // ✅ URGENTE: Validar dados antes de calcular
        if (diasTrabalhados > diasUteis * 2) {
            console.warn(`⚠️ [TMC] Dias trabalhados (${diasTrabalhados}) muito maior que dias úteis (${diasUteis}) para ${turma}. Pode indicar RDOs duplicados.`);
        }

        // Calcular médias
        const mediaEncarregado = diasTrabalhados / diasUteis;
        const mediaOperadores = this.calcularMediaOperadores(rdosTurma, diasUteis);

        // ✅ URGENTE: Validar resultados
        if (isNaN(mediaEncarregado) || !isFinite(mediaEncarregado)) {
            console.error(`❌ [CRÍTICO] Média encarregado inválida: ${mediaEncarregado}`);
            throw new Error(`Cálculo de média encarregado resultou em ${mediaEncarregado}`);
        }

        if (isNaN(mediaOperadores) || !isFinite(mediaOperadores)) {
            console.error(`❌ [CRÍTICO] Média operadores inválida: ${mediaOperadores}`);
            throw new Error(`Cálculo de média operadores resultou em ${mediaOperadores}`);
        }
        const mediaCaminhao = diasTrabalhados / diasUteis;

        // Valores ENGECOM
        const valorEncarregado = mediaEncarregado * PRECOS_ENGECOM.ENCARREGADO_MES;
        const valorOperadores = mediaOperadores * PRECOS_ENGECOM.OPERADOR_MES;
        const totalEngecom = valorEncarregado + valorOperadores;

        // Valores ENCOGEL
        const valorCaminhao = mediaCaminhao * PRECOS_ENCOGEL.CAMINHAO_CABINADO_MES;
        const totalEncogel = valorCaminhao;

        // Total geral
        const totalGeral = totalEngecom + totalEncogel;

        return {
            turma,
            tipo: 'TMC',
            mes,
            ano,
            diasUteis,
            diasTrabalhados,
            mediaEncarregado,
            mediaOperadores,
            mediaCaminhao,
            engecom: {
                encarregado: valorEncarregado,
                operadores: valorOperadores,
                total: totalEngecom
            },
            encogel: {
                caminhao: valorCaminhao,
                total: totalEncogel
            },
            totalGeral,
            rdos: rdosTurma
        };
    }

    /**
     * Calcula média de operadores ao longo do mês (considera variações diárias)
     */
    calcularMediaOperadores(rdos, diasUteis) {
        // ✅ Validar antes de calcular
        if (!diasUteis || diasUteis <= 0) {
            console.error(`❌ [CRÍTICO] diasUteis inválido em calcularMediaOperadores: ${diasUteis}`);
            throw new Error(`diasUteis inválido: ${diasUteis}`);
        }

        let totalOperadoresDia = 0;

        rdos.forEach(rdo => {
            // ⚡ Lookup O(1) via índice Map (Sprint 3)
            const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || rdo.numeroRdo || '';
            const efetivo = this.indices.efetivosPorRDO.get(numeroRDO);

            if (efetivo) {
                totalOperadoresDia += parseInt(efetivo.operadores || 0);
            } else {
                // ✅ Validar se COMPOSICAO_PADRAO existe e usar fallback seguro
                if (typeof COMPOSICAO_PADRAO !== 'undefined' && COMPOSICAO_PADRAO.TMC && COMPOSICAO_PADRAO.TMC.operadores) {
                    totalOperadoresDia += COMPOSICAO_PADRAO.TMC.operadores;
                } else {
                    console.warn(`⚠️ COMPOSICAO_PADRAO.TMC não definido, usando valor padrão de ${METAS.OPERADORES_TMC_PADRAO} operadores`);
                    totalOperadoresDia += METAS.OPERADORES_TMC_PADRAO; // Fallback seguro: valor padrão para evitar divisão por zero
                }
            }
        });

        // Média = total de operadores-dia / dias úteis
        const media = totalOperadoresDia / diasUteis;

        // ✅ Validar resultado
        if (isNaN(media) || !isFinite(media)) {
            console.error(`❌ [CRÍTICO] Média operadores inválida: totalOperadoresDia=${totalOperadoresDia}, diasUteis=${diasUteis}, resultado=${media}`);
            throw new Error(`Cálculo de média operadores resultou em ${media}`);
        }

        return media;
    }

    /**
     * Calcula média de efetivo total para um conjunto de RDOs
     * @param {Array} rdos - RDOs da turma
     * @param {Number} diasUteis - Dias úteis do mês
     * @returns {Object} - { total, operadores, encarregado, motoristas, soldadores }
     */
    calcularMediaEfetivo(rdos, diasUteis) {
        if (!diasUteis || diasUteis <= 0) {
            console.error(`❌ [CRÍTICO] diasUteis inválido em calcularMediaEfetivo: ${diasUteis}`);
            throw new Error(`diasUteis inválido: ${diasUteis}`);
        }

        let totalEfetivoDia = {
            total: 0,
            operadores: 0,
            encarregado: 0,
            motoristas: 0,
            soldadores: 0
        };

        rdos.forEach(rdo => {
            // ⚡ Lookup O(1) via índice Map (idêntico ao usado em calcularMediaOperadores)
            const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || rdo.numeroRdo || '';
            const efetivo = this.indices.efetivosPorRDO.get(numeroRDO);

            if (efetivo) {
                const operadores = parseInt(efetivo['Operadores'] || efetivo.operadores || 0);
                const encarregado = parseInt(efetivo['Encarregado Qtd'] || efetivo.encarregadoQtd || 0);
                const motoristas = parseInt(efetivo['Motoristas'] || efetivo.motoristas || 0);
                const soldadores = parseInt(efetivo['Soldador'] || efetivo.soldador || 0);
                const total = operadores + encarregado + motoristas + soldadores;

                totalEfetivoDia.total += total;
                totalEfetivoDia.operadores += operadores;
                totalEfetivoDia.encarregado += encarregado;
                totalEfetivoDia.motoristas += motoristas;
                totalEfetivoDia.soldadores += soldadores;
            }
        });

        // Calcular médias dividindo pelo número de dias úteis
        const mediaEfetivo = {
            total: totalEfetivoDia.total / diasUteis,
            operadores: totalEfetivoDia.operadores / diasUteis,
            encarregado: totalEfetivoDia.encarregado / diasUteis,
            motoristas: totalEfetivoDia.motoristas / diasUteis,
            soldadores: totalEfetivoDia.soldadores / diasUteis
        };

        // Validar resultado
        if (isNaN(mediaEfetivo.total) || !isFinite(mediaEfetivo.total)) {
            console.error(`❌ [CRÍTICO] Média efetivo inválida`);
            throw new Error(`Cálculo de média efetivo resultou em valores inválidos`);
        }

        return mediaEfetivo;
    }

    /**
     * Calcula média de efetivo para todas as turmas de um tipo específico
     * @param {String} tipo - 'TP', 'TMC' ou 'TS'
     * @param {Number} mes - Mês
     * @param {Number} ano - Ano
     * @returns {Object} - Média de efetivo agregada
     */
    calcularMediaEfetivoGeral(tipo, mes, ano) {
        const turmas = this.getTurmasPorTipo(tipo, mes, ano);
        const diasUteis = this.getDiasUteis(mes, ano);

        if (!turmas || turmas.length === 0) {
            return {
                total: 0,
                operadores: 0,
                encarregado: 0,
                motoristas: 0,
                soldadores: 0
            };
        }

        let somaMedias = {
            total: 0,
            operadores: 0,
            encarregado: 0,
            motoristas: 0,
            soldadores: 0
        };

        turmas.forEach(turma => {
            const rdosTurma = this.filtrarRDOsPorTurma(turma, mes, ano);
            if (rdosTurma.length > 0) {
                const media = this.calcularMediaEfetivo(rdosTurma, diasUteis);
                somaMedias.total += media.total;
                somaMedias.operadores += media.operadores;
                somaMedias.encarregado += media.encarregado;
                somaMedias.motoristas += media.motoristas;
                somaMedias.soldadores += media.soldadores;
            }
        });

        return somaMedias;
    }

    // ====================================
    // CÁLCULOS PARA TP
    // ====================================

    /**
     * Calcula medição de uma TP
     * Regra: SLA baseado em HH (serviços + improdutivas), limite 110%
     */
    calcularMedicaoTP(turma, mes, ano) {
        const rdosTurma = this.filtrarRDOsPorTurma(turma, mes, ano);

        if (rdosTurma.length === 0) {
            console.warn(`[TP] Nenhum RDO para ${turma} em ${mes}/${ano}`);
            return null;
        }

        const diasUteis = this.getDiasUteis(mes, ano);

        // ✅ URGENTE: Validar dias úteis
        if (!diasUteis || diasUteis <= 0) {
            console.error(`❌ [CRÍTICO] Dias úteis inválido para ${mes}/${ano}: ${diasUteis}`);
            throw new Error(`Dias úteis inválido (${diasUteis}) para ${mes}/${ano}`);
        }

        const metaMensal = calcularMetaMensalTP(diasUteis);

        // ✅ URGENTE: Validar meta
        if (!metaMensal || metaMensal <= 0 || isNaN(metaMensal)) {
            console.error(`❌ [CRÍTICO] Meta mensal inválida: ${metaMensal} (diasUteis=${diasUteis})`);
            throw new Error(`Meta mensal inválida: ${metaMensal}`);
        }

        // Calcular HH total
        const hhServicos = this.calcularHHServicos(rdosTurma);
        const hhImprodutivas = this.calcularHHImprodutivas(rdosTurma);

        // ✅ URGENTE: Validar HH
        if (isNaN(hhServicos) || isNaN(hhImprodutivas)) {
            console.error(`❌ [CRÍTICO] HH inválidas: serviços=${hhServicos}, improdutivas=${hhImprodutivas}`);
            throw new Error(`HH calculadas inválidas`);
        }

        const hhTotal = hhServicos + hhImprodutivas;

        // Percentual do SLA atingido
        const percentualSLA = Math.min(hhTotal / metaMensal, METAS.LIMITE_FATURAMENTO_TP);

        // ✅ URGENTE: Validar percentual
        if (isNaN(percentualSLA) || !isFinite(percentualSLA)) {
            console.error(`❌ [CRÍTICO] Percentual SLA inválido: hhTotal=${hhTotal}, metaMensal=${metaMensal}, percentual=${percentualSLA}`);
            throw new Error(`Percentual SLA inválido: ${percentualSLA}`);
        }

        // Valores fixos
        const valoresFixos = calcularValorFixoTP();

        // Valores a faturar (com limite de 110%)
        const valorEngecom = valoresFixos.engecom * percentualSLA;
        const valorEncogel = valoresFixos.encogel * percentualSLA;
        const totalGeral = valorEngecom + valorEncogel;

        // Análise diária
        const analiseDiaria = this.calcularHHPorDia(rdosTurma);

        return {
            turma,
            tipo: 'TP',
            mes,
            ano,
            diasUteis,
            metaMensal,
            metaDiaria: METAS.META_DIARIA_TP,
            hh: {
                servicos: hhServicos,
                improdutivas: hhImprodutivas,
                total: hhTotal
            },
            percentualSLA,
            atingiuTeto: percentualSLA >= METAS.LIMITE_FATURAMENTO_TP,
            valoresFixos,
            engecom: valorEngecom,
            encogel: valorEncogel,
            totalGeral,
            analiseDiaria,
            rdos: rdosTurma
        };
    }

    // ====================================
    // CÁLCULOS PARA TS (Turmas de Solda)
    // ====================================

    /**
     * Calcula medição de uma TS (Turma de Solda)
     * Regra: SLA baseado APENAS em HH do soldador (serviços executados), limite 110%
     */
    calcularMedicaoTS(turma, mes, ano) {
        const rdosTurma = this.filtrarRDOsPorTurma(turma, mes, ano);

        if (rdosTurma.length === 0) {
            console.warn(`[TS] Nenhum RDO para ${turma} em ${mes}/${ano}`);
            return null;
        }

        const diasUteis = this.getDiasUteis(mes, ano);

        // Validar dias úteis
        if (!diasUteis || diasUteis <= 0) {
            console.error(`❌ [CRÍTICO] Dias úteis inválido para ${mes}/${ano}: ${diasUteis}`);
            throw new Error(`Dias úteis inválido (${diasUteis}) para ${mes}/${ano}`);
        }

        // Meta mensal TS: 1 soldador × 8h × dias úteis
        const metaMensal = calcularMetaMensalTS(diasUteis);

        // Validar meta
        if (!metaMensal || metaMensal <= 0 || isNaN(metaMensal)) {
            console.error(`❌ [CRÍTICO] Meta mensal TS inválida: ${metaMensal} (diasUteis=${diasUteis})`);
            throw new Error(`Meta mensal TS inválida: ${metaMensal}`);
        }

        // Calcular HH do soldador (apenas serviços executados)
        const hhSoldador = this.calcularHHServicos(rdosTurma);

        // Validar HH
        if (isNaN(hhSoldador)) {
            console.error(`❌ [CRÍTICO] HH soldador inválidas: ${hhSoldador}`);
            throw new Error(`HH soldador calculadas inválidas`);
        }

        // Percentual do SLA atingido (baseado apenas no soldador)
        const percentualSLA = Math.min(hhSoldador / metaMensal, METAS.LIMITE_FATURAMENTO_TS);

        // Validar percentual
        if (isNaN(percentualSLA) || !isFinite(percentualSLA)) {
            console.error(`❌ [CRÍTICO] Percentual SLA TS inválido: hhSoldador=${hhSoldador}, metaMensal=${metaMensal}, percentual=${percentualSLA}`);
            throw new Error(`Percentual SLA TS inválido: ${percentualSLA}`);
        }

        // Valores fixos
        const valoresFixos = calcularValorFixoTS();

        // Valores a faturar (com limite de 110%)
        const valorEngecom = valoresFixos.engecom * percentualSLA;
        const valorEncogel = valoresFixos.encogel * percentualSLA;
        const totalGeral = valorEngecom + valorEncogel;

        // Calcular dias trabalhados e médias (RUMO conta, ENGECOM não conta)
        const diasTrabalhados = this.contarDiasTrabalhadosMedicao(rdosTurma);
        const mediaEncarregado = diasTrabalhados / diasUteis;
        const mediaOperadores = this.calcularMediaOperadores(rdosTurma, diasUteis);
        const mediaSoldador = diasTrabalhados / diasUteis; // 1 soldador fixo
        const mediaCaminhao = diasTrabalhados / diasUteis;

        return {
            turma,
            tipo: 'TS',
            mes,
            ano,
            diasUteis,
            diasTrabalhados,
            metaMensal,
            metaDiaria: METAS.META_DIARIA_TS,
            hh: {
                soldador: hhSoldador,
                total: hhSoldador
            },
            percentualSLA,
            atingiuTeto: percentualSLA >= METAS.LIMITE_FATURAMENTO_TS,
            valoresFixos,
            engecom: valorEngecom,
            encogel: valorEncogel,
            totalGeral,
            mediaEncarregado,
            mediaOperadores,
            mediaSoldador,
            mediaCaminhao,
            rdos: rdosTurma
        };
    }

    // ====================================
    // CÁLCULOS DE HH
    // ====================================

    /**
     * Calcula HH de serviços realizados
     */
    calcularHHServicos(rdos) {
        let totalHH = 0;

        rdos.forEach(rdo => {
            const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || rdo.numeroRdo || '';

            // ⚡ Lookup O(1) via índice Map (Sprint 3)
            const servicosRDO = this.indices.servicosPorRDO.get(numeroRDO) || [];

            servicosRDO.forEach(servico => {
                // HH = quantidade × coeficiente
                const quantidade = parseFloat(servico.quantidade || servico.Quantidade || 0);
                const coeficiente = parseFloat(servico.coeficiente || 0);
                const hh = quantidade * coeficiente;

                if (hh > 0) {
                    debugLog(`  [HH Servico] ${numeroRDO}: ${servico.Descrição || servico.descricao} = ${quantidade} × ${coeficiente} = ${hh.toFixed(2)} HH`);
                }

                totalHH += hh;
            });
        });

        debugLog(`[calcularHHServicos] Total HH calculado: ${totalHH.toFixed(2)}`);
        return totalHH;
    }

    /**
     * Calcula HH de uma única linha de HI para um dado numeroRDO.
     * Fonte única de verdade para as regras: Chuva ÷ 2, Trens < 15min = 0.
     * @private
     */
    _calcularHHDeUmaHI(hi, numeroRDO) {
        const horaInicio = hi['Hora Início'] || hi.horaInicio || '';
        const horaFim = hi['Hora Fim'] || hi.horaFim || '';
        const horasImprodutivas = this.calcularDiferencaHoras(horaInicio, horaFim);

        // Ler operadores da linha HI primeiro, fallback para Efetivo via índice O(1)
        let operadores = parseInt(hi['Operadores'] || hi.operadores || 0);
        if (operadores <= 0) {
            const efetivo = this.indices.efetivosPorRDO.get(numeroRDO);
            operadores = efetivo ? parseInt(efetivo.Operadores || efetivo.operadores || 12) : 12;
        }

        let hhImprodutiva = horasImprodutivas * operadores;

        const tipo = (hi.Tipo || hi.tipo || '').toLowerCase();
        if (tipo.includes('chuva')) {
            hhImprodutiva = hhImprodutiva / METAS.DIVISOR_CHUVA;
        }
        if (tipo.includes('trem') && horasImprodutivas < (METAS.MINUTOS_MINIMOS_TREM / 60)) {
            hhImprodutiva = 0;
        }

        if (hhImprodutiva > 0) {
            debugLog(`  [HH Improdutiva] ${numeroRDO}: ${tipo} = ${horasImprodutivas.toFixed(2)}h × ${operadores} op = ${hhImprodutiva.toFixed(2)} HH`);
        }
        return hhImprodutiva;
    }

    /**
     * Calcula HH de horas improdutivas
     * Regras: Chuva ÷ 2, Trens > 15min
     */
    calcularHHImprodutivas(rdos) {
        let totalHH = 0;

        rdos.forEach(rdo => {
            const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || rdo.numeroRdo || '';
            const hisRDO = this.indices.hiPorRDO.get(numeroRDO) || [];
            hisRDO.forEach(hi => {
                totalHH += this._calcularHHDeUmaHI(hi, numeroRDO);
            });
        });

        debugLog(`[calcularHHImprodutivas] Total HH calculado: ${totalHH.toFixed(2)}`);
        return totalHH;
    }

    /**
     * Calcula HH por dia (para análise diária e heatmap)
     */
    calcularHHPorDia(rdos) {
        const hhPorDia = {};

        rdos.forEach(rdo => {
            const data = rdo.Data || rdo.data || '';
            const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || rdo.numeroRdo || '';

            if (!data) return;

            if (!hhPorDia[data]) {
                hhPorDia[data] = {
                    data,
                    hhServicos: 0,
                    hhImprodutivas: 0,
                    hhTotal: 0,
                    percentualMeta: 0,
                    status: 'vermelho',
                    observacoes: []  // ✅ Array para armazenar observações
                };
            }

            // ✅ Capturar observações do RDO
            const obs = rdo['Observações'] || rdo.Observacoes || rdo.observacoes || '';
            if (obs && obs.trim() !== '') {
                hhPorDia[data].observacoes.push(obs.trim());
            }

            // ⚡ Lookup O(1) via índice Map (Sprint 3)
            const servicosDia = this.indices.servicosPorRDO.get(numeroRDO) || [];

            servicosDia.forEach(servico => {
                const quantidade = parseFloat(servico.quantidade || servico.Quantidade || 0);
                const coeficiente = parseFloat(servico.coeficiente || 0);
                const hh = quantidade * coeficiente;
                hhPorDia[data].hhServicos += hh;
            });

            // ⚡ Lookup O(1) via índice Map — usa _calcularHHDeUmaHI (fonte única de verdade)
            const hisDia = this.indices.hiPorRDO.get(numeroRDO) || [];
            hisDia.forEach(hi => {
                hhPorDia[data].hhImprodutivas += this._calcularHHDeUmaHI(hi, numeroRDO);
            });

            // Calcular total e percentual
            hhPorDia[data].hhTotal = hhPorDia[data].hhServicos + hhPorDia[data].hhImprodutivas;
            hhPorDia[data].percentualMeta = hhPorDia[data].hhTotal / METAS.META_DIARIA_TP;

            // Definir status (cor)
            if (hhPorDia[data].percentualMeta >= 1.0) {
                hhPorDia[data].status = 'verde';
            } else if (hhPorDia[data].percentualMeta >= THRESHOLDS.SLA_ALERTA) {
                hhPorDia[data].status = 'amarelo';
            } else {
                hhPorDia[data].status = 'vermelho';
            }
        });

        return Object.values(hhPorDia).sort((a, b) => a.data.localeCompare(b.data));
    }

    // ====================================
    // UTILITÁRIOS
    // ====================================

    /**
     * Normaliza data para formato DD/MM/YYYY independente do formato de entrada.
     * Suporta: "15/01/2025", "2025-01-15" (ISO) e "15/01/25".
     */
    _normalizarData(data) {
        if (!data) return '';
        // ISO 8601: "2025-01-15" → "15/01/2025"
        if (/^\d{4}-\d{2}-\d{2}/.test(data)) {
            const [ano, mes, dia] = data.split('T')[0].split('-');
            return `${dia}/${mes}/${ano}`;
        }
        return data;
    }

    /**
     * Filtra RDOs por turma e período, excluindo RDOs marcados como deletados.
     */
    filtrarRDOsPorTurma(turma, mes, ano) {
        return this.rdos.filter(rdo => {
            // Excluir RDOs deletados
            const deletado = (rdo['Deletado'] || rdo.deletado || '').toLowerCase();
            if (deletado === 'sim') return false;

            // Normalizar data (suporta DD/MM/YYYY e YYYY-MM-DD)
            const dataBruta = rdo.Data || rdo.data || '';
            if (!dataBruta) return false;
            const data = this._normalizarData(dataBruta);

            const partes = data.split('/');
            const mesRDO = parseInt(partes[1]);
            const anoRDO = parseInt(partes[2]);

            if (isNaN(mesRDO) || isNaN(anoRDO)) return false;

            // Normalizar código da turma
            const codigoTurma = rdo['Código Turma'] || rdo.codigoTurma || '';

            return codigoTurma === turma &&
                   mesRDO === mes &&
                   anoRDO === ano;
        });
    }

    /**
     * Conta dias únicos trabalhados (utilitário genérico)
     */
    contarDiasUnicos(rdos) {
        const datasUnicas = new Set(rdos.map(rdo => rdo.Data || rdo.data || ''));
        return datasUnicas.size;
    }

    /**
     * Conta dias trabalhados para fins de medição (TMC e TS).
     * Regra de negócio:
     *   - Houve Serviço = Sim → conta
     *   - Houve Serviço = Não + Causa = RUMO → conta (impedimento do cliente)
     *   - Houve Serviço = Não + Causa = ENGECOM → NÃO conta (responsabilidade interna)
     *   - Houve Serviço = Não + Causa vazia → NÃO conta (benefício da dúvida para o cliente)
     */
    contarDiasTrabalhadosMedicao(rdos) {
        const datasUnicas = new Set();
        rdos.forEach(rdo => {
            const data = this._normalizarData(rdo.Data || rdo.data || '');
            if (!data) return;

            const houveServico = (rdo['Houve Serviço'] || rdo.houveServico || '').toLowerCase() === 'sim';
            const causaNaoServico = (rdo['Causa Não Serviço'] || rdo.causaNaoServico || '').toUpperCase().trim();

            if (houveServico || causaNaoServico === 'RUMO') {
                datasUnicas.add(data);
            }
        });
        return datasUnicas.size;
    }

    /**
     * Obtém lista de turmas únicas por tipo e período
     */
    getTurmasPorTipo(tipo, mes, ano) {
        const turmasSet = new Set();

        this.rdos.forEach(rdo => {
            // Excluir RDOs deletados
            const deletado = (rdo['Deletado'] || rdo.deletado || '').toLowerCase();
            if (deletado === 'sim') return;

            const dataBruta = rdo.Data || rdo.data || '';
            if (!dataBruta) return;
            const data = this._normalizarData(dataBruta);
            const partes = data.split('/');
            const mesRDO = parseInt(partes[1]);
            const anoRDO = parseInt(partes[2]);

            if (mesRDO === mes && anoRDO === ano) {
                const codigoTurma = rdo['Código Turma'] || rdo.codigoTurma || '';
                const tipoTurma = getTipoTurma(codigoTurma);

                if (tipoTurma === tipo) {
                    turmasSet.add(codigoTurma);
                }
            }
        });

        return Array.from(turmasSet);
    }

    /**
     * Valida formato de horário HH:MM
     */
    validarHorario(horario) {
        if (!horario) return false;

        // Regex para HH:MM (00:00 até 23:59)
        const regex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;

        if (!regex.test(horario)) {
            return false;
        }

        const [horas, minutos] = horario.split(':').map(Number);

        // Validar ranges
        if (horas < 0 || horas > 23) return false;
        if (minutos < 0 || minutos > 59) return false;

        return true;
    }

    /**
     * Calcula diferença de horas entre dois horários (HH:MM)
     * Considera períodos que cruzam meia-noite
     */
    calcularDiferencaHoras(horaInicio, horaFim) {
        if (!horaInicio || !horaFim) {
            console.warn('[Cálculo] Horários vazios fornecidos');
            return 0;
        }

        // Validar formato
        if (!this.validarHorario(horaInicio)) {
            console.error(`[Cálculo] Horário de início inválido: ${horaInicio}`);
            return 0;
        }

        if (!this.validarHorario(horaFim)) {
            console.error(`[Cálculo] Horário de fim inválido: ${horaFim}`);
            return 0;
        }

        const [hIni, mIni] = horaInicio.split(':').map(Number);
        const [hFim, mFim] = horaFim.split(':').map(Number);

        const minutosInicio = hIni * 60 + mIni;
        const minutosFim = hFim * 60 + mFim;

        let diferencaMinutos;
        if (minutosFim >= minutosInicio) {
            diferencaMinutos = minutosFim - minutosInicio;
        } else {
            // Cruza meia-noite
            diferencaMinutos = (METAS.MINUTOS_POR_DIA - minutosInicio) + minutosFim;
        }

        const horas = diferencaMinutos / 60;

        // Validar resultado (não pode ser > 24 horas)
        if (horas > METAS.HORAS_POR_DIA) {
            console.warn(`[Cálculo] Diferença de horas suspeita: ${horas.toFixed(2)}h (${horaInicio} - ${horaFim})`);
        }

        return horas;
    }

    /**
     * Retorna feriados nacionais brasileiros para um ano
     */
    getFeriadosNacionais(ano) {
        const feriados = [
            `01/01/${ano}`, // Ano Novo
            `21/04/${ano}`, // Tiradentes
            `01/05/${ano}`, // Dia do Trabalho
            `07/09/${ano}`, // Independência
            `12/10/${ano}`, // Nossa Senhora Aparecida
            `02/11/${ano}`, // Finados
            `15/11/${ano}`, // Proclamação da República
            `25/12/${ano}`, // Natal
        ];

        // Adicionar Páscoa e feriados móveis (Carnaval, Corpus Christi)
        const pascoa = this.calcularPascoa(ano);
        const carnaval = new Date(pascoa);
        carnaval.setDate(pascoa.getDate() - 47); // 47 dias antes da Páscoa

        const sextaFeiraSanta = new Date(pascoa);
        sextaFeiraSanta.setDate(pascoa.getDate() - 2); // Sexta-feira antes da Páscoa

        const corpusChristi = new Date(pascoa);
        corpusChristi.setDate(pascoa.getDate() + 60); // 60 dias após a Páscoa

        feriados.push(
            this.formatarData(carnaval),
            this.formatarData(sextaFeiraSanta),
            this.formatarData(corpusChristi)
        );

        return feriados;
    }

    /**
     * Calcula a data da Páscoa (Algoritmo de Meeus)
     */
    calcularPascoa(ano) {
        const a = ano % 19;
        const b = Math.floor(ano / 100);
        const c = ano % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const mes = Math.floor((h + l - 7 * m + 114) / 31);
        const dia = ((h + l - 7 * m + 114) % 31) + 1;

        return new Date(ano, mes - 1, dia);
    }

    /**
     * Formata data para DD/MM/YYYY
     */
    formatarData(data) {
        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        return `${dia}/${mes}/${ano}`;
    }

    /**
     * Retorna dias úteis do mês (excluindo sábados, domingos e feriados)
     */
    getDiasUteis(mes, ano) {
        const feriados = this.getFeriadosNacionais(ano);
        let diasUteis = 0;

        // Descobrir quantos dias tem o mês
        const ultimoDiaMes = new Date(ano, mes, 0).getDate();

        // Contar dias úteis
        for (let dia = 1; dia <= ultimoDiaMes; dia++) {
            const data = new Date(ano, mes - 1, dia);
            const diaSemana = data.getDay(); // 0 = Domingo, 6 = Sábado

            // Verificar se não é fim de semana
            if (diaSemana !== 0 && diaSemana !== 6) {
                const dataFormatada = this.formatarData(data);

                // Verificar se não é feriado
                if (!feriados.includes(dataFormatada)) {
                    diasUteis++;
                }
            }
        }

        return diasUteis;
    }

    /**
     * Calcula estatísticas consolidadas
     */
    calcularEstatisticasConsolidadas(mes, ano) {
        // 🚀 Verificar cache primeiro
        const chaveCache = this.gerarChaveCache('estatisticas', mes, ano);
        const resultadoCache = this.obterCache(chaveCache);

        if (resultadoCache) {
            debugLog(`[Cache] ⚡ HIT! Retornando estatísticas de ${mes}/${ano} do cache`);
            return resultadoCache;
        }

        debugLog(`[calcularEstatisticasConsolidadas] Iniciando para ${mes}/${ano}`);
        debugLog(`[calcularEstatisticasConsolidadas] Total de RDOs disponíveis: ${this.rdos.length}`);
        debugLog(`[calcularEstatisticasConsolidadas] Total de Serviços disponíveis: ${this.servicos.length}`);

        // Extrair turmas únicas dos RDOs filtrados
        const turmasSet = new Set();
        this.rdos.forEach(rdo => {
            const turma = FieldHelper.getRDOCodigoTurma(rdo);
            if (turma && turma.trim() !== '') {
                turmasSet.add(turma.trim());
            }
        });
        const todasTurmas = Array.from(turmasSet);

        debugLog(`[calcularEstatisticasConsolidadas] Turmas encontradas: ${todasTurmas.length}`, todasTurmas);

        const resultados = {
            tmcs: [],
            tps: [],
            tss: [],
            totalEngecom: 0,
            totalEncogel: 0,
            totalGeral: 0
        };

        todasTurmas.forEach(turma => {
            const tipo = getTipoTurma(turma);
            debugLog(`[calcularEstatisticasConsolidadas] Processando ${turma} (${tipo})`);

            if (tipo === 'TMC') {
                const medicao = this.calcularMedicaoTMC(turma, mes, ano);
                if (medicao) {
                    debugLog(`  ✅ TMC ${turma}: R$ ${medicao.engecom.total.toFixed(2)}`);
                    resultados.tmcs.push(medicao);
                    resultados.totalEngecom += medicao.engecom.total;
                    resultados.totalEncogel += medicao.encogel.total;
                } else {
                    debugLog(`  ⚠️ TMC ${turma}: Sem medição`);
                }
            } else if (tipo === 'TP') {
                const medicao = this.calcularMedicaoTP(turma, mes, ano);
                if (medicao) {
                    debugLog(`  ✅ TP ${turma}: ${medicao.hh.total.toFixed(2)} HH, SLA ${(medicao.percentualSLA * 100).toFixed(1)}%`);
                    resultados.tps.push(medicao);
                    resultados.totalEngecom += medicao.engecom;
                    resultados.totalEncogel += medicao.encogel;
                } else {
                    debugLog(`  ⚠️ TP ${turma}: Sem medição`);
                }
            } else if (tipo === 'TS') {
                const medicao = this.calcularMedicaoTS(turma, mes, ano);
                if (medicao) {
                    debugLog(`  ✅ TS ${turma}: ${medicao.hh.total.toFixed(2)} HH, SLA ${(medicao.percentualSLA * 100).toFixed(1)}%`);
                    resultados.tss.push(medicao);
                    resultados.totalEngecom += medicao.engecom;
                    resultados.totalEncogel += medicao.encogel;
                } else {
                    debugLog(`  ⚠️ TS ${turma}: Sem medição`);
                }
            }
        });

        resultados.totalGeral = resultados.totalEngecom + resultados.totalEncogel;

        // Adicionar metadados úteis (excluindo RDOs deletados)
        resultados.totalRDOs = this.rdos.filter(rdo => {
            const deletado = (rdo['Deletado'] || rdo.deletado || '').toLowerCase();
            if (deletado === 'sim') return false;
            const data = this._normalizarData(rdo.Data || rdo.data || '');
            const partes = data.split('/');
            const rdoMes = parseInt(partes[1]);
            const rdoAno = parseInt(partes[2]);
            return rdoMes === mes && rdoAno === ano;
        }).length;

        resultados.totalHH = [...resultados.tps, ...resultados.tss].reduce((sum, t) => {
            return sum + ((t.hh && t.hh.total) || t.hhSoldador || 0);
        }, 0);

        resultados.mediaSLA = [...resultados.tps, ...resultados.tss].length > 0
            ? [...resultados.tps, ...resultados.tss].reduce((sum, t) => sum + (t.percentualSLA || 0), 0) / [...resultados.tps, ...resultados.tss].length
            : 0;

        debugLog(`[calcularEstatisticasConsolidadas] ✅ RESULTADO FINAL:`);
        debugLog(`  - TMCs: ${resultados.tmcs.length}`);
        debugLog(`  - TPs: ${resultados.tps.length}`);
        debugLog(`  - TSs: ${resultados.tss.length}`);
        debugLog(`  - Total: R$ ${resultados.totalGeral.toFixed(2)}`);

        // 🚀 Salvar no cache antes de retornar
        this.salvarCache(chaveCache, resultados);

        return resultados;
    }

    /**
     * Gera alertas baseados nos thresholds
     */
    gerarAlertas(medicao) {
        const alertas = [];

        if (medicao.tipo === 'TP') {
            // Alerta: SLA abaixo do crítico
            if (medicao.percentualSLA < THRESHOLDS.SLA_CRITICO) {
                alertas.push({
                    tipo: 'danger',
                    titulo: 'SLA Crítico',
                    mensagem: `TP ${medicao.turma} está com apenas ${formatarPercentual(medicao.percentualSLA)} do SLA`
                });
            }

            // Alerta: Próximo do teto de 110%
            if (medicao.percentualSLA >= THRESHOLDS.FATURAMENTO_PROXIMO_TETO &&
                medicao.percentualSLA < THRESHOLDS.FATURAMENTO_NO_TETO) {
                alertas.push({
                    tipo: 'warning',
                    titulo: 'Próximo do Teto',
                    mensagem: `TP ${medicao.turma} está em ${formatarPercentual(medicao.percentualSLA)}, próximo do limite de 110%`
                });
            }

            // Alerta: Atingiu teto de 110%
            if (medicao.atingiuTeto) {
                alertas.push({
                    tipo: 'info',
                    titulo: 'Teto Atingido',
                    mensagem: `TP ${medicao.turma} atingiu o teto de faturamento de 110%`
                });
            }

            // Alerta: Dias sem atingir meta
            const diasAbaixoMeta = medicao.analiseDiaria.filter(d => d.status === 'vermelho').length;
            if (diasAbaixoMeta > 0) {
                alertas.push({
                    tipo: 'warning',
                    titulo: 'Dias Abaixo da Meta',
                    mensagem: `${diasAbaixoMeta} dia(s) com menos de 96 HH`
                });
            }
        }

        if (medicao.tipo === 'TMC') {
            // Alerta: Dias acima da média
            if (medicao.mediaEncarregado > THRESHOLDS.DIAS_ACIMA_MEDIA) {
                alertas.push({
                    tipo: 'info',
                    titulo: 'Dias Acima do Padrão',
                    mensagem: `TMC ${medicao.turma} trabalhou ${medicao.diasTrabalhados} dias (${medicao.diasUteis} úteis)`
                });
            }
        }

        return alertas;
    }
}
