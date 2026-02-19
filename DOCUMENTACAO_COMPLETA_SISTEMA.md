# 📚 DOCUMENTAÇÃO COMPLETA DO SISTEMA - Controle de Campo

**Para**: Claude Code (próxima sessão)
**Data**: 21/11/2024
**Versão Atual**: 2.1.0 (versionCode 8)

---

## 🎯 VISÃO GERAL DO PROJETO

### O que é o sistema?

Sistema completo de gestão de obras para ferrovia composto por:
1. **App Android** - Controle de Campo (calculadorahh)
2. **Google Sheets** - Backend/Base de dados centralizada
3. **Dashboard Web** - Visualização de métricas e indicadores

### Para que serve?

Gerenciar RDOs (Relatório Diário de Obras) de manutenção ferroviária da Engecom/Encogel para o consórcio RUMO Logística.

---

## 📱 APLICATIVO ANDROID - Controle de Campo

### Arquitetura

**Pattern**: MVVM (Model-View-ViewModel)
**Linguagem**: Kotlin 2.0.21
**Min SDK**: Android 7.0 (API 24)
**Target SDK**: Android 14 (API 34)

### Estrutura de Pastas

```
app/src/main/java/com/example/calculadorahh/
├── data/
│   ├── models/              # Modelos de dados
│   │   ├── RDODataCompleto.kt
│   │   ├── Servico.kt
│   │   ├── ServicoCalculado.kt
│   │   ├── HICalculado.kt
│   │   ├── TransporteItem.kt
│   │   └── SyncStatus.kt
│   └── database/
│       └── DatabaseHelper.kt   # SQLite v9 (Singleton)
│
├── domain/
│   └── managers/            # Lógica de negócio
│       ├── BaseItemManager.kt
│       ├── ServicosManager.kt
│       ├── MateriaisManager.kt
│       ├── HIManager.kt
│       └── TransportesManager.kt
│
├── services/
│   └── GoogleSheetsService.kt  # Integração com Sheets API
│
├── ui/
│   ├── activities/
│   │   ├── HomeActivity.kt
│   │   ├── MainActivity.kt
│   │   ├── HistoricoRDOActivity.kt
│   │   └── CalendarioRDOActivity.kt
│   ├── fragments/
│   │   ├── CalculadoraHHFragment.kt
│   │   └── RDOFragment.kt
│   └── adapters/
│       ├── HistoricoRDOAdapter.kt
│       └── ServicosAdapter.kt
│
├── viewmodels/
│   └── CalculadoraHHViewModel.kt
│
├── workers/
│   └── RDOSyncWorker.kt    # WorkManager (sync a cada 6h)
│
└── utils/
    ├── SyncHelper.kt        # Coordena sincronização
    ├── ValidationHelper.kt
    ├── ExportHelper.kt
    └── RDORelatorioUtil.kt
```

---

## 🗄️ BANCO DE DADOS LOCAL (SQLite)

### Tabela Principal: `rdo`

**Versão**: 9

**Colunas principais**:
```sql
id                          INTEGER PRIMARY KEY AUTOINCREMENT
numero_rdo                  TEXT UNIQUE    -- Ex: "998070-13.11.24-001"
data                        TEXT           -- dd/MM/yyyy
numero_os                   TEXT
codigo_turma                TEXT
encarregado                 TEXT
servicos                    TEXT           -- JSON array
materiais                   TEXT           -- JSON array
horas_improdutivas          TEXT           -- JSON array
transportes                 TEXT           -- JSON array
efetivo                     TEXT           -- JSON
equipamentos                TEXT           -- JSON

-- Controle de sincronização
sincronizado                INTEGER        -- 0 ou 1 (legacy)
sync_status                 TEXT           -- "PENDING", "SYNCED", "ERROR", "RETRY"
ultima_tentativa_sync       TEXT           -- timestamp
mensagem_erro_sync          TEXT
tentativas_sync             INTEGER

-- Auditoria
data_criacao                TEXT
data_atualizacao            TEXT
```

