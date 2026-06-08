/**
 * ExecutiveSummary — Resumo Executivo Automático
 * Versão: 1.0.0
 *
 * Gera texto gerencial em português a partir dos dados do período.
 * Motor 100% determinístico via templates — sem IA generativa.
 *
 * Estrutura do resumo:
 *  1. Visão geral do período
 *  2. Destaques positivos
 *  3. Pontos de atenção
 *  4. Performance por turma (top e bottom)
 *  5. Qualidade dos dados
 *  6. Recomendações operacionais
 */
class ExecutiveSummary {
    constructor() {
        this._ultimo = null;
    }

    // ─── API pública ──────────────────────────────────────────────────────────

    /**
     * Gera o resumo e renderiza em containerId
     */
    renderizar(containerId, estatisticas, calculadora, filtros, dadosFiltrados) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const texto = this.gerar(estatisticas, calculadora, filtros, dadosFiltrados);
        this._ultimo = texto;

        el.innerHTML = this._htmlCard(texto, filtros);
    }

    /**
     * Gera o objeto de resumo com todas as seções
     */
    gerar(estatisticas, calculadora, filtros, dadosFiltrados) {
        const { mes, ano } = filtros;
        const tps  = estatisticas?.tps  || [];
        const tss  = estatisticas?.tss  || [];
        const rdos = dadosFiltrados?.rdos || [];

        const diasUteis = calculadora.getDiasUteis(mes, ano);

        const ctx = this._contexto(tps, tss, rdos, diasUteis, mes, ano, calculadora);

        return {
            visaoGeral:       this._secaoVisaoGeral(ctx),
            destaques:        this._secaoDestaques(ctx),
            atencao:          this._secaoAtencao(ctx),
            performanceTurma: this._secaoPerformance(ctx),
            recomendacoes:    this._secaoRecomendacoes(ctx),
            ctx,
        };
    }

    // ─── Contexto ─────────────────────────────────────────────────────────────

    _contexto(tps, tss, rdos, diasUteis, mes, ano, calculadora) {
        const nomeMes = ['janeiro','fevereiro','março','abril','maio','junho',
                         'julho','agosto','setembro','outubro','novembro','dezembro'][mes-1];

        const totalRDOs    = rdos.length;
        const hhTPTotal    = tps.reduce((s, t) => s + (t.hhProdutivas || t.hhTotal || 0), 0);
        const hhTSTotal    = tss.reduce((s, t) => s + (t.hhProdutivas || t.hhTotal || 0), 0);
        const fatTotal     = tps.reduce((s, t) => s + (t.engecom||0) + (t.encogel||0), 0)
                           + tss.reduce((s, t) => s + (t.engecom||0) + (t.encogel||0), 0);
        const fatEngecom   = tps.reduce((s, t) => s + (t.engecom||0), 0)
                           + tss.reduce((s, t) => s + (t.engecom||0), 0);
        const fatEncogel   = tps.reduce((s, t) => s + (t.encogel||0), 0)
                           + tss.reduce((s, t) => s + (t.encogel||0), 0);

        // Dias trabalhados médios
        const diasTP  = tps.length ? tps.reduce((s, t) => s + (t.diasTrabalhados||0), 0) / tps.length : 0;
        const diasTS  = tss.length ? tss.reduce((s, t) => s + (t.diasTrabalhados||0), 0) / tss.length : 0;

        // Meta do período
        const metaTP  = METAS.META_DIARIA_TP * diasUteis;
        const metaTS  = METAS.META_DIARIA_TS * diasUteis;

        // Assiduidade global
        const assidTP = diasUteis > 0 ? (diasTP / diasUteis * 100) : 0;

        // Produtividade média
        const prodTP  = tps.length > 0
            ? tps.reduce((s, t) => {
                  const meta = METAS.META_DIARIA_TP * (t.diasTrabalhados || 0);
                  return s + (meta > 0 ? ((t.hhProdutivas || t.hhTotal || 0) / meta) * 100 : 0);
              }, 0) / tps.length
            : 0;

        // HH improdutivas totais
        const hhImprodTP = tps.reduce((s, t) => s + (t.hhImprodutivas||0), 0);

        // Top e bottom TP por HH
        const tpsOrd = [...tps].sort((a, b) => (b.hhProdutivas||b.hhTotal||0) - (a.hhProdutivas||a.hhTotal||0));
        const topTP   = tpsOrd[0] || null;
        const bottomTP = tpsOrd[tpsOrd.length - 1] || null;

        // RDOs sem serviço
        const rdosSemServico = rdos.filter(r =>
            (r['Houve Serviço'] || r.houveServico || '').toLowerCase() !== 'sim'
        ).length;

        return {
            nomeMes, mes, ano, diasUteis,
            totalRDOs, tps, tss,
            hhTPTotal, hhTSTotal, fatTotal, fatEngecom, fatEncogel,
            diasTP, diasTS, assidTP,
            metaTP, metaTS, prodTP,
            hhImprodTP,
            topTP, bottomTP,
            rdosSemServico,
        };
    }

    // ─── Seções de texto ──────────────────────────────────────────────────────

    _secaoVisaoGeral(c) {
        const partes = [];

        if (!c.totalRDOs) {
            return `Não foram encontrados registros para ${c.nomeMes} de ${c.ano}.`;
        }

        partes.push(
            `Em ${c.nomeMes} de ${c.ano}, o consórcio registrou **${c.totalRDOs} RDO${c.totalRDOs > 1 ? 's'  : ''}** ` +
            `distribuídos em **${c.tps.length} turma${c.tps.length !== 1 ? 's' : ''} TP** ` +
            `e **${c.tss.length} turma${c.tss.length !== 1 ? 's' : ''} TS**.`
        );

        if (c.fatTotal > 0) {
            partes.push(
                `O faturamento total do período foi de **${this._fmtMoeda(c.fatTotal)}**, ` +
                `sendo ${this._fmtMoeda(c.fatEngecom)} pela Engecom e ${this._fmtMoeda(c.fatEncogel)} pela Encogel.`
            );
        }

        if (c.hhTPTotal > 0) {
            const pctMeta = c.metaTP > 0 ? (c.hhTPTotal / (c.metaTP * c.tps.length)) * 100 : 0;
            partes.push(
                `As turmas TP totalizaram **${this._fmt(c.hhTPTotal)} HH produtivas**, ` +
                `equivalente a ${this._fmt(pctMeta)}% da meta do período.`
            );
        }

        return partes.join(' ');
    }

    _secaoDestaques(c) {
        const destaques = [];

        // Boa assiduidade
        if (c.assidTP >= 80) {
            destaques.push(`✅ Assiduidade das TPs em **${this._fmt(c.assidTP)}%** — acima de 80%.`);
        }

        // Top turma TP
        if (c.topTP) {
            const hhTop = c.topTP.hhProdutivas || c.topTP.hhTotal || 0;
            destaques.push(
                `✅ Melhor turma TP do período: **${c.topTP.turma}** com ` +
                `${this._fmt(hhTop)} HH produtivas e ${c.topTP.diasTrabalhados || 0} dias trabalhados.`
            );
        }

        // Boa produtividade
        if (c.prodTP >= 90) {
            destaques.push(`✅ Produtividade média das TPs em **${this._fmt(c.prodTP)}%** — próxima da meta.`);
        }

        // HH TS
        if (c.hhTSTotal > 0) {
            destaques.push(`✅ Turmas TS geraram **${this._fmt(c.hhTSTotal)} HH** de soldagem no período.`);
        }

        if (!destaques.length) {
            destaques.push('ℹ️ Nenhum destaque positivo identificado no período.');
        }

        return destaques;
    }

    _secaoAtencao(c) {
        const alertas = [];

        // Baixa assiduidade
        if (c.assidTP > 0 && c.assidTP < 60) {
            alertas.push(
                `⚠️ Assiduidade das TPs em **${this._fmt(c.assidTP)}%** — abaixo de 60%. ` +
                `Verificar motivos de ausência.`
            );
        }

        // Baixa produtividade
        if (c.prodTP > 0 && c.prodTP < 70) {
            alertas.push(
                `⚠️ Produtividade média das TPs em **${this._fmt(c.prodTP)}%** — abaixo de 70% da meta.`
            );
        }

        // Alto índice de HH improdutivas
        const pctImprod = c.hhTPTotal + c.hhImprodTP > 0
            ? (c.hhImprodTP / (c.hhTPTotal + c.hhImprodTP)) * 100 : 0;
        if (pctImprod > 25) {
            alertas.push(
                `⚠️ Índice de HH improdutivas em **${this._fmt(pctImprod)}%** do total — acima de 25%. ` +
                `Analisar causas de perdas.`
            );
        }

        // Bottom turma distante do topo
        if (c.topTP && c.bottomTP && c.topTP.turma !== c.bottomTP.turma) {
            const hhTop    = c.topTP.hhProdutivas    || c.topTP.hhTotal    || 0;
            const hhBottom = c.bottomTP.hhProdutivas || c.bottomTP.hhTotal || 0;
            const diff     = hhTop > 0 ? ((hhTop - hhBottom) / hhTop) * 100 : 0;
            if (diff > 40) {
                alertas.push(
                    `⚠️ Turma **${c.bottomTP.turma}** ficou **${this._fmt(diff)}% abaixo** ` +
                    `de **${c.topTP.turma}** em HH produtivas.`
                );
            }
        }

        // RDOs sem serviço
        if (c.rdosSemServico > 0) {
            alertas.push(
                `⚠️ **${c.rdosSemServico} RDO${c.rdosSemServico > 1 ? 's' : ''}** registrado${c.rdosSemServico > 1 ? 's' : ''} ` +
                `sem serviço no período.`
            );
        }

        if (!alertas.length) {
            alertas.push('✅ Nenhum ponto crítico identificado no período.');
        }

        return alertas;
    }

    _secaoPerformance(c) {
        if (!c.tps.length && !c.tss.length) return null;

        const linhas = [];

        const tpsOrd = [...c.tps].sort((a, b) =>
            (b.hhProdutivas||b.hhTotal||0) - (a.hhProdutivas||a.hhTotal||0)
        );

        tpsOrd.forEach((t, i) => {
            const hh  = t.hhProdutivas || t.hhTotal || 0;
            const fat = (t.engecom || 0) + (t.encogel || 0);
            linhas.push({
                posicao: i + 1,
                turma:   t.turma,
                tipo:    'TP',
                hh,
                fat,
                dias:    t.diasTrabalhados || 0,
            });
        });

        c.tss.forEach((t, i) => {
            const hh  = t.hhProdutivas || t.hhTotal || 0;
            const fat = (t.engecom || 0) + (t.encogel || 0);
            linhas.push({
                posicao: i + 1,
                turma:   t.turma,
                tipo:    'TS',
                hh,
                fat,
                dias:    t.diasTrabalhados || 0,
            });
        });

        return linhas;
    }

    _secaoRecomendacoes(c) {
        const recs = [];

        const pctImprod = c.hhTPTotal + c.hhImprodTP > 0
            ? (c.hhImprodTP / (c.hhTPTotal + c.hhImprodTP)) * 100 : 0;

        if (c.assidTP < 70 && c.assidTP > 0) {
            recs.push('📌 Investigar causas de baixa assiduidade e revisar escala de equipes.');
        }

        if (pctImprod > 20) {
            recs.push('📌 Identificar e reclassificar HIs com tipo "Outros" para análise precisa de perdas.');
        }

        if (c.rdosSemServico > 0) {
            recs.push('📌 Revisar os RDOs sem serviço — verificar se houve justificativa de não produção.');
        }

        if (c.bottomTP && c.topTP && c.bottomTP.turma !== c.topTP.turma) {
            const hhB = c.bottomTP.hhProdutivas || c.bottomTP.hhTotal || 0;
            const hhT = c.topTP.hhProdutivas    || c.topTP.hhTotal    || 0;
            if (hhT > 0 && ((hhT - hhB) / hhT) > 0.35) {
                recs.push(`📌 Compartilhar práticas de **${c.topTP.turma}** com turmas de menor produtividade.`);
            }
        }

        if (c.tps.length > 0 && c.prodTP < 80) {
            recs.push('📌 Revisar planejamento de serviços para aumentar aproveitamento das HH disponíveis.');
        }

        if (!recs.length) {
            recs.push('📌 Manter o nível atual e monitorar a tendência no próximo período.');
        }

        return recs;
    }

    // ─── HTML ─────────────────────────────────────────────────────────────────

    _htmlCard(texto, filtros) {
        const { mes, ano } = filtros;
        const nomeMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                         'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes-1];

        const perfTabela = texto.performanceTurma;

        return `
<div class="card border-0 shadow-sm">
  <div class="card-header d-flex justify-content-between align-items-center">
    <h6 class="mb-0">
      <i class="fas fa-file-alt me-2 text-primary"></i>
      Resumo Executivo — ${nomeMes} / ${ano}
    </h6>
    <div class="d-flex gap-2">
      <button class="btn btn-outline-secondary btn-sm" onclick="executiveSummary._copiarTexto()" title="Copiar resumo">
        <i class="fas fa-copy me-1"></i>Copiar
      </button>
      <button class="btn btn-outline-primary btn-sm" onclick="executiveSummary._exportarTxt(${mes}, ${ano})" title="Baixar .txt">
        <i class="fas fa-download me-1"></i>.txt
      </button>
    </div>
  </div>
  <div class="card-body p-4">

    <!-- Visão Geral -->
    <div class="mb-4">
      <h6 class="fw-bold text-primary mb-2"><i class="fas fa-globe me-2"></i>Visão Geral</h6>
      <p class="mb-0" style="line-height:1.7">${this._md(texto.visaoGeral)}</p>
    </div>

    <!-- Destaques -->
    <div class="mb-4">
      <h6 class="fw-bold text-success mb-2"><i class="fas fa-star me-2"></i>Destaques Positivos</h6>
      <ul class="list-unstyled mb-0">
        ${texto.destaques.map(d => `<li style="line-height:1.7" class="mb-1">${this._md(d)}</li>`).join('')}
      </ul>
    </div>

    <!-- Pontos de Atenção -->
    <div class="mb-4">
      <h6 class="fw-bold text-warning mb-2"><i class="fas fa-exclamation-triangle me-2"></i>Pontos de Atenção</h6>
      <ul class="list-unstyled mb-0">
        ${texto.atencao.map(a => `<li style="line-height:1.7" class="mb-1">${this._md(a)}</li>`).join('')}
      </ul>
    </div>

    ${perfTabela && perfTabela.length ? `
    <!-- Performance por Turma -->
    <div class="mb-4">
      <h6 class="fw-bold text-secondary mb-2"><i class="fas fa-table me-2"></i>Performance por Turma</h6>
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0" style="font-size:.85rem">
          <thead class="table-light">
            <tr><th>#</th><th>Turma</th><th>Tipo</th><th class="text-end">HH Prod.</th><th class="text-end">Dias</th><th class="text-end">Faturamento</th></tr>
          </thead>
          <tbody>
            ${perfTabela.map(r => `<tr>
              <td>${r.posicao}</td>
              <td><strong>${_escHtml(r.turma)}</strong></td>
              <td><span class="badge bg-${r.tipo === 'TP' ? 'primary' : 'info'}">${r.tipo}</span></td>
              <td class="text-end">${this._fmt(r.hh)}</td>
              <td class="text-end">${r.dias}</td>
              <td class="text-end">${this._fmtMoeda(r.fat)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Recomendações -->
    <div>
      <h6 class="fw-bold text-info mb-2"><i class="fas fa-lightbulb me-2"></i>Recomendações Operacionais</h6>
      <ul class="list-unstyled mb-0">
        ${texto.recomendacoes.map(r => `<li style="line-height:1.7" class="mb-1">${this._md(r)}</li>`).join('')}
      </ul>
    </div>

  </div>
</div>`;
    }

    // ─── Ações de export/cópia ────────────────────────────────────────────────

    _copiarTexto() {
        if (!this._ultimo) return;
        const t = this._ultimo;
        const plain = [
            '== VISÃO GERAL ==',
            this._semMd(t.visaoGeral),
            '',
            '== DESTAQUES POSITIVOS ==',
            ...t.destaques.map(d => '• ' + this._semMd(d)),
            '',
            '== PONTOS DE ATENÇÃO ==',
            ...t.atencao.map(a => '• ' + this._semMd(a)),
            '',
            '== RECOMENDAÇÕES ==',
            ...t.recomendacoes.map(r => '• ' + this._semMd(r)),
        ].join('\n');

        navigator.clipboard.writeText(plain).then(() => {
            mostrarToast('Resumo copiado para a área de transferência!', 'success');
        }).catch(() => {
            mostrarToast('Não foi possível copiar. Use Ctrl+C manualmente.', 'warning');
        });
    }

    _exportarTxt(mes, ano) {
        if (!this._ultimo) return;
        const t = this._ultimo;
        const nomeMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                         'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes-1];

        const conteudo = [
            `RESUMO EXECUTIVO — ${nomeMes.toUpperCase()} / ${ano}`,
            `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
            `${'='.repeat(50)}`,
            '',
            'VISÃO GERAL',
            this._semMd(t.visaoGeral),
            '',
            'DESTAQUES POSITIVOS',
            ...t.destaques.map(d => '• ' + this._semMd(d)),
            '',
            'PONTOS DE ATENÇÃO',
            ...t.atencao.map(a => '• ' + this._semMd(a)),
            '',
            'RECOMENDAÇÕES OPERACIONAIS',
            ...t.recomendacoes.map(r => '• ' + this._semMd(r)),
            '',
            `${'='.repeat(50)}`,
            'Dashboard de Medição — Engecom / Encogel',
        ].join('\n');

        const bom  = '﻿';
        const blob = new Blob([bom + conteudo], { type: 'text/plain;charset=utf-8;' });
        const m    = String(mes).padStart(2, '0');
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `resumo_executivo_${ano}-${m}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** Converte **negrito** em <strong> */
    _md(txt) {
        return _escHtml(txt).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    /** Remove marcação markdown */
    _semMd(txt) {
        return String(txt || '').replace(/\*\*/g, '');
    }

    _fmt(n) {
        return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    _fmtMoeda(n) {
        return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
}

// Instância global
const executiveSummary = new ExecutiveSummary();
