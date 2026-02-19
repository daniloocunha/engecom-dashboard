/**
 * Módulo de Gráficos
 * Usando Chart.js para visualizações
 */

class DashboardCharts {
    constructor() {
        this.charts = {};
    }

    /**
     * Renderiza todos os gráficos (otimizado - update em vez de destroy)
     */
    renderizarTodos(estatisticas, calculadora) {
        debugLog('[Charts] Renderizando gráficos...');

        // 🚀 OTIMIZAÇÃO: Atualizar em vez de destruir
        // Só destruir se necessário (mudança de estrutura)

        this.renderizarEvolucao(estatisticas, calculadora);
        this.renderizarDistribuicao(estatisticas);
        this.renderizarRanking(estatisticas);
        this.renderizarHHComparacao(estatisticas);
        // this.renderizarSLAGauge(estatisticas); // ❌ REMOVIDO: Gráfico "SLA Médio" foi removido do HTML
        this.renderizarTMCsComparacao(estatisticas);

        // Renderizar gráficos de TS
        this.renderizarSLAGaugeTS(estatisticas);
        this.renderizarEvolucaoTS(estatisticas);
        this.renderizarTSsComparacao(estatisticas);

        debugLog('[Charts] Gráficos renderizados');
    }

    /**
     * Atualiza dados de um gráfico existente (sem destruir)
     */
    atualizarGrafico(chartId, novosLabels, novosDatasets) {
        const chart = this.charts[chartId];

        if (!chart) {
            return false; // Gráfico não existe, precisa criar
        }

        // Atualizar labels
        if (novosLabels) {
            chart.data.labels = novosLabels;
        }

        // Atualizar datasets
        if (novosDatasets) {
            novosDatasets.forEach((novoDataset, index) => {
                if (chart.data.datasets[index]) {
                    chart.data.datasets[index].data = novoDataset.data;
                    if (novoDataset.label) chart.data.datasets[index].label = novoDataset.label;
                }
            });
        }

        // Atualizar sem animação para performance
        chart.update('none');
        debugLog(`[Charts] Gráfico ${chartId} atualizado`);
        return true;
    }

    /**
     * Gráfico de Evolução (Linha) - Faturamento ao longo do tempo
     */
    renderizarEvolucao(estatisticas, calculadora) {
        const ctx = document.getElementById('chartEvolucao');
        if (!ctx) return;

        // Gerar evolução dos últimos 6 meses com dados REAIS
        const meses = [];
        const valoresEngecom = [];
        const valoresEncogel = [];

        const hoje = new Date();

        for (let i = 5; i >= 0; i--) {
            const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
            const nomeMes = data.toLocaleDateString('pt-BR', { month: 'short' });
            meses.push(nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1));

            if (i === 0) {
                // Mês atual: usar estatísticas já calculadas
                valoresEngecom.push(estatisticas.totalEngecom || 0);
                valoresEncogel.push(estatisticas.totalEncogel || 0);
            } else if (calculadora) {
                // Meses anteriores: calcular dados reais via calculadora (com cache)
                const mes = data.getMonth() + 1;
                const ano = data.getFullYear();
                const stats = calculadora.calcularEstatisticasConsolidadas(mes, ano);
                valoresEngecom.push(stats.totalEngecom || 0);
                valoresEncogel.push(stats.totalEncogel || 0);
            } else {
                // Fallback sem calculadora
                valoresEngecom.push(0);
                valoresEncogel.push(0);
            }
        }

        // 🚀 FIX: Destruir gráfico existente antes de criar novo
        if (this.charts.evolucao) {
            this.charts.evolucao.destroy();
        }

