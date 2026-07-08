/**
 * NovoRDO — Criação de RDO novo diretamente pelo dashboard (cabeçalho + Serviços)
 *
 * Diferente do EditorRDO (que edita uma linha já existente na planilha), aqui o
 * estado é um rascunho em memória até o usuário clicar em "Criar RDO". Escopo
 * enxuto: Materiais, Equipamentos, HI, Efetivo e Transportes ficam de fora —
 * podem ser adicionados depois editando o RDO no calendário (EditorRDO).
 *
 * Uso: botão "Novo RDO" na navbar chama novoRDO.abrirModal().
 */
class NovoRDO {
    constructor() {
        this.servicos = []; // rascunho: [{descricao, coeficiente, quantidade, unidade}]
    }

    _el(id) {
        return document.getElementById(id);
    }

    // ── Abertura do modal ────────────────────────────────────────────────────

    abrirModal() {
        this.servicos = [];

        const iso = new Date().toISOString().slice(0, 10);
        this._el('nr-data').value = iso;

        ['nr-turma', 'nr-encarregado', 'nr-local', 'nr-numero-os', 'nr-status-os',
         'nr-km-inicio', 'nr-km-fim', 'nr-horario-inicio', 'nr-horario-fim',
         'nr-clima', 'nr-tema-dds', 'nr-colaboradores', 'nr-observacoes'].forEach(id => {
            const el = this._el(id);
            if (el) el.value = '';
        });

        this._el('nr-houve-servico').checked = true;
        const transp = this._el('nr-houve-transporte');
        if (transp) transp.checked = false;

        this._popularDatalists();
        this.toggleHouveServico();
        this._renderServicos();

        const alerta = this._el('novo-rdo-alerta');
        if (alerta) alerta.style.display = 'none';

        const modalEl = document.getElementById('modalNovoRDO');
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    // ── Turma / Encarregado (combobox editável via datalist) ─────────────────

    _popularDatalists() {
        const turmas = dashboardMain?.calculadora?.indices?.turmasUnicas;
        const dlTurmas = this._el('dlTurmas');
        if (dlTurmas && turmas) {
            dlTurmas.innerHTML = [...turmas].filter(Boolean).sort()
                .map(t => `<option value="${escapeHtml(t)}">`).join('');
        }
        this._popularEncarregados();
    }

    onTurmaChange() {
        this._popularEncarregados();
    }

    _popularEncarregados() {
        const turma = (this._el('nr-turma')?.value || '').trim();
        const rdosPorTurma = dashboardMain?.calculadora?.indices?.rdosPorTurma;
        const dl = this._el('dlEncarregados');
        if (!dl || !rdosPorTurma) return;

        const encarregados = new Set();
        const listas = turma && rdosPorTurma.has(turma) ? [rdosPorTurma.get(turma)] : [...rdosPorTurma.values()];
        listas.forEach(lista => lista.forEach(rdo => {
            const enc = (FieldHelper.getRDOEncarregado(rdo) || '').trim();
            if (enc) encarregados.add(enc);
        }));

        dl.innerHTML = [...encarregados].sort().map(e => `<option value="${escapeHtml(e)}">`).join('');
    }

    // ── Toggle Houve Serviço ──────────────────────────────────────────────────

    toggleHouveServico() {
        const houve = this._el('nr-houve-servico').checked;
        const fields = this._el('nr-secao-servico-fields');
        const secaoServicos = this._el('nr-secao-servicos');
        if (fields) fields.style.display = houve ? '' : 'none';
        if (secaoServicos) secaoServicos.style.display = houve ? '' : 'none';
        const hint = this._el('nr-obs-required-hint');
        if (hint) hint.style.display = houve ? 'none' : '';
    }

    // ── Serviços — lista dinâmica em memória ─────────────────────────────────

    _buildServicosOptions(selectedDesc) {
        const lista = (typeof SERVICOS_BASE !== 'undefined' && Array.isArray(SERVICOS_BASE)) ? SERVICOS_BASE : [];
        const opcoes = lista.map(s => {
            const val = escapeHtml(s.descricao + '|' + s.coeficiente);
            const sel = s.descricao === selectedDesc ? ' selected' : '';
            return `<option value="${val}"${sel}>${escapeHtml(s.descricao)} (coef: ${s.coeficiente})</option>`;
        }).join('');
        return '<option value="">Selecione…</option>' + opcoes;
    }

    adicionarLinhaServico() {
        this.servicos.push({ descricao: '', coeficiente: 0, quantidade: '', unidade: 'UN' });
        this._renderServicos();
    }

    removerLinhaServico(idx) {
        this.servicos.splice(idx, 1);
        this._renderServicos();
    }

    _renderServicos() {
        const tbody = this._el('nr-tbody-servicos');
        if (!tbody) return;
        const unidades = ['M', 'M²', 'M³', 'KG', 'UN', 'T', 'L'];

        if (this.servicos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-2">Nenhum serviço adicionado</td></tr>';
            return;
        }

        tbody.innerHTML = this.servicos.map((s, idx) => {
            const hhPrev = (s.coeficiente > 0 && s.quantidade) ? (s.quantidade * s.coeficiente).toFixed(2) : '?';
            return `
                <tr>
                    <td>
                        <select class="form-select form-select-sm" onchange="novoRDO._onServicoChange(${idx}, this)">
                            ${this._buildServicosOptions(s.descricao)}
                        </select>
                    </td>
                    <td style="width:110px">
                        <input type="number" class="form-control form-control-sm" min="0" step="0.01"
                               value="${s.quantidade}" placeholder="Qtd"
                               oninput="novoRDO._onQtyChange(${idx}, this)">
                    </td>
                    <td style="width:90px">
                        <select class="form-select form-select-sm" onchange="novoRDO._onUnidadeChange(${idx}, this)">
                            ${unidades.map(u => `<option${s.unidade === u ? ' selected' : ''}>${u}</option>`).join('')}
                        </select>
                    </td>
                    <td class="text-center" style="width:70px">
                        <span class="badge bg-info text-dark" id="nr-hh-${idx}">
                            <i class="fas fa-clock" style="font-size:.65rem;"></i> ${hhPrev}
                        </span>
                    </td>
                    <td style="width:40px">
                        <button type="button" class="btn btn-sm btn-outline-danger" onclick="novoRDO.removerLinhaServico(${idx})" title="Remover">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
        }).join('');
    }

    _atualizarPreviewHH(idx) {
        const badge = this._el('nr-hh-' + idx);
        if (!badge) return;
        const s = this.servicos[idx];
        const qty = parseFloat(s.quantidade);
        const hh = (s.coeficiente > 0 && qty > 0) ? (qty * s.coeficiente).toFixed(2) : '?';
        badge.innerHTML = `<i class="fas fa-clock" style="font-size:.65rem;"></i> ${hh}`;
    }

    _onServicoChange(idx, sel) {
        const parts = (sel.value || '').split('|');
        this.servicos[idx].descricao = parts[0] || '';
        this.servicos[idx].coeficiente = parseFloat(parts[1] || 0);
        this._atualizarPreviewHH(idx);
    }

    _onQtyChange(idx, input) {
        this.servicos[idx].quantidade = input.value === '' ? '' : parseFloat(input.value);
        this._atualizarPreviewHH(idx);
    }

    _onUnidadeChange(idx, sel) {
        this.servicos[idx].unidade = sel.value;
    }

    // ── KM helper (formato ferroviário "123+456") ────────────────────────────

    _kmToNumSafe(v) {
        return (typeof _kmToNum === 'function') ? _kmToNum(v) : null;
    }

    // ── Data (input type=date, ISO) → dd/MM/yyyy ────────────────────────────

    _dataParaBR(isoDate) {
        if (!isoDate) return '';
        const [y, m, d] = isoDate.split('-');
        return `${d}/${m}/${y}`;
    }

    // ── Coleta + validação ────────────────────────────────────────────────────

    _coletarDados() {
        const g = id => (this._el(id)?.value || '').trim();
        return {
            data: this._dataParaBR(g('nr-data')),
            codigoTurma: g('nr-turma'),
            encarregado: g('nr-encarregado'),
            local: g('nr-local'),
            numeroOS: g('nr-numero-os'),
            statusOS: g('nr-status-os'),
            kmInicio: g('nr-km-inicio'),
            kmFim: g('nr-km-fim'),
            horarioInicio: g('nr-horario-inicio'),
            horarioFim: g('nr-horario-fim'),
            clima: g('nr-clima'),
            temaDDS: g('nr-tema-dds'),
            houveServico: this._el('nr-houve-servico').checked,
            houveTransporte: this._el('nr-houve-transporte')?.checked || false,
            nomeColaboradores: g('nr-colaboradores'),
            observacoes: g('nr-observacoes')
        };
    }

    /** Retorna null se válido, false se o usuário cancelou uma confirmação, ou uma mensagem de erro. */
    _validar(dados) {
        if (!dados.data) return 'Informe a Data';
        if (!dados.codigoTurma) return 'Informe o Código da Turma';
        if (!dados.encarregado) return 'Informe o Encarregado';
        if (!dados.local) return 'Informe o Local';
        if (!dados.numeroOS) return 'Informe o Número da O.S';
        if (!dados.kmInicio) return 'Informe o KM Início';
        if (!dados.kmFim) return 'Informe o KM Fim';
        if (!dados.nomeColaboradores) return 'Informe o Nome dos Colaboradores';

        let diffMin = null;
        if (dados.houveServico) {
            if (!dados.temaDDS) return 'Informe o Tema DDS';
            const reHora = /^([01]\d|2[0-3]):[0-5]\d$/;
            if (!reHora.test(dados.horarioInicio)) return 'Horário Início inválido (formato HH:mm)';
            if (!reHora.test(dados.horarioFim)) return 'Horário Fim inválido (formato HH:mm)';

            const [hiH, hiM] = dados.horarioInicio.split(':').map(Number);
            const [hfH, hfM] = dados.horarioFim.split(':').map(Number);
            const minIni = hiH * 60 + hiM, minFim = hfH * 60 + hfM;
            diffMin = minFim >= minIni ? (minFim - minIni) : (24 * 60 - minIni) + minFim;
            if (diffMin > 24 * 60) return 'Diferença entre Horário Início e Fim maior que 24h';

            if (this.servicos.length === 0) return 'Adicione ao menos um serviço';
            for (let i = 0; i < this.servicos.length; i++) {
                const s = this.servicos[i];
                if (!s.descricao) return `Selecione o serviço na linha ${i + 1}`;
                if (!(parseFloat(s.quantidade) > 0)) return `Informe uma quantidade válida na linha ${i + 1}`;
            }
        } else {
            if (!dados.observacoes) return 'Observações são obrigatórias quando não houve serviço';
        }

        // Confirmações não-bloqueantes (mesmo espírito do RDOValidator do app)
        const kiNum = this._kmToNumSafe(dados.kmInicio);
        const kfNum = this._kmToNumSafe(dados.kmFim);
        if (kiNum !== null && kfNum !== null && kfNum < kiNum) {
            if (!confirm('O KM Fim é menor que o KM Início. Confirma mesmo assim?')) return false;
        }
        if (dados.houveServico) {
            const [hiH2, hiM2] = dados.horarioInicio.split(':').map(Number);
            const [hfH2, hfM2] = dados.horarioFim.split(':').map(Number);
            if ((hfH2 * 60 + hfM2) < (hiH2 * 60 + hiM2)) {
                if (!confirm('O horário cruza a meia-noite. Confirma mesmo assim?')) return false;
            }
        }

        return null;
    }

    // ── Envio ─────────────────────────────────────────────────────────────────

    async _api(payload) {
        const url = (typeof _appsScriptUrl === 'function') ? _appsScriptUrl() : '/api/apps-script';
        if (!url) throw new Error('Apps Script URL não configurada');
        const resp = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || json.sucesso === false) throw new Error(json.erro || 'Erro desconhecido no servidor');
        return json;
    }

    _erro(msg) {
        const el = this._el('novo-rdo-alerta');
        if (!el) return;
        el.textContent = '⚠️ ' + msg;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    async salvar(btn) {
        const dados = this._coletarDados();
        const resultado = this._validar(dados);
        if (resultado === false) return; // usuário cancelou uma confirmação
        if (typeof resultado === 'string') { this._erro(resultado); return; }

        const orig = btn.innerHTML;
        const origClass = btn.className;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Salvando…';

        try {
            const payload = Object.assign({ acao: 'criarRDO' }, dados);
            payload.servicos = this.servicos.map(s => ({
                descricao: s.descricao, quantidade: parseFloat(s.quantidade), unidade: s.unidade
            }));
            const resp = await this._api(payload);

            mostrarToast(`RDO ${resp.numeroRDO} criado com sucesso!`, 'success');
            const modalEl = document.getElementById('modalNovoRDO');
            bootstrap.Modal.getInstance(modalEl)?.hide();
            setTimeout(() => window.location.reload(), 800);

        } catch (err) {
            btn.innerHTML = orig;
            btn.className = origClass;
            btn.disabled = false;
            this._erro(err.message);
        }
    }
}

const novoRDO = new NovoRDO();