**Índices**:
- `idx_rdo_numero_rdo` (UNIQUE)
- `idx_rdo_data`
- `idx_rdo_numero_os`
- `idx_rdo_sincronizado`

---

## 🔄 SISTEMA DE SINCRONIZAÇÃO

### Fluxo de Sincronização

#### 1. Quando ocorre sincronização?

**A) Manual**:
- Usuário clica no botão Sync no Histórico
- Executa `SyncHelper.syncPendingRDOs()`

**B) Automática (WorkManager)**:
- A cada 6 horas
- `RDOSyncWorker` executa em background
- Constraints: Requer internet

**C) Ao salvar RDO**:
- Após criar/editar RDO
- Se houver internet, sincroniza imediatamente

#### 2. Estados de Sincronização (SyncStatus)

```kotlin
PENDING     → RDO criado, aguardando sync
SYNCING     → Sincronização em andamento
SYNCED      → Sincronizado com sucesso
ERROR       → Falha na sincronização
RETRY       → Aguardando retry automático
```

#### 3. Processo de Sincronização (SyncHelper.kt)

```
SyncHelper.syncRDO(rdoId)
    ↓
1. Verifica internet
    ↓
2. Inicializa GoogleSheetsService
    ↓
3. Marca RDO como "SYNCING"
    ↓
4. Chama GoogleSheetsService.syncRDO()
    ↓
    a) Verifica se RDO já existe no Sheets (pelo ID)
    b) Se existe → UPDATE
    c) Se não existe → INSERT
    ↓
5. Sucesso?
    ├─ SIM → Marca como "SYNCED"
    └─ NÃO → Marca como "ERROR", propaga exceção
    ↓
6. WorkManager agenda retry se falhou
```

#### 4. GoogleSheetsService - Métodos Principais

**`initialize()`**:
- Carrega credenciais de `assets/rdo-engecom-bf9816cce3c2.json`
- Cria serviço Sheets API v4
- Verifica/cria abas necessárias

**`syncRDO(rdo, isDelete, numeroRDOAntigo)`**:
- Valida campos obrigatórios (numeroRDO, data, numeroOS)
- Verifica se RDO existe no Sheets (por ID na coluna A)
- Se existe → `updateRDOInSheet()`
- Se não existe → `insertRDOInSheet()`

**`insertRDOInSheet()`**:
- Insere linha principal na aba "RDO"
- Chama `insertRelatedData()` para inserir:
  - Servicos
  - Materiais
  - HorasImprodutivas
  - Transportes
  - Efetivo
  - Equipamentos

**`updateRDOInSheet()`**:
- Busca linha pelo ID (coluna A)
- Atualiza linha principal
- Deleta dados relacionados antigos
- Insere dados relacionados novos

**`deleteRDOFromSheet()`**:
- Deleta linha principal
- Deleta todos os dados relacionados nas outras abas

---

## 🛡️ SISTEMA DE VALIDAÇÃO DE RDOs

### Problema que resolve

RDOs marcados como "sincronizados" no app mas que não existem no Google Sheets (bug corrigido na v2.1.0).

### Como funciona (SyncHelper.validarRDOsSincronizados)

**Trigger**: Ao abrir HistoricoRDOActivity

**Lógica**:

```
1. Verificar se já validou nesta sessão?
   └─ SIM → Pula

2. Verificar internet
   └─ SEM → Pula

3. Obter último RDO criado (maior ID)
   └─ Nenhum RDO? → Pula

4. Obter último ID validado (SharedPreferences)
   └─ ultimoIdValidado

5. Calcular diferença:
   diferença = ultimoIdCriado - ultimoIdValidado

6. Se nunca validou OU diferença >= 10:
   ↓
   a) Buscar últimos 10 RDOs sincronizados
   b) Para cada RDO:
      - Verificar se ID existe no Sheets (coluna A)
      - Se NÃO existe:
        * Remarcar como PENDING
        * Contador++
   c) Se remarcou algum:
      - Toast: "X RDOs não encontrados - serão re-sincronizados"
   d) Salvar novo ultimoIdValidado
   e) Marcar validacaoFeitaNestaSessao = true
```

