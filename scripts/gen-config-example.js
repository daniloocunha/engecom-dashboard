/**
 * Gera dashboard/js/config.example.js a partir do dashboard/js/config.js local,
 * substituindo os valores sensíveis por placeholders.
 *
 * Uso: npm run gen-config-example  (ou node scripts/gen-config-example.js)
 *
 * Rode sempre que alterar a ESTRUTURA do config.js (novas constantes, METAS,
 * COMPOSICAO_PADRAO, funções utilitárias) para manter o template em sincronia.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'dashboard', 'js', 'config.js');
const DST = path.join(__dirname, '..', 'dashboard', 'js', 'config.example.js');

const HEADER = `/**
 * Configurações do Dashboard de Medição - EXEMPLO
 * Engecom/Encogel - RUMO Logística
 *
 * INSTRUÇÕES:
 * 1. Copie este arquivo para config.js
 * 2. Substitua os placeholders pelas suas credenciais reais
 * 3. NUNCA commite o arquivo config.js no Git!
 *
 * ⚠️ ARQUIVO AUTO-GERADO por scripts/gen-config-example.js — não edite à mão.
 *    Edite o config.js local e rode: npm run gen-config-example
 */`;

const SECRETS = [
    { chave: 'SPREADSHEET_ID', placeholder: 'SEU_SPREADSHEET_ID_AQUI' },
    { chave: 'API_KEY', placeholder: 'SUA_API_KEY_AQUI' },
    { chave: 'SECRET_KEY', placeholder: 'SUA_CHAVE_SECRETA_COMPLEXA_AQUI' },
    { chave: 'APPS_SCRIPT_URL', placeholder: 'https://script.google.com/macros/s/SEU_DEPLOYMENT_ID/exec' }
];

function main() {
    if (!fs.existsSync(SRC)) {
        console.error(`❌ ${SRC} não encontrado. O gerador precisa do config.js local.`);
        process.exit(1);
    }

    let conteudo = fs.readFileSync(SRC, 'utf8');

    // Substituir o bloco de comentário inicial pelo header do exemplo
    conteudo = conteudo.replace(/^\/\*\*[\s\S]*?\*\//, HEADER);

    // Substituir valores sensíveis por placeholders (preserva comentários inline)
    let substituidos = 0;
    SECRETS.forEach(({ chave, placeholder }) => {
        const regex = new RegExp(`(${chave}\\s*:\\s*)'[^']*'`);
        if (regex.test(conteudo)) {
            conteudo = conteudo.replace(regex, `$1'${placeholder}'`);
            substituidos++;
        } else {
            console.warn(`⚠️ Chave "${chave}" não encontrada no config.js`);
        }
    });

    fs.writeFileSync(DST, conteudo, 'utf8');
    console.log(`✅ config.example.js gerado (${substituidos}/${SECRETS.length} secrets substituídos)`);
}

main();
