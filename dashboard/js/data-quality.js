/**
 * Motor de Qualidade de Dados — data-quality.js
 *
 * Analisa a base completa (todos os períodos) e produz:
 *   - Score 0-100
 *   - Lista estruturada de inconsistências por severidade e categoria
 *   - UI com cards de categoria, filtros e tabela navegável
 *
 * Regras implementadas:
 *   RULE_001  RDO sem Número RDO              (critical, completude)
 *   RULE_002  Número RDO fora do padrão       (high,     validade)
 *   RULE_003  RDO sem Data                    (critical, completude)
 *   RULE_004  Data inválida                   (high,     validade)
 *   RULE_005  RDO sem Código Turma            (high,     completude)
 *   RULE_006  Número OS fora do padrão        (high,     validade)
 *   RULE_007  RDO sem efetivo registrado      (medium,   completude)
 *   RULE_008  Número RDO duplicado            (critical, duplicidade)
 *   RULE_009  Serviço órfão (RDO inexistente) (high,     consistencia)
 *   RULE_010  HI órfã (RDO inexistente)       (high,     consistencia)
 *   RULE_011  Serviço sem coeficiente         (medium,   completude)
 *   RULE_012  HI com horário incompleto       (high,     completude)
 *   RULE_013  Efetivo órfão (RDO inexistente) (high,     consistencia)
 */

