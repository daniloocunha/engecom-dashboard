# 📚 DOCUMENTAÇÃO MASTER — Controle de Campo (CalculadoraHH)
> **Versão App**: 5.0.0 (versionCode 16) | **Versão Dashboard**: 1.3.0 | **Última atualização**: 2026-03-23

---

## 📋 ÍNDICE

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Arquitetura Geral](#2-arquitetura-geral)
3. [App Android — Visão Completa](#3-app-android--visão-completa)
4. [Dashboard Web — Visão Completa](#4-dashboard-web--visão-completa)
5. [Google Sheets — Estrutura Completa](#5-google-sheets--estrutura-completa)
6. [Google Apps Script](#6-google-apps-script)
7. [Cloudflare Worker](#7-cloudflare-worker)
8. [Fórmulas e Regras de Negócio](#8-fórmulas-e-regras-de-negócio)
9. [Fluxo de Dados Completo](#9-fluxo-de-dados-completo)
10. [Configuração e Deploy](#10-configuração-e-deploy)
11. [Histórico Completo de Versões e Correções](#11-histórico-completo-de-versões-e-correções)

---

## 1. VISÃO GERAL DO SISTEMA

O **Controle de Campo** é um sistema completo para gerenciamento de manutenção ferroviária da **Engecom Engenharia / Encogel**. É composto por dois produtos principais integrados via Google Sheets:

### 1.1 Produto 1 — App Android "Controle de Campo"
- **Finalidade**: Registro de trabalho em campo (RDO — Relatório Diário de Obras)
- **Usuários**: Encarregados de turmas ferroviárias no campo
- **Plataforma**: Android 7.0+ (minSdk 24)
- **Tecnologia**: Kotlin, MVVM, SQLite, WorkManager, Google Sheets API

### 1.2 Produto 2 — Dashboard Web de Medição
- **Finalidade**: Análise de produtividade, cálculo de faturamento (medição) e acompanhamento
- **Usuários**: Gestores e administração da Engecom/Encogel
- **Plataforma**: Navegador web (HTML/CSS/JS puro, sem servidor)
- **Tecnologia**: JavaScript ES6+, Chart.js, Bootstrap 5, Google Sheets API

### 1.3 Integração
```
App Android → Google Sheets (7 abas) ← Dashboard Web
     ↑                                       ↑
  Registra RDOs                         Lê e calcula
  a cada 6h (sync)                      faturamento
```

### 1.4 Tipos de Turmas
| Código | Nome | Composição Padrão | Meta Diária |
|--------|------|-------------------|-------------|
| `TP-XXX` | Turma de Produção | 1 enc + 12 op | 72 HH |
| `TMC-XXX` | Turma de Manutenção | 1 enc + 6 op + 1 caminhão | Proporcional |
| `TS-XXX` | Turma de Solda | 1 enc + 1 soldador | 8 HH (soldador) |

### 1.5 Números Importantes
- **175+** serviços ferroviários com coeficientes cadastrados
- **7** abas no Google Sheets
- **30+** campos por RDO no banco de dados
- **9** gráficos no dashboard
- **3** tipos de cálculo de faturamento (TP/TMC/TS)

---

## 2. ARQUITETURA GERAL

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONTROLE DE CAMPO                           │
│                                                                  │
│  ┌──────────────────┐          ┌──────────────────────────────┐ │
│  │   APP ANDROID     │         │       DASHBOARD WEB          │ │
│  │                  │         │                              │ │
│  │  Kotlin + MVVM   │         │  HTML/CSS/JS (client-side)   │ │
│  │  SQLite (local)  │         │  Chart.js + Bootstrap 5      │ │
│  │  WorkManager     │         │  Link Auth                   │ │
│  └────────┬─────────┘         └──────────────┬───────────────┘ │
│           │ sync (6h)                         │ read-only        │
│           ▼                                   ▼                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   GOOGLE SHEETS                            │  │
│  │  ┌─────┐ ┌────────┐ ┌────┐ ┌────────┐ ┌────┐ ┌────────┐  │  │
│  │  │ RDO │ │Servicos│ │ HI │ │Efetivo │ │Mat.│ │Equip.  │  │  │
│  │  └─────┘ └────────┘ └────┘ └────────┘ └────┘ └────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐   │  │
│  │  │Transportes│ │ Config  │ │AuditoriaSync│ │GestaoOS  │   │  │
│  │  └──────────┘ └──────────┘ └────────────┘ └──────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│           ▲                                                       │
│           │ CRUD                                                  │
│  ┌────────┴─────────┐                                            │
│  │  GOOGLE APPS     │                                            │
│  │    SCRIPT        │                                            │
│  │  (proxy/ops)     │                                            │
│  └──────────────────┘                                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           CLOUDFLARE WORKER (Produção)                   │   │
│  │   Serve assets estáticos + Proxy reverso para AppsScript │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. APP ANDROID — VISÃO COMPLETA

### 3.1 Configuração Técnica

| Parâmetro | Valor |
|-----------|-------|
| **Package** | `com.example.calculadorahh` |
| **Display Name** | Controle de Campo |
| **versionCode** | 16 |
| **versionName** | 5.0.0 |
| **minSdk** | 24 (Android 7.0) |
| **targetSdk** | 34 (Android 14) |
| **compileSdk** | 35 (Android 15) |
| **JVM Target** | 17 |
| **Kotlin** | 2.0.21 |
| **AGP** | 8.13.1 |
| **Database Version** | 10 |

### 3.2 Estrutura de Pacotes

```
com.example.calculadorahh/
├── CalculadoraHHApplication.kt   ← Entry point, WorkManager setup
├── data/
│   ├── models/
│   │   ├── RDOData.kt            ← Modelo principal (Parcelable)
│   │   ├── RDODataCompleto.kt    ← Modelo estendido com sync fields
│   │   ├── Servico.kt            ← Serviço base (descricao + coeficiente)
│   │   ├── ServicoCalculado.kt   ← Serviço calculado (qtd × coef = horas)
│   │   ├── HICalculado.kt        ← Horas Improdutivas calculadas
│   │   ├── TransporteItem.kt     ← Item de transporte
│   │   ├── UpdateConfig.kt       ← Config de atualização do app
│   │   └── SyncStatus.kt         ← Enum: pending/syncing/synced/error
│   └── database/
│       ├── DatabaseHelper.kt     ← SQLite Singleton v10
│       └── DatabaseHelperExtensions.kt
├── domain/
│   └── managers/
│       ├── BaseItemManager.kt    ← Template Method abstrato
│       ├── ServicosManager.kt
│       ├── MateriaisManager.kt
│       ├── HIManager.kt
│       ├── TransportesManager.kt
│       ├── RDOValidator.kt       ← Validação pura (sem UI)
│       └── ModeloLoader.kt       ← Carrega modelo de RDO
├── services/
│   ├── GoogleSheetsService.kt    ← Facade
│   ├── SheetsConstants.kt        ← Headers e nomes de abas
│   ├── SheetsHeaderManager.kt    ← Gerencia headers das abas
│   ├── SheetsLookupHelper.kt     ← Busca de linhas por Número RDO
│   ├── SheetsRelatedDataManager.kt ← INSERT/DELETE dados relacionados
│   └── SheetsAuditService.kt     ← Log de auditoria
├── ui/
│   ├── activities/
│   │   ├── HomeActivity.kt       ← Launcher
│   │   ├── MainActivity.kt       ← ViewPager2 container
│   │   ├── HistoricoRDOActivity.kt
│   │   └── CalendarioRDOActivity.kt
│   ├── fragments/
│   │   ├── RDOFragment.kt        ← Formulário RDO (120+ campos)
│   │   └── CalculadoraHHFragment.kt
│   ├── adapters/
│   │   ├── ViewPagerAdapter.kt
│   │   ├── ServicosAdapter.kt
│   │   ├── HIsAdapter.kt
│   │   └── HistoricoRDOAdapter.kt
│   └── components/
│       └── SearchableSpinner.kt
├── viewmodels/
│   └── CalculadoraHHViewModel.kt ← Estado compartilhado com LiveData
├── workers/
│   ├── RDOSyncWorker.kt          ← Sync a cada 6h
│   └── DataCleanupWorker.kt      ← Limpeza semanal de dados órfãos
└── utils/
    ├── AppConstants.kt           ← Constantes centralizadas
    ├── AppLogger.kt              ← Logging com níveis
    ├── TimeValidator.kt          ← Validação de HH:MM (fonte única)
    ├── TimeInputMask.kt          ← Máscara de entrada HH:MM
    ├── KmInputMask.kt            ← Máscara de entrada KM
    ├── KmUtils.kt                ← Conversão "123+456" ↔ double
    ├── SyncHelper.kt             ← Orquestração de sync
    ├── ValidationHelper.kt
    ├── DateFormatter.kt
    ├── ErrorHandler.kt           ← Mensagens amigáveis ao usuário
    ├── IntentExtensions.kt
    ├── RDORelatorioUtil.kt
    ├── ServicosCache.kt          ← Singleton cache de servicos.json
    ├── UpdateChecker.kt          ← Verificação de nova versão
    └── UpdateDownloader.kt       ← Download + validação MD5 do APK
```

### 3.3 Database — Schema Completo (v10)

**Tabela `rdo`** — 30 colunas:

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INTEGER PK | Auto-increment local |
| `numero_rdo` | TEXT UNIQUE | `OS-DD.MM.YY-XXX` (ex: "998070-13.11.24-001") |
| `data` | TEXT | `DD/MM/YYYY` |
| `codigo_turma` | TEXT | Código da turma (TP-XXX, TMC-XXX, TS-XXX) |
| `encarregado` | TEXT | Nome do encarregado |
| `local` | TEXT | Local do serviço |
| `numero_os` | TEXT | Número da Ordem de Serviço |
| `status_os` | TEXT | Status da OS |
| `km_inicio` | TEXT | KM inicial no formato "123+456" |
| `km_fim` | TEXT | KM final no formato "123+456" |
| `horario_inicio` | TEXT | `HH:MM` |
| `horario_fim` | TEXT | `HH:MM` |
| `clima` | TEXT | Condição climática |
| `tema_dds` | TEXT | Tema do Diálogo Diário de Segurança |
| `houve_servico` | TEXT | "Sim" ou "Não" |
| `causa_nao_servico` | TEXT | "RUMO", "ENGECOM" ou "" |
| `servicos` | TEXT | JSON array de ServicoRDO |
| `materiais` | TEXT | JSON array de MaterialRDO |
| `efetivo` | TEXT | JSON de Efetivo |
| `equipamentos` | TEXT | JSON array de Equipamento |
| `hi_itens` | TEXT | JSON array de HIItem |
| `transportes` | TEXT | JSON array de TransporteItem |
| `nome_colaboradores` | TEXT | Nomes separados por vírgula |
| `observacoes` | TEXT | Observações livres |
| `sincronizado` | INTEGER | 0=pendente, 1=sincronizado |
| `sync_status` | TEXT | Enum SyncStatus |
| `ultima_tentativa_sync` | TEXT | ISO timestamp |
| `mensagem_erro_sync` | TEXT | Último erro de sync |
| `tentativas_sync` | INTEGER | Contador de tentativas |
| `versao_app` | TEXT | Versão do app que criou o RDO |

**Índices para performance:**
- `idx_rdo_data` — busca por data
- `idx_rdo_numero_os` — busca por OS
- `idx_rdo_sincronizado` — busca de pendentes
- `idx_rdo_numero_rdo` UNIQUE — previne duplicatas

**Histórico de Migrações:**
| Versão | Mudança |
|--------|---------|
| v1 | Schema inicial (campos básicos) |
| v2 | horario_inicio/fim, tema_dds, efetivo, equipamentos, hi_itens |
| v3 | numero_rdo com geração automática |
| v4 | houve_transporte, transportes JSON |
| v5 | nome_colaboradores |
| v6 | sincronizado flag |
| v7 | Índices de performance (data, numero_os, sincronizado, numero_rdo) |
| v8 | UNIQUE index em numero_rdo + retry logic |
| v9 | sync_status, ultima_tentativa_sync, mensagem_erro_sync, tentativas_sync, versao_app |
| v10 | causa_nao_servico TEXT DEFAULT '' |

### 3.4 Geração de Número RDO

Formato: `OS-DD.MM.YY-XXX`

Exemplo: `998070-13.11.24-001`

Regras:
- `OS` = número da OS (ex: 998070)
- `DD.MM.YY` = data do RDO (ex: 13.11.24)
- `XXX` = contador sequencial por OS+data, começa em 001
- Se já existe `001`, tenta `002`, etc. (retry logic com backoff exponencial)
- UNIQUE constraint no banco previne duplicatas

### 3.5 Modelos de Dados

**RDOData** (Parcelable):
```kotlin
data class RDOData(
    val codigoTurma: String,
    val encarregado: String,
    val local: String,
    val data: String,
    val numeroOS: String,
    val statusOS: String,
    val kmInicio: String,
    val kmFim: String,
    val horarioInicio: String,
    val horarioFim: String,
    val clima: String,
    val temaDDS: String,
    val houvServico: String,
    val causaNaoServico: String,      // "RUMO", "ENGECOM" ou ""
    val servicos: List<ServicoRDO>,
    val materiais: List<MaterialRDO>,
    val efetivo: Efetivo,
    val equipamentos: List<Equipamento>,
    val hiItens: List<HIItem>,
    val transportes: List<TransporteItem>,
    val nomeColaboradores: String,
    val observacoes: String
)
```

**Efetivo**:
```kotlin
data class Efetivo(
    val encarregado: Int,
    val operadores: Int,
    val operadorEGP: Int,
    val tecnicoSeguranca: Int,
    val soldador: Int,
    val motoristas: Int
)
```

**HIItem** (Horas Improdutivas):
```kotlin
data class HIItem(
    val tipoHI: String,           // "Chuva" ou "RUMO"
    val descricao: String,
    val horaInicio: String,       // "HH:MM"
    val horaFim: String,          // "HH:MM"
    val colaboradores: Int        // default: 12
)
```

### 3.6 ViewModel — CalculadoraHHViewModel

Gerencia o estado da aba Calculadora HH:

```kotlin
// LiveData expostos
val servicosBase: LiveData<List<Servico>>       // 175 serviços do JSON
val servicosAdicionados: LiveData<List<ServicoCalculado>>
val hisAdicionados: LiveData<List<HICalculado>>
val totalHoras: LiveData<Double>                 // Soma de HH
val horasFaltantes: LiveData<Double>             // META - totalHoras
val erro: LiveData<String?>

// Constante
val META_HORAS_DIARIAS = 72.0    // 12 op × 6h
```

**Fórmula de cálculo:**
```kotlin
horas = quantidade × coeficiente
totalHH = Σ(horas de todos os serviços) + Σ(HH improdutivas)
```

### 3.7 Categorias de HI e Regras

| Categoria | Regra |
|-----------|-------|
| **Chuva** | `HH = (duração × operadores) ÷ 2` |
| **RUMO** | `HH = duração × operadores` (trens, aguardando, etc.) |

Suporte a período noturno: `23:00 → 02:00 = 3h` (não -21h)

### 3.8 Sincronização com Google Sheets

**RDOSyncWorker** (WorkManager — a cada 6 horas):
1. Verifica conectividade de rede
2. Busca RDOs com `sincronizado = 0` (pendentes)
3. Para cada RDO:
   a. Inicializa `GoogleSheetsService`
   b. Verifica se RDO já existe na planilha (por `Número RDO`)
   c. Se não existe: `INSERT` em RDO + todas as abas relacionadas
   d. Se existe: `UPDATE` (deleta dados antigos, insere novos)
   e. Loga operação em `AuditoriaSync`
   f. Marca como `sincronizado = 1` no banco local
4. Exibe notificação com resultado
5. Verifica disponibilidade de nova versão do app (não bloqueante)

**Proteção contra conflito multi-device:**
- Identificador primário: `Número RDO` (globalmente único)
- Formato: `OS-DD.MM.YY-XXX` garante unicidade entre dispositivos
- Proteção de versão: apps antigas não podem deletar dados de apps novas

**DataCleanupWorker** (WorkManager — semanal):
1. Obtém lista de `Número RDO` válidos (não deletados) do Sheets
2. Para cada aba relacionada (Servicos, Materiais, Efetivo, Equipamentos, HI, Transportes):
   a. Lê todas as linhas
   b. Identifica linhas órfãs (sem RDO pai válido)
   c. Deleta linhas órfãs
3. Log silencioso (notificação PRIORITY_LOW)

### 3.9 Auto-Update System

**Fluxo:**
1. `RDOSyncWorker` chama `verificarAtualizacao()` após cada sync
2. Lê aba `Config` no Sheets:
   - `versao_minima`: se app < mínimo → força update (bloqueia uso)
   - `versao_recomendada`: se app < recomendada → sugere update
   - `url_download`: URL do APK
   - `hash_md5`: hash para validação
   - `forcar_update`: "SIM" força mesmo que versão >= mínima
3. Se atualização disponível:
   a. Mostra dialog com changelog
   b. Usuário confirma
   c. `UpdateDownloader` baixa APK (com progress notification)
   d. Valida MD5 do arquivo baixado
   e. Inicia instalação via `REQUEST_INSTALL_PACKAGES`

### 3.10 Google Sheets Service — Facade Pattern

```
GoogleSheetsService (Facade)
├── SheetsConstants        ← Headers centralizados, nomes das abas
├── SheetsHeaderManager    ← Cria/atualiza headers com versionamento
├── SheetsLookupHelper     ← Busca linha por Número RDO (coluna B)
├── SheetsRelatedDataManager ← BUILD/INSERT/DELETE dados relacionados
└── SheetsAuditService     ← Log em AuditoriaSync + limpeza de órfãos
```

**Estrutura da linha RDO (22-23 colunas):**

| Col | Campo |
|-----|-------|
| A | ID (local, para compatibilidade) |
| B | Número RDO |
| C | Data |
| D | Código Turma |
| E | Encarregado |
| F | Local |
| G | Número OS |
| H | Status OS |
| I | KM Início |
| J | KM Fim |
| K | Horário Início |
| L | Horário Fim |
| M | Clima |
| N | Tema DDS |
| O | Houve Serviço |
| P | Causa Não Serviço |
| Q | Houve Transporte |
| R | Nome Colaboradores |
| S | Observações |
| T | Deletado |
| U | Data Sincronização |
| V | Data Criação |
| W | Versão App |

---

## 4. DASHBOARD WEB — VISÃO COMPLETA

### 4.1 Estrutura de Arquivos

```
dashboard/
├── index.html                    ← SPA única (Bootstrap 5)
├── servicos.json                 ← GERADO (sync-servicos.js)
├── css/
│   ├── dashboard.css             ← Estilos principais
│   └── minimal-view.css          ← Modo minimalista
└── js/
    ├── config.js                 ← ⚠️ SEGREDO (não commitado)
    ├── config.example.js         ← Template público
    ├── auth.js                   ← Autenticação por link secreto
    ├── safe-html.js              ← escapeHtml(), mostrarToast()
    ├── field-helper.js           ← FieldHelper (normalização)
    ├── filters.js                ← Gerenciamento de filtros
    ├── sheets-api.js             ← GoogleSheetsAPI
    ├── calculations.js           ← CalculadoraMedicao
    ├── charts.js                 ← 9 gráficos Chart.js
    ├── main.js                   ← DashboardMain (orquestrador)
    ├── alerts-system.js          ← AlertsSystem
    ├── analise-tmc.js            ← AnaliseTMC
    ├── calendario-tp.js          ← CalendarioTP
    ├── calendario-ts.js          ← CalendarioTS
    ├── gestao-os.js              ← GestaoOS (sync 3 camadas)
    ├── os-auditoria.js           ← Auditoria de O.S suspeitas
    ├── period-comparison.js      ← Comparação de períodos
    ├── export.js                 ← Exportação CSV/Excel
    ├── export-helper.js          ← Helpers de exportação
    ├── view-manager.js           ← Clássico vs Minimalista
    └── servicos-data.js          ← GERADO (fallback CORS)
```

### 4.2 Autenticação

**Método**: Link secreto na URL (`?key=CHAVE_SECRETA`)

**Fluxo:**
1. Página carrega → `auth.js` verifica `?key` na URL
2. Compara com `CONFIG.SECRET_KEY` em `config.js`
3. Se válido: salva no `sessionStorage`, limpa URL (remove `?key=...`)
4. Se inválido: mostra tela de erro com contador de tentativas
5. Após 3 tentativas falhas: bloqueia por 15 minutos
6. Sessão persiste até fechar a aba

### 4.3 Carregamento de Dados — GoogleSheetsAPI

**Abas carregadas em paralelo:**
```javascript
Promise.all([
    carregarAba(SHEETS.RDO),
    carregarAba(SHEETS.SERVICOS),
    carregarAba(SHEETS.HI),
    carregarAba(SHEETS.EFETIVO),
    carregarAba(SHEETS.EQUIPAMENTOS),
    carregarAba(SHEETS.MATERIAIS),
    carregarAba(SHEETS.TRANSPORTES)
])
```

**Cache inteligente:**
- Duração: 5 minutos
- Scope: por aba + range
- Fallback: retorna cache expirado se API falhar
- Indicador visual quando cache está desatualizado

**Enriquecimento de serviços:**
- Cada serviço da planilha tem descrição mas não coeficiente
- Coeficiente é buscado em `servicos.json` por normalização agressiva:
  - Remove acentos, pontuação, espaços extras, converte para minúsculas
  - Se serviço `É Customizado? = SIM` → usa campo `HH Manual` como coeficiente
  - Se customizado sem `HH Manual` → coeficiente = 0, gera alerta

**Validação de Número OS:**
- Aceita: 6 dígitos começando com 98 ou 99 (ex: 998070, 986123)
- Aceita: 7 dígitos começando com 1 (ex: 1234567)
- Aceita: múltiplos separados por "/" (ex: "998070/998071")
- Rejeita: outros formatos → gera alerta de O.S suspeita

### 4.4 FieldHelper — Normalização de Campos

Resolve inconsistência entre nomes originais e normalizados do Sheets:

```javascript
FieldHelper.getRDOData(rdo)        // "Data" | "data" | "Data RDO"
FieldHelper.getRDONumeroRDO(rdo)   // "Número RDO" | "numeroRDO"
FieldHelper.getRDOCodigoTurma(rdo) // "Código Turma" | "codigoTurma"
FieldHelper.parseData("15/01/2025")   // → {dia:15, mes:1, ano:2025}
FieldHelper.parseData("2025-01-15")   // → {dia:15, mes:1, ano:2025} (ISO)
FieldHelper.normalizarData("2025-01-15") // → "15/01/2025"
FieldHelper.estaAtivo(rdo)         // Deletado !== "Sim"
FieldHelper.rdoNoPeriodo(rdo, 1, 2025) // período + não deletado
```

### 4.5 CalculadoraMedicao — Índices e Cache

**Índices construídos na inicialização:**
```javascript
indices = {
    servicosPorRDO: Map<numeroRDO, Servico[]>,    // O(1)
    hiPorRDO:       Map<numeroRDO, HI[]>,          // O(1)
    efetivosPorRDO: Map<numeroRDO, Efetivo>,       // O(1)
    rdosPorTurma:   Map<codigoTurma, RDO[]>,       // O(1)
    turmasUnicas:   Set<codigoTurma>
}
```

**Cache de cálculos:**
- Map com chave `tipo-mes-ano` (ex: `estatisticas-1-2025`)
- Evita recalcular ao trocar filtros sem mudar período

### 4.6 Módulos do Dashboard

**main.js (DashboardMain)** — orquestrador:
- `inicializar()`: carrega dados → filtros → cálculos → renderiza
- `aplicarFiltros()`: recalcula e re-renderiza ao mudar filtros
- `atualizarKPIs()`: 5 cards (Total RDOs, Total HH, Faturamento, SLA médio, Efetivo)
- `renderizarDashboard()`: coordena todos os módulos
- `_atualizarAvisoPeriodoVazio()`: banner quando não há dados
- `_atualizarAvisoPeriodoFuturo()`: banner para meses futuros

**alerts-system.js (AlertsSystem)**:
- Thresholds: SLA_CRITICO < 70%, SLA_ALERTA < 80%, SLA_OK ≥ 96%
- `analisarEstatisticas()`: gera alertas automáticos após cada cálculo
- Tipos: SLA crítico, SLA alerta, SLA excelente, HH baixo, TMC com poucos dias
- Dados da aba Alertas escapados com `escapeHtml()` contra XSS

**analise-tmc.js (AnaliseTMC)**:
- Extrai turmas TMC do período
- Calcula médias de efetivo, motoristas, horas extras
- Detecta hora extra: 17h–19h = 50%, após 19h = 100%
- Renderiza cards por TMC

**calendario-tp.js (CalendarioTP)**:
- Calendário mensal grid 7×6
- Código de cor por dia: verde ≥ meta, amarelo 80–99%, vermelho < 80%
- Algoritmo merge de HI: mescla sobreposições antes de calcular
- Modal interativo por dia: serviços, HI, efetivo, observações, KM

**calendario-ts.js (CalendarioTS)**:
- Similar ao TP mas focado em HH do soldador
- Meta: 8 HH/dia (1 soldador × 8h)
- Flag `overlap` sinaliza HIs sobrepostas

**gestao-os.js (GestaoOS)**:
- Gerenciamento de O.S com status, notas múltiplas, anexos
- 6 status: "Aprovada", "Finalizada", "Em Progresso", "Reprovada", "Aguardando Auditoria", "Erro de preenchimento"
- GE/Via: "Pendente", "Parcial", "Lançado"
- Sync em 3 camadas: Apps Script → localStorage → Planilha
- Upload de anexos (PDF/foto) para Google Drive (máx 5MB)
- Debounce 600ms para evitar burst de requests
- LockService para prevenir linhas duplicadas

**os-auditoria.js (OSAuditoria)**:
- Identifica O.S suspeitas nos RDOs carregados
- Valida padrão: `98XXXX`, `99XXXX` ou `1XXXXXXX`
- Exibe modal com lista de O.S irregulares

**period-comparison.js (PeriodComparison)**:
- Compara dois períodos (mês a mês)
- Calcula variação em HH, SLA, faturamento
- Exibe em tabela comparativa

### 4.7 Gráficos Chart.js (9 gráficos)

| ID | Tipo | Dados |
|----|------|-------|
| `chartEvolucao` | Line | Evolução do faturamento por mês |
| `chartDistribuicao` | Doughnut | Divisão Engecom/Encogel |
| `chartRanking` | Bar | Ranking de faturamento por turma |
| `chartHHComparacao` | Bar | HH produtivo vs improdutivo por TP |
| `chartSLAGauge` | Doughnut | Gauge médio de SLA |
| `chartTMCsComparacao` | Bar | Comparação entre TMCs |
| `chartMediaEfetivo` | Bar | Média de efetivo por tipo |
| `chartHHServicos` | Bar | HH por categoria de serviço |
| `chartHeatmapEvolucao` | Line | Evolução HH diária |

**Destruição correta:** todos os 9 métodos de render verificam `if (this.charts.X) this.charts.X.destroy()` antes de criar novo.

### 4.8 Heatmap CSS

```css
.heatmap-day.verde     { background: #4CAF50; }  /* ≥ 100% meta */
.heatmap-day.amarelo   { background: #FFC107; }  /* 80–99% meta */
.heatmap-day.vermelho  { background: #f44336; }  /* < 80% meta */
```

Tooltip em hover com HH do dia e percentual da meta.

---

## 5. GOOGLE SHEETS — ESTRUTURA COMPLETA

**Planilha ID**: `1wHFUIQ8uRplRBNSV6TEyatR7_ilURZTC0qXWhubb1Fs`

### Aba: RDO (23 colunas)
```
A  ID
B  Número RDO         ← Chave primária global
C  Data
D  Código Turma
E  Encarregado
F  Local
G  Número OS
H  Status OS
I  KM Início
J  KM Fim
K  Horário Início
L  Horário Fim
M  Clima
N  Tema DDS
O  Houve Serviço
P  Causa Não Serviço  ← v3.0.0
Q  Houve Transporte
R  Nome Colaboradores
S  Observações
T  Deletado           ← "Sim" para deletados (soft delete)
U  Data Sincronização
V  Data Criação
W  Versão App
```

### Aba: Servicos
```
A  Número RDO
B  Número OS
C  Data RDO
D  Código Turma
E  Encarregado
F  Descrição
G  Quantidade
H  Unidade
I  É Customizado?     ← "SIM" ou "NAO"
J  HH Manual          ← Usado quando É Customizado? = SIM
```

### Aba: HorasImprodutivas
```
A  Número RDO
B  Número OS
C  Data RDO
D  Código Turma
E  Encarregado
F  Tipo              ← "Chuva" ou "RUMO"
G  Descrição
H  Hora Início
I  Hora Fim
J  Operadores        ← Quantidade para cálculo de HH
```

### Aba: Efetivo
```
A  Número RDO
B  Número OS
C  Data RDO
D  Código Turma
E  Encarregado (nome)
F  Encarregado Qtd
G  Operadores
H  Operador EGP
I  Técnico Segurança
J  Soldador
K  Motoristas
```

### Aba: Equipamentos
```
A  Número RDO
B  Número OS
C  Data RDO
D  Código Turma
E  Encarregado
F  Tipo
G  Placa
```

### Aba: Materiais
```
A  Número RDO
B  Número OS
C  Data RDO
D  Código Turma
E  Encarregado
F  Descrição
G  Quantidade
H  Unidade
```

### Aba: Transportes / TransporteSucatas
```
A  Número RDO
B  Número OS
C  Data RDO
D  Código Turma
E  Encarregado
F  Colaboradores
G  Horário Início
H  Horário Fim
I  KM Início
J  KM Fim
K  Veículo
L  Motorista
```

### Aba: Config
```
versao_minima       ← App bloqueia se abaixo
versao_recomendada  ← App sugere atualização se abaixo
hash_md5            ← Hash do APK para validação
tamanho_apk_mb      ← Tamanho estimado
url_download        ← URL direto do APK
forcar_update       ← "SIM" ou "NAO"
mensagem_aviso      ← Texto da sugestão de update
mensagem_bloqueio   ← Texto do bloqueio forçado
```

### Aba: AuditoriaSync
```
Timestamp           ← ISO 8601
Número RDO
Ação                ← INSERT | UPDATE | DELETE | ERROR
Versão App
Device ID
Detalhes
Status
```

### Aba: GestaoOS
```
Número OS
Status              ← 6 opções
GE/Via              ← Pendente | Parcial | Lançado
Já Mediu            ← Sim | Não
Notas               ← JSON array
Anexos              ← JSON array de URLs Drive
Data Atualização
```

---

## 6. GOOGLE APPS SCRIPT

**Arquivo**: `apps-script-atualizar-os.gs`

Funciona como backend para operações de escrita que o dashboard não pode fazer diretamente via API pública do Sheets.

### Ações Suportadas (via POST)

| Ação | Descrição |
|------|-----------|
| `atualizarOS` | Localiza RDO e atualiza coluna Número OS |
| `listarGestaoOS` | Lê aba GestaoOS, retorna JSON indexado por OS |
| `salvarGestaoOS` | INSERT/UPDATE na aba GestaoOS (com LockService) |
| `uploadAnexo` | Recebe base64, salva no Drive, retorna URL pública |
| `deletarAnexo` | Move arquivo para lixeira, remove linha de AnexosOS |
| `atualizarOSCascata` | Substitui OS antiga → nova em todas as 7 abas |
| `dividirOS` | Clona RDO com serviços/HI específicos para nova OS |

### Helpers do Apps Script
- `_obterOuCriarAbaGestaoOS()` — inicializa aba com headers formatados
- `_findCol()` / `_findColSafe()` — busca coluna por nome
- `_resposta()` — serializa resposta JSON
- LockService nativo do Apps Script para concorrência
- Retry exponencial: 3s → 6s → 9s em caso de falha

### URL do Deploy
Configurada em:
- `wrangler.jsonc` → variável `APPS_SCRIPT_URL`
- `dashboard/js/config.js` → `CONFIG.APPS_SCRIPT_URL`

Em produção, o Cloudflare Worker faz proxy em `/api/apps-script` para evitar CORS.

---

## 7. CLOUDFLARE WORKER

**Arquivo**: `src/worker.js`
**Configuração**: `wrangler.jsonc`

```json
{
  "name": "engecom-dashboard",
  "main": "src/worker.js",
  "compatibility_date": "2026-02-20",
  "assets": { "directory": "./dashboard" },
  "vars": {
    "APPS_SCRIPT_URL": "https://script.google.com/macros/s/.../exec"
  }
}
```

**Responsabilidades:**
1. Serve arquivos estáticos do diretório `./dashboard` (HTML, CSS, JS)
2. Proxy reverso: `GET/POST /api/apps-script` → `APPS_SCRIPT_URL`
   - Resolve problema de CORS do Apps Script
   - Repassa headers, body e parâmetros corretamente

**Deploy**: `wrangler deploy` no diretório raiz

**Desenvolvimento local**: `wrangler dev` (porta 8787)

---

## 8. FÓRMULAS E REGRAS DE NEGÓCIO

### 8.1 Tabela de Preços (config.js)

**ENGECOM** (mão de obra):
| Item | Valor/mês |
|------|-----------|
| Encarregado | R$ 26.488,37 |
| Operador | R$ 14.584,80 |
| Soldador | R$ 30.749,83 |
| HH Improdutiva | R$ 74,58/HH |
| KM Excedente | R$ 40,73/km |

**ENCOGEL** (equipamentos):
| Item | Valor/mês |
|------|-----------|
| Caminhão Munck (TP) | R$ 54.870,19 |
| Micro-ônibus (TP) | R$ 43.246,76 |
| Mini Escavadeira (TP) | R$ 51.462,78 |
| Caminhão Cabinado (TMC) | R$ 43.248,34 |

### 8.2 Cálculo de HH de Serviços

```
HH_servico = quantidade × coeficiente
HH_total_servicos = Σ(HH_servico para todos os serviços)
```

Exemplos de coeficientes:
- Substituição Dormente: 0,81 HH/unidade
- Correção da Bitola: 0,25 HH/unidade
- Nivelamento Contínuo: 0,64 HH/unidade
- Serviço Customizado: coeficiente = HH Manual (campo do app)

### 8.3 Cálculo de HH Improdutivas

```javascript
duração = horaFim - horaInicio   // suporte a período noturno
HH_bruto = duração × operadores

if (tipo === "Chuva")           HH = HH_bruto / 2
if (tipo === "RUMO")            HH = HH_bruto
if (tipo contém "trem" && duração < 15min)  HH = 0
```

**Algoritmo de merge de sobreposições** (evita dupla-contagem):
1. Ordena HIs por hora início
2. Verifica sobreposição com próximo evento
3. Mescla intervalos sobrepostos, mantendo máximo de operadores
4. Aplica regras de cálculo sobre intervalos mesclados

### 8.4 Cálculo de Faturamento TP

```javascript
// Meta mensal
operadoresPadrao = 12
HH_por_operador_dia = 6
metaDiaria = 12 × 6 = 72 HH
metaMensal = 72 × diasUteis

// HH Total
hhTotal = hhServicos + hhImprodutivas

// SLA (limitado a 110%)
percentualSLA = Math.min(hhTotal / metaMensal, 1.10)

// Valor fixo mensal (independe do SLA)
valorFixo_Engecom = (1 × ENCARREGADO_MES) + (12 × OPERADOR_MES)
valorFixo_Encogel = CAMINHAO_MUNCK_MES + MICRO_ONIBUS_MES + MINI_ESCAVADEIRA_MES

// Faturamento
faturamento_Engecom = valorFixo_Engecom × percentualSLA
faturamento_Encogel = valorFixo_Encogel × percentualSLA
faturamento_Total = faturamento_Engecom + faturamento_Encogel
```

### 8.5 Cálculo de Faturamento TMC

```javascript
// Dias trabalhados
diasTrabalhados = contarDiasUnicos(rdosTurma)
diasUteis = getDiasUteis(mes, ano)

// Médias
mediaEncarregado = diasTrabalhados / diasUteis
mediaOperadores = Σ(operadores_dia) / diasUteis
mediaCaminhao = diasTrabalhados / diasUteis   // presença do caminhão

// Faturamento
faturamento_Engecom = (mediaEncarregado × ENCARREGADO_MES)
                    + (mediaOperadores × OPERADOR_MES)
faturamento_Encogel = mediaCaminhao × CAMINHAO_CABINADO_MES
faturamento_Total = faturamento_Engecom + faturamento_Encogel
```

### 8.6 Cálculo de Faturamento TS

```javascript
// Meta mensal (apenas soldador)
metaDiaria = 1 × 8 = 8 HH
metaMensal = 8 × diasUteis

// HH do soldador (apenas serviços executados por soldador)
hhSoldador = Σ(quantidade × coeficiente dos serviços de solda)

// SLA (limitado a 110%)
percentualSLA = Math.min(hhSoldador / metaMensal, 1.10)

// Faturamento
faturamento_Total = valorFixoTS × percentualSLA
```

### 8.7 Dias Úteis

Considera:
- Exclui sábados e domingos
- Exclui feriados nacionais fixos: Ano Novo, Tiradentes, Trabalho, Independência, N.Sra.Aparecida, Finados, Proclamação, Natal
- Exclui feriados móveis: Páscoa, Sexta-feira Santa, Carnaval (2 dias), Corpus Christi

Algoritmo de Meeus/Jones/Butcher para cálculo da Páscoa.

### 8.8 Thresholds de Desempenho

| Percentual SLA | Status | Cor |
|----------------|--------|-----|
| ≥ 100% | Excelente | Verde |
| 80–99% | Atenção | Amarelo |
| < 80% | Crítico | Vermelho |

---

## 9. FLUXO DE DADOS COMPLETO

### 9.1 Criação de RDO (App)

```
Usuário preenche formulário (RDOFragment)
    ↓ RDOValidator.validar()
    ↓ RDOData criado
    ↓ DatabaseHelper.inserirRDO()
      ↓ Gera numero_rdo (OS-DD.MM.YY-XXX)
      ↓ INSERT com UNIQUE check
      ↓ Retry se número já existe
    ↓ RDO salvo no SQLite (sincronizado=0)
    ↓ WorkManager agenda sync (se rede disponível)
```

### 9.2 Sincronização (App → Sheets)

```
WorkManager dispara RDOSyncWorker (a cada 6h)
    ↓ SyncHelper.isNetworkAvailable()
    ↓ DatabaseHelper.buscarPendentes()
    ↓ Para cada RDO pendente:
        ↓ GoogleSheetsService.syncRDO(rdo)
            ↓ SheetsLookupHelper.verificarSeRDOExiste(numeroRDO)
            ↓ Se existe: SheetsRelatedDataManager.deleteRelatedData()
                ↓ SheetsAuditService.getRDOAppVersion() → proteção
            ↓ SheetsRelatedDataManager.insertRelatedData()
                ↓ Insere em: RDO, Servicos, Materiais, Efetivo, HI, Transportes, Equipamentos
            ↓ SheetsAuditService.logSyncAction(INSERT/UPDATE)
        ↓ DatabaseHelper.marcarComoSincronizado(id)
    ↓ Notificação de resultado
```

### 9.3 Leitura no Dashboard

```
Usuário acessa URL com ?key=SECRETO
    ↓ auth.js valida chave
    ↓ DashboardMain.inicializar()
        ↓ GoogleSheetsAPI.carregarTodosDados()
            ↓ 7 requests paralelos para Sheets API
            ↓ Converte arrays 2D para objetos
            ↓ Normaliza nomes de campo
            ↓ Enriquece serviços com coeficientes
        ↓ CalculadoraMedicao.carregarDados()
            ↓ construirIndices() → 4 Maps O(1)
        ↓ calcularEstatisticasConsolidadas(mes, ano)
            ↓ Para cada turma:
                ↓ filtrarRDOsPorTurma() → exclui deletados + ISO ok
                ↓ calcularMedicaoTP/TMC/TS()
        ↓ Renderiza: KPIs, gráficos, tabelas, heatmap, calendários, alertas
```

### 9.4 Gestão de O.S (Apps Script)

```
GestaoOS.setStatus(os, status)
    ↓ Debounce 600ms
    ↓ GestaoOS._salvarNoServidor()
        ↓ POST /api/apps-script?action=salvarGestaoOS
            ↓ Cloudflare Worker proxy
                ↓ Apps Script: LockService.getScriptLock()
                    ↓ Busca linha por OS
                    ↓ Se existe: UPDATE
                    ↓ Se não: INSERT
                    ↓ LockService.releaseLock()
        ↓ Se falha: localStorage fallback
            ↓ Na próxima carga: migrar localStorage → servidor
```

---

## 10. CONFIGURAÇÃO E DEPLOY

### 10.1 Configuração do Dashboard

**Copiar template:**
```bash
cd C:\Users\dan\CalculadoraHH\dashboard\js
cp config.example.js config.js
```

**Editar `config.js`:**
```javascript
const CONFIG = {
    SPREADSHEET_ID: 'ID_DA_PLANILHA',
    API_KEY: 'CHAVE_API_GOOGLE',
    SECRET_KEY: 'CHAVE_SECRETA_FORTE',
    APPS_SCRIPT_URL: 'URL_DO_APPS_SCRIPT',
    // ...preços e metas
};
```

### 10.2 Sincronização de Serviços

**Sempre que editar `app/src/main/res/raw/servicos.json`:**
```bash
cd C:\Users\dan\CalculadoraHH
npm run sync-servicos
# Gera: dashboard/servicos.json
# Gera: dashboard/js/servicos-data.js
```

**Commitar os 3 arquivos juntos:**
```bash
git add app/src/main/res/raw/servicos.json
git add dashboard/servicos.json
git add dashboard/js/servicos-data.js
git commit -m "feat(servicos): adicionar/atualizar serviço XYZ"
```

### 10.3 Servidor de Desenvolvimento

```bash
# Python (recomendado)
cd C:\Users\dan\CalculadoraHH\dashboard
python -m http.server 8000
# Acesso: http://localhost:8000/?key=CHAVE_SECRETA

# Cloudflare Worker (local)
cd C:\Users\dan\CalculadoraHH
wrangler dev    # porta 8787
```

### 10.4 Build e Release do App

```bash
cd C:\Users\dan\CalculadoraHH

# Build release
./gradlew assembleRelease

# APK gerado em:
# app/release/app-release.apk
```

**Keystore:**
- Local: `app/calculadorahh-release.keystore`
- Alias: `controledecampo`
- Válido até: 31/03/2053

**Configuração para release no Google Sheets (aba Config):**
```
versao_minima       | 15
versao_recomendada  | 15
hash_md5            | <md5 do APK>
tamanho_apk_mb      | 3.x
url_download        | <URL do APK>
forcar_update       | NAO
mensagem_aviso      | Nova versão X.X.X disponível!
```

### 10.5 Deploy no Cloudflare

```bash
cd C:\Users\dan\CalculadoraHH
wrangler deploy
```

---

## 11. HISTÓRICO COMPLETO DE VERSÕES E CORREÇÕES

### 11.1 App Android

---

#### v5.0.0 (versionCode 16) — 2026-03-23
**Correção Massiva de Bugs de Sincronização e Integridade de Dados**

Auditoria completa de todo o fluxo App → Sheets → Dashboard identificou e corrigiu 31 bugs (8 críticos, 8 altos, 15 médios) em 17 arquivos.

**Correções no App Android:**

1. **[CRÍTICO] Data Criação corrompida em toda atualização de RDO**
   - `updateRDOInSheet()` lia coluna V (Versão App) ao invés de U (Data Criação)
   - Resultado: data de criação era substituída por "16" (versionCode) em toda atualização
   - Arquivo: `GoogleSheetsService.kt:184`

2. **[ALTO] Proteção de versão causava dados duplicados**
   - Quando versão do app < versão do RDO, o delete era ignorado silenciosamente mas o insert executava
   - Resultado: dados relacionados duplicados no Sheets
   - Correção: `return` → `throw Exception` para abortar toda a operação
   - Arquivo: `SheetsRelatedDataManager.kt:190`

3. **[MÉDIO] Formato de data incomparável no SQLite**
   - `resetarRDOsPresos()` comparava timestamps `dd/MM/yyyy HH:mm:ss` lexicograficamente
   - Formato não-ordenável causava falhas na detecção de RDOs travados
   - Correção: todos os timestamps internos migrados para formato ISO `yyyy-MM-dd HH:mm:ss`
   - Arquivo: `DatabaseHelper.kt` (4 ocorrências)

4. **[MÉDIO] RDOs em ERROR retentados infinitamente**
   - Sem limite máximo de tentativas — RDOs corrompidos gastavam quota API a cada 6h
   - Correção: limite de 10 tentativas para status ERROR
   - Arquivo: `DatabaseHelper.kt:988`

**Correções no Dashboard:**

5. **[CRÍTICO] Cache mutado ao filtrar por turma**
   - `calcularEstatisticasConsolidadas()` retornava referência ao cache
   - `main.js` filtrava o array **mutando o cache** permanentemente
   - Correção: deep-clone antes de filtrar
   - Arquivo: `main.js:316-324`

6. **[CRÍTICO] Algoritmo de merge de HI com operadores diferentes overcountava HH**
   - `Math.max(operadores)` aplicado ao intervalo inteiro quando sobreposições tinham operadores diferentes
   - Correção: algoritmo sweep-line com breakpoints para segmentos precisos
   - Arquivos: `calculations.js`, `calendario-tp.js`, `calendario-ts.js`

7. **[MÉDIO] KPI "Total de RDOs" ignorava filtros de turma/tipo**
   - Correção: aplica mesmos filtros do período
   - Arquivo: `main.js:414-428`

8. **[MÉDIO] `calcularMediaEfetivo` faltando Operador EGP e Técnico Segurança**
   - Correção: inclui os dois campos na soma
   - Arquivo: `calculations.js:290-295`

9. **[MÉDIO] Datas ISO 8601 não normalizadas**
   - Criado `FieldHelper.normalizarData()` que converte ISO → DD/MM/YYYY
   - Aplicado em: `calcularHHPorDia`, `contarDiasUnicos`, `filtrarRDOsPorTurma`
   - Arquivos: `field-helper.js`, `calculations.js`

10. **[MÉDIO] Heatmap ordenava dias como string (DD/MM/YYYY)**
    - Correção: sort por data parseada
    - Arquivo: `calculations.js:764`

11. **[MÉDIO] `analisarEstatisticas()` apagava alertas de dados**
    - Correção: preserva alertas com `source === 'dados'`
    - Arquivo: `alerts-system.js:49-52`

**Correções no Calendário TS (reescrita parcial):**

12. **[CRÍTICO] `META_DIARIA_TS` undefined**
    - Adicionado `META_DIARIA_TS: 8` no `config.example.js`
    - Arquivo: `config.example.js:173`

13. **[CRÍTICO] Calendário TS não usava merge de HI**
    - Adicionado `_calcularHHMerged()` com sweep-line (mesmo do calculations.js)
    - Arquivo: `calendario-ts.js`

14. **[CRÍTICO] TS fazia join por OS+Data ao invés de Número RDO**
    - Corrigido `calcularHHSoldadorDia()` e `obterEfetivoDia()` para usar Número RDO
    - Arquivo: `calendario-ts.js:53-79`

15. **[ALTO] TS ignorava múltiplos RDOs no mesmo dia**
    - `.find()` → `.filter()` + agregação (como o TP já fazia)
    - Arquivo: `calendario-ts.js:99+`

16. **[MÉDIO] SLA do TS usava `diasTrabalhados` ao invés de `diasUteis`**
    - Corrigido para consistência com TP/TMC
    - Arquivo: `calendario-ts.js:205`

17. **[MÉDIO] XSS no modal do calendário TS**
    - Adicionado `escapeHtml()` em todas as variáveis do modal
    - Arquivo: `calendario-ts.js:456+`

**Correções no Calendário TP:**

18. **[ALTO] Totais mensais do card inconsistentes com totais diários**
    - `calcularEstatisticasTurma()` usava campo raw `HH Improdutivas` do Sheets
    - Correção: usa `_calcularHHMerged()` (mesmo algoritmo das células diárias)
    - Arquivo: `calendario-tp.js:613-640`

19. **[CRÍTICO] Merge de HI usava Math.max (overcountava)**
    - Substituído por sweep-line (mesmo do calculations.js)
    - Arquivo: `calendario-tp.js:138+`

**Correções no Apps Script:**

20. **[MÉDIO] Variáveis globais implícitas em `_moverLinhasParaNovoRDO`**
    - Chained `var` assignment declarava apenas primeira variável
    - Arquivo: `apps-script-atualizar-os.gs:622`

21. **[MÉDIO] `atualizarOSCascata` sem LockService**
    - Adicionado lock para evitar cascatas simultâneas
    - Adicionada aba `Acompanhamento` à lista de cascata
    - Arquivo: `apps-script-atualizar-os.gs:412`

**Correções no Cloudflare Worker:**

22. **[MÉDIO] Worker sempre retornava HTTP 200**
    - Correção: propaga `httpStatus` do upstream
    - Arquivo: `src/worker.js:115`

**Correções no Gestão OS:**

23. **[ALTO] Datas com ano de 2 dígitos nunca apareciam**
    - `_parseData()` e filtros de mês/ano tratam anos 2-dígitos (`2000 + y`)
    - Arquivo: `gestao-os.js:63,1214,1559`

24. **[MÉDIO] `setMediu()` não atualizava cache em memória**
    - Correção: atualiza `_dadosServidor` imediatamente
    - Arquivo: `gestao-os.js:415-417`

**Arquivos modificados (17):**
- `app/build.gradle.kts` (version bump)
- `app/.../GoogleSheetsService.kt` (coluna V→U)
- `app/.../SheetsRelatedDataManager.kt` (throw em proteção de versão)
- `app/.../DatabaseHelper.kt` (formato ISO, limite retry)
- `dashboard/js/calculations.js` (sweep-line, efetivo, datas)
- `dashboard/js/calendario-tp.js` (sweep-line, merge consistente)
- `dashboard/js/calendario-ts.js` (reescrita parcial: merge, join, agregação, XSS)
- `dashboard/js/main.js` (deep-clone cache, KPI filtros)
- `dashboard/js/field-helper.js` (normalizarData, estaAtivo, rdoNoPeriodo)
- `dashboard/js/config.example.js` (META_DIARIA_TS)
- `dashboard/js/alerts-system.js` (preservar alertas de dados)
- `dashboard/js/analise-tmc.js` (usar FieldHelper)
- `dashboard/js/gestao-os.js` (ano 2-dígitos, setMediu cache, anexos)
- `dashboard/js/sheets-api.js` (getCustomizadosSemHH, validação hora)
- `dashboard/apps-script-atualizar-os.gs` (lock, globais, Acompanhamento)
- `src/worker.js` (HTTP status)

---

#### v4.0.0 (versionCode 15) — Branch: `feat/auto-update-v4.0.0`
**Sistema de Auto-Atualização + Correções**

- **NOVO**: Sistema completo de auto-atualização via Google Sheets
- **NOVO**: Verificação de versão mínima e recomendada
- **NOVO**: Download de APK com progress e validação MD5
- **FIX**: Causa Não Serviço removida do sync com Sheets (campo era enviado mas não estava mapeado corretamente)
- **FIX**: Novo ícone do aplicativo

---

#### v3.0.0 (versionCode 12) — 2026-02-27
**Correções Críticas e Sincronização**

1. **[CRÍTICO] RDOs deletados incluídos no faturamento**
   - `filtrarRDOsPorTurma()` agora exclui `Deletado = "Sim"`
   - `getTurmasPorTipo()` e `totalRDOs` também corrigidos
   - Arquivo: `dashboard/js/calculations.js`

2. **[CRÍTICO] `causaNaoServico` não sincronizava com Google Sheets**
   - Campo adicionado aos headers da aba RDO (coluna P)
   - `buildRDORow()` passa o campo para o Sheets
   - Colunas Q–W renumeradas
   - `HEADERS_VERSION` incrementado para 5
   - Arquivos: `SheetsConstants.kt`, `SheetsRelatedDataManager.kt`, `GoogleSheetsService.kt`, `SheetsAuditService.kt`

3. **[ALTO] Busca de Efetivo inconsistente entre módulos**
   - `calcularMediaEfetivo()` usava `.find()` O(n) com chave `numeroOS + data`
   - Corrigido para índice `efetivosPorRDO` Map O(1) com chave `numeroRDO`
   - Arquivo: `dashboard/js/calculations.js`

4. **[ALTO] Lógica de HI duplicada**
   - Bloco duplicado em `calcularHHImprodutivas()` e `calcularHHPorDia()`
   - Extraído para `_calcularHHDeUmaHI()` (fonte única de verdade)
   - Arquivo: `dashboard/js/calculations.js`

5. **[MÉDIO] Suporte a data ISO 8601**
   - `_normalizarData()` converte "2025-01-15" para "15/01/2025"
   - Arquivo: `dashboard/js/calculations.js`

**Database Migration**: v10 — coluna `causa_nao_servico TEXT DEFAULT ''`

---

#### v2.5.0 (versionCode não definido) — Refactoring
**Qualidade de Código**

1. **Refactoring Fase 1**: Consolidação de validação de tempo
   - `TimeValidator` = fonte única de verdade para HH:MM
   - Eliminou código duplicado em RDOFragment

2. **Refactoring Fase 2**: Split do GoogleSheetsService
   - 1079 linhas → 270 linhas (facade) + 4 helpers
   - `SheetsHeaderManager`, `SheetsLookupHelper`, `SheetsRelatedDataManager`, `SheetsAuditService`

3. **Refactoring Fase 3**: Extração de RDOValidator
   - `RDOFragment.validarDados()`: 228 linhas → ~75 linhas
   - Lógica em `RDOValidator.kt` (puro, sem dependência Android)

4. **Criação de KmUtils**: conversão centralizada do formato ferroviário "123+456"
5. **Limpeza do Gradle**: removido Compose, duplicatas, APIs Google centralizadas
6. **Localização pt-BR**: strings completas em português

---

#### v2.4.0 (versionCode 11) — 2025-12-05
**Confiabilidade de Sync e Integridade de Dados**

1. **NOVO: Proteção de versão do app**
   - RDOs registram versão do app que os criou
   - Apps antigas não podem deletar dados de apps novas

2. **NOVO: Sistema de Auditoria completo**
   - Aba `AuditoriaSync`: registra INSERT, UPDATE, DELETE, ERROR
   - `SheetsAuditService.logSyncAction()` em todas as operações
   - Não-bloqueante: falha de auditoria não afeta sync principal

3. **NOVO: Aggregação de erros**
   - Coleta todos os erros antes de falhar
   - Mensagens detalhadas: "2/7 sheets failed: Servicos (Timeout), Materiais (QuotaExceeded)"

4. **NOVO: DataCleanupWorker**
   - Executa semanalmente (7 dias)
   - Remove dados órfãos de 6 abas
   - Silencioso (PRIORITY_LOW)

---

#### v2.3.0 (versionCode 10) — 2025-11-27
**FIX CRÍTICO: Multi-Device Sync Overwrite**

**Problema**: Local SQLite IDs usados como chave primária no Sheets.
- Dispositivo A cria RDO com ID=10, Dispositivo B cria RDO com ID=10
- Resultado: Dispositivo B sobrescreve dados do Dispositivo A

**Correção**:
- Mudança do identificador: ID local → **Número RDO** (globalmente único)
- `findRowNumberByNumeroRDO()` em vez de `findRowNumberById()`
- Formato: `OS-DD.MM.YY-XXX` (ex: "998070-27.11.24-001")
- Arquivo: `GoogleSheetsService.kt`

---

#### v2.1.0 (versionCode 8) — 2024-11-21
**FIX CRÍTICO: Sync Silencioso**

**Problema**: Sync retornava sucesso mas dados relacionados não eram salvos.
- `insertRDOInSheet()` e `updateRDOInSheet()` capturavam exceção mas não re-lançavam
- Resultado: RDO principal salvo, mas Servicos/HI/Materiais perdidos silenciosamente

**Correção**:
- Linha 492: `throw e` adicionado em `insertRDOInSheet()` catch
- Linha 460: `throw e` adicionado em `updateRDOInSheet()` catch
- Arquivo: `GoogleSheetsService.kt`

---

#### v2.0.0 (versionCode 7) — 2024-11-19
**Qualidade e Performance**

1. **FIX CRÍTICO: Memory Leak em SyncHelper**
   - Variável estática `sheetsService` mantinha referência ao Context
   - Removida variável estática; cada chamada cria nova instância

2. **Centralização de headers do Sheets**
   - Headers antes hardcoded em 3+ lugares
   - Centralizados em `companion object` de `GoogleSheetsService`

3. **SDK atualizado**: compileSdk 34 → 35 (WorkManager 2.11.0)

---

#### v1.5.0 (versionCode 6) — 2024-11-13
**FIX CRÍTICO: Data Loss na Sincronização**

1. **FIX CRÍTICO: Deletava RDOs errados em sync offline**
   - `deleteRelatedData()` deletava por `numeroOS` apenas
   - Criava RDO offline com mesma OS → deletava TODOS os RDOs dessa OS
   - **Correção**: deletar por `numeroOS` + `dataRDO` (combinação única)

2. **FIX CRÍTICO: Duplicação ao editar data do RDO**
   - `updateRDOInSheet()` deletava com nova data em vez da antiga
   - **Correção**: busca dados antigos da planilha antes de deletar

3. **Melhorias nas abas relacionadas**:
   - Materiais: 5 → 8 colunas (Número OS, Data RDO, Turma, Encarregado)
   - Efetivo: 8 → 10 colunas
   - Equipamentos: 4 → 6 colunas
   - HI: campos contextuais adicionados
   - Transportes: 9 → 12 colunas

**Nota de implantação**: Novo certificado de assinatura — requer reinstalação completa na primeira vez.

---

#### v1.4.1 (versionCode 5)
- FIX: Persistência de RDOs editados
- FIX: `numero_rdo` se auto-atualiza ao editar data/OS
- Múltiplos serviços por RDO no Sheets
- Colunas "Data RDO" e "Total Efetivo" nas abas

---

#### v1.4.0 (versionCode 4)
- **NOVO**: Sistema de auto-atualização (APK download + MD5 + instalação)
- **NOVO**: Suporte a transportes no RDO

---

#### v1.3.0 (versionCode 3)
- **NOVO**: Geração automática de Número RDO (`OS-DD.MM.YY-XXX`)
- **NOVO**: Sync com Google Sheets via WorkManager (6h)
- Database migration v3

---

### 11.2 Dashboard Web

---

#### v1.3.0 (Sprint 3) — 2024-12-03
**Features**

1. **Sistema de Alertas Visíveis** (`alerts-system.js`)
   - Identificação automática de SLA crítico, HH baixo, TMC com poucos dias
   - 3 severidades: crítico/alerta/info
   - Alerta para serviços customizados sem HH Manual

2. **Comparação de Períodos** (`period-comparison.js`)
   - Análise temporal mês a mês
   - Variação de HH, SLA e faturamento

3. **Filtros Favoritos**
   - Salva preferências no `localStorage`
   - Restaura último estado ao recarregar

4. **Índices Map O(1)**
   - `servicosPorRDO`, `hiPorRDO`, `efetivosPorRDO`, `rdosPorTurma`
   - 70% mais rápido em datasets grandes

---

#### v1.2.0 — 2024-12-02
**FIX CRÍTICO: Canvas Reuse**

- Chart.js lançava erro ao reaplicar filtros no mesmo canvas
- **Correção**: todos os 9 métodos de render verificam e destroem gráfico anterior
- Dashboard estabilizado para múltiplas trocas de filtro

---

#### v1.1.0 — 2024-11-20
**15 Bugs Corrigidos**

1. **[CRÍTICO] API Key exposta no código-fonte** → `.gitignore` + `config.example.js`
2. **[CRÍTICO] Chave de autenticação fraca** → chave forte 43 caracteres
3. **[CRÍTICO] Retry automático em erros de API** → backoff 2s/4s/8s
4. **[IMPORTANTE] Inconsistência nos nomes de TMC** → removida referência a `tmc.locais`
5. **[IMPORTANTE] Dias úteis estático** → cálculo real com feriados e Páscoa
6. **[IMPORTANTE] Cache sem invalidação inteligente** → `verificarVersao()`
7. **[IMPORTANTE] Normalização de campos duplicada** → `normalizarNomeCampo()` centralizado
8. **[IMPORTANTE] Gráfico de evolução com dados fictícios** → dados reais
9. **[MENOR] Favicon não existia** → emoji 📊 via data URI
10. **[MENOR] Filtros por `style.display`** → corrigido para `disabled`
11. **[MENOR] Falta validação de horários** → `validarHorario()` com regex
12. **[MENOR] Funções de exportação não implementadas** → CSV + Excel funcional
13. **[MELHORIA] Sincronização servicos.json** → via `enriquecerServicosComCoeficientes()`
14. **[MELHORIA] Responsividade móvel** → queries 1200/992/768/576/400px
15. **[MELHORIA] Loading states granulares** → progress messages + spinner colorido

---

### 11.3 Correções da Sessão de 2026-03-22

**Bugs Corrigidos no Dashboard** (relatório unificado de 2 análises independentes):

#### Bug #1 — RDOs deletados não filtrados (CRÍTICO)
**Problema**: 5 pontos no código não filtravam `Deletado = "Sim"`, causando faturamento inflado.

**Correção aplicada**:
- `field-helper.js`: adicionado `estaAtivo(rdo)` + integrado em `rdoNoPeriodo()`
- `calculations.js`: `filtrarRDOsPorTurma()`, `getTurmasPorTipo()`, `totalRDOs`
- `main.js`: `filtrarDadosPorPeriodo()`, `atualizarKPIs()`
- Todos os 5 pontos agora usam `FieldHelper.rdoNoPeriodo()` que chama `estaAtivo()`

#### Bug #2 — Datas ISO 8601 não normalizadas (CRÍTICO)
**Problema**: 8 pontos com `split('/')` sem tratar formato `YYYY-MM-DD`.

**Correção aplicada**:
- `field-helper.js`: adicionado `normalizarData(str)` que detecta ISO e converte
- `parseData()` agora chama `normalizarData()` antes do split
- `calculations.js`, `main.js`, `analise-tmc.js`: substituídos `split('/')` por `FieldHelper.rdoNoPeriodo()` ou `FieldHelper.parseData()`

#### Bug #3 — Efetivo por chave imprecisa OS+Data (CRÍTICO)
**Problema**: `calcularMediaEfetivo()` buscava efetivo por `numeroOS + data` — impreciso se duas turmas trabalhassem na mesma OS no mesmo dia.

**Correção aplicada** (`calculations.js` linha 278):
- Substituído `this.efetivos.find(e => numOS === ... && data === ...)` por `this.indices.efetivosPorRDO.get(numeroRDO)` O(1)

#### Bug #4 — XSS em alertas (ALTO)
**Problema**: `renderizarAlertas()` interpolava `alert.turma`, `alert.message`, `alert.details`, `alert.action` diretamente em `innerHTML`.

**Correção aplicada** (`alerts-system.js`):
- `escapeHtml()` (de `safe-html.js`) aplicado nos 4 campos dinâmicos

#### Bug #5 — `.find()` O(n) ignorando índice O(1) (ALTO)
**Problema**: `calcularHHImprodutivas()` e `calcularHHPorDia()` usavam `.find()` por `numeroRDO` ignorando o índice existente.

**Correção aplicada** (`calculations.js` linhas 687, 747):
- Substituídos por `this.indices.efetivosPorRDO.get(numeroRDO)`

#### Bug #6 — Índice `efetivosPorRDO` sobrescreve duplicatas (ALTO)
**Problema**: `this.indices.efetivosPorRDO.set()` sem guard — se houvesse 2 registros de Efetivo para o mesmo RDO, o primeiro era descartado.

**Correção aplicada** (`calculations.js` linha 93):
```javascript
if (this.indices.efetivosPorRDO.has(numeroRDO)) {
    console.warn(`[Indices] ⚠️ Efetivo duplicado para RDO ${numeroRDO}`);
} else {
    this.indices.efetivosPorRDO.set(numeroRDO, efetivo);
}
```

#### Bug #7 — Validação fraca de horário (MÉDIO)
**Problema**: `converterHoraParaMinutos()` aceitava "99:99" (resultado: ~100h de HH improdutiva).

**Correção aplicada** (`sheets-api.js`):
```javascript
if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
    console.warn(`[Hora] Valor fora de faixa: ${hora}`);
    return null;
}
```

#### Bug #8 — Turma sem `.trim()` (MÉDIO)
**Problema**: `filtrarRDOsPorTurma()` e `getTurmasPorTipo()` comparavam turma sem trim — espaços extras causavam miss silencioso.

**Correção aplicada** (`calculations.js`):
- `.trim()` adicionado nas comparações de `codigoTurma` nessas 2 funções
- `construirIndices()`: turma normalizada com `.trim()` ao indexar

#### Bug #9 — HI duplicada (MÉDIO) — Já corrigido
Lógica de HI estava duplicada em `calcularHHImprodutivas()` e `calcularHHPorDia()`. Já havia sido refatorada para `_mergeHIIntervals()` (fonte única). **Nenhuma ação necessária.**

#### Bug #10 — Propriedade `_customizadosSemHH` exposta (BAIXO)
**Problema**: `main.js` acessava `sheetsAPI._customizadosSemHH` diretamente (propriedade privada por convenção `_`).

**Correção aplicada**:
- `sheets-api.js`: adicionado `getCustomizadosSemHH()` como método público
- `main.js` linha 106: `sheetsAPI._customizadosSemHH` → `sheetsAPI.getCustomizadosSemHH()`

---

### 11.4 Histórico Git Resumido

```
0cc6c1b fix: remover Causa Não Serviço do sync com Sheets (v4.0.0)
2fe280b feat: sistema de auto-atualização + novo ícone + correções de bugs (v4.0.0)
45222b3 fix: atualizar URL do Apps Script no wrangler.jsonc (v3.0.20)
c2154f7 fix: corrigir dois bugs no Apps Script
4714312 feat: auditoria de O.S suspeitas + correções de segurança (v3.0.20)
69cd0db fix: miniaturas de anexos usando thumbnail do Google Drive (v3.0.19)
517f22c fix: proxy reverso no Cloudflare Worker para resolver CORS (v3.0.17)
ef7ad20 fix(gestao-os): corrigir bug de sobreposição de notas (v3.0.16)
30163b8 feat(gestao-os): normalizar layout da tabela (v3.0.15)
af1e763 feat(gestao-os): v3.0.14 — 4 melhorias + server sync + fix CORS
a26ed2c fix(hi): mesclar intervalos sobrepostos (evita dupla-contagem)
a617cbc fix(calendario-tp): agregar todos os RDOs do dia quando turma trabalha em 2+ O.S
9aff824 fix: usar Número RDO como chave de join em calendario-tp e acompanhamento-diario
9a96eda fix(calendarios): normalizar data ISO 8601 e filtrar deletados em obterDadosDia
cda1261 fix: corrigir bugs críticos e melhorias de integridade v3.0.0
aa1393d fix(dashboard): corrigir bugs críticos, remover código morto e melhorar performance
```

---

## APÊNDICE A — Arquivos Importantes

| Arquivo | Propósito |
|---------|-----------|
| `CLAUDE.md` | Instruções para Claude Code (app Android) |
| `dashboard/CLAUDE.md` | Instruções para Claude Code (dashboard) |
| `GERENCIAR_SERVICOS.md` | Como adicionar/editar serviços |
| `dashboard/SECURITY.md` | Guia de segurança |
| `dashboard/FLUXO_DE_DADOS.md` | Análise detalhada do fluxo de dados |
| `dashboard/INSTALACAO.md` | Guia de instalação completo |
| `dashboard/TROUBLESHOOTING.md` | Resolução de problemas comuns |
| `DOCUMENTACAO_SINCRONIZACAO_SHEETS.md` | Documentação da sincronização |
| `ESTRUTURA_REAL_GOOGLE_SHEETS.md` | Estrutura real das abas |

## APÊNDICE B — Credenciais e Segredos

> ⚠️ Os seguintes itens NUNCA devem ser commitados no repositório:

- `dashboard/js/config.js` (já no `.gitignore`)
- `app/rdo-engecom-3cda2be0f303.json` (credenciais OAuth2 Android)
- `app/calculadorahh-release.keystore` (assinatura do APK)

## APÊNDICE C — Comandos de Desenvolvimento

```bash
# Sincronizar serviços
npm run sync-servicos

# Build do app
./gradlew assembleDebug
./gradlew assembleRelease

# Servidor local do dashboard
python -m http.server 8000    # porta 8000
wrangler dev                   # porta 8787 (com Cloudflare Worker)

# Deploy Cloudflare
wrangler deploy

# Limpeza e rebuild do app
./gradlew clean build

# Lint do app
./gradlew lintDebug
```