**Controles**:
- `validacaoFeitaNestaSessao` (variável em memória) → Só valida 1x por sessão
- `ultimo_id_validado` (SharedPreferences) → Só valida a cada 10 RDOs novos
- Se `ultimoIdValidado == 0` (primeira vez) → Valida independente da quantidade

**Resultado**:
- RDOs "falso-sincronizados" são detectados automaticamente
- Remarcados como PENDING
- Próximo sync (manual ou WorkManager) envia para o Sheets

---

## 📊 GOOGLE SHEETS - Estrutura

### Planilha ID
`1H40DX9HwwOwXJquM9bX1qCYuam90hYpiC8enGb9TYFQ`

### Abas do Sistema

#### 1. Config
**Propósito**: Configuração do app (auto-update, versões)

**Estrutura**:
```
Coluna A (Campo)           | Coluna B (Valor)
---------------------------+------------------
versao_minima              | 8
versao_recomendada         | 8
hash_md5                   | 636c99a7113d399f9a879f7276d2484d
tamanho_apk_mb             | 6.9
url_download               | [URL do APK]
forcar_update              | SIM ou NAO
mensagem_aviso             | Texto do popup
mensagem_bloqueio          | Texto de bloqueio
```

#### 2. RDO (Aba principal)
**Propósito**: Linha principal de cada RDO

**Headers (21 colunas)**:
```
A: ID (do banco local)
B: Número RDO
C: Data
D: Número OS
E: Código Turma
F: Encarregado
G: Horário Início
H: Horário Fim
I: Local
J: Tema DDS
K: Total Efetivo
L: Total Operadores
M: Total Motoristas
N: Houve Transporte (SIM/NAO)
O: Observações
P: Clima
Q: Temperatura
R: Vento
S: Chuva (SIM/NAO)
T: Data Criação
U: Data Atualização
```

#### 3. Servicos
**Propósito**: Serviços realizados em cada RDO

**Headers**:
```
A: Número RDO
B: Número OS
C: Data RDO
D: Código Turma
E: Encarregado
F: Descrição
G: Unidade
H: Quantidade
I: Coeficiente
J: HH (Horas Homem)
```

**Cálculo HH**: `quantidade × coeficiente`

#### 4. Materiais
**Headers**:
```
A: Número RDO
B: Número OS
C: Data RDO
D: Código Turma
E: Encarregado
F: Material
G: Unidade (KG, M³, M, UN)
H: Quantidade
```

#### 5. HorasImprodutivas
**Headers**:
```
A: Número RDO
B: Número OS
C: Data RDO
D: Código Turma
E: Encarregado
F: Tipo (Chuva, RUMO, Trem, etc)
G: Descrição
H: Hora Início
I: Hora Fim
J: Total Operadores
K: HH Improdutivas
```

**Cálculo HH Improdutivas**:
```
diferençaHoras = horaFim - horaInicio
hhImprodutivas = diferençaHoras × operadores

Se tipo == "Chuva":
    hhImprodutivas = hhImprodutivas / 2

Se tipo == "Trem" e diferençaHoras < 10 minutos:
    hhImprodutivas = 0
```

#### 6. Transportes
**Headers**:
```
A: Número RDO
B: Número OS
C: Data RDO
D: Código Turma
E: Encarregado
F: Veículo
G: Motorista
H: Horário Saída
I: Horário Chegada
J: KM Inicial
K: KM Final
L: KM Percorrido
```

#### 7. Efetivo
**Headers**:
```
A: Data RDO
B: Código Turma
C: Encarregado
D: Número RDO
E: Número OS
F: Total
G: Operadores
H: Motoristas
I: Nomes (lista separada por vírgula)
J: Data Atualização
```