        this.charts.evolucao = new Chart(ctx, {
            type: 'line',
            data: {
                labels: meses,
                datasets: [
                    {
                        label: 'Engecom (Mão de Obra)',
                        data: valoresEngecom,
                        borderColor: CORES.PRIMARY,
                        backgroundColor: CORES.PRIMARY + '20',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Encogel (Equipamentos)',
                        data: valoresEncogel,
                        borderColor: CORES.SECONDARY,
                        backgroundColor: CORES.SECONDARY + '20',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return context.dataset.label + ': ' + formatarMoeda(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => formatarMoeda(value)
                        }
                    }
                },
                // ✅ DRILL-DOWN: Clique no gráfico para detalhar período
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const mesClicado = meses[index];
                        const valorEngecom = valoresEngecom[index];
                        const valorEncogel = valoresEncogel[index];

                        alert(
                            `📊 Detalhes de ${mesClicado}\n\n` +
                            `💼 Engecom (Mão de Obra): ${formatarMoeda(valorEngecom)}\n` +
                            `🏗️ Encogel (Equipamentos): ${formatarMoeda(valorEncogel)}\n` +
                            `💰 Total: ${formatarMoeda(valorEngecom + valorEncogel)}`
                        );
                    }
                }
            }
        });
    }

    /**
     * Gráfico de Distribuição (Pizza) - Engecom vs Encogel
     */
    renderizarDistribuicao(estatisticas) {
        const ctx = document.getElementById('chartDistribuicao');
        if (!ctx) return;

        const { totalEngecom, totalEncogel } = estatisticas;

        // 🚀 FIX: Destruir gráfico existente antes de criar novo
        if (this.charts.distribuicao) {
            this.charts.distribuicao.destroy();
        }

        this.charts.distribuicao = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Engecom', 'Encogel'],
                datasets: [{
                    data: [totalEngecom, totalEncogel],
                    backgroundColor: [
                        'rgba(54, 162, 235, 0.9)',  // Azul vibrante
                        'rgba(153, 102, 255, 0.9)'  // Roxo vibrante
                    ],
                    borderColor: '#fff',
                    borderWidth: 4,
                    hoverOffset: 15,
                    hoverBorderWidth: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '60%',  // Doughnut mais grosso
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: {
                                size: 15,
                                weight: '600'
                            },
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: {
                            size: 15,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 14
                        },
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = formatarMoeda(context.parsed);
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percent = ((context.parsed / total) * 100).toFixed(1);
                                return `${label}: ${value} (${percent}%)`;
                            }
                        }
                    },
                    datalabels: {
                        color: '#fff',
                        font: {
                            size: 16,
                            weight: 'bold'
                        },
                        formatter: function(value, context) {
                            const label = context.chart.data.labels[context.dataIndex];
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}\n${percentage}%\n${formatarMoeda(value)}`;
                        },
                        textAlign: 'center',
                        anchor: 'center',
                        align: 'center',
                        textShadowBlur: 4,
                        textShadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                },
                animation: {
                    animateRotate: true,
                    animateScale: true,
                    duration: 1000,
                    easing: 'easeInOutQuart'
                }
            },
            plugins: [ChartDataLabels]
        });
    }

    /**
     * Gráfico de Ranking (Barras Horizontais) - Top turmas por faturamento
     */
    renderizarRanking(estatisticas) {
        const ctx = document.getElementById('chartRanking');
        if (!ctx) return;

        const { tmcs, tps } = estatisticas;

        // Combinar todas as turmas e ordenar por faturamento
        const todasTurmas = [...tmcs, ...tps]
            .sort((a, b) => b.totalGeral - a.totalGeral)
            .slice(0, 10);  // Top 10

        const labels = todasTurmas.map(t => t.turma);
        const valores = todasTurmas.map(t => t.totalGeral);
        const cores = todasTurmas.map(t => t.tipo === 'TP' ? CORES.SUCCESS : CORES.INFO);

        // 🚀 FIX: Destruir gráfico existente antes de criar novo
        if (this.charts.ranking) {
            this.charts.ranking.destroy();
        }

        this.charts.ranking = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Faturamento',
                    data: valores,
                    backgroundColor: cores,
                    borderWidth: 0
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => formatarMoeda(context.parsed.x)
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => formatarMoeda(value)
                        }
                    }
                }
            }
        });
    }

    /**
     * Gráfico de HH Comparação (Barras Empilhadas) - Produtivas vs Improdutivas
     * Com linha de meta mensal
     */
    renderizarHHComparacao(estatisticas) {
        const ctx = document.getElementById('chartHHComparacao');
        if (!ctx) return;

        const { tps } = estatisticas;

        if (tps.length === 0) {
            ctx.parentElement.innerHTML = '<p class="text-center text-muted">Nenhuma TP no período selecionado</p>';
            return;
        }

        const labels = tps.map(tp => tp.turma);
        const hhServicos = tps.map(tp => tp.hh.servicos);
        const hhImprodutivas = tps.map(tp => tp.hh.improdutivas);

        // Calcular meta mensal para cada TP (assumindo que está nos dados)
        const metaMensal = tps.map(tp => tp.metaMensal || 0);

        // 🚀 FIX: Destruir gráfico existente antes de criar novo
        if (this.charts.hhComparacao) {
            this.charts.hhComparacao.destroy();
        }

        this.charts.hhComparacao = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'HH Produtivas',
                        data: hhServicos,
                        backgroundColor: CORES.SUCCESS,
                        borderWidth: 0,
                        stack: 'Stack 0'
                    },
                    {
                        label: 'HH Improdutivas',
                        data: hhImprodutivas,
                        backgroundColor: CORES.WARNING,
                        borderWidth: 0,
                        stack: 'Stack 0'
                    },
                    {
                        label: 'Meta Mensal',
                        data: metaMensal,
                        type: 'line',
                        borderColor: '#dc3545',
                        borderWidth: 3,
                        borderDash: [10, 5],
                        fill: false,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        tension: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y.toFixed(0);
                                return label + ': ' + value + ' HH';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => value + ' HH'
                        }
                    }
                }
            }
        });
    }

    /**
     * Gráfico Gauge SLA (Doughnut simplificado)
     */
    renderizarSLAGauge(estatisticas) {
        const ctx = document.getElementById('chartSLAGauge');
        if (!ctx) return;

        const { tps } = estatisticas;

        if (tps.length === 0) {
            ctx.parentElement.innerHTML = '<p class="text-muted">Nenhuma TP</p>';
            return;
        }

        // Calcular média de SLA
        const mediaSLA = tps.reduce((sum, tp) => sum + tp.percentualSLA, 0) / tps.length;
        const percentual = Math.min(mediaSLA * 100, 110);

        // Determinar cor
        let cor = CORES.DANGER;
        if (mediaSLA >= THRESHOLDS.SLA_OK) cor = CORES.SUCCESS;
        else if (mediaSLA >= THRESHOLDS.SLA_ALERTA) cor = CORES.WARNING;

        // 🚀 FIX: Destruir gráfico existente antes de criar novo
        if (this.charts.slaGauge) {
            this.charts.slaGauge.destroy();
        }

        this.charts.slaGauge = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [percentual, 110 - percentual],
                    backgroundColor: [cor, '#e0e0e0'],
                    borderWidth: 0,
                    circumference: 180,
                    rotation: 270
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '75%',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                }
            },
            plugins: [{
                id: 'gaugeCenterText',
                afterDatasetDraw: (chart) => {
                    const { ctx, chartArea: { width, height } } = chart;
                    ctx.save();

                    const centerX = width / 2;
                    const centerY = height * 0.75;

                    ctx.font = 'bold 2.5rem sans-serif';
                    ctx.fillStyle = cor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(percentual.toFixed(1) + '%', centerX, centerY);

                    ctx.font = '1rem sans-serif';
                    ctx.fillStyle = '#666';
                    ctx.fillText('Média SLA', centerX, centerY + 40);

                    ctx.restore();
                }
            }]
        });
    }

    /**
     * Gráfico de Comparação TMCs (Barras)
     */
    renderizarTMCsComparacao(estatisticas) {
        const ctx = document.getElementById('chartTMCsComparacao');
        if (!ctx) return;

        const { tmcs } = estatisticas;

        if (tmcs.length === 0) {
            ctx.parentElement.innerHTML = '<p class="text-center text-muted">Nenhuma TMC no período selecionado</p>';
            return;
        }

        const labels = tmcs.map(tmc => tmc.turma);
        const valoresEngecom = tmcs.map(tmc => tmc.engecom.total);
        const valoresEncogel = tmcs.map(tmc => tmc.encogel.total);

        // 🚀 FIX: Destruir gráfico existente antes de criar novo
        if (this.charts.tmcsComparacao) {
            this.charts.tmcsComparacao.destroy();
        }

        this.charts.tmcsComparacao = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Engecom',
                        data: valoresEngecom,
                        backgroundColor: CORES.PRIMARY,
                        borderWidth: 0
                    },
                    {
                        label: 'Encogel',
                        data: valoresEncogel,
                        backgroundColor: CORES.SECONDARY,
                        borderWidth: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return context.dataset.label + ': ' + formatarMoeda(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => formatarMoeda(value)
                        }
                    }
                }
            }
        });
    }

    /**
     * Renderiza gráficos de pizza do período (HH Produtivas vs Improdutivas)
     */
    renderizarGraficosPizza(dados) {
        if (!dados || !dados.servicos || !dados.horasImprodutivas) return;

        // Calcular totais
        // ✅ HH Produtivas: calcular quantidade × coeficiente para cada serviço
        const totalHHProdutivas = dados.servicos.reduce((sum, s) => {
            const quantidade = parseFloat(s.Quantidade || s.quantidade || 0);
            const coeficiente = parseFloat(s.Coeficiente || s.coeficiente || 0);
            const hh = quantidade * coeficiente;
            return sum + hh;
        }, 0);

        // ✅ HH Improdutivas: já vem calculado no campo
        const totalHHImprodutivas = dados.horasImprodutivas.reduce((sum, hi) => {
            return sum + (parseFloat(hi['HH Improdutivas']) || 0);
        }, 0);

        debugLog('[Charts] Distribuição HH:', {
            produtivas: totalHHProdutivas,
            improdutivas: totalHHImprodutivas
        });

        // Gráfico 1: Distribuição HH do Período
        const ctxDistribuicao = document.getElementById('chartDistribuicaoHHPeriodo');
        if (ctxDistribuicao) {
            // 🚀 OTIMIZAÇÃO: Tentar atualizar antes de destruir
            const atualizado = this.atualizarGrafico('distribuicaoHH', null, [{
                data: [totalHHProdutivas, totalHHImprodutivas]
            }]);

            if (atualizado) return; // Já atualizou, não precisa recriar

            // Criar novo gráfico apenas se não existir
            if (this.charts.distribuicaoHH) this.charts.distribuicaoHH.destroy();

            this.charts.distribuicaoHH = new Chart(ctxDistribuicao, {
                type: 'pie',
                data: {
                    labels: ['HH Produtivas', 'HH Improdutivas'],
                    datasets: [{
                        data: [totalHHProdutivas, totalHHImprodutivas],
                        backgroundColor: [
                            'rgba(40, 167, 69, 0.9)',   // Verde vibrante
                            'rgba(255, 193, 7, 0.9)'    // Amarelo vibrante
                        ],
                        borderWidth: 4,
                        borderColor: '#fff',
                        hoverOffset: 15,
                        hoverBorderWidth: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: {
                                    size: 15,
                                    weight: '600'
                                },
                                padding: 20,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleFont: {
                                size: 15,
                                weight: 'bold'
                            },
                            bodyFont: {
                                size: 14
                            },
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                    return `${label}: ${value.toFixed(2)} HH (${percentage}%)`;
                                }
                            }
                        },
                        datalabels: {
                            color: '#fff',
                            font: {
                                size: 16,
                                weight: 'bold'
                            },
                            formatter: function(value, context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                const label = context.chart.data.labels[context.dataIndex];
                                return `${label}\n${percentage}%\n${value.toFixed(1)} HH`;
                            },
                            textAlign: 'center',
                            anchor: 'center',
                            align: 'center',
                            textShadowBlur: 4,
                            textShadowColor: 'rgba(0, 0, 0, 0.5)'
                        }
                    },
                    animation: {
                        animateRotate: true,
                        animateScale: true,
                        duration: 1000,
                        easing: 'easeInOutQuart'
                    }
                },
                plugins: [ChartDataLabels]
            });
        }

        // Gráfico 2: Top 10 Serviços + Categorias de HI
        const ctxTop10 = document.getElementById('chartTop10Periodo');
        if (ctxTop10) {
            if (this.charts.top10) this.charts.top10.destroy();

            // Agregar serviços por descrição e HIs por categoria (Tipo)
            const itens = {};

            // Adicionar serviços (individualmente)
            // ✅ Calcular HH = quantidade × coeficiente
            dados.servicos.forEach(servico => {
                const descricao = servico['Descrição'] || servico.descricao;
                const quantidade = parseFloat(servico.Quantidade || servico.quantidade || 0);
                const coeficiente = parseFloat(servico.Coeficiente || servico.coeficiente || 0);
                const hh = quantidade * coeficiente;

                if (itens[descricao]) {
                    itens[descricao].hh += hh;
                } else {
                    itens[descricao] = { hh, tipo: 'servico' };
                }
            });

            // Adicionar HIs (agrupados por CATEGORIA/TIPO)
            dados.horasImprodutivas.forEach(hi => {
                const tipo = hi['Tipo'] || hi.tipo || 'Sem Categoria';
                const categoria = `[HI] ${tipo}`;
                const hh = parseFloat(hi['HH Improdutivas']) || 0;
                if (itens[categoria]) {
                    itens[categoria].hh += hh;
                } else {
                    itens[categoria] = { hh, tipo: 'hi' };
                }
            });

            // Ordenar e pegar top 10
            const top10 = Object.entries(itens)
                .sort((a, b) => b[1].hh - a[1].hh)
                .slice(0, 10);

            const labels = top10.map(([desc]) => desc.length > 30 ? desc.substring(0, 27) + '...' : desc);
            const values = top10.map(([_, item]) => item.hh);

            // Gerar cores variadas para melhor visualização
            const coresServicos = ['#28a745', '#20c997', '#17a2b8', '#0d6efd', '#6610f2'];
            const coresHI = ['#ffc107', '#fd7e14', '#dc3545', '#e83e8c', '#d63384'];
            const colors = top10.map(([_, item], index) => {
                if (item.tipo === 'servico') {
                    return coresServicos[index % coresServicos.length];
                } else {
                    return coresHI[index % coresHI.length];
                }
            });

            this.charts.top10 = new Chart(ctxTop10, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: {
                                    size: 11
                                },
                                padding: 10
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                    return `${label}: ${value.toFixed(2)} HH (${percentage}%)`;
                                }
                            }
                        },
                        datalabels: {
                            color: '#fff',
                            font: {
                                size: 11,
                                weight: 'bold'
                            },
                            formatter: function(value, context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                // Mostra nome (resumido) + porcentagem para fatias >= 3%
                                if (percentage >= 3) {
                                    const label = context.chart.data.labels[context.dataIndex];
                                    // Resumir nome se muito longo
                                    const labelCurto = label.length > 15 ? label.substring(0, 12) + '...' : label;
                                    return `${labelCurto}\n${percentage}%`;
                                }
                                return '';
                            },
                            textAlign: 'center',
                            anchor: 'center',
                            align: 'center'
                        }
                    }
                },
                plugins: [ChartDataLabels]
            });
        }
    }

    /**
     * Classifica serviço como PDM ou CORRELATOS
     */
    classificarServico(descricao) {
        const desc = descricao.toLowerCase();

        // PDM: dormentes, concreto, soldas, trilho, alívio, lastro
        const palavrasPDM = [
            'dormente', 'dormentes',
            'concreto',
            'solda', 'soldagem', 'soldador',
            'trilho', 'trilhos',
            'alivio', 'alívio',
            'lastro', 'limpeza de lastro'
        ];

        for (const palavra of palavrasPDM) {
            if (desc.includes(palavra)) {
                return 'PDM';
            }
        }

        return 'CORRELATOS';
    }

    /**
     * Renderiza tabela de totais mensais de serviços (PDM e CORRELATOS)
     */
    renderizarTotaisMensais(dados) {
        if (!dados || !dados.servicos) return;

        const tbody = document.querySelector('#tabelaTotaisMensais tbody');
        if (!tbody) return;

        // Agregar serviços por descrição
        const servicos = {};
        dados.servicos.forEach(servico => {
            const descricao = servico['Descrição'] || servico.descricao;
            const quantidade = parseFloat(servico['Quantidade'] || servico.quantidade) || 0;
            const unidade = servico['Unidade'] || servico.unidade || '';
            const coeficiente = parseFloat(servico['Coeficiente'] || servico.coeficiente) || 0;
            const hh = quantidade * coeficiente;

            if (servicos[descricao]) {
                servicos[descricao].quantidade += quantidade;
                servicos[descricao].hh += hh;
                servicos[descricao].ocorrencias += 1;
            } else {
                servicos[descricao] = {
                    quantidade,
                    unidade,
                    hh,
                    ocorrencias: 1,
                    categoria: this.classificarServico(descricao)
                };
            }
        });

        // Separar em PDM e CORRELATOS
        const servicosPDM = {};
        const servicosCorrelatos = {};

        Object.entries(servicos).forEach(([descricao, dados]) => {
            if (dados.categoria === 'PDM') {
                servicosPDM[descricao] = dados;
            } else {
                servicosCorrelatos[descricao] = dados;
            }
        });

        // Ordenar ambas as listas por HH
        const pdmOrdenado = Object.entries(servicosPDM).sort((a, b) => b[1].hh - a[1].hh);
        const correlatosOrdenado = Object.entries(servicosCorrelatos).sort((a, b) => b[1].hh - a[1].hh);

        // Renderizar tabela com duas colunas
        tbody.innerHTML = '';

        // Calcular totais
        let totalPDM_HH = 0;
        let totalCorrelatos_HH = 0;

        pdmOrdenado.forEach(([_, dados]) => totalPDM_HH += dados.hh);
        correlatosOrdenado.forEach(([_, dados]) => totalCorrelatos_HH += dados.hh);

        // Determinar número máximo de linhas
        const maxLinhas = Math.max(pdmOrdenado.length, correlatosOrdenado.length);

        // Helper XSS local (charts.js não importa _esc do gestao-os.js)
        const _e = (t) => {
            if (t === null || t === undefined) return '';
            const d = document.createElement('div');
            d.textContent = String(t);
            return d.innerHTML;
        };

        // Preencher tabela lado a lado
        for (let i = 0; i < maxLinhas; i++) {
            const tr = document.createElement('tr');

            // Coluna PDM
            if (i < pdmOrdenado.length) {
                const [descricao, dadosPDM] = pdmOrdenado[i];
                tr.innerHTML += `
                    <td>${_e(descricao)}</td>
                    <td class="text-center">${dadosPDM.quantidade.toFixed(2)}</td>
                    <td class="text-center">${_e(dadosPDM.unidade)}</td>
                    <td class="text-end"><strong>${dadosPDM.hh.toFixed(2)}</strong></td>
                    <td class="text-center">${dadosPDM.ocorrencias}</td>
                `;
            } else {
                tr.innerHTML += `
                    <td colspan="5" class="text-muted text-center">-</td>
                `;
            }

            // Separador visual
            tr.innerHTML += `<td class="border-start border-3"></td>`;

            // Coluna CORRELATOS
            if (i < correlatosOrdenado.length) {
                const [descricao, dadosCorr] = correlatosOrdenado[i];
                tr.innerHTML += `
                    <td>${_e(descricao)}</td>
                    <td class="text-center">${dadosCorr.quantidade.toFixed(2)}</td>
                    <td class="text-center">${_e(dadosCorr.unidade)}</td>
                    <td class="text-end"><strong>${dadosCorr.hh.toFixed(2)}</strong></td>
                    <td class="text-center">${dadosCorr.ocorrencias}</td>
                `;
            } else {
                tr.innerHTML += `
                    <td colspan="5" class="text-muted text-center">-</td>
                `;
            }

            tbody.appendChild(tr);
        }

        // Atualizar totais no rodapé
        document.getElementById('totalPDM_HH').textContent = totalPDM_HH.toFixed(2);
        document.getElementById('totalCorrelatos_HH').textContent = totalCorrelatos_HH.toFixed(2);
        document.getElementById('totalGeral_HH').textContent = (totalPDM_HH + totalCorrelatos_HH).toFixed(2);
    }

    // ====================================
    // GRÁFICOS DE TS (TURMAS DE SOLDA)
    // ====================================

    /**
     * Gráfico Gauge - SLA Médio TS
     */
    renderizarSLAGaugeTS(estatisticas) {
        const ctx = document.getElementById('chartSLAGaugeTS');
        if (!ctx) return;

        const { tss } = estatisticas;

        if (!tss || tss.length === 0) {
            ctx.parentElement.innerHTML = '<p class="text-center text-muted">Nenhuma TS no período</p>';
            return;
        }

        // Calcular média SLA
        const mediaSLA = tss.reduce((sum, ts) => sum + ts.percentualSLA, 0) / tss.length;
        const percentual = Math.min(mediaSLA * 100, 110);

        // Determinar cor
        let cor = CORES.VERMELHO;
        if (percentual >= 96) cor = CORES.VERDE;
        else if (percentual >= 80) cor = CORES.AMARELO;

        // 🚀 FIX: Destruir gráfico existente antes de criar novo
        if (this.charts.slaGaugeTS) {
            this.charts.slaGaugeTS.destroy();
        }

        this.charts.slaGaugeTS = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Atingido', 'Restante'],
                datasets: [{
                    data: [percentual, Math.max(110 - percentual, 0)],
                    backgroundColor: [cor, '#EEEEEE'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                circumference: 180,
                rotation: -90,
                cutout: '75%',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                }
            },
            plugins: [{
                id: 'centerTextTS',
                afterDraw: (chart) => {
                    const { ctx, chartArea: { width, height } } = chart;
                    ctx.save();

                    const fontSize = (height / 100) * 12;
                    ctx.font = `bold ${fontSize}px Arial`;
                    ctx.fillStyle = cor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const text = `${percentual.toFixed(1)}%`;
                    const textX = width / 2;
                    const textY = height / 1.3;

                    ctx.fillText(text, textX, textY);
                    ctx.restore();
                }
            }]
        });
    }

    /**
     * Gráfico de Evolução HH Soldador
     */
    renderizarEvolucaoTS(estatisticas) {
        const ctx = document.getElementById('chartEvolucaoTS');
        if (!ctx) return;

        const { tss } = estatisticas;

        if (!tss || tss.length === 0) {
            ctx.parentElement.innerHTML = '<p class="text-center text-muted">Nenhuma TS no período</p>';
            return;
        }

        // Ordenar por turma
        const tssOrdenadas = [...tss].sort((a, b) => a.turma.localeCompare(b.turma));

        const labels = tssOrdenadas.map(ts => ts.turma);
        const hhSoldador = tssOrdenadas.map(ts => ts.hh.soldador);
        const metaMensal = tssOrdenadas.map(ts => ts.metaMensal);

        // 🚀 FIX: Destruir gráfico existente antes de criar novo
        if (this.charts.evolucaoTS) {
            this.charts.evolucaoTS.destroy();
        }

        this.charts.evolucaoTS = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'HH Soldador',
                        data: hhSoldador,
                        borderColor: CORES.PRIMARY,
                        backgroundColor: CORES.PRIMARY + '40',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    },
                    {
                        label: 'Meta',
                        data: metaMensal,
                        borderColor: CORES.VERMELHO,
                        borderDash: [5, 5],
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return context.dataset.label + ': ' + context.parsed.y.toFixed(0) + ' HH';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Horas Homem (HH)'
                        }
                    }
                }
            }
        });
    }

    /**
     * Gráfico de Comparação TSs
     */
    renderizarTSsComparacao(estatisticas) {
        const ctx = document.getElementById('chartTSsComparacao');
        if (!ctx) return;

        const { tss } = estatisticas;

        if (!tss || tss.length === 0) {
            ctx.parentElement.innerHTML = '<p class="text-center text-muted">Nenhuma TS no período</p>';
            return;
        }

        // Ordenar por faturamento (maior para menor)
        const tssOrdenadas = [...tss].sort((a, b) => b.totalGeral - a.totalGeral);

        const labels = tssOrdenadas.map(ts => ts.turma);
        const engecom = tssOrdenadas.map(ts => ts.engecom);
        const encogel = tssOrdenadas.map(ts => ts.encogel);

        // 🚀 FIX: Destruir gráfico existente antes de criar novo
        if (this.charts.tssComparacao) {
            this.charts.tssComparacao.destroy();
        }

        this.charts.tssComparacao = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Engecom (Mão de Obra)',
                        data: engecom,
                        backgroundColor: CORES.PRIMARY
                    },
                    {
                        label: 'Encogel (Equipamentos)',
                        data: encogel,
                        backgroundColor: CORES.SECONDARY
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return context.dataset.label + ': ' + formatarMoeda(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => formatarMoeda(value)
                        }
                    }
                }
            }
        });
    }

    /**
     * Destrói todos os gráficos com tratamento robusto de erros
     */
    destruirTodos() {
        Object.keys(this.charts).forEach(key => {
            try {
                if (this.charts[key]) {
                    this.charts[key].destroy();
                }
            } catch (_e) {
                // Ignorar erros ao destruir
            } finally {
                delete this.charts[key];
            }
        });
    }
}

// Instância global
const dashboardCharts = new DashboardCharts();
