# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CalculadoraHH** (Display name: "Controle de Campo") is an Android application designed for calculating work hours (HH - Homem-Hora) and managing RDO (Relatório Diário de Obras / Daily Work Reports) for railway maintenance operations at Engecom Engenharia. The app is built using Kotlin with MVVM architecture, ViewBinding, and Material Design 3.

The project also includes a **web dashboard** (`dashboard/`) hosted on **Cloudflare Workers** (workers.dev) for management reporting, synced via Google Sheets. Deploy automático via GitHub Actions em cada push para `master`.

### Key Features
- **Calculadora HH**: Calculate work hours based on 102 predefined railway service coefficients
- **RDO Management**: Create, store, and manage daily work reports with auto-generated RDO numbers
- **Histórico**: View and filter historical RDOs with calendar integration
- **Export**: Export RDO data to CSV/JSON formats via FileProvider
- **Database**: Local SQLite storage (v10) with Gson serialization, UNIQUE constraints, and performance indexes
- **Google Sheets Sync**: Automatic background sync every 6 hours via WorkManager with conflict-free offline support
- **Auto-Update System**: Check for updates, download, validate (MD5), and install APKs from GitHub Releases
- **Dashboard Web**: Management reporting with TMC calculations, calendars, productivity analysis, and OS management

## Development Commands

### Build & Run
```bash
# Build the project
./gradlew build

# Build debug APK
./gradlew assembleDebug

# Build release APK (with ProGuard enabled)
./gradlew assembleRelease

# Install and run on connected device/emulator
./gradlew installDebug

# Clean and rebuild
./gradlew clean build
```

### Testing
```bash
# Run unit tests
./gradlew test

# Run instrumented tests (requires device/emulator)
./gradlew connectedAndroidTest

# Run specific test class
./gradlew test --tests com.example.calculadorahh.ExampleUnitTest
```

### Code Quality
```bash
# Lint checks
./gradlew lint

# View lint report
./gradlew lintDebug
# Report: app/build/reports/lint-results-debug.html

# Kotlin compiler checks
./gradlew compileDebugKotlin
```

### Dashboard Scripts
```bash
# Sync servicos.json to dashboard (run after editing app/src/main/res/raw/servicos.json)
npm run sync-servicos

# Testes do dashboard (calculations.js, validarNumeroOS, feriados) — node:test, sem dependências
npm test

# Regenera dashboard/js/config.example.js a partir do config.js local (secrets → placeholders)
# Rodar sempre que a ESTRUTURA do config.js mudar (novas constantes/funções)
npm run gen-config-example
```

### Utility Scripts (scripts/)
- `scripts/importar_rdos.py` — Importa RDOs de mensagens WhatsApp/TXT para Sheets
- `scripts/cleanup_sheets.py` — Limpeza e normalização de RDOs no Sheets (headers, deletados, HI)
- `scripts/cleanup_op6.py` — Limpa coluna Operadores na aba HorasImprodutivas
- `scripts/read_sheets.py` — Lê dados do Sheets via JWT manual para diagnóstico
- `scripts/verify-sheets.js` — Verifica integridade dos dados no Sheets
- `scripts/fix-sheets-*.js` — Scripts de correção pontual de dados históricos

## Fluxo de Trabalho de Desenvolvimento

### Visão Geral do Pipeline de Deploy

```
Editar localmente
      │
      ▼
git push → master
      │
      ├─► GitHub Actions: deploy-pages  → GitHub Pages  (backup)
      └─► GitHub Actions: deploy-workers → Cloudflare Workers (produção ★)
```

O deploy é **automático** para qualquer push em `master` que toque `dashboard/**`, `src/**` ou `wrangler.jsonc`. Nenhuma ação manual necessária após o push.

---

### Cenário 1 — Melhoria no Dashboard

```
1. Editar arquivos em dashboard/js/ ou dashboard/index.html
2. Testar localmente:
     cd dashboard && python -m http.server 8000
     Abrir: http://localhost:8000?key=<SECRET_KEY>
3. Bump de versão (se aplicável):
     - dashboard/CLAUDE.md  → "Current Version": X.Y.Z+1
     - CLAUDE.md            → "versionName" do dashboard no Version History
4. git add <arquivos alterados>
   git commit -m "fix(dashboard): descrição"
   git push
5. GitHub Actions dispara automaticamente:
     deploy-pages  → atualiza GitHub Pages
     deploy-workers → atualiza workers.dev (produção) ✓
```

**Trigger do Actions:** qualquer arquivo em `dashboard/**`

---

### Cenário 2 — Melhoria no App Android

```
1. Editar arquivos Kotlin/XML/recursos
2. Testar no dispositivo:
     ./gradlew installDebug
3. Bump de versão:
     - app/build.gradle.kts → versionCode +1, versionName X.Y.Z+1
     - CLAUDE.md → Version Information + novo entry no Version History
4. git add <arquivos> && git commit -m "feat/fix(app): descrição" && git push
5. Gerar APK de release:
     ./gradlew assembleRelease
6. Criar GitHub Release com o APK
7. Atualizar aba Config no Google Sheets:
     versao_recomendada | <novo versionCode>
     hash_md5           | <MD5 do APK>
     tamanho_apk_mb     | <tamanho>
     url_download       | <URL do GitHub Release>
```

**Nota:** push de arquivos Android **não** dispara o deploy do dashboard (paths filter protege isso).

---

### Cenário 3 — Atualizar Serviços/Coeficientes

```
1. Editar APENAS: app/src/main/res/raw/servicos.json
2. Sincronizar para o dashboard:
     npm run sync-servicos
3. Commitar os 3 arquivos juntos:
     git add app/src/main/res/raw/servicos.json \
             dashboard/servicos.json \
             dashboard/js/servicos-data.js
     git commit -m "chore(servicos): descrição"
     git push
4. GitHub Actions dispara (dashboard/servicos.json foi alterado) → deploy automático
```

**⚠️ Nunca editar `dashboard/servicos.json` ou `dashboard/js/servicos-data.js` diretamente.**

---

### Cenário 4 — Atualizar o Worker (proxy Apps Script)

```
1. Editar src/worker.js ou wrangler.jsonc
2. Testar localmente (opcional):
     npx wrangler dev
3. git add src/worker.js wrangler.jsonc
   git commit -m "fix(worker): descrição"
   git push
4. GitHub Actions dispara (wrangler.jsonc ou src/** alterados) → deploy automático
```

---

### Configuração Inicial dos Secrets (única vez)

Para o deploy automático funcionar, o GitHub precisa de 3 secrets:

**Passo 1 — Obter o Cloudflare API Token:**
1. Acesse: https://dash.cloudflare.com/profile/api-tokens
2. Clique em **"Create Token"**
3. Use o template **"Edit Cloudflare Workers"**
4. Copie o token gerado

**Passo 2 — Obter o Cloudflare Account ID:**
1. Acesse: https://dash.cloudflare.com
2. Clique em **Workers & Pages** no menu lateral
3. O **Account ID** aparece no canto superior direito da página

