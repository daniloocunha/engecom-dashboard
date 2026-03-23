/**
 * Configurações do Dashboard de Medição - EXEMPLO
 * Engecom/Encogel - RUMO Logística
 *
 * INSTRUÇÕES:
 * 1. Copie este arquivo para config.js
 * 2. Substitua os valores de exemplo pelas suas credenciais reais
 * 3. NUNCA commite o arquivo config.js no Git!
 */

// ============================================
// DEBUG MODE (set to true for verbose logging)
// ============================================
const DEBUG_MODE = false;
const debugLog = DEBUG_MODE ? console.log.bind(console) : () => {};

// ============================================
// GOOGLE SHEETS API
// ============================================
const CONFIG = {
    // ID da planilha do Google Sheets
    SPREADSHEET_ID: 'SEU_SPREADSHEET_ID_AQUI',

    // API Key do Google (obtenha em: https://console.cloud.google.com/)
    API_KEY: 'SUA_API_KEY_AQUI',

    // Nomes das abas
    SHEETS: {
        CONFIG: 'Config',
        RDO: 'RDO',
        SERVICOS: 'Servicos',
        MATERIAIS: 'Materiais',
        HI: 'HorasImprodutivas',
        TRANSPORTES: 'TransporteSucatas',
        EFETIVO: 'Efetivo',
        EQUIPAMENTOS: 'Equipamentos'
    },

    // Chave secreta para acesso (via URL ?key=...)
    // IMPORTANTE: Use uma chave forte e complexa!
    SECRET_KEY: 'SUA_CHAVE_SECRETA_COMPLEXA_AQUI'
};

// ============================================
// PREÇOS MENSAIS - ENGECOM (Mão de Obra)
// ============================================
const PRECOS_ENGECOM = {
    ENCARREGADO_MES: 26488.37,      // 3008987
    OPERADOR_MES: 14584.80,         // 3008931
    ENCARREGADO_HH: 194.51,         // 3001423 (HH extra)
    OPERADOR_HH: 125.20,            // 3007979 (HH normal)
    OPERADOR_HH_EXTRA_50: 134.97,   // 3008985 (50%)
    OPERADOR_HH_EXTRA_100: 230.95,  // 3008984 (100%)
    SOLDADOR_MES: 30749.83,         // 3001261
    HH_IMPRODUTIVA: 74.58,          // 3003701
    HH_DESLOCAMENTO: 118.94,        // 3002231
    KM_EXCEDENTE: 40.73             // 3001262
};

// ============================================
// PREÇOS MENSAIS - ENCOGEL (Equipamentos)
// ============================================
const PRECOS_ENCOGEL = {
    CAMINHAO_CABINADO_MES: 43248.34,        // 3008938 (TMC)
    CAMINHAO_MUNCK_MES: 54870.19,           // 3004813 (TP)
    MICRO_ONIBUS_MES: 43246.76,             // 3008932 (TP)
    MINI_ESCAVADEIRA_MES: 51462.78,         // 3005092 (TP)
    RETRO_ESCAVADEIRA_MES: 54171.34,        // 3005116
    ESCAVADEIRA_18TON_MES: 57237.61,        // 3005074
    PA_CARREGADEIRA_MES: 61812.42,          // 3005110
    CAMINHAO_BASCULANTE_MES: 52845.99,      // 3002090
    CARRETA_PRANCHA_MES: 52975.05,          // 3005131

    // Valores por hora
    CAMINHAO_MUNCK_H: 678.17,               // 3001191
    MINI_ESCAVADEIRA_H: 454.22,             // 3002172
    RETRO_ESCAVADEIRA_H: 632.41,            // 3004944
    ESCAVADEIRA_HIDRAULICA_H: 597.35,       // 3001193
    ESCAVADEIRA_22TON_H: 810.59,            // 3004899

    // Hora extra
    CAMINHAO_CABINADO_HE_100: 491.46,       // 3008936
    CAMINHAO_CABINADO_HE_50: 368.59,        // 3008937
    MINI_ESCAVADEIRA_HE_100: 907.38,        // 3008935
    MINI_ESCAVADEIRA_HE_50: 680.45,         // 3008960
    RETRO_ESCAVADEIRA_HE_100: 948.61        // 3008933
};

