# 🔧 TROUBLESHOOTING - Dashboard não mostra dados

## Problema Reportado
- Dashboard mostra mensagem "Dados desatualizados"
- Dados não aparecem nas visualizações
- Planilha do Google Sheets contém dados

---

## 🔍 DIAGNÓSTICO PASSO A PASSO

### 1️⃣ ABRIR PÁGINA DE DIAGNÓSTICO

1. Abra o arquivo: `diagnostico.html` no navegador
2. A página executará automaticamente 5 testes:
   - ✅ Configuração
   - ✅ API Key válida
   - ✅ Acesso à planilha
   - ✅ Acesso às abas
   - ✅ CORS funcionando

3. **Verifique quais testes falharam** (❌ vermelho)

---

### 2️⃣ ABRIR CONSOLE DO NAVEGADOR

**Como abrir:**
- **Chrome/Edge**: F12 ou Ctrl+Shift+I
- **Firefox**: F12
- **Safari**: Cmd+Option+I (Mac)

**O que procurar:**
```
❌ [API] Erro ao carregar RDO: ...
❌ [API] Erro ao carregar Servicos: ...
⚠️ [Cache] Usando cache expirado como fallback
```

**Copie e cole os erros** - eles contêm informações cruciais!

---

### 3️⃣ PROBLEMAS COMUNS E SOLUÇÕES

#### 🔴 Problema: "API Key inválida"

**Erro típico:**
```
HTTP 403 - API key not valid
HTTP 400 - API key not found
```

**SOLUÇÃO:**
1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Vá em **APIs e Serviços** → **Credenciais**
3. Verifique se a API Key existe e está **ATIVADA**
4. Se necessário, **crie uma nova API Key**:
   - Clique em "Criar Credenciais" → "Chave de API"
   - Copie a nova chave
5. Edite `js/config.js` linha 14:
   ```javascript
   API_KEY: 'COLE_SUA_NOVA_API_KEY_AQUI'
   ```
6. Recarregue o dashboard

---

#### 🔴 Problema: "Google Sheets API não habilitada"

**Erro típico:**
```
HTTP 403 - Google Sheets API has not been used in project
```

**SOLUÇÃO:**
1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Vá em **APIs e Serviços** → **Biblioteca**
3. Busque por "Google Sheets API"
4. Clique em **ATIVAR**
5. Aguarde 1-2 minutos
6. Recarregue o dashboard

---

#### 🔴 Problema: "Planilha não encontrada"

**Erro típico:**
```
HTTP 404 - Spreadsheet not found
HTTP 403 - Permission denied
```

**SOLUÇÃO:**
1. Abra a planilha no Google Sheets
2. Verifique o **compartilhamento**:
   - Clique em "Compartilhar" (canto superior direito)
   - Certifique-se: **"Qualquer pessoa com o link pode visualizar"**
   - Se estiver privado, mude para "Público" ou "Qualquer pessoa com o link"
3. Copie o **ID da planilha** da URL:
   ```
   https://docs.google.com/spreadsheets/d/[ESTE_É_O_ID]/edit
   ```
4. Edite `js/config.js` linha 11:
   ```javascript
   SPREADSHEET_ID: 'COLE_O_ID_AQUI'
   ```
5. Recarregue o dashboard

---

#### 🟡 Problema: "CORS blocked"

**Erro típico:**
```
Access to fetch at 'https://sheets.googleapis.com...' from origin 'file://' has been blocked by CORS
```

**SOLUÇÃO:**
Dashboard **precisa rodar em servidor HTTP**, não pode abrir como `file://`

**Opção 1 - Python (Mais fácil)**:
```bash
cd C:\Users\dan\CalculadoraHH\dashboard
python -m http.server 8000
```
Abra: http://localhost:8000

**Opção 2 - Node.js**:
```bash
cd C:\Users\dan\CalculadoraHH\dashboard
npx http-server -p 8000
```
Abra: http://localhost:8000

**Opção 3 - VS Code Live Server**:
1. Instale extensão "Live Server"
2. Clique com botão direito em `index.html`
3. Selecione "Open with Live Server"

---

#### 🟡 Problema: "Aba não encontrada"

