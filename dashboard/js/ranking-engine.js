/**
 * RankingEngine — Ranking de Performance de Turmas
 * Versão: 1.0.0
 *
 * Score ponderado (0–100):
 *   40% — Produtividade  (HH produtivas / meta do período)
 *   30% — Assiduidade    (dias trabalhados / dias úteis)
 *   20% — Eficiência HI  (baixas perdas improdutivas)
 *   10% — Completude RDO (RDOs com houve_servico = Sim / total)
 *
 * Tipos tratados separadamente (TP e TS têm metas diferentes).
 * Score explicado por componente para transparência.
 */
class RankingEngine {
    constructor() {
        this._cache = null;
    }

    // ─── API pública ──────────────────────────────────────────────────────────

    /**
     * Calcula ranking para um tipo de turma
     * @param {string} tipo  'TP' | 'TS'
     * @param {object} estatisticas   dashboardMain.estatisticas
     * @param {object} calculadora    CalculadoraMedicao
     * @param {number} mes
     * @param {number} ano
     * @returns {Array} turmas ordenadas por score desc
     */
    calcular(tipo, estatisticas, calculadora, mes, ano) {
        const turmas = tipo === 'TP'
            ? (estatisticas.tps  || [])
            : (estatisticas.tss  || []);

        if (!turmas.length) return [];

        const diasUteis = calculadora.getDiasUteis(mes, ano);
        const metaDia   = tipo === 'TP' ? METAS.META_DIARIA_TP : METAS.META_DIARIA_TS;

        const resultado = turmas.map(t => this._pontuarTurma(t, tipo, diasUteis, metaDia, calculadora, mes, ano));

        // Ordenar por score desc, desempate por assiduidade
        resultado.sort((a, b) => b.score - a.score || b.componentes.assiduidade - a.componentes.assiduidade);

        // Adicionar posição e variação (variação = 0 por ora — exigiria histórico)
        resultado.forEach((r, i) => { r.posicao = i + 1; });

        return resultado;
    }

    /**
     * Renderiza o ranking em um elemento DOM
     */
    renderizar(containerId, tipo, estatisticas, calculadora, mes, ano) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const dados = this.calcular(tipo, estatisticas, calculadora, mes, ano);

        if (!dados.length) {
            el.innerHTML = '<p class="text-muted text-center py-3">Nenhuma turma no período.</p>';
            return;
        }