#### 8. Equipamentos
**Headers**:
```
A: Número RDO
B: Número OS
C: Data RDO
D: Código Turma
E: Encarregado
F: Tipo
G: Placa
```

---

## 🌐 DASHBOARD WEB

### Localização
`C:\Users\dan\CalculadoraHH\dashboard\`

### Tecnologias
- HTML5 + CSS3 + JavaScript ES6
- Bootstrap 5.3.0
- Chart.js 4.4.0
- Google Sheets API v4 (API Key - read-only)

### Arquivos Principais

```
dashboard/
├── index.html           # Página principal
├── dashboard.css        # Estilos
├── js/
│   ├── config.js       # API Key e configurações (NÃO commitar)
│   ├── config.example.js
│   ├── sheets-api.js   # Carrega dados do Sheets
│   ├── calculations.js # Calcula métricas (HH, valores, dias úteis)
│   ├── main.js         # Lógica principal
│   ├── charts.js       # Renderiza gráficos
│   └── filters.js      # Filtros e exportação
└── README_LOCAL.md
```

### Como funciona

#### 1. Autenticação
```javascript
// config.js
API_KEY = "sua-api-key-aqui"
SECRET_KEY = "rumo01"  // Query string: ?key=rumo01
```

**Acesso**: `http://localhost:8000/?key=rumo01`

#### 2. Carregamento de Dados (sheets-api.js)

```javascript
async function carregarDados() {
    const rdos = await carregarAba('RDO')
    const servicos = await carregarAba('Servicos')
    const horasImprodutivas = await carregarAba('HorasImprodutivas')

    // Normaliza headers (remove acentos, converte para camelCase)
    const rdosNormalizados = normalizarHeaders(rdos)

    // Cache por 5 minutos
    localStorage.setItem('cache_rdos', JSON.stringify(rdosNormalizados))
}
```

#### 3. Cálculos (calculations.js)

**Principais funções**:

```javascript
// Calcula dias úteis do mês (considera sábados, domingos, feriados)
calcularDiasUteisDoMes(mes, ano)

// Calcula HH de serviços
calcularHHServicos(rdos)  // soma de (quantidade × coeficiente)

// Calcula HH improdutivas
calcularHHImprodutivas(rdos)  // considera regras de chuva e trem

// Calcula valores financeiros
calcularValores(rdos)  // baseado em coeficientes e quantidades

// Calcula % de SLA por TP
calcularSLAsPorTP(rdos)  // analisa prazos de TPs
```

**Constantes importantes**:
```javascript
METAS = {
    HH_DIARIAS: 96,           // Meta diária
    HH_MENSAIS_BASE: 2016,    // Meta mensal base
    DIVISOR_CHUVA: 2,         // Chuva divide HH por 2
    MINUTOS_MINIMOS_TREM: 10  // Trem < 10min = 0 HH
}

FERIADOS = [
    '01/01', '21/04', '01/05', '07/09', '12/10',
    '02/11', '15/11', '20/11', '25/12'
    // + Carnaval, Páscoa (calculados)
]
```

#### 4. Normalização de Campos

**Problema**: Google Sheets retorna headers com acentos e espaços.

**Solução**:
```javascript
function normalizarNomeCampo(nome) {
    return nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // Remove acentos
        .replace(/\s+/g, '')               // Remove espaços
}

// "Número RDO" → "numerordo"
// "Hora Início" → "horainicio"
```

**Fallback em cálculos**:
```javascript
const numeroRDO = rdo['Número RDO'] || rdo.numeroRDO || rdo.numerordo || ''
```

#### 5. Filtros (filters.js)

**Filtros disponíveis**:
- Mês/Ano
- Turma (TMC)
- Encarregado
- Número OS

**Exportação**:
- CSV (para Excel)
- Excel direto (via SheetJS)

#### 6. Gráficos (charts.js)