**Erro típico:**
```
HTTP 400 - Unable to parse range: NomeAba!A:Z
```

**SOLUÇÃO:**
Verifique se os **nomes das abas** no Google Sheets são EXATAMENTE:
- `RDO`
- `Servicos` (sem "ç")
- `HorasImprodutivas`
- `Efetivo`
- `Equipamentos`
- `TransporteSucatas`

Se estiverem diferentes, **renomeie as abas** OU edite `js/config.js`:
```javascript
SHEETS: {
    RDO: 'NomeCorretoAbaRDO',
    SERVICOS: 'NomeCorretoAbaServicos',
    // ...
}
```

---

#### 🟢 Problema: "Dados carregam mas dashboard vazio"

**Possíveis causas:**

**1. Filtro muito restritivo:**
- Verifique se o mês/ano selecionado tem dados
- Tente selecionar "Todas as turmas"

**2. Dados sem formato correto:**
- Abra o console (F12)
- Procure por:
  ```
  [Dashboard] Dados carregados: { rdos: 0, servicos: 0, hi: 0 }
  ```
- Se todos são `0`, a planilha está vazia ou formato errado

**3. Campos com nomes diferentes:**
- A primeira linha das abas DEVE conter os cabeçalhos
- Exemplo aba RDO: `ID | Número RDO | Data | Código Turma | ...`
- Verifique se os nomes batem com o esperado

---

### 4️⃣ TESTES AVANÇADOS

#### Testar manualmente uma requisição:

1. Abra o console do navegador (F12)
2. Cole e execute:
```javascript
fetch('https://sheets.googleapis.com/v4/spreadsheets/1H40DX9HwwOwXJquM9bX1qCYuam90hYpiC8enGb9TYFQ/values/RDO!A1:C10?key=AIzaSyCT-HEiAY4qN6UtoxTARgykRr_GyM4N0AA')
  .then(r => r.json())
  .then(d => console.log('✅ Sucesso:', d))
  .catch(e => console.error('❌ Erro:', e));
```

3. Se der erro, **copie a mensagem de erro** e verifique as soluções acima

---

### 5️⃣ VERIFICAR QUOTAS DA API

Google Sheets API tem limites:
- **100 requisições por 100 segundos por usuário**
- **500 requisições por 100 segundos por projeto**

Se ultrapassar, você verá:
```
HTTP 429 - Quota exceeded
```

**SOLUÇÃO:**
- Aguarde alguns minutos
- Implemente cache mais agressivo (aumentar de 5min para 15min)

Para aumentar cache, edite `js/sheets-api.js` linha 12:
```javascript
this.cacheExpiry = 15 * 60 * 1000; // 15 minutos ao invés de 5
```

---

## 🎯 CHECKLIST RÁPIDO

- [ ] Dashboard rodando via servidor HTTP (não file://)
- [ ] API Key válida e ativada no Google Cloud
- [ ] Google Sheets API habilitada no projeto
- [ ] Planilha compartilhada como "Qualquer pessoa com o link"
- [ ] Nomes das abas corretos (RDO, Servicos, etc)
- [ ] Primeira linha de cada aba contém cabeçalhos
- [ ] Console do navegador aberto para ver erros
- [ ] Página diagnostico.html testada

---

## 📞 PRÓXIMOS PASSOS

Se nada acima resolver:

1. **Execute diagnostico.html** e copie TODOS os erros
2. **Abra o console** (F12) e copie TODAS as mensagens vermelhas
3. **Tire um screenshot** do dashboard com o problema
4. **Compartilhe** essas informações

---

## 🔐 SEGURANÇA - IMPORTANTE!

⚠️ **NUNCA compartilhe sua API Key publicamente!**

Se precisar compartilhar logs:
1. Substitua a API Key por `***REMOVIDA***`
2. Substitua o Spreadsheet ID por `***REMOVIDA***`

Exemplo:
```
✅ SEGURO:
[API] Erro ao carregar: 403 Forbidden (API Key: ***REMOVIDA***)

❌ INSEGURO:
[API] Erro ao carregar: 403 Forbidden (API Key: AIzaSyCT-HEi...)
```

---

**Última atualização**: 01/12/2025
**Versão do guia**: 1.0
