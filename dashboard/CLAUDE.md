# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dashboard de Medição** is a client-side web application for analyzing RDO (Relatório Diário de Obras / Daily Work Reports) data and calculating billing for railway maintenance operations at Engecom Engenharia / Encogel. The dashboard loads data from Google Sheets via the Sheets API and performs real-time calculations for two active types of work teams: TPs (Production Teams) and TSs (Welding Teams). TMC (Maintenance) was removed from the UI in v2.2.0 but calculation code is preserved in `calculations.js`.

### Key Features
- **Real-time Data Loading**: Fetches 4 Google Sheets tabs via API (RDO, Servicos, HorasImprodutivas, Efetivo) + O.S_Medidas e Config (feriados extras)
- **Multi-Team Support**: Handles TP (Production) and TS (Welding) teams (TMC removed from UI)
- **Financial Calculations**: Automated billing calculations based on HH (Homem-Hora / Man-Hour) metrics and SLA targets
- **Interactive Visualizations**: Charts, calendars, and KPI cards using Chart.js
- **Filtering**: Filter by month and year (team/type filters were removed from the UI in v2.2+)
- **Write Support**: Edits RDOs, services, HI, notes and OS management via Apps Script proxy (EditorRDO, Gestão OS)
- **Offline Fallback**: Embedded service coefficients via servicos-data.js for CORS scenarios

## Development Commands

### Running the Dashboard

**IMPORTANT**: The dashboard MUST be served via HTTP server (not opened directly as `file://`) to avoid CORS issues.

#### Python (Recommended):
```bash
cd C:\Users\dan\CalculadoraHH\dashboard
python -m http.server 8000
# Open: http://localhost:8000
```

#### Node.js:
```bash
cd C:\Users\dan\CalculadoraHH\dashboard
npx http-server -p 8000
# Open: http://localhost:8000
```

#### PHP:
```bash
cd C:\Users\dan\CalculadoraHH\dashboard
php -S localhost:8000
# Open: http://localhost:8000
```

#### VS Code Live Server:
1. Install "Live Server" extension
2. Right-click `index.html` → "Open with Live Server"

### Initial Setup

**First-time configuration**:
```bash
# 1. Copy example config
cd C:\Users\dan\CalculadoraHH\dashboard\js
cp config.example.js config.js

# 2. Edit config.js with your credentials
# - Add Google Sheets SPREADSHEET_ID
# - Add Google Cloud API_KEY
# - Set strong SECRET_KEY (32+ characters)

# 3. NEVER commit config.js (already in .gitignore)
```

### Service Synchronization

Services data is managed in a unified system across Android app and dashboard:

```bash
# From repository root (NOT dashboard directory)
cd C:\Users\dan\CalculadoraHH
npm run sync-servicos
# OR
node scripts/sync-servicos.js
```

**⚠️ CRITICAL**: Only edit `app/src/main/res/raw/servicos.json` (source of truth). The sync script generates `dashboard/servicos.json` and `dashboard/js/servicos-data.js` automatically.

## Architecture & Code Structure

### Application Architecture

```
dashboard/
├── index.html              # Main dashboard HTML with authentication
│
├── css/
│   └── dashboard.css       # Custom styles, heatmap, KPI cards
│
├── js/                     # JavaScript modules (class-based architecture)
│   ├── config.js           # Configuration (API keys, sheet names, prices)
│   ├── auth.js             # Link-based authentication (no backend)
│   ├── sheets-api.js       # GoogleSheetsAPI class - data loading
│   ├── calculations.js     # CalculadoraMedicao class - business logic
│   ├── charts.js           # Chart rendering (Chart.js wrapper)
│   ├── filters.js          # Filter utilities
│   ├── main.js             # DashboardMain class - orchestration
│   ├── editor-rdo.js       # EditorRDO — edição in-modal de RDOs via Apps Script
│   ├── calendario-tp.js    # TP calendar visualization + EditorRDO integration
│   ├── calendario-ts.js    # TS calendar visualization + EditorRDO integration
│   ├── visao-geral.js      # Visão Geral: KPIs, scorecard, perdas, qualidade
│   ├── gestao-os.js        # Gestão de OS com upload de anexos
│   ├── os-auditoria.js     # Auditoria de OS (suspeitas, dividir, corrigir)
│   ├── data-quality.js     # Análise de qualidade dos dados (badge + painel)
│   ├── period-comparison.js # Comparação entre períodos
│   ├── export-engine.js    # Exportação CSV/XLSX/JSON/PDF (v2.3.0)
│   ├── search-index.js     # Busca global com índice invertido (v2.3.0)
│   ├── ranking-engine.js   # Ranking de performance por turma (v2.3.0)
│   ├── executive-summary.js # Resumo executivo automático (v2.3.0)
│   ├── alerts-system.js    # Sistema de alertas com anti-XSS
│   ├── safe-html.js        # Utilitários de sanitização HTML (+ mostrarToast)
│   ├── field-helper.js     # Normalização de campos + operadoresPadraoTurma()
│   └── servicos-data.js    # ❌ GENERATED - service coefficients fallback
│
├── servicos.json           # ❌ GENERATED - service coefficients via HTTP
│
└── [Documentation files]   # README.md, FLUXO_DE_DADOS.md, etc.
```