class DataQualityEngine {
    constructor() {
        this._issues       = [];
        this._score        = 100;
        this._analisado    = false;
        // Estado dos filtros da UI — resetado a cada renderizar()
        this._filtroSev      = 'all';
        this._filtroCat      = null;
        this._filtroTurmaVal = '';
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Executa todas as regras de validação sobre os dados brutos.
     * Deve ser chamado após carregarDados() em main.js.
     * @param {Array} rdos
     * @param {Array} servicos
     * @param {Array} hisRaw
     * @param {Array} efetivos
     * @returns {DataQualityEngine} this (encadeável)
     */
    analisar(rdos, servicos, hisRaw, efetivos) {
        this._issues = [];

        // Conjunto completo (incluindo deletados) para cheques de consistência.
        // Isso evita falsos positivos quando um filho aponta para um RDO deletado
        // que ainda existe na planilha com Deletado = "Sim".
        const rdoSetCompleto = new Set(
            rdos.map(r => r['Número RDO'] || r.numeroRDO || '').filter(Boolean)
        );

        // Apenas ativos para cheques de completude e validade
        const rdosAtivos = rdos.filter(r =>
            (r['Deletado'] || r.deletado || '').toLowerCase() !== 'sim'
        );

        // Conjunto de Números RDO que possuem ao menos uma linha de efetivo
        const efSet = new Set(
            efetivos.map(e => e['Número RDO'] || e.numeroRDO || '').filter(Boolean)
        );

        this._verificarRDOs(rdosAtivos, efSet);
        this._verificarDuplicidades(rdosAtivos);
        this._verificarServicos(servicos, rdoSetCompleto);
        this._verificarHIs(hisRaw, rdoSetCompleto);
        this._verificarEfetivos(efetivos, rdoSetCompleto);
        this._calcularScore();

        this._analisado = true;
        return this;
    }

    get score()     { return this._score; }
    get issues()    { return this._issues; }
    get analisado() { return this._analisado; }

    // ── Regras de validação ──────────────────────────────────────────────────

    _add(issue) { this._issues.push(issue); }

    _verificarRDOs(rdosAtivos, efSet) {
        rdosAtivos.forEach(rdo => {
            const numRDO = rdo['Número RDO'] || rdo.numeroRDO || '';
            const data   = FieldHelper.normalizarData(rdo['Data'] || rdo.data || '');
            const turma  = rdo['Código Turma'] || rdo.codigoTurma || '';
            const os     = rdo['Número OS']    || rdo.numeroOS    || '';
            const ctx    = { numeroRDO: numRDO || '—', numeroOS: os, codigoTurma: turma, data: data || '—' };

            // RULE_001 — Número RDO ausente
            if (!numRDO) {
                this._add({ id: 'RULE_001', severity: 'critical', category: 'completude',
                    entityType: 'rdo', sheetName: 'RDO', field: 'Número RDO',
                    message:    'RDO sem Número RDO identificador',
                    suggestion: 'Verifique o registro no app e re-sincronize', ...ctx });
                return; // sem ID não dá para continuar
            }

            // RULE_002 — Formato do Número RDO
            if (!/^\d{6,7}-\d{2}\.\d{2}\.\d{2}-\d{3}$/.test(numRDO)) {
                this._add({ id: 'RULE_002', severity: 'high', category: 'validade',
                    entityType: 'rdo', sheetName: 'RDO', field: 'Número RDO',
                    message:    `Número RDO fora do padrão: "${numRDO}"`,
                    suggestion: 'Formato esperado: NNNNNN-DD.MM.AA-NNN (ex: 998070-13.11.24-001)', ...ctx });
            }

            // RULE_003 — Data ausente
            if (!data) {
                this._add({ id: 'RULE_003', severity: 'critical', category: 'completude',
                    entityType: 'rdo', sheetName: 'RDO', field: 'Data',
                    message:    'RDO sem Data',
                    suggestion: 'Verifique o registro no app', ...ctx });
            } else {
                // RULE_004 — Data inválida
                const p = FieldHelper.parseData(data);
                if (!p || p.dia < 1 || p.dia > 31 || p.mes < 1 || p.mes > 12) {
                    this._add({ id: 'RULE_004', severity: 'high', category: 'validade',
                        entityType: 'rdo', sheetName: 'RDO', field: 'Data',
                        message:    `Data inválida: "${data}"`,
                        suggestion: 'Formato esperado: DD/MM/YYYY', ...ctx });
                }
            }

            // RULE_005 — Código Turma ausente
            if (!turma || !turma.trim()) {
                this._add({ id: 'RULE_005', severity: 'high', category: 'completude',
                    entityType: 'rdo', sheetName: 'RDO', field: 'Código Turma',
                    message:    'RDO sem Código de Turma',
                    suggestion: 'Selecione a turma no app ao criar o RDO', ...ctx });
            }

            // RULE_006 — Número OS fora do padrão (ignora placeholders conhecidos)
            if (os && os.trim()) {
                const n = os.trim().toLowerCase();
                const isPlaceholder = n === 'sem o.s' || n === 'sem os' || n === 'n/a' || n === '-';
                if (!isPlaceholder && !validarNumeroOS(os)) {
                    this._add({ id: 'RULE_006', severity: 'high', category: 'validade',
                        entityType: 'rdo', sheetName: 'RDO', field: 'Número OS',
                        message:    `Número OS fora do padrão: "${os}"`,
                        suggestion: 'Aceito: 6 dígitos (98/99xxxx), 7 dígitos (1xxxxxx) ou múltiplos separados por "/"', ...ctx });
                }
            }

            // RULE_007 — RDO sem efetivo registrado
            if (!efSet.has(numRDO)) {
                this._add({ id: 'RULE_007', severity: 'medium', category: 'completude',
                    entityType: 'rdo', sheetName: 'RDO', field: 'Efetivo',
                    message:    'RDO sem efetivo registrado',
                    suggestion: 'Preencha o efetivo no app antes de sincronizar', ...ctx });
            }
        });
    }

    _verificarDuplicidades(rdosAtivos) {
        const contagem = {};
        rdosAtivos.forEach(r => {
            const n = r['Número RDO'] || r.numeroRDO || '';
            if (n) contagem[n] = (contagem[n] || 0) + 1;
        });
        Object.entries(contagem)
            .filter(([, c]) => c > 1)
            .forEach(([numRDO, count]) => {
                const rdo   = rdosAtivos.find(r => (r['Número RDO'] || r.numeroRDO) === numRDO);
                const turma = rdo ? (rdo['Código Turma'] || rdo.codigoTurma || '') : '';
                const data  = rdo ? FieldHelper.normalizarData(rdo['Data'] || rdo.data || '') : '';
                const os    = rdo ? (rdo['Número OS']    || rdo.numeroOS    || '') : '';
                this._add({ id: 'RULE_008', severity: 'critical', category: 'duplicidade',
                    entityType: 'rdo', sheetName: 'RDO', field: 'Número RDO',
                    message:    `Número RDO duplicado (${count}×): "${numRDO}"`,
                    suggestion: 'Remova os registros duplicados manualmente na planilha RDO',
                    numeroRDO: numRDO, numeroOS: os, codigoTurma: turma, data: data || '—' });
            });
    }

    _verificarServicos(servicos, rdoSetCompleto) {
        servicos.forEach(s => {
            const numRDO = s['Número RDO']   || s.numeroRDO  || '';
            const desc   = s['Descrição']    || s.descricao  || '(sem descrição)';
            const turma  = s['Código Turma'] || s.codigoTurma || '';
            const data   = FieldHelper.normalizarData(s['Data RDO'] || s.dataRDO || '');
            const custom = (s['É Customizado?'] || s.eCustomizado || '').toUpperCase();
            const coef   = parseFloat(s.coeficiente || s.Coeficiente || 0) || 0;
            const ctx    = { numeroRDO: numRDO || '—', numeroOS: '', codigoTurma: turma, data: data || '—' };

            // RULE_009 — Serviço órfão
            if (numRDO && !rdoSetCompleto.has(numRDO)) {
                this._add({ id: 'RULE_009', severity: 'high', category: 'consistencia',
                    entityType: 'servico', sheetName: 'Servicos', field: 'Número RDO',
                    message:    `Serviço "${desc}" aponta para RDO inexistente`,
                    suggestion: 'Verifique se o RDO pai foi deletado ou houve erro de sincronização', ...ctx });
            }

            // RULE_011 — Coeficiente zero em serviço não customizado
            if (coef === 0 && custom !== 'SIM') {
                this._add({ id: 'RULE_011', severity: 'medium', category: 'completude',
                    entityType: 'servico', sheetName: 'Servicos', field: 'Coeficiente',
                    message:    `Serviço sem coeficiente: "${desc}"`,
                    suggestion: 'Verifique se o serviço existe em servicos.json e force nova sincronização', ...ctx });
            }
        });
    }

    _verificarHIs(hisRaw, rdoSetCompleto) {
        hisRaw.forEach(hi => {
            const numRDO = hi['Número RDO']   || hi.numeroRDO   || '';
            const tipo   = (hi['Tipo']         || hi.tipo        || '?').trim();
            const inicio = hi['Hora Início']   || hi.horaInicio  || '';
            const fim    = hi['Hora Fim']      || hi.horaFim     || '';
            const turma  = hi['Código Turma']  || hi.codigoTurma || '';
            const data   = FieldHelper.normalizarData(hi['Data RDO'] || hi.dataRDO || '');
            const ctx    = { numeroRDO: numRDO || '—', numeroOS: '', codigoTurma: turma, data: data || '—' };

            // RULE_010 — HI órfã
            if (numRDO && !rdoSetCompleto.has(numRDO)) {
                this._add({ id: 'RULE_010', severity: 'high', category: 'consistencia',
                    entityType: 'hi', sheetName: 'HorasImprodutivas', field: 'Número RDO',
                    message:    `HI (${tipo}) aponta para RDO inexistente: "${numRDO}"`,
                    suggestion: 'Verifique se o RDO pai foi deletado', ...ctx });
            }

            // RULE_012 — HI com horário incompleto
            if (!inicio || !fim) {
                this._add({ id: 'RULE_012', severity: 'high', category: 'completude',
                    entityType: 'hi', sheetName: 'HorasImprodutivas',
                    field:      !inicio ? 'Hora Início' : 'Hora Fim',
                    message:    `HI (${tipo}) com horário incompleto — início "${inicio || '—'}", fim "${fim || '—'}"`,
                    suggestion: 'Preencha os horários de início e fim no app', ...ctx });
            }
        });
    }

    _verificarEfetivos(efetivos, rdoSetCompleto) {
        efetivos.forEach(ef => {
            const numRDO = ef['Número RDO']   || ef.numeroRDO   || '';
            const turma  = ef['Código Turma'] || ef.codigoTurma || '';
            const data   = FieldHelper.normalizarData(ef['Data RDO'] || ef.dataRDO || '');

            // RULE_013 — Efetivo órfão
            if (numRDO && !rdoSetCompleto.has(numRDO)) {
                this._add({ id: 'RULE_013', severity: 'high', category: 'consistencia',
                    entityType: 'efetivo', sheetName: 'Efetivo', field: 'Número RDO',
                    message:    `Efetivo aponta para RDO inexistente: "${numRDO}"`,
                    suggestion: 'O RDO pai pode ter sido deletado',
                    numeroRDO: numRDO, numeroOS: '', codigoTurma: turma, data: data || '—' });
            }
        });
    }

    _calcularScore() {
        const c = { critical: 0, high: 0, medium: 0, low: 0 };
        this._issues.forEach(i => { if (i.severity in c) c[i.severity]++; });

        // Cada tipo tem uma penalidade por ocorrência com teto máximo,
        // para evitar que um único tipo de problema domine o score inteiro.
        const penalty =
            Math.min(40, c.critical * 10) +
            Math.min(25, c.high     *  4) +
            Math.min(20, c.medium   *  1) +
            Math.min(5,  c.low      * 0.5);

        this._score = Math.max(0, Math.round(100 - penalty));
    }

    // ── Renderização pública ─────────────────────────────────────────────────

    renderizar(containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        if (!this._analisado) {
            el.innerHTML = `<div class="text-center text-muted py-5">
                <i class="fas fa-spinner fa-spin me-2"></i>Aguardando carregamento dos dados...
            </div>`;
            return;
        }

        // Reseta estado dos filtros a cada renderização completa
        this._filtroSev      = 'all';
        this._filtroCat      = null;
        this._filtroTurmaVal = '';

        const total = this._issues.length;
        const cats  = this._contarPorCategoria();

        el.innerHTML =
            this._htmlHero(total) +
            this._htmlCategorias(cats) +
            (total > 0
                ? this._htmlFiltros() + this._htmlTabela()
                : this._htmlVazio());
    }

    /** Atualiza o badge numérico na aba "Qualidade" com critical + high. */
    _atualizarBadge() {
        const badge = document.getElementById('dq-badge');
        if (!badge) return;
        const n = this._issues.filter(i => i.severity === 'critical' || i.severity === 'high').length;
        badge.textContent = n;
        badge.classList.toggle('d-none', n === 0);
    }

    // ── Helpers de contagem ──────────────────────────────────────────────────

    _contarPorCategoria() {
        const r = { completude: 0, validade: 0, consistencia: 0, duplicidade: 0,
                    critical: 0, high: 0, medium: 0, low: 0 };
        this._issues.forEach(i => {
            if (i.category  in r) r[i.category]++;
            if (i.severity  in r) r[i.severity]++;
        });
        return r;
    }

    // ── Blocos HTML ──────────────────────────────────────────────────────────

    _htmlHero(total) {
        const s = this._score;
        const [cor, icone, texto] =
            s >= 90 ? ['success', 'fa-check-circle',        'Saudável']   :
            s >= 75 ? ['warning', 'fa-exclamation-triangle','Atenção']    :
            s >= 50 ? ['orange',  'fa-exclamation-circle',  'Degradação'] :
                      ['danger',  'fa-times-circle',        'Crítico'];

        const isOrange = cor === 'orange';
        const colorStyle = isOrange ? 'color:#E65100;' : '';
        const textCls    = isOrange ? ''               : `text-${cor}`;

        return `
        <div class="card border-0 shadow-sm mb-4">
            <div class="card-body py-4">
                <div class="row align-items-center g-3">
                    <div class="col-auto text-center" style="min-width:130px;">
                        <div class="fw-bold ${textCls}" style="font-size:4.5rem;line-height:1;${colorStyle}">${s}</div>
                        <div class="text-muted" style="font-size:.8rem;">/ 100 — Score de Qualidade</div>
                    </div>
                    <div class="col-auto d-none d-md-block border-end" style="height:72px;"></div>
                    <div class="col">
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <i class="fas ${icone} fs-4 ${textCls}" style="${colorStyle}"></i>
                            <span class="fw-semibold fs-5 ${textCls}" style="${colorStyle}">${texto}</span>
                        </div>
                        <div class="text-muted small mb-2">
                            ${total === 0
                                ? '<i class="fas fa-check me-1 text-success"></i>Nenhuma inconsistência detectada na base de dados.'
                                : `<strong>${total}</strong> inconsistência${total > 1 ? 's' : ''} encontrada${total > 1 ? 's' : ''} — clique nas categorias abaixo para filtrar.`}
                        </div>
                        <div class="d-flex flex-wrap gap-3 small text-muted">
                            <span><i class="fas fa-circle text-success  me-1"></i>90–100 Saudável</span>
                            <span><i class="fas fa-circle text-warning  me-1"></i>75–89 Atenção</span>
                            <span><i class="fas fa-circle me-1" style="color:#E65100;"></i>50–74 Degradação</span>
                            <span><i class="fas fa-circle text-danger   me-1"></i>0–49 Crítico</span>
                        </div>
                    </div>
                    <div class="col-12 col-md-auto text-md-end">
                        <button class="btn btn-outline-secondary btn-sm" onclick="dataQuality._reexecutar()"
                                title="Re-analisa os dados já carregados (sem buscar na planilha)">
                            <i class="fas fa-sync-alt me-1"></i>Reanalisar
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    }

    _htmlCategorias(c) {
        const cats = [
            { key: 'completude',   label: 'Completude',   icon: 'fa-tasks',      desc: 'Campos obrigatórios',    cor: 'primary' },
            { key: 'validade',     label: 'Validade',     icon: 'fa-spell-check', desc: 'Formatos e valores',    cor: 'info'    },
            { key: 'consistencia', label: 'Consistência', icon: 'fa-link',        desc: 'Integridade referencial',cor: 'warning' },
            { key: 'duplicidade',  label: 'Duplicidade',  icon: 'fa-copy',        desc: 'Registros repetidos',    cor: 'danger'  },
        ];
        return `<div class="row g-3 mb-4">${cats.map(cat => `
            <div class="col-6 col-md-3">
                <div class="card border-0 shadow-sm h-100 dq-cat-card" style="cursor:pointer; transition:box-shadow .15s;"
                     data-cat="${escAttr(cat.key)}"
                     onclick="dataQuality._filtrarCategoria('${escAttr(cat.key)}', this)"
                     onmouseenter="this.style.boxShadow='0 .25rem .75rem rgba(0,0,0,.12)'"
                     onmouseleave="this.style.boxShadow=''">
                    <div class="card-body py-3 text-center">
                        <div class="mb-2"><i class="fas ${cat.icon} text-${cat.cor} fs-4"></i></div>
                        <div class="fw-bold fs-4 ${c[cat.key] > 0 ? `text-${cat.cor}` : 'text-success'}">${c[cat.key]}</div>
                        <div class="small fw-semibold">${cat.label}</div>
                        <div class="text-muted" style="font-size:.72rem;">${cat.desc}</div>
                    </div>
                </div>
            </div>`).join('')}</div>`;
    }

    _htmlFiltros() {
        const sevs = [
            { v: 'all',      l: 'Todos',   cls: 'secondary' },
            { v: 'critical', l: 'Crítico', cls: 'danger'    },
            { v: 'high',     l: 'Alto',    cls: 'warning'   },
            { v: 'medium',   l: 'Médio',   cls: 'secondary' },
            { v: 'low',      l: 'Baixo',   cls: 'info'      },
        ];
        const turmas = [...new Set(this._issues.map(i => i.codigoTurma).filter(Boolean))].sort();
        const opts   = ['', ...turmas].map(t =>
            `<option value="${escAttr(t)}">${escapeHtml(t || 'Todas as turmas')}</option>`
        ).join('');

        return `
        <div class="card border-0 bg-light mb-3">
            <div class="card-body py-2 d-flex flex-wrap align-items-center gap-2">
                <span class="text-muted small fw-semibold"><i class="fas fa-filter me-1"></i>Severidade:</span>
                ${sevs.map(b => `
                    <button class="btn btn-sm btn-outline-${b.cls} dq-sev-btn ${b.v === 'all' ? 'active' : ''}"
                            data-sev="${b.v}"
                            onclick="dataQuality._filtrarSeveridade('${b.v}', this)">
                        ${b.l}
                    </button>`).join('')}
                <div class="ms-auto">
                    <select class="form-select form-select-sm" id="dq-filtro-turma"
                            onchange="dataQuality._filtrarTurmaFn(this.value)" style="min-width:160px;">
                        ${opts}
                    </select>
                </div>
            </div>
        </div>`;
    }

    _htmlTabela() {
        return `
        <div class="card border-0 shadow-sm">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <h6 class="mb-0">
                    <i class="fas fa-table me-2 text-secondary"></i>
                    Inconsistências
                    <span class="badge bg-secondary ms-1" id="dq-count">${this._issues.length}</span>
                </h6>
                <small class="text-muted" id="dq-showing">${this._issues.length} registro${this._issues.length !== 1 ? 's' : ''}</small>
            </div>
            <div class="table-responsive">
                <table class="table table-sm table-hover mb-0 align-middle small" id="dq-table">
                    <thead class="table-light">
                        <tr>
                            <th style="width:90px;">Severidade</th>
                            <th style="width:110px;">Categoria</th>
                            <th style="width:72px;">Entidade</th>
                            <th>Problema &amp; Sugestão</th>
                            <th style="width:168px;">Número RDO</th>
                            <th style="width:88px;">Turma</th>
                            <th style="width:92px;">Data</th>
                            <th style="width:42px;"></th>
                        </tr>
                    </thead>
                    <tbody id="dq-tbody">
                        ${this._htmlLinhas(this._issues)}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    _htmlVazio() {
        return `
        <div class="alert alert-success d-flex align-items-center gap-3 mb-0">
            <i class="fas fa-check-circle fs-2 flex-shrink-0"></i>
            <div>
                <strong>Base de dados saudável!</strong><br>
                <span class="small">Nenhuma inconsistência encontrada nos registros analisados.</span>
            </div>
        </div>`;
    }

    _htmlLinhas(issues) {
        if (!issues.length) {
            return `<tr><td colspan="8" class="text-center text-muted py-4">
                <i class="fas fa-check me-2 text-success"></i>Nenhuma inconsistência para os filtros selecionados
            </td></tr>`;
        }

        const SEV = {
            critical: ['Crítico',  'danger',    'white'],
            high:     ['Alto',     'warning',   'dark' ],
            medium:   ['Médio',    'secondary', 'white'],
            low:      ['Baixo',    'info',      'dark' ],
        };
        const CAT = {
            completude:   'Completude',
            validade:     'Validade',
            consistencia: 'Consistência',
            duplicidade:  'Duplicidade',
        };
        const ENT = { rdo: 'RDO', servico: 'Serviço', hi: 'HI', efetivo: 'Efetivo' };

        return issues.map(i => {
            const [slabel, scls, stxt] = SEV[i.severity] || ['?', 'secondary', 'white'];
            const canNav = i.numeroRDO && i.numeroRDO !== '—'
                        && i.data      && i.data      !== '—'
                        && i.codigoTurma;
            const navBtn = canNav
                ? `<button class="btn btn-outline-primary btn-sm py-0 px-1"
                           style="font-size:.65rem;"
                           title="Ver no Calendário"
                           onclick="dataQuality._navegar('${escAttr(i.numeroRDO)}','${escAttr(i.data)}','${escAttr(i.codigoTurma)}')">
                       <i class="fas fa-calendar-alt"></i>
                   </button>`
                : '';

            return `<tr>
                <td><span class="badge bg-${scls} text-${stxt}">${slabel}</span></td>
                <td class="text-muted">${escapeHtml(CAT[i.category] || i.category)}</td>
                <td><span class="badge bg-light text-dark border">${escapeHtml(ENT[i.entityType] || i.entityType)}</span></td>
                <td>
                    <div class="fw-semibold">${escapeHtml(i.message)}</div>
                    <div class="text-muted" style="font-size:.8em;">${escapeHtml(i.suggestion)}</div>
                </td>
                <td style="font-family:monospace;font-size:.78rem;">${escapeHtml(i.numeroRDO || '—')}</td>
                <td>${escapeHtml(i.codigoTurma || '—')}</td>
                <td>${escapeHtml(i.data || '—')}</td>
                <td>${navBtn}</td>
            </tr>`;
        }).join('');
    }

    // ── Filtros da UI ────────────────────────────────────────────────────────

    _filtrarCategoria(cat, cardEl) {
        // Toggle: clicar novamente deseleciona
        this._filtroCat = (this._filtroCat === cat) ? null : cat;
        document.querySelectorAll('.dq-cat-card').forEach(c => {
            const ativo = c.dataset.cat === this._filtroCat;
            c.classList.toggle('border',         ativo);
            c.classList.toggle('border-primary', ativo);
            c.classList.toggle('border-2',       ativo);
        });
        this._aplicarFiltros();
    }

    _filtrarSeveridade(sev, btnEl) {
        this._filtroSev = sev;
        document.querySelectorAll('.dq-sev-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.sev === sev)
        );
        this._aplicarFiltros();
    }

    _filtrarTurmaFn(val) {
        this._filtroTurmaVal = val;
        this._aplicarFiltros();
    }

    _aplicarFiltros() {
        let filt = this._issues;
        if (this._filtroSev && this._filtroSev !== 'all')
            filt = filt.filter(i => i.severity === this._filtroSev);
        if (this._filtroCat)
            filt = filt.filter(i => i.category === this._filtroCat);
        if (this._filtroTurmaVal)
            filt = filt.filter(i => i.codigoTurma === this._filtroTurmaVal);

        const tbody   = document.getElementById('dq-tbody');
        const countEl = document.getElementById('dq-count');
        const showEl  = document.getElementById('dq-showing');

        if (tbody)   tbody.innerHTML = this._htmlLinhas(filt);
        if (countEl) countEl.textContent = filt.length;
        if (showEl)  showEl.textContent  = filt.length === this._issues.length
            ? `${this._issues.length} registros`
            : `${filt.length} de ${this._issues.length}`;
    }

    // ── Ações ────────────────────────────────────────────────────────────────

    /**
     * Abre o modal de detalhes do dia diretamente, sem trocar de aba.
     * O modal é independente do calendário e pode abrir de qualquer contexto.
     */
    _navegar(numRDO, data, turma) {
        const partes = (data || '').split('/');
        if (partes.length < 3) return;
        const dia = parseInt(partes[0]);
        const mes = parseInt(partes[1]);
        const ano = parseInt(partes[2]);
        if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return;

        const tipoTurma = (turma || '').toUpperCase().startsWith('TS') ? 'TS' : 'TP';
        if (tipoTurma === 'TS' && typeof calendarioTS !== 'undefined') {
            calendarioTS.mostrarDetalhesDia(turma, dia, mes, ano);
        } else if (typeof calendarioTP !== 'undefined') {
            calendarioTP.mostrarDetalhesDia(turma, dia, mes, ano);
        }
    }

    /** Re-executa a análise sobre os dados já carregados em memória. */
    _reexecutar() {
        if (typeof dashboardMain === 'undefined' || !dashboardMain.dados) {
            mostrarToast('Dados ainda não carregados. Aguarde a inicialização.', 'warning');
            return;
        }
        const d = dashboardMain.dados;
        this.analisar(d.rdos, d.servicos, d.horasImprodutivas, d.efetivos);
        this.renderizar('dq-container');
        this._atualizarBadge();
        mostrarToast('Análise de qualidade atualizada.', 'success', 2500);
    }
}

// Instância global — consumida por main.js
const dataQuality = new DataQualityEngine();
