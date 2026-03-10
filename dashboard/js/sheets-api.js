/**
 * Google Sheets API Integration
 * Carrega dados das abas RDO, Servicos, Materiais, etc.
 */

/**
 * Valida se um número de O.S segue o padrão aceito:
 *   - 6 dígitos começando com 98 ou 99  (ex: 987654, 998070)
 *   - 7 dígitos começando com 100 a 199 (ex: 1001234, 1020999)
 *   - Múltiplas O.S separadas por "/"   (ex: 1017755/1018836)
 * Qualquer outro valor é considerado inválido → "Sem O.S"
 */
function validarNumeroOS(os) {
    if (!os) return false;
    const s = String(os).trim();

    // Suporte a múltiplas O.S combinadas separadas por "/" (ex: "1017755/1018836")
    // Usuário pode registrar dois serviços de O.S diferentes em um único RDO
    if (s.includes('/')) {
        return s.split('/').every(parte => validarNumeroOS(parte.trim()));
    }

    if (/^9[89]\d{4}$/.test(s)) return true;   // 98xxxx ou 99xxxx (6 dígitos)
    if (/^1\d{6}$/.test(s)) return true;         // 100xxxx … 199xxxx (7 dígitos)
    return false;
}

class GoogleSheetsAPI {
    constructor() {
        this.baseURL = 'https://sheets.googleapis.com/v4/spreadsheets';
        this.spreadsheetId = CONFIG.SPREADSHEET_ID;
        this.apiKey = CONFIG.API_KEY;
        this.cache = {};
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutos
        this.versaoCache = null; // Timestamp da última atualização da planilha
    }

