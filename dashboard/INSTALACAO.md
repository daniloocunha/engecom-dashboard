# 🚀 Guia de Instalação e Configuração

## Dashboard de Medição - Engecom/Encogel

---

## 📋 **Pré-requisitos**

1. Conta Google com acesso ao Google Sheets
2. Navegador moderno (Chrome, Firefox, Edge)
3. Conexão com internet

---

## 🔧 **Passo 1: Configurar Google Sheets API**

### 1.1. Criar Projeto no Google Cloud

1. Acesse: https://console.cloud.google.com/
2. Clique em **"Criar Projeto"**
3. Nome do projeto: `Dashboard RDO Engecom`
4. Clique em **"Criar"**

### 1.2. Ativar Google Sheets API

1. No menu lateral, vá em **"APIs e Serviços" > "Biblioteca"**
2. Pesquise por `Google Sheets API`
3. Clique em **"Ativar"**

### 1.3. Criar API Key

1. Vá em **"APIs e Serviços" > "Credenciais"**
2. Clique em **"+ Criar Credenciais" > "Chave de API"**
3. **COPIE A API KEY** (algo como: `AIzaSyD...`)
4. **IMPORTANTE**: Restrinja a API Key:
   - Clique em **"Editar"** na API Key criada
   - Em "Restrições da aplicação", selecione **"Referenciadores HTTP (sites)"**
   - Adicione seus domínios permitidos:
     ```
     localhost:*
     127.0.0.1:*
     seu-dominio.github.io/*
     ```
   - Em "Restrições de API", selecione **"Restringir chave"**
   - Marque apenas **"Google Sheets API"**
   - Clique em **"Salvar"**

---

## 📝 **Passo 2: Configurar o Dashboard**

### 2.1. Editar config.js

Abra o arquivo `dashboard/js/config.js` e substitua:

```javascript
// Linha 11 - Substitua pela sua API Key
API_KEY: 'AIzaSyD...',  // Cole sua API Key aqui
```

### 2.2. Verificar Spreadsheet ID

Certifique-se que o ID da planilha está correto (linha 9):

```javascript
SPREADSHEET_ID: '1H40DX9HwwOwXJquM9bX1qCYuam90hYpiC8enGb9TYFQ',
```

**Como encontrar o Spreadsheet ID:**
- URL da planilha: `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`
- Copie a parte entre `/d/` e `/edit`

### 2.3. (Opcional) Alterar Chave de Acesso

Se quiser trocar a senha padrão, edite `js/config.js` linha 20:

```javascript
SECRET_KEY: 'sua_chave_secreta_aqui'
```

---

## 🌐 **Passo 3: Hospedar o Dashboard**

### Opção A: Testar Localmente (Desenvolvimento)

#### Windows:
```bash
# 1. Abra o PowerShell na pasta dashboard/
cd C:\Users\dan\CalculadoraHH\dashboard

# 2. Inicie um servidor HTTP simples
python -m http.server 8000

# 3. Acesse no navegador:
# http://localhost:8000/?key=engecom2024
```

#### Linux/Mac:
```bash
# 1. Navegue até a pasta
cd /caminho/para/dashboard

# 2. Inicie o servidor
python3 -m http.server 8000

# 3. Acesse: http://localhost:8000/?key=engecom2024
```

---

### Opção B: Hospedar no GitHub Pages (Grátis) ⭐

#### 3.1. Criar Repositório no GitHub

1. Acesse https://github.com e faça login
2. Clique em **"New"** (novo repositório)
3. Nome: `dashboard-rdo` (ou qualquer nome)
4. **IMPORTANTE**: Marque como **Privado**
5. Clique em **"Create repository"**

#### 3.2. Upload dos Arquivos

**Via Interface Web:**
1. Clique em **"uploading an existing file"**
2. Arraste TODA a pasta `dashboard/` para o GitHub
3. Clique em **"Commit changes"**

**Via Git (linha de comando):**
```bash
cd C:\Users\dan\CalculadoraHH\dashboard

git init
git add .
git commit -m "Dashboard inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/dashboard-rdo.git
git push -u origin main
```

#### 3.3. Ativar GitHub Pages

1. No repositório, vá em **"Settings"**
2. No menu lateral, clique em **"Pages"**
3. Em "Source", selecione **"main"** branch
4. Pasta: **(root)**
5. Clique em **"Save"**
6. Aguarde 2-3 minutos

#### 3.4. Acessar o Dashboard

Seu dashboard estará disponível em:
```
https://SEU_USUARIO.github.io/dashboard-rdo/?key=engecom2024
```

**Exemplo:**
```
https://engecom-analytics.github.io/dashboard-rdo/?key=engecom2024
```

---

### Opção C: Vercel (Alternativa Rápida)

#### 3.1. Instalar Vercel CLI

```bash
npm install -g vercel
```

#### 3.2. Deploy

