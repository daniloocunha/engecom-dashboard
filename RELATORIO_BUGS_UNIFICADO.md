# Relatório Unificado de Bugs, Inconsistências e Riscos

**Projeto:** CalculadoraHH (Controle de Campo)
**Escopo:** App Android + Google Sheets + Dashboard + Apps Script + Cloudflare Worker
**Data:** 2026-03-22
**Método:** Análise estática completa do código-fonte, documentação e fluxos de dados

---

## Resumo Executivo

| Severidade | Quantidade |
|------------|-----------|
| CRÍTICO    | 9         |
| ALTO       | 10        |
| MÉDIO      | 17        |
| BAIXO      | 2         |
| **TOTAL**  | **38**    |

### Top 5 Mais Graves
1. **Colisão de Número RDO entre dispositivos** — dois devices podem gerar o mesmo ID, causando sobrescrita de dados
2. **Data de Criação corrompida em todo UPDATE** — lê coluna errada (V ao invés de U)
3. **Cache do Dashboard mutado permanentemente** — filtrar por turma destrói dados de outras turmas
4. **Dashboard reverte mudanças manuais de OS** — normalização automática desfaz correções
5. **Calendário TS inteiramente quebrado** — `META_DIARIA_TS` undefined, todos os cálculos = NaN

---

## BUGS CRÍTICOS

### C1. Colisão de `Número RDO` entre dispositivos
- **Onde:** `DatabaseHelper.kt:287-310`
- **Problema:** O `Número RDO` (formato `OS-DD.MM.YY-XXX`) é gerado localmente contando registros no SQLite. Dois dispositivos com a mesma OS na mesma data geram ambos `998070-22.03.26-001`. Quando sincronizam, o segundo faz UPDATE sobre o primeiro → perda de dados.
- **Impacto:** Sobrescrita silenciosa de RDOs em ambientes multi-dispositivo.
- **Recomendação:** Incorporar componente único ao Número RDO (deviceId, UUID parcial ou timestamp) ou gerar sequencial no Sheets via Apps Script.

### C2. Data de Criação corrompida em toda atualização de RDO
- **Onde:** `GoogleSheetsService.kt:184`
- **Problema:** Ao atualizar um RDO, o código lê a coluna **V** (Versão App) pensando ser "Data Criação" (coluna **U**). O valor "15" (versionCode) substitui a data original "2025-11-15 14:30:00".
- **Impacto:** Toda atualização de RDO corrompe o campo Data Criação no Sheets. Invalida auditoria e histórico.
- **Fix:** Mudar range de `!V${rowNumber}` para `!U${rowNumber}`. Derivar coluna a partir de `HEADERS_RDO` ao invés de hardcode.

### C3. Cache do Dashboard mutado permanentemente ao filtrar por turma
- **Onde:** `calculations.js:976-1068` + `main.js:323-333`
- **Problema:** `calcularEstatisticasConsolidadas()` cacheia por mês+ano. Depois, `main.js` aplica filtros de turma/tipo **mutando o array do cache** (`.filter()` sobre o objeto retornado por referência). Ao voltar para "Todas as turmas", os dados das outras turmas já foram removidos do cache.
- **Impacto:** Após filtrar por turma específica e voltar para "todas", dados somem até recarregar a página ou re-fetch.
- **Fix:** Deep-clone o resultado do cache antes de filtrar, ou incluir turma/tipo na chave do cache.

### C4. Dashboard reverte mudanças manuais de OS
- **Onde:** `sheets-api.js:260-273`
- **Problema:** O dashboard extrai o Número OS do prefixo do `Número RDO` (ex: "998070" de "998070-22.03.26-001") e sobrescreve o campo `Número OS` se divergir. Isso desfaz qualquer correção manual de OS feita diretamente no Sheets ou via Apps Script.
- **Impacto:** Correções de OS são "revertidas" silenciosamente pelo dashboard toda vez que carrega dados.
- **Recomendação:** Quando OS mudar, regenerar `Número RDO` e cascatar para todas as abas; ou remover a correção automática quando a mudança foi intencional via `atualizarOSCascata`.

