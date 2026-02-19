# Gerenciamento de Serviços - Guia Completo

## 🎯 Fonte Única da Verdade

**Todos os serviços e coeficientes são gerenciados em UM ÚNICO arquivo:**

```
app/src/main/res/raw/servicos.json
```

**❌ NÃO EDITE** os outros arquivos manualmente:
- `dashboard/servicos.json` (gerado automaticamente)
- `dashboard/js/servicos-data.js` (gerado automaticamente)

---

## 📝 Como Adicionar, Editar ou Remover Serviços

### 1️⃣ Editar o Arquivo Fonte

Abra: **`app/src/main/res/raw/servicos.json`**

```json
[
  {
    "descricao": "Substituição Dormente",
    "coeficiente": 0.81
  },
  {
    "descricao": "Novo Serviço Aqui",
    "coeficiente": 1.25
  }
]
```

### 2️⃣ Sincronizar os Arquivos

Execute um dos comandos:

#### Opção A: Com npm (recomendado)
```bash
cd C:\Users\dan\CalculadoraHH
npm run sync-servicos
```

#### Opção B: Diretamente com Node.js
```bash
node scripts/sync-servicos.js
```

### 3️⃣ Verificar a Sincronização

O script mostrará:
```
✅ Arquivo fonte lido: 100 serviços
✅ Gerado: dashboard/servicos.json
✅ Gerado: dashboard/js/servicos-data.js

📊 Estatísticas:
   Total: 100 registros
   Serviços válidos: 100
```

### 4️⃣ Commit no Git

Sempre faça commit dos **3 arquivos juntos**:
```bash
git add app/src/main/res/raw/servicos.json
git add dashboard/servicos.json
git add dashboard/js/servicos-data.js
git commit -m "Atualizar serviços: adicionar/editar/remover X"
```

---

## 🔄 Quando Executar a Sincronização?

Execute o script **SEMPRE** que:
- ✅ Adicionar um novo serviço
- ✅ Editar descrição ou coeficiente de um serviço existente
- ✅ Remover um serviço
- ✅ Antes de fazer build do app Android
- ✅ Antes de fazer deploy do dashboard

---

## 🏗️ Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────┐
│  app/src/main/res/raw/servicos.json                │
│  📄 FONTE ÚNICA DA VERDADE                          │
│  👉 EDITE APENAS ESTE ARQUIVO!                      │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ node scripts/sync-servicos.js
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌──────────────────┐  ┌──────────────────────────┐
│ dashboard/       │  │ dashboard/js/            │
│ servicos.json    │  │ servicos-data.js         │
│                  │  │                          │
│ 📋 Cópia JSON    │  │ 🔧 Constante JavaScript  │
│ (servidor HTTP)  │  │ (fallback CORS)          │
└──────────────────┘  └──────────────────────────┘
```

---

## ⚙️ Como o Script Funciona

O script `scripts/sync-servicos.js`:

1. **Lê** o arquivo fonte: `app/src/main/res/raw/servicos.json`
2. **Valida** o formato JSON e estrutura
3. **Gera** `dashboard/servicos.json` (cópia formatada)
4. **Gera** `dashboard/js/servicos-data.js` (constante JavaScript com comentário de aviso)
5. **Mostra** estatísticas dos serviços

---

## ❓ FAQ

### Por que 3 arquivos?

1. **`app/.../servicos.json`**: App Android lê diretamente
2. **`dashboard/servicos.json`**: Dashboard carrega via HTTP (servidor local)
3. **`dashboard/js/servicos-data.js`**: Fallback quando dashboard é aberto como `file://` (CORS)

### E se eu editar os arquivos gerados?

⚠️ **Suas mudanças serão perdidas** na próxima sincronização! O script sobrescreve os arquivos gerados.

### Como desfazer uma sincronização?

```bash
git checkout dashboard/servicos.json
git checkout dashboard/js/servicos-data.js
```

### Posso automatizar a sincronização?

Sim! Adicione ao workflow do Git:

**.git/hooks/pre-commit** (Linux/Mac):
```bash
#!/bin/bash
node scripts/sync-servicos.js
git add dashboard/servicos.json dashboard/js/servicos-data.js
```

---

## 🧪 Validação

Após sincronizar, verifique:

### Android App
1. Build do app: `./gradlew assembleDebug`
2. Abra a Calculadora HH
3. Verifique se os serviços aparecem no AutoCompleteTextView

### Dashboard
1. Abra o dashboard (pode ser como `file://` ou via servidor HTTP)
2. Abra o console (F12)
3. Procure por: `[Dashboard] Mapa de coeficientes: X serviços carregados`
4. Verifique se X corresponde ao número de serviços

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique se Node.js está instalado: `node --version`
2. Verifique se o arquivo fonte é JSON válido: use um validador online
3. Execute com output completo: `node scripts/sync-servicos.js`
4. Consulte o log do script para ver estatísticas e erros
