/**
 * Helper para Exportação de Dados (CSV/Excel)
 * Permite exportar relatórios do dashboard
 */

class ExportHelper {
    /**
     * Converte array de objetos para CSV
     */
    static paraCSV(dados, colunas) {
        if (!dados || dados.length === 0) {
            return '';
        }

        // Headers
        const headers = colunas.map(c => c.label).join(',');

        // Rows
        const rows = dados.map(item => {
            return colunas.map(coluna => {
                let valor = item[coluna.campo];

                // Aplicar formatter se existir
                if (coluna.formatter && typeof coluna.formatter === 'function') {
                    valor = coluna.formatter(valor, item);
                }

                // Escape para CSV (aspas duplas e vírgulas)
                if (valor === null || valor === undefined) {
                    return '';
                }

                valor = String(valor);

                // Se contém vírgula, quebra de linha ou aspas, envolver em aspas
                if (valor.includes(',') || valor.includes('\n') || valor.includes('"')) {
                    valor = '"' + valor.replace(/"/g, '""') + '"';
                }

                return valor;
            }).join(',');
        });

        return [headers, ...rows].join('\n');
    }

    /**
     * Baixa string como arquivo
     */
    static baixarArquivo(conteudo, nomeArquivo, tipoMIME = 'text/csv') {
        const blob = new Blob(['\uFEFF' + conteudo], { type: `${tipoMIME};charset=utf-8;` });
        const link = document.createElement('a');

        if (navigator.msSaveBlob) {
            // IE 10+
            navigator.msSaveBlob(blob, nomeArquivo);
        } else {
            link.href = URL.createObjectURL(blob);
            link.download = nomeArquivo;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    /**
     * Exporta estatísticas consolidadas para CSV
     */
    static exportarEstatisticasCSV(estatisticas, filtros) {
        if (!estatisticas) {
            mostrarToast('Nenhum dado para exportar.', 'warning');
            return;
        }

        const dados = [];

        // Adicionar TMCs
        estatisticas.tmcs.forEach(tmc => {
            dados.push({
                tipo: 'TMC',
                turma: tmc.turma,
                diasTrabalhados: tmc.diasTrabalhados || 0,
                diasUteis: tmc.diasUteis || 0,
                mediaEncarregado: tmc.mediaEncarregado || 0,
                mediaOperadores: tmc.mediaOperadores || 0,
                faturamentoEngecom: tmc.engecom?.total || 0,
                faturamentoEncogel: tmc.encogel?.total || 0,
                faturamentoTotal: (tmc.engecom?.total || 0) + (tmc.encogel?.total || 0),
                sla: '-',
                hhTotal: '-'
            });
        });

        // Adicionar TPs
        estatisticas.tps.forEach(tp => {
            dados.push({
                tipo: 'TP',
                turma: tp.turma,
                diasTrabalhados: tp.diasTrabalhados || 0,
                diasUteis: tp.diasUteis || 0,
                mediaEncarregado: '-',
                mediaOperadores: '-',
                faturamentoEngecom: tp.engecom?.total || 0,
                faturamentoEncogel: tp.encogel?.total || 0,
                faturamentoTotal: (tp.engecom?.total || 0) + (tp.encogel?.total || 0),
                sla: ((tp.percentualSLA || 0) * 100).toFixed(1) + '%',
                hhTotal: (tp.hh?.total || 0).toFixed(1)
            });
        });

        // Adicionar TSs
        estatisticas.tss.forEach(ts => {
            dados.push({
                tipo: 'TS',
                turma: ts.turma,
                diasTrabalhados: ts.diasTrabalhados || 0,
                diasUteis: ts.diasUteis || 0,
                mediaEncarregado: '-',
                mediaOperadores: '-',
                faturamentoEngecom: ts.engecom || 0,
                faturamentoEncogel: ts.encogel || 0,
                faturamentoTotal: (ts.engecom || 0) + (ts.encogel || 0),
                sla: ((ts.percentualSLA || 0) * 100).toFixed(1) + '%',
                hhTotal: (ts.hhSoldador || 0).toFixed(1)
            });
        });

        const colunas = [
            { campo: 'tipo', label: 'Tipo' },
            { campo: 'turma', label: 'Turma' },
            { campo: 'diasTrabalhados', label: 'Dias Trabalhados' },
            { campo: 'diasUteis', label: 'Dias Úteis' },
            { campo: 'mediaEncarregado', label: 'Média Encarregado' },
            { campo: 'mediaOperadores', label: 'Média Operadores' },
            { campo: 'hhTotal', label: 'HH Total' },
            { campo: 'sla', label: 'SLA' },
            { campo: 'faturamentoEngecom', label: 'Faturamento Engecom (R$)', formatter: (v) => v.toFixed(2) },
            { campo: 'faturamentoEncogel', label: 'Faturamento Encogel (R$)', formatter: (v) => v.toFixed(2) },
            { campo: 'faturamentoTotal', label: 'Faturamento Total (R$)', formatter: (v) => v.toFixed(2) }
        ];

        const csv = this.paraCSV(dados, colunas);

        const nomeArquivo = `relatorio-medicao-${filtros.mes.toString().padStart(2, '0')}-${filtros.ano}.csv`;

        this.baixarArquivo(csv, nomeArquivo);

        debugLog(`[Export] ✅ Arquivo exportado: ${nomeArquivo}`);
    }

    /**
     * Exporta RDOs detalhados para CSV
     */
    static exportarRDOsCSV(rdos, mes, ano) {
        if (!rdos || rdos.length === 0) {
            mostrarToast('Nenhum RDO para exportar.', 'warning');
            return;
        }

        const colunas = [
            { campo: 'numeroRDO', label: 'Número RDO', formatter: (v, item) => FieldHelper.getRDONumeroRDO(item) },
            { campo: 'data', label: 'Data', formatter: (v, item) => FieldHelper.getRDOData(item) },
            { campo: 'codigoTurma', label: 'Código Turma', formatter: (v, item) => FieldHelper.getRDOCodigoTurma(item) },
            { campo: 'encarregado', label: 'Encarregado', formatter: (v, item) => FieldHelper.getRDOEncarregado(item) },
            { campo: 'numeroOS', label: 'Número OS', formatter: (v, item) => FieldHelper.getRDONumeroOS(item) },
            { campo: 'local', label: 'Local', formatter: (v, item) => FieldHelper.getRDOLocal(item) }
        ];

        const csv = this.paraCSV(rdos, colunas);

        const nomeArquivo = `rdos-${mes.toString().padStart(2, '0')}-${ano}.csv`;

        this.baixarArquivo(csv, nomeArquivo);

        debugLog(`[Export] ✅ Arquivo exportado: ${nomeArquivo} (${rdos.length} RDOs)`);
    }

    /**
     * Exporta para JSON (alternativa ao CSV)
     */
    static exportarJSON(dados, nomeArquivo) {
        const json = JSON.stringify(dados, null, 2);
        this.baixarArquivo(json, nomeArquivo, 'application/json');
        debugLog(`[Export] ✅ JSON exportado: ${nomeArquivo}`);
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.ExportHelper = ExportHelper;
}
