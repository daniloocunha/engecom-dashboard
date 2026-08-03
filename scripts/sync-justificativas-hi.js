#!/usr/bin/env node

/**
 * Script de Sincronização do Catálogo de Justificativas de HI
 *
 * FONTE ÚNICA DA VERDADE: app/src/main/res/raw/justificativas_hi.json
 *
 * Este script gera automaticamente:
 * - dashboard/justificativas_hi.json (cópia para uso via HTTP)
 * - dashboard/js/justificativas-hi-data.js (constante JS para fallback CORS)
 *
 * USO:
 *   node scripts/sync-justificativas-hi.js
 *   npm run sync-justificativas (se configurado no package.json)
 */

const fs = require('fs');
const path = require('path');

// Caminhos dos arquivos
const FONTE = path.join(__dirname, '..', 'app', 'src', 'main', 'res', 'raw', 'justificativas_hi.json');
const DESTINO_JSON = path.join(__dirname, '..', 'dashboard', 'justificativas_hi.json');
const DESTINO_JS = path.join(__dirname, '..', 'dashboard', 'js', 'justificativas-hi-data.js');

console.log('🔄 Sincronizando justificativas de HI...\n');

// 1. Verificar se o arquivo fonte existe
if (!fs.existsSync(FONTE)) {
    console.error('❌ ERRO: Arquivo fonte não encontrado!');
    console.error(`   Esperado em: ${FONTE}`);
    process.exit(1);
}

// 2. Ler e validar o arquivo fonte
let catalogo;
try {
    const conteudo = fs.readFileSync(FONTE, 'utf8');
    catalogo = JSON.parse(conteudo);

    if (!Array.isArray(catalogo.justificativas)) {
        throw new Error('justificativas_hi.json deve ter um array "justificativas"');
    }

    console.log(`✅ Arquivo fonte lido: ${catalogo.justificativas.length} justificativas`);
    console.log(`   Fonte: ${FONTE}\n`);
} catch (error) {
    console.error('❌ ERRO ao ler arquivo fonte:', error.message);
    process.exit(1);
}

// 3. Gerar dashboard/justificativas_hi.json (cópia formatada)
try {
    const jsonFormatado = JSON.stringify(catalogo, null, 2);
    fs.writeFileSync(DESTINO_JSON, jsonFormatado, 'utf8');
    console.log('✅ Gerado: dashboard/justificativas_hi.json');
    console.log(`   Tamanho: ${(jsonFormatado.length / 1024).toFixed(2)} KB\n`);
} catch (error) {
    console.error('❌ ERRO ao gerar dashboard/justificativas_hi.json:', error.message);
    process.exit(1);
}

// 4. Gerar dashboard/js/justificativas-hi-data.js (constante JavaScript)
try {
    const timestamp = new Date().toISOString();
    const conteudoJS = `/**
 * Catálogo de justificativas de Horas Improdutivas (HI)
 *
 * ⚠️  ESTE ARQUIVO É GERADO AUTOMATICAMENTE!
 * ⚠️  NÃO EDITE MANUALMENTE!
 *
 * Fonte: app/src/main/res/raw/justificativas_hi.json
 * Gerado em: ${timestamp}
 * Script: scripts/sync-justificativas-hi.js
 *
 * Para atualizar este arquivo:
 *   1. Edite: app/src/main/res/raw/justificativas_hi.json
 *   2. Execute: node scripts/sync-justificativas-hi.js
 *
 * Consumido por dashboard/js/justificativas-hi.js (classe JustificativasHI).
 */

const JUSTIFICATIVAS_HI_BASE = ${JSON.stringify(catalogo, null, 2)};
`;

    fs.writeFileSync(DESTINO_JS, conteudoJS, 'utf8');
    console.log('✅ Gerado: dashboard/js/justificativas-hi-data.js');
    console.log(`   Tamanho: ${(conteudoJS.length / 1024).toFixed(2)} KB\n`);
} catch (error) {
    console.error('❌ ERRO ao gerar dashboard/js/justificativas-hi-data.js:', error.message);
    process.exit(1);
}

// 5. Estatísticas
const porCategoria = catalogo.justificativas.reduce((acc, j) => {
    acc[j.categoria] = (acc[j.categoria] || 0) + 1;
    return acc;
}, {});

console.log('📊 Estatísticas:');
console.log(`   Total: ${catalogo.justificativas.length} justificativas`);
Object.entries(porCategoria).forEach(([categoria, qtd]) => {
    console.log(`   ${categoria}: ${qtd}`);
});
console.log('');

console.log('✅ Sincronização concluída com sucesso!\n');
console.log('📝 Próximos passos:');
console.log('   1. Para editar justificativas: app/src/main/res/raw/justificativas_hi.json');
console.log('   2. Após editar, execute: node scripts/sync-justificativas-hi.js');
console.log('   3. Commit todos os 3 arquivos juntos no Git\n');