> **Arquivos removidos (descontinuados em 2026-05-31):** `css/minimal-view.css`, `js/view-manager.js` (View Minimalista), `js/analise-tmc.js` (Análise TMC), `js/export.js`, `js/export-helper.js`.

### Key Classes

#### 1. GoogleSheetsAPI (`sheets-api.js`)
Handles data loading from Google Sheets using public API key (read-only).

**Responsibilities:**
- Fetch data from the 4 sheets the dashboard consumes: RDO, Servicos, HorasImprodutivas, Efetivo
  (Materiais, TransporteSucatas e Equipamentos são escritos pelo app mas não lidos aqui)
- Convert 2D arrays to JavaScript objects with field normalization
- Enrich services with coefficients from `SERVICOS_BASE` (or HTTP override via `servicos.json`)
- Calculate HH Improdutivas with special rules (Chuva ÷ 2, Trens < 20min = 0)
- Load O.S_Medidas (Gestão OS) e feriados extras da aba Config
- 5-minute cache to reduce API calls

**Key Methods:**
```javascript
await carregarTodosDados()  // Load the 4 sheets in parallel
converterParaObjetos(array)  // Convert Sheets array to objects
enriquecerServicosComCoeficientes(servicos)  // Add coefficients
calcularHHImprodutivas(hi, efetivos)  // Calculate unproductive hours (per-row)
carregarOSMedidas()          // Set de O.S da aba O.S_Medidas
carregarFeriadosExtras()     // Feriados estaduais/municipais da aba Config
```

#### 2. CalculadoraMedicao (`calculations.js`)
Core business logic for financial calculations.

**Responsibilities:**
- Filter RDOs by team/month/year
- Calculate TMC billing (proportional to worked days vs business days)
- Calculate TP billing (SLA-based with 110% cap, HH target = 12 operators × 6h × business days)
- Calculate TS billing (SLA-based on welder hours only)
- Compute daily HH breakdown (services + unproductive hours)
- Generate daily heatmaps with status (green/yellow/red)
- Validate business days (excluding weekends and national holidays)

**Key Methods:**
```javascript
calcularMedicaoTMC(turma, mes, ano)  // TMC billing (código preservado, sem UI)
calcularMedicaoTP(turma, mes, ano)   // TP billing with SLA
calcularMedicaoTS(turma, mes, ano)   // TS billing
calcularHHServicos(rdos)             // HH from services
calcularHHImprodutivas(rdos)         // HH from unproductive hours (merge de sobreposições)
calcularHHPorDia(rdos)               // Daily breakdown with status
getDiasUteis(mes, ano)               // Dias úteis (Páscoa + feriadosExtras da aba Config)
```

> **Duas implementações de HI coexistem por design:**
> `CalculadoraMedicao.calcularHHImprodutivas()` mescla sobreposições via `_mergeHIIntervals()`
> e é a fonte oficial para **totais e faturamento**. `GoogleSheetsAPI.calcularHHImprodutivas()`
> calcula HH **por linha de apontamento** (sem merge) para exibição/atribuição individual
> (Análise de Perdas, tabelas de apontamentos). Quando há HIs sobrepostas no mesmo RDO, a soma
> das linhas pode exceder o total oficial — isso é esperado.
> Fallback de operadores quando falta Efetivo: `operadoresPadraoTurma()` (TP=12, TS=5, TMC=6).

#### 3. DashboardMain (`main.js`)
Main orchestrator coordinating all modules.

**Responsibilities:**
- Initialize application and load data
- Manage filters (month, year)
- Coordinate calculations with CalculadoraMedicao
- Update KPI cards de média de efetivo (TP/TMC/TS)
- Render charts via dashboardCharts
- Render tabela de TSs
- Delegate to specialized modules (visaoGeral, calendarioTP, calendarioTS, gestaoOS, dataQuality, rankingEngine, executiveSummary, periodComparison)

**Key Methods:**
```javascript
async inicializar()          // Load data and render
async aplicarFiltros()       // Re-calculate on filter change
renderizarDashboard()        // Update all visualizations
atualizarKPIs()              // KPIs de média de efetivo
renderizarTabelaTSs()        // TS details table
```

#### 4. Specialized Modules

**editor-rdo.js**: EditorRDO — Edição in-modal de RDOs
- Classe singleton `EditorRDO` (instância global `editorRDO`)
- Ativado via botão "Editar" no rodapé dos modais de Detalhes do Dia
- Edição de cabeçalho: OS, Local, KM Início/Fim, Hora Início/Fim (single e multi-OS)
- CRUD de Serviços (spinner com SERVICOS_BASE + preview HH em tempo real)
- CRUD de Horas Improdutivas (tipos Android, ordenação por duração)
- Notas de dias sem RDO: salvas no Google Sheets via Apps Script (`salvarNotaDia` / `obterNotasDia`)
- Renomear Número RDO em cascata quando O.S muda (`renomearRDO` Apps Script)
- Excluir RDO (marca Deletado = "Sim" no Sheets)

