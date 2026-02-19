# 🔄 FLUXO DE DADOS: Google Sheets → Dashboard

## Análise Completa do Processo de Carregamento e Cálculo

---

## 📊 **ETAPA 1: Estrutura do Google Sheets**

### **7 Abas Principais:**

```
Google Sheets (ID: 1H40DX9HwwOwXJquM9bX1qCYuam90hYpiC8enGb9TYFQ)
├─ Config           (Configurações do app - dias úteis, versões)
├─ RDO              (Dados principais dos RDOs)
├─ Servicos         (Serviços executados por RDO)
├─ Materiais        (Materiais utilizados por RDO)
├─ HorasImprodutivas (HI - Chuva, Trens, etc)
├─ TransporteSucatas (Transportes realizados)
├─ Efetivo          (Quantidade de colaboradores por dia)
└─ Equipamentos     (Equipamentos utilizados)
```

### **1.1. Aba RDO (Principal)**

**Colunas (21 campos):**
```
A  | ID                   | Identificador único do banco local
B  | Número RDO           | Formato: OS-DD.MM.YY-XXX (ex: 998070-13.11.24-001)
C  | Data                 | Formato: DD/MM/YYYY
D  | Código Turma         | Ex: TP-273, TMC 806
E  | Encarregado          | Nome do encarregado
F  | Local                | Local da obra
G  | Número OS            | Número da Ordem de Serviço
H  | Status OS            | Em Andamento, Concluída, etc.
I  | KM Início            | Kilometragem inicial
J  | KM Fim               | Kilometragem final
K  | Horário Início       | HH:MM
L  | Horário Fim          | HH:MM
M  | Clima                | Ensolarado, Chuvoso, etc.
N  | Tema DDS             | Tema do Diálogo de Segurança
O  | Houve Serviço        | Sim/Não
P  | Houve Transporte     | Sim/Não
Q  | Nome Colaboradores   | Lista de nomes
R  | Observações          | Texto livre
S  | Deletado             | Sim/Não
T  | Data Sincronização   | YYYY-MM-DD HH:MM:SS
U  | Data Criação         | YYYY-MM-DD HH:MM:SS
```

**Exemplo de registro:**
```
1 | 998070-13.11.24-001 | 13/11/2024 | TP-273 | Adalton Trindade | Km 123 | 998070 | Concluída | 1500 | 1520 | 07:00 | 17:00 | Ensolarado | Uso de EPI | Sim | Não | João, Maria, José | Tudo ok | Não | 2024-11-13 18:30:00 | 2024-11-13 08:00:00
```

---

### **1.2. Aba Servicos**

**Colunas (8 campos):**
```
A  | Número RDO       | Chave para relacionar com RDO
B  | Número OS        | Número da OS
C  | Data RDO         | Data do RDO
D  | Código Turma     | Código da turma
E  | Encarregado      | Nome do encarregado
F  | Descrição        | Nome do serviço (ex: "Substituição Dormente")
G  | Quantidade       | Número (ex: 100)
H  | Unidade          | HH (Homem-Hora)
```

**Exemplo:**
```
998070-13.11.24-001 | 998070 | 13/11/2024 | TP-273 | Adalton | Substituição Dormente | 100 | HH
998070-13.11.24-001 | 998070 | 13/11/2024 | TP-273 | Adalton | Nivelamento Contínuo | 50 | HH
```

**IMPORTANTE:** O coeficiente NÃO está na planilha!
- Dashboard busca no arquivo `servicos.json` (175 serviços com coeficientes)
- Exemplo: "Substituição Dormente" → coeficiente 0.81

---

### **1.3. Aba HorasImprodutivas**

**Colunas (9 campos):**
```
A  | Número RDO       | Chave para relacionar
B  | Número OS        |
C  | Data RDO         |
D  | Código Turma     |
E  | Encarregado      |
F  | Tipo             | "Chuva" ou "RUMO" (trens)
G  | Descrição        | Detalhes
H  | Hora Início      | HH:MM
I  | Hora Fim         | HH:MM
```

