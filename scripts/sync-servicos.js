#!/usr/bin/env node

/**
 * Script de Sincronização de Serviços
 *
 * FONTE ÚNICA DA VERDADE: app/src/main/res/raw/servicos.json
 *
 * Este script gera automaticamente:
 * - dashboard/servicos.json (cópia para uso via HTTP)
 * - dashboard/js/servicos-data.js (constante JS para fallback CORS)
 *
 * USO:
 *   node scripts/sync-servicos.js
 *   npm run sync-servicos (se configurado no package.json)
 */

const fs = require('fs');
const path = require('path');

// Caminhos dos arquivos
const FONTE = path.join(__dirname, '..', 'app', 'src', 'main', 'res', 'raw', 'servicos.json');
const DESTINO_JSON = path.join(__dirname, '..', 'dashboard', 'servicos.json');
const DESTINO_JS = path.join(__dirname, '..', 'dashboard', 'js', 'servicos-data.js');

console.log('🔄 Sincronizando serviços...\n');

// 1. Verificar se o arquivo fonte existe
if (!fs.existsSync(FONTE)) {
    console.error('❌ ERRO: Arquivo fonte não encontrado!');
    console.error(`   Esperado em: ${FONTE}`);
    process.exit(1);
}

// 2. Ler e validar o arquivo fonte
let servicosData;
try {
    const conteudo = fs.readFileSync(FONTE, 'utf8');
    servicosData = JSON.parse(conteudo);

    if (!Array.isArray(servicosData)) {
        throw new Error('servicos.json deve ser um array');
    }

    console.log(`✅ Arquivo fonte lido: ${servicosData.length} serviços`);
    console.log(`   Fonte: ${FONTE}\n`);
} catch (error) {
    console.error('❌ ERRO ao ler arquivo fonte:', error.message);
    process.exit(1);
}

// 3. Gerar dashboard/servicos.json (cópia formatada)
try {
    const jsonFormatado = JSON.stringify(servicosData, null, 2);
    fs.writeFileSync(DESTINO_JSON, jsonFormatado, 'utf8');
    console.log('✅ Gerado: dashboard/servicos.json');
    console.log(`   Tamanho: ${(jsonFormatado.length / 1024).toFixed(2)} KB\n`);
} catch (error) {
    console.error('❌ ERRO ao gerar dashboard/servicos.json:', error.message);
    process.exit(1);
}

// 4. Gerar dashboard/js/servicos-data.js (constante JavaScript)
try {
    const timestamp = new Date().toISOString();
    const conteudoJS = `/**
 * Dados base de serviços e coeficientes
 *
 * ⚠️  ESTE ARQUIVO É GERADO AUTOMATICAMENTE!
 * ⚠️  NÃO EDITE MANUALMENTE!
 *
 * Fonte: app/src/main/res/raw/servicos.json
 * Gerado em: ${timestamp}
 * Script: scripts/sync-servicos.js
 *
 * Para atualizar este arquivo:
 *   1. Edite: app/src/main/res/raw/servicos.json
 *   2. Execute: node scripts/sync-servicos.js
 *
 * Este arquivo é usado como fallback quando servicos.json não pode ser
 * carregado por CORS (ex: quando o dashboard é aberto como file://)
 */

const SERVICOS_BASE = ${JSON.stringify(servicosData, null, 2)};
`;

    fs.writeFileSync(DESTINO_JS, conteudoJS, 'utf8');
    console.log('✅ Gerado: dashboard/js/servicos-data.js');
    console.log(`   Tamanho: ${(conteudoJS.length / 1024).toFixed(2)} KB\n`);
} catch (error) {
    console.error('❌ ERRO ao gerar dashboard/js/servicos-data.js:', error.message);
    process.exit(1);
}

// 5. Estatísticas
const servicosValidos = servicosData.filter(s => s.descricao && s.descricao.trim() !== '' && s.coeficiente > 0);
const servicosVazios = servicosData.filter(s => !s.descricao || s.descricao.trim() === '');
const servicosSeparadores = servicosData.filter(s => s.descricao && s.coeficiente === 0 && s.descricao.trim() !== '');

console.log('📊 Estatísticas:');
console.log(`   Total: ${servicosData.length} registros`);
console.log(`   Serviços válidos: ${servicosValidos.length}`);
console.log(`   Separadores/categorias: ${servicosSeparadores.length}`);
console.log(`   Vazios: ${servicosVazios.length}`);
console.log('');

console.log('✅ Sincronização concluída com sucesso!\n');
console.log('📝 Próximos passos:');
console.log('   1. Para editar serviços: app/src/main/res/raw/servicos.json');
console.log('   2. Após editar, execute: node scripts/sync-servicos.js');
console.log('   3. Commit todos os 3 arquivos juntos no Git\n');
