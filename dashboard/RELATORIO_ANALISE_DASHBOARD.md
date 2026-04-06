# Relatorio de Analise do Dashboard

Data: 2026-04-05

## Resumo executivo
Foram identificados 6 achados principais (2 P1, 3 P2, 1 P3) e 10 sugestoes de melhoria organizadas por area. Os P1 afetam a confiabilidade do drilldown de O.S e a persistencia do status Urgente entre dispositivos.

## Achados (bugs, inconsistencias, riscos)

| ID | Severidade | Descricao | Arquivo/Linha | Impacto | Recomendacao |
|---|---|---|---|---|---|
| F1 | P3 | Painel de notas com colspan menor que a tabela (desalinhado). | C:\Users\dan\CalculadoraHH\dashboard\js\gestao-os.js:553 | UI desalinhada no painel de notas. | Ajustar colspan para 13 colunas. |
| F2 | P1 | Drilldown de O.S usa window.calculadoraMedicao e pode ficar vazio. | C:\Users\dan\CalculadoraHH\dashboard\js\visao-geral.js:1778 | Servicos e HI nao aparecem no detalhe da O.S. | Usar dashboardMain.calculadora ou armazenar this._calc no renderizar. |
| F5 | P2 |  Dias >= META  usa numRDOs como denominador. | C:\Users\dan\CalculadoraHH\dashboard\js\visao-geral.js:670 | Percentual distorcido quando ha varios RDOs no mesmo dia. | Usar diasTrabalhados e contar meta por data unica. |
| F6 | P2 | Semaforo do SLA TS usa SLA_CRITICO no amarelo. | C:\Users\dan\CalculadoraHH\dashboard\js\charts.js:977 | Leitura visual do SLA inconsistente com outras telas. | Usar SLA_ALERTA ou documentar a diferenca. |

## Sugestoes ajustadas e organizadas (prontas para IA)

1. [VG-REM-01] Remover a secao  Alertas e Notificacoes  da aba Visao Geral. Escopo: remover o card e eventuais referencias no HTML e no JS de renderizacao. Não é mais interessante no estado atual do projeto.
2. [VG-DET-01] No detalhe completo de turma (offcanvas), mover a lista de Ordens de Servico para abaixo das secoes de Servicos realizados e Horas Improdutivas. Criterio de aceite: ordem visual: Resumo -> Servicos -> HI -> O.S.
3. [VG-DET-02] Na tabela de O.S do detalhe completo de turma, adicionar uma coluna  KM  entre Numero da O.S e Datas. Fonte: KM Inicio/Fim do RDO. Criterio de aceite: coluna visivel e preenchida, inclusive no cabecalho, pode ser as duas juntas.
4. [VG-DET-03] No banner de Top Servicos por HH (drilldown de servico), exibir KM da O.S junto aos dados atuais. Criterio de aceite: cada linha do drilldown mostra KM.
5. [VG-DET-04] Adicionar opcao de voltar no detalhe de O.S (breadcrumb ou botao  Voltar ). Criterio de aceite: usuario retorna para o detalhe da turma sem perder o filtro atual.
6. [VG-DET-05] No detalhe de O.S, listar os servicos executados e as HI daquela O.S, e exibir a media de operadores da O.S ao lado do KM. Criterio de aceite: a O.S exibe lista de servicos + HI + media de operadores.
7. [VG-DET-06] No banner de HI dentro do detalhe de O.S, exibir a duracao do intervalo (minutos/horas) alem de hora inicio e fim. Criterio de aceite: cada HI mostra  duracao  calculada.
8. [VG-DET-07] No drilldown de Top Servicos por HH, ao clicar numa O.S, abrir o mesmo detalhe de O.S usado na tabela de O.S do detalhe completo da turma. Criterio de aceite: comportamento igual e com os mesmos dados.
9. [VG-FLT-01] A Classificacao de Atividades deve respeitar o filtro aplicado ao clicar no grafico  Produtividade por Turma . Criterio de aceite: ao selecionar uma turma no grafico, a classificacao exibe apenas dados daquela turma.
10. [VG-REM-02] Remover a secao  HI  Outros    Sugestoes de Reclassificacao . Criterio de aceite: card e logica nao aparecem no dashboard.
11. [VG-QD-01] Melhorar  Qualidade dos Dados  com interatividade, listando RDOs com problema. Criterio de aceite: clicar em um badge abre lista dos RDOs afetados (ex: sem efetivo, sem horario HI, sem coeficiente).