### C5. `atualizarOSCascata` não atualiza o `Número RDO`
- **Onde:** `apps-script-atualizar-os.gs:412-443`
- **Problema:** Ao trocar o Número OS em cascata (ex: 998070 → 998071), a coluna "Número OS" é atualizada em 7 abas, mas o **Número RDO** (que contém o OS no prefixo) permanece inalterado. Como `Número RDO` é a chave primária de join entre todas as abas, todos os relacionamentos quebram.
- **Impacto:** Após cascata, Dashboard não consegue mais associar serviços, HI, efetivo ao RDO. C4 agrava o problema revertendo a OS.

### C6. Calendário TS inteiramente quebrado (`META_DIARIA_TS` undefined)
- **Onde:** `calendario-ts.js:145,205,226`
- **Problema:** `METAS.META_DIARIA_TS` não existe no `config.example.js` (só tem `META_DIARIA_TP: 96`). Resultado: `metaDiaria = undefined`, todos os cálculos viram `NaN`, todos os dias aparecem vermelhos.
- **Impacto:** Calendário TS 100% inutilizado em qualquer deploy novo.
- **Fix:** Adicionar `META_DIARIA_TS: 8` ao objeto `METAS` no config.

### C7. Calendário TS não usa algoritmo de merge de HI
- **Onde:** `calendario-ts.js:124-143`
- **Problema:** O calendário TP usa `_calcularHHMerged()` para evitar dupla contagem de HI sobrepostas. O calendário TS simplesmente soma `hi['HH Improdutivas']` bruto. HI sobrepostas são contadas duplamente.
- **Impacto:** HH Improdutivas infladas → SLA inflado → faturamento errado para turmas TS.

### C8. Calendário TS faz join por OS+Data ao invés de Número RDO
- **Onde:** `calendario-ts.js:53-68, 74-79`
- **Problema:** O TP usa `Número RDO` como chave de join (confiável). O TS usa `Número OS + Data RDO`, que falha quando existem múltiplos RDOs para mesma OS+data (possível via `dividirOS`).
- **Impacto:** Dados de serviços misturados entre RDOs, HH incorretos.

### C9. Merge de HI com operadores diferentes calcula errado
- **Onde:** `calculations.js:630-636` + `calendario-tp.js:149-166`
- **Problema:** Ao mesclar dois HI sobrepostos com quantidades diferentes de operadores, usa `Math.max()` para o intervalo inteiro. Ex: HI-A 08:00-10:00 (5 ops) + HI-B 09:00-12:00 (10 ops) → merge 08:00-12:00 (10 ops) = 40 HH. Correto: 1h×5 + 1h×10 + 2h×10 = 35 HH.
- **Impacto:** Superestima HH Improdutivas quando HI têm operadores diferentes, inflando faturamento.

---

## BUGS ALTOS

### A1. Perda de dados relacionados se sync interrompido durante UPDATE
- **Onde:** `GoogleSheetsService.kt:206-218`
- **Problema:** UPDATE faz: (1) atualiza linha RDO, (2) deleta dados relacionados, (3) re-insere dados relacionados. Passos 2-3 não são atômicos. Se crash/timeout entre delete e insert, serviços/materiais/HI são perdidos permanentemente.
- **Impacto:** RDO existe no Sheets mas sem dados associados. Irrecuperável sem backup.

### A2. Proteção de versão causa dados duplicados
- **Onde:** `SheetsRelatedDataManager.kt:190-199` + `GoogleSheetsService.kt:209-217`
- **Problema:** Se versão do app < versão do RDO no Sheets, o delete é silenciosamente ignorado (retorna sem erro), mas o insert subsequente executa normalmente. Resultado: dados relacionados duplicados.
- **Recomendação:** Se versão do Sheets for maior, abortar todo o sync (incluindo update da linha principal) e registrar conflito.

### A3. `causaNaoServico` salvo no SQLite mas não sincronizado
- **Onde:** `SheetsConstants.kt:23`, `SheetsRelatedDataManager.kt:29-52`
- **Problema:** Campo existe no DB (migration v10), é preenchido pelo usuário, mas foi removido dos headers do Sheets (v6: "removido — redundante"). Dashboard e Sheets nunca veem este dado.
- **Impacto:** Informação "Causa Não Serviço" perdida na sincronização.

