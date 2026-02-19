# 📊 Dashboard de Medição - Engecom/Encogel

Dashboard web para análise de RDOs e cálculos de faturamento das turmas TMC e TP.

## 🚀 Como Usar

### Opção 1: Dashboard Web (HTML+JS)

1. Abra o arquivo `index.html` em um navegador
2. Acesse com o link secreto: `index.html?key=engecom2024`
3. O dashboard carregará automaticamente os dados do Google Sheets

### Opção 2: Google Apps Script

1. Acesse o Google Sheets do RDO
2. Vá em **Extensões > Apps Script**
3. Cole o código do arquivo `apps-script-dashboard.gs`
4. Execute a função `criarDashboard()`
5. Acesse o link gerado

## 📋 Estrutura de Arquivos

```
dashboard/
├── index.html                  # Dashboard principal
├── css/
│   └── dashboard.css          # Estilos customizados
├── js/
│   ├── config.js              # Configurações (API, preços)
│   ├── auth.js                # Autenticação por link secreto
│   ├── sheets-api.js          # Conexão com Google Sheets
│   ├── calculations.js        # Cálculos TMC/TP
│   ├── charts.js              # Gráficos (Chart.js)
│   ├── filters.js             # Filtros dinâmicos
│   └── main.js                # Controlador principal
├── apps-script-dashboard.gs   # Versão Google Apps Script
└── README.md                   # Este arquivo
```

## 🔑 Autenticação

O dashboard usa **link secreto** para controle de acesso:

- URL padrão: `index.html?key=engecom2024`
- Para alterar a chave, edite `js/auth.js`

## 📊 Cálculos Implementados

### TMCs (Turmas de Manutenção Corretiva)
- Valor fixo mensal com proporcional se dias trabalhados > dias úteis
- Média = dias trabalhados / dias úteis
- Cálculo automático por: Encarregado + Operadores + Equipamentos

### TPs (Turmas de Produção)
- Meta HH = 12 operadores × 8 horas × dias úteis
- Meta diária = 96 HH
- HH = Serviços (coeficientes) + Improdutivas (Chuva÷2, Trens>15min)
- Limite de faturamento: 110%
- SLA = % atingido da meta

## 🎨 Visualizações

1. **Cards de KPIs** - Métricas principais
2. **Gráfico de Linha** - Evolução temporal de HH
3. **Gráfico de Barras** - Comparação entre turmas
4. **Heatmap** - Produtividade diária (verde/amarelo/vermelho)
5. **Pizza** - Distribuição de efetivo
6. **Alertas Inteligentes** - Anomalias e riscos

## 🔧 Configuração

### Google Sheets API

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um projeto novo
3. Ative a **Google Sheets API**
4. Crie credenciais (API Key)
5. Copie a API Key para `js/config.js`

### Spreadsheet ID

Edite `js/config.js` e adicione o ID da sua planilha:

```javascript
const SPREADSHEET_ID = '1H40DX9HwwOwXJquM9bX1qCYuam90hYpiC8enGb9TYFQ';
```

## 📱 Hospedagem

### GitHub Pages (Grátis)

1. Crie um repositório privado no GitHub
2. Faça upload da pasta `dashboard/`
3. Ative GitHub Pages nas configurações
4. Acesse: `https://seu-usuario.github.io/dashboard/?key=engecom2024`

### Vercel (Grátis)

1. Instale Vercel CLI: `npm install -g vercel`
2. Na pasta dashboard: `vercel`
3. Siga as instruções
4. URL gerada automaticamente

## 🛡️ Segurança

- ✅ Autenticação por link secreto
- ✅ Dados carregados via API do Google (read-only)
- ✅ Sem servidor backend necessário
- ⚠️ Não versione a API Key no Git (use variáveis de ambiente)

## 📞 Suporte

Para dúvidas ou problemas, contate o desenvolvedor.

---

**Desenvolvido para Engecom Engenharia - Consórcio Engecom/Encogel**