**Passo 3 — Adicionar no GitHub:**
1. Acesse: https://github.com/daniloocunha/engecom-dashboard/settings/secrets/actions
2. **"New repository secret"** → Nome: `CLOUDFLARE_API_TOKEN` → Valor: (token do passo 1)
3. **"New repository secret"** → Nome: `CLOUDFLARE_ACCOUNT_ID` → Valor: (ID do passo 2)
4. **"New repository secret"** → Nome: `DASHBOARD_CONFIG_JS` → Valor: conteúdo completo do arquivo `dashboard/js/config.js` local

> **Por quê o `DASHBOARD_CONFIG_JS`?** O `config.js` é gitignored (contém API Key, SECRET_KEY e preços). O workflow recria o arquivo no servidor de CI a partir deste secret antes de cada deploy. Se alterar o `config.js` local (preços, turmas, credenciais), lembre de atualizar o secret também.

Após isso, qualquer `git push` com mudanças no dashboard dispara o deploy automaticamente.

---

## Architecture & Code Structure

### Android App — Package Structure

```
com.example.calculadorahh/
├── data/
│   ├── models/         # RDOData, RDODataCompleto, ServicoRDO, MaterialRDO,
│   │                   # HIItem, TransporteItem, UpdateConfig, SyncStatus
│   └── database/
│       ├── DatabaseHelper.kt           # SQLite v10 — Singleton com double-checked locking
│       └── DatabaseHelperExtensions.kt # Extensões de query
│
├── domain/
│   └── managers/
│       ├── BaseItemManager.kt          # Abstract base (Template Method pattern)
│       ├── ServicosManager.kt          # Serviços: seleção e cálculos HH
│       ├── MateriaisManager.kt         # Materiais com seleção de unidade
│       ├── HIManager.kt                # Horas Improdutivas com cálculos por categoria
│       ├── TransportesManager.kt       # Transportes com validação
│       ├── ModeloLoader.kt             # Carrega RDO como modelo para novo RDO
│       └── RDOValidator.kt             # Validação de formulário (lógica pura, sem UI)
│
├── services/
│   ├── GoogleSheetsService.kt          # Facade: orquestra os 4 helpers abaixo
│   ├── SheetsConstants.kt              # Nomes de abas, HEADERS_VERSION, listas de headers
│   ├── SheetsHeaderManager.kt          # Detecta e atualiza headers das abas
│   ├── SheetsLookupHelper.kt           # Lookup de linhas por Número RDO
│   ├── SheetsRelatedDataManager.kt     # buildRDORow(), insertRelatedData(), deleteRelatedData()
│   └── SheetsAuditService.kt           # Log de operações na aba AuditoriaSync
│
├── ui/
│   ├── activities/
│   │   ├── HomeActivity.kt             # Launcher: 3 opções de navegação
│   │   ├── MainActivity.kt             # Container ViewPager2 (Calculadora + RDO)
│   │   ├── HistoricoRDOActivity.kt     # Lista de RDOs com filtros
│   │   └── CalendarioRDOActivity.kt    # Calendário de RDOs por mês
│   ├── fragments/
│   │   ├── CalculadoraHHFragment.kt    # Cálculo de HH por serviços
│   │   └── RDOFragment.kt              # Formulário completo de RDO
│   ├── adapters/
│   │   ├── ViewPagerAdapter.kt
│   │   ├── ServicosAdapter.kt
│   │   ├── HIsAdapter.kt
│   │   └── HistoricoRDOAdapter.kt
│   └── components/
│       └── SearchableSpinner.kt        # Spinner com busca para listas longas
│
├── viewmodels/
│   └── CalculadoraHHViewModel.kt       # Estado compartilhado com LiveData
│
├── workers/
│   ├── RDOSyncWorker.kt               # WorkManager: sync a cada 6 horas
│   └── DataCleanupWorker.kt           # WorkManager: limpeza de órfãos semanal
│
├── utils/
│   ├── AppConstants.kt                 # Regex, ranges de validação, constantes
│   ├── AppLogger.kt                    # Logging estruturado com armazenamento em arquivo
│   ├── DateFormatter.kt                # Formatação de data/hora
│   ├── ErrorHandler.kt                 # Mensagens de erro amigáveis ao usuário
│   ├── IntentExtensions.kt             # Compatibilidade de Intent (Android < API 33)
│   ├── KmInputMask.kt                  # Máscara de entrada KM ferroviário "123+456"
│   ├── KmUtils.kt                      # Conversão "123+456" ↔ Double
│   ├── RDORelatorioUtil.kt             # Geração de relatório de RDO
│   ├── ServicosCache.kt                # Cache Singleton do servicos.json
│   ├── SyncHelper.kt                   # Orquestração de sincronização
│   ├── TimeInputMask.kt                # Máscara de entrada HH:MM
│   ├── TimeValidator.kt                # Validação e cálculos de horário (overnight support)
│   ├── UpdateChecker.kt                # Verifica versão disponível no Google Sheets Config
│   ├── UpdateDownloader.kt             # Download, validação MD5 e instalação de APK
│   └── ValidationHelper.kt             # Validações com suporte a TextInputLayout.error
│
└── CalculadoraHHApplication.kt         # Inicializa Material You + WorkManager
```

### Dashboard — File Structure

```
dashboard/
├── index.html                  # SPA principal (Bootstrap 5.3 + Chart.js 4.4)
├── servicos.json               # Cópia de app/src/main/res/raw/servicos.json (AUTO-GERADO)
├── css/
│   └── dashboard.css           # Estilos do dashboard
└── js/
    ├── config.js               # Secrets + constantes (GITIGNORED — ver config.example.js)
    ├── config.example.js       # Template público do config.js
    ├── main.js                 # Bootstrap da aplicação, event handlers globais
    ├── sheets-api.js           # Integração Google Sheets API v4 (cache 5 min, rate limit)
    ├── field-helper.js         # Normalização de campos (datas ISO, nomes de campos)
    ├── calculations.js         # Cálculos TMC/TP/TS com índices O(1) e merge de HI
    ├── visao-geral.js          # Visão Geral: KPIs, composição de horas, scorecard, perdas
    ├── calendario-tp.js        # Calendário interativo para turmas TP (com EditorRDO)
    ├── calendario-ts.js        # Calendário interativo para turmas TS (com EditorRDO)
    ├── editor-rdo.js           # EditorRDO: edição in-modal de RDO via Apps Script
    ├── gestao-os.js            # Gestão de Ordens de Serviço com upload de anexos
    ├── period-comparison.js    # Comparação entre períodos
    ├── charts.js               # Wrappers Chart.js com thresholds dinâmicos
    ├── filters.js              # Filtros globais (mês, ano, turma)
    ├── alerts-system.js        # Sistema de alertas com escapeHtml (anti-XSS)
    ├── safe-html.js            # Utilitários de sanitização HTML
    ├── auth.js                 # Autenticação (SECRET_KEY simples)
    ├── os-auditoria.js         # Auditoria de OS com divisão e correção de OS
    ├── data-quality.js         # Análise de qualidade dos dados (badge + painel)
    ├── export-engine.js        # Exportação avançada: CSV/XLSX/JSON/PDF (v2.3.0)
    ├── search-index.js         # Busca global com índice invertido e autocomplete (v2.3.0)
    ├── ranking-engine.js       # Ranking de performance por turma, score 0–100 (v2.3.0)
    ├── executive-summary.js    # Resumo executivo automático via templates (v2.3.0)
    └── servicos-data.js        # Constante JS com serviços (AUTO-GERADO, fallback CORS)
```