### A4. Apps Script usa nome de aba errado para Transportes
- **Onde:** `apps-script-atualizar-os.gs:417`
- **Problema:** Referencia `'Transportes'`, mas o nome real da aba é `'TransporteSucatas'` (confirmado em `SheetsConstants.kt:17`).
- **Impacto:** Atualizações em cascata de OS não atingem a aba de transportes, criando divergência entre RDO e dados relacionados.
- **Fix:** Trocar `'Transportes'` por `'TransporteSucatas'`.

### A5. Calendário TP: totais mensais inconsistentes com totais diários
- **Onde:** `calendario-tp.js:630-640`
- **Problema:** Card header do calendário usa `hi['HH Improdutivas']` pré-computado do Sheets. Células diárias usam `_calcularHHMerged()`. Valores divergem quando há sobreposição de HI.
- **Impacto:** Usuário vê totais diferentes no cabeçalho vs. soma dos dias.

### A6. Gestão OS: datas com ano de 2 dígitos nunca aparecem
- **Onde:** `gestao-os.js:1211-1216, 1553-1557`
- **Problema:** Filtro compara `+parts[2]` (ex: `25`) com `filtroAno` (ex: `2025`). Nunca bate.
- **Fix:** Normalizar: `const year = parts[2].length === 2 ? 2000 + +parts[2] : +parts[2]`.

### A7. Módulo AnaliseTMC completamente inoperante
- **Onde:** `analise-tmc.js:202-210`
- **Problema:** (1) Nunca é inicializado pelo orquestrador `main.js`. (2) Lê campos inexistentes do objeto RDO (`rdo['Total Efetivo']`, `rdo['Total Operadores']`) — sempre retorna 0.
- **Impacto:** Seção TMC Analysis vazia.

### A8. Calendário TS ignora múltiplos RDOs no mesmo dia
- **Onde:** `calendario-ts.js:102`
- **Problema:** Usa `.find()` (retorna só o primeiro RDO). Se turma TS tem 2 RDOs no dia (2 OS), o segundo é ignorado. O TP corretamente usa `.filter()` + agregação.

### A9. `atualizarOSCascata` sem proteção LockService
- **Onde:** `apps-script-atualizar-os.gs:412-443`
- **Problema:** `salvarGestaoOS` e `dividirOS` usam `LockService.getScriptLock()`, mas `atualizarOSCascata` não. Cascatas simultâneas podem sobrescrever uma à outra.

### A10. Atualização de headers no Sheets não migra dados existentes
- **Onde:** `SheetsHeaderManager.kt:64-121`
- **Problema:** Quando headers são atualizados (ex: nova coluna inserida), apenas a linha de header é substituída. Dados existentes ficam deslocados sob headers errados.
- **Impacto:** Se colunas forem adicionadas/reordenadas, dados antigos ficam em colunas trocadas, causando cálculos incorretos no dashboard.
- **Recomendação:** Abortar sync quando headers estiverem inconsistentes e exigir migração; ou fornecer script de migração de colunas.

---

## BUGS MÉDIOS

### M1. KPI "Total de RDOs" ignora filtros de turma/tipo
- **Onde:** `main.js:410-414`
- **Problema:** Conta todos os RDOs do período, ignorando turma selecionada.

### M2. `calcularMediaEfetivo` não inclui Operador EGP e Técnico Segurança
- **Onde:** `calculations.js:287-298`
- **Problema:** Soma apenas `operadores + encarregado + motoristas + soldadores`. Faltam EGP e Tec. Segurança (que os calendários incluem corretamente).

### M3. `contarDiasUnicos` não normaliza datas ISO
- **Onde:** `calculations.js:785-788`
- **Problema:** Datas ISO ("2025-01-15") e DD/MM/YYYY ("15/01/2025") criam duas entradas para o mesmo dia → infla `diasTrabalhados` → afeta faturamento TMC.

### M4. Heatmap ordena dias por string ao invés de data
- **Onde:** `calculations.js:764`
- **Problema:** `localeCompare` em DD/MM/YYYY → "02/01" aparece antes de "15/12". Dias fora de ordem.

