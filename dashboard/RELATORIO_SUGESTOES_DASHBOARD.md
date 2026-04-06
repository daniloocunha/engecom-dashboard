# Relatorio de sugestoes de implementacao - Dashboard
Data: 2026-04-02

Objetivo
Organizar as sugestoes recebidas e ajustar a descricao para execucao por IA, com criterios claros, dados necessarios e notas tecnicas.

Resumo rapido
1. Foram agrupadas as ideias por area (Gestao de OS, Calendario/Detalhes, Regras de negocio, Visao Geral).
2. Foram adicionados criterios de aceite e dependencias de dados.
3. Foram criados IDs para facilitar planejamento e rastreio.

Ajustes e esclarecimentos aplicados
1. Padronizei termos e removi ambiguidade (ex: "Detalhes do dia" foi mapeado para os modais dos calendarios TP/TS).
2. Troquei simbolos nao ASCII por equivalentes (>= em vez de ≥).
3. Indiquei pontos que exigem definicao de regra ou fonte de dados (ex: conversao de HI em dormentes).

Requisitos organizados (com IDs)

## GO-01 - Destaque urgente na Gestao de OS
Objetivo
Permitir marcar uma OS como urgente e destacar a linha inteira em laranja para revisao rapida.

Comportamento esperado
1. Cada linha da Gestao de OS deve ter um checkbox "Urgente".
2. Quando marcado, a linha recebe estilo laranja (background) e essa marcacao deve persistir.
3. Deve ser possivel desmarcar a qualquer momento.

Dados necessarios
1. Campo booleano "urgente" por OS.
2. Persistencia local (localStorage) e opcionalmente no servidor (Apps Script), seguindo o padrao de status/gevia/notas.

Criterios de aceite
1. Marcacao visual aparece imediatamente ao clicar.
2. Recarregar a pagina mantem a marcacao.
3. A linha inteira muda de cor, nao apenas a celula.

Notas tecnicas
1. Arquivos provaveis: `C:\Users\dan\CalculadoraHH\dashboard\js\gestao-os.js`, `C:\Users\dan\CalculadoraHH\dashboard\css\dashboard.css`.
2. Evitar conflito com cores de status. Usar classe CSS com prioridade menor que status se necessario, ou aplicar um overlay leve.

## CD-01 - Observacoes de servicos customizados no Detalhe do Dia
Objetivo
Exibir observacoes dos servicos customizados no detalhamento diario (modal do calendario).

Comportamento esperado
1. No modal "Detalhe do dia" (TP e TS), cada servico customizado deve exibir sua observacao (quando existir).
2. Se nao houver observacao, o campo nao deve poluir a UI.

Dados necessarios
1. Confirmar o nome da coluna na aba Servicos (ex: "Observacoes", "Observacao", "Obs Servico").
2. Garantir que esse campo seja carregado no objeto de servico.

Criterios de aceite
1. Observacoes aparecem apenas para servicos com valor preenchido.
2. Nao quebra quando o campo estiver ausente.

Notas tecnicas
1. Arquivos provaveis: `C:\Users\dan\CalculadoraHH\dashboard\js\calendario-tp.js`, `C:\Users\dan\CalculadoraHH\dashboard\js\calendario-ts.js`, `C:\Users\dan\CalculadoraHH\dashboard\js\sheets-api.js`.

## RN-01 - Regra de HI: trem somente com duracao >= 20 min
Objetivo
Aplicar a nova regra contratual: somente passagens de trem com duracao >= 20 min contam como HI.

Comportamento esperado
1. Intervalos de trem com duracao menor que 20 min devem resultar em HH = 0.
2. A regra deve ser aplicada em todos os calculos e visualizacoes.
3. Textos de ajuda e logs devem refletir 20 min.

Pontos de atualizacao (mapeados)
1. `C:\Users\dan\CalculadoraHH\dashboard\js\config.js` e `config.example.js`: `MINUTOS_MINIMOS_TREM` de 15 para 20.
2. `C:\Users\dan\CalculadoraHH\dashboard\js\calculations.js`: uso de `METAS.MINUTOS_MINIMOS_TREM` no merge de HI.
3. `C:\Users\dan\CalculadoraHH\dashboard\js\calendario-tp.js` e `calendario-ts.js`: pre-filtro de trem < MINUTOS_MINIMOS_TREM.
4. `C:\Users\dan\CalculadoraHH\dashboard\js\sheets-api.js`: substituir 0.25h por `METAS.MINUTOS_MINIMOS_TREM / 60` e atualizar mensagens.

Criterios de aceite
1. Qualquer trem com 19 min ou menos nao contabiliza HI.
2. Trem com 20 min ou mais contabiliza HI normalmente.
3. Nenhuma tela mostra a regra antiga de 15 min.

## VG-01 - Relacao de OS por turma na Visao Geral (com drill-down)
Objetivo
Exibir, nos controles completos da turma, a lista de OS trabalhadas com HH, HI, status e acesso ao detalhamento.

Comportamento esperado
1. Para cada turma, mostrar:
   - quantidade de OS
   - lista das OS
   - HH e HI por OS
   - status da OS
2. Clicar em uma OS abre um painel/modal com detalhes:
   - dia, local, KM, horario inicio e fim
   - observacoes do RDO
   - servicos executados (descricao, quantidade, HH)
   - HI (tipo, horario, operadores, HH)