**calendario-tp.js**: TP calendar visualization
- Monthly calendar view for TP teams
- Daily HH goals (72 HH target) with color coding
- Interactive day selection with detailed breakdown

**calendario-ts.js**: TS (Welding) calendar visualization
- Monthly calendar for TS teams
- Welder-specific HH tracking (6 HH daily target)
- Specialized service filtering for welding work

## Data Flow

### 1. Google Sheets Structure

**Source**: Spreadsheet ID definido em `js/config.js` (`CONFIG.SPREADSHEET_ID` — arquivo gitignored)

```
RDO (Main)
├─ Columns: ID, Número RDO, Data, Código Turma, Encarregado, Local, Número OS,
│           Status OS, KM Início/Fim, Horário Início/Fim, Clima, Tema DDS,
│           Houve Serviço, Houve Transporte, Nome Colaboradores, Observações,
│           Deletado, Data Sincronização, Data Criação
└─ Key Field: "Número RDO" (format: OS-DD.MM.YY-XXX, e.g., "998070-13.11.24-001")

Servicos
├─ Columns: Número RDO, Número OS, Data RDO, Código Turma, Encarregado,
│           Descrição, Quantidade, Unidade, É Customizado?
├─ Relationship: Many services per RDO (via Número RDO)
└─ Important: Coeficiente NOT in sheet - fetched from servicos.json

HorasImprodutivas (HI)
├─ Columns: Número RDO, Número OS, Data RDO, Código Turma, Encarregado,
│           Tipo (Chuva/RUMO), Descrição, Hora Início, Hora Fim, Operadores
├─ Special Rules:
│   ├─ "Chuva" type: HH = (duration × operators) ÷ 2
│   └─ Trens: só contam se duração >= 20 minutos (METAS.MINUTOS_MINIMOS_TREM)
└─ Operadores: coluna própria; fallback Efetivo; último fallback operadoresPadraoTurma()

Efetivo (Staff)
├─ Columns: Número RDO, Número OS, Data RDO, Código Turma, Encarregado,
│           Encarregado Qtd, Operadores, Operador EGP, Técnico Segurança,
│           Soldador, Motoristas
└─ Purpose: Track staff quantities per day for HI calculations

Equipamentos, Materiais, Transportes
└─ Contextual data with Número RDO relationship
```

### 2. Service Coefficients

**Source**: `servicos.json` (102 railway maintenance services — gerado de `app/src/main/res/raw/servicos.json`)

```json
[
  {"descricao": "Substituição Dormente", "coeficiente": 0.81},
  {"descricao": "Nivelamento Contínuo", "coeficiente": 0.81},
  {"descricao": "Correção Da Bitola", "coeficiente": 0.25}
]
```

**Fallback**: If `servicos.json` fails (CORS), use `SERVICOS_BASE` from `servicos-data.js`

**Match Logic**: Aggressive normalization (remove accents, punctuation, extra spaces, lowercase) to handle inconsistent formatting.

**Custom Services**: If "É Customizado?" = "SIM" in Servicos sheet, coeficiente = 0 (no billing).

### 3. Calculation Formulas

#### TP (Production Teams) - SLA-Based:
```javascript
// Meta Mensal
metaMensal = 12 operadores × 6 horas × diasUteis
metaDiaria = 72 HH (12 × 6)

// HH Calculation
hhServicos = Σ(quantidade × coeficiente)  // Sum all services
hhImprodutivas = Calculated with special rules (Chuva ÷ 2, Trens < 20min = 0, merge de sobreposições)
hhTotal = hhServicos + hhImprodutivas

// SLA Calculation (capped at 110%)
percentualSLA = Math.min(hhTotal / metaMensal, 1.10)

// Billing
valorFixoTP = {
  engecom: encarregado + (12 × operadores),
  encogel: munck + onibus + escavadeira
}
faturamento = valorFixoTP × percentualSLA
```

#### TMC (Maintenance Teams) - Proportional:
```javascript
// Days Calculation
diasTrabalhados = countUniqueWorkDays(rdos)
diasUteis = businessDays(mes, ano)

// Averages
mediaEncarregado = diasTrabalhados / diasUteis
mediaOperadores = totalOperadoresDia / diasUteis
mediaCaminhao = diasTrabalhados / diasUteis

// Billing
faturamento = {
  engecom: (mediaEncarregado × valorEncarregado) + (mediaOperadores × valorOperador),
  encogel: mediaCaminhao × valorCaminhao
}
```

#### TS (Welding Teams) - Welder HH Only:
```javascript
// Meta Mensal
metaMensal = 1 soldador × 6 horas × diasUteis
metaDiaria = 6 HH

// HH Calculation (ONLY from services performed by welder)
hhSoldador = Σ(quantidade × coeficiente)

// SLA Calculation (capped at 110%)
percentualSLA = Math.min(hhSoldador / metaMensal, 1.10)

// Billing
faturamento = valorFixoTS × percentualSLA
```

