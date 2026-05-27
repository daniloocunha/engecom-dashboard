# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CalculadoraHH** (Display name: "Controle de Campo") is an Android application designed for calculating work hours (HH - Homem-Hora) and managing RDO (Relatório Diário de Obras / Daily Work Reports) for railway maintenance operations at Engecom Engenharia. The app is built using Kotlin with MVVM architecture, ViewBinding, and Material Design 3.

The project also includes a **web dashboard** (`dashboard/`) hosted on GitHub Pages for management reporting, synced via Google Sheets.

### Key Features
- **Calculadora HH**: Calculate work hours based on ~100 predefined railway service coefficients
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
# or
node scripts/sync-servicos.js
```

### Utility Scripts (scripts/)
- `scripts/importar_rdos.py` — Importa RDOs de mensagens WhatsApp/TXT para Sheets
- `scripts/cleanup_sheets.py` — Limpeza e normalização de RDOs no Sheets (headers, deletados, HI)
- `scripts/cleanup_op6.py` — Limpa coluna Operadores na aba HorasImprodutivas
- `scripts/read_sheets.py` — Lê dados do Sheets via JWT manual para diagnóstico
- `scripts/verify-sheets.js` — Verifica integridade dos dados no Sheets
- `scripts/fix-sheets-*.js` — Scripts de correção pontual de dados históricos

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
├── index.html                  # SPA principal (1200+ linhas, Bootstrap 5.3 + Chart.js 4.4)
├── servicos.json               # Cópia de app/src/main/res/raw/servicos.json (AUTO-GERADO)
├── css/
│   ├── dashboard.css           # Estilos do dashboard
│   └── minimal-view.css        # Tema minimalista
└── js/
    ├── config.js               # Secrets + constantes (GITIGNORED — ver config.example.js)
    ├── config.example.js       # Template público do config.js
    ├── main.js                 # Bootstrap da aplicação, event handlers globais
    ├── sheets-api.js           # Integração Google Sheets API v4 (cache 5 min, rate limit)
    ├── field-helper.js         # Normalização de campos (datas ISO, nomes de campos)
    ├── calculations.js         # Cálculos TMC/TP/TS com índices O(1) e merge de HI
    ├── visao-geral.js          # Visão Geral: KPIs, composição de horas, scorecard, perdas
    ├── calendario-tp.js        # Calendário interativo para turmas TP
    ├── calendario-ts.js        # Calendário interativo para turmas TS
    ├── gestao-os.js            # Gestão de Ordens de Serviço com upload de anexos
    ├── analise-tmc.js          # Análise TMC por turma e período
    ├── period-comparison.js    # Comparação entre períodos
    ├── charts.js               # Wrappers Chart.js com thresholds dinâmicos
    ├── filters.js              # Filtros globais (mês, ano, turma)
    ├── alerts-system.js        # Sistema de alertas com escapeHtml (anti-XSS)
    ├── safe-html.js            # Utilitários de sanitização HTML
    ├── export.js               # Exportação de dados
    ├── export-helper.js        # Helpers de exportação
    ├── auth.js                 # Autenticação (SECRET_KEY simples)
    ├── view-manager.js         # Alternância clássico/minimalista
    ├── os-auditoria.js         # Auditoria de OS
    └── servicos-data.js        # Constante JS com serviços (AUTO-GERADO, fallback CORS)
```

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
  - UNIQUE constraint em `numero_rdo` com retry automático (backoff exponencial)
  - Gson para serialização de campos complexos (serviços, HI, transportes)
  - Thread-safe com métodos sincronizados
  - Indexes de performance em: `data`, `numero_os`, `sincronizado`, `numero_rdo`

#### 5. Data Models
- **RDOData**: Dados completos do RDO para escrita (19 campos incluindo `causaNaoServico`)
- **RDODataCompleto**: Versão extendida para leitura com campos calculados
- **ServicoRDO**: Serviço com descrição, quantidade, coeficiente, HH manual (opcional)
- **HIItem**: Horas Improdutivas com tipo, horários, operadores
- **TransporteItem**: Registro de transporte com veículo, motorista, KM e horários
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

#### 9. Dashboard — Arquitetura de Cálculos

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
- UNIQUE constraint com retry automático (backoff exponencial)
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
- **versionCode**: 22
- **versionName**: "5.1.5"
- **AGP Version**: 8.13.1
- **Kotlin Version**: 2.0.21
- **Gradle Version**: 8.13 (via wrapper)
- **Database Version**: 10
- **Sheets HEADERS_VERSION**: 6

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
| Fase 1 | Android: Camada de Dados | Pendente |
| Fase 2 | Android: Domínio e Validação | Pendente |
| Fase 3 | Android: Serviços de Sync | Pendente |
| Fase 4 | Android: UI | Pendente |
| Fase 5 | Dashboard: Core | Pendente |
| Fase 6 | Dashboard: Módulos de Visualização | Pendente |
| Fase 7 | Consistência App ↔ Dashboard | Pendente |
| Fase 8 | Documentação Final | Pendente |
