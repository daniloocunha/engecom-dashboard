import assert from 'node:assert';
import test from 'node:test';
import worker from '../src/worker.js';

const env = { APPS_SCRIPT_URL: 'https://script.google.com/macros/s/X/exec' };
const req = (body) => new Request('https://x/api/apps-script', {
    method: 'POST', body: JSON.stringify(body)
});
const origFetch = globalThis.fetch;

function mockFetch(responses) {
    let i = 0;
    const calls = [];
    globalThis.fetch = async (url, opts) => {
        calls.push({ url, method: opts?.method, redirect: opts?.redirect });
        const r = responses[Math.min(i++, responses.length - 1)];
        return new Response(r.body, { status: r.status });
    };
    return { calls, count: () => i };
}

test('usa redirect:follow e um único POST quando dá certo de primeira', async () => {
    const m = mockFetch([{ status: 200, body: '{"sucesso":true,"dados":{}}' }]);
    const res = await worker.fetch(req({ acao: 'listarGestaoOS' }), env);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).sucesso, true);
    assert.equal(m.count(), 1);
    assert.equal(m.calls[0].redirect, 'follow');
    assert.equal(m.calls[0].method, 'POST');
});

test('retenta leitura quando volta 404 e sucede na 2a tentativa', async () => {
    const m = mockFetch([
        { status: 404, body: '<html>Página não encontrada</html>' },
        { status: 200, body: '{"sucesso":true,"dados":{"1":{}}}' }
    ]);
    const res = await worker.fetch(req({ acao: 'listarGestaoOS' }), env);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).sucesso, true);
    assert.equal(m.count(), 2);
});

test('retenta leitura quando cai no doGet ("use POST")', async () => {
    const m = mockFetch([
        { status: 200, body: '{"status":"ok","descricao":"Endpoint Engecom - use POST"}' },
        { status: 200, body: '{"sucesso":true,"dados":{}}' }
    ]);
    const res = await worker.fetch(req({ acao: 'listarGestaoOS' }), env);
    assert.equal((await res.json()).sucesso, true);
    assert.equal(m.count(), 2);
});

test('NAO retenta acao de escrita (evita duplicar lancamento)', async () => {
    const m = mockFetch([{ status: 404, body: '<html>erro</html>' }]);
    const res = await worker.fetch(req({ acao: 'adicionarServico' }), env);
    assert.equal(m.count(), 1, 'escrita deve tentar apenas uma vez');
    assert.equal((await res.json()).sucesso, false);
});

test('NAO retenta exclusao (indice posicional apagaria linha errada)', async () => {
    const m = mockFetch([{ status: 404, body: '<html>erro</html>' }]);
    await worker.fetch(req({ acao: 'excluirHI' }), env);
    assert.equal(m.count(), 1);
});

test('desiste apos 3 tentativas e devolve erro descritivo', async () => {
    const m = mockFetch([{ status: 404, body: '<html>Página não encontrada</html>' }]);
    const res = await worker.fetch(req({ acao: 'listarGestaoOS' }), env);
    assert.equal(m.count(), 3);
    const j = await res.json();
    assert.equal(j.sucesso, false);
    assert.match(j.erro, /HTTP 404/);
});

test.after(() => { globalThis.fetch = origFetch; });
