# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dashboard de Medição** is a client-side web application for analyzing RDO (Relatório Diário de Obras / Daily Work Reports) data and calculating billing for railway maintenance operations at Engecom Engenharia / Encogel. The dashboard loads data from Google Sheets via the Sheets API and performs real-time calculations for three types of work teams: TPs (Production Teams), TMCs (Maintenance Teams), and TSs (Welding Teams).

### Key Features
- **Real-time Data Loading**: Fetches data from 7 Google Sheets tabs via API
- **Multi-Team Support**: Handles TP (Production), TMC (Maintenance), and TS (Welding) teams
- **Financial Calculations**: Automated billing calculations based on HH (Homem-Hora / Man-Hour) metrics and SLA targets
- **Interactive Visualizations**: Charts, heatmaps, calendars, and KPI cards using Chart.js
- **Smart Filtering**: Filter by month, year, team, and type with dynamic updates
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
│   ├── acompanhamento-diario.js  # Daily tracking module
│   ├── analise-tmc.js      # TMC analysis module
│   ├── calendario-tp.js    # TP calendar visualization
│   ├── calendario-ts.js    # TS calendar visualization
│   └── servicos-data.js    # ❌ GENERATED - service coefficients fallback
│
├── servicos.json           # ❌ GENERATED - service coefficients via HTTP
│
└── [Documentation files]   # README.md, FLUXO_DE_DADOS.md, etc.
```

### Key Classes

#### 1. GoogleSheetsAPI (`sheets-api.js`)
Handles data loading from Google Sheets using public API key (read-only).

**Responsibilities:**
- Fetch data from 7 sheets: RDO, Servicos, HorasImprodutivas, Efetivo, Equipamentos, Materiais, Transportes
- Convert 2D arrays to JavaScript objects with field normalization
- Enrich services with coefficients from `servicos.json` (or fallback to `SERVICOS_BASE`)
- Calculate HH Improdutivas with special rules (Chuva ÷ 2, Trens > 15min)
- 5-minute cache to reduce API calls

**Key Methods:**
```javascript
await carregarTodosDados()  // Load all 7 sheets in parallel
converterParaObjetos(array)  // Convert Sheets array to objects
enriquecerServicosComCoeficientes(servicos)  // Add coefficients
calcularHHImprodutivas(hi, efetivos)  // Calculate unproductive hours
```

#### 2. CalculadoraMedicao (`calculations.js`)
Core business logic for financial calculations.

**Responsibilities:**
- Filter RDOs by team/month/year
- Calculate TMC billing (proportional to worked days vs business days)
- Calculate TP billing (SLA-based with 110% cap, HH target = 12 operators × 8h × business days)
- Calculate TS billing (SLA-based on welder hours only)
- Compute daily HH breakdown (services + unproductive hours)
- Generate daily heatmaps with status (green/yellow/red)
- Validate business days (excluding weekends and national holidays)

**Key Methods:**
```javascript
calcularMedicaoTMC(turma, mes, ano)  // TMC billing
calcularMedicaoTP(turma, mes, ano)   // TP billing with SLA
calcularMedicaoTS(turma, mes, ano)   // TS billing
calcularHHServicos(rdos)             // HH from services
calcularHHImprodutivas(rdos)         // HH from unproductive hours
calcularHHPorDia(rdos)               // Daily breakdown with status
getDiasUteis(mes, ano)               // Business days (Easter calculation included)
```

#### 3. DashboardMain (`main.js`)
Main orchestrator coordinating all modules.

**Responsibilities:**
- Initialize application and load data
- Manage filters (month, year, team, type)
- Coordinate calculations with CalculadoraMedicao
- Update KPIs (Total RDOs, Total HH, Billing, Avg SLA, Staff Averages)
- Render charts via dashboardCharts
- Render tables (TPs, TMCs, TSs)
- Render heatmap for selected team
- Delegate to specialized modules (acompanhamentoDiario, analiseTMC, calendarioTP, calendarioTS)

**Key Methods:**
```javascript
async inicializar()          // Load data and render
async aplicarFiltros()       // Re-calculate on filter change
renderizarDashboard()        // Update all visualizations
atualizarKPIs()              // Update KPI cards
renderizarTabelaTPs()        // TP details table
renderizarHeatmap()          // Daily productivity heatmap
```

#### 4. Specialized Modules

**acompanhamento-diario.js**: Daily tracking and progress monitoring
- Renders daily RDO summary with HH breakdown
- Shows service details and unproductive hours per day
- Provides day-by-day progress view

**analise-tmc.js**: TMC-specific analysis and reporting
- Deep dive into TMC team performance
- Staff utilization analysis
- Equipment usage tracking

**calendario-tp.js**: TP calendar visualization
- Monthly calendar view for TP teams
- Daily HH goals (96 HH target) with color coding
- Interactive day selection with detailed breakdown

**calendario-ts.js**: TS (Welding) calendar visualization
- Monthly calendar for TS teams
- Welder-specific HH tracking (8 HH daily target)
- Specialized service filtering for welding work

## Data Flow

### 1. Google Sheets Structure (7 Tabs)

**Source**: Spreadsheet ID `1H40DX9HwwOwXJquM9bX1qCYuam90hYpiC8enGb9TYFQ`

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
│           Tipo (Chuva/RUMO), Descrição, Hora Início, Hora Fim
├─ Special Rules:
│   ├─ "Chuva" type: HH = (duration × operators) ÷ 2
│   └─ "RUMO" (trains): Only count if duration >= 15 minutes
└─ Operators fetched from Efetivo tab

Efetivo (Staff)
├─ Columns: Número RDO, Número OS, Data RDO, Código Turma, Encarregado,
│           Encarregado Qtd, Operadores, Operador EGP, Técnico Segurança,
│           Soldador, Motoristas
└─ Purpose: Track staff quantities per day for HI calculations

Equipamentos, Materiais, Transportes
└─ Contextual data with Número RDO relationship
```

