# Fase 2 — Dashboard: consumir o catálogo de justificativas de HI

> **Como usar este documento:** abra uma conversa nova do Claude Code neste
> repositório e peça para executar a Fase 2 apontando para este arquivo. Ele
> contém todo o contexto necessário — não é preciso reler o histórico da
> conversa em que a Fase 1 foi feita.

## Contexto

A **Fase 1 (app Android, v5.3.0)** já está no `master`. Ela criou o catálogo
`app/src/main/res/raw/justificativas_hi.json` como **fonte única de verdade**
das 16 justificativas de Horas Improdutivas, cada uma com:

| Campo | Significado |
|---|---|
| `id`, `nome` | identificação |
| `categoria` | `NAO_CONTROLAVEL`, `CONTROLAVEL` ou `NEUTRO` |
| `considerarHI` | se as horas entram no total de HI (`false` nos neutros) |
| `considerarPerdaRumo` | se conta como perda atribuída à Rumo |
| `fatorHH` | multiplicador das HH (Chuva = `0.5`) |
| `minutosMinimos` | duração mínima para contar (trens = `20`) |
| `cor`, `icone`, `emoji` | apresentação (`icone` é nome lucide, para o dashboard) |
| `ordem`, `ativa` | exibição |
| `exigeDescricao` | obriga descrição livre (hoje só "Outros") |
| `aliases` | nomes históricos que resolvem para esta justificativa |

O app já grava os **nomes padronizados** na coluna `Tipo` da aba
`HorasImprodutivas`. **Não houve mudança de schema** no Sheets
(`HEADERS_VERSION` continua 6) — a categoria é derivada do catálogo na leitura,
o que faz qualquer reclassificação valer retroativamente.

## Objetivo da Fase 2

Fazer o dashboard parar de adivinhar a classificação por substring e passar a
ler o catálogo. Em particular:

1. **Almoço/Refeição, DDS e Trânsito deixam de contar como HI e como perda.**
   Hoje entram como perda *controlável*, inflando o indicador de perdas
   evitáveis de todas as turmas.
2. As 16 justificativas passam a ser reconhecidas — hoje só "trem" e "chuva"
   são tratadas como não controláveis; **Interstício, Temperatura da Via e
   Aguardando Liberação** aparecem erradamente como controláveis.
3. RDOs antigos continuam classificados corretamente, via `aliases`.

## O problema real: a regra está duplicada em 6 arquivos

Este é o achado que define o tamanho do trabalho. As mesmas regras de negócio
estão espalhadas por seis arquivos, cada um com sua cópia:

**Regra "trem abaixo de 20 min não conta"** — `METAS.MINUTOS_MINIMOS_TREM`:

| Arquivo | Linha |
|---|---|
| `dashboard/js/calculations.js` | 621 |
| `dashboard/js/calendario-tp.js` | 141 |
| `dashboard/js/calendario-ts.js` | 122 |
| `dashboard/js/sheets-api.js` | 479 |
| `dashboard/js/visao-geral.js` | 143 |

**Regra "chuva conta metade"** — `hh / 2` ou `fator 0.5`:

| Arquivo | Linha |
|---|---|
| `dashboard/js/calculations.js` | 651 (`hasChuva`) |
| `dashboard/js/calendario-tp.js` | 164 |
| `dashboard/js/calendario-ts.js` | 145 |
| `dashboard/js/gestao-os.js` | 1343 (`fatorChuva`) |
| `dashboard/js/sheets-api.js` | 490 |
| `dashboard/js/visao-geral.js` | 147 |

**Classificação controlável / não controlável:**

- `dashboard/js/visao-geral.js` linhas 47–52 — `_isNaoControlavel(tipo, descricao)`,
  que hoje é literalmente `t.includes('trem') || t.includes('chuva')`

**Textos fixos que ficam errados** com o catálogo novo (mencionam só trem e chuva):

- `dashboard/js/visao-geral.js` linha 401
- `dashboard/js/visao-geral.js` linha 1039

> Enquanto essas cópias existirem, editar o JSON não muda o dashboard. O
> objetivo da fase 2 é que **todas** passem a consultar o catálogo.

## Plano sugerido

### 1. Sincronizar o catálogo para o dashboard

Criar `scripts/sync-justificativas-hi.js` espelhando o
`scripts/sync-servicos.js` já existente (ler esse arquivo primeiro — o padrão
está pronto). Ele deve gerar dois destinos a partir da fonte única:

```
FONTE:   app/src/main/res/raw/justificativas_hi.json
DESTINO: dashboard/justificativas_hi.json          (fetch normal)
DESTINO: dashboard/js/justificativas-hi-data.js    (fallback CORS, como servicos-data.js)
```

Registrar em `package.json`:

```json
"sync-justificativas": "node scripts/sync-justificativas-hi.js"
```

E incluir no texto do `npm run help`. Os dois arquivos gerados são
**auto-gerados** — marcar no cabeçalho que não devem ser editados à mão, igual
ao `servicos-data.js`.

### 2. Criar o módulo de consulta

Novo `dashboard/js/justificativas-hi.js`, espelhando a API do
`JustificativasHIManager.kt` do app (ver
`app/src/main/java/com/example/calculadorahh/domain/managers/JustificativasHIManager.kt`
— vale portar a lógica, inclusive a normalização):