> **Arquivos removidos (descontinuados):** `css/minimal-view.css`, `js/view-manager.js` (View Minimalista), `js/analise-tmc.js` (Análise TMC), `js/export.js`, `js/export-helper.js` (Exportação sem UI — substituída por `export-engine.js` na v2.3.0).

### Key Architectural Components

#### 1. Application Class
- **CalculadoraHHApplication.kt**: Habilita Material You dynamic colors (Android 12+), inicializa WorkManager para sync periódico e limpeza semanal

#### 2. Navigation Flow
- **HomeActivity**: Launcher com três opções principais:
  - Calculadora HH → MainActivity tab 0
  - RDO → MainActivity tab 1
  - Histórico → HistoricoRDOActivity
- **MainActivity**: Container com ViewPager2 + TabLayout (2 fragmentos)
- **CalendarioRDOActivity**: Calendário acessível pelo Histórico

#### 3. ViewModel (Shared State)
- **CalculadoraHHViewModel**:
  - Carrega serviços de `res/raw/servicos.json` (~100 serviços ferroviários)
  - Calcula total de horas baseado nos coeficientes dos serviços
  - Rastreia itens HI com cálculos automáticos
  - Meta diária: 72.0 HH (`META_HORAS_DIARIAS`)
  - LiveData para atualizações reativas da UI

#### 4. Database Layer
- **DatabaseHelper** (v10):
  - Singleton com `@Volatile` double-checked locking — sempre usar `getInstance(context)`
  - Tabela principal: `rdo` com 31 colunas
  - Auto-geração de número RDO: formato `OS-DD.MM.YY-XXX` (ex: "998070-13.11.24-001")
  - UNIQUE constraint em `numero_rdo` com retry automático (backoff linear: 10ms × tentativa)
  - Gson para serialização de campos complexos (serviços, HI, transportes)
  - Thread-safe com métodos sincronizados
  - Indexes de performance em: `data`, `numero_os`, `sincronizado`, `numero_rdo`

#### 5. Data Models
- **RDOData**: Dados completos do RDO para escrita (19 campos incluindo `causaNaoServico`)
- **RDODataCompleto**: Versão extendida para leitura com campos calculados
- **ServicoRDO**: Serviço com descrição, quantidade, coeficiente, HH manual (opcional)
- **HIItem**: Horas Improdutivas com tipo, horários, operadores
- **TransporteItem**: Registro de transporte com descrição, quantidade de colaboradores, KM início/fim e horários
- **SyncStatus**: Enum para rastreamento de estado de sync (pending/success/error)

#### 6. Business Logic Managers (Template Method Pattern)
- **BaseItemManager\<T\>**: Classe base abstrata; métodos concretos: `getItens()`, `adicionarItem()`, `removerItem()`; abstratos: `mostrarDialogAdicionar()`, `adicionarView()`, etc.
- **ServicosManager**: Carrega serviços do JSON, gerencia seleção e cálculos HH
- **MateriaisManager**: Gerencia materiais com seleção de unidade (KG, M³, M, UN)
- **HIManager**: Horas Improdutivas com cálculo por categoria (Chuva ÷2, outros × 1)
- **TransportesManager**: Transportes com validação de KM e horários
- **RDOValidator**: Validação do formulário RDO — lógica pura sem dependências de UI Android. Retorna `RDOValidationResult` (Valid | Error | ConfirmacaoNecessaria)

#### 7. Google Sheets Integration (Facade Pattern)
`GoogleSheetsService.kt` (270 linhas) é uma facade que delega para 5 helpers:

| Arquivo | Responsabilidade |
|---------|-----------------|
| `SheetsConstants.kt` | Nomes de abas, `HEADERS_VERSION = 6`, listas de headers por aba |
| `SheetsHeaderManager.kt` | Detecta versão dos headers e atualiza abas desatualizadas |
| `SheetsLookupHelper.kt` | `findRowNumberByNumeroRDO()` — busca linha pelo Número RDO |
| `SheetsRelatedDataManager.kt` | `buildRDORow()`, `insertRelatedData()`, `deleteRelatedData()` |
| `SheetsAuditService.kt` | `logSyncAction()` — registra INSERT/UPDATE/DELETE na aba AuditoriaSync |

**Fluxo de sync:**
1. `syncRDO(rdo)` → `GoogleSheetsService`
2. `verificarSeRDOExiste(numeroRDO)` → `SheetsLookupHelper`
3. `insertRDOInSheet()` ou `updateRDOInSheet()` → `SheetsRelatedDataManager.buildRDORow()`
4. `insertRelatedData()` → insere nas abas Servicos, Materiais, HI, Transportes, Efetivo, Equipamentos
5. `logSyncAction()` → `SheetsAuditService`

**Identificador único**: `Número RDO` (formato `OS-DD.MM.YY-XXX`) — globalmente único entre dispositivos. O ID local do SQLite é enviado na coluna A mas não é usado para lookup.

#### 8. Google Sheets — Estrutura das Abas

| Aba | Colunas | Identificador de Linha |
|-----|---------|----------------------|
| `RDO` | 22 (A–V) | Número RDO (col B) |
| `Servicos` | 11 (A–K) | Número RDO (col A) |
| `Materiais` | 8 (A–H) | Número RDO (col A) |
| `HorasImprodutivas` | 10 (A–J) | Número RDO (col A) |
| `TransporteSucatas` | 11 (A–K) | Número RDO (col A) |
| `Efetivo` | 11 (A–K) | Número RDO (col A) |
| `Equipamentos` | 7 (A–G) | Número RDO (col A) |
| `AuditoriaSync` | 7 (A–G) | Timestamp (col A) |
| `Config` | 2 (A–B) | Chave (col A) |

**Headers versão atual (HEADERS_VERSION = 6):**
Aba RDO: ID | Número RDO | Data | Código Turma | Encarregado | Local | Número OS | Status OS | KM Início | KM Fim | Horário Início | Horário Fim | Clima | Tema DDS | Houve Serviço | Houve Transporte | Nome Colaboradores | Observações | Deletado | Data Sincronização | Data Criação | Versão App

> **Nota**: O campo `causaNaoServico` (RUMO/ENGECOM) existe no banco SQLite local e na UI do app mas **não é sincronizado** com o Google Sheets (removido como "redundante" na v6 dos headers). Dado disponível apenas localmente.

#### 9. Dashboard — Normalização de Campos (App ↔ Dashboard)