### M5. `calcularHHPorDia` não normaliza datas como chave
- **Onde:** `calculations.js:705`
- **Problema:** ISO e DD/MM/YYYY criam entradas separadas para o mesmo dia, dividindo o HH em dois buckets.

### M6. Alertas de dados customizados perdidos
- **Onde:** `alerts-system.js:49`
- **Problema:** `analisarEstatisticas()` faz `this.alerts = []`, apagando alertas de serviços customizados sem HH adicionados anteriormente por `adicionarAlertasDados()`.

### M7. `setMediu()` não atualiza cache local `_dadosServidor`
- **Onde:** `gestao-os.js:409-420`
- **Problema:** Grava no localStorage e servidor, mas não no cache em memória. `getMediu()` retorna valor stale até reload.

### M8. `resetarRDOsPresos` usa formato de data não-ordenável no SQLite
- **Onde:** `DatabaseHelper.kt:1089-1112`
- **Problema:** Compara timestamps `dd/MM/yyyy HH:mm:ss` como string no SQLite (lexicográfico). Formato DD/MM/YYYY não é ordenável lexicograficamente — falha em comparações entre meses/anos diferentes.
- **Fix:** Usar formato ISO 8601 (`yyyy-MM-dd HH:mm:ss`) para timestamps.

### M9. RDOs em ERROR retentados infinitamente
- **Onde:** `DatabaseHelper.kt:983-1013`
- **Problema:** Sem limite máximo de retentativas. RDOs corrompidos gastam quota da API a cada 6h, para sempre.

### M10. Worker sempre retorna HTTP 200
- **Onde:** `src/worker.js:115`
- **Problema:** Erros do Apps Script (500, timeout) chegam como 200 no frontend. Tratamento de erro client-side baseado em status HTTP nunca funciona.

### M11. XSS no modal do Calendário TS
- **Onde:** `calendario-ts.js:456-622`
- **Problema:** Dados do Sheets (encarregado, local, observações) inseridos como HTML sem `escapeHtml()`. Calendário TP escapa corretamente.

### M12. SLA do TS usa `diasTrabalhados` ao invés de `diasUteis`
- **Onde:** `calendario-ts.js:200-206`
- **Problema:** Turma que trabalha 5/22 dias e bate meta cada dia mostra SLA 100%. TP/TMC usam dias úteis corretamente.

### M13. Variáveis globais implícitas no Apps Script
- **Onde:** `apps-script-atualizar-os.gs:622`
- **Problema:** `var colDesc = colQty = colCoef = ...` — só `colDesc` é `var`, as outras 7 são globais implícitas. Risco de overwrite em execuções concorrentes.

### M14. `deleteSheetRows` retorno ignorado
- **Onde:** `SheetsRelatedDataManager.kt:223`
- **Problema:** Falha na deleção de linhas é silenciosa → dados órfãos sem detecção.

### M15. `Acompanhamento` ausente da lista de cascata de OS
- **Onde:** `apps-script-atualizar-os.gs:416-417`
- **Problema:** A cascata atualiza 7 abas mas não inclui `Acompanhamento`, que também contém `Número OS`.

### M16. `_moverLinhasParaNovoRDO` sem flush entre append e delete
- **Onde:** `apps-script-atualizar-os.gs:668-679`
- **Problema:** Append de linhas clonadas seguido de delete de originais sem `SpreadsheetApp.flush()`. Se delete falhar parcialmente, dados ficam duplicados.

### M17. `_parseData` de gestao-os.js falha com ano de 2 dígitos
- **Onde:** `gestao-os.js:63-67`
- **Problema:** `new Date(25, 0, 15)` = ano 25 d.C., não 2025. Afeta ordenação de OS por data.

---

## BUGS BAIXOS

### B1. Validação de spinner assume placeholder inexistente
- **Onde:** `RDOValidator.kt:82-87`
- **Problema:** Rejeita `codigoTurmaPosition == 0` e `encarregadoPosition == 0`, mas os arrays de spinners em `RDOFragment.kt:140-160` começam diretamente com valores reais (sem "Selecione..." no índice 0). O primeiro item da lista fica impossível de selecionar.
- **Fix:** Inserir item "Selecione..." no índice 0 dos arrays, ou ajustar validação para `position < 0`.

