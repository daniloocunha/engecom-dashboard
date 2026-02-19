# 🔧 Scripts de Manutenção - Google Sheets

Script Python para corrigir estrutura do Google Sheets.

---

## 📋 Script Disponível

### `migrar_estrutura_hi.py`
**Propósito**: Corrige aba HorasImprodutivas para estrutura correta (9 colunas).

**Quando usar**:
- Headers estão com nomes errados
- Estrutura tem 10 ou 11 colunas (bugs antigos)
- Após qualquer app antigo sincronizar

**O que faz**:
- Analisa estrutura atual
- Corrige headers se estiverem errados
- Remove colunas "Categoria" e "Colaboradores" (se existirem)
- Preserva todos os dados
- Resultado: **9 colunas corretas**

---

## ⚙️ Instalação

### Requisitos
- Python 3.7+
- pip

### Instalar dependências
```bash
cd C:\Users\dan\CalculadoraHH\scripts
pip install gspread oauth2client
```

---

## 🚀 Como Usar

### 1️⃣ Fazer Backup
```
Abrir Google Sheets manualmente
Arquivo > Fazer uma cópia
Nomear: "RDO Backup YYYY-MM-DD"
```

### 2️⃣ Executar Script
```bash
cd C:\Users\dan\CalculadoraHH\scripts
python migrar_estrutura_hi.py
```

**Saída esperada**:
```
🚀 MIGRAÇÃO - Estrutura HorasImprodutivas
========================================================
🔐 Autenticando...
✅ Conectado com sucesso!

📊 Analisando estrutura atual...
   Headers atuais: 11 colunas (ou 10, ou 9)
   Dados: 150 linhas
   ...

⚠️  ATENÇÃO: Esta operação vai:
   1. Limpar a aba HorasImprodutivas
   2. Reescrever com a estrutura correta (9 colunas)

🤔 Deseja continuar? (sim/não): sim

🔄 Iniciando migração...
   Reduzindo de 11 para 9 colunas...
   ✅ 150 linhas migradas

💾 Aplicando migração...
   ✅ 150 linhas inseridas
   ✅ Estrutura: 9 colunas

========================================================
✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!
========================================================

📊 Estrutura CORRETA (9 colunas):
   A: Número RDO
   B: Número OS
   C: Data RDO
   D: Código Turma
   E: Encarregado
   F: Tipo
   G: Descrição
   H: Hora Início
   I: Hora Fim

✅ Agora o app v2.3.0 pode sincronizar corretamente.
✅ Dashboard sempre buscará operadores do Efetivo.
```

### 3️⃣ Verificar no Google Sheets
```
Abrir: https://docs.google.com/spreadsheets/d/1H40DX9HwwOwXJquM9bX1qCYuam90hYpiC8enGb9TYFQ
Ir para aba: HorasImprodutivas
Verificar: 9 colunas (A-I)
```

### 4️⃣ Testar Sincronização
```
1. Instalar app v2.3.0
2. Criar um RDO de teste
3. Adicionar HI (Tipo, Descrição, Horas)
4. Sincronizar
5. Verificar no Google Sheets
   → Deve ir para aba HI com 9 colunas
   → Headers não devem ser alterados
   → Dados nas colunas corretas
```

---

## 📊 ESTRUTURA FINAL

### ✅ Estrutura Correta (9 colunas)
```
A: Número RDO       → Identificador do RDO
B: Número OS        → Número da Ordem de Serviço
C: Data RDO         → Data do relatório
D: Código Turma     → Ex: TP-273, TMC 806
E: Encarregado      → Nome do encarregado
F: Tipo             → Chuva, RUMO, Trem, etc
G: Descrição        → Descrição detalhada
H: Hora Início      → HH:MM
I: Hora Fim         → HH:MM
```

### ❌ Colunas REMOVIDAS
- **Categoria**: Não existe na estrutura real
- **Colaboradores**: Dashboard busca sempre do Efetivo

---

## ❓ Troubleshooting

### Erro: "No module named 'gspread'"
**Solução**: `pip install gspread oauth2client`

### Erro: "Credentials file not found"
**Solução**: Verificar se o arquivo existe:
```
C:\Users\dan\CalculadoraHH\app\src\main\assets\rdo-engecom-bf9816cce3c2.json
```

### Erro: "Permission denied"
**Solução**: Service account precisa ter permissão de Editor na planilha.

### Script travou
**Solução**:
1. Verificar conexão com internet
2. Executar novamente (script é idempotente)

### Estrutura continua errada após executar
**Solução**:
1. Verificar se há apps antigos sincronizando
2. Atualizar TODOS os dispositivos para v2.3.0
3. Executar script novamente

---

## 🔄 Rollback

Se algo der errado:

1. Abrir backup criado no passo 1
2. Copiar aba HorasImprodutivas
3. Colar na planilha principal
4. Renomear para "HorasImprodutivas"
5. Deletar aba corrompida

---

## 🎯 IMPORTANTE

⚠️ **Execute este script sempre que**:
- Um app antigo sincronizar e bagunçar os headers
- Notar que a aba tem mais de 9 colunas
- Houver problemas no cálculo de HH Improdutivas no dashboard

✅ **Após executar**:
- Atualizar TODOS os dispositivos para v2.3.0
- Headers ficarão protegidos contra corrupção futura

---

**Última atualização**: 2024-11-25
**Versão**: 2.0 (Estrutura corrigida para 9 colunas)
**Autor**: Claude Code AI
