/**
 * ExportEngine — Motor de Exportação Avançada
 * Versão: 1.0.0
 *
 * Suporta:
 *  - CSV  com BOM (semicolon, compatível com Excel BR)
 *  - XLSX multi-abas via SheetJS
 *  - JSON estruturado
 *  - PDF via impressão HTML formatada
 *
 * Perfis disponíveis:
 *  - resumo      — KPIs e tabela de turmas
 *  - operacional — RDOs + Serviços + HI + Turmas
 *  - brutos      — dump completo dos dados filtrados
 */
class ExportEngine {
    constructor() {
        this._pronto = false;
    }

    /**
     * Chamado pelo main.js após carregarDados()
     */
    configurar() {
        this._pronto = true;
    }

    // ─── Modal ───────────────────────────────────────────────────────────────

    abrirModal() {
        if (!this._pronto || typeof dashboardMain === 'undefined' || !dashboardMain.dados) {
            mostrarToast('Carregue os dados antes de exportar.', 'warning');
            return;
        }
        const el = document.getElementById('modalExportar');
        if (el) new bootstrap.Modal(el).show();
    }

    async executar() {
        const formato = document.getElementById('exportFormato').value;
        const perfil  = document.getElementById('exportPerfil').value;
        const btn     = document.getElementById('btnConfirmarExportar');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Exportando…';

        try {
            switch (formato) {
                case 'csv':  await this._exportarCSV(perfil);  break;
                case 'xlsx': await this._exportarXLSX(perfil); break;
                case 'json': await this._exportarJSON();        break;
                case 'pdf':  this._exportarPDF();               break;
            }
            mostrarToast('Exportação concluída com sucesso!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalExportar'))?.hide();
        } catch (err) {
            console.error('[ExportEngine]', err);
            mostrarToast('Erro na exportação: ' + err.message, 'danger');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download me-1"></i>Exportar';
        }
    }

    // ─── CSV ─────────────────────────────────────────────────────────────────

    async _exportarCSV(perfil) {
        const { rdos, servicos, hi } = this._dadosFiltrados();
        let partes = [];

        if (perfil === 'resumo') {
            partes.push(this._csvResumo(rdos));
        } else if (perfil === 'operacional') {
            partes.push('=== RDOs ===');
            partes.push(this._csvRDOs(rdos));
            partes.push('');
            partes.push('=== Serviços ===');
            partes.push(this._csvServicos(servicos));
            partes.push('');
            partes.push('=== Horas Improdutivas ===');
            partes.push(this._csvHI(hi));
        } else {
            // brutos
            partes.push(this._csvRDOs(rdos));
        }

        const bom  = '﻿';
        const blob = new Blob([bom + partes.join('\n')], { type: 'text/csv;charset=utf-8;' });
        this._download(blob, this._nome('csv', perfil));
    }

    _csvResumo(rdos) {
        const f = this._filtros();
        const est = dashboardMain.estatisticas || {};
        const tps = est.tps || [];
        const tss = est.tss || [];
        const nomeMes = this._nomeMes(f.mes);
        const linhas = [
            ['Campo', 'Valor'],
            ['Período', `${nomeMes}/${f.ano}`],
            ['Total RDOs', rdos.length],
            ['Total TPs', tps.length],
            ['Total TSs', tss.length],
            ['HH Produtivas (TPs)', this._fmt(tps.reduce((s, t) => s + (t.hhProdutivas || t.hhTotal || 0), 0))],
            ['Faturamento Engecom', this._fmtMoeda(est.totalEngecom || 0)],
            ['Faturamento Encogel', this._fmtMoeda(est.totalEncogel || 0)],
            ['Faturamento Total', this._fmtMoeda(est.totalGeral || 0)],
            [],
            ['=== TURMAS TP ==='],
            ['Turma', 'Dias Trab.', 'HH Prod.', 'Engecom (R$)', 'Encogel (R$)', 'Total (R$)'],
            ...tps.map(t => [
                t.turma, t.diasTrabalhados || 0,
                this._fmt(t.hhProdutivas || t.hhTotal || 0),
                this._fmtMoeda(t.engecom || 0),
                this._fmtMoeda(t.encogel || 0),
                this._fmtMoeda((t.engecom || 0) + (t.encogel || 0)),
            ]),
            [],
            ['=== TURMAS TS ==='],
            ['Turma', 'Dias Trab.', 'HH Prod.', 'Engecom (R$)', 'Encogel (R$)', 'Total (R$)'],
            ...tss.map(t => [
                t.turma, t.diasTrabalhados || 0,
                this._fmt(t.hhProdutivas || t.hhTotal || 0),
                this._fmtMoeda(t.engecom || 0),
                this._fmtMoeda(t.encogel || 0),
                this._fmtMoeda((t.engecom || 0) + (t.encogel || 0)),
            ]),
        ];
        return linhas.map(l => (l || []).map(v => this._celCSV(String(v ?? ''))).join(';')).join('\n');
    }

    _csvRDOs(rdos) {
        const headers = [
            'Número RDO', 'Data', 'Código Turma', 'Encarregado', 'Local',
            'Número OS', 'Status OS', 'KM Início', 'KM Fim',
            'Horário Início', 'Horário Fim', 'Clima', 'Tema DDS',
            'Houve Serviço', 'Houve Transporte', 'Nome Colaboradores', 'Observações',
        ];
        const rows = rdos.map(r =>
            headers.map(h => this._celCSV(String(r[h] ?? r[FieldHelper.normalizarNomeCampo(h)] ?? '')))
        );
        return [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    }

    _csvServicos(servicos) {
        const headers = ['Número RDO', 'Descrição', 'Quantidade', 'Coeficiente', 'HH', 'HH Manual', 'É Customizado?'];
        const rows = servicos.map(s =>
            headers.map(h => this._celCSV(String(s[h] ?? s[FieldHelper.normalizarNomeCampo(h)] ?? '')))
        );
        return [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    }

    _csvHI(hi) {
        const headers = ['Número RDO', 'Tipo', 'Hora Início', 'Hora Fim', 'Operadores', 'Descrição'];
        const rows = hi.map(h =>
            headers.map(f => this._celCSV(String(h[f] ?? h[FieldHelper.normalizarNomeCampo(f)] ?? '')))
        );
        return [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    }

    _celCSV(v) {
        if (v.includes(';') || v.includes('"') || v.includes('\n')) {
            return '"' + v.replace(/"/g, '""') + '"';
        }
        return v;
    }

    // ─── XLSX ────────────────────────────────────────────────────────────────

    async _exportarXLSX(perfil) {
        if (typeof XLSX === 'undefined') {
            throw new Error('Biblioteca XLSX não carregada. Verifique a conexão e recarregue a página.');
        }

        const wb = XLSX.utils.book_new();
        const { rdos, servicos, hi } = this._dadosFiltrados();

        // Aba Resumo — sempre presente
        this._xlsxAbaResumo(wb, rdos);

        if (perfil !== 'resumo') {
            // Aba RDOs
            this._xlsxAba(wb, 'RDOs',
                ['Número RDO', 'Data', 'Código Turma', 'Encarregado', 'Local', 'Número OS',
                 'Status OS', 'KM Início', 'KM Fim', 'Horário Início', 'Horário Fim',
                 'Clima', 'Tema DDS', 'Houve Serviço', 'Houve Transporte',
                 'Nome Colaboradores', 'Observações'],
                rdos
            );
            // Aba Serviços
            this._xlsxAba(wb, 'Serviços',
                ['Número RDO', 'Descrição', 'Quantidade', 'Coeficiente', 'HH', 'HH Manual', 'É Customizado?'],
                servicos
            );
            // Aba HI
            this._xlsxAba(wb, 'HI',
                ['Número RDO', 'Tipo', 'Hora Início', 'Hora Fim', 'Operadores', 'Descrição'],
                hi
            );
        }

        if (perfil === 'operacional' || perfil === 'brutos') {
            this._xlsxAbaTurmas(wb);
        }

        XLSX.writeFile(wb, this._nome('xlsx', perfil));
    }

    _xlsxAbaResumo(wb, rdos) {
        const f   = this._filtros();
        const est = dashboardMain.estatisticas || {};
        const tps = est.tps || [];
        const tss = est.tss || [];

        const rows = [
            ['RESUMO EXECUTIVO — Dashboard de Medição'],
            [],
            ['Período',             `${this._nomeMes(f.mes)} / ${f.ano}`],
            ['Gerado em',           new Date().toLocaleString('pt-BR')],
            [],
            ['VISÃO GERAL'],
            ['Total de RDOs',       rdos.length],
            ['Total de TPs',        tps.length],
            ['Total de TSs',        tss.length],
            [],
            ['FATURAMENTO'],
            ['Engecom (R$)',         est.totalEngecom   || 0],
            ['Encogel (R$)',         est.totalEncogel   || 0],
            ['Total Geral (R$)',     est.totalGeral     || 0],
            [],
            ['HH'],
            ['HH Produtivas (TPs)', tps.reduce((s, t) => s + (t.hhProdutivas || t.hhTotal || 0), 0)],
            [],
        ];

        if (tps.length) {
            rows.push(['TURMAS TP']);
            rows.push(['Turma', 'Dias Trab.', 'HH Produtivas', 'Engecom (R$)', 'Encogel (R$)', 'Total (R$)']);
            tps.forEach(t => rows.push([
                t.turma,
                t.diasTrabalhados || 0,
                t.hhProdutivas || t.hhTotal || 0,
                t.engecom || 0,
                t.encogel || 0,
                (t.engecom || 0) + (t.encogel || 0),
            ]));
            rows.push([]);
        }

        if (tss.length) {
            rows.push(['TURMAS TS']);
            rows.push(['Turma', 'Dias Trab.', 'HH Produtivas', 'Engecom (R$)', 'Encogel (R$)', 'Total (R$)']);
            tss.forEach(t => rows.push([
                t.turma,
                t.diasTrabalhados || 0,
                t.hhProdutivas || t.hhTotal || 0,
                t.engecom || 0,
                t.encogel || 0,
                (t.engecom || 0) + (t.encogel || 0),
            ]));
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
    }

    _xlsxAba(wb, nome, headers, dados) {
        const rows = [headers, ...dados.map(d =>
            headers.map(h => d[h] ?? d[FieldHelper.normalizarNomeCampo(h)] ?? '')
        )];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = headers.map(() => ({ wch: 20 }));
        XLSX.utils.book_append_sheet(wb, ws, nome);
    }

    _xlsxAbaTurmas(wb) {
        const est = dashboardMain.estatisticas || {};
        const tps = est.tps || [];
        const tss = est.tss || [];
        const headers = ['Turma', 'Tipo', 'Dias Trab.', 'HH Produtivas', 'Engecom (R$)', 'Encogel (R$)', 'Total (R$)'];
        const rows = [headers, ...[...tps, ...tss].map(t => [
            t.turma,
            tps.includes(t) ? 'TP' : 'TS',
            t.diasTrabalhados || 0,
            t.hhProdutivas || t.hhTotal || 0,
            t.engecom || 0,
            t.encogel || 0,
            (t.engecom || 0) + (t.encogel || 0),
        ])];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = headers.map(() => ({ wch: 18 }));
        XLSX.utils.book_append_sheet(wb, ws, 'Turmas');
    }

    // ─── JSON ────────────────────────────────────────────────────────────────

    async _exportarJSON() {
        const { rdos, servicos, hi } = this._dadosFiltrados();
        const f   = this._filtros();
        const est = dashboardMain.estatisticas || {};

        const payload = {
            exportado_em: new Date().toISOString(),
            periodo: { mes: f.mes, ano: f.ano },
            resumo: {
                totalRDOs:     rdos.length,
                totalTPs:      (est.tps  || []).length,
                totalTSs:      (est.tss  || []).length,
                totalEngecom:  est.totalEngecom  || 0,
                totalEncogel:  est.totalEncogel  || 0,
                totalGeral:    est.totalGeral    || 0,
            },
            rdos,
            servicos,
            horasImprodutivas: hi,
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        this._download(blob, this._nome('json', 'completo'));
    }

    // ─── PDF (janela HTML + print) ───────────────────────────────────────────

    _exportarPDF() {
        const { rdos, servicos, hi } = this._dadosFiltrados();
        const f   = this._filtros();
        const est = dashboardMain.estatisticas || {};
        const tps = est.tps || [];
        const tss = est.tss || [];
        const nomeMes = this._nomeMes(f.mes);

        const htmlTurmas = (turmas, tipo) => {
            if (!turmas.length) return '<p style="color:#999">Nenhuma turma no período.</p>';
            return `<table>
  <thead><tr><th>Turma</th><th>Dias Trab.</th><th>HH Produtivas</th>
  <th>Engecom</th><th>Encogel</th><th>Total</th></tr></thead>
  <tbody>
  ${turmas.map(t => `<tr>
    <td><strong>${t.turma}</strong></td>
    <td style="text-align:center">${t.diasTrabalhados || 0}</td>
    <td style="text-align:right">${this._fmt(t.hhProdutivas || t.hhTotal || 0)} HH</td>
    <td style="text-align:right">${this._fmtMoeda(t.engecom || 0)}</td>
    <td style="text-align:right">${this._fmtMoeda(t.encogel || 0)}</td>
    <td style="text-align:right"><strong>${this._fmtMoeda((t.engecom||0)+(t.encogel||0))}</strong></td>
  </tr>`).join('')}
  </tbody>
</table>`;
        };

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório — ${nomeMes}/${f.ano}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #222; }
  h1 { font-size: 20px; color: #1a56a0; border-bottom: 3px solid #1a56a0; padding-bottom: 6px; margin-bottom: 4px; }
  h2 { font-size: 14px; color: #1a56a0; margin-top: 24px; margin-bottom: 6px; border-left: 4px solid #1a56a0; padding-left: 8px; }
  p.sub { color:#666; font-size:11px; margin:0 0 16px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; }
  .kpi { background:#f0f4fa; border-radius:8px; padding:12px; border-left:4px solid #1a56a0; }
  .kpi-label { font-size:10px; color:#555; margin-bottom:4px; }
  .kpi-value { font-size:20px; font-weight:bold; color:#1a56a0; }
  table { width:100%; border-collapse:collapse; margin-top:6px; font-size:11px; }
  th { background:#1a56a0; color:#fff; padding:6px 8px; text-align:left; }
  td { padding:5px 8px; border-bottom:1px solid #e5e7eb; }
  tr:nth-child(even) td { background:#f7f9fc; }
  .footer { margin-top:32px; font-size:10px; color:#aaa; text-align:center; border-top:1px solid #ddd; padding-top:8px; }
  @media print { @page { margin: 15mm; } body { margin:0; } }
</style>
</head>
<body>
  <h1>📊 Relatório de Medição — ${nomeMes} / ${f.ano}</h1>
  <p class="sub">Engecom Engenharia &nbsp;·&nbsp; Gerado em ${new Date().toLocaleString('pt-BR')}</p>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Total RDOs</div><div class="kpi-value">${rdos.length}</div></div>
    <div class="kpi"><div class="kpi-label">TPs ativas</div><div class="kpi-value">${tps.length}</div></div>
    <div class="kpi"><div class="kpi-label">TSs ativas</div><div class="kpi-value">${tss.length}</div></div>
    <div class="kpi"><div class="kpi-label">Faturamento Total</div><div class="kpi-value" style="font-size:14px">${this._fmtMoeda(est.totalGeral||0)}</div></div>
  </div>

  <h2>Turmas TP</h2>
  ${htmlTurmas(tps, 'TP')}

  <h2>Turmas TS</h2>
  ${htmlTurmas(tss, 'TS')}

  <h2>RDOs do Período (${rdos.length})</h2>
  <table>
    <thead>
      <tr><th>Número RDO</th><th>Data</th><th>Turma</th><th>Local</th><th>O.S</th><th>Houve Serviço</th></tr>
    </thead>
    <tbody>
      ${rdos.slice(0, 300).map(r => `<tr>
        <td>${r['Número RDO'] || r.numeroRDO || ''}</td>
        <td>${r.Data || r.data || ''}</td>
        <td>${r['Código Turma'] || r.codigoTurma || ''}</td>
        <td>${r.Local || r.local || ''}</td>
        <td>${r['Número OS'] || r.numeroOS || ''}</td>
        <td>${r['Houve Serviço'] || r.houveServico || ''}</td>
      </tr>`).join('')}
      ${rdos.length > 300 ? `<tr><td colspan="6" style="text-align:center;color:#999;font-style:italic">… mais ${rdos.length - 300} registros (use XLSX ou JSON para exportar todos)</td></tr>` : ''}
    </tbody>
  </table>

  <div class="footer">Dashboard de Medição · Engecom / Encogel · ${new Date().toLocaleDateString('pt-BR')}</div>

  <script>window.onload = () => setTimeout(() => window.print(), 400);<\/script>
</body>
</html>`;

        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) {
            mostrarToast('Popup bloqueado. Permita pop-ups para este site e tente novamente.', 'warning');
            return;
        }
        w.document.write(html);
        w.document.close();
    }

    // ─── Utilidades ──────────────────────────────────────────────────────────

    _dadosFiltrados() {
        const d = dashboardMain.filtrarDadosPorPeriodo();
        return {
            rdos:     d.rdos               || [],
            servicos: d.servicos           || [],
            hi:       d.horasImprodutivas  || [],
        };
    }

    _filtros() {
        return dashboardMain.filtros || { mes: 1, ano: new Date().getFullYear() };
    }

    _nomeMes(m) {
        return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][(m||1)-1] || '';
    }

    _nome(ext, perfil) {
        const { mes, ano } = this._filtros();
        const m  = String(mes).padStart(2, '0');
        const ts = new Date().toISOString().slice(0, 10);
        return `medicao_${ano}-${m}_${perfil}_${ts}.${ext}`;
    }

    _download(blob, nome) {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 8000);
    }

    _fmt(n) {
        return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    _fmtMoeda(n) {
        return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
}

// Instância global
const exportEngine = new ExportEngine();