### B2. Audit sheet headers nunca auto-criados
- **Onde:** `SheetsHeaderManager.kt:111-120`
- **Problema:** `sheetsToCheck` não inclui `SHEET_AUDIT`. Headers da aba AuditoriaSync dependem de criação manual.

---

## RESUMO POR COMPONENTE

| Componente | Críticos | Altos | Médios | Baixos | Total |
|------------|----------|-------|--------|--------|-------|
| **App Android (Sync/DB)** | 2 | 3 | 3 | 1 | 9 |
| **Dashboard JS (Cálculos)** | 2 | 2 | 6 | 0 | 10 |
| **Calendário TS** | 3 | 1 | 2 | 0 | 6 |
| **Calendário TP** | 1 | 1 | 0 | 0 | 2 |
| **Apps Script** | 2 | 2 | 3 | 0 | 7 |
| **Worker** | 0 | 0 | 1 | 0 | 1 |
| **Cross-System** | 0 | 1 | 2 | 1 | 4 |
| **TOTAL** | **10** | **10** | **17** | **2** | **38** |*

---

## PADRÕES SISTÊMICOS IDENTIFICADOS

### 1. Calendário TS é uma cópia degradada do TP
O calendário TS não acompanhou as melhorias do TP: faltam merge de HI, join por Número RDO, escape de HTML, META_DIARIA_TS, agregação de múltiplos RDOs por dia. **Precisa ser reescrito usando o TP como referência.**

### 2. Inconsistência de formato de datas
ISO ("2025-01-15") vs DD/MM/YYYY ("15/01/2025") causa problemas em pelo menos 5 módulos (calculations.js, gestao-os.js, DatabaseHelper.kt). **Normalização deveria ser feita na camada de dados (sheets-api.js), não em cada consumidor.**

### 3. Operação de UPDATE do Sheets não é atômica
Delete + re-insert sem transação aparece em vários pontos. Qualquer interrupção entre as duas operações causa perda de dados irrecuperável.

### 4. Número RDO como identificador é frágil
O `Número RDO` é usado como chave primária global mas é gerado localmente, embute o Número OS no prefixo (que pode mudar), e o dashboard normaliza OS a partir dele — criando um ciclo de dependências frágil entre C1, C4, C5.

### 5. Colunas hardcoded no App e no Apps Script
Referências hardcoded a posições de coluna (V ao invés de U, nome "Transportes" vs "TransporteSucatas") criam bugs silenciosos quando a estrutura do Sheets evolui.

---

## RECOMENDAÇÕES PRIORITÁRIAS

### Ação Imediata (Quick Wins)
1. Corrigir leitura da Data Criação para coluna **U** (`GoogleSheetsService.kt:184`)
2. Adicionar `META_DIARIA_TS: 8` ao config (`config.js` e `config.example.js`)
3. Trocar `'Transportes'` por `'TransporteSucatas'` no Apps Script (linha 417)
4. Deep-clone cache antes de filtrar em `main.js:323`

### Curto Prazo (1-2 semanas)
5. Reescrever calendário TS usando TP como base (merge HI, join por Número RDO, escapeHtml, diasUteis)
6. Bloquear todo o sync quando versão do Sheets > versão do app (não só o delete)
7. Normalizar datas na camada `sheets-api.js` para DD/MM/YYYY antes de entregar aos consumidores
8. Adicionar LockService a `atualizarOSCascata`

### Médio Prazo (1-2 meses)
9. Redesenhar geração de `Número RDO` com componente globalmente único (UUID parcial ou deviceId)
10. Implementar `atualizarOSCascata` com regeneração de `Número RDO` + cascata em todas as abas
11. Derivar posições de coluna a partir de headers (eliminar hardcode de A, B, U, V)
12. Adicionar limite de retentativas (max 10) para RDOs em ERROR

---

*Relatório gerado por análise estática do código-fonte e documentação. Não inclui validação contra a planilha real nem execução de testes automatizados.*