**Exemplo:**
```
998070-13.11.24-001 | 998070 | 13/11/2024 | TP-273 | Adalton | Chuva | Chuva forte | 10:00 | 12:30
998070-13.11.24-001 | 998070 | 13/11/2024 | TP-273 | Adalton | RUMO | Passagem de trem | 14:00 | 14:20
```

---

### **1.4. Aba Efetivo**

**Colunas (11 campos):**
```
A  | Número RDO           |
B  | Número OS            |
C  | Data RDO             |
D  | Código Turma         |
E  | Encarregado          |
F  | Encarregado Qtd      | Quantidade de encarregados (geralmente 1)
G  | Operadores           | Quantidade de operadores
H  | Operador EGP         | Quantidade
I  | Técnico Segurança    | Quantidade
J  | Soldador             | Quantidade
K  | Motoristas           | Quantidade
```

**Exemplo:**
```
998070-13.11.24-001 | 998070 | 13/11/2024 | TP-273 | Adalton | 1 | 12 | 0 | 0 | 0 | 0
```

---

### **1.5. Aba Equipamentos**

**Colunas (7 campos):**
```
A  | Número RDO       |
B  | Número OS        |
C  | Data RDO         |
D  | Código Turma     |
E  | Encarregado      |
F  | Tipo             | Caminhão Munck, Micro-ônibus, etc.
G  | Placa            | Placa do veículo
```

---

## 🔌 **ETAPA 2: Carregamento (sheets-api.js)**

### **2.1. Inicialização**

```javascript
// Arquivo: js/sheets-api.js

const sheetsAPI = new GoogleSheetsAPI();

// Configuração
SPREADSHEET_ID: '1H40DX9HwwOwXJquM9bX1qCYuam90hYpiC8enGb9TYFQ'
API_KEY: 'AIzaSyCT-HEiAY4qN6UtoxTARgykRr_GyM4N0AA'
```

### **2.2. Carregamento das Abas**

```javascript
async carregarTodosDados() {
    // 1. Fazer requisições PARALELAS (mais rápido)
    const [rdosRaw, servicosRaw, hiRaw, ...] = await Promise.all([
        this.carregarAba('RDO'),
        this.carregarAba('Servicos'),
        this.carregarAba('HorasImprodutivas'),
        this.carregarAba('Efetivo'),
        this.carregarAba('Equipamentos'),
        this.carregarAba('Materiais'),
        this.carregarAba('TransporteSucatas')
    ]);

    // 2. Converter arrays em objetos
    const dados = {
        rdos: this.converterParaObjetos(rdosRaw),
        servicos: this.converterParaObjetos(servicosRaw),
        // ...
    };

    // 3. Enriquecer com coeficientes
    dados.servicos = await this.enriquecerServicosComCoeficientes(dados.servicos);

    return dados;
}
```

### **2.3. Conversão Array → Objeto**

**Google Sheets retorna assim:**
```javascript
[
  ["ID", "Número RDO", "Data", "Código Turma", ...],  // Header (linha 1)
  [1, "998070-13.11.24-001", "13/11/2024", "TP-273", ...],  // Linha 2
  [2, "998070-14.11.24-001", "14/11/2024", "TP-273", ...]   // Linha 3
]
```

**Dashboard converte para:**
```javascript
[
  {
    "ID": 1,
    "Número RDO": "998070-13.11.24-001",
    "Data": "13/11/2024",
    "Código Turma": "TP-273",
    ...
  },
  {
    "ID": 2,
    "Número RDO": "998070-14.11.24-001",
    "Data": "14/11/2024",
    ...
  }
]
```

### **2.4. Enriquecimento com Coeficientes**

```javascript
// Carregar servicos.json (175 serviços)
const servicosReferencia = await fetch('servicos.json');

// Criar mapa: Descrição → Coeficiente
const mapa = {
  "Substituição Dormente": 0.81,
  "Nivelamento Contínuo": 0.81,
  "Correção Da Bitola": 0.25,
  // ... 175 serviços
};

// Adicionar coeficiente aos serviços da planilha
servicos.forEach(s => {
  const coef = mapa[s.Descrição] || 0;
  s.coeficiente = coef;
});
```