`sheets-api.js` usa `normalizarNomeCampo()` para converter headers do Sheets para camelCase. Cada objeto retornado contém **ambas** as chaves: original e normalizada. Exemplos:

| Header no Sheets (Android) | Chave normalizada (Dashboard) |
|----------------------------|-------------------------------|
| `Número RDO` | `numeroRDO` |
| `Código Turma` | `codigoTurma` |
| `Horário Início` | `horarioInicio` |
| `KM Início` | `kmInicio` |
| `É Customizado?` | `eCustomizado` |
| `HH Manual` | `hhManual` |
| `Hora Início` | `horaInicio` |
| `Encarregado Qtd` | `encarregadoQtd` |
| `Técnico Segurança` | `tecnicoSeguranca` |
| `Operador EGP` | `operadorEgp` ⚠️ (não `operadorEGP`) |

> ⚠️ **Quirk:** `"Operador EGP"` normaliza para `"operadorEgp"` (não `"operadorEGP"`), porque `slice(1).toLowerCase()` converte `"GP"` para `"gp"`. Todos os acessos cobrem essa variante com triple fallback: `ef['Operador EGP'] || ef.operadorEGP || ef.operadorEgp`.

**Campos calculados pelo dashboard (não existem como coluna no Sheets):**
- `coeficiente` em Servicos — adicionado por `enriquecerServicosComCoeficientes()` a partir de `servicos.json`
- `hhImprodutivas` em HorasImprodutivas — calculado por `calcularHHImprodutivas()` com regras de Chuva ÷ 2 e Trem < 20min = 0
- `total` em Efetivo — calculado por `obterEfetivoDia()` somando todos os campos de função

**Abas lidas pelo dashboard:** apenas `RDO`, `Servicos`, `HorasImprodutivas`, `Efetivo`. As abas `Materiais`, `TransporteSucatas` e `Equipamentos` são escritas pelo app mas não consumidas pelo dashboard.

#### 10. Dashboard — Arquitetura de Cálculos

**`calculations.js`** — Classe `CalculadoraMedicao`:
- Índices O(1) em Maps: `servicosPorRDO`, `hiPorRDO`, `efetivosPorRDO`, `rdosPorTurma`
- `_mergeHIIntervals()`: merge de sobreposições de HI com sweep line (evita dupla-contagem)
- Regras de HI: Chuva = HH ÷ 2; Trem < 20 min = descartado; outros = HH × 1
- Quando múltiplos HIs se sobrepõem: `Math.max()` dos operadores (uma turma = um grupo)
- Suporta datas ISO 8601 via `FieldHelper.parseData()`

**`visao-geral.js`** — Seções (v2.0.0):
1. Destaques do período (insights)
2. KPIs por tipo (TP/TS)
3. Composição de horas (PDM + Correlato + Perdas NC + Perdas Controláveis + Gap)
4. Scorecard comparativo de turmas
5. Gráfico de Produtividade por turma
6. Evolução diária com meta
7. Classificação PDM/Correlato + Top Serviços (com drill-down)
8. Análise de Perdas (Controláveis vs NC)
9. HI "Outros" — sugestões de reclassificação
10. Qualidade dos dados

### Key Business Logic

#### HH Calculation Formula
```kotlin
horas = quantidade × coeficiente
totalHoras = sum(horas de todos os serviços)
```

#### HI Calculation Formula
```kotlin
diferençaHoras = horaFim - horaInicio  // suporta overnight
totalHoras = diferençaHoras × colaboradores

if (categoria == "Chuva") {
    totalHoras /= 2  // Chuva conta como metade
}
// Outras categorias: horas integrais
```

#### Metas Diárias
```
TP: 12 operadores × 6h = 72 HH/dia
TS:  1 soldador   × 6h =  6 HH/dia
```
Sempre usar `METAS.META_DIARIA_TP` e `METAS.META_DIARIA_TS` de `config.js`. Nunca hardcodar.

#### Time Difference Calculation
Suporta períodos overnight (ex: 23:00 às 02:00):
```kotlin
if (totalHorasFim >= totalHorasInicio) {
    diferença = totalHorasFim - totalHorasInicio
} else {
    diferença = (24 - totalHorasInicio) + totalHorasFim
}
```

## Important Technical Details

### View Binding
- **Habilitado**: `buildFeatures { viewBinding = true }`
- Todas as activities e fragments usam ViewBinding
- Padrão: `ActivityMainBinding.inflate(layoutInflater)`
- Nunca usar `findViewById()` em código novo

### Services Management (Single Source of Truth)

**⚠️ IMPORTANTE: Um único arquivo de origem**

Todos os serviços e coeficientes são gerenciados em **UM único arquivo**:
- **Fonte**: `app/src/main/res/raw/servicos.json` (✅ EDITAR APENAS ESTE)
- **Gerado**: `dashboard/servicos.json` (❌ NÃO EDITAR — auto-gerado)
- **Gerado**: `dashboard/js/servicos-data.js` (❌ NÃO EDITAR — auto-gerado)

**Workflow de sincronização:**
1. Editar: `app/src/main/res/raw/servicos.json`
2. Executar: `npm run sync-servicos`
3. Commitar os 3 arquivos juntos

**Ver `GERENCIAR_SERVICOS.md` para instruções detalhadas.**

### DatabaseHelper — Notas de Arquitetura
- `obterRDOsPaginados(offset, limit)` e `contarRDOs()` vivem em `DatabaseHelperExtensions.kt` (versões mais completas, com ordenação por data sortável)
- Os métodos de paginação/contagem no arquivo principal foram removidos (duplicatas) na Fase 1
- `inserirRDO()` usa backoff **linear** (10ms × tentativa) — NÃO exponencial
- `marcarRDOComoPendente()` sempre escreve `""` em `mensagem_erro_sync` (nunca NULL)
- Extensões usam strings literais para nomes de colunas (acesso a `private const val` não é possível de fora da classe)

### Database Migrations
- Version 1: Schema inicial com campos básicos do RDO
- Version 2: Campos de horário, tema DDS, efetivo, equipamentos, itens HI
- Version 3: `numero_rdo` com lógica de auto-geração
- Version 4: Suporte a transporte (`houve_transporte`, JSON de transportes)
- Version 5: Campo `nome_colaboradores`
- Version 6: Flag `sincronizado` para rastreamento de sync
- Version 7: Indexes de performance (data, numero_os, sincronizado, numero_rdo)
- Version 8: UNIQUE index em `numero_rdo` com retry automático
- Version 9: Campos de auditoria de sync (`sync_status`, `mensagem_erro_sync`, `tentativas_sync`, `ultima_tentativa_sync`)
- Version 10: Coluna `causa_nao_servico TEXT DEFAULT ''` (armazenada localmente, não sincronizada com Sheets)

### ProGuard Configuration
- **Habilitado** para release builds
- Usa `proguard-android-optimize.txt`
- Regras customizadas em `app/proguard-rules.pro`:
  - Mantém classes de modelo Gson
  - Preserva classes da API Google Sheets
  - Mantém classes do WorkManager
