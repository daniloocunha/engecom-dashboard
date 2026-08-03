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

        // A requisição inicial ao /exec precisa ir como POST para que o Apps
        // Script execute doPost() (em vez de doGet()) — isso já acontece nesta
        // chamada abaixo, fora do loop. Quando a resposta é grande (ex.:
        // listarGestaoOS), o Apps Script já devolve o resultado computado
        // através de um redirect 302 para uma URL de conteúdo pré-computado em
        // script.googleusercontent.com (endpoint "echo"), que só aceita GET —
        // é somente uma leitura do resultado já calculado, não uma reexecução.
        // Por isso todo redirect subsequente é seguido como GET sem corpo;
        // reenviar POST nesse hop retorna 405 com uma página de desafio do
        // Google em vez do JSON.
        let proxyResponse = await fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyText,
            redirect: 'manual'
        });

        let redirects = 0;
        while (proxyResponse.status >= 300 && proxyResponse.status < 400 && redirects < 5) {
            const location = proxyResponse.headers.get('Location');
            if (!location) break;
            redirects++;
            proxyResponse = await fetch(location, { redirect: 'manual' });
        }

        const httpStatus = proxyResponse.status;
        const finalUrl   = proxyResponse.url || appsScriptUrl;
        const responseText = await proxyResponse.text();

        // Verifica se a resposta é JSON válido
        let jsonText;
        try {
            JSON.parse(responseText);
            jsonText = responseText;
        } catch {
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