**RESULTADO:**
```javascript
{
  "Número RDO": "998070-13.11.24-001",
  "Descrição": "Substituição Dormente",
  "Quantidade": 100,
  "Unidade": "HH",
  "coeficiente": 0.81  // ✅ ADICIONADO!
}
```

---

## 🧮 **ETAPA 3: Cálculos (calculations.js)**

### **3.1. Filtrar RDOs por Período**

```javascript
// Usuário seleciona: Novembro/2024 + TP-273
filtrarRDOsPorTurma(turma = "TP-273", mes = 11, ano = 2024) {
    return this.rdos.filter(rdo => {
        const data = rdo.Data || rdo.data;  // Normalização
        const [dia, mesRDO, anoRDO] = data.split('/');
        const codigoTurma = rdo['Código Turma'] || rdo.codigoTurma;

        return codigoTurma === "TP-273" &&
               parseInt(mesRDO) === 11 &&
               parseInt(anoRDO) === 2024;
    });
}
```

**RESULTADO:** Lista com 6 RDOs da TP-273 em Novembro

---

### **3.2. Cálculo de HH de Serviços (TPs)**

```javascript
calcularHHServicos(rdos) {
    let totalHH = 0;

    rdos.forEach(rdo => {
        const numeroRDO = rdo['Número RDO'];

        // Buscar TODOS os serviços deste RDO
        const servicosRDO = this.servicos.filter(s =>
            s['Número RDO'] === numeroRDO
        );

        // Para CADA serviço, calcular HH
        servicosRDO.forEach(servico => {
            const hh = servico.Quantidade * servico.coeficiente;
            totalHH += hh;
        });
    });

    return totalHH;
}
```

**EXEMPLO PRÁTICO:**

RDO: `998070-13.11.24-001` tem 3 serviços:

| Descrição | Quantidade | Coeficiente | HH Calculado |
|-----------|------------|-------------|--------------|
| Substituição Dormente | 100 | 0.81 | **81.0** |
| Nivelamento Contínuo | 50 | 0.81 | **40.5** |
| Correção Da Bitola | 30 | 0.25 | **7.5** |
| **TOTAL** | | | **129.0 HH** |

---

### **3.3. Cálculo de HH Improdutivas (TPs)**

```javascript
calcularHHImprodutivas(rdos) {
    let totalHH = 0;

    rdos.forEach(rdo => {
        const numeroRDO = rdo['Número RDO'];

        // Buscar HIs deste RDO
        const hisRDO = this.horasImprodutivas.filter(hi =>
            hi['Número RDO'] === numeroRDO
        );

        hisRDO.forEach(hi => {
            // 1. Calcular diferença de horas
            const horasImprodutivas = this.calcularDiferencaHoras(
                hi['Hora Início'],  // "10:00"
                hi['Hora Fim']       // "12:30"
            );  // = 2.5 horas

            // 2. Buscar número de operadores do dia
            const efetivo = this.efetivos.find(e =>
                e['Número RDO'] === numeroRDO
            );
            const operadores = efetivo ? efetivo.Operadores : 12;

            // 3. Calcular HH
            let hhImprodutiva = horasImprodutivas * operadores;

            // 4. REGRA ESPECIAL: Chuva divide por 2
            if (hi.Tipo.includes('Chuva')) {
                hhImprodutiva = hhImprodutiva / 2;
            }

            // 5. REGRA ESPECIAL: Trens só conta se > 15min
            if (hi.Tipo.includes('RUMO')) {
                if (horasImprodutivas < 0.25) {  // 15min = 0.25h
                    hhImprodutiva = 0;
                }
            }

            totalHH += hhImprodutiva;
        });
    });

    return totalHH;
}
```

**EXEMPLO PRÁTICO:**

RDO `998070-13.11.24-001` com 12 operadores:

| Tipo | Hora Início | Hora Fim | Diferença | Operadores | Cálculo | HH |
|------|-------------|----------|-----------|------------|---------|-----|
| Chuva | 10:00 | 12:30 | 2.5h | 12 | (2.5 × 12) ÷ 2 | **15.0** |
| RUMO | 14:00 | 14:20 | 0.33h | 12 | 0.33 × 12 | **4.0** |
| **TOTAL** | | | | | | **19.0 HH** |

---

### **3.4. Cálculo de SLA (TP)**