- Tamanho do APK release: ~3.2 MB

### Export Functionality
- **Formatos**: CSV e JSON
- **Storage**: `context.getExternalFilesDir(null)` (storage específico do app, sem permissão)
- **Compartilhamento**: FileProvider com `Intent.ACTION_SEND`
- **Authority**: `${applicationId}.fileprovider`

### Background Tasks
- **RDOSyncWorker**: Sync de RDOs pendentes a cada 6 horas (requer rede + bateria não baixa)
- **DataCleanupWorker**: Limpeza de dados órfãos no Sheets a cada 7 dias
- WorkManager gerencia retries com backoff exponencial automático

### Permissions
- **INTERNET**: Sync Google Sheets e atualizações
- **ACCESS_NETWORK_STATE**: Verificar conectividade antes do sync
- **POST_NOTIFICATIONS**: Progresso de sync e update (Android 13+)
- **REQUEST_INSTALL_PACKAGES**: Instalar APK de atualização
- **WRITE_EXTERNAL_STORAGE**: Exportação legada (API < 29)

### SDK Configuration
- **minSdk**: 24 (Android 7.0 Nougat)
- **targetSdk**: 34 (Android 14)
- **compileSdk**: 35 (Android 15) — requerido pelo WorkManager 2.11.0
- **Java Version**: JVM Target 17 (requerido pelo Gradle 8.13.1)
- **Kotlin**: 2.0.21
- **core-ktx**: máx 1.15.0 (1.17.0 requer compileSdk 36)

### Key Dependencies
- **AndroidX**: Core-KTX 1.15.0, Lifecycle, ViewPager2, Fragment-KTX, CardView, ConstraintLayout, WorkManager 2.11.0
- **Material Design**: Material Components 1.13.0 com Material 3 theming
- **Coroutines**: kotlinx-coroutines 1.7.3
- **JSON**: Gson 2.13.2
- **Google Services**: Google Sheets API v4, Google Auth Library OAuth2
- **Testing**: JUnit, Espresso

### Auto-Update System
- `UpdateChecker.kt`: Lê aba `Config` do Sheets (`versao_minima`, `versao_recomendada`, `url_download`, `hash_md5`)
- `UpdateDownloader.kt`: Download, validação MD5 e instalação do APK
- Verificação disparada: ao abrir o app e a cada 6 horas via WorkManager
- APKs distribuídos via **GitHub Releases** (não mais Azure Blob)
- `GOOGLE_SHEETS_ID` externalizado via `BuildConfig` (definido em `build.gradle.kts`)

## Development Conventions

### Package Organization
- Modelos em `data/models/`
- Lógica de negócio em `domain/managers/` (estender `BaseItemManager` quando aplicável)
- Componentes de UI em `ui/`
- Tarefas em background em `workers/`
- Funções utilitárias em `utils/`

### Data Persistence
- Sempre usar `DatabaseHelper.getInstance(context)` — nunca chamar o construtor diretamente
- Usar Gson para serializar objetos complexos no banco
- Usar transações para operações relacionadas
- **NUNCA renomear campos de `RDOData`/`RDODataCompleto`** — Gson usa os nomes de campo como chaves JSON no SQLite; renomear quebra a desserialização de registros existentes

### UI Development
- Activities são containers mínimos (roteamento, setup)
- Lógica de negócio fica nos ViewModels ou managers de domínio
- LiveData para atualizações reativas da UI (observar em `onViewCreated` para fragments)
- Material Design 3 com suporte a cores dinâmicas
- Suporte a temas claro e escuro (`values/` e `values-night/`)
- Strings voltadas ao usuário em `strings.xml` (português)

### Time Input
- Usar **TimeValidator** para validação (fonte única de verdade)
- Usar **TimeInputMask** para formatação de entrada
- Formato de hora: "HH:MM" (24h, ex: "14:30")
- Formato de data: "dd/MM/yyyy" (ex: "13/11/2024")
- Suporte correto a períodos overnight (23:00 → 02:00)

### KM Ferroviário
- Formato: "123+456" = 123 km + 456 metros = 123.456
- Usar **KmUtils** para conversão (fonte única de verdade)
- Usar **KmInputMask** para entrada no formulário
- Regex de validação em `AppConstants`

### RDO Numbers
- Auto-gerados por `DatabaseHelper.gerarNumeroRDO(numeroOS, data)`
- Formato: `OS-DD.MM.YY-XXX` (ex: "998070-13.11.24-001")
- Contador sequencial por combinação OS + data
- UNIQUE constraint com retry automático (backoff linear: 10ms × tentativa)
- Auto-atualização ao editar data ou OS do RDO

### Coroutines
- `viewModelScope` em ViewModels
- `lifecycleScope` em Activities/Fragments
- `Dispatchers.Main`: atualizações de UI
- `Dispatchers.IO`: banco, rede, arquivos
- `Dispatchers.Default`: cálculos CPU-intensivos

## Common Development Scenarios

### Adding a New Service Type
1. Editar **`app/src/main/res/raw/servicos.json`** (fonte única de verdade)
2. Adicionar: `{"descricao": "Nome do Serviço", "coeficiente": X.XX}`
3. Executar: `npm run sync-servicos`
4. Commitar os 3 arquivos: `servicos.json`, `dashboard/servicos.json`, `dashboard/js/servicos-data.js`

### Adding a New RDO Field
1. Atualizar `RDOData` em `data/models/RDOData.kt`
2. Incrementar `DATABASE_VERSION` em `DatabaseHelper.kt`
3. Adicionar coluna em `onUpgrade()` com `ALTER TABLE`
4. Atualizar `inserirRDO()` e `atualizarRDO()` com o novo campo
5. Atualizar `extrairRDODoCursor()` para ler o novo campo
6. Atualizar UI (layout XML + fragment)
7. Se sincronizar com Sheets: atualizar `HEADERS_RDO` em `SheetsConstants.kt`, `buildRDORow()` em `SheetsRelatedDataManager.kt`, e incrementar `HEADERS_VERSION`

### Updating Google Sheets Integration
- Headers: editar `SheetsConstants.kt` (incrementar `HEADERS_VERSION`)
- Row building: editar `SheetsRelatedDataManager.buildRDORow()`
- Lookup: editar `SheetsLookupHelper.kt`
- Auditoria: editar `SheetsAuditService.kt`
- Orchestração: editar `GoogleSheetsService.kt` apenas se o fluxo principal mudar

## Version Information
- **versionCode**: 24
- **versionName**: "5.1.7"
- **AGP Version**: 8.13.1
- **Kotlin Version**: 2.0.21
- **Gradle Version**: 8.13 (via wrapper)
- **Database Version**: 10
- **Sheets HEADERS_VERSION**: 6
- **Dashboard Version**: 2.4.0

## Release Information

### APK Signing & Distribution

**Keystore Information:**
- **Location**: `app/calculadorahh-release.keystore` (gitignored)
- **Alias**: `controledecampo`
- **Certificate**: Engecom Engenharia
- **Valid until**: March 31, 2053
- **Algorithm**: SHA256withRSA (2048-bit RSA key)
- **IMPORTANTE**: Sempre usar este keystore para todos os releases futuros