// ============================================
// TURMAS - Configuração
// ============================================
const TURMAS = {
    // TPs - Turmas de Produção
    TPS: [
        { codigo: 'TP-273', tipo: 'TP' },
        { codigo: 'TP-274', tipo: 'TP' },
        { codigo: 'TP-761', tipo: 'TP' },
        { codigo: 'TP-773', tipo: 'TP' },
        { codigo: 'TP-764', tipo: 'TP' },
        { codigo: 'TP-768', tipo: 'TP' },
        { codigo: 'TP-776', tipo: 'TP' },
        { codigo: 'TP-763', tipo: 'TP' },
        { codigo: 'TP-891', tipo: 'TP' },
        { codigo: 'TP-876', tipo: 'TP' },
        { codigo: 'TP-900', tipo: 'TP' },
        { codigo: 'TP-910', tipo: 'TP' },
        { codigo: 'TP-911', tipo: 'TP' },
        { codigo: 'TP-912', tipo: 'TP' },
        { codigo: 'TP-920', tipo: 'TP' },
        { codigo: 'TP-922', tipo: 'TP' }
    ],

    // TMCs - Turmas de Manutenção Corretiva
    TMCS: [
        { codigo: 'TMC 806', tipo: 'TMC' },
        { codigo: 'TMC 807', tipo: 'TMC' },
        { codigo: 'TMC 810', tipo: 'TMC' },
        { codigo: 'TMC 808', tipo: 'TMC' },
        { codigo: 'TMC 809', tipo: 'TMC' }
    ]
};

// ============================================
// ENCARREGADOS (para tracking de TPs)
// ============================================
const ENCARREGADOS = [
    'Adalton Trindade da Paixão',
    'Ilson Soares de Oliveira',
    'Leandro Morais da Silva',
    'Tharlleson M. Sobrinho',
    'Werbet Santos dos Santos',
    'Wilson Puff',
    'Sergio de Almeida Oliveira Bispo',
    'Marcos Jorge Marinho',
    'Weividy Fernandes',
    'Carlos Alexandre Heupa',
    'Odair José Miranda da Silva'
];

// ============================================
// COMPOSIÇÃO PADRÃO DAS TURMAS
// ============================================
const COMPOSICAO_PADRAO = {
    TMC: {
        encarregados: 1,
        operadores: 6,
        equipamentos: {
            caminhao_cabinado: 1
        }
    },
    TP: {
        encarregados: 1,
        operadores: 12,
        equipamentos: {
            caminhao_munck: 1,
            micro_onibus: 1,
            mini_escavadeira: 1
        }
    }
};

// ============================================
// METAS E LIMITES
// ============================================
const METAS = {
    // TPs
    HH_POR_OPERADOR_DIA: 8,         // Horas por operador por dia
    OPERADORES_TP: 12,               // Número padrão de operadores TP
    META_DIARIA_TP: 96,              // 12 × 8 = 96 HH/dia
    LIMITE_FATURAMENTO_TP: 1.10,     // 110% do valor fixo

    // TSs
    META_DIARIA_TS: 8,               // 1 soldador × 8h = 8 HH/dia

    // Improdutivas
    DIVISOR_CHUVA: 2,                // Horas de chuva contam como metade
    MINUTOS_MINIMOS_TREM: 15         // Trens só contam se > 15 min
};

// ============================================
// CORES PARA VISUALIZAÇÕES
// ============================================
const CORES = {
    // Status de performance
    VERDE: '#4CAF50',      // Meta atingida (>= 96 HH)
    AMARELO: '#FFC107',    // Próximo da meta (80-95 HH)
    VERMELHO: '#F44336',   // Abaixo da meta (< 80 HH)
    AZUL: '#2196F3',       // Informativo
    ROXO: '#9C27B0',       // Destaque
    LARANJA: '#FF9800',    // Alerta
    CINZA: '#9E9E9E',      // Neutro

    // Charts
    PRIMARY: '#1976D2',
    SECONDARY: '#424242',
    SUCCESS: '#4CAF50',
    WARNING: '#FFC107',
    DANGER: '#F44336',
    INFO: '#2196F3'
};