```javascript
calcularMedicaoTP(turma = "TP-273", mes = 11, ano = 2024) {
    // 1. Filtrar RDOs
    const rdosTurma = this.filtrarRDOsPorTurma(turma, mes, ano);

    // 2. Dias úteis do mês (pode ser configurável)
    const diasUteis = 22;  // Novembro/2024

    // 3. Calcular meta mensal
    const metaMensal = 12 × 8 × diasUteis;  // 2.112 HH

    // 4. Calcular HH realizados
    const hhServicos = this.calcularHHServicos(rdosTurma);      // 800 HH
    const hhImprodutivas = this.calcularHHImprodutivas(rdosTurma);  // 150 HH
    const hhTotal = hhServicos + hhImprodutivas;  // 950 HH

    // 5. Calcular percentual do SLA
    const percentualSLA = hhTotal / metaMensal;  // 950 / 2112 = 0.45 = 45%

    // 6. LIMITE DE 110%
    const percentualFinal = Math.min(percentualSLA, 1.10);

    // 7. Calcular faturamento
    const valorFixoTP = {
        engecom: 26488.37 + (12 × 14584.80),  // Encarregado + 12 operadores
        encogel: 54870.19 + 43246.76 + 51462.78  // Munck + Ônibus + Escavadeira
    };

    const faturamento = {
        engecom: valorFixoTP.engecom × percentualFinal,
        encogel: valorFixoTP.encogel × percentualFinal,
        total: (valorFixoTP.engecom + valorFixoTP.encogel) × percentualFinal
    };

    return {
        turma,
        metaMensal,
        hhServicos,
        hhImprodutivas,
        hhTotal,
        percentualSLA,
        faturamento,
        atingiuTeto: percentualSLA >= 1.10
    };
}
```

**RESULTADO:**
```javascript
{
  turma: "TP-273",
  metaMensal: 2112,      // 12 × 8 × 22
  hhServicos: 800,
  hhImprodutivas: 150,
  hhTotal: 950,
  percentualSLA: 0.45,   // 45%
  faturamento: {
    engecom: R$ 79.500,
    encogel: R$ 67.300,
    total: R$ 146.800
  },
  atingiuTeto: false
}
```

---

### **3.5. Cálculo TMC (Proporcional)**

```javascript
calcularMedicaoTMC(turma = "TMC 810", mes = 11, ano = 2024) {
    // 1. Filtrar RDOs
    const rdosTurma = this.filtrarRDOsPorTurma(turma, mes, ano);

    // 2. Contar dias únicos trabalhados
    const diasTrabalhados = this.contarDiasUnicos(rdosTurma);  // 23 dias

    // 3. Dias úteis
    const diasUteis = 22;

    // 4. Calcular médias
    const mediaEncarregado = diasTrabalhados / diasUteis;  // 23/22 = 1.045
    const mediaOperadores = this.calcularMediaOperadores(rdosTurma, diasUteis);

    // 5. Calcular valores ENGECOM
    const valorEncarregado = mediaEncarregado × 26488.37;  // 1.045 × 26488 = R$ 27.680
    const valorOperadores = mediaOperadores × 14584.80;

    // 6. Calcular valores ENCOGEL
    const mediaCaminhao = diasTrabalhados / diasUteis;  // 1.045
    const valorCaminhao = mediaCaminhao × 43248.34;  // R$ 45.194

    return {
        turma,
        diasUteis,
        diasTrabalhados,
        mediaEncarregado,
        engecom: valorEncarregado + valorOperadores,
        encogel: valorCaminhao,
        total: ...
    };
}
```

---

## 📊 **ETAPA 4: Visualização (main.js + charts.js)**

### **4.1. Atualizar KPIs**

```javascript
atualizarKPIs() {
    // Total de RDOs
    document.getElementById('kpiTotalRdos').textContent = 15;

    // Total HH (TPs)
    const totalHH = 2500;
    document.getElementById('kpiTotalHH').textContent = '2.500';

    // Faturamento
    document.getElementById('kpiFaturamento').textContent = 'R$ 850.000,00';

    // Média SLA
    const mediaSLA = 0.92;  // 92%
    document.getElementById('kpiMediaSLA').textContent = '92%';
}
```

