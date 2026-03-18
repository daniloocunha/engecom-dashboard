/**
 * Módulo de Exportação de Dados
 * Suporta CSV, Excel (XLSX) e PDF
 */

/**
 * Exporta dados para CSV
 */
function exportarCSV() {
    try {
        debugLog('[Export] Iniciando exportação CSV...');

        const dados = obterDadosParaExport();
        if (!dados || dados.length === 0) {
            mostrarToast('Nenhum dado disponível para exportar. Aplique os filtros primeiro.', 'warning');
            return;
        }

        // Cabeçalhos
        const headers = [
            'Turma',
            'Tipo',
            'Mês',
            'Ano',
            'Dias Úteis',
            'Meta Mensal (HH)',
            'HH Serviços',
            'HH Improdutivas',
            'HH Total',
            'SLA (%)',
            'Valor Engecom (R$)',
            'Valor Encogel (R$)',
            'Total Geral (R$)'
        ];

        // Construir CSV
        let csv = headers.join(',') + '\n';

        dados.forEach(row => {
            const linha = [
                row.turma || '',
                row.tipo || '',
                row.mes || '',
                row.ano || '',
                row.diasUteis || 0,
                (row.metaMensal || 0).toFixed(2),
                (row.hh?.servicos || 0).toFixed(2),
                (row.hh?.improdutivas || 0).toFixed(2),
                (row.hh?.total || 0).toFixed(2),
                ((row.percentualSLA || 0) * 100).toFixed(1),
                (row.engecom || 0).toFixed(2),
                (row.encogel || 0).toFixed(2),
                (row.totalGeral || 0).toFixed(2)
            ];
            csv += linha.join(',') + '\n';
        });

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const mes = document.getElementById('filtroMes').value;
        const ano = document.getElementById('filtroAno').value;
        const filename = `medicao_${mes}_${ano}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        debugLog(`[Export] CSV exportado com sucesso: ${filename}`);
        mostrarToast(`Arquivo ${filename} baixado com sucesso!`, 'success');

    } catch (error) {
        console.error('[Export] Erro ao exportar CSV:', error);
        mostrarToast('Erro ao exportar CSV: ' + error.message, 'danger');
    }
}

/**
 * Exporta dados para Excel (requer biblioteca SheetJS)
 */
function exportarExcel() {
    try {
        debugLog('[Export] Iniciando exportação Excel...');

        // Verificar se SheetJS está disponível
        if (typeof XLSX === 'undefined') {
            debugLog('[Export] SheetJS não carregado, exportando como CSV');
            exportarCSV();
            return;
        }

        const dados = obterDadosParaExport();
        if (!dados || dados.length === 0) {
            mostrarToast('Nenhum dado disponível para exportar. Aplique os filtros primeiro.', 'warning');
            return;
        }

        // Preparar dados para Excel
        const worksheetData = dados.map(row => ({
            'Turma': row.turma || '',
            'Tipo': row.tipo || '',
            'Mês': row.mes || '',
            'Ano': row.ano || '',
            'Dias Úteis': row.diasUteis || 0,
            'Meta Mensal (HH)': (row.metaMensal || 0).toFixed(2),
            'HH Serviços': (row.hh?.servicos || 0).toFixed(2),
            'HH Improdutivas': (row.hh?.improdutivas || 0).toFixed(2),
            'HH Total': (row.hh?.total || 0).toFixed(2),
            'SLA (%)': ((row.percentualSLA || 0) * 100).toFixed(1),
            'Valor Engecom (R$)': (row.engecom || 0).toFixed(2),
            'Valor Encogel (R$)': (row.encogel || 0).toFixed(2),
            'Total Geral (R$)': (row.totalGeral || 0).toFixed(2)
        }));

        // Criar workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(worksheetData);

        // Ajustar largura das colunas
        const colWidths = [
            { wch: 15 }, // Turma
            { wch: 8 },  // Tipo
            { wch: 8 },  // Mês
            { wch: 8 },  // Ano
            { wch: 12 }, // Dias Úteis
            { wch: 18 }, // Meta Mensal
            { wch: 15 }, // HH Serviços
            { wch: 18 }, // HH Improdutivas
            { wch: 12 }, // HH Total
            { wch: 10 }, // SLA
            { wch: 20 }, // Engecom
            { wch: 20 }, // Encogel
            { wch: 20 }  // Total
        ];
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, 'Medição');

        // Download
        const mes = document.getElementById('filtroMes').value;
        const ano = document.getElementById('filtroAno').value;
        const filename = `medicao_${mes}_${ano}.xlsx`;

        XLSX.writeFile(wb, filename);

        debugLog(`[Export] Excel exportado com sucesso: ${filename}`);
        mostrarToast(`Arquivo ${filename} baixado com sucesso!`, 'success');

    } catch (error) {
        console.error('[Export] Erro ao exportar Excel:', error);
        mostrarToast('Erro ao exportar Excel: ' + error.message, 'danger');
    }
}

/**
 * Exporta dados para PDF (requer biblioteca jsPDF)
 */
function exportarPDF() {
    try {
        debugLog('[Export] Iniciando exportação PDF...');

        // Verificar se jsPDF está disponível
        if (typeof jsPDF === 'undefined') {
            debugLog('[Export] jsPDF não carregado, exportando como CSV');
            exportarCSV();
            return;
        }

        const dados = obterDadosParaExport();
        if (!dados || dados.length === 0) {
            mostrarToast('Nenhum dado disponível para exportar. Aplique os filtros primeiro.', 'warning');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        const mes = document.getElementById('filtroMes').value;
        const ano = document.getElementById('filtroAno').value;
        const mesNome = document.querySelector(`#filtroMes option[value="${mes}"]`).text;

        // Título
        doc.setFontSize(16);
        doc.text(`Relatório de Medição - ${mesNome}/${ano}`, 14, 15);

        // Preparar dados para tabela
        const headers = [['Turma', 'Tipo', 'Meta HH', 'HH Total', 'SLA %', 'Total (R$)']];
        const rows = dados.map(row => [
            row.turma || '',
            row.tipo || '',
            (row.metaMensal || 0).toFixed(0),
            (row.hh?.total || 0).toFixed(1),
            ((row.percentualSLA || 0) * 100).toFixed(1) + '%',
            'R$ ' + (row.totalGeral || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        ]);

        // Adicionar tabela (requer jsPDF-AutoTable)
        if (typeof doc.autoTable !== 'undefined') {
            doc.autoTable({
                head: headers,
                body: rows,
                startY: 25,
                theme: 'grid',
                styles: { fontSize: 9 },
                headStyles: { fillColor: [41, 128, 185] }
            });

            // Totais
            const totalGeral = dados.reduce((sum, row) => sum + (row.totalGeral || 0), 0);
            const finalY = doc.lastAutoTable.finalY + 10;

            doc.setFontSize(12);
            doc.text(`Total Geral: R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, finalY);
        } else {
            // Fallback sem autoTable
            doc.setFontSize(10);
            let y = 30;
            dados.forEach((row, index) => {
                if (y > 180) {
                    doc.addPage();
                    y = 20;
                }
                const linha = `${row.turma} - ${row.tipo} - HH: ${(row.hh?.total || 0).toFixed(1)} - R$ ${(row.totalGeral || 0).toFixed(2)}`;
                doc.text(linha, 14, y);
                y += 7;
            });
        }

        // Download
        const filename = `medicao_${mes}_${ano}.pdf`;
        doc.save(filename);

        debugLog(`[Export] PDF exportado com sucesso: ${filename}`);
        mostrarToast(`Arquivo ${filename} baixado com sucesso!`, 'success');

    } catch (error) {
        console.error('[Export] Erro ao exportar PDF:', error);
        mostrarToast('Erro ao exportar PDF: ' + error.message, 'danger');
    }
}

/**
 * Obtém dados consolidados para exportação
 */
function obterDadosParaExport() {
    try {
        // Verificar se dashboardMain existe e tem estatísticas
        if (typeof dashboardMain === 'undefined' || !dashboardMain.estatisticas) {
            debugLog('[Export] Dados não disponíveis');
            return [];
        }

        const stats = dashboardMain.estatisticas;
        const dados = [];

        // Adicionar TMCs
        if (stats.tmcs && Array.isArray(stats.tmcs)) {
            dados.push(...stats.tmcs);
        }

        // Adicionar TPs
        if (stats.tps && Array.isArray(stats.tps)) {
            dados.push(...stats.tps);
        }

        // Adicionar TSs
        if (stats.tss && Array.isArray(stats.tss)) {
            dados.push(...stats.tss);
        }

        debugLog(`[Export] ${dados.length} registros preparados para exportação`);
        return dados;

    } catch (error) {
        debugLog('[Export] Erro ao obter dados:', error);
        return [];
    }
}
