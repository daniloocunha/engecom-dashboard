# Documentação Técnica — Controle de Campo (CalculadoraHH)

> **Versão do documento:** 4.0.0 | **Atualizado em:** 2026-03-22
> **Empresa:** Engecom Engenharia | **Plataformas:** Android + Dashboard Web

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura Geral](#2-arquitetura-geral)
3. [App Android — Estrutura de Arquivos](#3-app-android--estrutura-de-arquivos)
4. [Modelos de Dados](#4-modelos-de-dados)
5. [Banco de Dados SQLite](#5-banco-de-dados-sqlite)
6. [Google Sheets — Estrutura e Integração](#6-google-sheets--estrutura-e-integração)
7. [Sistema de Auto-Atualização](#7-sistema-de-auto-atualização)
8. [Background Workers](#8-background-workers)
9. [Fórmulas e Regras de Negócio](#9-fórmulas-e-regras-de-negócio)
10. [Dashboard Web](#10-dashboard-web)
11. [Configuração de Build](#11-configuração-de-build)
12. [Histórico Completo de Versões](#12-histórico-completo-de-versões)
13. [Permissões Android](#13-permissões-android)
14. [Serviços e Coeficientes](#14-serviços-e-coeficientes)

---

## 1. Visão Geral

**Controle de Campo** (nome interno: CalculadoraHH) é um sistema composto por:

- **App Android** (Kotlin/MVVM): usado por encarregados de turma em campo para registrar RDOs (Relatórios Diários de Obras) de manutenção ferroviária.
- **Dashboard Web** (HTML/JS puro): usado pela gestão para visualizar KPIs, faturamento, calendários de produtividade e auditar dados.
- **Google Sheets**: armazenamento centralizado que conecta os dois. O app grava dados; o dashboard lê.
- **Google Apps Script**: endpoint REST hospedado no Sheets para operações avançadas (atualizar O.S., dividir O.S., upload de anexos).

### Para que serve

| Funcionalidade | Onde |
|---|---|
| Calcular Homem-Hora (HH) com 105 coeficientes ferroviários | App → aba Calculadora |
| Criar e salvar RDOs diários com serviços, efetivo, HI, transporte | App → aba RDO |
| Visualizar histórico de RDOs com filtros e calendário | App → Histórico |
| Sincronizar RDOs para o Google Sheets (background, 6h) | App → WorkManager |
| Ver KPIs, faturamento TP/TS/TMC, calendário de produtividade | Dashboard Web |
| Atualizar o app automaticamente sem intervenção manual | App → Sistema de auto-update |

---

## 2. Arquitetura Geral

```
┌─────────────────────────────────────────────┐
│               App Android (Kotlin)           │
│                                              │
│  HomeActivity ──► MainActivity               │
│       │              ├── CalculadoraHHFragment│
│       │              └── RDOFragment          │
│       └──► HistoricoRDOActivity              │
│                                              │
│  CalculadoraHHViewModel (LiveData/MVVM)      │
│  DatabaseHelper (SQLite v10, Singleton)      │
│  GoogleSheetsService (Facade → 5 helpers)   │
│  WorkManager: RDOSyncWorker (6h)             │
│              DataCleanupWorker (7d)          │
│  UpdateChecker + UpdateDownloader            │
└──────────────────┬──────────────────────────┘
                   │ HTTPS (Google Sheets API v4)
                   │ OAuth2 (Service Account)
                   ▼
┌─────────────────────────────────────────────┐
│          Google Sheets (Planilha)            │
│                                              │
│  Aba RDO           — dados principais        │
│  Aba Servicos      — serviços por RDO        │
│  Aba Materiais     — materiais por RDO       │
│  Aba Efetivo       — efetivo por RDO         │
│  Aba Equipamentos  — equipamentos por RDO    │
│  Aba HorasImprodutivas — HI por RDO          │
│  Aba TransporteSucatas — transporte por RDO  │
│  Aba AuditoriaSync — log de sincronizações   │
│  Aba Config        — versão do app, URL APK  │
│  Aba GestaoOS      — gestão de O.S.          │
│  Aba AnexosOS      — metadados de anexos     │
└──────────────────┬──────────────────────────┘
                   │ Google Sheets API (API_KEY, público)
                   ▼
┌─────────────────────────────────────────────┐
│       Dashboard Web (HTML/JS puro)           │
│                                              │
│  KPIs, tabelas, calendários, heatmap         │
│  Cálculo de faturamento TP/TS/TMC            │
│  Auditoria de O.S. suspeitas                 │
│  Gestão de O.S. (via Apps Script proxy)      │
└─────────────────────────────────────────────┘
```

### Padrões Arquiteturais Usados

| Padrão | Onde é usado |
|---|---|
| **MVVM** | `CalculadoraHHViewModel` ↔ fragments via LiveData |
| **Template Method** | `BaseItemManager<T>` → ServicosManager, HIManager, etc. |
| **Singleton** | `DatabaseHelper` (double-checked locking com `@Volatile`) |
| **Facade** | `GoogleSheetsService` delega para 5 helpers especializados |
| **Repository** | `DatabaseHelper` abstrai todas as operações SQLite |
| **Observer** | LiveData no ViewModel notifica fragments de mudanças |

---

## 3. App Android — Estrutura de Arquivos

```
app/src/main/java/com/example/calculadorahh/
├── CalculadoraHHApplication.kt        # Inicializa Material You + WorkManager
│
├── data/
│   ├── models/
│   │   ├── RDOData.kt                 # Modelo principal do RDO (formulário)
│   │   ├── RDODataCompleto.kt         # RDO + ID local + status de sync
│   │   ├── Servico.kt                 # Serviço da lista (descricao + coeficiente)
│   │   ├── ServicoCalculado.kt        # Serviço calculado (quantidade × coef = horas)
│   │   ├── HICalculado.kt             # HI calculado (tempo × colaboradores)
│   │   ├── TransporteItem.kt          # Item de transporte com distância calculada
│   │   ├── SyncStatus.kt             # Enum: PENDING, SYNCED, SYNCING, ERROR, RETRY
│   │   └── UpdateConfig.kt            # Config de atualização + sealed class UpdateStatus
│   └── database/
│       ├── DatabaseHelper.kt          # SQLite Singleton v10, CRUD completo
│       └── DatabaseHelperExtensions.kt# Funções de extensão para operações adicionais
│
├── domain/
│   └── managers/
│       ├── BaseItemManager.kt         # Classe abstrata: template para gerenciar listas
│       ├── ServicosManager.kt         # Selecionar e adicionar serviços ao RDO
│       ├── MateriaisManager.kt        # Materiais com seleção de unidade (KG/M³/M/UN)
│       ├── HIManager.kt               # HI com lógica por categoria (Chuva ÷2, RUMO ×1)
│       ├── TransportesManager.kt      # Itens de transporte com validação
│       ├── ModeloLoader.kt            # Carrega RDO como modelo para reaproveitamento
│       └── RDOValidator.kt            # Validação pura sem dependências Android
│
├── services/
│   ├── GoogleSheetsService.kt         # Facade principal de sync com o Sheets
│   ├── SheetsConstants.kt             # Nomes de abas, headers, HEADERS_VERSION
│   ├── SheetsHeaderManager.kt         # Cria/valida/atualiza cabeçalhos com versioning
│   ├── SheetsLookupHelper.kt          # Busca linha por Número RDO
│   ├── SheetsAuditService.kt          # Log de ações, limpeza de órfãos
│   └── SheetsRelatedDataManager.kt   # INSERT/UPDATE/DELETE de dados relacionados
│
├── ui/
│   ├── activities/
│   │   ├── HomeActivity.kt            # Tela inicial: 3 opções + banner de update
│   │   ├── MainActivity.kt            # ViewPager2 com 2 fragmentos (tabs)
│   │   ├── HistoricoRDOActivity.kt    # Lista de RDOs com filtros
│   │   └── CalendarioRDOActivity.kt   # Vista de calendário
│   ├── fragments/
│   │   ├── RDOFragment.kt             # Formulário completo do RDO
│   │   └── CalculadoraHHFragment.kt   # Calculadora HH com serviços e HI
│   └── adapters/
│       ├── ViewPagerAdapter.kt         # Adapter para ViewPager2
│       ├── ServicosAdapter.kt          # RecyclerView de serviços
│       ├── HIsAdapter.kt              # RecyclerView de HIs
│       ├── HistoricoRDOAdapter.kt     # RecyclerView do histórico
│       └── SearchableSpinner.kt       # Spinner customizado com busca
│
├── viewmodels/
│   └── CalculadoraHHViewModel.kt      # Estado compartilhado via LiveData
│
├── workers/
│   ├── RDOSyncWorker.kt              # Sync periódico (6h) + check de update
│   └── DataCleanupWorker.kt          # Limpeza semanal de dados órfãos (7d)
│
└── utils/
    ├── AppConstants.kt               # Todas as constantes e configurações
    ├── AppLogger.kt                  # Log com arquivo + Logcat
    ├── DateFormatter.kt              # Conversão de formatos de data
    ├── ErrorHandler.kt               # Mensagens amigáveis para erros
    ├── IntentExtensions.kt           # Compatibilidade de Intent entre APIs
    ├── KmInputMask.kt                # Máscara de entrada para KM
    ├── KmUtils.kt                    # Conversão e formatação de KM
    ├── RDORelatorioUtil.kt           # Geração de relatório do RDO
    ├── ServicosCache.kt              # Cache singleton do servicos.json
    ├── SyncHelper.kt                 # Orquestração do sync (rede + DatabaseHelper)
    ├── TimeInputMask.kt              # Máscara HH:MM para campos de hora
    ├── TimeValidator.kt              # Validação de tempo (fonte única de verdade)
    ├── ValidationHelper.kt           # Validação abrangente de entradas
    ├── UpdateChecker.kt              # Lê aba Config, compara versões
    └── UpdateDownloader.kt           # Download, validação MD5, instalação via FileProvider
```

---

## 4. Modelos de Dados

### RDOData — Formulário Principal

```kotlin
data class RDOData(
    val numeroRDO: String = "",           // gerado automaticamente: OS-DD.MM.YY-XXX
    val data: String,                     // dd/MM/yyyy
    val codigoTurma: String,             // ex: "TP-01", "TS-02"
    val encarregado: String,             // nome do encarregado
    val local: String,                   // local da obra
    val numeroOS: String,                // número da Ordem de Serviço
    val statusOS: String,                // "Aberta", "Encerrada", etc.
    val kmInicio: String,                // KM inicial no formato "999.5"
    val kmFim: String,                   // KM final
    val horarioInicio: String,           // HH:mm (24h)
    val horarioFim: String,              // HH:mm (24h)
    val clima: String,                   // "Sol", "Chuva", "Nublado"
    val temaDDS: String,                 // tema da reunião de segurança
    val houveServico: Boolean,           // houve serviço produtivo no dia?
    val causaNaoServico: String = "",    // "RUMO", "ENGECOM" ou "" (salvo só localmente)
    val servicos: List<ServicoRDO>,      // serviços executados
    val materiais: List<MaterialRDO>,    // materiais utilizados
    val efetivo: Efetivo,               // headcount por função
    val equipamentos: List<Equipamento>, // equipamentos no campo
    val hiItens: List<HIItem>,          // horas improdutivas
    val houveTransporte: Boolean = false,// houve transporte sucata?
    val transportes: List<TransporteItem> = emptyList(),
    val nomeColaboradores: String = "",  // nomes dos trabalhadores
    val observacoes: String             // obrigatório quando houveServico=false
)
```

### RDODataCompleto — Para o Histórico

Todos os campos de `RDOData` mais:

```kotlin
val id: Long                        // ID local SQLite (NÃO usado como chave global)
val syncStatus: String              // "pending", "synced", "syncing", "error", "retry"
val ultimaTentativaSync: String     // timestamp ISO da última tentativa
val mensagemErroSync: String        // erro legível para o usuário
val tentativasSync: Int             // contador de tentativas (para backoff)
val total: Int                      // soma calculada do efetivo
```

### Estruturas Aninhadas

```kotlin
data class ServicoRDO(
    val descricao: String,
    val quantidade: Double,
    val unidade: String,
    val observacoes: String? = null,
    val isCustomizado: Boolean = false,
    val hhManual: Double? = null        // para serviços sem coeficiente padrão
)

data class MaterialRDO(
    val descricao: String,
    val quantidade: Double,
    val unidade: String                 // "KG", "M³", "M", "UN"
)

data class Efetivo(
    val encarregado: Int,
    val operadores: Int,
    val operadorEGP: Int,
    val tecnicoSeguranca: Int,
    val soldador: Int,
    val motoristas: Int
)

data class Equipamento(
    val tipo: String,
    val placa: String
)

data class HIItem(
    val tipo: String,                   // "Chuva" ou "RUMO"
    val descricao: String,
    val horaInicio: String,             // HH:mm
    val horaFim: String,               // HH:mm
    val colaboradores: Int = 12        // lido do campo "operadores" do efetivo
)

data class TransporteItem(
    val descricao: String,
    val quantidadeColaboradores: Int,
    val horarioInicio: String,
    val horarioFim: String,
    val kmInicio: Double,
    val kmFim: Double
)
```

### UpdateConfig e UpdateStatus

```kotlin
data class UpdateConfig(
    val versaoMinima: Int,          // versionCode mínima para usar o app
    val versaoRecomendada: Int,     // versionCode da versão mais nova
    val urlDownload: String,        // URL do APK no GitHub Releases
    val hashMd5: String,           // MD5 do APK para validação
    val forcarUpdate: Boolean,      // true = bloqueia o app até atualizar
    val mensagemAviso: String,      // texto do banner não-bloqueante
    val mensagemBloqueio: String    // texto do dialog bloqueante
)

sealed class UpdateStatus {
    object NoUpdate : UpdateStatus()
    data class UpdateAvailable(val config: UpdateConfig) : UpdateStatus()
    data class UpdateRequired(val config: UpdateConfig) : UpdateStatus()
}
```

### SyncStatus (Enum)

| Valor | String | Significado |
|---|---|---|
| `PENDING` | "pending" | Aguardando sync |
| `SYNCED` | "synced" | Sincronizado com sucesso |
| `SYNCING` | "syncing" | Em progresso |
| `ERROR` | "error" | Falhou após todas as tentativas |
| `RETRY` | "retry" | Vai tentar novamente em breve |

---

## 5. Banco de Dados SQLite

### Versão Atual: 10

### Schema da Tabela `rdo`

```sql
CREATE TABLE rdo (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_rdo            TEXT,          -- UNIQUE (v8+) ex: "998070-13.11.24-001"
    data                  TEXT,          -- dd/MM/yyyy
    codigo_turma          TEXT,
    encarregado           TEXT,
    local                 TEXT,
    numero_os             TEXT,
    status_os             TEXT,
    km_inicio             TEXT,
    km_fim                TEXT,
    horario_inicio        TEXT,          -- HH:mm
    horario_fim           TEXT,          -- HH:mm
    clima                 TEXT,
    tema_dds              TEXT,
    houve_servico         INTEGER,       -- 0 ou 1
    servicos              TEXT,          -- JSON: List<ServicoRDO>
    materiais             TEXT,          -- JSON: List<MaterialRDO>
    efetivo               TEXT,          -- JSON: Efetivo
    equipamentos          TEXT,          -- JSON: List<Equipamento>
    hi_itens              TEXT,          -- JSON: List<HIItem>
    houve_transporte      INTEGER,       -- 0 ou 1 (adicionado v4)
    transportes           TEXT,          -- JSON: List<TransporteItem> (adicionado v4)
    nome_colaboradores    TEXT,          -- (adicionado v5)
    observacoes           TEXT,
    sincronizado          INTEGER,       -- 0 ou 1 (adicionado v6)
    sync_status           TEXT,          -- enum string (adicionado v6)
    ultima_tentativa_sync TEXT,
    mensagem_erro_sync    TEXT,
    tentativas_sync       INTEGER,
    causa_nao_servico     TEXT DEFAULT '' -- (adicionado v10)
);
```

### Índices

```sql
CREATE INDEX idx_rdo_data ON rdo(data);
CREATE INDEX idx_rdo_numero_os ON rdo(numero_os);
CREATE INDEX idx_rdo_sincronizado ON rdo(sincronizado);
CREATE UNIQUE INDEX idx_rdo_numero_rdo_unique ON rdo(numero_rdo); -- v8+
```

### Histórico de Migrações

| Versão DB | Versão App | O que mudou |
|---|---|---|
| 1 | 1.0 | Schema inicial com campos básicos do RDO |
| 2 | 1.1 | `horario_inicio`, `horario_fim`, `tema_dds`, `efetivo`, `equipamentos`, `hi_itens` |
| 3 | 1.3.0 | `numero_rdo` com geração automática |
| 4 | 1.4.0 | `houve_transporte`, `transportes` JSON |
| 5 | 1.4.1 | `nome_colaboradores` |
| 6 | 1.5.0 | `sincronizado`, `sync_status`, `ultima_tentativa_sync`, `mensagem_erro_sync`, `tentativas_sync` |
| 7 | 2.0.0 | Índices de performance (data, numero_os, sincronizado, numero_rdo) |
| 8 | 2.0.0 | UNIQUE constraint em `numero_rdo` + retry logic |
| 9 | 2.0.0 | compileSdk 35 — sem mudança de schema |
| 10 | 3.0.0 | `causa_nao_servico TEXT DEFAULT ''` |

### Geração do Número RDO

**Formato:** `{numeroOS}-{DD.MM.YY}-{contador com 3 dígitos}`

**Exemplo:** `998070-13.11.24-001`

**Lógica:**
1. Consulta o banco: quantos RDOs existem para o mesmo `numeroOS` + `data`?
2. Incrementa o contador: 001, 002, 003...
3. Se o UNIQUE constraint falhar na inserção, tenta novamente com o próximo contador
4. Backoff exponencial: até 10 tentativas antes de lançar erro

**O número é regenerado automaticamente** quando o usuário edita a data ou o número da O.S. de um RDO existente.

### Serialização JSON no SQLite

Campos complexos (listas e objetos aninhados) são armazenados como JSON usando `Gson`.

> ⚠️ **NUNCA renomear campos de `RDOData` ou estruturas aninhadas.** O Gson usa o nome do campo como chave JSON. Renomear quebra a deserialização de registros existentes no banco.

---

## 6. Google Sheets — Estrutura e Integração

### Abas da Planilha

| Aba | Propósito | Colunas |
|---|---|---|
| `Config` | Versão do app, URL do APK, MD5 | A (chave) + B (valor) |
| `RDO` | Dados principais de cada RDO | 22 (A–V) |
| `Servicos` | Um registro por serviço por RDO | 11 |
| `Materiais` | Um registro por material por RDO | 8 |
| `Efetivo` | Efetivo por RDO | 11 |
| `Equipamentos` | Equipamento por RDO | 7 |
| `HorasImprodutivas` | Um registro por HI por RDO | 10 |
| `TransporteSucatas` | Um registro por transporte por RDO | 11 |
| `AuditoriaSync` | Log de todas as operações de sync | 7 |
| `GestaoOS` | Gestão de O.S. (Apps Script) | dinâmico |
| `AnexosOS` | Metadados de arquivos anexados | dinâmico |

### Headers da Aba RDO (22 colunas, A–V)

| Col | Campo |
|---|---|
| A | ID (local, preenchido para compatibilidade) |
| B | Número RDO ← **chave de lookup global** |
| C | Número OS |
| D | Data RDO |
| E | Código Turma |
| F | Encarregado |
| G | Local |
| H | Status OS |
| I | KM Início |
| J | KM Fim |
| K | Horário Início |
| L | Horário Fim |
| M | Clima |
| N | Tema DDS |
| O | Houve Serviço |
| P | Houve Transporte |
| Q | Nome Colaboradores |
| R | Observações |
| S | Deletado |
| T | Data Sincronização |
| U | Total Efetivo |
| V | Versão App |

### HEADERS_VERSION

Valor atual: **6**

A cada mudança na estrutura de colunas, `HEADERS_VERSION` é incrementado. Na próxima sincronização, o app detecta que a versão do cabeçalho no Sheets é menor e **sobrescreve os headers** automaticamente. Isso garante que o cabeçalho esteja sempre correto, mesmo que seja editado manualmente.

| Versão | Mudança |
|---|---|
| 1 | Headers originais |
| 2 | Adicionado categoria, colaboradores em HI |
| 3 | Adicionado HH Manual em Serviços |
| 4 | Adicionado Operadores em HI |
| 5 | Adicionado "Causa Não Serviço" (depois removido) |
| 6 | Removido "Causa Não Serviço" — planilha volta para 22 colunas |

### Fluxo de Sincronização

```
RDOSyncWorker dispara
    │
    ▼
SyncHelper.syncPendingRDOs()
    │
    ├── obterRDOsNaoSincronizados() ← DatabaseHelper
    │
    └── para cada RDO:
        │
        ├── findRowNumberByNumeroRDO() ← SheetsLookupHelper
        │       │
        │       ├── NÃO existe → insertRDOInSheet()
        │       │       ├── Append na aba RDO
        │       │       └── insertRelatedData() ← SheetsRelatedDataManager
        │       │
        │       └── EXISTE → updateRDOInSheet()
        │               ├── Busca dados antigos (OS + Data)
        │               ├── Deleta dados relacionados antigos
        │               ├── Atualiza linha da aba RDO
        │               └── insertRelatedData() novamente
        │
        ├── logSyncAction() ← SheetsAuditService
        │
        └── marcarComoSincronizado() ← DatabaseHelper
```

### Proteção de Versão (v2.4.0+)

Antes de deletar dados de um RDO:
1. `getRDOAppVersion(numeroRDO)` busca a versão do app que criou o RDO no Sheets
2. Se a versão do app que criou for **maior** que a versão atual, a deleção é **bloqueada**
3. Impede que apps desatualizados sobrescrevam dados criados por versões mais novas

### Lookup por Número RDO (não por ID local)

> **Mudança crítica introduzida na v2.3.0:** antes o lookup usava o ID local SQLite (auto-increment por dispositivo). Dispositivo A e Dispositivo B podiam ter ID=10 referindo-se a RDOs diferentes, causando sobrescrita silenciosa. A partir da v2.3.0, o lookup usa o **Número RDO** (formato `OS-DD.MM.YY-XXX`), que é gerado com base em OS + data + contador e é globalmente único.

### GoogleSheetsService — Facade Pattern

A classe foi refatorada de 1.079 linhas monolíticas para **270 linhas** (v2.5.0) delegando para 5 helpers:

| Helper | Responsabilidade |
|---|---|
| `SheetsConstants` | Todas as constantes (nomes de abas, headers, versões) |
| `SheetsHeaderManager` | Criação, validação e atualização de cabeçalhos |
| `SheetsLookupHelper` | Busca de linha por Número RDO |
| `SheetsAuditService` | Log de ações, versão do app, limpeza de órfãos |
| `SheetsRelatedDataManager` | Serviços, materiais, HI, transporte, efetivo, equipamentos |

### Aba Config — Chaves Esperadas

| Chave | Exemplo | Descrição |
|---|---|---|
| `versao_minima` | `8` | versionCode mínimo para usar o app |
| `versao_recomendada` | `15` | versionCode mais recente disponível |
| `url_download` | `https://github.com/.../v4.0.0/app-release.apk` | URL do APK |
| `hash_md5` | `d41d8cd98f00b204...` | MD5 do APK (minúsculas) |
| `forcar_update` | `NAO` ou `SIM` | Se `SIM`, bloqueia o app |
| `mensagem_aviso` | `Nova versão disponível!` | Texto do banner |
| `mensagem_bloqueio` | `Atualize para continuar` | Texto do dialog bloqueante |

---

## 7. Sistema de Auto-Atualização

Implementado na v4.0.0 usando a estratégia **B+F híbrida**: Google Sheets controla a política, GitHub Releases hospeda o APK.

### Fluxo Completo

```
WorkManager (6h) ou botão "Sincronizar"
    │
    ▼
GoogleSheetsService.verificarAtualizacao()
    │
    ▼
UpdateChecker.fetchUpdateConfig()
    ├── Lê aba "Config" (colunas A:B)
    └── Retorna UpdateConfig

UpdateChecker.checkUpdate(config)
    ├── VERSION_CODE >= versaoRecomendada  → NoUpdate (nada acontece)
    ├── VERSION_CODE < versaoRecomendada  → UpdateAvailable
    │       └── salvarStatusUpdate() nas SharedPreferences
    └── VERSION_CODE < versaoMinima       → UpdateRequired
            └── salvarStatusUpdate() nas SharedPreferences

─── Na próxima abertura do HomeActivity ───

verificarStatusUpdate()
    ├── UpdateAvailable → mostrarBannerUpdate() (CardView azul visível)
    └── UpdateRequired  → mostrarDialogUpdateObrigatorio() (sem botão fechar)

Usuário clica "Atualizar agora"
    │
    ├── temPermissaoInstalar() == false (Android 8+)?
    │       │
    │       └── mostrarDialogPermissao()
    │               └── permissaoInstalacaoLauncher → Settings
    │                       └── onResume() → re-checa → iniciarDownload()
    │
    └── temPermissaoInstalar() == true
            │
            ▼
        UpdateDownloader.download(url, expectedMd5, context, onProgress)
            ├── Follow redirects manualmente (GitHub → CDN objects.githubusercontent.com)
            ├── Stream para cacheDir/update.apk em chunks de 8KB
            ├── Calcula MD5 on-the-fly com MessageDigest
            ├── Atualiza botão "Baixando... X%" via runOnUiThread{}
            └── Valida MD5 → deleta arquivo se falhar

        UpdateDownloader.instalar(apkFile, context)
            ├── FileProvider.getUriForFile() → content URI
            ├── Intent.ACTION_VIEW com MIME application/vnd.android.package-archive
            └── FLAG_GRANT_READ_URI_PERMISSION → instalador nativo do Android
```

### Por que redirect manual?

O GitHub redireciona downloads de releases para `objects.githubusercontent.com` (domínio diferente). O `HttpURLConnection` com `instanceFollowRedirects = true` **não segue** redirects entre domínios. A solução implementada segue manualmente os redirects em loop (até 10 hops):

```kotlin
var currentUrl = url
repeat(10) { hop ->
    val conn = URL(currentUrl).openConnection() as HttpURLConnection
    conn.instanceFollowRedirects = false
    conn.connect()
    if (conn.responseCode in 300..399) {
        currentUrl = conn.getHeaderField("Location")
        conn.disconnect()
    } else {
        // chegou no destino final, faz o download
    }
}
```

---

## 8. Background Workers

### RDOSyncWorker

```
Frequência:     a cada 6 horas
Constraints:    rede disponível + bateria não baixa
Backoff:        exponencial, delay inicial 15 min
Notificações:   progresso (LOW), sucesso (DEFAULT), erro (HIGH)
```

**Sequência de execução:**

1. Verifica rede (`SyncHelper.isNetworkAvailable`)
2. Exibe notificação de progresso
3. Chama `SyncHelper.syncPendingRDOs()` (pode sincronizar vários RDOs)
4. Exibe notificação de resultado ("X RDOs sincronizados")
5. Chama `GoogleSheetsService.verificarAtualizacao()` (não-bloqueante)
6. Se há update disponível: `UpdateChecker.salvarStatusUpdate()` + exibe notificação

**IDs de Notificação (AppConstants):**

| Constante | ID | Uso |
|---|---|---|
| `NOTIFICATION_ID_SYNC_PROGRESS` | 1001 | Sync em andamento |
| `NOTIFICATION_ID_SYNC_RESULT` | 1002 | Resultado do sync |
| `NOTIFICATION_ID_UPDATE` | 1003 | Atualização disponível |

### DataCleanupWorker (v2.4.0+)

```
Frequência:     a cada 7 dias
Constraints:    rede disponível + bateria não baixa
Notificações:   LOW (sem som/vibração)
```

**Sequência de execução:**

1. Busca todos os Números RDO válidos (não deletados) via `SheetsAuditService.getValidRDONumbers()`
2. Para cada aba em `SheetsConstants.RELATED_DATA_SHEETS` (Servicos, Materiais, HI, Transportes, Efetivo, Equipamentos):
   - Lê todas as linhas
   - Identifica linhas cujo Número RDO não está na lista de válidos
   - Remove as linhas órfãs em batch
3. Exibe notificação com total de linhas removidas por aba
4. Falhas por aba são logadas mas não interrompem o processamento das demais

**Propósito:** Manter a integridade dos dados no Sheets. Quando um RDO é deletado, a linha principal na aba RDO é marcada como `Deletado=Sim`, mas as linhas relacionadas nas outras abas precisam ser removidas. O cleanup garante isso semanalmente.

---

## 9. Fórmulas e Regras de Negócio

### Cálculo de HH (Homem-Hora)

```
horas_servico = quantidade × coeficiente
total_hh = Σ(horas_servico de todos os serviços)
```

**Meta diária:** 72 HH (12 operadores × 6h efetivas de trabalho)

```
horas_faltantes = META_HORAS_DIARIAS - total_hh
progresso_pct = (total_hh / META_HORAS_DIARIAS) × 100
```

### Cálculo de HI (Horas Improdutivas)

```
diferença_horas = horaFim - horaInicio  (suporta virada da meia-noite)
horas_brutas = diferença_horas × colaboradores

SE categoria == "Chuva":
    horas_hi = horas_brutas / 2     (chuva conta como metade)
SE categoria == "RUMO":
    horas_hi = horas_brutas         (RUMO conta integralmente)
```

### Tratamento de Período Noturno (Overnight)

Aplicado tanto em HI quanto em campos de horário do RDO:

```
SE horaFim_em_minutos >= horaInicio_em_minutos:
    diferença = horaFim - horaInicio
SENÃO:
    diferença = (24h - horaInicio) + horaFim
    → ex: 23:00 até 02:00 = 1h + 2h = 3h
```

O `TimeValidator` é a **fonte única de verdade** para essa lógica.

### Geração do Número RDO

```
formato = "{numeroOS}-{DD.MM.YY}-{contador:03d}"
exemplo = "998070-13.11.24-001"

contador = COUNT(rdo WHERE numero_os = X AND data = Y) + 1
```

Se o UNIQUE constraint rejeitar (colisão rara com múltiplos dispositivos criando simultaneamente), o DatabaseHelper tenta com `contador + 1`, até 10 tentativas.

### Validação do Formulário RDO

**Sempre obrigatório:**
- Data selecionada
- Código Turma ≠ posição 0 do spinner
- Encarregado ≠ posição 0 do spinner
- Local preenchido
- Número OS preenchido
- KM Início válido e ≥ 0
- KM Fim válido e ≥ 0
- Nome Colaboradores preenchido
- Se KM Fim < KM Início → confirmação do usuário (pode ser viagem de retorno)

**Somente quando Houve Serviço = Sim:**
- Tema DDS preenchido
- Horário Início válido (HH:mm)
- Horário Fim válido (HH:mm)
- Diferença de horário < 24h
- Se Horário Fim < Horário Início → confirmação (trabalho que passa da meia-noite)
- Pelo menos 1 serviço adicionado
- Pelo menos 1 material adicionado
- Pelo menos 1 equipamento adicionado

**Somente quando Houve Serviço = Não:**
- Observações preenchida (obrigatório explicar o motivo)

**Somente quando Houve Transporte = Sim:**
- Pelo menos 1 item de transporte adicionado

---

## 10. Dashboard Web

### Arquivos JavaScript (20 módulos)

| Arquivo | Classe/Módulo | Função |
|---|---|---|
| `main.js` | `DashboardMain` | Orquestrador: inicializa, coordena filtros, atualiza KPIs e tabelas |
| `sheets-api.js` | `GoogleSheetsAPI` | Carrega dados das 7 abas, normaliza campos, cache de 5 minutos |
| `calculations.js` | `CalculadoraMedicao` | Toda a lógica de negócio: faturamento TP/TS/TMC, HH por dia, filtros |
| `charts.js` | `dashboardCharts` | Wrapper do Chart.js para gráficos de linha, barra, pizza, rosca |
| `filters.js` | — | Utilitários de filtro por mês, ano, turma, tipo |
| `calendario-tp.js` | — | Calendário mensal TP com alvo 96 HH/dia (verde/amarelo/vermelho) |
| `calendario-ts.js` | — | Calendário mensal TS com alvo 8 HH/dia por soldador |
| `analise-tmc.js` | — | Análise e métricas da equipe TMC |
| `gestao-os.js` | — | Gestão de O.S.: busca, edição, persistência via Apps Script |
| `os-auditoria.js` | — | Detecta O.S. suspeitas (duplicatas, valores inválidos, padrões anômalos) |
| `period-comparison.js` | — | Comparativo mês a mês de HH e faturamento |
| `export.js` | — | Exportação de dados da tabela |
| `export-helper.js` | — | Utilitários de formatação para CSV/JSON |
| `field-helper.js` | — | Acesso e normalização de campos dos RDOs |
| `alerts-system.js` | — | Notificações e avisos para o usuário no dashboard |
| `auth.js` | — | Autenticação baseada em chave secreta (link com parâmetro) |
| `safe-html.js` | — | Proteção XSS para renderização de HTML dinâmico |
| `view-manager.js` | — | Alterna entre visão Clássica e Minimal |
| `config.js` | — | SPREADSHEET_ID, API_KEY, nomes de abas, tabelas de preço, SECRET_KEY |
| `servicos-data.js` | — | GERADO AUTOMATICAMENTE — fallback CORS para serviços |

### Lógica de Cálculo de Faturamento

```
TP (Turma de Produção):
  alvo_diario = 96 HH (12 operadores × 8h)
  HH_produtivo = Σ(servicos.quantidade × coeficiente)
  HH_improdutivo = Σ(HI.horas conforme categoria)
  eficiencia = HH_produtivo / alvo_diario

TS (Turma de Solda):
  alvo_diario = 8 HH (1 soldador × 8h)
  cálculo similar ao TP
```

### Google Apps Script — Ações Suportadas

O endpoint em `apps-script-atualizar-os.gs` responde via POST/GET (CORS liberado):

| Ação | O que faz |
|---|---|
| `atualizarOS` | Atualiza o Número OS de um RDO específico |
| `listarGestaoOS` | Retorna todos os registros de gestão de O.S. indexados por Número OS |
| `salvarGestaoOS` | Insere ou atualiza registro de O.S. (com LockService para thread-safety) |
| `uploadAnexo` | Recebe base64, salva no Google Drive, registra metadados na aba AnexosOS |
| `deletarAnexo` | Move arquivo para lixeira no Drive, remove linha de metadados |
| `atualizarOSCascata` | Atualiza Número OS em todas as 7 abas de dados (operação em lote) |
| `dividirOS` | Divide uma O.S. em duas, cria novo RDO, redistribui serviços/HIs |

---

## 11. Configuração de Build

### Versões

| Item | Valor |
|---|---|
| `applicationId` | `com.example.calculadorahh` |
| `versionCode` | `15` |
| `versionName` | `4.0.0` |
| `minSdk` | `24` (Android 7.0 Nougat) |
| `targetSdk` | `34` (Android 14) |
| `compileSdk` | `35` (Android 15) — exigido pelo WorkManager 2.11.0 |
| `jvmTarget` | `17` |
| Kotlin | `2.0.21` |
| AGP | `8.13.1` |
| Gradle Wrapper | `8.13` |

### Assinatura (Release)

| Item | Detalhe |
|---|---|
| Keystore | `app/calculadorahh-release.keystore` (no .gitignore) |
| Alias | `controledecampo` |
| Certificado | Engecom Engenharia |
| Válido até | 31 de março de 2053 |
| Algoritmo | SHA256withRSA (RSA 2048 bits) |
| Esquema | APK Signature Scheme v2/v3 |

> ⚠️ Sempre usar esse keystore para todas as releases futuras. Trocar o keystore impede que o sistema Android aceite a atualização (usuário precisaria desinstalar manualmente).

### Dependências Principais

| Dependência | Versão | Uso |
|---|---|---|
| `core-ktx` | 1.15.0 | Extensões Kotlin para Android |
| `material` | 1.13.0 | Material Design 3 + Material You |
| `viewpager2` | — | Swipe entre fragmentos |
| `fragment-ktx` | — | Fragment com coroutines |
| `workmanager` | 2.11.0 | Tarefas em background confiáveis |
| `coroutines` | 1.7.3 | Concorrência assíncrona |
| `gson` | 2.13.2 | Serialização/deserialização JSON |
| `google-api-services-sheets` | — | Google Sheets API v4 |
| `google-auth-library-oauth2-http` | — | OAuth2 com Service Account |

### ProGuard (Release)

Regras customizadas em `app/proguard-rules.pro`:
- Mantém todas as classes de modelos usadas pelo Gson (não ofuscar nomes de campos)
- Preserva classes da Google Sheets API
- Mantém classes do WorkManager
- Mantém `BuildConfig` para acesso ao `VERSION_CODE`

### Credenciais (Service Account)

- **Arquivo:** `app/src/main/assets/rdo-engecom-3cda2be0f303.json`
- **Adicionado ao `.gitignore`** — não é commitado no repositório
- Cada desenvolvedor deve obtê-lo manualmente no Google Cloud Console
- O arquivo anterior (`rdo-engecom-bf9816cce3c2.json`) foi rotacionado e não é mais válido

---

## 12. Histórico Completo de Versões

### v4.0.0 — versionCode 15 — 2026-03-22

**Sistema de Auto-Atualização (B+F Híbrido)**
- Estratégia híbrida: Google Sheets "Config" controla política, GitHub Releases hospeda APK
- `UpdateConfig` + `UpdateStatus` (sealed class): dados e estados de atualização
- `UpdateChecker`: lê aba Config, persiste estado em SharedPreferences, revalida na leitura
- `UpdateDownloader`: redirect manual HTTP (GitHub → CDN), stream com progress, validação MD5, instalação via FileProvider
- `HomeActivity`: banner azul não-bloqueante (UpdateAvailable) ou dialog sem botão fechar (UpdateRequired)
- Fluxo de permissão `REQUEST_INSTALL_PACKAGES`: dialog explicativo → Settings → `onResume` retoma download
- `RDOSyncWorker`: agora chama `verificarAtualizacao()` após sync, emite notificação de update
- `GoogleSheetsService`: novo método `verificarAtualizacao()`
- `AndroidManifest`: restaurado `REQUEST_INSTALL_PACKAGES` e `WRITE_EXTERNAL_STORAGE` (API < 29)

**Novo Ícone**
- Substitui `.webp` genérico pelo símbolo Engecom em PNG (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi)
- `ic_launcher_foreground.png` para ícone adaptativo (Android 8+, API 26+)
- Fundo branco em `ic_launcher_background.xml`

**Correções de Bugs (confirmados por análise de código)**
- `GoogleSheetsService`: range `A:V` → `A:W` — coluna "Versão App" nunca chegava ao Sheets
- `SheetsAuditService.getValidRDONumbers()`: range `B2:S` → `B2:T` e índice 17 → 18 — coluna "Deletado" era lida errada, RDOs deletados podiam aparecer como válidos
- `DataCleanupWorker`: nomes de abas hardcoded substituídos por `SheetsConstants.RELATED_DATA_SHEETS`
- `AppConstants`: constante `SHEETS_HEADERS_VERSION = 4` duplicada e divergente removida (valor correto: 5 em `SheetsConstants`)
- Rotação de credencial: `rdo-engecom-bf9816cce3c2.json` → `rdo-engecom-3cda2be0f303.json`

---

### v3.0.0 — versionCode 12 — 2026-02-27

**[CRÍTICO] RDOs deletados incluídos no faturamento**
- Arquivo: `dashboard/js/calculations.js`
- `filtrarRDOsPorTurma()` não excluía RDOs com `Deletado = "Sim"`
- Corrigido: todos os módulos do dashboard agora filtram deletados consistentemente

**[CRÍTICO] `causaNaoServico` não sincronizava com Google Sheets**
- Arquivos: `SheetsConstants.kt`, `SheetsRelatedDataManager.kt`, `GoogleSheetsService.kt`, `SheetsAuditService.kt`
- Campo adicionado à aba RDO como coluna P; colunas Q–W renumeradas
- `HEADERS_VERSION` incrementado para 5
- **Nota:** Este campo foi removido do sync na v4.0.0 (veja Observações abaixo)

**[ALTO] Busca de Efetivo inconsistente**
- Arquivo: `dashboard/js/calculations.js`
- `calcularMediaEfetivo()` usava `.find()` O(n) com chave OS+data (impreciso)
- Corrigido: índice `efetivosPorRDO` com chave `numeroRDO` O(1)

**[ALTO] Lógica de HI duplicada**
- Arquivo: `dashboard/js/calculations.js`
- Bloco de cálculo de HI estava repetido em dois métodos
- Extraído para método privado `_calcularHHDeUmaHI(hi, numeroRDO)` — fonte única de verdade

**[MÉDIO] Suporte a data ISO 8601**
- Arquivo: `dashboard/js/calculations.js`
- Método `_normalizarData()` converte "2025-01-15" → "15/01/2025"

**Banco de Dados:**
- Migração para v10: `causa_nao_servico TEXT DEFAULT ''`

> **Observação sobre causaNaoServico:** A adição desta coluna ao Sheets (v3.0.0) deslocou todas as colunas seguintes, corrompendo a leitura de RDOs antigos no dashboard (Observações, Deletado mostravam valores errados). A solução adotada na v4.0.0 foi remover o campo do sync — ele continua sendo salvo no SQLite local, mas não vai para o Sheets.

---

### v2.5.0 — versionCode — 2025-12-xx (refatoração interna)

- **Refatoração Phase 1:** `TimeValidator` como fonte única de verdade para validação de tempo
- **Refatoração Phase 2:** `GoogleSheetsService` de 1.079 → 270 linhas (Facade pattern com 5 helpers)
- **Refatoração Phase 3:** `RDOValidator` extraído do `RDOFragment` (validação pura sem UI)
- `KmUtils`: centralização de conversão KM (antes espalhado em vários lugares)
- Gradle: removidas dependências Compose (nunca usadas), corrigidas duplicatas, Google APIs centralizadas
- Localização pt-BR: todas as strings movidas para `strings.xml`

---

### v2.4.0 — versionCode 11 — 2025-12-05

**Sistema de Auditoria**
- Nova aba `AuditoriaSync` no Sheets
- `SheetsAuditService.logSyncAction()`: registra INSERT/UPDATE/DELETE/ERROR com timestamp, versionCode, deviceId
- Falhas na auditoria são silenciosas (não afetam o sync principal)

**Proteção de Versão**
- `getRDOAppVersion(numeroRDO)`: busca a versão do app que criou o RDO
- Apps mais antigos não conseguem deletar dados criados por apps mais novos
- Previne corrupção em ambientes com múltiplas versões instaladas

**Melhor Tratamento de Erros**
- Antes: a primeira falha interrompia o sync de todos os sheets
- Depois: coleta todos os erros, continua processando, mostra relatório final
- Exemplo: "2/7 sheets falharam: Servicos (Timeout), Materiais (QuotaExceeded)"

**Limpeza Semanal de Órfãos**
- Novo: `DataCleanupWorker` (175 linhas)
- Remove linhas nas abas relacionadas cujo Número RDO não existe mais
- 6 abas limpas: Servicos, Materiais, Efetivo, Equipamentos, HorasImprodutivas, TransporteSucatas

---

### v2.3.0 — versionCode 10 — 2025-11-27

**[CRÍTICO] Prevenção de Sobrescrita entre Dispositivos**

- **Problema:** Dispositivo A cria RDO com ID SQLite = 10. Dispositivo B cria outro RDO também com ID = 10. Na sincronização, o Dispositivo B sobrescrevia os dados do Dispositivo A silenciosamente.
- **Causa raiz:** `findRowNumberById(rdo.id)` usava o ID local SQLite (único apenas por dispositivo).
- **Solução:** `findRowNumberByNumeroRDO(rdo.numeroRDO)` — o Número RDO é gerado com OS+data+contador e é globalmente único.
- Adicionado rastreamento de versão do app na coluna V da aba RDO.
- Arquivo: `GoogleSheetsService.kt` (6 pontos modificados)

---

### v2.1.0 — versionCode 8 — 2024-11-21

**[CRÍTICO] Sync Silencioso — Dados Incompletos sem Aviso**

- **Sintoma:** App mostrava "RDO sincronizado com sucesso" mas o Sheets só tinha a linha principal, sem serviços, materiais, HI, etc.
- **Causa raiz:** Blocos `catch` em `insertRDOInSheet()` e `updateRDOInSheet()` capturavam exceções mas **não as relançavam**. A inserção dos dados relacionados falhava, a exceção era engolida, e o método retornava normalmente.
- **Solução:** Adicionado `throw e` nos blocos catch.
- **Linhas:** `GoogleSheetsService.kt:460` e `:492`
- Resultado: exceções agora propagam corretamente → sync falha visivelmente → RDO fica pendente para retry.

---

### v2.0.0 — versionCode 7 — 2024-11-19

**[CRÍTICO] Memory Leak no SyncHelper**
- Variável estática `sheetsService` mantinha referência ao `Context`, causando vazamento de memória
- Solução: Removida variável estática, `initializeService()` retorna nova instância por chamada
- Arquivo: `SyncHelper.kt`

**[ALTO] Headers do Sheets Centralizados**
- Headers estavam hardcoded em 3+ lugares, causando desincronização quando se adicionava coluna
- Solução: Constants centralizadas em companion object (depois movidas para `SheetsConstants.kt`)
- Arquivo: `GoogleSheetsService.kt`

**Atualização de SDK**
- `compileSdk`: 34 → 35 (exigido pelo WorkManager 2.11.0)
- Removido atributo `package` obsoleto do `AndroidManifest.xml`

---

### v1.5.0 — versionCode 6 — 2024-11-13

**[CRÍTICO] Perda de Dados ao Sincronizar RDOs Offline**
- **Problema:** Criar RDO offline com "usar como modelo" (mesma O.S., data diferente) apagava TODOS os RDOs daquela O.S. do Sheets.
- **Causa raiz:** `deleteRelatedData()` deletava apenas por `numeroOS`, sem considerar a data.
- **Solução:** Deleção passou a exigir **OS + Data** para todas as abas.
- Arquivo: `GoogleSheetsService.kt`

**[CRÍTICO] Duplicação ao Editar Data do RDO**
- **Problema:** Editar a data de um RDO criava entrada duplicada no Sheets.
- **Causa raiz:** `updateRDOInSheet()` usava os dados NOVOS para deletar em vez dos ANTIGOS.
- **Solução:** Busca os dados antigos do Sheets antes de deletar, usa OS+Data antigos para deleção.
- Arquivo: `GoogleSheetsService.kt`

**Sheets com Mais Contexto**
- Materiais: 5 → 8 colunas (adicionado Número OS, Data RDO, Código Turma, Encarregado)
- Efetivo: 8 → 10 colunas (adicionado Data RDO, Código Turma, Encarregado)
- Equipamentos: 4 → 6 colunas (adicionado Data RDO, Código Turma, Encarregado)
- HI e Transportes: idem

**Novo Keystore**
- Certificado SHA256withRSA, válido até 2053
- Primeira versão com o keystore definitivo; requer reinstalação completa para usuários da v1.4.x

---

### v1.4.1 — versionCode 5

- Corrigido: persistência de edições no RDO
- Corrigido: `numero_rdo` não era regenerado ao editar data ou número da O.S.
- Adicionado: coluna "Data RDO" e "Total Efetivo" no Sheets

---

### v1.4.0 — versionCode 4

- Sistema de auto-update (download, validação MD5, instalação) — primeira versão, sem o fluxo de permissão completo
- Suporte a transporte no RDO (campos `houveTransporte` e lista de `TransporteItem`)
- Database migração para v4

---

### v1.3.0 — versionCode 3

- Geração automática do Número RDO no formato `OS-DD.MM.YY-XXX`
- Integração com Google Sheets: sync em background via WorkManager (6h)
- Database migração para v3

---

## 13. Permissões Android

| Permissão | Por quê |
|---|---|
| `INTERNET` | Sync com Google Sheets e download de APK |
| `ACCESS_NETWORK_STATE` | Verificar conectividade antes de tentar sync |
| `POST_NOTIFICATIONS` | Mostrar progresso de sync e aviso de atualização (Android 13+) |
| `REQUEST_INSTALL_PACKAGES` | Instalar o APK baixado pelo sistema de auto-update |
| `WRITE_EXTERNAL_STORAGE` | Export de CSV/JSON em dispositivos Android < 9 (`maxSdkVersion=28`) |

---

## 14. Serviços e Coeficientes

### Como Funciona

Cada serviço de manutenção ferroviária tem um **coeficiente** que representa quantas Homem-Hora são necessárias para executar uma unidade daquele serviço.

```
HH = quantidade_executada × coeficiente
Exemplo: 10 dormentes × 0.81 = 8.1 HH
```

### Fonte de Dados

| Arquivo | Papel |
|---|---|
| `app/src/main/res/raw/servicos.json` | **Fonte única de verdade** — edite somente este |
| `dashboard/servicos.json` | Gerado automaticamente (não editar) |
| `dashboard/js/servicos-data.js` | Gerado automaticamente (fallback CORS) |

**Para sincronizar após edição:**
```bash
npm run sync-servicos
# ou
node scripts/sync-servicos.js
```

### Estatísticas

| Item | Valor |
|---|---|
| Total de serviços | 105 serviços ferroviários |
| Menor coeficiente | ~0.10 (serviços simples de inspeção) |
| Maior coeficiente | 179.0 (montagem AMV — aparelho de mudança de via) |
| Coeficiente mais comum | 0.25 – 0.98 (faixa principal de manutenção) |

### Exemplos de Serviços

| Serviço | Coeficiente | Interpretação |
|---|---|---|
| Substituição Dormente | 0.81 | 0.81 HH por dormente substituído |
| Correção Da Bitola | 0.25 | 0.25 HH por ponto corrigido |
| Nivelamento Contínuo | 0.64 | 0.64 HH por posição nivelada |
| Substituição De Trilho TR-60 | 0.89 | 0.89 HH por metro de trilho |
| Mont. Assent. AMV Aber 1:8-1:10 | 179.0 | 179 HH por AMV montado |

### Como Adicionar um Novo Serviço

1. Editar `app/src/main/res/raw/servicos.json`:
```json
{"descricao": "Nome Do Serviço", "coeficiente": 0.75}
```
2. Rodar `npm run sync-servicos`
3. Commitar os 3 arquivos: `servicos.json`, `dashboard/servicos.json`, `dashboard/js/servicos-data.js`
4. O app carrega os serviços dinamicamente — sem necessidade de nova release

---

*Fim da documentação técnica.*
