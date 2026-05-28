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

        // Restaurar linhas que estejam em modo de edição
        this._qa('tr[data-em-edicao]').forEach(tr => {
            if (tr.dataset.htmlOriginal) {
                tr.innerHTML = tr.dataset.htmlOriginal;
                delete tr.dataset.emEdicao;
                delete tr.dataset.htmlOriginal;
            }
        });
    }

    // ── Número OS ────────────────────────────────────────────────────────────

    mostrarEditOS() {
        const view = document.getElementById('os-view');
        const form = document.getElementById('os-form');
        if (!view || !form) return;
        const input = document.getElementById('os-input');
        if (input) input.value = view.textContent.trim();
        view.style.display = 'none';
        form.style.display = 'inline-flex';
        input && input.focus();
    }

    cancelarEditOS() {
        const view = document.getElementById('os-view');
        const form = document.getElementById('os-form');
        if (view) view.style.display = '';
        if (form) form.style.display = 'none';
    }

    async salvarOS(btn) {
        const input = document.getElementById('os-input');
        if (!input) return;
        const novaOS = input.value.trim();
        if (!novaOS) { this._erro('O número da O.S não pode ser vazio'); return; }

        await this._comFeedback(btn, async () => {
            await this._api({ acao: 'atualizarCampoRDO', numeroRDO: this.numeroRDO, campos: { numeroOS: novaOS } });

            // Atualizar view e memória
            const view = document.getElementById('os-view');
            if (view) view.textContent = novaOS;
            if (this.dados.hhPorOS && this.dados.hhPorOS[0]) this.dados.hhPorOS[0].numeroOS = novaOS;
            this.cancelarEditOS();
        });
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

        tr.innerHTML = `
            <td colspan="${this._colsData}" class="p-2">
                <div class="d-flex gap-2 flex-wrap align-items-center">
                    <input id="srv-desc-${idx}" type="text" class="form-control form-control-sm"
                           value="${escapeHtml(String(s.descricao || ''))}" style="min-width:180px; flex:2;" placeholder="Descrição">
                    <input id="srv-qty-${idx}" type="number" class="form-control form-control-sm"
                           value="${s.quantidade}" step="0.01" min="0" style="width:90px;" placeholder="Qtd">
                    <select id="srv-un-${idx}" class="form-select form-select-sm" style="width:80px;">
                        ${unidades.map(u => `<option${s.unidade === u ? ' selected' : ''}>${u}</option>`).join('')}
                    </select>
                    <button class="btn btn-sm btn-success" onclick="editorRDO.salvarServico(${idx}, this)">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="editorRDO.cancelarEditServico(${idx})">
                        <i class="fas fa-times"></i>
                    </button>
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
        const s          = this.dados.servicos[idx];
        const descricao  = document.getElementById('srv-desc-' + idx)?.value.trim();
        const quantidade = parseFloat(document.getElementById('srv-qty-' + idx)?.value || 0);
        const unidade    = document.getElementById('srv-un-'  + idx)?.value;

        if (!descricao) { this._erro('Descrição é obrigatória'); return; }

        const rdoAlvo = this._rdoDe(s);
        const indice  = this._indiceRDO(this.dados.servicos, idx);

        await this._comFeedback(btn, async () => {
            await this._api({ acao: 'atualizarServico', numeroRDO: rdoAlvo, indice, descricao, quantidade, unidade });

            // Atualizar memória
            s.descricao  = descricao;
            s.quantidade = quantidade;
            s.unidade    = unidade;
            const coef   = parseFloat(s.coeficiente || 0);
            s.hh         = coef > 0 ? (quantidade * coef).toFixed(2) : s.hh;

            // Restaurar view
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
        const descricao  = document.getElementById('novo-srv-desc')?.value.trim();
        const quantidade = parseFloat(document.getElementById('novo-srv-qty')?.value || 0);
        const unidade    = document.getElementById('novo-srv-un')?.value || 'UN';

        if (!descricao) { this._erro('Descrição é obrigatória'); return; }
        if (!quantidade || isNaN(quantidade) || quantidade <= 0) { this._erro('Quantidade deve ser maior que zero'); return; }

        const osRef = this.dados.hhPorOS?.[0] || {};

        await this._comFeedback(btn, async () => {
            await this._api({
                acao:        'adicionarServico',
                numeroRDO:   this.numeroRDO,
                numeroOS:    osRef.numeroOS    || '',
                data:        this.dados.data   || '',
                codigoTurma: this.dados.turma  || '',
                encarregado: this.dados.encarregado || '',
                descricao, quantidade, unidade
            });

            const novo = { descricao, quantidade, unidade, hh: '?', coeficiente: 0, observacao: '', isCustomizado: false, numeroRDO: null, numeroOS: null };
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
            ['novo-srv-desc', 'novo-srv-qty'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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
            <td colspan="${this.dados.multiplosRDOs ? 7 : 6}" class="p-2">
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

        const osRef = this.dados.hhPorOS?.[0] || {};

        await this._comFeedback(btn, async () => {
            await this._api({
                acao:        'adicionarHI',
                numeroRDO:   this.numeroRDO,
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
        return `
            ${multiplo ? `<td><span class="badge bg-secondary">${escapeHtml(hi.numeroOS || '-')}</span></td>` : ''}
            <td>
                <span class="badge bg-warning">${escapeHtml(hi.tipo)}</span>
                ${hi.overlap ? '<span class="badge bg-danger ms-1" title="Intervalo se sobrepõe com outra HI">⚠️ sobreposição</span>' : ''}
            </td>
            <td>${escapeHtml(hi.descricao || '')}</td>
            <td class="text-center">${escapeHtml(hi.horaInicio)}</td>
            <td class="text-center">${escapeHtml(hi.horaFim)}</td>
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
}

const editorRDO = new EditorRDO();