    /**
     * Carrega dados de uma aba sem usar cache
     */
    async carregarAbaSemCache(nomeAba, range = 'A:Z') {
        const url = `${this.baseURL}/${this.spreadsheetId}/values/${nomeAba}!${range}?key=${this.apiKey}`;

        try {
            const response = await fetch(url);
            if (!response.ok) return [];

            const data = await response.json();
            return data.values || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Carrega dados de uma aba específica com cache inteligente
     */
    async carregarAba(nomeAba, range = 'A:Z') {
        const cacheKey = `${nomeAba}_${range}`;
        const now = Date.now();

        // Verificar cache válido
        if (this.cache[cacheKey]) {
            const cacheValido = now - this.cache[cacheKey].timestamp < this.cacheExpiry;

            if (cacheValido) {
                debugLog(`[Cache] Usando dados em cache para ${nomeAba}`);
                return this.cache[cacheKey].data;
            }
        }

        const url = `${this.baseURL}/${this.spreadsheetId}/values/${nomeAba}!${range}?key=${this.apiKey}`;

        try {
            const response = await fetch(url);

            if (!response.ok) {
                // Detectar rate limit (429) e exibir mensagem amigável
                if (response.status === 429) {
                    const msg = `Limite de requisições atingido (HTTP 429). Aguarde alguns instantes e recarregue a página.`;
                    this._mostrarErroRateLimit(msg);
                    throw new Error(msg);
                }
                throw new Error(`Erro ao carregar ${nomeAba}: ${response.statusText} (HTTP ${response.status})`);
            }

            const data = await response.json();
            const valores = data.values || [];

            // Salvar no cache
            this.cache[cacheKey] = {
                data: valores,
                timestamp: now
            };

            debugLog(`[API] Carregados ${valores.length} registros de ${nomeAba}`);
            return valores;

        } catch (error) {
            // Não repetir aviso de rate limit
            if (!error.message.includes('429')) {
                console.error(`[API] Erro ao carregar ${nomeAba}:`, error);
            }

            // Retornar cache expirado se disponível (fallback)
            if (this.cache[cacheKey]) {
                console.warn(`[Cache] Usando cache expirado como fallback para ${nomeAba}`);
                this.mostrarAvisoCacheExpirado();
                return this.cache[cacheKey].data;
            }

            throw error;
        }
    }

    /**
     * Normaliza nome de campo (remove espaços, acentos, caracteres especiais)
     * Converte "Número RDO" => "numeroRDO", "Data RDO" => "dataRDO"
     */
    normalizarNomeCampo(nome) {
        if (!nome) return '';

        return nome
            .normalize('NFD')                          // Decompor acentos
            .replace(/[\u0300-\u036f]/g, '')           // Remover marcas diacríticas
            .replace(/[^a-zA-Z0-9\s]/g, '')            // Remover caracteres especiais
            .trim()                                     // Remover espaços nas pontas
            .split(/\s+/)                               // Dividir por espaços
            .map((palavra, index) => {
                // Primeira palavra minúscula, demais com primeira letra maiúscula
                if (index === 0) {
                    return palavra.toLowerCase();
                }
                return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
            })
            .join('');                                  // Juntar tudo
    }

    /**
     * ✅ URGENTE: Normaliza descrição de serviço para match confiável
     * Remove espaços extras, acentos, pontuação, converte para minúsculas
     */
    normalizarDescricaoServico(descricao) {
        if (!descricao) return '';

        return descricao
            .normalize('NFD')                          // Decompor acentos
            .replace(/[\u0300-\u036f]/g, '')           // Remover acentos
            .toLowerCase()                             // Minúsculas
            .replace(/[^\w\s]/g, '')                   // Remover pontuação
            .replace(/\s+/g, ' ')                      // Múltiplos espaços → 1 espaço
            .trim();                                    // Remover espaços nas pontas
    }

    /**
     * Converte array 2D (do Sheets) em array de objetos com campos normalizados
     */
    converterParaObjetos(valores) {
        if (valores.length === 0) return [];

        const headers = valores[0];
        const objetos = [];

        for (let i = 1; i < valores.length; i++) {
            const row = valores[i];
            const obj = {};
            const objNormalizado = {};

            // Criar objeto com nomes originais E normalizados
            headers.forEach((header, index) => {
                const valor = row[index] || '';

                // Nome original
                obj[header] = valor;

                // Nome normalizado
                const nomeNormalizado = this.normalizarNomeCampo(header);
                if (nomeNormalizado) {
                    objNormalizado[nomeNormalizado] = valor;
                }
            });

            // Mesclar ambos (prioridade para normalizado)
            objetos.push({ ...obj, ...objNormalizado });
        }

        return objetos;
    }

    /**
     * Exibe mensagem de erro de rate limit (HTTP 429) ao usuário
     */
    _mostrarErroRateLimit(mensagem) {
        const banner = document.getElementById('cacheWarningBanner');
        if (banner) {
            const textEl = banner.querySelector('.warning-text');
            const subEl  = banner.querySelector('small');
            if (textEl) textEl.textContent = 'Limite de requisições atingido';
            if (subEl)  subEl.textContent  = mensagem;
            banner.classList.add('show');
        }
        console.warn('[API] Rate limit (429):', mensagem);
    }

    /**
     * Atualiza barra de progresso do loading
     */
    atualizarProgresso(step, total, mensagem) {
        const progressBar = document.getElementById('loadingProgressBar');
        const loadingStep = document.getElementById('loadingStep');
        const percentage = Math.round((step / total) * 100);

        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (loadingStep) loadingStep.textContent = mensagem;
        debugLog(`[Loading] ${step}/${total} - ${mensagem}`);
    }

    /**
     * Carrega todos os dados necessários para o dashboard
     */
    async carregarTodosDados() {
        try {
            debugLog('[Dashboard] Iniciando carregamento de dados...');

            // Apenas as 4 abas realmente usadas pelo dashboard
            // (Materiais, Equipamentos e Transportes não são usados — app continua escrevendo neles)
            const abas = [
                { nome: 'RDO', config: CONFIG.SHEETS.RDO },
                { nome: 'Serviços', config: CONFIG.SHEETS.SERVICOS },
                { nome: 'Horas Improdutivas', config: CONFIG.SHEETS.HI },
                { nome: 'Efetivo', config: CONFIG.SHEETS.EFETIVO }
            ];

            const resultados = {};
            const total = abas.length + 2; // +2 para processamento de serviços e HI

            // Carregar todas as abas em paralelo para melhor performance
            this.atualizarProgresso(1, total, `Carregando ${abas.length} abas em paralelo...`);
            const resultadosArray = await Promise.all(
                abas.map(aba => this.carregarAba(aba.config))
            );
            abas.forEach((aba, i) => {
                resultados[aba.nome] = resultadosArray[i];
            });
            this.atualizarProgresso(abas.length, total, 'Abas carregadas!');

            // Converter para objetos
            this.atualizarProgresso(abas.length + 1, total, 'Processando dados...');
            const rdosBrutos = this.converterParaObjetos(resultados['RDO']);

            // Normalizar Número OS a partir do Número RDO quando há inconsistência.
            // Caso de uso: usuário corrigiu o Número RDO diretamente no Sheets
            // (ex: "1019299-19.02.26-001" → "1009299-19.02.26-001") mas deixou o
            // campo "Número OS" com o valor antigo ("1019299"). Neste cenário o
            // Número RDO é a fonte de verdade — extraímos o OS do seu prefixo.
            rdosBrutos.forEach(rdo => {
                const numeroRDO = (rdo['Número RDO'] || rdo.numeroRDO || '').trim();
                if (!numeroRDO) return;
                // Formato esperado: "OS-DD.MM.YY-NNN"  ex: "1009299-19.02.26-001"
                const partes = numeroRDO.split('-');
                if (partes.length < 3 || !/^\d{2}\.\d{2}\.\d{2}$/.test(partes[1])) return;
                const osFromRDO = partes[0].trim();
                const osAtual   = (rdo['Número OS'] || rdo.numeroOS || '').toString().trim();
                if (osFromRDO && validarNumeroOS(osFromRDO) && osFromRDO !== osAtual) {
                    console.warn(`[sheets-api] Inconsistência corrigida: "Número OS"="${osAtual}" ≠ prefixo de "Número RDO"="${numeroRDO}" → usando "${osFromRDO}"`);
                    rdo['Número OS'] = osFromRDO;
                    rdo.numeroOS     = osFromRDO;
                }
            });

            // Marcar RDOs com Número OS inválido
            rdosBrutos.forEach(rdo => {
                const os = (rdo['Número OS'] || rdo.numeroOS || '').toString().trim();
                if (!validarNumeroOS(os)) {
                    rdo._osOriginal  = os;   // guardar valor original para exibição
                    rdo._osInvalida  = true; // flag usada em gestao-os.js
                    rdo['Número OS'] = 'Sem O.S';
                    rdo.numeroOS     = 'Sem O.S';
                }
            });

            const dados = {
                rdos: rdosBrutos,
                servicos: this.converterParaObjetos(resultados['Serviços']),
                horasImprodutivas: this.converterParaObjetos(resultados['Horas Improdutivas']),
                efetivos: this.converterParaObjetos(resultados['Efetivo']),
                // Não carregados (não usados pelo dashboard):
                materiais: [],
                transportes: [],
                equipamentos: []
            };

            // Processar serviços (adicionar coeficiente do servicos.json)
            dados.servicos = await this.enriquecerServicosComCoeficientes(dados.servicos);

            // Calcular HH Improdutivas
            this.atualizarProgresso(total, total, 'Finalizando...');
            dados.horasImprodutivas = this.calcularHHImprodutivas(dados.horasImprodutivas, dados.efetivos);

            debugLog('[Dashboard] Dados carregados com sucesso:', {
                rdos: dados.rdos.length,
                servicos: dados.servicos.length,
                hi: dados.horasImprodutivas.length
            });

            return dados;

        } catch (error) {
            console.error('[Dashboard] Erro ao carregar dados:', error);
            throw error;
        }
    }

    /**
     * Enriquece serviços com coeficientes do servicos.json
     */
    async enriquecerServicosComCoeficientes(servicos) {
        let servicosReferencia = [];

        // PRIORIDADE 1: SERVICOS_BASE embutido no servicos-data.js
        // É a fonte mais confiável — sempre funciona, mesmo em servidores web sem CORS
        if (typeof SERVICOS_BASE !== 'undefined' && Array.isArray(SERVICOS_BASE) && SERVICOS_BASE.length > 0) {
            servicosReferencia = SERVICOS_BASE;
            debugLog(`[Dashboard] ✅ Serviços carregados de SERVICOS_BASE: ${SERVICOS_BASE.length} serviços`);
        }

        // PRIORIDADE 2: tentar buscar versão mais atualizada via HTTP como override
        // Serve para ambientes de desenvolvimento local e quando servicos.json está disponível
        const caminhos = [
            '../app/src/main/res/raw/servicos.json',  // servidor local com Live Server
            'servicos.json'                             // cópia na pasta dashboard
        ];

        for (const caminho of caminhos) {
            try {
                const controller = new AbortController();
                const timeoutId  = setTimeout(() => controller.abort(), 3000); // 3s timeout
                const response   = await fetch(caminho, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const dados = await response.json();
                    if (Array.isArray(dados) && dados.length > 0) {
                        // Usar HTTP apenas se tiver mais serviços que o SERVICOS_BASE (mais atualizado)
                        if (dados.length >= servicosReferencia.length) {
                            servicosReferencia = dados;
                            debugLog(`[Dashboard] ✅ Serviços atualizados de "${caminho}": ${dados.length} serviços`);
                        }
                        break;
                    }
                }
            } catch (_e) {
                // CORS, timeout ou arquivo não encontrado — ignorar silenciosamente
            }
        }

        if (servicosReferencia.length === 0) {
            console.error('[Dashboard] ❌ ERRO CRÍTICO: Não foi possível carregar coeficientes de nenhuma fonte!');
        }

        // Criar mapa de descrição => coeficiente (normalizado)
        const mapaCoeficientes = {};
        servicosReferencia.forEach(s => {
            if (s.descricao && s.coeficiente) {
                // ✅ URGENTE: Normalização agressiva para evitar falhas de match
                const chaveNormalizada = this.normalizarDescricaoServico(s.descricao);
                mapaCoeficientes[chaveNormalizada] = s.coeficiente;
            }
        });

        debugLog(`[Dashboard] Mapa de coeficientes: ${Object.keys(mapaCoeficientes).length} serviços carregados`);

        // Adicionar coeficiente aos serviços
        let servicosSemCoeficiente = 0;
        let servicosCustomizados = 0;
        const customizadosSemHH = [];  // Lista para alerta visível ao usuário
        const resultado = servicos.map(servico => {
            const descricaoOriginal = servico.Descrição || servico.descricao || '';
            const descricaoNormalizada = this.normalizarDescricaoServico(descricaoOriginal);

            // ✅ Verificar se é serviço customizado (coluna J do Sheets)
            const eCustomizado = servico['É Customizado?'] || servico.eCustomizado || servico.isCustomizado || '';
            const isCustomizado = eCustomizado.toString().toUpperCase() === 'SIM';

            let coeficiente = 0;

            if (isCustomizado) {
                // Serviço customizado: usar HH Manual como coeficiente (preenchido pelo app)
                const hhManual = parseFloat(servico['HH Manual'] || servico.hhManual || 0);
                servicosCustomizados++;
                coeficiente = hhManual || 0;
                if (coeficiente > 0) {
                    debugLog(`✅ [CUSTOMIZADO] "${descricaoOriginal}" - Coeficiente = ${coeficiente} (HH Manual)`);
                } else {
                    // Serviço executado mas sem HH — registrar para alerta visível
                    const numeroRDO = servico['Número RDO'] || servico.numeroRDO || '';
                    const data = servico['Data RDO'] || servico.data || '';
                    customizadosSemHH.push({ descricao: descricaoOriginal, numeroRDO, data });
                    console.warn(`⚠️ [CUSTOMIZADO] "${descricaoOriginal}" (RDO ${numeroRDO}) - HH Manual não preenchido, este serviço não será faturado!`);
                }
            } else {
                // Serviço normal: buscar coeficiente do servicos.json
                coeficiente = mapaCoeficientes[descricaoNormalizada];

                if (!coeficiente && descricaoOriginal) {
                    // Fallback: usar HH Manual se preenchido (serviço não mapeado no JSON)
                    const hhManual = parseFloat(servico['HH Manual'] || servico.hhManual || 0);
                    if (hhManual > 0) {
                        coeficiente = hhManual;
                        debugLog(`ℹ️ "${descricaoOriginal}" - coeficiente não encontrado no JSON, usando HH Manual = ${hhManual}`);
                    } else {
                        servicosSemCoeficiente++;
                        debugLog(`⚠️ Coeficiente não encontrado: "${descricaoOriginal}" (normalizado: "${descricaoNormalizada}")`);
                        coeficiente = 0;
                    }
                }
            }

            return {
                ...servico,
                coeficiente: coeficiente || 0,
                isCustomizado,
                descricaoNormalizada,  // Para debug
                numeroRDO: servico['Número RDO'] || servico.numeroRDO,
                numeroOS: servico['Número OS'] || servico.numeroOS,
                data: servico['Data RDO'] || servico.data,
                quantidade: parseFloat(servico.Quantidade || servico.quantidade || 0),
                unidade: servico.Unidade || servico.unidade
            };
        });

        debugLog(`✅ [Dashboard] Coeficientes processados: ${servicosCustomizados} customizados, ${servicosSemCoeficiente} sem coeficiente`);

        if (servicosSemCoeficiente > 0) {
            console.warn(`[Dashboard] ${servicosSemCoeficiente} serviços sem coeficiente encontrado. Verifique o servicos.json!`);
        }

        // Expor lista de customizados sem HH para que a UI possa exibir alerta
        this._customizadosSemHH = customizadosSemHH;

        return resultado;
    }

    /**
     * Calcula HH Improdutivas
     * Fórmula: (Hora Fim - Hora Início) × Operadores
     * v3.0.0: Lê operadores da própria linha HI (nova coluna J), com fallback para Efetivo (legado)
     */
    calcularHHImprodutivas(horasImprodutivas, efetivos) {
        debugLog('[Dashboard] Calculando HH Improdutivas (v3.0.0 - Operadores por evento HI)');

        return horasImprodutivas.map(hi => {
            const numeroRDO = hi['Número RDO'] || hi.numeroRDO || '';
            const numeroOS = hi['Número OS'] || hi.numeroOS || '';
            const dataRDO = hi['Data RDO'] || hi.data || '';
            const tipo = hi['Tipo'] || hi.tipo || '';
            const descricao = hi['Descrição'] || hi.descricao || '';
            const horaInicio = hi['Hora Início'] || hi.horaInicio || '';
            const horaFim = hi['Hora Fim'] || hi.horaFim || '';

            // v3.0.0: Ler operadores da própria linha HI (coluna J), fallback para Efetivo
            let operadores = parseInt(hi['Operadores'] || hi.operadores || 0);
            if (operadores <= 0) {
                // Fallback para dados antigos sem a coluna Operadores na HI
                const efetivo = efetivos.find(ef => {
                    const efNumRDO = ef['Número RDO'] || ef.numeroRDO || '';
                    return efNumRDO === numeroRDO;
                });
                operadores = efetivo ? parseInt(efetivo['Operadores'] || efetivo.operadores || 0) : 0;

                if (operadores <= 0) {
                    // Último fallback: usar composição padrão da turma (12 para TP)
                    operadores = 12;
                    debugLog(`⚠️ [HI] ${numeroRDO}: Usando fallback 12 operadores (sem dados em HI nem Efetivo)`);
                } else {
                    debugLog(`[HI] ${numeroRDO}: Usando operadores do Efetivo (legado): ${operadores}`);
                }
            }

            // Calcular duração em horas (SEM multiplicar por operadores ainda)
            const duracaoHoras = this.calcularDuracaoHoras(horaInicio, horaFim);

            // 🔴 REGRA: Trens com duração < 15 minutos (0.25h) = HH ZERO
            const isTrem = tipo.toLowerCase().includes('trem');
            const isTremCurto = isTrem && duracaoHoras < 0.25;

            // Calcular HH (duração × operadores), mas zerar se for trem curto
            let hhImprodutivas = duracaoHoras * operadores;

            if (isTremCurto) {
                hhImprodutivas = 0;
                debugLog(`🔴 [HI] ${numeroRDO} [${tipo}]: TREM < 15 min (${(duracaoHoras * 60).toFixed(0)} min) - HH ZERADO`);
            } else {
                // 🔴 REGRA: Chuva conta como metade das HH
                if (tipo.toLowerCase().includes('chuva')) {
                    hhImprodutivas = hhImprodutivas / METAS.DIVISOR_CHUVA;
                    debugLog(`🌧️ [HI] ${numeroRDO} [${tipo}]: Chuva ÷2 → ${hhImprodutivas.toFixed(2)} HH`);
                } else {
                    debugLog(`[HI] ${numeroRDO} [${tipo}]: ${horaInicio}-${horaFim} × ${operadores} op = ${hhImprodutivas.toFixed(2)} HH`);
                }
            }

            return {
                ...hi,
                numeroRDO,
                numeroOS,
                dataRDO,
                tipo,
                descricao,
                horaInicio,
                horaFim,
                operadores,
                duracaoHoras,
                isTremCurto,
                hhImprodutivas,
                'HH Improdutivas': hhImprodutivas
            };
        });
    }

    /**
     * Calcula apenas a duração entre duas horas (SEM multiplicar por operadores)
     * Retorna em formato decimal (horas)
     */
    calcularDuracaoHoras(horaInicio, horaFim) {
        if (!horaInicio || !horaFim || horaInicio.trim() === '' || horaFim.trim() === '') {
            return 0;
        }

        // Converter HH:MM para minutos
        const minutosInicio = this.converterHoraParaMinutos(horaInicio);
        const minutosFim = this.converterHoraParaMinutos(horaFim);

        if (minutosInicio === null || minutosFim === null) {
            return 0;
        }

        // Calcular diferença (considerar período noturno)
        let diferencaMinutos;
        if (minutosFim >= minutosInicio) {
            diferencaMinutos = minutosFim - minutosInicio;
        } else {
            // Passou da meia-noite
            diferencaMinutos = (METAS.MINUTOS_POR_DIA - minutosInicio) + minutosFim;
        }

        // Converter para horas decimais
        return diferencaMinutos / 60;
    }

    /**
     * Converte hora em formato HH:MM para minutos totais
     */
    converterHoraParaMinutos(hora) {
        if (!hora || typeof hora !== 'string') return null;

        const partes = hora.trim().split(':');
        if (partes.length !== 2) return null;

        const horas = parseInt(partes[0]);
        const minutos = parseInt(partes[1]);

        if (isNaN(horas) || isNaN(minutos)) return null;

        return horas * 60 + minutos;
    }

    /**
     * Mostra aviso visual de cache expirado
     */
    mostrarAvisoCacheExpirado() {
        const banner = document.getElementById('cacheWarningBanner');
        if (banner && !banner.classList.contains('show')) {
            banner.classList.add('show');
        }
    }

    /**
     * Limpa cache
     */
    limparCache() {
        this.cache = {};
        debugLog('[Cache] Cache limpo');
    }

    /**
     * Recarrega dados (força atualização)
     */
    async recarregarDados() {
        this.limparCache();
        return await this.carregarTodosDados();
    }

    /**
     * Fecha aviso de cache expirado
     */
    fecharAvisoCache() {
        const banner = document.getElementById('cacheWarningBanner');
        if (banner) {
            banner.classList.remove('show');
        }
    }
}

// Instância global
const sheetsAPI = new GoogleSheetsAPI();