### 2. Service Coefficients

**Source**: `servicos.json` (~175 railway maintenance services)

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
metaMensal = 12 operadores × 8 horas × diasUteis
metaDiaria = 96 HH (12 × 8)

// HH Calculation
hhServicos = Σ(quantidade × coeficiente)  // Sum all services
hhImprodutivas = Calculated with special rules (Chuva ÷ 2, Trens > 15min)
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
metaMensal = 1 soldador × 8 horas × diasUteis
metaDiaria = 8 HH

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

if (tipo.includes('trem') && duracaoHoras < 0.25) {
  hhImprodutivas = 0  // Trains under 15 min don't count
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
  SPREADSHEET_ID: '1H40DX9HwwOwXJquM9bX1qCYuam90hYpiC8enGb9TYFQ',
  API_KEY: 'AIzaSyCT-HEiAY4qN6UtoxTARgykRr_GyM4N0AA',
  SHEETS: {
    RDO: 'RDO',
    SERVICOS: 'Servicos',
    HI: 'HorasImprodutivas',
    // ... etc
  }
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

### CSS Heatmap System

**Color Coding**:
```css
.heatmap-day.verde    { background: #4CAF50; }  /* >= 96 HH (100% of daily target) */
.heatmap-day.amarelo  { background: #FFC107; }  /* 80-95 HH (warning zone) */
.heatmap-day.vermelho { background: #f44336; }  /* < 80 HH (critical) */
```

**Hover Tooltips**: Pure CSS `.heatmap-tooltip` positioned absolutely

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

**Version 1.3.0 (2024-12-03)** - SPRINT 3 COMPLETE:
- 🚀 **NEW:** Sistema de Alertas Visíveis - Identificação automática de problemas críticos
- 📊 **NEW:** Comparação de Períodos - Análise temporal mês a mês
- 🔍 **NEW:** Filtros Favoritos - Salvar preferências no localStorage
- ⚡ **NEW:** Índices Map para lookups O(1) - 70% mais rápido em datasets grandes
- See `SPRINT_3_CONCLUIDO.md` for complete documentation

**Version 1.2.0 (2024-12-02)** - CRITICAL FIX:
- 🔴 **CRITICAL:** Fixed canvas reuse error when applying filters
- Added destroy checks to all 9 Chart.js render methods
- Completed Chart.js optimization from Sprint 2
- Dashboard now stable with multiple filter changes
- See `CORREÇÃO_CRITICA_FILTROS.md` for details

**Version 1.1.0 (2024-12-01)**:
- Fixed null check in `filters.js` preventing crashes on value changes
- Standardized field access patterns using `getCampoNormalizado()` utility
- Improved field normalization consistency across modules

See `CORREÇÕES_APLICADAS.md` for complete fix history.

## Version Information

- **Current Version**: 1.3.0
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
3. **Read-only**: Cannot modify data (by design)
4. **Real-time Calculations**: All billing calculations happen in browser
5. **Link Authentication**: Simple secret key in URL (vs Android app's user sessions)

---

**Developed for Engecom Engenharia / Encogel - Railway Maintenance Consortium**