        el.innerHTML = this._htmlTabela(dados, tipo);
    }

    // ─── Cálculo de score ─────────────────────────────────────────────────────

    _pontuarTurma(turma, tipo, diasUteis, metaDia, calculadora, mes, ano) {
        const diasTrab  = turma.diasTrabalhados || 0;
        const hhTotal   = turma.hhProdutivas   || turma.hhTotal || 0;
        const hhImprod  = turma.hhImprodutivas || 0;

        // 1. Produtividade: HH prod. real vs meta do período
        const metaPeriodo     = metaDia * diasTrab;
        const scoreProd       = metaPeriodo > 0
            ? Math.min(100, (hhTotal / metaPeriodo) * 100)
            : 0;

        // 2. Assiduidade: dias trabalhados vs dias úteis
        const scoreAssid      = diasUteis > 0
            ? Math.min(100, (diasTrab / diasUteis) * 100)
            : 0;

        // 3. Eficiência HI: penalidade por HH improdutivas em relação ao total
        const hhTotalComHI    = hhTotal + hhImprod;
        const pctImprod       = hhTotalComHI > 0 ? (hhImprod / hhTotalComHI) : 0;
        const scoreEficiencia = Math.max(0, Math.min(100, (1 - pctImprod * 2) * 100));

        // 4. Completude RDO: RDOs com "Houve Serviço = Sim" / total
        const rdosTurma  = (turma.rdos || []);
        const totalRDOs  = rdosTurma.length;
        const comServico = rdosTurma.filter(r =>
            (r['Houve Serviço'] || r.houveServico || '').toLowerCase() === 'sim'
        ).length;
        const scoreCompl = totalRDOs > 0 ? (comServico / totalRDOs) * 100 : 100;

        // Score final ponderado
        const score = Math.round(
            scoreProd       * 0.40 +
            scoreAssid      * 0.30 +
            scoreEficiencia * 0.20 +
            scoreCompl      * 0.10
        );

        return {
            turma:       turma.turma,
            score,
            nivel:       this._nivel(score),
            diasTrab,
            diasUteis,
            hhTotal,
            hhImprod,
            engecom:     turma.engecom  || 0,
            encogel:     turma.encogel  || 0,
            totalFat:    (turma.engecom || 0) + (turma.encogel || 0),
            componentes: {
                produtividade:  Math.round(scoreProd),
                assiduidade:    Math.round(scoreAssid),
                eficienciaHI:   Math.round(scoreEficiencia),
                completudeRDO:  Math.round(scoreCompl),
            },
        };
    }

    _nivel(score) {
        if (score >= 85) return { label: 'Excelente', cor: 'success',  icone: '🏆' };
        if (score >= 70) return { label: 'Bom',        cor: 'primary',  icone: '👍' };
        if (score >= 55) return { label: 'Regular',    cor: 'warning',  icone: '⚠️' };
        return               { label: 'Crítico',    cor: 'danger',   icone: '🔴' };
    }

    // ─── HTML ─────────────────────────────────────────────────────────────────

    _htmlTabela(dados, tipo) {
        const medal = ['🥇', '🥈', '🥉'];

        const linhas = dados.map(d => {
            const barra = this._htmlBarra(d.score);
            const comp  = d.componentes;
            const detalheId = `rank-detalhe-${tipo}-${d.turma.replace(/\W/g, '_')}`;

            return `
<tr>
  <td class="text-center fw-bold" style="width:44px;font-size:1.1rem">
    ${medal[d.posicao - 1] || d.posicao}
  </td>
  <td>
    <div class="fw-semibold">${_escHtml(d.turma)}</div>
    <div class="small text-muted">${d.diasTrab} dias trab. / ${d.diasUteis} úteis</div>
  </td>
  <td style="width:180px">
    <div class="d-flex align-items-center gap-2">
      ${barra}
      <span class="fw-bold" style="min-width:34px">${d.score}</span>
    </div>
    <span class="badge bg-${d.nivel.cor} mt-1" style="font-size:.68rem">${d.nivel.icone} ${d.nivel.label}</span>
  </td>
  <td class="text-end small">${this._fmt(d.hhTotal)} HH</td>
  <td class="text-end small">${this._fmt(d.hhImprod)} HH</td>
  <td class="text-end small">${this._fmtMoeda(d.totalFat)}</td>
  <td class="text-center">
    <button class="btn btn-outline-secondary btn-sm py-0 px-2"
            style="font-size:.72rem"
            onclick="document.getElementById('${detalheId}').classList.toggle('d-none')">
      Detalhe
    </button>
  </td>
</tr>
<tr id="${detalheId}" class="d-none bg-light">
  <td colspan="7" class="px-4 py-3">
    <div class="row g-3">
      ${this._htmlComponente('Produtividade', comp.produtividade, 'fa-tachometer-alt', 'success',
          `HH produtivas vs meta do período (peso 40%)`)}
      ${this._htmlComponente('Assiduidade', comp.assiduidade, 'fa-calendar-check', 'primary',
          `Dias trabalhados / dias úteis (peso 30%)`)}
      ${this._htmlComponente('Eficiência HI', comp.eficienciaHI, 'fa-pause-circle', 'warning',
          `Penalidade por proporção de HH improdutivas (peso 20%)`)}
      ${this._htmlComponente('Completude RDO', comp.completudeRDO, 'fa-file-check', 'info',
          `RDOs com houve_serviço = Sim / total (peso 10%)`)}
    </div>
  </td>
</tr>`;
        }).join('');

        return `
<div class="table-responsive">
  <table class="table table-sm align-middle mb-0">
    <thead class="table-light">
      <tr>
        <th class="text-center">#</th>
        <th>Turma</th>
        <th>Score</th>
        <th class="text-end">HH Prod.</th>
        <th class="text-end">HH Improd.</th>
        <th class="text-end">Faturamento</th>
        <th></th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>
</div>
<p class="text-muted mt-2 mb-0" style="font-size:.72rem">
  <i class="fas fa-info-circle me-1"></i>
  Score 0–100 · Componentes: Produtividade (40%) + Assiduidade (30%) + Eficiência HI (20%) + Completude RDO (10%)
</p>`;
    }

    _htmlComponente(label, valor, icone, cor, descricao) {
        return `
<div class="col-md-3">
  <div class="card border-0 shadow-sm h-100">
    <div class="card-body py-2 px-3">
      <div class="d-flex align-items-center mb-1">
        <i class="fas ${icone} text-${cor} me-2" style="font-size:.85rem"></i>
        <span class="small fw-semibold">${label}</span>
        <span class="ms-auto fw-bold text-${cor}">${valor}</span>
      </div>
      <div class="progress" style="height:6px">
        <div class="progress-bar bg-${cor}" style="width:${valor}%"></div>
      </div>
      <div class="text-muted mt-1" style="font-size:.68rem">${descricao}</div>
    </div>
  </div>
</div>`;
    }

    _htmlBarra(score) {
        const cor = score >= 85 ? 'success' : score >= 70 ? 'primary' : score >= 55 ? 'warning' : 'danger';
        return `<div class="progress flex-grow-1" style="height:10px">
  <div class="progress-bar bg-${cor}" style="width:${score}%;transition:width .4s ease"></div>
</div>`;
    }

    // ─── Helpers de formatação ────────────────────────────────────────────────

    _fmt(n) {
        return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    _fmtMoeda(n) {
        return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
}

// Instância global
const rankingEngine = new RankingEngine();
