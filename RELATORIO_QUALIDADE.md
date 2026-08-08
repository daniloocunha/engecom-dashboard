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