```js
JustificativasHI.resolver(nome)      // id → nome → alias → normalizado (sem acento/pontuação)
JustificativasHI.considerarHI(nome)  // false para neutros
JustificativasHI.categoria(nome)     // 'NAO_CONTROLAVEL' | 'CONTROLAVEL' | 'NEUTRO'
JustificativasHI.calcularHH(nome, minutos, operadores)  // aplica minutosMinimos e fatorHH
```

`calcularHH` deve concentrar as duas regras hoje duplicadas: descarta se
`minutos < minutosMinimos`, devolve `0` se `!considerarHI`, e multiplica por
`fatorHH`.

**Comportamento para nome desconhecido:** resolver para `null` e, no cálculo,
tratar como HI controlável com fator 1 (é o que o app faz — falha para o lado
seguro, contando a hora em vez de descartá-la silenciosamente).

### 3. Trocar as chamadas nos 6 arquivos

Substituir cada cópia das regras por `JustificativasHI.calcularHH(...)` e cada
`_isNaoControlavel(...)` por `JustificativasHI.categoria(...)`.

Atenção ao **terceiro grupo**: hoje o dashboard só tem o par
controlável/não-controlável (`controlavel: !nc`). Com os neutros, passa a haver
**três grupos**, e os neutros não devem aparecer em nenhum ranking de perdas.
Isso afeta a estrutura `perdasGlobal` / `perdasTurma` em `visao-geral.js`
(por volta da linha 154).

### 4. Nova composição de horas

O gráfico de Composição de Horas e os KPIs precisam separar:

- **Horas Produtivas** (serviços)
- **Horas Improdutivas** (HI que contam como perda)
- **Horas Neutras** (jornada — não reduzem produtividade)

O requisito original é explícito: *"ao calcular perdas ou produtividade, as
Horas Neutras não devem reduzir os indicadores de desempenho"*.

Onde isso aparece: KPIs por tipo TP/TS, Composição de Horas, Scorecard de
turmas, Produtividade por turma, Análise de Perdas (Controláveis × NC), Pareto
/ Top causas, Ranking de performance (`ranking-engine.js`, componente "Eficiência
HI"), Resumo Executivo (`executive-summary.js`) e Apontamentos de HI.

### 5. Atualizar os textos fixos

As linhas 401 e 1039 de `visao-geral.js` descrevem "não controláveis" como
"passagem de trem e chuva". Gerar o texto a partir do catálogo, ou reescrever
para reconhecer as 6 justificativas não controláveis atuais.

### 6. Testes

`tests/calculations.test.js` já existe e roda com `node --test` sem
dependências (`npm test`). Acrescentar casos para:

- neutro (almoço) → `0` HH e fora dos rankings de perda
- chuva → metade das HH
- trem com 19 min → descartado; com 20 min → conta
- alias histórico ("Passagens de Trem", "Almoço/Refeição") → resolve certo
- nome fora do catálogo → conta como controlável, fator 1

Vale espelhar os casos de
`app/src/test/java/com/example/calculadorahh/domain/managers/JustificativasHIManagerTest.kt`
(18 testes), para app e dashboard ficarem provadamente equivalentes.

## Cuidados

- **Não editar** `dashboard/justificativas_hi.json` nem
  `dashboard/js/justificativas-hi-data.js` à mão — são gerados. A fonte é o
  arquivo em `app/src/main/res/raw/`.
- **`config.js` é gitignored.** Se `MINUTOS_MINIMOS_TREM` sair do `METAS` (o
  catálogo passa a ser a fonte), rodar `npm run gen-config-example` para o
  template público não ficar defasado. Manter a chave por retrocompatibilidade
  é aceitável, desde que ninguém mais a leia.
- **Deploy é automático**: qualquer push em `master` que toque `dashboard/**`
  dispara GitHub Actions para Cloudflare Workers (produção) e GitHub Pages.
  Testar local antes: `cd dashboard && python -m http.server 8000` e abrir
  `http://localhost:8000?key=<SECRET_KEY>`.
- **Versão**: bumpar `dashboard/CLAUDE.md` ("Current Version") e o Version
  History do `CLAUDE.md` da raiz. A versão atual do dashboard é **2.5.2**;
  esta mudança é de comportamento de indicadores, então **2.6.0**.
- **Efeito esperado nos números**: os indicadores de perda controlável vão
  **cair** em todas as turmas ao remover almoço, DDS e trânsito, e parte do que
  hoje é controlável migra para não controlável (Interstício, Temperatura da
  Via, Aguardando Liberação). Isso é a correção pretendida, mas vale avisar o
  usuário antes de publicar, porque os relatórios mudam de patamar.

## Duas classificações em aberto

Ao montar o catálogo, **Deslocamento** e **Treinamento** não foram
classificados no pedido original e entraram como **Controlável**. Se o usuário
quiser mudar, é uma linha no JSON (`categoria` e, se for para neutro,
`considerarHI: false` e `considerarPerdaRumo: false`) seguida de
`npm run sync-justificativas`. Vale confirmar com ele no início da fase 2.

## Referências rápidas

| O quê | Onde |
|---|---|
| Catálogo (fonte única) | `app/src/main/res/raw/justificativas_hi.json` |
| Lógica de referência (Kotlin) | `domain/managers/JustificativasHIManager.kt` |
| Testes de referência (Kotlin) | `app/src/test/.../JustificativasHIManagerTest.kt` |
| Padrão de script de sync | `scripts/sync-servicos.js` |
| Cálculos do dashboard | `dashboard/js/calculations.js` (`CalculadoraMedicao`) |
| Onde a classificação é usada | `dashboard/js/visao-geral.js` |
| Testes do dashboard | `tests/calculations.test.js` (`npm test`) |