Dados necessarios
1. Campos do RDO: Numero OS, Numero RDO, Data, Local, KM, Hora Inicio, Hora Fim, Observacoes.
2. Servicos e HI vinculados por Numero RDO.
3. Status da OS vindo de Gestao OS (localStorage/servidor). Se nao existir, usar status do RDO como fallback.

Criterios de aceite
1. A lista mostra todas as OS do periodo filtrado.
2. O clique abre detalhes consistentes com os dados atuais.
3. Sem dados -> exibir empty state amigavel.

Notas tecnicas
1. Arquivo principal: `C:\Users\dan\CalculadoraHH\dashboard\js\visao-geral.js`.
2. Reutilizar indices do `calculations.js` para performance.
3. Considerar reaproveitar UI de detalhes de OS ja existente em `gestao-os.js`.

## VG-02 - Drill-down de servicos (Visao Geral e Top Servicos por HH)
Objetivo
Permitir clicar em um servico e ver em quais OS foi executado, com quantidade, HH e dia.

Comportamento esperado
1. Em "Top Servicos por HH" e na lista de servicos da Visao Geral, cada item deve ser clicavel.
2. Ao clicar, abrir painel/modal com:
   - OS
   - data
   - quantidade
   - HH

Dados necessarios
1. Mapeamento Servico -> RDO/OS (por Numero RDO).
2. Quantidade e coeficiente para calcular HH.

Criterios de aceite
1. A lista de OS aparece com dados corretos.
2. A soma de HH do detalhe bate com o total exibido no item principal.

Notas tecnicas
1. Arquivo principal: `C:\Users\dan\CalculadoraHH\dashboard\js\visao-geral.js`.
2. Pode reutilizar o mesmo modal do VG-01, mudando o conteudo.

## VG-03 - Remover "Destaques do Periodo" e "Alertas e Notificacoes"
Objetivo
Simplificar a Visao Geral removendo as duas secoes.

Comportamento esperado
1. As secoes deixam de aparecer na UI.
2. O layout reacomoda sem espacos vazios.

Notas tecnicas
1. Arquivo principal: `C:\Users\dan\CalculadoraHH\dashboard\js\visao-geral.js` e `index.html` se houver markup fixo.

## VG-04 - Classificacao de Atividades clicavel (PDM vs Correlatos)
Objetivo
Permitir abrir lista detalhada ao clicar em PDM ou Correlatos.

Comportamento esperado
1. Click em PDM ou Correlatos abre lista com servicos, quantidade, HH e ocorrencias.
2. A lista deve respeitar o filtro atual (periodo/turma/tipo).

Dados necessarios
1. Classificacao ja existente no modulo (PDM_TPS, PDM_SOLDA, correlatos).
2. Quantidade, HH e unidade por servico.

Criterios de aceite
1. Os valores da lista batem com os totais mostrados no grafico.
2. Sem dados -> mostrar mensagem clara.

## VG-05 - Banner "HI em PDM" com conversao em dormentes
Objetivo
Mostrar o impacto das HI sobre a producao PDM, convertendo perda em estimativa de dormentes.

Comportamento esperado
1. Exibir um banner com HH improdutivas classificadas como PDM.
2. Converter HH em "dormentes possiveis" usando um fator definido.

Dados necessarios
1. Definir fator de conversao (ex: dormentes por HH). Sem essa regra nao e possivel calcular.
2. Fonte das HI PDM: usar classificacao de servicos ou regra direta (definir exatamente).

Criterios de aceite
1. Banner mostra HH e conversao numerica consistente.
2. Se o fator nao estiver definido, exibir placeholder ou esconder o banner.

Notas tecnicas
1. Adicionar constante em config (ex: `DORMENTES_POR_HH`).
2. Arquivo principal: `C:\Users\dan\CalculadoraHH\dashboard\js\visao-geral.js`.

## VG-06 - Scorecard TS com "Total de Solda" e meta de 30 soldas
Objetivo
Adicionar coluna "Total de Solda" no scorecard de TS e mostrar no detalhamento da turma.

Comportamento esperado
1. Calcular o total de soldas no mes (todas as soldas, independentemente do tipo).
2. Mostrar coluna no scorecard das TS com cores baseadas na meta de 30 soldas/mes.
3. Incluir o total de soldas no detalhamento completo da turma de solda.

Dados necessarios
1. Definir regra de contagem de soldas:
   - opcao A: somar quantidades de servicos com descricao contendo "solda".
   - opcao B: usar classificacao PDM_SOLDA + CORRELATO_SOLDA.
2. Confirmar se quantidade representa numero de soldas reais.

Criterios de aceite
1. Total exibido bate com a soma por turma.
2. Cor muda conforme meta (>=30 verde, 20-29 amarelo, <20 vermelho, ajustar se desejado).

Plano alternativo (se muito complexo)
1. Mostrar "Total de Solda" em uma nova caixa/indicador fora do scorecard.
2. Adicionar observacao explicando a regra de contagem usada.

Dependencias gerais de dados
1. A planilha precisa conter campos consistentes para RDO, Servicos e HI.
2. Para detalhes completos, e necessario que KM, hora inicio e hora fim estejam preenchidos no RDO.
3. Para observacoes de servicos, e necessario um campo dedicado na aba Servicos.

Fora de escopo (por enquanto)
1. Implementacao efetiva das mudancas no codigo.
2. Mudancas de backend (Apps Script) alem da persistencia opcional do campo "urgente".

