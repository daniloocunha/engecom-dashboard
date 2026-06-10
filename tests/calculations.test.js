/**
 * Testes da lógica de cálculo do dashboard (calculations.js + sheets-api.js).
 *
 * Roda com o test runner nativo do Node (sem dependências):
 *   npm test          (ou: node --test tests/)
 *
 * Os módulos do dashboard são scripts de browser (sem module.exports), então
 * são carregados em um sandbox `vm` com config.example.js fornecendo as
 * constantes (METAS, COMPOSICAO_PADRAO, etc.).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const BASE = path.join(__dirname, '..', 'dashboard', 'js');

function criarSandbox() {
    const sandbox = { console, setTimeout, clearTimeout };
    sandbox.window = sandbox; // field-helper.js usa window para exports
    vm.createContext(sandbox);

    for (const arquivo of ['config.example.js', 'field-helper.js', 'calculations.js', 'sheets-api.js']) {
        const code = fs.readFileSync(path.join(BASE, arquivo), 'utf8');
        vm.runInContext(code, sandbox, { filename: arquivo });
    }

    // Classes e const declaradas no top-level são lexicais — extrair por expressão
    sandbox._get = (expr) => vm.runInContext(expr, sandbox);
    return sandbox;
}

const ctx = criarSandbox();
const get = ctx._get;

// ────────────────────────────────────────────────
// validarNumeroOS (sheets-api.js)
// ────────────────────────────────────────────────
test('validarNumeroOS aceita formatos válidos', () => {
    const fn = get('validarNumeroOS');
    assert.equal(fn('998070'), true);   // 99xxxx
    assert.equal(fn('987654'), true);   // 98xxxx
    assert.equal(fn('1017755'), true);  // 1xxxxxx (7 dígitos)
    assert.equal(fn('1017755/1018836'), true); // combinada
});

test('validarNumeroOS rejeita formatos inválidos', () => {
    const fn = get('validarNumeroOS');
    assert.equal(fn(''), false);
    assert.equal(fn(null), false);
    assert.equal(fn('123456'), false);   // 6 dígitos sem prefixo 98/99
    assert.equal(fn('99807'), false);    // 5 dígitos
    assert.equal(fn('2017755'), false);  // 7 dígitos sem prefixo 1
    assert.equal(fn('1017755/abc'), false); // combinada com parte inválida
});

// ────────────────────────────────────────────────
// operadoresPadraoTurma (field-helper.js)
// ────────────────────────────────────────────────
test('operadoresPadraoTurma usa a composição padrão por tipo', () => {
    const fn = get('operadoresPadraoTurma');
    assert.equal(fn('TP-274'), 12);  // COMPOSICAO_PADRAO.TP.operadores
    assert.equal(fn('TS-912'), 5);   // 4 operadores + 1 soldador
    assert.equal(fn('TMC 806'), 6);  // COMPOSICAO_PADRAO.TMC.operadores
    assert.equal(fn(''), 12);        // desconhecido → fallback legado
});

// ────────────────────────────────────────────────
// CalculadoraMedicao — horários e HI
// ────────────────────────────────────────────────
function novaCalc() {
    return get('new CalculadoraMedicao()');
}

test('calcularDiferencaHoras: períodos normais e overnight', () => {
    const calc = novaCalc();
    assert.equal(calc.calcularDiferencaHoras('08:00', '12:30'), 4.5);
    assert.equal(calc.calcularDiferencaHoras('23:00', '02:00'), 3);
    assert.equal(calc.calcularDiferencaHoras('', '10:00'), 0);
    assert.equal(calc.calcularDiferencaHoras('25:00', '10:00'), 0); // inválido
});

test('_mergeHIIntervals: intervalo simples multiplica por operadores', () => {
    const calc = novaCalc();
    const his = [{ 'Hora Início': '08:00', 'Hora Fim': '10:00', Tipo: 'RUMO', Operadores: '10' }];
    assert.equal(calc._mergeHIIntervals(his, 12), 20); // 2h × 10 ops
});

test('_mergeHIIntervals: sobreposições não contam em dobro', () => {
    const calc = novaCalc();
    const his = [
        { 'Hora Início': '08:00', 'Hora Fim': '12:00', Tipo: 'Trem na via', Operadores: '12' },
        { 'Hora Início': '09:00', 'Hora Fim': '09:30', Tipo: 'Trem na via', Operadores: '12' }
    ];
    // União = 08:00–12:00 = 4h × 12 = 48 HH (não 54)
    assert.equal(calc._mergeHIIntervals(his, 12), 48);
});

test('_mergeHIIntervals: trem com menos de 20 min é descartado', () => {
    const calc = novaCalc();
    const his = [{ 'Hora Início': '08:00', 'Hora Fim': '08:10', Tipo: 'Trem', Operadores: '12' }];
    assert.equal(calc._mergeHIIntervals(his, 12), 0);
});

test('_mergeHIIntervals: chuva conta como metade', () => {
    const calc = novaCalc();
    const his = [{ 'Hora Início': '08:00', 'Hora Fim': '10:00', Tipo: 'Chuva', Operadores: '12' }];
    assert.equal(calc._mergeHIIntervals(his, 12), 12); // 2h × 12 ÷ 2
});

test('_mergeHIIntervals: período overnight', () => {
    const calc = novaCalc();
    const his = [{ 'Hora Início': '23:00', 'Hora Fim': '01:00', Tipo: 'RUMO', Operadores: '6' }];
    assert.equal(calc._mergeHIIntervals(his, 12), 12); // 2h × 6 ops
});

test('_mergeHIIntervals: usa operadoresDefault quando campo ausente', () => {
    const calc = novaCalc();
    const his = [{ 'Hora Início': '08:00', 'Hora Fim': '09:00', Tipo: 'RUMO' }];
    assert.equal(calc._mergeHIIntervals(his, 5), 5); // 1h × 5 (default TS)
});

// ────────────────────────────────────────────────
// Dias úteis e feriados
// ────────────────────────────────────────────────
test('calcularPascoa: datas conhecidas', () => {
    const calc = novaCalc();
    const p2026 = calc.calcularPascoa(2026);
    assert.equal(p2026.getMonth(), 3); // abril (0-based)
    assert.equal(p2026.getDate(), 5);

    const p2024 = calc.calcularPascoa(2024);
    assert.equal(p2024.getMonth(), 2); // março
    assert.equal(p2024.getDate(), 31);
});

test('getDiasUteis: novembro/2024 tem 20 dias úteis (21 − feriado 15/11)', () => {
    const calc = novaCalc();
    assert.equal(calc.getDiasUteis(11, 2024), 20);
});

test('getDiasUteis: feriado extra em dia útil reduz a contagem', () => {
    const calc = novaCalc();
    calc.feriadosExtras = ['28/11/2024']; // quinta-feira
    assert.equal(calc.getDiasUteis(11, 2024), 19);
});

test('getDiasUteis: feriado extra de outro ano é ignorado', () => {
    const calc = novaCalc();
    calc.feriadosExtras = ['28/11/2025'];
    assert.equal(calc.getDiasUteis(11, 2024), 20);
});

// ────────────────────────────────────────────────
// Medição TP de ponta a ponta (fixture mínima)
// ────────────────────────────────────────────────
test('calcularMedicaoTP: HH, meta e SLA com fixture mínima', async () => {
    const calc = novaCalc();

    const rdos = [{
        'Número RDO': '998070-05.11.24-001',
        'Data': '05/11/2024',
        'Código Turma': 'TP-274',
        'Número OS': '998070',
        'Deletado': ''
    }];
    const servicos = [{
        'Número RDO': '998070-05.11.24-001',
        'Quantidade': '100',
        coeficiente: 0.72   // injetado por enriquecerServicosComCoeficientes em produção
    }];
    const efetivos = [{
        'Número RDO': '998070-05.11.24-001',
        'Operadores': '12'
    }];

    await calc.carregarDados(rdos, servicos, [], efetivos, []);
    const med = calc.calcularMedicaoTP('TP-274', 11, 2024);

    assert.ok(med, 'medição deve existir');
    assert.equal(med.diasUteis, 20);
    assert.equal(med.metaMensal, 72 * 20);             // META_DIARIA_TP × dias úteis
    assert.equal(Math.round(med.hh.servicos), 72);     // 100 × 0.72
    assert.equal(med.hh.improdutivas, 0);
    assert.equal(med.percentualSLA, med.percentualSLAReal); // abaixo do teto
    assert.ok(Math.abs(med.percentualSLAReal - 72 / 1440) < 1e-9);
});

test('calcularMedicaoTP: RDO deletado é excluído do faturamento', async () => {
    const calc = novaCalc();
    const rdos = [{
        'Número RDO': 'X-05.11.24-001',
        'Data': '05/11/2024',
        'Código Turma': 'TP-274',
        'Deletado': 'Sim'
    }];
    await calc.carregarDados(rdos, [], [], [], []);
    assert.equal(calc.calcularMedicaoTP('TP-274', 11, 2024), null);
});
