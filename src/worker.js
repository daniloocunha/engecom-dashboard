/**
 * Cloudflare Worker — Engecom Dashboard
 *
 * Serve os arquivos estáticos do dashboard E atua como proxy reverso
 * para o Google Apps Script, eliminando erros de CORS.
 *
 * Rota especial:
 *   POST /api/apps-script  →  encaminha para env.APPS_SCRIPT_URL (servidor→servidor, sem CORS)
 *
 * Todas as outras rotas:
 *   →  env.ASSETS.fetch(request)  (arquivos estáticos do dashboard/)
 *
 * Variável de ambiente (wrangler.jsonc → vars):
 *   APPS_SCRIPT_URL  —  URL de implantação do Google Apps Script
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // ── Proxy do Apps Script ──────────────────────────────────────────────
        if (url.pathname === '/api/apps-script') {
            return handleAppsScriptProxy(request, env);
        }

        // ── Arquivos estáticos do dashboard ──────────────────────────────────
        return env.ASSETS.fetch(request);
    }
};

/**
 * Ações do Apps Script que só leem dados — as únicas seguras de retentar
 * automaticamente, já que repetir a chamada não altera a planilha.
 */
const ACOES_SOMENTE_LEITURA = new Set(['listarGestaoOS', 'obterNotasDia']);

/**
 * Encaminha o POST para o Google Apps Script (servidor→servidor, sem CORS).
 * Garante que a resposta JSON chegue ao browser com o header
 * Access-Control-Allow-Origin: * mesmo que o Apps Script não o envie.
 */
async function handleAppsScriptProxy(request, env) {
    const corsHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
    };

    // Preflight OPTIONS (não deve chegar aqui pois /api/apps-script é same-origin,
    // mas tratamos por segurança)
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            }
        });
    }

    if (request.method !== 'POST') {
        return new Response(
            JSON.stringify({ sucesso: false, erro: 'Método não permitido. Use POST.' }),
            { status: 405, headers: corsHeaders }
        );
    }

    const appsScriptUrl = (env && env.APPS_SCRIPT_URL) ? env.APPS_SCRIPT_URL.trim() : '';
    if (!appsScriptUrl) {
        return new Response(
            JSON.stringify({ sucesso: false, erro: 'APPS_SCRIPT_URL não configurada no Worker.' }),
            { status: 500, headers: corsHeaders }
        );
    }

    try {
        // Lê o body uma única vez (stream só pode ser lido uma vez)
        const bodyText = await request.text();

        // Só ações de LEITURA podem ser retentadas automaticamente. Reenviar um
        // POST que já executou duplicaria escritas (adicionarServico/HI, criarRDO,
        // duplicarRDO) ou apagaria a linha errada (excluir* usa índice posicional).
        const acao = (() => {
            try { return JSON.parse(bodyText).acao || ''; } catch { return ''; }
        })();
        const tentativasMax = ACOES_SOMENTE_LEITURA.has(acao) ? 3 : 1;

        let httpStatus   = 0;
        let finalUrl     = appsScriptUrl;
        let responseText = '';
        let parsed       = null;

        for (let tentativa = 1; tentativa <= tentativasMax; tentativa++) {
            // redirect:'follow' é o comportamento correto aqui: o POST ao /exec
            // executa doPost() e o Apps Script devolve o resultado já computado
            // via 302 para uma URL "echo" em script.googleusercontent.com, que o
            // fetch busca com GET (conversão POST→GET do próprio spec). Seguir
            // esses hops manualmente NÃO funciona de forma confiável a partir do
            // Worker: a URL de echo fica atrelada à requisição que a originou e um
            // fetch separado recebe 404 de forma intermitente.
            const proxyResponse = await fetch(appsScriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: bodyText,
                redirect: 'follow'
            });

            httpStatus   = proxyResponse.status;
            finalUrl     = proxyResponse.url || appsScriptUrl;
            responseText = await proxyResponse.text();

            try { parsed = JSON.parse(responseText); } catch { parsed = null; }

            // Ocasionalmente a chamada chega ao doGet() em vez do doPost() e volta
            // o texto fixo do endpoint ("use POST") — é uma resposta JSON válida,
            // mas não é o resultado da ação pedida.
            const caiuNoDoGet = !!parsed && typeof parsed.descricao === 'string' &&
                                parsed.descricao.indexOf('use POST') >= 0;

            const falhou = !parsed || httpStatus >= 400 || caiuNoDoGet;
            if (!falhou) break;

            if (tentativa < tentativasMax) {
                await new Promise(r => setTimeout(r, 300 * tentativa));
            }
        }

        // Verifica se a resposta é JSON válido
        let jsonText;
        if (parsed) {
            jsonText = responseText;
        } else {
            // Apps Script retornou HTML — quase sempre significa redirecionamento
            // para página de login do Google (implantação exige conta Google) ou
            // página de erro de autorização de escopo (DriveApp não autorizado).

            // Detectar se é página de login do Google
            const isLoginPage = responseText.includes('accounts.google.com') ||
                                 responseText.includes('ServiceLogin') ||
                                 responseText.includes('signin/oauth');

            const dica = isLoginPage
                ? 'A implantação do Apps Script exige login Google. Abra o editor do Apps Script → Implantar → Gerenciar implantações → Editar → "Quem tem acesso" → mude para "Qualquer pessoa" → Implantar nova versão.'
                : 'Verifique as permissões do Apps Script (Drive pode não estar autorizado).';

            jsonText = JSON.stringify({
                sucesso: false,
                erro: `Resposta não-JSON do servidor (HTTP ${httpStatus}). ${dica}`,
                _httpStatus: httpStatus,
                _finalUrl: finalUrl,
                _htmlTrecho: responseText.substring(0, 500)
            });
        }

        return new Response(jsonText, { status: httpStatus, headers: corsHeaders });

    } catch (err) {
        return new Response(
            JSON.stringify({ sucesso: false, erro: 'Erro ao contactar o Apps Script: ' + err.message }),
            { status: 502, headers: corsHeaders }
        );
    }
}
