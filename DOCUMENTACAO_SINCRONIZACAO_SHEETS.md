# Documentação da Sincronização com Google Sheets (v2.0)

## 📋 Visão Geral

Este documento descreve a arquitetura de sincronização de dados (versão 2.0) entre o banco de dados local (SQLite) do aplicativo CalculadoraHH e a planilha do Google Sheets. Esta versão substitui a lógica anterior, introduzindo um sistema mais robusto, resiliente e baseado em identificadores persistentes.

O sistema sincroniza os dados de um **RDO (Relatório Diário de Obra)** para um conjunto de abas na planilha, servindo como uma réplica para análise e backup.

### Abas Utilizadas:
1.  **Config**: Usada para configurações gerais (atualmente não utilizada pela lógica de sincronização).
2.  **RDO**: Tabela principal, contendo os dados centrais de cada RDO.
3.  **Servicos**: Dados dos serviços executados no RDO.
4.  **Materiais**: Dados dos materiais utilizados no RDO.
5.  **HorasImprodutivas**: Dados das horas improdutivas do RDO.
6.  **TransporteSucatas**: Dados de transporte de sucatas (anteriormente `Transportes`).
7.  **Efetivo**: Dados do efetivo de mão de obra do RDO.
8.  **Equipamentos**: Dados dos equipamentos utilizados no RDO.

---

## 🔑 Estratégia de Chave Primária

A robustez do novo sistema reside na sua estratégia de chaves:

-   **ID Persistente (Chave Primária):** A **coluna A** da aba `RDO` armazena o **ID do RDO no banco de dados local (SQLite)**. Este ID é imutável e serve como a âncora para todas as operações de `UPDATE` e `DELETE`, garantindo que o registro correto seja sempre encontrado, mesmo que outros campos mudem.
-   **Número RDO (Chave de Relação):** A **coluna B** da aba `RDO`, `numeroRDO`, é o identificador legível para o usuário. Este valor é usado como **chave estrangeira** em todas as outras abas (`Servicos`, `Materiais`, etc.) para vincular os dados relacionados ao RDO principal. O sistema foi projetado para lidar com a mudança deste valor.

---

## 🔄 Fluxo de Sincronização

A sincronização é gerenciada pelo `RDOSyncWorker`, que utiliza o `GoogleSheetsService` para a comunicação com a API do Google Sheets. A função central é `syncRDO`.

### `syncRDO(rdo: RDODataCompleto, isDelete: Boolean, numeroRDOAntigo: String?)`

-   **Cenário 1: INSERT (Novo RDO)**
    1.  O sistema verifica se o `rdo.id` existe na coluna A da aba `RDO`.
    2.  Se não existir, uma nova linha é inserida (append) na aba `RDO`.
    3.  Os dados relacionados (serviços, materiais, etc.) são inseridos (append) nas abas correspondentes, usando o `numeroRDO` para criar o vínculo.

-   **Cenário 2: UPDATE (RDO Existente)**
    1.  O sistema localiza a linha a ser atualizada na aba `RDO` usando o `rdo.id` persistente.
    2.  O sistema determina qual `numeroRDO` usar para a limpeza dos dados relacionados:
        -   Se o `numeroRDO` foi alterado (`numeroRDOAntigo` é fornecido e diferente do novo), os dados relacionados ao `numeroRDOAntigo` são deletados.
        -   Se o `numeroRDO` não mudou, os dados relacionados ao `numeroRDO` atual são deletados para serem substituídos.
    3.  A linha principal na aba `RDO` é atualizada (update) com os novos dados, preservando a data de criação original.
    4.  Os novos dados relacionados são inseridos (append) nas abas correspondentes.

-   **Cenário 3: DELETE (Deleção Lógica)**
    1.  O fluxo é semelhante a um `UPDATE`.
    2.  A linha na aba `RDO` é atualizada, e o campo `Deletado` (coluna S) é marcado como "Sim".
    3.  Todos os dados relacionados nas outras abas são deletados com base no `numeroRDO`. Não são inseridos novos dados relacionados.

---

## 📊 Estrutura das Abas e Colunas

### 1. RDO
| Coluna | Nome | Descrição |
|---|---|---|
| A | ID | **ID do banco de dados local (Chave Primária)** |
| B | Número RDO | Identificador legível (Chave de Relação) |
| C | Data | Data do RDO |
| D | Código Turma | Código da turma |
| ... | ... | ... |
| S | Deletado | "Sim" ou "Não" |
| T | Data Sincronização | Timestamp da última sincronização |
| U | Data Criação | Timestamp da criação do RDO (preservado em updates) |

### 2. Abas Relacionadas (Servicos, Materiais, etc.)
Todas as abas relacionadas seguem uma estrutura similar, onde a primeira coluna é o `Número RDO` para vincular ao registro principal.

**Exemplo - Aba `Servicos`:**
| Coluna | Nome | Descrição |
|---|---|---|
| A | Número RDO | **Chave Estrangeira** para `RDO.Número RDO` |
| B | Número OS | Número da Ordem de Serviço |
| C | Data RDO | Data do RDO |
| ... | ... | ... |

**Ponto Chave:** A deleção de dados nessas abas é sempre feita procurando pelo `Número RDO` na coluna A. A lógica que causava bugs na versão anterior (deletar `Equipamentos` por `OS + Data`) foi corrigida, e agora todas as deleções de dados relacionados são consistentes.

---

## 🛡️ Resiliência e Error Handling

-   **Criação Dinâmica de Abas/Headers:** Ao inicializar, o serviço verifica se todas as abas e seus respectivos cabeçalhos existem. Se não, eles são criados. A escrita de cabeçalhos não sobrescreve dados existentes.
-   **Validação de Headers:** O serviço lê a primeira linha de abas críticas (como `RDO`) para verificar se as colunas estão na ordem esperada. Um aviso é logado se uma coluna for movida manualmente, prevenindo erros de sincronização.
-   **Tentativa de Rollback:** A inserção de dados relacionados é feita em múltiplas chamadas de API. Se uma chamada falhar no meio do processo (ex: inserir serviços OK, mas materiais falha), o sistema tenta reverter as inserções já concluídas, deletando os dados parciais para evitar um estado inconsistente.

---
*Este documento reflete a lógica implementada no `GoogleSheetsService.kt` e é a fonte da verdade para a V2 da sincronização.*