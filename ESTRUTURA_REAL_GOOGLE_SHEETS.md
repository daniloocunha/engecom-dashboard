# 📊 ESTRUTURA REAL DO GOOGLE SHEETS

**Criado**: 2024-11-24
**Propósito**: Documentar estrutura REAL das abas para garantir compatibilidade App ↔ Dashboard

---

## ⚠️ AÇÃO NECESSÁRIA

**ANTES de aplicar qualquer correção, você DEVE**:

1. Abrir a planilha: https://docs.google.com/spreadsheets/d/1H40DX9HwwOwXJquM9bX1qCYuam90hYpiC8enGb9TYFQ
2. Ir na aba **HorasImprodutivas**
3. Contar quantas colunas existem na linha 1 (headers)
4. Anotar EXATAMENTE o nome de cada coluna

---

## 🔍 ESTRUTURA ATUAL (Segundo código do app)

### Aba: HorasImprodutivas (11 colunas)

| Coluna | Nome | Tipo | Exemplo |
|--------|------|------|---------|
| A | Número RDO | String | "998070-13.11.24-001" |
| B | Número OS | String | "998070" |
| C | Data RDO | String | "13/11/2024" |
| D | Código Turma | String | "TP-273" |
| E | Encarregado | String | "Adalton Trindade" |
| F | Categoria | String | "Chuva" ou "RUMO" |
| G | Tipo | String | (DEPRECATED?) |
| H | Descrição | String | "Chuva forte" |
| I | Hora Início | String | "10:00" |
| J | Hora Fim | String | "12:30" |
| K | Colaboradores | Integer | 12 |

**Código fonte**: `GoogleSheetsService.kt:57-60`

---

## ❓ VERIFICAÇÕES PENDENTES

### 1. Confirmar estrutura real da planilha

```
[ ] Abrir planilha e verificar aba HorasImprodutivas
[ ] Contar colunas: _____ colunas
[ ] Anotar headers reais:
    A: _________________
    B: _________________
    C: _________________
    D: _________________
    E: _________________
    F: _________________
    G: _________________
    H: _________________
    I: _________________
    J: _________________
    K: _________________
```

### 2. Comparar com documentação

```
[ ] Verificar FLUXO_DE_DADOS.md (linha 88-96) - menciona apenas 9 colunas
[ ] Verificar DOCUMENTACAO_SINCRONIZACAO_SHEETS.md - não especifica
[ ] Dashboard espera quais colunas? (verificar calculations.js)
```

### 3. Identificar discrepâncias

```
[ ] App envia 11 colunas, planilha tem _____ colunas → Match? SIM / NÃO
[ ] Dashboard lê _____ colunas
[ ] Há dados históricos com estrutura antiga? SIM / NÃO
```

---

## 🔥 PROBLEMA CRÍTICO IDENTIFICADO

### Coluna F e G: "Categoria" vs "Tipo"

**App atual**:
- Coluna F = "Categoria" (Chuva, RUMO)
- Coluna G = "Tipo" (?)

**Documentação antiga (FLUXO_DE_DADOS.md:93)**:
- Coluna F = "Tipo" (Chuva, RUMO)
- Não menciona "Categoria"

**HIPÓTESE**: Headers foram atualizados (v1 → v2) mas:
1. ❌ Dados antigos não foram migrados
2. ❌ Dashboard ainda lê estrutura v1
3. ❌ Documentação não foi atualizada

---

## 🎯 AÇÕES APÓS VERIFICAÇÃO

### SE estrutura real = 11 colunas (match com app):
✅ App está correto
❌ Atualizar FLUXO_DE_DADOS.md
❌ Verificar se dashboard lê coluna K (Colaboradores)
❌ Verificar se há dados antigos com 9 colunas

### SE estrutura real = 9 colunas (estrutura antiga):
❌ Headers não foram criados corretamente
❌ Bug no `ensureSheetsExist()` (GoogleSheetsService.kt:111-151)
❌ Dados sendo inseridos nas colunas ERRADAS
🔥 URGENTE: Corrigir estrutura da planilha

### SE estrutura real = outro número:
🔥 CRÍTICO: Estrutura completamente inconsistente
🔥 Dados podem estar totalmente corrompidos

---

## 📝 REGISTRE AQUI OS ACHADOS

**Data da verificação**: ___/___/2024
**Verificado por**: _________________

**Estrutura encontrada**:
```
Aba HorasImprodutivas tem _____ colunas:
A: _________________
B: _________________
C: _________________
...
```

**Match com app**: SIM / NÃO
**Match com doc**: SIM / NÃO
**Dados antigos com estrutura diferente**: SIM / NÃO / NÃO VERIFICADO

**Próximos passos**:
- [ ] ___________________________
- [ ] ___________________________
- [ ] ___________________________