**Tipos de gráficos**:
1. **Evolução de HH** (Line Chart)
   - HH Produtivas vs Improdutivas por dia

2. **Distribuição por Turma** (Doughnut Chart)
   - % de HH por TMC

3. **Top Serviços** (Bar Chart)
   - Serviços mais realizados

4. **Heatmap de Produtividade** (Calendar Heatmap)
   - Cor por intensidade de HH diárias

### Como rodar localmente

```bash
cd C:\Users\dan\CalculadoraHH\dashboard
python -m http.server 8000
```

Abrir: `http://localhost:8000/?key=rumo01`

---

## 🔧 BUGS CORRIGIDOS NA v2.1.0

### 1. Exceções Silenciosas (CRÍTICO)

**Problema**:
```kotlin
// GoogleSheetsService.kt - ANTES
suspend fun syncRDO(...): Boolean {
    if (service == null) {
        if (!initialize()) {
            return false  // ❌ Falha silenciosa!
        }
    }

    try {
        if (rdo.numeroRDO.isEmpty()) {
            return false  // ❌ Falha silenciosa!
        }
        // ... sync
    } catch (e: Exception) {
        Log.e(TAG, "Erro", e)
        return false  // ❌ Engole exceção!
    }
}
```

**Consequência**:
- RDO principal inserido na aba "RDO"
- Exceção ao inserir dados relacionados
- Exceção capturada mas não propagada
- Método retorna `false` normalmente
- SyncHelper interpreta como "falhou mas ok"
- RDO marcado como sincronizado ✅
- **MAS dados relacionados não foram inseridos! ❌**

**Correção**:
```kotlin
// GoogleSheetsService.kt - DEPOIS
suspend fun syncRDO(...): Boolean {
    if (service == null) {
        if (!initialize()) {
            throw Exception("Falha ao inicializar")  // ✅ Lança exceção!
        }
    }

    try {
        if (rdo.numeroRDO.isEmpty()) {
            throw Exception("numeroRDO vazio")  // ✅ Lança exceção!
        }
        // ... sync
    } catch (e: Exception) {
        Log.e(TAG, "Erro", e)
        throw e  // ✅ Propaga exceção!
    }
}
```

**Linhas modificadas**:
- `GoogleSheetsService.kt:349-351` (initialize)
- `GoogleSheetsService.kt:359, 363, 367` (validações)
- `GoogleSheetsService.kt:390` (catch)

### 2. Sistema de Validação Automática

**Adicionado**: Sistema que detecta RDOs "falso-sincronizados"

**Arquivos novos/modificados**:

**SyncHelper.kt (linhas 16-21, 277-377)**:
```kotlin
// Controles
private const val INTERVALO_VALIDACAO = 10
private var validacaoFeitaNestaSessao = false

suspend fun validarRDOsSincronizados(context: Context): Int {
    // Valida 1x por sessão, a cada 10 RDOs novos
    // Remarca RDOs não encontrados no Sheets como PENDING
}
```

**DatabaseHelper.kt (linhas 949-1012)**:
```kotlin
fun obterRDOsSincronizadosRecentes(limite: Int = 10): List<RDODataCompleto>
fun marcarRDOComoPendente(id: Long)
fun obterUltimoRDO(): RDODataCompleto?
```

**GoogleSheetsService.kt (linhas 341-343)**:
```kotlin
fun verificarSeRDOExiste(id: Long): Boolean {
    return findRowNumberById(id) != null
}
```

**HistoricoRDOActivity.kt (linhas 53-65)**:
```kotlin
// Ao abrir Histórico, valida automaticamente
lifecycleScope.launch {
    val remarcados = SyncHelper.validarRDOsSincronizados(this@HistoricoRDOActivity)
    if (remarcados > 0) {
        Toast.makeText(..., "⚠️ $remarcados RDOs não encontrados...", ...)
    }
}
```

---

## 🚀 COMO INSTALAR/ATUALIZAR

