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
3. [Fragmento 3 — Managers base + Serviços + Materiais](#fragmento-3--managers-base--serviços--materiais) — 🟠 1 alto · 🟡 2 médios · ⚪ 4 baixos
4. [Fragmento 4 — Horas Improdutivas](#fragmento-4--horas-improdutivas) — 🟡 2 médios · ⚪ 3 baixos
5. [Fragmento 5 — Transportes + ModeloLoader + RDOValidator](#fragmento-5--transportes--modeloloader--rdovalidator) — 🟡 3 médios · ⚪ 5 baixos
6. [Fragmento 6 — Checklist de Qualidade](#fragmento-6--checklist-de-qualidade) — 🟡 1 médio · ⚪ 4 baixos
7. [Fragmento 7 — Sincronização Google Sheets](#fragmento-7--sincronização-google-sheets) — 🔴 **1 crítico (segurança)** · 🟠 1 alto · 🟡 2 médios · ⚪ 6 baixos

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

## Fragmento 3 — Managers base + Serviços + Materiais

**Escopo:** `domain/managers/BaseItemManager.kt` (110), `ServicosManager.kt`
(320), `MateriaisManager.kt` (164). Consultados como apoio:
`utils/ServicosCache.kt`, `utils/AppConstants.kt`,
`res/layout/dialog_adicionar_servico_rdo.xml`, `res/raw/servicos.json`.

### O que esses arquivos fazem

**`BaseItemManager<T>`** é a classe base (Template Method) das listas
dinâmicas do formulário de RDO — as seções onde o usuário vai acrescentando
linhas (Serviços, Materiais, HI, Transportes). Ela mantém dois estados em
paralelo: a lista de dados (`itensAdicionados`) e as views correspondentes
dentro de um `LinearLayout`. Os métodos concretos (`adicionarItem`,
`removerItem`, `atualizarItem`, `limpar`, `getItens`) cuidam de manter os dois
em sincronia; as subclasses implementam o que é específico de cada tipo:
montar o diálogo de adicionar/editar, inflar a view do item e fornecer as
mensagens de Toast. O hook `onListaAlterada()` (adicionado na v5.3.0) permite
que a subclasse atualize resumos na tela a cada mudança.

**`ServicosManager`** implementa a seção de Serviços. No construtor carrega os
102 serviços do `servicos.json` (via `ServicosCache`) e os converte em objetos
`ServicoRDO` que servem de "catálogo" para o `AutoCompleteTextView`. Suporta
dois modos: serviço do catálogo (descrição obrigatoriamente da lista) ou
**serviço customizado** (nome livre + unidade escolhida + HH manual opcional).

**`MateriaisManager`** é o mais simples: descrição livre + quantidade +
unidade de `AppConstants.UNIDADES_MATERIAL`.

### Achados

**🟠 Alto — o campo de busca de serviço fica travado (somente leitura) depois de marcar e desmarcar "customizado"**

`ServicosManager.kt:61-77`. O XML define
`android:inputType="textNoSuggestions"` no `AutoCompleteTextView`, ou seja,
editável. O listener do checkbox, no ramo *desmarcado*, faz
`autoCompleteServico.inputType = android.text.InputType.TYPE_NULL` — e
`TYPE_NULL` deixa o campo **não editável** (o teclado não abre).

*Cenário concreto:* o usuário abre "Adicionar Serviço", marca "serviço
customizado", muda de ideia e desmarca. A partir daí o campo de busca não
aceita digitação, e a única forma de escolher entre os 102 serviços é
rolar o dropdown inteiro — ou fechar e reabrir o diálogo. O estado inicial
está correto (o listener ainda não disparou), então o problema só aparece
depois do ciclo marcar→desmarcar.

A intenção provável era forçar a seleção pela lista, mas digitar é justamente
o mecanismo de filtro do autocomplete; desligar a digitação inutiliza a busca.

**🟡 Médio — a unidade dos serviços é adivinhada por substring da descrição, e esse palpite vai para o Google Sheets**

`ServicosManager.carregarServicos():298-319`. O `servicos.json` — fonte única
de verdade — só tem `descricao` e `coeficiente`; **não tem unidade**. O manager
infere a unidade com uma cadeia de seis `contains()`. Rodando a heurística
contra os 102 serviços reais:

| Unidade inferida | Qtd |
|---|---|
| `uni` (default) | 75 |
| `m` | 19 |
| `m²` | 8 |
| `m³` | **0 — inalcançável** |

Casos claramente errados que a heurística produz hoje:

- `Corte De Trilho` → **m** (é contagem por corte)
- `Serv Furação De Trilho` → **m** (por furo)
- `Serv Subst Placa Duplo Enc Contra Trilho` → **m** (por placa)
- `Nivelamento E Alinhamento Manual De AMV` → **m** (por AMV)
- `Serv Encaixe Pedra Manual Em AMV` → **m²** (por AMV)
- `Descarga De Pedra Britada` → **m²** (lastro é volume → m³, que a
  heurística nunca gera)

*Impacto:* a unidade **não** participa do cálculo de HH (que é
`quantidade × coeficiente`), então as horas não estão erradas por causa
disso. Mas ela **é gravada na aba `Servicos` do Sheets**
(`SheetsConstants.kt:50`, `SheetsRelatedDataManager.kt:67`) e aparece nos
relatórios — ou seja, contamina o dado de auditoria/medição, não o número de
horas. A correção estrutural é acrescentar `unidade` ao `servicos.json` e
propagá-la pelo `npm run sync-servicos`, eliminando o palpite.
**Documentado no CLAUDE.md nesta sessão.**

**🟡 Médio — `mostrarDialogAdicionar` e `mostrarDialogEditar` são quase idênticos; o refactor da v5.3.0 só chegou no HIManager**

`ServicosManager` tem 108 + 111 linhas com ~90% de sobreposição;
`MateriaisManager`, 51 + 58 linhas na mesma situação. O changelog da v5.3.0
registra exatamente esse conserto no `HIManager` ("~100 linhas duplicadas
entre os diálogos de adicionar e editar — agora é um único
`mostrarDialog(hiAtual, itemView)`"), mas os outros dois managers ficaram
para trás.

O próprio `BaseItemManager` institucionaliza a duplicação, ao declarar
`mostrarDialogAdicionar()` e `mostrarDialogEditar()` como dois abstratos
separados — o `HIManager` teve que contornar isso.

O risco não é teórico: **o bug do `inputType` acima existe só no diálogo de
adicionar**; o de editar não registra o listener e por isso se comporta de
outro jeito. É exatamente o modo de falha que a duplicação produz.

**⚪ Baixo — a lista de unidades existe como constante, mas `ServicosManager` repete o literal duas vezes**

`AppConstants.UNIDADES_MATERIAL` já é
`listOf("uni","m","m²","m³","kg","L","cx","PC")` e o `MateriaisManager` a usa.
O `ServicosManager` reescreve o mesmo literal em `:55` e `:196` — três cópias
da mesma lista.

Junto disso: o `CLAUDE.md` descrevia o `MateriaisManager` como tendo 4
unidades ("KG, M³, M, UN"); são 8. **Corrigido nesta sessão.**

**⚪ Baixo — editar um item o move para o fim da lista**

`BaseItemManager.atualizarItem():66-71` remove o antigo e chama
`adicionarItem(itemNovo)`, que faz `add()` no fim da lista e `addView()` no
fim do container. Editar o 1º de 5 serviços o joga para a 5ª posição — na
tela, no banco e na ordem enviada ao Sheets. Lista e views continuam
coerentes entre si (não corrompe nada), mas a ordem de lançamento se perde.

**⚪ Baixo — unidade fora da lista é trocada por "uni" silenciosamente ao editar**

`ServicosManager:214-217` e `MateriaisManager:123-126` fazem
`unidades.indexOf(atual.unidade)`; quando dá -1, o spinner fica em 0 ("uni") e
ao confirmar o item é salvo com a unidade trocada, sem nenhum aviso.
Alcançável ao editar um item vindo de RDO antigo ou de modelo cuja unidade
não esteja mais na lista.

**⚪ Baixo — 4 métodos públicos mortos em `ServicosCache`**

`clearCache()`, `getCount()`, `findByDescricao()` e `search()` não têm
chamadores. Detalhar no **Fragmento 9** (utils), já que o arquivo pertence
àquele escopo — anotado aqui porque é a fonte de dados desta camada.

### Observação estrutural (para o Fragmento 36)

`carregarServicos()` **descarta o `coeficiente`** ao converter
`Servico(descricao, coeficiente)` → `ServicoRDO(descricao, 0.0, unidade)`. Isso
é por desenho — o coeficiente é reaplicado do lado do dashboard por
`enriquecerServicosComCoeficientes()` — mas a consequência é que **a string
`descricao` é a chave de junção entre app e dashboard**. Renomear um serviço
no `servicos.json` faz os RDOs históricos perderem o coeficiente
silenciosamente. Vou conferir o outro lado dessa junção nos Fragmentos 19 e 36.

### O que está bem resolvido

- `getItens()` devolve `itensAdicionados.toList()` — cópia imutável, então a
  UI externa não consegue mutar a lista interna do manager.
- `removerItem()` mantém lista e views em sincronia mesmo com itens
  estruturalmente idênticos: remove o primeiro igual da lista e a view
  clicada; como os itens são iguais, o resultado é indistinguível. É um
  contraste interessante com o problema achado no `CalculadoraHHViewModel`
  (Fragmento 1), que usa `filter { it != x }` e apaga **todos** os iguais.
- Validação de quantidade centralizada em `ValidationHelper.validarQuantidade()`
  nos dois managers, em vez de reimplementada.
- `ServicosCache` usa `@Volatile` + double-checked locking corretamente, e
  degrada para lista vazia se o JSON falhar, em vez de derrubar o app.

---

## Fragmento 4 — Horas Improdutivas

**Escopo:** `domain/managers/HIManager.kt` (394),
`domain/managers/JustificativasHIManager.kt` (154),
`res/raw/justificativas_hi.json` (16 justificativas, 3 categorias). Conferidos
como apoio: `JustificativasHIManagerTest.kt`, `ValidationHelper.validarParHorario`,
`AppConstants`, e as cópias do catálogo em `dashboard/`.

### O que essa camada faz

É onde mora a regra de negócio mais delicada do sistema, e o desenho é
**template-driven**: o `justificativas_hi.json` é a fonte única de verdade, e
cada justificativa carrega a própria regra de cálculo — `fatorHH` (Chuva =
0,5), `minutosMinimos` (trem = 20), `considerarHI` (falso para os neutros) e
`considerarPerdaRumo`. Reclassificar uma justificativa é editar uma linha do
JSON; nenhum código muda. As 3 categorias são Não Controlável, Controlável e
Neutro.

**`JustificativasHIManager`** é um `object` que carrega o catálogo (com cache
`@Volatile` + double-checked locking) e o consulta. As funções de consulta são
**puras** — recebem o catálogo por parâmetro — o que as torna testáveis na JVM
sem `Context`; só `carregar()` toca em recursos Android. O `resolver()` faz
uma cascata id → nome exato → alias → nome normalizado (minúsculo, sem acento
e sem pontuação), que é o mecanismo pelo qual RDOs antigos continuam
classificados corretamente sem migração de dados. Também guarda as 5
justificativas usadas recentemente em `SharedPreferences`.

**`HIManager`** implementa a seção de HI no formulário do RDO: chips agrupados
por categoria com busca rápida e "recentes" no topo, um diálogo único que
serve para adicionar, editar e duplicar, e a linha de resumo
`Total: X HH improdutivas · Y HH neutras` abaixo da lista.

### Achados

**🟡 Médio — HI com justificativa fora do catálogo desaparece dos dois totais do resumo**

`HIManager.hhDe():63-72` começa com
`if (justificativa?.ehNeutra != apenasNeutras) return 0.0`. Quando
`resolver()` devolve null (tipo fora do catálogo e sem alias que case), tanto
`null != false` quanto `null != true` são verdadeiros — então a HI contribui
**0.0 para `getTotalHHImprodutivas()` e 0.0 para `getTotalHHNeutras()`**. Ela
simplesmente some do resumo, sem aviso.

O ponto interessante é que isso **contradiz o contrato do próprio
`JustificativasHIManager`**, que trata o desconhecido como "conta
integralmente":

- `considerarHI()` (:101-102) devolve `resolver(...)?.considerarHI ?: true`
- `calcularHH()` (:126) tem um ramo dedicado:
  `if (justificativa == null) return (minutos / 60.0) * operadores`
- e `JustificativasHIManagerTest:123` **afirma explicitamente**
  `assertTrue(JustificativasHIManager.considerarHI(catalogo, "Tipo Legado Qualquer"))`

Ou seja: o teste unitário passa — porque exercita o manager isolado — enquanto
o único consumidor real faz o oposto. E aquele ramo `justificativa == null` de
`calcularHH` é **inalcançável a partir do `HIManager`**, já que `hhDe` retorna
antes de chegar lá. É exatamente o tipo de divergência que teste de unidade
sozinho não pega.

Cenário alcançável: o próprio diálogo trata `tipoOriginalDesconhecido` (:156),
reconhecendo que existem RDOs com tipo fora do catálogo (registros anteriores
à v5.3.0, ou carregados via `ModeloLoader`).

*Impacto contido:* grep confirma que `getTotalHHImprodutivas()` e
`getTotalHHNeutras()` só são consumidos dentro do próprio `HIManager`, em
`onListaAlterada()`, para a linha de resumo. Não afetam o que é gravado no
banco nem o cálculo do dashboard. Mas é o número que o encarregado vê enquanto
preenche o RDO.

**🟡 Médio — o app soma HIs sobrepostas; o dashboard funde. Os dois números divergem para o mesmo RDO**

`getTotalHHImprodutivas()` faz `sumOf` item a item, sem tratar sobreposição de
intervalos. O dashboard, por outro lado, usa `_mergeHIIntervals()` (sweep
line) e, quando há sobreposição, `Math.max()` dos operadores — justamente para
não contar as mesmas horas duas vezes (uma turma é um grupo só).

Consequência: um RDO com duas HIs que se sobrepõem no tempo mostra no app um
total maior do que o dashboard vai apurar depois. Confirmar o lado do
dashboard no **Fragmento 19**.

**⚪ Baixo — `AppConstants.DEFAULT_COLABORADORES_HI = 12` está morto; o `HIManager` define a própria constante**

`AppConstants.kt:136` declara `DEFAULT_COLABORADORES_HI = 12` e ninguém a usa.
O `HIManager` tem a sua `OPERADORES_PADRAO = 12` (:392), aplicada em 4 lugares
(:67, :257, :296, :341). Duas constantes para o mesmo conceito, uma delas sem
chamadores — se um dia a composição padrão da turma mudar, é fácil ajustar a
errada.

**⚪ Baixo — faixa de operadores `1..20` hardcoded**

`HIManager:298` valida com números mágicos, embora `AppConstants` seja
justamente o lugar das faixas de validação (`VALID_HOUR_RANGE`,
`VALID_MINUTE_RANGE` estão lá).

**⚪ Baixo — `tvVazio` acumula duas funções e se contamina**

A linha 229 usa `tvVazio` como estado-vazio da busca
(`visibility = if (exibidas == 0) VISIBLE else GONE`), enquanto as linhas
268-272 **sobrescrevem o texto dele** com o aviso "Justificativa atual (...)
não está no catálogo". Dois efeitos: (a) o aviso desaparece assim que o
usuário digita qualquer coisa na busca, e (b) se depois uma busca não retornar
resultados, o estado-vazio exibe o aviso obsoleto em vez de uma mensagem de
"nenhuma justificativa encontrada".

### O que está bem resolvido

- **O catálogo está em sincronia** entre o app e as duas cópias no dashboard
  (`dashboard/justificativas_hi.json` e `dashboard/js/justificativas-hi-data.js`)
  — verificado por diff normalizado: a única diferença é `1.0` vs `1` na
  serialização JSON, semanticamente idêntico. 16 justificativas dos dois
  lados, batendo com o que o CLAUDE.md documenta.
- O design template-driven cumpre o que promete: as regras de negócio
  (`fatorHH`, `minutosMinimos`, `considerarHI`, `considerarPerdaRumo`) saem do
  JSON, não do código.
- `resolver()` com cascata id → nome → alias → normalizado resolve bem o
  problema dos RDOs históricos, e os aliases no JSON cobrem os nomes antigos
  reais ("Passagens de Trem", "Almoço/Refeição", "Deslocamento a Pé"…).
- `JustificativasHIManager` isola corretamente as consultas puras da única
  função que toca `Context` — é o que viabiliza os 18 testes JVM existentes.
- `HIManager` é o **único** dos managers que já fez o refactor de diálogo
  único (`mostrarDialog(hiAtual, itemView, modo)` cobrindo adicionar/editar/
  duplicar), em contraste direto com Serviços e Materiais (Fragmento 3).
- `corSegura()` protege contra cor inválida vinda do JSON em vez de deixar
  `Color.parseColor` lançar exceção.
- `considerarPerdaRumo` não é lido pelo código do app (só pelo dashboard) —
  não é código morto, é campo de um catálogo compartilhado entre os dois.

**Sem drift de documentação neste fragmento:** o que o CLAUDE.md descreve
sobre HI confere com o código.

---

## Fragmento 5 — Transportes + ModeloLoader + RDOValidator

**Escopo:** `domain/managers/TransportesManager.kt` (219),
`domain/managers/ModeloLoader.kt` (135), `domain/managers/RDOValidator.kt`
(211). Conferidos como apoio: `utils/ValidationHelper.kt`,
`utils/TimeValidator.kt` e os 4 layouts `dialog_adicionar_*.xml`.

### O que esses arquivos fazem

**`RDOValidator`** é o único componente de domínio do app escrito como lógica
100% pura: recebe um `RDOFormData` (snapshot dos campos coletado pelo Fragment)
e devolve um `RDOValidationResult`, sem tocar em nenhuma view. O resultado é
uma `sealed class` com três estados — `Valid`, `Error(campo, mensagem,
setFieldError)` e `ConfirmacaoNecessaria(tipo, título, mensagem)`. As
confirmações cobrem dois casos legítimos de campo: KM final menor que o
inicial (turma trabalhando em sentido decrescente) e horário de fim menor que
o de início (turno cruzando meia-noite). O `RDOFragment` reenvia o formulário
com a flag de confirmação ligada depois que o usuário aceita, o que torna a
revalidação idempotente.

A regra de negócio central: quando `houveServico = true`, o RDO exige tema de
DDS, horários válidos e **pelo menos um serviço, um material e um
equipamento**; quando é `false`, exige observações. `nomeColaboradores` é
sempre obrigatório.

**`TransportesManager`** é a seção de manejo de sucatas — descrição,
quantidade de colaboradores, par de horários e par de KM. É o manager que mais
delega validação ao `ValidationHelper` (`validarColaboradores`,
`validarParHorario`, `validarParKM`), sem regra inline.

**`ModeloLoader`** implementa o "usar RDO anterior como modelo": recebe um
`RDODataCompleto` e despeja seus valores no formulário, através de um objeto
`FormularioViews` com as 22 views e dos 4 managers de lista.

### Achados

**🟡 Médio — os três diálogos de edição (Serviço, Material, Transporte) se identificam como "Adicionar"; o fix registrado na v5.1.6 não está no código**

Os títulos são texto fixo no XML e **não têm `android:id`**, então nem seria
possível trocá-los em runtime sem editar o layout:

| Layout | Título | Botão confirmar |
|---|---|---|
| `dialog_adicionar_servico_rdo.xml` | `:11` "Adicionar Serviço" (sem id) | `:139` "Adicionar" |
| `dialog_adicionar_material_rdo.xml` | `:11` "Adicionar Material" (sem id) | `:81` "Adicionar" |
| `dialog_adicionar_transporte_rdo.xml` | `:16` "Adicionar Transporte" (sem id) | `:180` `@string/adicionar` |
| `dialog_adicionar_hi_rdo.xml` | `:15` **`tvTituloHI` (com id)** | `:199` sobrescrito em runtime |

Os `mostrarDialogEditar()` dos três managers não alteram título nem botão. Só
o `HIManager` faz certo, definindo o título por modo (Adicionar / Editar /
Duplicar) e trocando o botão para "Salvar" ao editar.

O `CLAUDE.md`, na entrada da v5.1.6, afirma: *"Fix: `TransportesManager` —
dialog de edição exibia 'Adicionar' em vez de 'Editar'"*. **Esse fix não
existe no código atual** — nem em Transportes, nem nos outros dois.
**Anotado no CLAUDE.md nesta sessão.** É a mesma raiz do achado do Fragmento
3: o refactor chegou no HI e parou ali.

**🟡 Médio — `validarParKM` proíbe KM decrescente nos transportes, enquanto o RDO explicitamente o permite**

`ValidationHelper.validarParKM:103` bloqueia de forma dura:
`if (kmFim <= kmInicio) return "KM de fim deve ser maior que KM de início"`.

Mas o `RDOValidator:120-126` **permite** `kmFim < kmInicio` no cabeçalho do
RDO, pedindo apenas confirmação — e a mensagem do diálogo diz literalmente
*"Isso pode acontecer caso o estejam trabalhando em sentido decrescente"*.

Ou seja, o app reconhece o sentido decrescente como cenário válido no RDO, mas
**a turma que trabalha nesse sentido não consegue lançar o transporte de
sucata no mesmo trecho** — é rejeitado sem escapatória. O `<=` também impede
um transporte que carrega e descarrega no mesmo KM.

**🟡 Médio — `causaNaoServico` não é validado, não é sincronizado e ninguém o lê**

`RDOFormData` **nem tem esse campo**, então o `RDOValidator` não teria como
checá-lo. O `RDOFragment` o inicializa como `""` (`:321`, `:1105`, `:1173`) e
só o preenche se o usuário tocar num dos rádios — logo, é possível salvar um
RDO com `houveServico = false` sem atribuir a causa (RUMO ou ENGECOM), que é
justamente a informação de negócio que justifica o dia sem produção.

E o destino do dado é um beco sem saída: pelo levantamento do Fragmento 1, os
únicos pontos que tocam o campo são o model, o `DatabaseHelper` (escrita e
leitura) e o `RDOFragment` (UI). Ele **não vai para o Sheets** (removido dos
headers na v6, o próprio CLAUDE.md documenta) e não entra no
`RDORelatorioUtil`. Na prática é um **dado write-only**: o app pede ao
usuário, guarda localmente, e nenhum consumidor jamais lê. Vale decidir entre
sincronizar ou remover da UI.

**⚪ Baixo — a validação "diferença de horários não pode ultrapassar 24 horas" é inalcançável**

`RDOValidator:174` testa `diferencaHoras > 24`, mas
`TimeValidator.calcularDiferencaHoras` nunca devolve mais que 23,98 h:

- mesmo dia: `fim - inicio`, no máximo 1439 min;
- overnight: `(1440 - inicio) + fim`, e como esse ramo só roda quando
  `fim < inicio`, o máximo também é 1439 min.

Logo a condição nunca é verdadeira — é uma proteção documentada que não
existe. Ganha relevância porque a entrada do Dashboard v2.5.2 afirma que o
`novo-rdo.js` "espelha o `RDOValidator.kt` (… diferença > 24h bloqueante …)":
os dois lados implementam a mesma regra morta. Confirmar no **Fragmento 25**.

**⚪ Baixo — `ModeloLoader` descarta equipamentos em silêncio**

`ModeloLoader:56-63` casa o tipo do equipamento por string exata num `when`
com 4 opções e **sem ramo `else`**. Qualquer tipo fora dessas quatro (grafia
diferente, acento, tipo novo) é ignorado sem log nem aviso — e o Toast final
ainda diz "Modelo carregado com sucesso!".

**⚪ Baixo — `ModeloLoader` copia os transportes mas não as flags que os governam**

O loader popula o `transportesManager` com os transportes do modelo, mas não
restaura `houveServico`, `houveTransporte` nem `observacoes`. Como as flags
voltam ao default, é possível terminar com a lista de transportes preenchida e
`houveTransporte = false` — um estado incoerente que seria gravado no banco e
enviado ao Sheets ("não houve transporte" + 3 transportes). O comportamento
exato depende de como o `RDOFragment` monta o `RDOData`; **confirmar no
Fragmento 12** antes de fechar a severidade.

**⚪ Baixo — `selecionarSpinnerPorValor` falha em silêncio**

Se o valor do modelo não existir no adapter, o spinner simplesmente fica na
posição 0. Para Turma e Encarregado isso é benigno (o `RDOValidator` rejeita a
posição 0 e obriga o usuário a escolher), mas `spinnerStatusOS` e
`spinnerClima` **não são validados** — ali um valor não encontrado vira
silenciosamente o primeiro item da lista.

**⚪ Baixo — `String.format` sem `Locale` no `RDOValidator`**

`:124` monta a mensagem do diálogo com `String.format("%.1f", ...)` sem
`Locale` explícito, diferente do padrão já adotado em `HIManager.formatarHH` e
`TransporteItem.calcularDistanciaFormatada`. Afeta só o texto do diálogo.

**Nota de UX (não é bug):** `nomeColaboradores` é validado **depois** do bloco
`houveServico`, então quem esqueceu os colaboradores é avisado primeiro sobre
serviços, materiais e equipamentos, e só descobre o campo faltante no fim.

### O que está bem resolvido

- `RDOValidator` é genuinamente lógica pura — `RDOFormData` entra,
  `RDOValidationResult` sai, zero dependência de Android. É o componente mais
  testável do app e, ainda assim, **não tem nenhum teste** (anotar para o
  Fragmento 17).
- O desenho da `sealed class` separa bem as responsabilidades: o validador
  decide *o que* dizer, o Fragment decide *como* mostrar; e o campo `campo`
  permite `requestFocus` sem que o validador conheça views.
- As duas confirmações são idempotentes via flags no `RDOFormData`, então
  revalidar depois do aceite do usuário não reabre o mesmo diálogo — e as duas
  podem ocorrer em sequência sem conflito.
- `TransportesManager` é o manager que melhor delega: toda a validação sai do
  `ValidationHelper`, sem regra inline duplicada.
- `KmInputMask` e `TimeInputMask` são aplicados nos **dois** diálogos
  (adicionar e editar) — apesar da duplicação de código, não houve
  esquecimento aqui.

---

## Fragmento 6 — Checklist de Qualidade

**Escopo:** `domain/managers/ChecklistManager.kt` (224),
`res/raw/checklist_solda.json`, `res/raw/checklist_dormente.json`,
`app/src/test/.../ChecklistManagerTest.kt` (238, 15 testes).

### O que essa camada faz

Reproduz dentro do app o formulário de auditoria que os fiscais da RUMO usam
para inspecionar as O.S, para que a turma se autoinspecione **antes** da
vistoria. Como o catálogo de HI, é template-driven: as perguntas moram nos
JSONs, e o `ChecklistManager` é lógica pura em cima deles.

**Estrutura dos templates** (conferida item a item):

| Template | Seções | Itens | Repetível |
|---|---|---|---|
| `solda` | Localização e Atividade (3) · Inspeção por Solda (14) · Boletim e Fechamento (6) | 23 | sim, "por_solda" |
| `dormente` | Localização e Marcação (4) · Qualidade do Serviço (7) · Boletim e Fechamento (7) | 18 | **nenhuma** |

As quatro funções centrais:

- **`avaliar()`** conta não conformidades (e quantas são de itens críticos) e
  devolve o veredito. Cada item declara em `naoConforme` qual resposta o
  reprova; `naoConforme` vazio significa item **informativo**, que nunca
  reprova. "Não Aplicável" e resposta em branco também nunca reprovam.
- **`validar()`** devolve a lista de pendências de preenchimento — resposta
  faltando, observação obrigatória (quando a resposta é não conforme ou quando
  o template define `observacaoObrigatoriaQuando`) e foto obrigatória (quando
  o template exige, ou como **evidência** de uma não conformidade).
- **`podarRespostasExcedentes()`** limpa respostas de índices além de
  `qtdSoldas` quando o usuário reduz o stepper, devolvendo os caminhos das
  fotos órfãs para o chamador apagar.
- **`tiposParaServicos()`** decide, a partir das descrições dos serviços do
  RDO, qual(is) checklist(s) oferecer.

As respostas ficam num mapa plano com chave `secaoId__itemId` (ou
`secaoId__índice__itemId` nas seções repetíveis).

### Achados

**🟡 Médio — `tiposParaServicos()` deixa de oferecer o checklist de dormente por causa das abreviações do catálogo de serviços**

A detecção casa **substring** dos termos de `ChecklistManager.TIPOS` contra a
descrição livre do serviço. Só que o `servicos.json` abrevia. Rodando o
matcher contra os 102 serviços reais:

- 13 serviços casam `"dormente"` corretamente (Substituição Dormente, Carga
  Dormente…);
- **`Serv Reesp Dorm AMV`** — reespaçamento de dormente em AMV — **não casa**,
  então o RDO com esse serviço nunca oferece a autoinspeção de dormente;
- `Serv Subst Fixação Rígida Dorm P/Elástica` também não casa (caso
  fronteiriço — é fixação, não dormente em si);
- e há dois falsos-negativos benignos, que *não deveriam* mesmo oferecer o
  checklist: `Limp Parcial Lastro Cota Inf Dor Estreit` e
  `Limp Parc Lastro Cot Inf Dorm Mist C Bid` (limpeza de lastro).

O trade-off é o problema: acrescentar o termo `"dorm"` resolveria o caso
legítimo, mas traria os dois de limpeza de lastro junto. Casar substring de
texto livre é frágil por construção — o robusto seria declarar o tipo de
checklist no próprio `servicos.json`, que já é a fonte única de verdade dos
serviços.

O modo de falha agrava: é **silencioso**. Não há erro nem aviso, o checklist
simplesmente não é oferecido. Como o propósito da feature é lembrar a turma de
se autoinspecionar antes da vistoria da RUMO, deixar de oferecer é exatamente
o resultado que ela existe para evitar. **Documentado no CLAUDE.md nesta
sessão.**

Para solda não há falso-negativo — os 6 serviços "Solda Alumin …" casam todos.
Há um provável falso-**positivo**: `Alívio De Tensões Em Trilho Longo Soldado`
casa por `"soldado"`. Pode ser legítimo (alívio de tensões em TLS envolve
corte e resolda); fica a critério do negócio.

Nota menor: dos três termos de solda (`"solda"`, `"soldado"`, `"aluminot"`),
só o primeiro faz trabalho — `"soldado"` já contém `"solda"` como substring, e
todo serviço aluminotérmico começa com "Solda Alumin". Redundância inofensiva.

**⚪ Baixo — o KDoc de `avaliar()` descreve uma regra mais estreita que o código**

O comentário diz: *"Reprova se houver qualquer item crítico não conforme OU
qualquer não conformidade nos itens técnicos por solda"*. O código faz
`if (naoConformidades > 0) REPROVADA`, contando **todas** as seções.

A discrepância é maior no dormente, que **não tem nenhuma seção de
repetição**: pelo KDoc, só os 3 itens críticos reprovariam; na prática os 7
itens de "Qualidade do Serviço" também reprovam. O código está correto (bate
com o CLAUDE.md, "Reprovada se houver qualquer não conformidade") — quem está
errado é o comentário.

**⚪ Baixo — `qtdSoldas` governa todas as seções de repetição, não só as de solda**

`avaliar()`, `validar()` e `podarRespostasExcedentes()` iteram
`0 until preenchido.qtdSoldas` para **qualquer** seção com
`tipo: "repeticao"`. Hoje só o template de solda tem repetição, então funciona
— mas o campo (e o nome) amarram um modelo genérico a um tipo específico. Um
futuro `checklist_amv.json` com seção repetível herdaria a contagem de soldas.

**⚪ Baixo — `cache` sem proteção de concorrência, divergindo do manager irmão**

`ChecklistManager.cache` é um `mutableMapOf` num `object` singleton, sem
`@Volatile` nem `synchronized`, enquanto o `JustificativasHIManager` — mesmo
padrão, mesmo pacote, mesma responsabilidade — usa `@Volatile` +
double-checked locking. Risco prático baixo (o carregamento ocorre na UI
thread), mas é inconsistência entre dois componentes gêmeos.

**⚪ Baixo — `tiposParaServicos()` não tem teste**

Os 15 testes cobrem bem `ehNaoConforme`, `avaliar`, `validar` e
`podarRespostasExcedentes`, inclusive casos de borda como polaridade invertida
e índices além de `qtdSoldas`. Mas **não cobrem `tiposParaServicos()`** — que
é justamente onde está o achado médio acima. `comResposta()` também não é
testada (trivial).

### Ponto de atenção para o Fragmento 15

`avaliar()` e `validar()` iteram `0 until qtdSoldas`. Se a UI permitir
`qtdSoldas = 0`, um checklist de solda pode ser salvo como **Aprovada** sem
nenhuma solda inspecionada, bastando responder o fechamento. Verificar o
mínimo do stepper na `ChecklistInspecaoActivity`.

### Risco sistêmico (documentado, não é bug)

O checklist é gravado **apenas no SQLite local** — não vai para o Sheets nem
para o dashboard. Diferente do `causaNaoServico` (Fragmento 5), aqui o dado ao
menos é relido pelo próprio app. Ainda assim, perder ou resetar o aparelho
apaga todas as autoinspeções, e a gestão não tem nenhuma visibilidade sobre
elas — o que limita bastante uma feature cujo propósito é antecipar a
auditoria da RUMO. O CLAUDE.md já registra o sync como etapa futura.

### O que está bem resolvido

- **Templates bem formados.** `fotos_medidas` declara `tipo:"foto"` +
  `foto:true` + `fotoObrigatoria:true` — as três são necessárias, porque
  `validar()` avalia `item.foto && (item.fotoObrigatoria || naoConforme)`;
  esquecer `foto:true` tornaria a obrigatoriedade silenciosamente inócua.
  Não é o caso em nenhum dos dois templates.
- A semântica de `naoConforme` vazio = informativo está aplicada exatamente
  nos itens que o CLAUDE.md cita como o bug corrigido na v5.2.0
  (`turma_no_local`, `ordem_marcada_pcm`, `material_reemprego` — todos com
  `naoConforme` vazio).
- Inversões de polaridade corretas onde o negócio exige: `dormentes_balanco`,
  `defeito_aparente` e `quantidade_inferior` usam `naoConforme: "Sim"`.
- O separador de chave `__` é seguro: nenhum id de seção ou item contém
  underscore duplo, então o parse de índice em `podarRespostasExcedentes` é
  inequívoco.
- `podarRespostasExcedentes()` **devolver** as fotos órfãs em vez de apagá-las
  é a decisão certa — mantém o manager livre de I/O e testável na JVM.
- O item de `tipo:"opcoes"` (`local_checklist`) declara suas opções
  (`["Papel","App"]`); um `tipo:"opcoes"` sem `opcoes` deixaria o usuário sem
  como responder e o `validar()` bloquearia o salvamento para sempre.
- 15 testes JVM de lógica pura, batendo com o número que o CLAUDE.md afirma.

---

## Fragmento 7 — Sincronização Google Sheets

**Escopo:** `services/GoogleSheetsService.kt` (329), `SheetsConstants.kt` (105),
`SheetsHeaderManager.kt` (193), `SheetsLookupHelper.kt` (48),
`SheetsRelatedDataManager.kt` (282), `SheetsAuditService.kt` (251).
Conferidos como apoio: `app/build.gradle.kts`, `.gitignore`,
`utils/UpdateDownloader.kt`, e a visibilidade do repositório/Releases no GitHub.

### O que essa camada faz

`GoogleSheetsService` é uma facade que autentica na Sheets API v4 com uma
credencial de conta de serviço e delega para 5 helpers especializados. O fluxo
de `syncRDO()`:

1. Valida campos obrigatórios (`numeroRDO`, `data`, `numeroOS`).
2. `findRowNumberByNumeroRDO()` procura a linha pelo **Número RDO** (coluna B da
   aba RDO) — aceitando um `numeroRDOAntigo` para suportar edição de data/O.S.
3. Achou → `updateRDOInSheet()`; não achou → `insertRDOInSheet()`.
4. Nos dois casos, `insertRelatedData()` grava as 6 abas relacionadas
   (Servicos, Materiais, HI, Transportes, Efetivo, Equipamentos).
5. `logSyncAction()` registra INSERT/UPDATE/DELETE/ERROR na aba AuditoriaSync.

Deleção é **lógica**: a coluna S ("Deletado") recebe "Sim"; a linha permanece.
`SheetsHeaderManager` garante que as 9 abas existam e que os headers estejam na
versão esperada. `SheetsAuditService` cuida da auditoria, da proteção por versão
de app e da limpeza de órfãos usada pelo `DataCleanupWorker`.

### Achados

**🔴 CRÍTICO (segurança) — a chave da conta de serviço Google é distribuída publicamente dentro do APK**

Cadeia confirmada ponto a ponto:

1. `GoogleSheetsService.initialize()` lê a credencial de
   `context.assets.open(ARQUIVO_CREDENCIAIS)` — ou seja, o arquivo JSON da conta
   de serviço **é empacotado no APK**.
2. O escopo pedido é `SheetsScopes.SPREADSHEETS` — **leitura e escrita**.
3. O `.gitignore` mantém o JSON fora do repositório (`app/src/main/assets/*.json`)
   e tem o comentário *"APKs — contêm credenciais nos assets, usar GitHub
   Releases"*, o que mostra que a exposição foi percebida e a mitigação
   escolhida foi distribuir por Releases.
4. **Mas o repositório é público** — confirmado pela API do GitHub
   (`private: false`, `visibility: "public"`) — e portanto os Releases também
   são. As notas de release listam `app-release.apk` publicamente desde a
   v5.1.4 (março/2026), incluindo a v5.4.0 atual.
5. Um APK é um arquivo zip e **assets não são ofuscados pelo ProGuard** — a
   ofuscação atinge bytecode, não recursos.
6. O ID da planilha está em `app/build.gradle.kts:24`
   (`buildConfigField GOOGLE_SHEETS_ID`), arquivo versionado no mesmo
   repositório público.

Resultado: a credencial que dá acesso de leitura e escrita à planilha de
produção está publicamente disponível há meses, junto com o identificador da
planilha. **A chave precisa ser considerada comprometida e rotacionada**, e a
rotação sozinha não resolve — qualquer APK novo carrega a chave nova.

*Agravante secundário:* a aba `Config` comanda a atualização automática
(`url_download`, `hash_md5`, `forcar_update`). Quem escreve na planilha controla
**tanto a URL do APK quanto o hash esperado**, e o `UpdateDownloader` valida o
hash contra esse mesmo valor — não há âncora de confiança independente nem
allowlist de URL. O que limita o dano aqui é o Android: uma atualização assinada
com outro certificado é recusada por cima do app instalado. Ainda assim, o
caminho de "atualização forçada apontando para binário arbitrário" existe e não
deveria depender só dessa checagem do sistema.

**Correção estrutural sugerida:** o app parar de falar direto com a Sheets API e
passar pelo mesmo proxy que o dashboard já usa (Cloudflare Worker → Apps
Script), mantendo a credencial no servidor. A infraestrutura já existe e está em
produção. Medidas imediatas: revogar a chave atual no Google Cloud, conferir a
quais planilhas essa conta de serviço tem acesso, e avaliar tornar o repositório
privado (paliativo — não resolve, já que qualquer usuário de campo com o APK
também consegue extrair a chave). **Alerta registrado no CLAUDE.md.**

**🟠 Alto — `updateRDOInSheet` apaga os dados relacionados antes de reinserir, sem transação**

Em `GoogleSheetsService:229-241` a atualização é feita como *delete-then-insert*:
primeiro `deleteRelatedDataByNumeroRDO()` remove as linhas das 6 abas, depois
`insertRelatedData()` regrava.

Se a reinserção falhar (rede, cota 429), as linhas apagadas **não voltam**: o
rollback interno do `insertRelatedData` é cirúrgico e só desfaz o que ele mesmo
inseriu — não tem como restaurar o que o delete anterior removeu. E a linha
principal do RDO já foi atualizada antes (`:222-225`).

Estado resultante no Sheets: o RDO existe na aba RDO, mas sem nenhum serviço,
HI, efetivo ou equipamento — ou seja, **um dia que aparece no dashboard como se
não tivesse produzido nada**.

O sistema se auto-cura *se* o retry acontecer: o SQLite local ainda tem tudo, o
RDO fica marcado com erro de sync e, no próximo ciclo, o caminho de UPDATE
regrava. Mas entre a falha e o retry bem-sucedido o dashboard mostra números
errados, e se as tentativas se esgotarem o estado fica assim até intervenção
manual.

**🟡 Médio — a proteção por versão de app é aplicada tarde demais no caminho de UPDATE**

`deleteRelatedDataByNumeroRDO()` (`SheetsRelatedDataManager:192-199`) consulta
`getRDOAppVersion()` e aborta se o RDO na planilha foi escrito por uma versão
mais nova do app. Só que, no fluxo de `updateRDOInSheet`, **a linha principal do
RDO já foi sobrescrita** (`:222-225`) antes de essa checagem rodar (`:232`/`:235`).

Ou seja: um aparelho com versão antiga sobrescreve o cabeçalho do RDO de uma
versão mais nova e **só então** descobre o conflito e lança exceção — deixando a
linha já degradada. O CLAUDE.md (v2.4.0) descreve "apps antigos não deletam
dados de versões novas", o que é verdade para os dados relacionados e falso para
a linha principal.

**🟡 Médio — `initialize()` engole falha de estrutura e mesmo assim retorna sucesso**

`SheetsHeaderManager.ensureSheetsExist()` tem um `catch` abrangente que só loga,
sem relançar (`:49-51`) — e `createHeaders()` e `atualizarHeaders()` seguem o
mesmo padrão. Se a criação das abas ou a escrita dos headers falhar por
completo, `initialize()` ainda devolve `true` e o sync segue contra uma
estrutura possivelmente quebrada, falhando depois com um erro mais confuso e
distante da causa.

**⚪ Baixo — `syncMultipleRDOs()` não tem chamadores**

O KDoc da facade lista o método como parte da "API pública (usada por SyncHelper
e DataCleanupWorker)", mas o `SyncHelper` faz o próprio laço por RDO
(`SyncHelper:220-265`) e nunca o chama. API morta.

**⚪ Baixo — três métodos públicos acessam `lateinit` sem checar inicialização**

`verificarSeRDOExiste()`, `getValidRDONumbers()` e `cleanOrphanedData()`
delegam direto para `lookupHelper`/`auditService`, que são `lateinit`. Chamados
antes de um `initialize()` bem-sucedido, lançam
`UninitializedPropertyAccessException` em vez de um erro compreensível. Hoje os
chamadores inicializam antes (`DataCleanupWorker:49`, `SyncHelper:47`), então é
latente.

**⚪ Baixo — `findRowNumberByNumeroRDO` varre a coluna inteira a cada consulta**

Cada sync de um RDO baixa toda a coluna B da aba RDO; cada
`deleteRelatedDataByNumeroRDO` baixa a coluna A das 6 abas relacionadas.
Sincronizar N RDOs pendentes multiplica isso por N. Como há comentários no
próprio código citando erro 429 (cota), vale registrar que este é o maior
consumidor de chamadas do fluxo.

**⚪ Baixo — o "versionamento" de headers é, na prática, binário**

`detectarVersaoHeaders()` só devolve 0 (ausente ou erro), 1 (divergente) ou
`HEADERS_VERSION` (bate exatamente). Não distingue v2 de v5, então
`HEADERS_VERSION` não habilita migração escalonada — é um "confere / não
confere". Funciona, mas o histórico de comentários da constante (v1…v6) sugere
uma capacidade que não existe. Efeito colateral menor: um erro de rede na
leitura devolve 0, e o `createHeaders` trata isso como "criar", disparando uma
escrita dos mesmos headers.

**⚪ Baixo — `SheetsLookupHelper` tem import e campo mortos**

`import android.util.Log` e `private val tag` nunca são usados no arquivo.

**⚪ Baixo — terceira cópia do "12 colaboradores"**

`SheetsRelatedDataManager:95` usa o literal
`hi.colaboradores.takeIf { it > 0 } ?: 12`. Somando ao Fragmento 4, agora são
três: `HIManager.OPERADORES_PADRAO`, `AppConstants.DEFAULT_COLABORADORES_HI`
(morta) e este literal.

### O que está bem resolvido

- **Todos os 8 conjuntos de headers batem exatamente** com as linhas
  construídas e com os ranges usados — conferido um a um: RDO 22 (A:V),
  Servicos 11 (A:K), Materiais 8 (A:H), HI 10 (A:J), Transportes 11 (A:K),
  Efetivo 11 (A:K), Equipamentos 7 (A:G), Auditoria 7 (A:G). Nenhum
  desalinhamento coluna↔header, e tudo conferindo com a tabela do CLAUDE.md.
- `findRowNumberByNumeroRDO()` **propaga** exceção de rede em vez de devolver
  null, com comentário explicando o porquê — sem isso, uma falha de rede seria
  lida como "não existe" e viraria um INSERT duplicado. Distinção sutil e
  correta.
- O rollback de `insertRelatedData()` é **cirúrgico**: desfaz apenas as abas
  efetivamente inseridas, e quando o próprio rollback falha registra
  `ROLLBACK_FAILED` nomeando as abas que ficaram com dados órfãos.
- `cleanOrphanedData()` tem guard contra `validRDOs` vazio, abortando em vez de
  interpretar "lista vazia" como "tudo é órfão" — defesa exatamente no ponto
  onde uma falha de leitura viraria deleção em massa.
- `deleteSheetRows()` ordena os índices em ordem decrescente e envia **um único
  batchUpdate**, com comentário citando o 429 que motivou a otimização.
- `logSyncAction()` é não-bloqueante por desenho — falha de auditoria nunca
  derruba o sync.
- `updateRDOInSheet()` relê a coluna U antes de sobrescrever, preservando a
  Data de Criação original.
- `credenciaisPresentes()` distingue "credencial ausente do APK" de outros erros
  de inicialização, o que dá uma mensagem de diagnóstico útil em builds de teste.

---