**Distribuição:**
- APKs via **GitHub Releases** (não mais incluídos no repositório)
- APKs são gitignored: `app/release/*.apk`
- Credenciais de serviço Google são gitignored: `rdo-engecom-*.json`

**Google Sheets Config (aba Config):**
```
versao_minima          | <versionCode mínimo aceitável>
versao_recomendada     | <versionCode atual>
hash_md5               | <MD5 do APK release>
tamanho_apk_mb         | <tamanho em MB>
url_download           | <URL do GitHub Release>
forcar_update          | NAO (ou SIM para forçar)
mensagem_aviso         | <mensagem mostrada se versão desatualizada>
mensagem_bloqueio      | <mensagem se versão abaixo do mínimo>
```

> **IMPORTANTE**: Após gerar o APK release, atualizar `hash_md5`, `tamanho_apk_mb`, `versao_recomendada` e `url_download` na aba Config. O `versao_minima` usa `versionCode` (número inteiro), não `versionName`.

## Version History

### Version 5.1.7 (versionCode 24) - 2026-06-09
**Permissão de notificações + hash SHA-256**

- **Fix**: `POST_NOTIFICATIONS` agora é solicitada em runtime na `HomeActivity` (Android 13+).
  Antes a permissão só era declarada no manifest — notificações de sync e de **atualização
  obrigatória** falhavam silenciosamente até o usuário habilitar manualmente nas configurações
- **Melhoria**: validação de integridade do APK aceita SHA-256 (hash de 64 caracteres na chave
  `hash_md5` da aba Config) com retrocompatibilidade MD5 (32 caracteres). Para usar:
  `Get-FileHash app-release.apk -Algorithm SHA256` e colar o hash na aba Config

---

### Dashboard 2.4.0 — 2026-06-09
**Correções de varredura geral + feriados extras + testes automatizados**

**Correções:**
- `carregarOSMedidas()`: O.S combinadas ("1017755/1018836") agora registram cada parte no Set
- Fallback de operadores em HI usa composição padrão da turma (`operadoresPadraoTurma()`:
  TP=12, TS=5, TMC=6) em vez de 12 fixo — corrigido em `calculations.js`, `sheets-api.js`
  e `visao-geral.js`
- Heatmap removido (inalcançável desde a remoção do filtro de turma na v2.2)

**Novidades:**
- Feriados extras via chave `feriados_extras` na aba Config do Sheets (afeta dias úteis/metas)
- Testes: `npm test` → `tests/calculations.test.js` (16 testes, node:test, sem dependências)
- `npm run gen-config-example` → regenera `config.example.js` sem secrets (corrige drift
  que quebrava o template para turmas TS)

**Limpeza de código morto:** `renderizarHeatmap`, `renderizarTabelaTMCs`,
`popularSelectTurmas`, `extrairTurmasUnicas`, favoritos de filtros, `filtrarTurmasPorTipo`,
`obterFiltros`, `carregarAbaSemCache`, referência a `filtroAnoMinimal`

**Arquivos alterados:** `dashboard/index.html`, `dashboard/js/{main,filters,sheets-api,calculations,visao-geral,field-helper}.js`, `dashboard/js/config.example.js`, `tests/calculations.test.js`, `scripts/gen-config-example.js`, `package.json`

---

### Dashboard 2.3.1 — 2026-06-08
**Bug fixes pós-deploy v2.3.0**

**Bug #1 — Navbar: busca invisível e botões ocultos:**
- Input de busca usava `bg-white bg-opacity-10` (fundo 10% branco = quase transparente sobre azul)
- Corrigido para `bg-white text-dark` com estilo pill — totalmente visível
- `flex:1` no wrapper empurrava botões para fora da tela → trocado por `flex:0 1 260px`
- Busca + botões agrupados em `div.d-flex.ms-auto` para layout correto e sempre visível

**Bug #2 — Busca global sem resposta:**
- `searchIndex.inicializarUI()` era chamada APÓS `renderizarDashboard()` — se qualquer erro
  ocorresse no rendering (Ranking ou Resumo Executivo), os event listeners nunca eram registrados
- Corrigido: `inicializarUI()` movida para ANTES de `renderizarDashboard()`
- Passos 12 (Ranking) e 13 (Resumo Executivo) envolvidos em `try-catch` individuais

**Bug #3 — `TypeError: window._vgNavDia is not a function`:**
- `window._vgNavDia` estava definida dentro de `_renderizarQualidadeDados()`, que tem
  `if (!total) return` — quando não há problemas de qualidade, a função nunca era atribuída
- Corrigida: movida para `renderizar()` — agora sempre definida a cada ciclo de render,
  independente do estado de qualidade dos dados

**Arquivos alterados:** `dashboard/index.html`, `dashboard/css/dashboard.css`,
`dashboard/js/main.js`, `dashboard/js/visao-geral.js`

---

### Dashboard 2.3.0 — 2026-06-08
**Cinco novas funcionalidades completas**

**Exportação Avançada (`export-engine.js`):**
- CSV com BOM + separador `;` (Excel BR), XLSX multi-abas via SheetJS, JSON estruturado, PDF via impressão HTML
- 3 perfis: Resumo Executivo, Operacional (RDOs+Serviços+HI+Turmas), Dados Brutos
- Botão "Exportar" na navbar abre modal com seleção de formato e perfil
- Exporta somente o período do filtro atual

**Busca Global Inteligente (`search-index.js`):**
- Índice invertido em memória: indexa RDOs, Serviços e HI
- Normalização: sem acento, lowercase; sinônimos: os/o.s, rdo/registro, hh/hora-homem, hi/improdutiva
- Ranking ponderado por campo (numeroRDO peso 10, numeroOS peso 8, descrição peso 6)
- Debounce 200ms, autocomplete agrupado por categoria (📄 RDOs, 🔧 Serviços, ⏸ HI)
- Clicar navega ao dia no calendário TP ou TS; navegação por teclado (↑↓ Enter Esc)
- Barra de busca na navbar, oculta em xs (< 576px)

**Ranking de Performance (`ranking-engine.js`):**
- Score 0–100 ponderado: Produtividade (40%) + Assiduidade (30%) + Eficiência HI (20%) + Completude RDO (10%)
- Medalhas 🥇🥈🥉; badge semáforo: Excelente / Bom / Regular / Crítico
- Botão "Detalhe" expande decomposição por componente com progress bars
- Toggle TP/TS; renderizado na Visão Geral após análise TP/TS

**Resumo Executivo Automático (`executive-summary.js`):**
- Motor determinístico via templates — sem IA, sem alucinação
- 5 seções: Visão Geral, Destaques Positivos, Pontos de Atenção, Performance por Turma, Recomendações
- Thresholds: assiduidade < 60%/70%, produtividade < 70%/80%, HI > 20%/25%
- Botão "Copiar" (clipboard) e ".txt" com BOM para download
- Suporte a mini-markdown **negrito** → <strong>

