/**
 * EditorRDO — Edição de dados do RDO diretamente no modal "Detalhes do Dia"
 *
 * Responsabilidades:
 *   - Gerenciar modo de edição (ativar/desativar)
 *   - Enviar alterações ao Apps Script via proxy /api/apps-script
 *   - Atualizar dados em memória após save bem-sucedido
 *
 * Uso: editorRDO.inicializar(dados, 'TP') antes de exibir o modal.
 * Todas as funções de ação (salvar*, excluir*, etc.) são chamadas via onclick no HTML.
 */

class EditorRDO {
    constructor() {
        this.dados      = null;   // dados do dia (de obterDadosDia)
        this.tipo       = null;   // 'TP' | 'TS'
        this.numeroRDO  = null;   // primeiro Número RDO do dia
        this.modoEdicao = false;
        this._hiOrdem   = null;   // null | 'asc' | 'desc' — ordem atual da tabela HI
        this._editOSIdx = null;   // índice do hhPorOS em edição (modo multi-OS)
    }

    /**
     * Inicializa o editor com os dados do dia atual.
     * Chamado por mostrarDetalhesDia() antes de exibir o modal.
     *
     * @param {Object} dados       - resultado de obterDadosDia()
     * @param {string} tipo        - 'TP' ou 'TS'
     * @param {Array}  [servicos]  - para TS: array de servicosFormatados
     */
    inicializar(dados, tipo, servicos) {
        this.dados     = dados;
        this.tipo      = tipo || 'TP';
        this.modoEdicao = false;
        // Para múltiplos RDOs pega o primeiro; para TS usa dados.numeroRDO
        this.numeroRDO = (dados.numeroRDO || '').split(',')[0].trim();
        // TS passa serviços separadamente porque vêm de uma query diferente
        if (servicos) this.dados = { ...dados, servicos };
        if (!this.dados.servicos) this.dados.servicos = [];
        // TS has an extra "coeficiente" column — track colspan separately
        this._colsData = tipo === 'TS' ? 5 : (this.dados.multiplosRDOs ? 5 : 4);
    }

    // ── Utilitários ──────────────────────────────────────────────────────────