### APK Atual
```
Arquivo:  app-release-v2.1.0.apk
Local:    C:\Users\dan\CalculadoraHH\app\release\
Tamanho:  6.9 MB
MD5:      636c99a7113d399f9a879f7276d2484d
Versão:   2.1.0 (versionCode 8)
```

### Instalação Manual

**Opção 1: Via APK no celular**
```
1. Copiar APK para o celular
2. Abrir o arquivo
3. Permitir instalação de fontes desconhecidas (se necessário)
4. Instalar
```

**Opção 2: Via ADB**
```bash
adb install -r "C:\Users\dan\CalculadoraHH\app\release\app-release-v2.1.0.apk"
```

### Auto-Update (não configurado ainda)

**Para ativar**:
1. Hospedar APK (Google Drive, Dropbox, servidor)
2. Configurar aba "Config" no Google Sheets
3. App verifica automaticamente ao abrir

---

## 📋 FLUXO COMPLETO DO USUÁRIO

### 1. Criar RDO

```
HomeActivity
    ↓ Clica "RDO"
MainActivity (Tab RDO)
    ↓
RDOFragment
    ↓ Preenche formulário
    ├─ Seleciona serviços (busca de servicos.json - 175 serviços)
    ├─ Adiciona materiais
    ├─ Registra HIs (horas improdutivas)
    ├─ Registra transportes
    ├─ Preenche efetivo
    └─ Adiciona equipamentos
    ↓
Clica "Gerar Relatório"
    ↓
1. Valida campos obrigatórios
2. Gera número RDO (formato: OS-DD.MM.YY-XXX)
3. Salva no SQLite (DatabaseHelper)
4. Se internet → Sincroniza (SyncHelper.syncRDO)
5. Se sem internet → Marca como PENDING
    ↓
HistoricoRDOActivity (abre automaticamente)
```

### 2. Sincronização

**Manual**:
```
HistoricoRDOActivity
    ↓
Clica botão SYNC
    ↓
SyncHelper.syncPendingRDOs()
    ↓
Para cada RDO pendente:
    ↓
GoogleSheetsService.syncRDO()
    ↓
1. Verifica se RDO existe (pelo ID na coluna A)
2. Se não existe → insertRDOInSheet()
   - Insere linha principal na aba "RDO"
   - Insere dados relacionados nas outras 6 abas
3. Se existe → updateRDOInSheet()
   - Atualiza linha principal
   - Deleta dados relacionados antigos
   - Insere dados relacionados novos
    ↓
Marca como SYNCED
    ↓
Toast: "X RDOs sincronizados"
```

**Automática (WorkManager)**:
```
A cada 6 horas (ou boot do device)
    ↓
RDOSyncWorker executa
    ↓
Mesmo fluxo acima
    ↓
Notificação: "X RDOs sincronizados"
```

### 3. Visualizar no Dashboard

```
1. Abrir navegador
2. Navegar: http://localhost:8000/?key=rumo01
    ↓
3. Dashboard carrega dados do Google Sheets
    ↓
4. Normaliza headers
5. Calcula métricas:
   - HH Produtivas
   - HH Improdutivas
   - Dias úteis trabalhados
   - % de SLA
   - Valores financeiros
    ↓
6. Renderiza cards e gráficos
    ↓
7. Usuário aplica filtros (mês, turma, encarregado)
    ↓
8. Exporta CSV/Excel se necessário
```

### 4. Validação Automática

```
Usuário abre HistoricoRDOActivity
    ↓
onCreate() executa validação (em background)
    ↓
SyncHelper.validarRDOsSincronizados()
    ↓
1. Já validou nesta sessão? → Pula
2. Diferença < 10 RDOs novos? → Pula (exceto primeira vez)
3. Sem internet? → Pula
    ↓
4. Busca últimos 10 RDOs "SYNCED"
5. Para cada RDO:
   - Verifica se ID existe no Sheets (coluna A)
   - Se NÃO existe:
     * Remarca como PENDING
     * Contador++
    ↓
6. Se remarcou algum:
   - Toast: "X RDOs não encontrados - serão re-sincronizados"
    ↓
7. Salva último ID validado
8. Marca sessão como validada
```