#### HH Improdutivas Calculation:
```javascript
// Basic calculation
duracaoHoras = horaFim - horaInicio  // Handle overnight periods
operadores = get from Efetivo tab (match by Número RDO)
hhImprodutivas = duracaoHoras × operadores

// Special rules
if (tipo.includes('Chuva')) {
  hhImprodutivas = hhImprodutivas / 2  // Rain counts as half
}

if (tipo.includes('trem') && duracaoHoras < METAS.MINUTOS_MINIMOS_TREM / 60) {
  hhImprodutivas = 0  // Trens com menos de 20 min não contam
}
```

## Important Technical Details

### Authentication System

**Link-based authentication** (no server required):
- URL: `index.html?key=engecom2024`
- Valid key stored in `js/auth.js` as `SECRET_KEY` or `js/config.js` as `CONFIG.SECRET_KEY`
- Client-side validation only (security through obscurity)
- Change key by editing `auth.js:3` or `config.js:29`

**Security Recommendations** (see `SECURITY.md` for details):
- Use strong keys (32+ characters with symbols)
- Never commit `config.js` to Git (already in `.gitignore`)
- Restrict API key by HTTP referrer in Google Cloud Console
- Use HTTPS only in production
- Regenerate keys every 3-6 months

### API Configuration

**File**: `js/config.js`

```javascript
const CONFIG = {
  SPREADSHEET_ID: '<id da planilha>',
  API_KEY: '<api key do Google Cloud>',
  SHEETS: {
    RDO: 'RDO',
    SERVICOS: 'Servicos',
    HI: 'HorasImprodutivas',
    // ... etc
  },
  SECRET_KEY: '<chave de acesso via URL>',
  APPS_SCRIPT_URL: '<URL do deployment do Apps Script>'
};
```

**⚠️ SECURITY**: API Key is read-only (public exposure acceptable). For production, consider restricting by HTTP referrer in Google Cloud Console.

### Pricing Tables

**File**: `js/config.js`

```javascript
const PRECOS_ENGECOM = {
  ENCARREGADO_MES: 26488.37,
  OPERADOR_MES: 14584.80,
  // ...
};

const PRECOS_ENCOGEL = {
  CAMINHAO_MUNCK_MES: 54870.19,
  MICRO_ONIBUS_MES: 43246.76,
  // ...
};
```

### Chart.js Integration

**Library**: Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0

**Chart Types Used:**
- **Line Charts**: Billing evolution over time
- **Bar Charts**: Team comparisons, HH productive vs unproductive
- **Pie/Doughnut**: Distribution (Engecom/Encogel), service breakdown
- **Custom Heatmap**: CSS-based calendar grid with color coding

**File**: `js/charts.js` - Single `dashboardCharts` global object

### Field Normalization

**Problem**: Google Sheets columns may have inconsistent casing/spacing.

**Solution**: `GoogleSheetsAPI.normalizarNomeCampo()`
- "Número RDO" → `numeroRDO`
- "Data RDO" → `dataRDO`
- "Código Turma" → `codigoTurma`

Objects contain BOTH original and normalized field names for compatibility.

### CORS Handling

**Issue**: Opening `index.html` as `file://` blocks `fetch('servicos.json')`.

**Solution**: Dual-source loading
1. Try HTTP: `await fetch('servicos.json')`
2. Fallback to embedded: `SERVICOS_BASE` from `servicos-data.js`

**Important**: `servicos-data.js` is auto-generated by sync script.

### Caching Strategy

**Implementation**: `GoogleSheetsAPI.cache` object
- **Duration**: 5 minutes
- **Scope**: Per sheet + range
- **Fallback**: Returns expired cache if API fails
- **Manual clear**: `sheetsAPI.limparCache()`

### Utility Functions

**Field Access Helper** (`config.js:342-385`):
```javascript
getCampoNormalizado(obj, nomeCampo, variantes = [])
// Handles multiple field name variations
// Example: getCampoNormalizado(rdo, 'numeroOS', ['Número OS', 'numero_os'])
```

**Normalization Functions** (`sheets-api.js`):
```javascript
normalizarNomeCampo(nome)        // "Número RDO" → "numeroRDO"
normalizarDescricaoServico(desc) // Aggressive normalization for service matching
```

**Date/Time Utilities** (`calculations.js`):
```javascript
getDiasUteis(mes, ano)           // Business days calculation with Easter handling
contarDiasUnicos(rdos)           // Count unique work days from RDO list
calcularDiferencaHoras(inicio, fim) // Handle overnight periods correctly
```

## Development Conventions

### Code Organization

**Pattern**: Class-based with global singletons
```javascript
class MyModule {
  constructor() { /* ... */ }
  method() { /* ... */ }
}

const myModule = new MyModule();  // Global instance
```