**Mobile Forte (CSS responsivo):**
- KPI cards: grade 2x2 no mobile (col-6 col-md-3)
- Filtros: card colapsável com toggle em mobile (Bootstrap collapse)
- Busca global oculta em xs, reexibe em tablets (≥ 576px)
- Abas com scroll horizontal, sem quebra de linha
- Tabelas, calendários e gráficos com tamanho adaptado
- Áreas de toque mínimo 38px em dispositivos touch

**Novos arquivos:**
`dashboard/js/export-engine.js`, `dashboard/js/search-index.js`,
`dashboard/js/ranking-engine.js`, `dashboard/js/executive-summary.js`

---

### Dashboard 2.2.0 — 2026-05-31
**Correções e melhorias de UX**

**Notas de dias sem RDO → Google Sheets:**
- "Nota Local do Dia" (localStorage, privada) removida dos modais TP e TS
- Dias cinza (sem RDO) agora permitem anotações compartilhadas (Feriado, Folga, etc.)
- Notas salvas no Sheets via Apps Script (`salvarNotaDia` / `obterNotasDia` — aba "Notas")
- Visível em todos os dispositivos/navegadores; requer atualização manual do Apps Script (código em `dashboard/CLAUDE.md`)
- Fallback silencioso: se Apps Script ainda não atualizado, carrega sem notas

**Bug fix — RDO duplicado afeta múltiplos registros:**
- `obterDadosDia()` (TP e TS) agora deduplica por `Número RDO` antes de processar
- Impede que `renomearRDO` e `deletarRDO` afetem dois registros com o mesmo número

**Aba TMC removida:**
- Aba "TMCs (Manutenção)" removida da navegação e do HTML
- TMC removido do filtro de tipo
- Código de cálculo TMC preservado em `calculations.js` (sem UI)

**Comparação de Períodos movida para o final:**
- Card de Comparação de Períodos agora aparece após os painéis TP/TS na aba Visão Geral

**Melhorias visuais:**
- Linha de meta (vermelha tracejada) nos gráficos de Composição de Horas e Produtividade/dia
- Tabela OS no offcanvas de turma: max-height 240→420 px, fonte maior
- Hover lilás em dias cinza; dias com nota ficam com fundo lilás claro

---

### Dashboard 2.1.0 — 2026-05-31
**Edição In-Modal de RDOs + Limpeza de Código Morto**

**Edição de RDOs diretamente pelo Dashboard (editor-rdo.js):**
- `EditorRDO` — classe singleton que gerencia edição in-modal sem sair do calendário
- Modo de edição ativo/inativo por botão "Editar" no rodapé de cada modal
- Cabeçalho da RDO editável (OS, Local, KM Início/Fim, Hora Início/Fim)
- Quando O.S muda, renomeia o Número RDO em cascata em **todas** as abas do Sheets via `renomearRDO`
- Serviços: editar (spinner com ~104 serviços + coeficiente), excluir, adicionar
- Horas Improdutivas: editar tipo/horários, excluir, adicionar
- Observações da RDO: editar e salvar no Sheets
- **Nota Local do Dia**: anotação privada por dia/turma, salva no `localStorage`, não vai para o Sheets
- Excluir RDO (marca `Deletado = "Sim"` — não apaga fisicamente)
- Dividir O.S: divide um RDO em dois, movendo serviços e HI selecionados para o novo RDO

**Multi-O.S no mesmo dia (TP):**
- Cada O.S exibe formulário de edição inline independente (antes só tinha botão excluir)
- Formulários "Adicionar Serviço" e "Adicionar HI" exibem seletor "O.S destino" quando há múltiplas OS

**Spinner de serviços:**
- Seleção por `<select>` populado com `SERVICOS_BASE` (todos os ~104 serviços)
- Preview de HH calculado em tempo real ao mudar serviço ou quantidade

**Ordenação de HI por duração:**
- Coluna "Dur." adicionada na tabela de HI dos calendários TP e TS
- Botões ▲▼ ordenam por duração; segundo clique restaura ordem original
- Mesmos botões na tabela de Apontamentos da Visão Geral (ordena por Duração e HH)

**Cabeçalho do calendário TP/TS reorganizado:**
- TP: 2 linhas com 6 métricas — Dias Trabalhados, Média Op, Nº O.S / HH Produtivas, HH Improdutivas, HH Total
- TS: mesmo padrão com HH Produtivas (HH Soldador), Dias Trabalhados, SLA%
- `calcularEstatisticasTurma` agora retorna `diasTrabalhados` e `hhProdutivas`

**Navegação Qualidade dos Dados → Calendário:**
- Clicar no Número RDO em "Qualidade dos Dados" navega automaticamente ao dia no calendário TP/TS

**Apontamentos HI (Visão Geral):**
- Modal ampliado de `modal-lg` para `modal-xl`
- Coluna Turma adicionada (badge cinza) entre Data e Número RDO
- Clicar em qualquer linha navega ao dia no calendário correspondente

**Offcanvas de Serviços (Visão Geral):**
- Largura padrão aumentada de 760 px para 1000 px

**Limpeza de código morto:**
- Removidos: `css/minimal-view.css`, `js/view-manager.js` (View Minimalista descontinuada)
- Removidos: `js/analise-tmc.js` (Análise TMC descontinuada)
- Removidos: `js/export.js`, `js/export-helper.js` (sem UI nem chamadores)
- `index.html`: removidos bloco minimalView, toggle Clássico/Minimalista, botão flutuante

**Bug fixes (relatório de revisão externa):**
- Loading overlay não trava mais em erros de `aplicarFiltros()` / `recarregar()` (faltava `finally`)
- Botão "Aplicar Filtros" volta ao azul após aplicação bem-sucedida (`resetarBotao()`)
- `charts.js`: canvas não é mais destruído em estado vazio — `_restaurarCanvas()` preserva o elemento
- Rodapé atualizado de `v1.0.0` para `v2.0.1`

**Apps Script (proxy de escrita):**
- `renomearRDO`: renomeia Número RDO e Número OS em cascata nas 7 abas do Sheets
- `dividirOS`: divide um RDO em dois, duplica Efetivo, move Serviços e HI para o novo RDO
- `atualizarCampoRDO`: atualiza campos do cabeçalho (Local, OS, KM, Horário, Observações)
- `atualizarServico`, `adicionarServico`, `excluirServico`: CRUD de serviços
- `atualizarHI`, `adicionarHI`, `excluirHI`: CRUD de Horas Improdutivas
- `deletarRDO`: marca RDO como deletado
- Bug fix: roteamento `renomearRDO` usava `acao` não definido (corrigido para `dados.acao`)
- Bug fix: `dividirOS` recebia argumentos separados mas esperava objeto (corrigido para `dividirOS(dados)`)
- Bug fix: `renomearRDO` e `dividirOS` usavam `openById(SPREADSHEET_ID)` indefinido (corrigido para `getActiveSpreadsheet()`)
- Removidas 5 funções mortas: `_dividirOSInterno`, `_moverLinhasParaNovoRDO`, `_proximoSequencial`, `_escreverIgnorandoValidacao`, `_adicionarOSNaValidacao`