---

## 🔑 CREDENCIAIS E SEGURANÇA

### Service Account (Google Sheets)
```
Email: rdo-sync@rdo-engecom.iam.gserviceaccount.com
Arquivo: app/src/main/assets/rdo-engecom-bf9816cce3c2.json
Permissões: Editor na planilha
```

### API Key (Dashboard - read-only)
```
Localização: dashboard/js/config.js (NÃO commitar!)
Uso: Leitura de dados públicos do Sheets
```

### Keystore (Assinatura APK)
```
Arquivo: app/calculadorahh-release.keystore
Alias: controledecampo
Validade: Até 31/03/2053
IMPORTANTE: Sempre usar este keystore para releases!
```

---

## 🧪 TESTES

### Testar Sincronização

**1. Criar RDO com internet**:
```
Esperado:
- Toast: "RDO sincronizado"
- Ícone verde no Histórico
- Dados completos no Google Sheets (todas as 7 abas)
```

**2. Criar RDO sem internet**:
```
Esperado:
- Toast: "Sem conexão. Será sincronizado depois"
- Ícone laranja/cinza no Histórico
- Dados NÃO no Google Sheets
```

**3. Sincronizar manualmente**:
```
1. Abrir Histórico
2. Clicar botão SYNC
Esperado:
- Toast: "X RDOs sincronizados"
- Ícones mudam para verde
- Dados aparecem no Google Sheets
```

### Testar Validação

**1. Simular RDO falso-sincronizado**:
```sql
-- No Database Inspector
UPDATE rdo SET sync_status = 'SYNCED', sincronizado = 1 WHERE id = 123;
```

**2. Abrir Histórico**:
```
Esperado:
- Sistema valida
- Detecta que RDO 123 não existe no Sheets
- Toast: "1 RDO não encontrado - será re-sincronizado"
- RDO 123 remarcado como PENDING
```

**3. Sincronizar novamente**:
```
Esperado:
- RDO 123 enviado para o Sheets
- Agora aparece completo
```

### Testar Dashboard

**1. Calcular HH do mês**:
```javascript
// Console do navegador
console.log('HH Produtivas:', dashboardMain.estatisticas.hhServicos)
console.log('HH Improdutivas:', dashboardMain.estatisticas.hhImprodutivas)
console.log('Total HH:', dashboardMain.estatisticas.hhTotal)
```

**2. Verificar dias úteis**:
```javascript
// Novembro/2024 deve ter 19 dias úteis
const diasUteis = calcularDiasUteisDoMes(11, 2024)
console.log('Dias úteis novembro/2024:', diasUteis)  // Esperado: 19
```

---

## 🐛 TROUBLESHOOTING

### App não sincroniza

**Verificar**:
1. Internet ativa?
2. Credenciais do service account corretas?
3. Service account tem permissão na planilha?
4. Ver logs: `adb logcat | grep GoogleSheetsService`

**Logs importantes**:
```
❌ Erro ao inicializar: [mensagem]
❌ Erro ao sincronizar RDO: [mensagem]
✅ RDO sincronizado com sucesso
```

### Dashboard não carrega dados

**Verificar**:
1. Servidor local rodando? (`python -m http.server 8000`)
2. API Key configurada em `config.js`?
3. Secret key correta na URL? (`?key=rumo01`)
4. Console do navegador (F12) mostra erros?

**Erros comuns**:
```
CORS error → Usar localhost, não file://
401 Unauthorized → API Key inválida
403 Forbidden → API Key sem permissão
```

### RDOs aparecem como sincronizados mas não estão no Sheets