---

### **4.2. Renderizar Gráficos**

```javascript
// Gráfico de Barras Empilhadas: HH Produtivas vs Improdutivas
const labels = ['TP-273', 'TP-274', 'TP-761'];
const hhServicos = [800, 950, 1200];
const hhImprodutivas = [150, 100, 80];

new Chart(ctx, {
    type: 'bar',
    data: {
        labels,
        datasets: [
            { label: 'HH Produtivas', data: hhServicos, backgroundColor: '#4CAF50' },
            { label: 'HH Improdutivas', data: hhImprodutivas, backgroundColor: '#FFC107' }
        ]
    },
    options: { scales: { x: { stacked: true }, y: { stacked: true } } }
});
```

---

### **4.3. Renderizar Tabelas**

```javascript
renderizarTabelaTPs() {
    const tbody = document.querySelector('#tabelaTPs tbody');

    tps.forEach(tp => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${tp.turma}</td>
            <td>${tp.metaMensal} HH</td>
            <td>${tp.hhTotal} HH</td>
            <td>${(tp.percentualSLA * 100).toFixed(1)}%</td>
            <td>${formatarMoeda(tp.faturamento.total)}</td>
        `;
        tbody.appendChild(tr);
    });
}
```

---

### **4.4. Heatmap de Produtividade**

```javascript
renderizarHeatmap() {
    const analiseDiaria = [
        { data: '01/11/2024', hhTotal: 98, status: 'verde' },   // >= 96 HH
        { data: '02/11/2024', hhTotal: 85, status: 'amarelo' }, // 80-95 HH
        { data: '03/11/2024', hhTotal: 70, status: 'vermelho' } // < 80 HH
    ];

    analiseDiaria.forEach(dia => {
        const div = document.createElement('div');
        div.className = `heatmap-day ${dia.status}`;
        div.innerHTML = `
            <div>${dia.data.split('/')[0]}</div>
            <div>${dia.hhTotal} HH</div>
        `;
        container.appendChild(div);
    });
}
```

---

## 🎯 **RESUMO DO FLUXO**

```
1. GOOGLE SHEETS
   └─ 7 abas com dados
      ├─ RDO (principal)
      ├─ Servicos (com Número RDO)
      ├─ HorasImprodutivas (Chuva/RUMO)
      ├─ Efetivo (operadores por dia)
      └─ ...

2. CARREGAMENTO (sheets-api.js)
   ├─ Requisição HTTP com API Key
   ├─ Conversão Array → Objeto
   └─ Enriquecimento com coeficientes

3. CÁLCULOS (calculations.js)
   ├─ Filtrar por Turma/Mês/Ano
   ├─ HH Serviços = Σ(Qtd × Coef)
   ├─ HH Improdutivas = (Horas × Operadores) com regras
   ├─ SLA = HH Total / Meta (limite 110%)
   └─ TMC = Média × Valor Fixo

4. VISUALIZAÇÃO (main.js + charts.js)
   ├─ KPIs (cards)
   ├─ Gráficos (Chart.js)
   ├─ Tabelas (HTML)
   └─ Heatmap (divs coloridas)
```

---

## 🔍 **CAMPOS CRÍTICOS PARA O DASHBOARD**

### **Aba RDO:**
- ✅ `Data` → Filtrar por mês/ano
- ✅ `Código Turma` → Identificar TP ou TMC
- ✅ `Número RDO` → Relacionar com outras abas

### **Aba Servicos:**
- ✅ `Número RDO` → Chave de relacionamento
- ✅ `Descrição` → Buscar coeficiente no servicos.json
- ✅ `Quantidade` → Multiplicar pelo coeficiente

### **Aba HorasImprodutivas:**
- ✅ `Número RDO` → Chave
- ✅ `Tipo` → "Chuva" (÷2) ou "RUMO" (>15min)
- ✅ `Hora Início` / `Hora Fim` → Calcular diferença

### **Aba Efetivo:**
- ✅ `Número RDO` → Chave
- ✅ `Operadores` → Multiplicar pelas horas improdutivas

---

**Alguma parte específica que você quer que eu detalhe mais?** 🔍