**Naming**:
- Classes: PascalCase (`CalculadoraMedicao`)
- Variables/functions: camelCase (`calcularMedicaoTP`)
- Constants: UPPER_SNAKE_CASE (`META_DIARIA_TP`)
- Global instances: camelCase matching class (`calculadoraMedicao`)

### Data Access Patterns

**Always normalize field names**:
```javascript
// GOOD: Handle both original and normalized
const data = rdo.Data || rdo.data || '';
const turma = rdo['Código Turma'] || rdo.codigoTurma || '';

// BAD: Assume single format
const data = rdo.Data;  // May fail if normalized
```

**Relationship Joins**:
```javascript
// Join by Número RDO (most reliable)
const servicosRDO = this.servicos.filter(s =>
  (s['Número RDO'] || s.numeroRDO) === numeroRDO
);
```

### Error Handling

**Validation before division**:
```javascript
// ALWAYS validate denominator
if (!diasUteis || diasUteis <= 0) {
  console.error(`❌ [CRÍTICO] Dias úteis inválido: ${diasUteis}`);
  throw new Error(`Dias úteis inválido (${diasUteis})`);
}

const media = total / diasUteis;

// Validate result
if (isNaN(media) || !isFinite(media)) {
  throw new Error(`Cálculo resultou em ${media}`);
}
```

**User-facing errors**:
```javascript
try {
  await this.carregarDados();
} catch (error) {
  console.error('[Dashboard] Erro ao carregar:', error);
  alert('Erro ao carregar dados. Verifique sua conexão.');
}
```

### Calculation Debugging

**Extensive console logging**:
```javascript
console.log(`[TP] ${turma}: ${hhServicos} serv + ${hhImprodutivas} HI = ${hhTotal} HH`);
console.log(`[TP] SLA: ${(percentualSLA * 100).toFixed(1)}% da meta ${metaMensal}`);
```

**Warnings for anomalies**:
```javascript
if (diasTrabalhados > diasUteis * 2) {
  console.warn(`⚠️ [TMC] Dias trabalhados (${diasTrabalhados}) muito maior que úteis (${diasUteis})`);
}
```

## Common Development Scenarios

### Adding a New Team Type

1. Update `getTipoTurma()` in `filters.js` to recognize new prefix
2. Add calculation method in `calculations.js`:
   ```javascript
   calcularMedicaoNOVO(turma, mes, ano) {
     const rdosTurma = this.filtrarRDOsPorTurma(turma, mes, ano);
     // ... calculation logic
     return { turma, tipo: 'NOVO', ... };
   }
   ```
3. Integrate in `calcularEstatisticasConsolidadas()`
4. Add table rendering in `main.js`: `renderizarTabelaNOVOs()`
5. Add tab in `index.html` with corresponding panel

### Adding a New Chart

1. Add HTML canvas in `index.html`:
   ```html
   <canvas id="chartNovo"></canvas>
   ```
2. Create rendering method in `charts.js`:
   ```javascript
   renderizarGraficoNovo(dados) {
     const ctx = document.getElementById('chartNovo').getContext('2d');
     new Chart(ctx, { /* config */ });
   }
   ```
3. Call from `main.js` in `renderizarDashboard()`

### Modifying Service Coefficients

**⚠️ CRITICAL**: Only edit source file, never generated files!

1. Edit: `app/src/main/res/raw/servicos.json` (Android app directory)
2. Run: `npm run sync-servicos` from repository root
3. Generated files updated automatically:
   - `dashboard/servicos.json`
   - `dashboard/js/servicos-data.js`
4. Commit all 3 files together

### Changing Pricing

Edit `js/config.js`:
```javascript
const PRECOS_ENGECOM = {
  ENCARREGADO_MES: 26488.37,  // Update values here
  OPERADOR_MES: 14584.80,
};
```

No other changes needed - calculations reference these constants.

### Adding a New Google Sheets Tab

1. Add sheet name to `CONFIG.SHEETS` in `config.js`
2. Add parallel fetch in `sheetsAPI.carregarTodosDados()`
3. Convert to objects: `this.converterParaObjetos(newTabRaw)`
4. Process as needed in calculation methods

### Debugging Data Mismatches

**Common issue**: Service not found in coefficient lookup

**Check**:
```javascript
// In browser console:
sheetsAPI.normalizarDescricaoServico("Your Service Name")
// Compare with keys in servicos.json
```

**Solution**: Ensure exact match after normalization (accents, spaces, punctuation removed).

### Handling New HI Rules

Edit `GoogleSheetsAPI.calcularHHImprodutivas()`:
```javascript
// Add new rule
const tipo = hi['Tipo'] || hi.tipo || '';
if (tipo.includes('NovoTipo')) {
  hhImprodutivas = /* custom logic */;
}
```

## Debugging & Diagnostics

### Diagnostic Tools

**File**: `diagnostico.html`
- Standalone diagnostic page for testing Google Sheets API connectivity
- Tests all 7 sheet connections independently
- Validates authentication and data loading
- Use when dashboard shows empty data despite successful API responses

