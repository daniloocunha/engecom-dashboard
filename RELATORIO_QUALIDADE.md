# Relatório de Qualidade — Análise Fragmentada (App + Dashboard)

> Registro cronológico da auditoria de qualidade completa do projeto, feita em
> fragmentos ao longo de várias interações. Ver o plano original em
> `RELATORIO_QUALIDADE.md` (este arquivo) e a lista de fragmentos combinada
> com o usuário. Cada seção abaixo corresponde a um fragmento: o que foi
> coberto, o que foi encontrado, severidade e status.

**Legenda de severidade:** 🔴 Crítico · 🟠 Alto · 🟡 Médio · ⚪ Baixo · ✅ OK (sem achado)

**Início da análise:** 2026-08-08

---

## Índice de fragmentos

1. [Fragmento 1 — Modelos de dados](#fragmento-1--modelos-de-dados) — 🟠 1 alto · 🟡 1 médio (doc) · ⚪ 1 baixo
2. [Fragmento 2 — Camada de banco de dados](#fragmento-2--camada-de-banco-de-dados) — 🔴 1 crítico · 🟠 2 altos · 🟡 2 médios · ⚪ 2 baixos

---

## Fragmento 1 — Modelos de dados

**Escopo:** `app/src/main/java/com/example/calculadorahh/data/models/*.kt` (9 arquivos: `RDOData`, `ChecklistInspecao`, `JustificativaHI`, `SyncStatus`, `TransporteItem`, `UpdateConfig`, `ServicoCalculado`, `HICalculado`, `Servico`).

### O que esses arquivos fazem

- **`RDOData.kt`** concentra 6 data classes: `RDOData` (grava um RDO novo, 24
  campos), `RDODataCompleto` (versão de leitura para o Histórico, com
  `syncStatus`/`tentativasSync`/etc. e a propriedade computada `total` de
  efetivo), e os sub-modelos `ServicoRDO`, `MaterialRDO`, `Equipamento`,
  `HIItem`, `Efetivo`. Todos `@Parcelize` (sobrevivem a rotação de tela) e
  serializados via Gson dentro do SQLite (por isso o aviso do CLAUDE.md de
  nunca renomear campos).
- **`ChecklistInspecao.kt`** modela o sistema de checklist de qualidade em
  duas camadas: *template* (`ChecklistTemplate`/`SecaoTemplate`/`ItemTemplate`,
  carregado dos JSONs `checklist_solda.json`/`checklist_dormente.json` — as
  perguntas) e *preenchido* (`ChecklistPreenchido`/`RespostaItem` — as
  respostas do usuário, num mapa chave→resposta). `ItemTemplate.ehNaoConforme()`
  é a função pura que decide se uma resposta reprova o item.
- **`JustificativaHI.kt`** é o catálogo de classificação de Horas
  Improdutivas (`CatalogoJustificativasHI` → `CategoriaHI` +
  `JustificativaHI`), carregado de `justificativas_hi.json`. Cada
  justificativa carrega sua própria regra de cálculo (`fatorHH`,
  `minutosMinimos`, `considerarHI`, `considerarPerdaRumo`) — é o design que
  tirou regra de negócio hardcoded do código (v5.3.0).
- **`SyncStatus.kt`**: enum simples de status de sincronização com Sheets.
- **`TransporteItem.kt`**: um registro de transporte, com `calcularDistancia()`
  (kmFim − kmInicio).
- **`UpdateConfig.kt`**: config de auto-update lida da aba Config do Sheets +
  `UpdateStatus` (sealed class: NoUpdate/UpdateAvailable/UpdateRequired).
- **`ServicoCalculado.kt`** e **`HICalculado.kt`**: modelos usados
  *exclusivamente* pela aba "Calculadora HH" (`CalculadoraHHViewModel`) — um
  fluxo simples e independente do RDO completo, não persistido em banco.
- **`Servico.kt`**: par `(descricao, coeficiente)` — é o shape usado ao
  desserializar `res/raw/servicos.json` via `ServicosCache`.

### Achados

**🟠 Alto — `removerServico()`/`removerHI()` podem apagar mais de um item na Calculadora HH**
`CalculadoraHHViewModel.kt:114-118` e `:184-189` removem item da lista com
`listaAtual.filter { it != servico }` / `{ it != hi }`. Como `ServicoCalculado`
e `HICalculado` são `data class` (igualdade estrutural, não por identidade/
índice), esse filtro remove **todos** os itens estruturalmente iguais ao
clicado — não só o item da linha em que o usuário tocou.
*Cenário concreto:* usuário lança duas HIs "Chuva" 08:00–09:00 (evento
genuinamente repetido, ou duplo-toque no salvar) e depois remove uma delas
pelo botão da lista — as duas somem da lista e do total de horas, sem aviso.
O mesmo vale para dois serviços com mesma descrição/quantidade/observação.
Isso pertence à camada de modelo (a causa raiz é o modelo ser `data class` +
padrão de remoção por valor) mas o efeito só aparece no ViewModel/UI — será
detalhado de novo no **Fragmento 11**. Achado aqui porque a leitura dos
modelos foi o que expôs a causa raiz.

**🟡 Médio (documentação) — `CLAUDE.md` linha 387 contava campos errados**
Dizia "RDOData: ... (19 campos incluindo `causaNaoServico`)"; a classe real
tem **24 campos** (a contagem antiga não incluía `houveTransporte`,
`transportes`, `nomeColaboradores`, adicionados em versões posteriores).
**Corrigido nesta sessão.**

**⚪ Baixo — `Efetivo(0,0,0,0,0,0)` construído posicionalmente**
`RDOData.kt:59` (default de `RDODataCompleto.efetivo`) usa argumentos
posicionais em vez de nomeados. Funciona hoje, mas se um novo campo for
inserido no meio de `Efetivo` no futuro (em vez de no fim), o default vira
um bug silencioso de troca de campos. Sugestão preventiva: usar argumentos
nomeados aqui, sem necessidade de decisão imediata.

**✅ OK — quirk conhecido do Gson+Kotlin tratado corretamente**
`HIItem.colaboradores` tem comentário explícito "default 12, Gson retorna 0
para records antigos" — reconhecendo que Gson (via `Unsafe.allocateInstance`)
ignora defaults de parâmetro Kotlin ao desserializar campo ausente do JSON.
Conferido que `HIManager` já trata isso corretamente com fallback
`if (hi.colaboradores > 0) hi.colaboradores else OPERADORES_PADRAO` em 3
lugares — não é um bug, é uma armadilha real do Gson documentada e já
neutralizada.

**⚪ Baixo (nit de design, não é bug) — duas formas diferentes de modelar "serviço customizado"**
Em `ServicoRDO` (RDO completo) um serviço customizado usa `hhManual: Double?`
dedicado. Em `ServicoCalculado` (Calculadora HH) o mesmo conceito reaproveita
o campo `coeficiente` (`coeficiente = hhManual ?: 0.0`,
`CalculadoraHHViewModel.kt:98`). São fluxos intencionalmente independentes
(o CLAUDE.md já documenta que a fórmula da Calculadora foi desacoplada da do
RDO), mas a inconsistência de nome pode confundir manutenção futura.

**Não é problema:** `Servico`, `ServicoCalculado`, `HICalculado` pareciam
suspeitos de código morto à primeira vista (nomes muito parecidos com
`ServicoRDO`/`HIItem`), mas confirmado por grep que os três são usados
ativamente, só que exclusivamente pelo fluxo da aba "Calculadora HH"
(`CalculadoraHHViewModel`, `ServicosAdapter`, `HIsAdapter`, `ServicosCache`) —
não são duplicatas órfãs dos modelos do RDO.

---

## Fragmento 2 — Camada de banco de dados

**Escopo:** `data/database/DatabaseHelper.kt` (1.242 linhas) e
`data/database/DatabaseHelperExtensions.kt` (383 linhas).

### O que essa camada faz

`DatabaseHelper` é um `SQLiteOpenHelper` singleton (`@Volatile` +
double-checked locking) que guarda **todo** o estado local do app em duas
tabelas:

- **`rdo`** (30 colunas): um RDO por linha. Campos escalares em colunas
  próprias; as coleções (serviços, materiais, efetivo, equipamentos, HI,
  transportes) são serializadas como JSON via Gson em colunas TEXT. Além dos
  dados do RDO, carrega o estado de sincronização (`sincronizado`,
  `sync_status`, `tentativas_sync`, `mensagem_erro_sync`,
  `ultima_tentativa_sync`).
- **`checklist_inspecao`** (9 colunas, v11): um checklist por
  (chave, tipo), onde a chave é o Número RDO ou — em checklist avulso — o
  Número da O.S. O preenchimento inteiro vai serializado em `dados_json`.

Responsabilidades principais:

1. **Migrations v1→v11** em `onUpgrade()`, cada uma num `if (oldVersion < N)`
   encadeado (padrão correto: um device em v3 aplica 4..11 em sequência).
2. **Geração do Número RDO** no formato `OS-DD.MM.YY-XXX`. O sequencial é
   `COUNT(*) + 1` dos RDOs com a mesma OS + data.
3. **CRUD do RDO**, com `inserirRDO()` e `atualizarRDO()` envolvendo
   leitura + escrita numa transação atômica. `atualizarRDO()` regenera o
   Número RDO quando a data ou a O.S mudam e retorna
   `Pair(linhasAtualizadas, numeroRDOAntigo)` — é assim que a camada de sync
   sabe que precisa renomear o registro no Google Sheets.
4. **Máquina de estados de sync**: `marcarRDOComoSincronizando/Sincronizado/
   ComErroSync`, `resetarErroSync`, `resetarRDOsPresos` (destrava RDOs presos
   em SYNCING há mais de 15 min por causa de um crash).
5. **`extrairRDODoCursor()`**: converte linha → `RDODataCompleto`, com cada
   bloco JSON desserializado dentro do seu próprio `try/catch`.

`DatabaseHelperExtensions.kt` adiciona, via extension functions, consultas
paginadas e filtradas (por período, por O.S), contagem e estatísticas.

### Achados

**🔴 Crítico — Salvar RDO passa a falhar permanentemente depois que um RDO do mesmo dia+O.S é deletado; o retry que deveria evitar isso é código inalcançável**

São dois defeitos que se somam:

*(a) O sequencial é `COUNT(*) + 1`, não "maior sequencial + 1".*
`DatabaseHelper.kt:408-416` (dentro de `inserirRDO`) conta os RDOs existentes
para aquela OS+data e soma 1. Como `deletarRDO()` é acessível ao usuário
(`HistoricoRDOActivity.kt:259,279` e `CalendarioRDOActivity.kt:115,135`), a
contagem regride e o próximo número gerado colide com um que já existe.
*Cenário concreto:* existem `998070-13.11.24-001`, `-002` e `-003`. O usuário
deleta o `-002`. Ao criar um RDO novo nessa OS+data, `COUNT(*)` = 2 → gera
`-003` → viola o UNIQUE index. O mesmo acontece via `atualizarRDO()`, que
regenera o número quando a data/O.S mudam e portanto também "libera" um
sequencial no meio.

*(b) O laço de retry nunca itera.* `inserirRDO` (`:393-494`) tem
`maxRetries = 10` e um `catch (e: SQLiteConstraintException)` (`:475`) que
incrementa `attempt` e aplica o backoff. Só que `SQLiteDatabase.insert()`
**captura internamente** qualquer `SQLException` (e `SQLiteConstraintException`
é uma) e **retorna -1** em vez de propagar — esse é o contrato documentado da
API, e é justamente por isso que existe o `insertOrThrow()`. Então o que roda
de fato é o `throw IllegalStateException("Insert retornou -1")` da linha 462,
que é capturado pelo `catch (e: Exception)` genérico da linha 485 e
**relançado imediatamente**. O `catch` de `SQLiteConstraintException` é
inalcançável; o `while` executa exatamente uma vez.

Vale notar que, mesmo corrigindo (b) isoladamente, o retry ainda não
resolveria: `COUNT(*)` é recalculado igual a cada tentativa (o insert que
falhou sofreu rollback), então as 10 tentativas gerariam o mesmo número
colidente e a operação falharia do mesmo jeito, só que ~550 ms mais tarde.

*Efeito em campo:* depois de deletar um RDO de um dia que tinha 2+ RDOs na
mesma O.S, o encarregado não consegue mais salvar RDO novo naquela O.S+data —
a gravação lança exceção. O quanto isso custa em dado digitado depende do
tratamento de erro no `RDOFragment` (a verificar no **Fragmento 12**).

*Documentação:* o `CLAUDE.md` afirmava em 3 lugares que existe "retry
automático (backoff linear: 10ms × tentativa)". **Corrigido nesta sessão**
para descrever o comportamento real.

**🟠 Alto — `DatabaseHelperExtensions.kt` inteiro (383 linhas) está sem chamadores, e a tela de Histórico carrega todos os RDOs de uma vez**

Nenhuma das 7 funções do arquivo é chamada em lugar algum:
`obterRDOsPaginados`, `contarRDOs`, `obterRDOsPorPeriodo`, `obterRDOsPorOS`,
`obterRDOsPendentesSyncPaginados`, `existeRDOComNumero`, `obterEstatisticas`.
Enquanto isso, `HistoricoRDOActivity.kt:165` e `HomeActivity.kt:256,327`
chamam `obterTodosRDOs()` — varredura completa da tabela, com 5 blocos JSON
desserializados por linha. Ou seja: a paginação foi escrita exatamente para
prevenir `OutOfMemoryError` com volume grande (é o que diz o KDoc dela) e
**nunca foi ligada**. Conforme o histórico acumula RDOs, o Histórico degrada.

Um detalhe que aumenta o risco: `obterRDOsPendentesSyncPaginados` usa
`sincronizado = 0 OR sync_status != 'synced'`, condição **diferente** da
`obterRDOsNaoSincronizados()` que está de fato em uso (PENDING/RETRY, e ERROR
só com `tentativas_sync < 10`). Se alguém "ativar" a versão paginada supondo
equivalência, o comportamento do sync muda em silêncio.

**🟠 Alto — `limparDuplicadosNumeroRDO()` pode apagar RDOs legítimos na migração v7→v8**

`DatabaseHelper.kt:219-224` detecta duplicatas com
`GROUP BY numero_rdo HAVING COUNT(*) > 1`, sem excluir vazios. RDOs que
tenham ficado com `numero_rdo = ''` (inseridos antes da v3, ou casos em que
`gerarNumerosParaRegistrosExistentes` não cobriu) caem todos num mesmo grupo
"duplicado", e o `DELETE` mantém só o de maior ID — **perda permanente e
silenciosa de RDOs durante o upgrade do app**, inclusive de RDOs ainda não
sincronizados. Note que só a string vazia causa isso: o UNIQUE index do SQLite
trata NULLs como distintos entre si, então NULL nunca precisaria dessa limpeza.
Exposição hoje limitada a instalações muito antigas (só roda em devices com DB
< 8), mas o código continua no caminho de upgrade.

**🟡 Médio — não existe `onDowngrade()`**

A implementação padrão de `SQLiteOpenHelper.onDowngrade()` lança
`SQLiteException`. Se um aparelho instalar um APK mais antigo — rollback de um
release ruim, ou sideload de uma versão anterior do GitHub Releases, algo
plausível dado que o app tem sistema de atualização automática — o app passa a
crashar em todo acesso ao banco, sem saída a não ser limpar os dados do app,
o que destrói RDOs não sincronizados.

**🟡 Médio — 6 métodos públicos mortos em `DatabaseHelper` e 4 cópias da mesma lógica de numeração**

Sem chamadores: `gerarNumeroRDO()`, `limparTodosRDOs()`, `fecharDatabase()`,
`contarRDOsPorStatus()`, `isRDOSincronizado()`, `possuiChecklist()`.

A lógica de montar o número (`SimpleDateFormat` + `padStart(3,'0')` +
fallback `"00.00.00"`) está copiada **4 vezes**: `gerarNumeroRDOManual`
(`:312`), `gerarNumeroRDO` (`:343`), `gerarNumeroRDOExcluindoId` (`:377`) e
inline dentro de `inserirRDO` (`:418`). Duas dessas cópias estão mortas — o
risco é uma correção futura (por exemplo, a do achado crítico acima) ser
aplicada em uma cópia e não nas outras.

`fecharDatabase()` ainda escreve `INSTANCE = null` fora do `synchronized(this)`,
o que quebra a invariante do double-checked locking. Latente, já que ninguém
chama.

**⚪ Baixo — o índice `idx_rdo_data` não serve para as ordenações que existem**

A coluna `data` guarda `dd/MM/yyyy`, que não é ordenável lexicograficamente.
Todo o código que ordena/filtra por data usa a expressão
`substr(data,7,4)||'-'||substr(data,4,2)||'-'||substr(data,1,2)` — e uma
expressão dessas **não usa** um índice comum de coluna. Na prática
`idx_rdo_data` só ajuda a igualdade exata de `obterRDOsPorData()`. As
consultas estão corretas; o que não confere é a expectativa de performance que
o changelog cria ("Version 7: Indexes de performance"). Guardar a data em ISO,
ou criar um índice de expressão, resolveria. A mesma expressão está copiada 5×
dentro de `DatabaseHelperExtensions.kt`.

**⚪ Baixo — dois limites de tentativa de sync discordando entre si**

`marcarRDOComErroSync()` promove o RDO para `ERROR` a partir de 3 tentativas e
loga `"tentativa N/3"`, mas `obterRDOsNaoSincronizados()` continua reprocessando
registros em `ERROR` enquanto `tentativas_sync < 10`. Não causa dano, mas o
"/3" da mensagem é enganoso e os dois números deveriam sair de uma constante
comum.

### O que está bem resolvido

- Gerenciamento de cursor: `.use { }` em **todas** as consultas — nenhum cursor
  vazando.
- Desserialização defensiva: cada bloco JSON tem `try/catch` próprio com
  fallback para lista/objeto vazio, então um `servicos` corrompido não impede
  a leitura do resto do RDO (e ainda registra `AppLogger.w` com o id).
- Colunas adicionadas em versões recentes são lidas com `try/catch` em volta
  de `getColumnIndexOrThrow`, tolerando bancos parcialmente migrados.
- O singleton com `@Volatile` + double-checked locking está escrito
  corretamente.
- `atualizarRDO()` faz leitura do estado anterior e escrita dentro da mesma
  transação, e devolve o número antigo para a renomeação em cascata no Sheets
  — desenho certo para o problema.

---