// ============================================
// THRESHOLDS PARA ALERTAS
// ============================================
const THRESHOLDS = {
    // TP - Performance
    SLA_CRITICO: 0.80,      // < 80% = vermelho
    SLA_ALERTA: 0.95,       // 80-95% = amarelo
    SLA_OK: 0.96,           // >= 96% = verde

    // TP - Faturamento
    FATURAMENTO_PROXIMO_TETO: 1.05,  // >= 105% = alerta amarelo
    FATURAMENTO_NO_TETO: 1.10,        // >= 110% = alerta vermelho

    // TMC - Dias trabalhados
    DIAS_ACIMA_MEDIA: 1.05,           // > 105% dos dias úteis

    // Gerais
    AUSENCIAS_ALERTA: 2,              // >= 2 ausências por semana
    VARIACAO_ANORMAL_OPERADORES: 0.20 // ±20% da composição padrão
};

// ============================================
// UTILITÁRIOS
// ============================================

/**
 * Retorna o tipo de turma (TMC ou TP) a partir do código
 */
function getTipoTurma(codigoTurma) {
    if (codigoTurma.startsWith('TP-')) return 'TP';
    if (codigoTurma.startsWith('TMC ')) return 'TMC';
    return 'DESCONHECIDO';
}

/**
 * Retorna a composição padrão de uma turma
 */
function getComposicaoPadrao(codigoTurma) {
    const tipo = getTipoTurma(codigoTurma);
    return COMPOSICAO_PADRAO[tipo] || null;
}

/**
 * Calcula a meta mensal de HH para uma TP
 */
function calcularMetaMensalTP(diasUteis) {
    return METAS.META_DIARIA_TP * diasUteis;
}

/**
 * Calcula o valor fixo mensal de uma TMC
 */
function calcularValorFixoTMC() {
    const engecom = PRECOS_ENGECOM.ENCARREGADO_MES +
                    (COMPOSICAO_PADRAO.TMC.operadores * PRECOS_ENGECOM.OPERADOR_MES);

    const encogel = PRECOS_ENCOGEL.CAMINHAO_CABINADO_MES;

    return {
        engecom,
        encogel,
        total: engecom + encogel
    };
}

/**
 * Calcula o valor fixo mensal de uma TP
 */
function calcularValorFixoTP() {
    const engecom = PRECOS_ENGECOM.ENCARREGADO_MES +
                    (COMPOSICAO_PADRAO.TP.operadores * PRECOS_ENGECOM.OPERADOR_MES);

    const encogel = PRECOS_ENCOGEL.CAMINHAO_MUNCK_MES +
                    PRECOS_ENCOGEL.MICRO_ONIBUS_MES +
                    PRECOS_ENCOGEL.MINI_ESCAVADEIRA_MES;

    return {
        engecom,
        encogel,
        total: engecom + encogel
    };
}

/**
 * Formata valor para moeda brasileira
 */
function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

/**
 * Formata percentual
 */
function formatarPercentual(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format(valor);
}

/**
 * Retorna cor baseada no % do SLA
 */
function getCorPorSLA(percentualSLA) {
    if (percentualSLA >= THRESHOLDS.SLA_OK) return CORES.VERDE;
    if (percentualSLA >= THRESHOLDS.SLA_ALERTA) return CORES.AMARELO;
    return CORES.VERMELHO;
}

// Exportar para uso global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        PRECOS_ENGECOM,
        PRECOS_ENCOGEL,
        TURMAS,
        ENCARREGADOS,
        COMPOSICAO_PADRAO,
        METAS,
        CORES,
        THRESHOLDS,
        getTipoTurma,
        getComposicaoPadrao,
        calcularMetaMensalTP,
        calcularValorFixoTMC,
        calcularValorFixoTP,
        formatarMoeda,
        formatarPercentual,
        getCorPorSLA
    };
}