**Common Issues**:
1. **Empty Dashboard with API OK**: Run `diagnostico.html` to isolate the problem
2. **Field Normalization**: Use `getCampoNormalizado()` utility in `config.js` (lines 342-385)
3. **Console Logging**: All modules have extensive logging - check browser console (F12)

**Debug Script**: See `DEBUG_DADOS.md` for advanced debugging commands

### Common Pitfalls & Troubleshooting

**1. CORS Errors with servicos.json**
- **Problem**: Browser blocks `fetch('servicos.json')` when opening as `file://`
- **Solution**: Always run via HTTP server (see "Running the Dashboard" above)
- **Fallback**: Dashboard auto-loads `SERVICOS_BASE` from `servicos-data.js`

**2. API Key Quota Exceeded**
- **Problem**: Google Sheets API returns 429 errors
- **Solution**: Increase quotas in Google Cloud Console or implement request throttling
- **Cache**: 5-minute cache reduces API calls significantly

**3. Field Name Mismatches**
- **Problem**: `rdo.numeroOS` returns `undefined` but data exists
- **Solution**: Use `getCampoNormalizado(rdo, 'numeroOS', ['Número OS', 'numero_os'])`
- **Reason**: Google Sheets column names vary, normalization handles this

**4. Division by Zero in Calculations**
- **Problem**: `NaN` or `Infinity` in billing calculations
- **Cause**: Invalid `diasUteis` or missing data
- **Protection**: All calculation methods validate inputs and throw clear errors

**5. Empty Tables Despite Data Loading**
- **Problem**: API loads data but tables remain empty
- **Check**: Verify filters aren't too restrictive (month/year/team)
- **Debug**: Run `dashboardMain.estatisticas` in console to see calculated data

**6. Authentication Failing**
- **Problem**: Redirected to error page despite correct URL key
- **Check**: Verify `SECRET_KEY` in `config.js` or `auth.js` matches URL parameter
- **Note**: Key is case-sensitive

### Recent Updates

**Version 2.4.0 (2026-06-09)** - Correções de varredura + feriados extras + testes:

**Correções:**
- `carregarOSMedidas()`: O.S combinadas ("1017755/1018836") agora registram cada parte
  individual no Set (antes a string combinada era registrada inteira e `getMediu()` de
  uma O.S individual falhava)
- Fallback de operadores em HI agora usa a composição padrão da turma via
  `operadoresPadraoTurma()` (TP=12, TS=5, TMC=6) — antes era 12 fixo, inflando HI de TS
  em ~70% quando faltava Efetivo. Aplicado em `calculations.js`, `sheets-api.js` e
  `visao-geral.js`
- Heatmap de produtividade removido: dependia do filtro de turma extinto da UI e era
  inalcançável desde a v2.2 (o Calendário TP cobre a visão diária por turma)

**Novidades:**
- **Feriados extras**: chave `feriados_extras` na aba Config do Sheets (datas DD/MM/YYYY
  separadas por vírgula) entra no cálculo de dias úteis — para feriados
  estaduais/municipais, sem precisar de deploy
- **Testes automatizados**: `npm test` roda `tests/calculations.test.js` (node:test, sem
  dependências) cobrindo merge de HI, dias úteis/Páscoa, feriados extras, validação de
  O.S e medição TP ponta a ponta
- **`npm run gen-config-example`**: regenera `config.example.js` a partir do `config.js`
  local com placeholders — elimina o drift do template (estava sem suporte a TS e
  quebrava com ReferenceError)

**Limpeza de código morto:**
- `main.js`: `renderizarHeatmap`, `renderizarTabelaTMCs`, `popularSelectTurmas`,
  `extrairTurmasUnicas`, cálculos órfãos em `atualizarKPIs`, referência a `filtroAnoMinimal`
- `filters.js`: favoritos (nunca tiveram UI), `filtrarTurmasPorTipo`, `obterFiltros`
- `sheets-api.js`: `carregarAbaSemCache`
- Cache-busting unificado: todos os scripts em `index.html` usam `?v=<versão do dashboard>`

---

**Version 2.1.0 (2026-05-31)** - Edição In-Modal de RDOs + Limpeza:

**Novo módulo `editor-rdo.js` (classe EditorRDO):**
- Edição completa de RDOs diretamente nos modais dos Calendários TP e TS
- Cabeçalho (OS, Local, KM, Horário) editável — renomeia Número RDO em cascata quando OS muda
- Multi-OS: formulários inline por O.S + seletor "O.S destino" nos formulários de adição
- Serviços: spinner com todos os ~104 serviços (SERVICOS_BASE) + preview HH em tempo real
- HI: tabela com coluna Duração calculada + botões ▲▼ para ordenar por duração
- Nota Local do Dia: anotação privada por turma/data em `localStorage`
- Excluir RDO / Dividir OS