**Solução**:
1. Instalar APK v2.1.0 (bug corrigido)
2. Abrir Histórico
3. Sistema valida automaticamente
4. RDOs detectados são remarcados como PENDING
5. Clicar em SYNC ou aguardar WorkManager

### WorkManager não roda

**Verificar**:
```kotlin
// No app, verificar se WorkManager está agendado
WorkManager.getInstance(context)
    .getWorkInfosForUniqueWork(RDOSyncWorker.WORK_NAME)
    .get()
    .forEach { info ->
        Log.d("WorkManager", "State: ${info.state}")
    }
```

**Estados possíveis**:
- ENQUEUED → Agendado
- RUNNING → Executando
- SUCCEEDED → Concluído
- FAILED → Falhou
- BLOCKED → Bloqueado (aguardando constraints)

---

## 📊 MÉTRICAS E MONITORAMENTO

### Queries SQL Úteis

**RDOs não sincronizados**:
```sql
SELECT id, numero_rdo, data, sync_status, mensagem_erro_sync
FROM rdo
WHERE sync_status != 'SYNCED'
ORDER BY data DESC;
```

**Taxa de sucesso de sync**:
```sql
SELECT
    sync_status,
    COUNT(*) as total,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM rdo), 2) as percentual
FROM rdo
GROUP BY sync_status;
```

**RDOs criados por dia**:
```sql
SELECT
    DATE(data_criacao) as dia,
    COUNT(*) as total
FROM rdo
GROUP BY DATE(data_criacao)
ORDER BY dia DESC
LIMIT 30;
```

### Logs do WorkManager

```bash
adb logcat | grep RDOSyncWorker
```

**Saída esperada**:
```
🔄 Iniciando sincronização automática
📋 Sincronizando 5 RDO(s) pendente(s)
✅ RDO 123 sincronizado com sucesso
✅ 5 RDO(s) sincronizado(s) com sucesso
```

---

## 📝 PRÓXIMOS PASSOS (TODO)

### Curto Prazo
- [ ] Configurar auto-update (hospedar APK + config Sheets)
- [ ] Testar validação em produção
- [ ] Monitorar taxa de RDOs remarcados

### Médio Prazo
- [ ] Implementar Firebase Analytics
- [ ] Dashboard de métricas de sincronização
- [ ] Testes automatizados (Espresso + JUnit)

### Longo Prazo
- [ ] Modo offline completo (conflict resolution)
- [ ] Backup automático do SQLite
- [ ] Dashboard com histórico de 12 meses

---

## 🎓 GLOSSÁRIO

**RDO**: Relatório Diário de Obras
**HH**: Homem-Hora (unidade de trabalho)
**HI**: Horas Improdutivas (paradas por chuva, trem, etc)
**TMC**: Turma de Manutenção de Campo
**TP**: Trabalho Programado
**SLA**: Service Level Agreement (prazo de conclusão)
**OS**: Ordem de Serviço
**Coeficiente**: Fator multiplicador para calcular HH de um serviço
**Service Account**: Conta de serviço do Google para autenticação de API
**WorkManager**: Framework Android para tarefas em background

---

## 📞 COMANDOS ÚTEIS

### Build
```bash
cd C:\Users\dan\CalculadoraHH
./gradlew clean assembleRelease
./gradlew assembleDebug
./gradlew installDebug
```

### Logs
```bash
adb logcat | grep -E "GoogleSheetsService|SyncHelper|RDOSyncWorker"
adb logcat *:E  # Somente erros
```

### Database
```bash
adb shell
su
cd /data/data/com.example.calculadorahh/databases
sqlite3 rdo_database.db
```

### Hash MD5
```bash
certutil -hashfile "caminho\do\arquivo.apk" MD5
```

### Servidor Dashboard
```bash
cd C:\Users\dan\CalculadoraHH\dashboard
python -m http.server 8000
```

---

**FIM DA DOCUMENTAÇÃO**

*Última atualização: 21/11/2024*
*Versão do Sistema: 2.1.0*
*Autor: Claude Code AI*
