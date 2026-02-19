# 🔒 Segurança do Dashboard

## ⚠️ IMPORTANTE - LEIA ANTES DE USAR EM PRODUÇÃO

Este dashboard lida com dados financeiros sensíveis. Siga estas diretrizes rigorosamente.

---

## 📋 Checklist de Segurança

### ✅ OBRIGATÓRIO

- [ ] **API Key protegida**: Nunca commite `js/config.js` no Git
- [ ] **Chave secreta forte**: Mínimo 32 caracteres alfanuméricos + símbolos
- [ ] **API Key restrita**: Configure restrições de domínio no Google Cloud Console
- [ ] **HTTPS obrigatório**: Nunca use HTTP em produção
- [ ] **Acesso restrito**: Controle quem tem a URL + chave secreta

### ⚙️ RECOMENDADO

- [ ] **Renovação periódica**: Troque a chave secreta a cada 3-6 meses
- [ ] **Auditoria de acessos**: Monitore logs do Google Sheets API
- [ ] **Backup de credenciais**: Armazene credenciais em local seguro (1Password, etc.)
- [ ] **2FA**: Habilite autenticação de dois fatores na conta Google
- [ ] **Quotas**: Configure limites de requisições no Google Cloud Console

---

## 🔑 Configuração da API Key

### 1. Criar API Key no Google Cloud Console

```
1. Acesse: https://console.cloud.google.com/
2. Selecione ou crie um projeto
3. Vá em: APIs & Services > Credentials
4. Clique em: Create Credentials > API Key
5. IMPORTANTE: Configure restrições
```

### 2. Restringir API Key (OBRIGATÓRIO)

**Restrições de Aplicativo:**
- Tipo: **HTTP referrers (websites)**
- Domínios permitidos:
  ```
  https://seu-dominio.com/*
  https://seu-usuario.github.io/*
  localhost:8000/*  (apenas para desenvolvimento)
  ```

**Restrições de API:**
- Ativar APENAS: **Google Sheets API**
- Desativar todas as outras APIs

### 3. Configurar config.js

```bash
cd dashboard/js
cp config.example.js config.js
nano config.js  # Edite e adicione suas credenciais
```

**NÃO COMMITE config.js no Git!** Ele já está no .gitignore.

---

## 🔐 Chave Secreta (SECRET_KEY)

### Gerando Chave Forte

Use um destes métodos para gerar uma chave segura:

```bash
# Opção 1: OpenSSL
openssl rand -base64 32

# Opção 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Opção 3: Python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Exemplo de Chave Forte

❌ **FRACO**: `engecom2024`
✅ **FORTE**: `Xk9mP$2vL#nR8wQ@5tY&7uI!3oE^6aS%1dF*4gH+0jK`

---

## 🌐 Deploy Seguro

### GitHub Pages (Repositório Privado)

```bash
# 1. Criar repositório PRIVADO
gh repo create dashboard --private

# 2. Adicionar .gitignore
cat > .gitignore << EOF
js/config.js
EOF

# 3. Commit (config.js será ignorado)
git add .
git commit -m "Initial commit"
git push

# 4. Ativar GitHub Pages
gh repo edit --enable-pages --pages-branch main

# 5. Acessar com:
https://seu-usuario.github.io/dashboard/?key=SUA_CHAVE_FORTE
```

### Vercel (Variáveis de Ambiente)

```bash
# 1. Instalar Vercel CLI
npm install -g vercel

# 2. Deploy
cd dashboard
vercel

# 3. Configurar secrets
vercel env add API_KEY
vercel env add SECRET_KEY

# 4. Modificar config.js para usar variáveis de ambiente
```

### Netlify

```bash
# 1. Instalar Netlify CLI
npm install -g netlify-cli

# 2. Deploy
cd dashboard
netlify deploy

# 3. Configurar variáveis em: Site settings > Environment
```

---

## 🚨 Em Caso de Vazamento

Se a API Key ou chave secreta vazarem:

### 1. Revogar API Key Imediatamente

```
1. Acesse: https://console.cloud.google.com/apis/credentials
2. Encontre a API Key comprometida
3. Clique em DELETE
4. Crie uma nova API Key com restrições adequadas
```

### 2. Trocar Chave Secreta

```bash
# Gerar nova chave
openssl rand -base64 32

# Atualizar em config.js
# Comunicar nova URL para usuários autorizados
```

### 3. Verificar Logs

```
1. Google Cloud Console > Logging
2. Verificar acessos suspeitos
3. Revisar quotas e uso
```

---

## 📊 Monitoramento

### Configurar Alertas no Google Cloud

```
1. Cloud Console > Monitoring > Alerting
2. Criar alerta: "Sheets API - Quota exceeded"
3. Criar alerta: "Sheets API - 429 errors"
4. Notificar: seu-email@engecom.com
```

### Logs de Acesso

Os logs do dashboard ficam em:
- **Browser Console**: Pressione F12 > Console
- **Google Cloud Logging**: Todas as requisições à API

---

## 🔒 Permissões do Google Sheets

### Configuração Recomendada

**Planilha RDO:**
- **Dono**: Conta de serviço ou admin
- **Editors**: Apenas app Android (via conta de serviço)
- **Viewers**: Dashboard (via API Key read-only)

**NUNCA compartilhe a planilha publicamente!**

---

## ✅ Audit Checklist Mensal

- [ ] Revisar acessos à API Key (Google Cloud Logging)
- [ ] Verificar quotas e uso (não deve exceder limites)
- [ ] Confirmar que config.js não foi commitado
- [ ] Testar se restrições de domínio estão ativas
- [ ] Renovar chaves se houver suspeita de vazamento
- [ ] Backup da planilha (Google Drive > Fazer cópia)

---

## 📞 Suporte

Em caso de problemas de segurança:

1. **Urgente**: Revogar API Key imediatamente
2. **Contatar**: Administrador do sistema
3. **Documentar**: Registrar o incidente

---

**Última atualização**: 2025-11-20
**Versão do Dashboard**: 1.0.0