**Visão Geral — melhorias:**
- Apontamentos HI: modal ampliado para `modal-xl`, coluna Turma adicionada
- Apontamentos HI: clicar em linha navega ao Calendário TP/TS e abre o dia
- Apontamentos HI: botões ▲▼ para ordenar por Duração e por HH
- Qualidade dos Dados: clicar em Número RDO navega ao dia no calendário
- Offcanvas de Serviços: largura padrão 760 → 1000 px

**Cabeçalho dos calendários TP/TS:**
- TP: 6 métricas em 2 linhas (Dias Trabalhados, Média Op, Nº OS / HH Produtivas, HH Impr, HH Total)
- TS: rótulo "HH Produtivas" (antes "HH Soldador")

**Bug fixes (relatório de revisão externa):**
- Loading overlay não trava mais em erros de `aplicarFiltros()` / `recarregar()`
- Botão "Aplicar Filtros" volta ao estado primário após sucesso (`resetarBotao()`)
- `charts.js`: canvas preservado em estado vazio (`_restaurarCanvas()`), não mais destruído
- Rodapé atualizado para `v2.0.1`

**Limpeza de código morto:**
- Removidos: View Minimalista (view-manager.js + minimal-view.css), Análise TMC (analise-tmc.js), Exportação (export.js + export-helper.js)

**Apps Script (proxy de escrita) — novo e corrigido:**
- Funções: `renomearRDO`, `dividirOS`, `atualizarCampoRDO`, `atualizarServico`, `adicionarServico`, `excluirServico`, `atualizarHI`, `adicionarHI`, `excluirHI`, `deletarRDO`, `salvarNotaDia`, `obterNotasDia`
- Bugs corrigidos: roteamento `renomearRDO` (`acao` → `dados.acao`), `dividirOS` args, `openById(SPREADSHEET_ID)` → `getActiveSpreadsheet()`

---

**Version 2.0.1 (2026-05-27)** - Bug Fixes (Programa de Qualidade):
- Fix: `visao-geral.js` — TypeError ao trocar sub-abas TP/TS (método `_renderizarGraficoEvolucao` nunca implementado)
- Fix: `visao-geral.js` — label "% Meta" corrigido para incluir HH Improdutivo no cálculo
- Fix: `sheets-api.js` — fallback `hi.data` substituído por `hi.dataRDO` (campo normalizado correto)
- Refactor: variável morta `hhTotal` removida de `visao-geral.js`

---

**Version 2.0.0 (2026-04-06)** - REMODELAÇÃO COMPLETA DA VISÃO GERAL:

**Aba Visão Geral — reescrita do zero:**
- Novo módulo `visao-geral.js` com arquitetura orientada a objetos (classe `VisaoGeral`)
- KPIs dinâmicos por tipo de turma (TP/TS) com metas corretas (72 HH/dia TP, 6 HH/dia TS)
- Gráfico de Composição de Horas: barra empilhada PDM + Correlato + Perdas NC + Perdas C + Gap
- Scorecard comparativo de turmas com colunas configuráveis por tipo
- Gráfico de Produtividade por turma (escala HH Total / HH/dia / HH/RDO)
- Gráfico de Classificação de Atividades (pizza PDM vs Correlato) com filtro por turma
- **Top Serviços por HH** com:
  - Drill-down por clique (detalhes por OS, data, turma, KM)
  - Ordenação por HH, Quantidade e Ocorrências
  - Filtro TIPO (Todos / PDM / Correlato)
- **Análise de Perdas (HI)** — Perdas Controláveis vs Não Controláveis com:
  - Gráfico ranking completo de perdas
  - Resumo split NC vs Controlável
  - Detalhamento por clique (lista de apontamentos com horários e duração)
- **Banner "Impacto das HI sobre Produção PDM"** posicionado abaixo da análise de perdas
- **Qualidade dos Dados** com badges clicáveis (RDOs sem efetivo, HIs sem horário, serviços sem coeficiente)
- Filtro por turma em tempo real: todos os painéis atualizam ao selecionar uma turma no scorecard

**Detalhamento de Turma (offcanvas):**
- Info operacional: encarregado, média operadores, dias ≥ META
- KPIs: HH produtivo, HH improdutivo, total entregues, % da meta
- Barra de composição da meta (PDM + Correlato + Perdas + Gap)
- Gráficos: composição das horas (pizza) + top serviços (barras)
- Tabelas: Serviços Realizados (clicável → drill-down) + Horas Improdutivas (clicável → apontamentos)
- Lista de O.S com KM, datas, HH produtivo, HI e total (clicável → detalhe da OS)

**Detalhamento de Serviço (drill-down):**
- Filtrado pela turma de contexto quando aberto via detalhe de turma
- Stats: HH Total, Quantidade, Ocorrências (recalculados para a turma filtrada)
- Botão "← Voltar para [Turma]" quando há contexto de turma
- Cada linha de OS clicável → abre detalhe da OS

**Detalhamento de OS:**
- Resumo: HH total, produtivo, improdutivo, % da meta
- Média de operadores calculada a partir dos efetivos reais
- Tabela de serviços com Qtd, HH e data
- Tabela de HI com tipo, horários, duração calculada e HH
- Botão "← Voltar para [Turma]"