```bash
cd C:\Users\dan\CalculadoraHH\dashboard
vercel

# Responda as perguntas:
# - Setup and deploy? Yes
# - Which scope? Sua conta
# - Link to existing project? No
# - Project name? dashboard-rdo
# - Directory? ./
# - Override settings? No
```

#### 3.3. Acesso

Vercel fornecerá uma URL tipo:
```
https://dashboard-rdo-xxxx.vercel.app/?key=engecom2024
```

---

## ✅ **Passo 4: Testar o Dashboard**

### 4.1. Acessar

Abra o navegador e acesse:
```
https://seu-dashboard.com/?key=engecom2024
```

### 4.2. Primeira Execução

1. **Autenticação**: Digite a chave ou use o link com `?key=`
2. **Loading**: O dashboard carregará dados do Google Sheets (10-30 segundos)
3. **Visualização**: Você verá:
   - 4 Cards de KPIs
   - Gráficos interativos
   - Tabelas com dados das turmas
   - Alertas automáticos

### 4.3. Verificar Funcionamento

- [ ] KPIs mostram valores corretos
- [ ] Gráficos renderizam sem erros
- [ ] Tabelas estão preenchidas
- [ ] Filtros funcionam ao clicar "Aplicar"
- [ ] Heatmap aparece ao selecionar uma TP específica

---

## 🔒 **Passo 5: Segurança**

### 5.1. Proteger API Key

**NUNCA** exponha sua API Key publicamente. Para proteger:

1. **GitHub**: Adicione ao `.gitignore`:
   ```
   js/config.js
   ```

2. **Variáveis de Ambiente** (recomendado):
   ```javascript
   // Em config.js
   API_KEY: process.env.GOOGLE_SHEETS_API_KEY || 'fallback-key'
   ```

### 5.2. Compartilhar Acesso

Para compartilhar o dashboard:

1. **Envie APENAS o link com a chave secreta**:
   ```
   https://seu-dashboard.com/?key=engecom2024
   ```

2. **Troque a chave secretay periodicamente** (a cada 3-6 meses)

3. **NÃO compartilhe em:**
   - E-mails para múltiplas pessoas
   - Grupos de WhatsApp/Telegram
   - Redes sociais

### 5.3. Revogar Acesso

Se precisar revogar acessos:

1. Troque a `SECRET_KEY` em `config.js`
2. Faça novo deploy
3. Links antigos pararão de funcionar

---

## 🛠️ **Passo 6: Manutenção**

### 6.1. Atualizar Dados

Os dados são carregados do Google Sheets em tempo real. Para forçar atualização:

1. Clique no botão **"Refresh"** (se disponível)
2. Ou recarregue a página (F5)
3. Cache expira automaticamente a cada 5 minutos

### 6.2. Alterar Preços

Edite `js/config.js` e atualize os valores em:
```javascript
const PRECOS_ENGECOM = { ... }
const PRECOS_ENCOGEL = { ... }
```

### 6.3. Adicionar/Remover Turmas

Edite `js/config.js` e modifique:
```javascript
const TURMAS = {
    TPS: [ ... ],
    TMCS: [ ... ]
}
```

---

## ❓ **Problemas Comuns**

### "Erro ao carregar dados"

**Causas possíveis:**
1. API Key inválida ou não configurada
2. Spreadsheet ID incorreto
3. Planilha não compartilhada publicamente
4. API Key sem permissão para Google Sheets API

**Solução:**
1. Verifique o console do navegador (F12)
2. Confirme API Key e Spreadsheet ID
3. Certifique-se que a planilha está compartilhada para "Qualquer pessoa com o link"

---

### "Autenticação falhou"

**Causas:**
1. Chave secreta incorreta
2. URL sem parâmetro `?key=`

**Solução:**
1. Verifique a chave em `config.js`
2. Acesse com `?key=sua_chave`

---

### Gráficos não aparecem

**Causas:**
1. Chart.js não carregou (conexão lenta)
2. Dados insuficientes no período

**Solução:**
1. Aguarde carregamento completo
2. Verifique se há dados no mês/ano selecionado

---

## 📞 **Suporte**

Para dúvidas ou problemas:

1. **Verifique o console do navegador** (F12 > Console)
2. **Leia a documentação** em `README.md` e `STATUS.md`
3. **Entre em contato** com o desenvolvedor

---

## 📚 **Próximos Passos**

Depois de instalar:

1. ✅ Configure dias úteis por mês (em `calculations.js`)
2. ✅ Ajuste thresholds de alertas (em `config.js`)
3. ✅ Personalize cores e branding (em `dashboard.css`)
4. ✅ Implemente export para PDF/Excel (futuro)
5. ✅ Configure Google Apps Script alternativo

---

**Dashboard v1.0.0**
**Engecom Engenharia / Encogel**
**2024 - Todos os direitos reservados**