    /** Chama Apps Script via proxy do Worker. */
    async _api(payload) {
        const url = (typeof _appsScriptUrl === 'function') ? _appsScriptUrl() : '/api/apps-script';
        if (!url) throw new Error('Apps Script URL não configurada');
        const resp = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || json.sucesso === false) throw new Error(json.erro || 'Erro desconhecido no servidor');
        return json;
    }

    /** Mostra alerta de erro no topo do modal. */
    _erro(msg) {
        ['editor-alerta-tp', 'editor-alerta-ts'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
        });
        setTimeout(() => {
            ['editor-alerta-tp', 'editor-alerta-ts'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }, 5000);
    }

    /** Feedback visual: spinner enquanto aguarda, check/x ao finalizar. */
    async _comFeedback(btn, fn) {
        const orig = btn.innerHTML;
        const origClass = btn.className;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            await fn();
            btn.innerHTML = '<i class="fas fa-check"></i> OK';
            btn.classList.add('btn-success');
            setTimeout(() => { btn.innerHTML = orig; btn.className = origClass; btn.disabled = false; }, 1500);
        } catch (err) {
            btn.innerHTML = '<i class="fas fa-times"></i> Erro';
            btn.classList.add('btn-danger');
            setTimeout(() => { btn.innerHTML = orig; btn.className = origClass; btn.disabled = false; }, 2000);
            this._erro(err.message);
        }
    }

    /** Retorna o Número RDO correto para um item (usa o do item se múltiplos RDOs). */
    _rdoDe(item) {
        return (item && item.numeroRDO) ? item.numeroRDO.trim() : this.numeroRDO;
    }

    /**
     * Calcula o índice 0-based do item dentro do seu próprio Número RDO,
     * que é o índice que o Apps Script usa para localizar a linha na aba.
     */
    _indiceRDO(lista, posicao) {
        const rdoAlvo = this._rdoDe(lista[posicao]);
        let count = 0;
        for (let i = 0; i < posicao; i++) {
            if (this._rdoDe(lista[i]) === rdoAlvo) count++;
        }
        return count;
    }

    /** Seletor do modal ativo (TP ou TS). */
    _modalId() {
        return this.tipo === 'TS' ? 'modalDetalhesDiaTS' : 'modalDetalhesDia';
    }

    _q(selector) {
        const modal = document.getElementById(this._modalId());
        return modal ? modal.querySelector(selector) : null;
    }

    _qa(selector) {
        const modal = document.getElementById(this._modalId());
        return modal ? [...modal.querySelectorAll(selector)] : [];
    }

    // ── Modo de edição ────────────────────────────────────────────────────────

    ativarModoEdicao() {
        if (this.modoEdicao) { this.desativarModoEdicao(); return; }
        this.modoEdicao = true;

        const sufixo = this.tipo === 'TS' ? '-ts' : '-tp';
        const banner = document.getElementById('editor-banner' + sufixo);
        if (banner) banner.style.display = 'flex';

        this._qa('.edit-ctrl').forEach(el => el.style.display = '');
        this._qa('.view-only').forEach(el => el.style.display = 'none');

        const btn = document.getElementById('btn-toggle-edicao');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-times me-1"></i>Concluir Edição';
            btn.classList.replace('btn-outline-warning', 'btn-warning');
        }
    }

    desativarModoEdicao() {
        this.modoEdicao = false;

        const sufixo = this.tipo === 'TS' ? '-ts' : '-tp';
        const banner = document.getElementById('editor-banner' + sufixo);
        if (banner) banner.style.display = 'none';

        this._qa('.edit-ctrl').forEach(el => el.style.display = 'none');
        this._qa('.view-only').forEach(el => el.style.display = '');

        const btn = document.getElementById('btn-toggle-edicao');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-edit me-1"></i>Editar';
            btn.classList.replace('btn-warning', 'btn-outline-warning');
        }

        // Fechar formulário de cabeçalho se estiver aberto
        const cabForm = document.getElementById('cabecalho-form');
        if (cabForm && cabForm.style.display !== 'none') this.cancelarEditCabecalho();

        // Fechar formulários de cabeçalho multi-OS abertos
        if (this._editOSIdx !== null) { this.cancelarEditCabecalhoOS(this._editOSIdx); }

        // Restaurar linhas que estejam em modo de edição
        this._qa('tr[data-em-edicao]').forEach(tr => {
            if (tr.dataset.htmlOriginal) {
                tr.innerHTML = tr.dataset.htmlOriginal;
                delete tr.dataset.emEdicao;
                delete tr.dataset.htmlOriginal;
            }
        });
    }

    // ── Cabeçalho (OS, Local, KM, Horário) ───────────────────────────────────

    mostrarEditCabecalho() {
        const view = document.getElementById('cabecalho-view');
        const form = document.getElementById('cabecalho-form');
        if (!view || !form) return;

        const g = id => document.getElementById(id)?.textContent.trim() || '';
        const s = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        s('cab-os',     g('cab-view-os'));
        s('cab-local',  g('cab-view-local'));
        s('cab-km-ini', g('cab-view-km-ini'));
        s('cab-km-fim', g('cab-view-km-fim'));
        s('cab-hr-ini', g('cab-view-hr-ini'));
        s('cab-hr-fim', g('cab-view-hr-fim'));

        view.style.display = 'none';
        form.style.display = 'block';
        document.getElementById('cab-os')?.focus();
    }

    cancelarEditCabecalho() {
        const view = document.getElementById('cabecalho-view');
        const form = document.getElementById('cabecalho-form');
        if (view) view.style.display = '';
        if (form) form.style.display = 'none';
    }

    async salvarCabecalho(btn) {
        const g = id => document.getElementById(id)?.value.trim() || '';
        const novaOS     = g('cab-os');
        const local      = g('cab-local');
        const kmInicio   = g('cab-km-ini');
        const kmFim      = g('cab-km-fim');
        const horaInicio = g('cab-hr-ini');
        const horaFim    = g('cab-hr-fim');

        if (!novaOS) { this._erro('O número da O.S não pode ser vazio'); return; }

        const osAtual  = document.getElementById('cab-view-os')?.textContent.trim() || '';
        const osChanged = novaOS !== osAtual;

        await this._comFeedback(btn, async () => {
            let rdoTarget = this.numeroRDO;

            // Se a O.S mudou, renomear o Número RDO em todas as abas
            if (osChanged) {
                const partes = this.numeroRDO.split('-');
                const sufixo = partes.slice(1).join('-');
                const novoNumeroRDO = novaOS + '-' + sufixo;
                await this._api({ acao: 'renomearRDO', oldNumeroRDO: this.numeroRDO, newNumeroRDO: novoNumeroRDO, novaOS });
                this.numeroRDO = novoNumeroRDO;
                rdoTarget = novoNumeroRDO;
                // Atualizar exibição do Número RDO se visível no modal
                const rdoSpan = document.getElementById('cab-view-rdo');
                if (rdoSpan) rdoSpan.textContent = novoNumeroRDO;
            }

            // Atualizar demais campos
            await this._api({
                acao: 'atualizarCampoRDO',
                numeroRDO: rdoTarget,
                campos: { local, kmInicio, kmFim, horarioInicio: horaInicio, horarioFim: horaFim }
            });

            // Atualizar spans de visualização
            const sv = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            sv('cab-view-os',     novaOS);
            sv('cab-view-local',  local    || '-');
            sv('cab-view-km-ini', kmInicio || '-');
            sv('cab-view-km-fim', kmFim    || '-');
            sv('cab-view-hr-ini', horaInicio || '-');
            sv('cab-view-hr-fim', horaFim    || '-');

            // Atualizar memória — TP (via hhPorOS)
            if (this.dados.hhPorOS && this.dados.hhPorOS[0]) {
                const os0 = this.dados.hhPorOS[0];
                os0.numeroOS      = novaOS;
                os0.local         = local;
                os0.kmInicio      = kmInicio;
                os0.kmFim         = kmFim;
                os0.horarioInicio = horaInicio;
                os0.horarioFim    = horaFim;
            }
            // Atualizar memória — TS (campos diretos)
            if (this.dados.numeroOS   !== undefined) this.dados.numeroOS   = novaOS;
            if (this.dados.local      !== undefined) this.dados.local      = local;
            if (this.dados.kmInicio   !== undefined) this.dados.kmInicio   = kmInicio;
            if (this.dados.kmFim      !== undefined) this.dados.kmFim      = kmFim;
            if (this.dados.horaInicio !== undefined) this.dados.horaInicio = horaInicio;
            if (this.dados.horaFim    !== undefined) this.dados.horaFim    = horaFim;

            this.cancelarEditCabecalho();
        });
    }

    // ── Cabeçalho multi-OS (quando há 2+ O.S no mesmo dia) ───────────────────

    mostrarEditCabecalhoOS(idx) {
        this._editOSIdx = idx;
        const view = document.getElementById('cab-view-os-' + idx);
        const form = document.getElementById('cab-form-os-' + idx);
        if (view) view.style.display = 'none';
        if (form) form.style.display = 'block';
        document.getElementById('cab-os-os-' + idx)?.focus();
    }

    cancelarEditCabecalhoOS(idx) {
        const view = document.getElementById('cab-view-os-' + idx);
        const form = document.getElementById('cab-form-os-' + idx);
        if (view) view.style.display = '';
        if (form) form.style.display = 'none';
        this._editOSIdx = null;
    }

    async salvarCabecalhoOS(idx, btn) {
        const g = sfx => document.getElementById(sfx + idx)?.value.trim() || '';
        const novaOS     = g('cab-os-os-');
        const local      = g('cab-local-os-');
        const kmInicio   = g('cab-km-ini-os-');
        const kmFim      = g('cab-km-fim-os-');
        const horaInicio = g('cab-hr-ini-os-');
        const horaFim    = g('cab-hr-fim-os-');

        if (!novaOS) { this._erro('O número da O.S não pode ser vazio'); return; }

        const osRef   = this.dados.hhPorOS[idx];
        const rdoAlvo = osRef.numeroRDO || this.numeroRDO;
        const osChanged = novaOS !== osRef.numeroOS;

        await this._comFeedback(btn, async () => {
            let rdoTarget = rdoAlvo;

            if (osChanged) {
                const partes = rdoAlvo.split('-');
                const sufixo = partes.slice(1).join('-');
                const novoNumeroRDO = novaOS + '-' + sufixo;
                await this._api({ acao: 'renomearRDO', oldNumeroRDO: rdoAlvo, newNumeroRDO: novoNumeroRDO, novaOS });
                osRef.numeroRDO = novoNumeroRDO;
                rdoTarget = novoNumeroRDO;
                if (idx === 0) this.numeroRDO = novoNumeroRDO;
            }

            await this._api({
                acao: 'atualizarCampoRDO',
                numeroRDO: rdoTarget,
                campos: { local, kmInicio, kmFim, horarioInicio: horaInicio, horarioFim: horaFim, ...(osChanged ? { numeroOS: novaOS } : {}) }
            });

            // Atualizar memória
            osRef.numeroOS = novaOS; osRef.local = local;
            osRef.kmInicio = kmInicio; osRef.kmFim = kmFim;
            osRef.horarioInicio = horaInicio; osRef.horarioFim = horaFim;

            // Atualizar view
            const view = document.getElementById('cab-view-os-' + idx);
            if (view) {
                view.innerHTML = `
                    <span class="badge bg-secondary">${escapeHtml(novaOS)}</span>
                    <span class="text-muted small">
                        <i class="fas fa-map-marker-alt me-1"></i>${escapeHtml(local || '-')}
                        &nbsp;|&nbsp;<i class="fas fa-road me-1"></i>KM ${escapeHtml(kmInicio || '-')} – ${escapeHtml(kmFim || '-')}
                        &nbsp;|&nbsp;<i class="fas fa-clock me-1"></i>${escapeHtml(horaInicio || '-')} – ${escapeHtml(horaFim || '-')}
                    </span>
                    <span class="edit-ctrl" style="${this.modoEdicao ? '' : 'display:none;'}">
                        <button class="btn btn-link btn-sm p-0 me-1" onclick="editorRDO.mostrarEditCabecalhoOS(${idx})" title="Editar">
                            <i class="fas fa-pencil-alt" style="font-size:.7rem;"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm py-0 px-1"
                                onclick="editorRDO.excluirRDO('${escapeHtml(rdoTarget)}')" title="Excluir RDO">
                            <i class="fas fa-trash" style="font-size:.7rem;"></i>
                        </button>
                    </span>`;
            }
            this.cancelarEditCabecalhoOS(idx);
        });
    }

    // ── Serviços — helpers de select ─────────────────────────────────────────

    /** Constrói <option> elements a partir de SERVICOS_BASE global. */
    _buildServicosOptions(selectedDesc) {
        const lista = (typeof SERVICOS_BASE !== 'undefined' && Array.isArray(SERVICOS_BASE)) ? SERVICOS_BASE : [];
        return lista.map(s => {
            const val = escapeHtml(s.descricao + '|' + s.coeficiente);
            const sel = s.descricao === selectedDesc ? ' selected' : '';
            return `<option value="${val}"${sel}>${escapeHtml(s.descricao)} (coef: ${s.coeficiente})</option>`;
        }).join('');
    }

    /** Atualiza preview de HH na linha de edição de serviço. */
    _previewHH(idx) {
        const sel = document.getElementById('srv-sel-' + idx);
        const qty = parseFloat(document.getElementById('srv-qty-' + idx)?.value || 0);
        const pre = document.getElementById('srv-hh-pre-' + idx);
        if (!sel || !pre) return;
        const coef = parseFloat((sel.value.split('|')[1]) || 0);
        pre.textContent = (isNaN(coef) || coef === 0 || isNaN(qty) || qty === 0) ? '?' : (qty * coef).toFixed(2);
    }

    /** Atualiza preview de HH no formulário "Adicionar Serviço". */
    _previewNovoHH() {
        const sel = document.getElementById('novo-srv-sel');
        const qty = parseFloat(document.getElementById('novo-srv-qty')?.value || 0);
        const pre = document.getElementById('novo-srv-hh-pre');
        if (!sel || !pre) return;
        const coef = parseFloat((sel.value.split('|')[1]) || 0);
        pre.textContent = (isNaN(coef) || coef === 0 || isNaN(qty) || qty === 0) ? '?' : (qty * coef).toFixed(2);
    }

    // ── Observações ───────────────────────────────────────────────────────────

    mostrarEditObservacoes() {
        const view     = document.getElementById('obs-view');
        const form     = document.getElementById('obs-form');
        const textarea = document.getElementById('obs-input');
        if (!form || !textarea) return;
        textarea.value = (this.dados.observacoes || '').trim();
        if (view) view.style.display = 'none';
        form.style.display = 'block';
        textarea.focus();
    }

    cancelarEditObservacoes() {
        const view = document.getElementById('obs-view');
        const form = document.getElementById('obs-form');
        if (view) view.style.display = '';
        if (form) form.style.display = 'none';
    }

    async salvarObservacoes(btn) {
        const textarea = document.getElementById('obs-input');
        if (!textarea) return;
        const novoValor = textarea.value.trim();

        await this._comFeedback(btn, async () => {
            await this._api({ acao: 'atualizarCampoRDO', numeroRDO: this.numeroRDO, campos: { observacoes: novoValor } });

            this.dados.observacoes = novoValor;
            const view = document.getElementById('obs-view');
            if (view) view.textContent = novoValor || '(sem observações)';
            this.cancelarEditObservacoes();
        });
    }

    // ── Serviços ──────────────────────────────────────────────────────────────

    editarServico(idx) {
        const tr = document.getElementById('srv-row-' + idx);
        if (!tr || tr.dataset.emEdicao) return;
        tr.dataset.emEdicao = 'true';
        tr.dataset.htmlOriginal = tr.innerHTML;

        const s = this.dados.servicos[idx];
        const unidades = ['M', 'M²', 'M³', 'KG', 'UN', 'T', 'L'];
        const coef = parseFloat(s.coeficiente || 0);
        const hhPrev = (coef > 0 && s.quantidade) ? (s.quantidade * coef).toFixed(2) : '?';

        tr.innerHTML = `
            <td colspan="${this._colsData}" class="p-2">
                <div class="row g-2 align-items-center">
                    <div class="col-12 col-md-5">
                        <select id="srv-sel-${idx}" class="form-select form-select-sm"
                                onchange="editorRDO._previewHH(${idx})">
                            ${this._buildServicosOptions(s.descricao)}
                        </select>
                    </div>
                    <div class="col-4 col-md-2">
                        <input id="srv-qty-${idx}" type="number" class="form-control form-control-sm"
                               value="${s.quantidade}" step="0.01" min="0" placeholder="Qtd"
                               oninput="editorRDO._previewHH(${idx})">
                    </div>
                    <div class="col-4 col-md-2">
                        <select id="srv-un-${idx}" class="form-select form-select-sm">
                            ${unidades.map(u => `<option${s.unidade === u ? ' selected' : ''}>${u}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-4 col-md-1 text-center">
                        <span class="badge bg-info text-dark" title="HH estimado">
                            <i class="fas fa-clock" style="font-size:.65rem;"></i>
                            <span id="srv-hh-pre-${idx}">${hhPrev}</span>
                        </span>
                    </div>
                    <div class="col-12 col-md-2 d-flex gap-1">
                        <button class="btn btn-sm btn-success flex-fill" onclick="editorRDO.salvarServico(${idx}, this)">
                            <i class="fas fa-save"></i> Salvar
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="editorRDO.cancelarEditServico(${idx})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            </td>
            <td class="edit-ctrl"></td>`;
    }

    cancelarEditServico(idx) {
        const tr = document.getElementById('srv-row-' + idx);
        if (!tr) return;
        tr.innerHTML = tr.dataset.htmlOriginal || '';
        delete tr.dataset.emEdicao;
        delete tr.dataset.htmlOriginal;
    }

    async salvarServico(idx, btn) {
        const s   = this.dados.servicos[idx];
        const sel = document.getElementById('srv-sel-' + idx);
        if (!sel || !sel.value) { this._erro('Selecione um serviço'); return; }

        const parts      = sel.value.split('|');
        const descricao  = parts[0] || '';
        const coeficiente = parseFloat(parts[1] || 0);
        const quantidade = parseFloat(document.getElementById('srv-qty-' + idx)?.value || 0);
        const unidade    = document.getElementById('srv-un-' + idx)?.value;

        if (!descricao) { this._erro('Selecione um serviço'); return; }

        const rdoAlvo = this._rdoDe(s);
        const indice  = this._indiceRDO(this.dados.servicos, idx);

        await this._comFeedback(btn, async () => {
            await this._api({ acao: 'atualizarServico', numeroRDO: rdoAlvo, indice, descricao, quantidade, unidade });

            s.descricao   = descricao;
            s.quantidade  = quantidade;
            s.unidade     = unidade;
            s.coeficiente = coeficiente;
            s.hh          = coeficiente > 0 ? (quantidade * coeficiente).toFixed(2) : s.hh;

            const tr = document.getElementById('srv-row-' + idx);
            if (tr) {
                delete tr.dataset.emEdicao;
                tr.innerHTML = this._htmlSrvRow(idx, s);
            }
        });
    }

    async excluirServico(idx) {
        const s = this.dados.servicos[idx];
        if (!confirm(`Excluir serviço "${s.descricao}"?\nEsta ação não pode ser desfeita.`)) return;

        const rdoAlvo = this._rdoDe(s);
        const indice  = this._indiceRDO(this.dados.servicos, idx);

        try {
            await this._api({ acao: 'excluirServico', numeroRDO: rdoAlvo, indice });
            document.getElementById('srv-row-' + idx)?.remove();
            this.dados.servicos.splice(idx, 1);
            this._reindexarServicos();
        } catch (err) { this._erro(err.message); }
    }

    toggleFormAdicionarServico() {
        const el = document.getElementById('form-adicionar-servico');
        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    async salvarNovoServico(btn) {
        const sel = document.getElementById('novo-srv-sel');
        if (!sel || !sel.value) { this._erro('Selecione um serviço'); return; }

        const parts      = sel.value.split('|');
        const descricao  = parts[0] || '';
        const coeficiente = parseFloat(parts[1] || 0);
        const quantidade = parseFloat(document.getElementById('novo-srv-qty')?.value || 0);
        const unidade    = document.getElementById('novo-srv-un')?.value || 'UN';

        if (!descricao) { this._erro('Selecione um serviço'); return; }
        if (!quantidade || isNaN(quantidade) || quantidade <= 0) { this._erro('Quantidade deve ser maior que zero'); return; }

        // Multi-OS: usar a O.S selecionada pelo usuário
        let osRef = this.dados.hhPorOS?.[0] || {};
        let rdoAlvoSrv = this.numeroRDO;
        if (this.dados.multiplosRDOs) {
            const osSel = document.getElementById('novo-srv-os')?.value;
            if (osSel) {
                const match = this.dados.hhPorOS.find(o => (o.numeroRDO || o.numeroOS) === osSel);
                if (match) { osRef = match; rdoAlvoSrv = match.numeroRDO || rdoAlvoSrv; }
            }
        }

        await this._comFeedback(btn, async () => {
            await this._api({
                acao:        'adicionarServico',
                numeroRDO:   rdoAlvoSrv,
                numeroOS:    osRef.numeroOS    || '',
                data:        this.dados.data   || '',
                codigoTurma: this.dados.turma  || '',
                encarregado: this.dados.encarregado || '',
                descricao, quantidade, unidade
            });

            const hhCalc = coeficiente > 0 ? (quantidade * coeficiente).toFixed(2) : '?';
            const novo = { descricao, quantidade, unidade, hh: hhCalc, coeficiente, observacao: '', isCustomizado: false, numeroRDO: null, numeroOS: null };
            this.dados.servicos.push(novo);

            const tbody = document.getElementById('tbody-servicos');
            if (tbody) {
                const idx = this.dados.servicos.length - 1;
                const tr  = document.createElement('tr');
                tr.id     = 'srv-row-' + idx;
                tr.innerHTML = this._htmlSrvRow(idx, novo);
                tbody.appendChild(tr);
            }

            // Limpar form
            sel.selectedIndex = 0;
            const qtyEl = document.getElementById('novo-srv-qty');
            if (qtyEl) qtyEl.value = '';
            const preEl = document.getElementById('novo-srv-hh-pre');
            if (preEl) preEl.textContent = '?';
            document.getElementById('form-adicionar-servico').style.display = 'none';
        });
    }

    _reindexarServicos() {
        const tbody = document.getElementById('tbody-servicos');
        if (!tbody) return;
        [...tbody.querySelectorAll('tr[id^="srv-row-"]')].forEach((tr, i) => {
            tr.id = 'srv-row-' + i;
            const btns = tr.querySelector('.edit-ctrl-btns-srv');
            if (btns) btns.innerHTML = this._htmlSrvBtns(i);
        });
    }

    _htmlSrvRow(idx, s) {
        const multiplo = this.dados.multiplosRDOs;
        return `
            ${multiplo ? `<td><span class="badge bg-secondary">${escapeHtml(s.numeroOS || '-')}</span></td>` : ''}
            <td>
                ${escapeHtml(s.descricao)}
                ${s.isCustomizado ? '<span class="badge bg-info ms-1" style="font-size:.6rem;">Custom</span>' : ''}
                ${s.observacao ? `<div class="text-muted small mt-1"><i class="fas fa-comment-dots me-1"></i>${escapeHtml(s.observacao)}</div>` : ''}
            </td>
            <td class="text-center">${escapeHtml(String(s.quantidade))}</td>
            <td class="text-center">${escapeHtml(s.unidade || '-')}</td>
            <td class="text-end"><strong>${escapeHtml(String(s.hh))}</strong></td>
            <td class="edit-ctrl text-center" style="${this.modoEdicao ? '' : 'display:none'}">
                <div class="edit-ctrl-btns-srv">${this._htmlSrvBtns(idx)}</div>
            </td>`;
    }

    _htmlSrvBtns(idx) {
        return `
            <button class="btn btn-outline-primary btn-sm me-1" style="padding:1px 6px"
                    onclick="editorRDO.editarServico(${idx})" title="Editar serviço">
                <i class="fas fa-edit" style="font-size:.75rem;"></i>
            </button>
            <button class="btn btn-outline-danger btn-sm" style="padding:1px 6px"
                    onclick="editorRDO.excluirServico(${idx})" title="Excluir serviço">
                <i class="fas fa-trash" style="font-size:.75rem;"></i>
            </button>`;
    }

    // ── Horas Improdutivas ────────────────────────────────────────────────────

    editarHI(idx) {
        const tr = document.getElementById('hi-row-' + idx);
        if (!tr || tr.dataset.emEdicao) return;
        tr.dataset.emEdicao = 'true';
        tr.dataset.htmlOriginal = tr.innerHTML;

        const hi = this.dados.horasImprodutivas[idx];
        const tipos = ['Chuva', 'Falta de Material', 'Aguardando Liberação', 'Passagens de Trem',
                       'Treinamento', 'Almoço/Refeição', 'Deslocamento', 'Outros'];
        // Se o tipo salvo não está na lista (dado legado), adiciona para preservar o valor
        if (hi.tipo && !tipos.includes(hi.tipo)) tipos.unshift(hi.tipo);

        tr.innerHTML = `
            <td colspan="${this.dados.multiplosRDOs ? 8 : 7}" class="p-2">
                <div class="row g-2 align-items-center">
                    <div class="col-12 col-md-3">
                        <select id="hi-tipo-${idx}" class="form-select form-select-sm">
                            ${tipos.map(t => `<option${hi.tipo === t ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-12 col-md-3">
                        <input id="hi-desc-${idx}" type="text" class="form-control form-control-sm"
                               value="${escapeHtml(hi.descricao || '')}" placeholder="Descrição (opcional)">
                    </div>
                    <div class="col-6 col-md-2">
                        <input id="hi-ini-${idx}" type="text" class="form-control form-control-sm"
                               value="${escapeHtml(hi.horaInicio || '')}" placeholder="HH:MM" maxlength="5">
                    </div>
                    <div class="col-6 col-md-2">
                        <input id="hi-fim-${idx}" type="text" class="form-control form-control-sm"
                               value="${escapeHtml(hi.horaFim || '')}" placeholder="HH:MM" maxlength="5">
                    </div>
                    <div class="col-12 col-md-2 d-flex gap-1">
                        <button class="btn btn-sm btn-success flex-fill"
                                onclick="editorRDO.salvarHI(${idx}, this)">
                            <i class="fas fa-save"></i> Salvar
                        </button>
                        <button class="btn btn-sm btn-outline-secondary"
                                onclick="editorRDO.cancelarEditHI(${idx})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            </td>`;
    }

    cancelarEditHI(idx) {
        const tr = document.getElementById('hi-row-' + idx);
        if (!tr) return;
        tr.innerHTML = tr.dataset.htmlOriginal || '';
        delete tr.dataset.emEdicao;
        delete tr.dataset.htmlOriginal;
    }

    async salvarHI(idx, btn) {
        const hi        = this.dados.horasImprodutivas[idx];
        const tipo      = document.getElementById('hi-tipo-' + idx)?.value;
        const descricao = document.getElementById('hi-desc-' + idx)?.value.trim();
        const horaInicio = document.getElementById('hi-ini-' + idx)?.value.trim();
        const horaFim    = document.getElementById('hi-fim-' + idx)?.value.trim();

        if (!tipo || !horaInicio || !horaFim) { this._erro('Tipo, Hora Início e Hora Fim são obrigatórios'); return; }

        const rdoAlvo = this._rdoDe(hi);
        const indice  = this._indiceRDO(this.dados.horasImprodutivas, idx);

        await this._comFeedback(btn, async () => {
            await this._api({ acao: 'atualizarHI', numeroRDO: rdoAlvo, indice, tipo, descricao, horaInicio, horaFim });

            hi.tipo       = tipo;
            hi.descricao  = descricao || '';
            hi.horaInicio = horaInicio;
            hi.horaFim    = horaFim;

            const tr = document.getElementById('hi-row-' + idx);
            if (tr) {
                delete tr.dataset.emEdicao;
                tr.innerHTML = this._htmlHIRow(idx, hi);
            }
        });
    }

    async excluirHI(idx) {
        const hi = this.dados.horasImprodutivas[idx];
        if (!confirm(`Excluir HI "${hi.tipo}" (${hi.horaInicio}–${hi.horaFim})?\nEsta ação não pode ser desfeita.`)) return;

        const rdoAlvo = this._rdoDe(hi);
        const indice  = this._indiceRDO(this.dados.horasImprodutivas, idx);

        try {
            await this._api({ acao: 'excluirHI', numeroRDO: rdoAlvo, indice });
            document.getElementById('hi-row-' + idx)?.remove();
            this.dados.horasImprodutivas.splice(idx, 1);
            this._reindexarHIs();
        } catch (err) { this._erro(err.message); }
    }

    toggleFormAdicionarHI() {
        const el = document.getElementById('form-adicionar-hi');
        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    async salvarNovaHI(btn) {
        const tipo       = document.getElementById('nova-hi-tipo')?.value;
        const descricao  = document.getElementById('nova-hi-desc')?.value.trim();
        const horaInicio = document.getElementById('nova-hi-ini')?.value.trim();
        const horaFim    = document.getElementById('nova-hi-fim')?.value.trim();
        const operadores = parseInt(document.getElementById('nova-hi-ops')?.value || 12);

        if (!tipo || !horaInicio || !horaFim) { this._erro('Tipo, Hora Início e Hora Fim são obrigatórios'); return; }

        // Multi-OS: usar a O.S selecionada pelo usuário
        let osRef = this.dados.hhPorOS?.[0] || {};
        let rdoAlvoHI = this.numeroRDO;
        if (this.dados.multiplosRDOs) {
            const osSel = document.getElementById('nova-hi-os')?.value;
            if (osSel) {
                const match = this.dados.hhPorOS.find(o => (o.numeroRDO || o.numeroOS) === osSel);
                if (match) { osRef = match; rdoAlvoHI = match.numeroRDO || rdoAlvoHI; }
            }
        }

        await this._comFeedback(btn, async () => {
            await this._api({
                acao:        'adicionarHI',
                numeroRDO:   rdoAlvoHI,
                numeroOS:    osRef.numeroOS    || '',
                data:        this.dados.data   || '',
                codigoTurma: this.dados.turma  || '',
                encarregado: this.dados.encarregado || '',
                tipo, descricao, horaInicio, horaFim, operadores
            });

            const nova = { tipo, descricao: descricao || '', horaInicio, horaFim, hh: '0.00', overlap: false, numeroRDO: null, numeroOS: null };
            this.dados.horasImprodutivas.push(nova);

            const tbody = document.getElementById('tbody-hi');
            if (tbody) {
                const idx = this.dados.horasImprodutivas.length - 1;
                const tr  = document.createElement('tr');
                tr.id     = 'hi-row-' + idx;
                tr.innerHTML = this._htmlHIRow(idx, nova);
                tbody.appendChild(tr);
            }

            ['nova-hi-desc', 'nova-hi-ini', 'nova-hi-fim'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            document.getElementById('form-adicionar-hi').style.display = 'none';
        });
    }

    _reindexarHIs() {
        const tbody = document.getElementById('tbody-hi');
        if (!tbody) return;
        [...tbody.querySelectorAll('tr[id^="hi-row-"]')].forEach((tr, i) => {
            tr.id = 'hi-row-' + i;
            const btns = tr.querySelector('.edit-ctrl-btns-hi');
            if (btns) btns.innerHTML = this._htmlHIBtns(i);
        });
    }

    _htmlHIRow(idx, hi) {
        const multiplo = this.dados.multiplosRDOs;
        const dur = this._durDisplay(hi.horaInicio, hi.horaFim);
        return `
            ${multiplo ? `<td><span class="badge bg-secondary">${escapeHtml(hi.numeroOS || '-')}</span></td>` : ''}
            <td>
                <span class="badge bg-warning">${escapeHtml(hi.tipo)}</span>
                ${hi.overlap ? '<span class="badge bg-danger ms-1" title="Intervalo se sobrepõe com outra HI">⚠️ sobreposição</span>' : ''}
            </td>
            <td>${escapeHtml(hi.descricao || '')}</td>
            <td class="text-center">${escapeHtml(hi.horaInicio)}</td>
            <td class="text-center">${escapeHtml(hi.horaFim)}</td>
            <td class="text-center text-muted small">${escapeHtml(dur)}</td>
            <td class="text-end"><strong>${escapeHtml(String(hi.hh))}</strong></td>
            <td class="edit-ctrl text-center" style="${this.modoEdicao ? '' : 'display:none'}">
                <div class="edit-ctrl-btns-hi">${this._htmlHIBtns(idx)}</div>
            </td>`;
    }

    // ── Excluir RDO ───────────────────────────────────────────────────────────

    async excluirRDO(numeroRDO) {
        const rdo = numeroRDO || this.numeroRDO;
        if (!confirm(`Excluir RDO ${rdo}?\n\nO relatório será marcado como deletado no Google Sheets e deixará de aparecer no dashboard. Esta ação não pode ser facilmente desfeita.`)) return;

        try {
            await this._api({ acao: 'deletarRDO', numeroRDO: rdo });
            const modalEl = document.getElementById(this._modalId());
            if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
            setTimeout(() => window.location.reload(), 600);
        } catch (err) { this._erro(err.message); }
    }

    _htmlHIBtns(idx) {
        return `
            <button class="btn btn-outline-primary btn-sm me-1" style="padding:1px 6px"
                    onclick="editorRDO.editarHI(${idx})" title="Editar HI">
                <i class="fas fa-edit" style="font-size:.75rem;"></i>
            </button>
            <button class="btn btn-outline-danger btn-sm" style="padding:1px 6px"
                    onclick="editorRDO.excluirHI(${idx})" title="Excluir HI">
                <i class="fas fa-trash" style="font-size:.75rem;"></i>
            </button>`;
    }

    // ── Duração e ordenação de HI ─────────────────────────────────────────────

    /** Converte "HH:MM" → minutos totais. */
    _toMin(t) {
        const p = (t || '').split(':').map(Number);
        return (p[0] || 0) * 60 + (p[1] || 0);
    }

    /** Duração em minutos entre início e fim (suporta overnight). */
    _calcDurMin(ini, fim) {
        if (!ini || !fim || ini === '-' || fim === '-') return 0;
        let dur = this._toMin(fim) - this._toMin(ini);
        if (dur < 0) dur += 24 * 60;
        return dur;
    }

    /** Duração formatada "Xh YYmin" (ou "YYmin" se < 1h). */
    _durDisplay(ini, fim) {
        const min = this._calcDurMin(ini, fim);
        if (min === 0) return '—';
        const h = Math.floor(min / 60), m = min % 60;
        if (h > 0 && m > 0) return `${h}h${String(m).padStart(2,'0')}m`;
        if (h > 0) return `${h}h`;
        return `${m}min`;
    }

    /**
     * Ordena a tabela de HI por duração.
     * @param {'asc'|'desc'} dir
     */
    ordenarHI(dir) {
        if (this._hiOrdem === dir) {
            // Segundo clique no mesmo sentido → restaurar ordem original
            this._hiOrdem = null;
            this.dados.horasImprodutivas.sort((a, b) => (a._origemIdx || 0) - (b._origemIdx || 0));
        } else {
            this._hiOrdem = dir;
            // Registrar índice original para poder restaurar
            this.dados.horasImprodutivas.forEach((hi, i) => { hi._origemIdx = hi._origemIdx ?? i; });
            this.dados.horasImprodutivas.sort((a, b) => {
                const da = this._calcDurMin(a.horaInicio, a.horaFim);
                const db = this._calcDurMin(b.horaInicio, b.horaFim);
                return dir === 'asc' ? da - db : db - da;
            });
        }

        const tbody = document.getElementById('tbody-hi');
        if (!tbody) return;
        tbody.innerHTML = this.dados.horasImprodutivas
            .map((hi, i) => `<tr id="hi-row-${i}">${this._htmlHIRow(i, hi)}</tr>`)
            .join('');

        // Atualizar visuais dos botões de ordem
        const upBtn   = document.getElementById('hi-sort-asc');
        const downBtn = document.getElementById('hi-sort-desc');
        if (upBtn)   upBtn.classList.toggle('btn-secondary', this._hiOrdem === 'asc');
        if (upBtn)   upBtn.classList.toggle('btn-outline-secondary', this._hiOrdem !== 'asc');
        if (downBtn) downBtn.classList.toggle('btn-secondary', this._hiOrdem === 'desc');
        if (downBtn) downBtn.classList.toggle('btn-outline-secondary', this._hiOrdem !== 'desc');
    }
}

const editorRDO = new EditorRDO();