---

### Version 5.1.6 (versionCode 23) - 2026-05-27
**Programa de Qualidade — Bug Fixes & Limpeza de Código**

**App Android:**
- Fix: `DatabaseHelper.marcarRDOComoPendente()` — `putNull` substituído por `put("", "")` (evita NULL em coluna DEFAULT '')
- Fix: `TransportesManager` — dialog de edição exibia "Adicionar" em vez de "Editar"
- Refactor: removido dead code em `HIManager` (imports mortos), `ValidationHelper` (3 funções nunca usadas), `AppConstants` (2 constantes órfãs), `DatabaseHelper` (2 métodos duplicados)
- Refactor: `DataCleanupWorker` — constantes do companion object unificadas com `AppConstants`

**Dashboard 2.0.1:**
- Fix: `visao-geral.js` — `TypeError` ao trocar sub-abas TP/TS (chamada a método nunca implementado removida)
- Fix: `visao-geral.js` — label do scorecard "% Meta" corrigido para incluir HH Improdutivo no numerador
- Fix: `sheets-api.js` — fallback morto `hi.data` substituído por `hi.dataRDO` (campo real normalizado)
- Refactor: variável morta `hhTotal` removida de `visao-geral.js`

**Documentação:**
- CLAUDE.md: 3 inacurácias corrigidas (backoff linear vs exponencial em 2 locais, TransporteItem com campos reais)
- CLAUDE.md: seção 9 adicionada — tabela de normalização App ↔ Dashboard com quirk `operadorEgp`

---

### Version 5.1.5 (versionCode 22) - 2026-04-06
**Dashboard v2.0.0 + Correções de App**

**Dashboard:**
- Remodelação completa da aba Visão Geral (reescrita do zero)
- KPIs dinâmicos por tipo TP/TS com metas corretas (72/6 HH/dia)
- Gráfico de Composição de Horas (PDM + Correlato + Perdas NC/C + Gap)
- Scorecard comparativo de turmas com semáforo
- Gráfico de Produtividade por turma (HH Total / HH/dia / HH/RDO)
- Análise de Perdas (Controláveis vs Não Controláveis)
- Top Serviços com drill-down por clique
- Qualidade dos Dados com badges clicáveis
- Painel de turma redimensionável pelo usuário

**App:**
- Fix: remoção de toasts de diagnóstico
- Fix: download de APK via GitHub Releases (não mais Azure CDN)

---

### Version 5.1.4 (versionCode 21)
- Fix: nova chave de serviço Google
- Fix: correção no diagnóstico de atualização

---

### Version 5.1.1 (versionCode 18)
- Fix: atualização da lista de encarregados

---

### Version 5.1.0 (versionCode 17)
- Fix: verificação de update agora ocorre sempre que o app abre (não apenas via WorkManager)
- Security: APKs removidos do repositório; distribuição via GitHub Releases

---

### Version 5.0.0 (versionCode 16)
- Melhorias visuais e de UX
- Remoção de dependências Compose (projeto usa XML + ViewBinding)
- Limpeza do Gradle (dependências duplicadas removidas, Google APIs centralizadas)
- Localization pt-BR completa

---

### Version 3.0.0 (versionCode 12) - 2026-02-27
**Bug Fixes & Correções Críticas**

1. **[CRÍTICO] RDOs deletados incluídos no faturamento**:
   - `filtrarRDOsPorTurma()` agora exclui RDOs com `Deletado = "Sim"`
   - `getTurmasPorTipo()` e KPIs também corrigidos
   - **Arquivo**: `dashboard/js/calculations.js`

2. **[CRÍTICO] `causaNaoServico` — histórico**:
   - v3.0.0 (HEADERS_VERSION=5): campo adicionado à aba RDO (coluna P)
   - Posteriormente revertido (HEADERS_VERSION=6): removido como "redundante"
   - Estado atual: campo armazenado no SQLite local, **não sincronizado com Sheets**

3. **[ALTO] Efetivo por chave OS+data → por Número RDO**:
   - Corrigido para usar índice O(1) com chave `numeroRDO`
   - **Arquivo**: `dashboard/js/calculations.js`

4. **[ALTO] Lógica de HI duplicada**:
   - Extraída para `_mergeHIIntervals()` — fonte única de verdade
   - **Arquivo**: `dashboard/js/calculations.js`

5. **[MÉDIO] Suporte a data ISO 8601** via `_normalizarData()`

**Database Migration:** Versão 10 — coluna `causa_nao_servico`

---

### Version 2.4.0 (versionCode 11) - 2025-12-05
- Sistema completo de auditoria (aba `AuditoriaSync`)
- Proteção por versão de app (apps antigos não deletam dados de versões novas)
- Agregação de erros de sync (mostra quais abas falharam)
- `DataCleanupWorker`: limpeza semanal de dados órfãos no Sheets

---

### Version 2.3.0 (versionCode 10) - 2025-11-27
**Fix crítico: overwrite entre dispositivos**
- Identificador de sync alterado de ID local → Número RDO (globalmente único)
- `findRowNumberByNumeroRDO()` substitui `findRowNumberById()`

---

### Version 2.1.0 (versionCode 8) - 2024-11-21
**Fix crítico: sync silencioso**
- Exceções em `insertRelatedData()` agora propagam corretamente
- RDOs com falha parcial permanecem pendentes (não marcados como sincronizados)

---

### Version 2.0.0 (versionCode 7) - 2024-11-19
- Fix crítico: memory leak no SyncHelper (variável static Context)
- Headers do Sheets centralizados em `SheetsConstants.kt`
- compileSdk atualizado para 35 (WorkManager 2.11.0)

---

### Version 1.5.0 (versionCode 6) - 2024-11-13
- Fix crítico: deleção por OS+Data (não mais apenas OS)
- Fix crítico: edição de RDO não duplicava mais no Sheets
- Novo certificado de assinatura (válido até 2053)

---

## Code Review Progress (Programa de Qualidade)

| Fase | Escopo | Status |
|------|--------|--------|
| Fase 0 | Fundação: CLAUDE.md, .gitignore, memória | ✅ Concluída (2026-05-27) |
| Fase 1 | Android: Camada de Dados | ✅ Concluída (2026-05-27) |
| Fase 2 | Android: Domínio e Validação | ✅ Concluída (2026-05-27) |
| Fase 3 | Android: Serviços de Sync | ✅ Concluída (2026-05-27) |
| Fase 4 | Android: UI | ✅ Concluída (2026-05-27) |
| Fase 5 | Dashboard: Core | ✅ Concluída (2026-05-27) |
| Fase 6 | Dashboard: Módulos de Visualização | ✅ Concluída (2026-05-27) |
| Fase 7 | Consistência App ↔ Dashboard | ✅ Concluída (2026-05-27) |
| Fase 8 | Documentação Final | ✅ Concluída (2026-05-27) |