**Correções e melhorias:**
- Removido card "Alertas e Notificações" da interface
- Corrigida meta do gauge TS: usa `THRESHOLDS.SLA_ALERTA` em vez de `SLA_CRITICO`
- Corrigido colspan do painel de Gestão de OS (13 colunas)
- Corrigido contraste: título "Qualidade dos Dados" e label "Quantidade" agora visíveis
- Aumentadas levemente as fontes das tabelas no offcanvas
- Metas SEMPRE lidas de `METAS.*` (nunca hardcoded)

**Version 1.3.0 (2024-12-03)** - SPRINT 3 COMPLETE:
- Sistema de Alertas, Comparação de Períodos, Filtros Favoritos, Índices O(1)

**Version 1.2.0 (2024-12-02)** - CRITICAL FIX:
- Fixed canvas reuse error when applying filters

**Version 1.1.0 (2024-12-01)**:
- Field normalization, null checks, getCampoNormalizado utility

## Apps Script — Ações de Notas

✅ **Já implantado** (verificado em 2026-06-09): as ações `salvarNotaDia` e `obterNotasDia`
constam no script implantado (ver `appscript_atual.md`) e na cópia versionada
`apps-script-atualizar-os.gs`. O código abaixo fica como referência da implementação:

```javascript
// No switch de doPost:
case 'salvarNotaDia':  return salvarNotaDia(dados);
case 'obterNotasDia':  return obterNotasDia();

// Funções a adicionar:
function salvarNotaDia(dados) {
  const { turma, data, nota } = dados;
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let notas   = ss.getSheetByName('Notas');
  if (!notas) {
    notas = ss.insertSheet('Notas');
    notas.appendRow(['Turma', 'Data', 'Nota', 'Atualizado Em']);
  }
  const rows = notas.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === turma && rows[i][1] === data) {
      if (nota) notas.getRange(i+1, 3, 1, 2).setValues([[nota, new Date().toISOString()]]);
      else notas.deleteRow(i+1);
      return ContentService.createTextOutput(JSON.stringify({ sucesso: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (nota) notas.appendRow([turma, data, nota, new Date().toISOString()]);
  return ContentService.createTextOutput(JSON.stringify({ sucesso: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function obterNotasDia() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const notas = ss.getSheetByName('Notas');
  const arr   = notas ? notas.getDataRange().getValues().slice(1)
    .filter(r => r[0] && r[1])
    .map(r => ({ turma: String(r[0]), data: String(r[1]), nota: String(r[2] || '') }))
    : [];
  return ContentService.createTextOutput(JSON.stringify({ sucesso: true, notas: arr }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Se o Apps Script implantado não tiver essas ações, o dashboard carrega sem notas (array vazio) e as tentativas de salvar mostram um alerta de erro (fallback silencioso).

## Apps Script — Sincronização do código

O script implantado no Google Apps Script suporta 18 ações (ver header de
`apps-script-atualizar-os.gs`). Duas cópias existem neste repositório:

- `apps-script-atualizar-os.gs` — cópia versionada do script (manter em sincronia ao editar)
- `appscript_atual.md` — dump do script efetivamente implantado (referência de contrato)

⚠️ Alterações no Apps Script exigem atualização **manual** no editor do Google
(Extensões → Apps Script → Implantar). O deploy automático do GitHub Actions NÃO cobre o Apps Script.

## Version Information

- **Current Version**: 2.4.0
- **Target Browsers**: Modern browsers (Chrome, Firefox, Edge, Safari)
- **Dependencies**:
  - Bootstrap 5.3.0 (CSS framework)
  - Chart.js 4.4.0 (charts)
  - chartjs-plugin-datalabels 2.2.0 (chart labels)
  - Font Awesome 6.4.0 (icons)
  - Google Sheets API v4 (data source)

## Related Documentation

**Same directory**:
- `README.md` - Basic setup and hosting instructions
- `FLUXO_DE_DADOS.md` - **Detailed data flow analysis** (highly recommended read)
- `COMO_RODAR.md` - Running with different HTTP servers
- `SECURITY.md` - Security considerations

**Parent directory** (`../CLAUDE.md`):
- Android app architecture and RDO generation system
- Database schema and sync logic
- Service management workflow

## Key Differences from Android App

1. **No Database**: Dashboard reads directly from Google Sheets (source of truth)
2. **Client-side Only**: Pure HTML/CSS/JS, no server required
3. **Leitura via API key / Escrita via Apps Script**: leitura usa a Sheets API (key pública read-only);
   escrita (EditorRDO, Gestão OS, notas) passa pelo proxy Apps Script (`APPS_SCRIPT_URL`)
4. **Real-time Calculations**: All billing calculations happen in browser
5. **Link Authentication**: Simple secret key in URL (vs Android app's user sessions)

---

**Developed for Engecom Engenharia / Encogel - Railway Maintenance Consortium**
