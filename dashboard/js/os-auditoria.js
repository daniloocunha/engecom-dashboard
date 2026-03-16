/**
 * OSAuditoria — Detecta e corrige números de O.S suspeitos no Dashboard Engecom/Encogel
 *
 * Critérios de suspeita:
 *   Crítico: >= 8 dígitos OU 5+ noves seguidos
 *   Leve:    7 dígitos que não seguem o padrão 100xxxx–199xxxx
 *
 * Três ações disponíveis por O.S:
 *   1. Corrigir — substitui o número em todas as abas do Sheets
 *   2. Dividir  — clona o RDO e redistribui serviços/HI entre duas O.S
 *   3. Ignorar  — salva no localStorage, não aparece mais
 */
class OSAuditoria {

    constructor() {
        this._rdos      = [];
        this._servicos  = [];
        this._hi        = [];
        this._efetivos  = [];
        this._suspeitas = new Map(); // Map<numeroOS, { nivel, motivo, rdos[], servicos[], hi[] }>
        this._osAtual   = null;      // OS selecionada no modal corrigir/dividir
        this._rdoAtual  = null;      // RDO selecionado no modal dividir
        this._atrib     = {};        // { itemKey: 'os1'|'os2' } — atribuições no painel dividir

        // Event delegation — configurado uma vez em _bindModalEvents
        this._listaBound = false;
        this._corrigirBound = false;
        this._dividirBound = false;
    }

    // ═══════════════════════════════════════════════════════════
    // Inicialização
    // ═══════════════════════════════════════════════════════════

    /**
     * Carrega os dados e executa a detecção.
     * Deve ser chamado após carregarTodosDados() no main.js.
     */
    carregarDados(rdos, servicos, hi, efetivos) {
        this._rdos     = rdos     || [];
        this._servicos = servicos || [];
        this._hi       = hi       || [];
        this._efetivos = efetivos || [];
        this._detectarSuspeitas();
    }

    // ═══════════════════════════════════════════════════════════
    // Detecção
    // ═══════════════════════════════════════════════════════════

    _isSuspeito(numeroOS) {
        if (!numeroOS || numeroOS === 'Sem O.S') return null;
        const ignorado = localStorage.getItem('osAuditoria_ignorada_' + numeroOS);
        if (ignorado) return null;

        const s = String(numeroOS).trim();
        if (/[^0-9]/.test(s)) return null; // não numérico: deixa para outras validações

        if (s.length >= 8)
            return { nivel: 'critico', motivo: '8 ou mais dígitos (possível concatenação)' };
        if (/9{5,}/.test(s))
            return { nivel: 'critico', motivo: '5 ou mais noves consecutivos (placeholder)' };
        if (s.length === 7 && !/^1\d{6}$/.test(s))
            return { nivel: 'leve', motivo: '7 dígitos fora do padrão 100xxxx–199xxxx' };

        return null;
    }

    _detectarSuspeitas() {
        this._suspeitas = new Map();

        this._rdos.forEach(rdo => {
            const os = (rdo['Número OS'] || rdo.numeroOS || '').toString().trim();
            if (!os) return;
            const resultado = this._isSuspeito(os);
            if (!resultado) return;

            if (!this._suspeitas.has(os)) {
                this._suspeitas.set(os, {
                    nivel:    resultado.nivel,
                    motivo:   resultado.motivo,
                    rdos:     [],
                    servicos: [],
                    hi:       []
                });
            }
            const entry = this._suspeitas.get(os);
            entry.rdos.push(rdo);
        });

        // Enriquecer com serviços e HI
        this._suspeitas.forEach((entry, os) => {
            const rdoIds = new Set(entry.rdos.map(r => r['Número RDO'] || r.numeroRDO));
            entry.servicos = this._servicos.filter(s => rdoIds.has(s['Número RDO'] || s.numeroRDO));
            entry.hi       = this._hi.filter(h => rdoIds.has(h['Número RDO'] || h.numeroRDO));
        });
    }

    // ═══════════════════════════════════════════════════════════
    // Badge
    // ═══════════════════════════════════════════════════════════

    atualizarBadge() {
        const btn   = document.getElementById('btnAuditoriaOS');
        const badge = document.getElementById('badgeAuditoriaCount');
        if (!btn || !badge) return;

        const total = this._suspeitas.size;
        badge.textContent = total;
        btn.style.display = total > 0 ? '' : 'none';
    }

    // ═══════════════════════════════════════════════════════════
    // Modal 1 — Lista
    // ═══════════════════════════════════════════════════════════

    abrirModalLista() {
        const body = document.getElementById('auditoriaListaBody');
        const badgeEl = document.getElementById('auditoriaListaBadge');
        if (!body) return;

        const total = this._suspeitas.size;
        if (badgeEl) badgeEl.textContent = total;

        if (total === 0) {
            body.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle me-2"></i>
                    Nenhuma O.S suspeita encontrada.
                </div>`;
        } else {
            // Separar críticas de leves
            const criticas = [], leves = [];
            this._suspeitas.forEach((info, os) => {
                (info.nivel === 'critico' ? criticas : leves).push({ os, info });
            });

            let html = `
                <div class="alert alert-warning py-2 small mb-3">
                    <i class="fas fa-info-circle me-1"></i>
                    Foram encontradas O.S com números fora do padrão. Revise cada uma e escolha uma ação.
                </div>
                <table class="table table-hover table-sm align-middle">
                    <thead class="table-dark">
                        <tr>
                            <th>O.S</th>
                            <th>Motivo</th>
                            <th class="text-center"># RDOs</th>
                            <th class="text-center"># Serviços</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>`;

            const renderLinha = ({ os, info }) => {
                const osEsc = escAttr(os);
                const badgeCls = info.nivel === 'critico' ? 'bg-danger' : 'bg-warning text-dark';
                return `
                    <tr>
                        <td><span class="badge ${badgeCls}">${escapeHtml(os)}</span></td>
                        <td class="small text-muted">${escapeHtml(info.motivo)}</td>
                        <td class="text-center">${info.rdos.length}</td>
                        <td class="text-center">${info.servicos.length}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary me-1 py-0"
                                    data-acao="corrigir" data-os="${osEsc}">
                                <i class="fas fa-edit me-1"></i>Corrigir
                            </button>
                            <button class="btn btn-sm btn-outline-success me-1 py-0"
                                    data-acao="dividir" data-os="${osEsc}">
                                <i class="fas fa-code-branch me-1"></i>Dividir
                            </button>
                            <button class="btn btn-sm btn-outline-secondary py-0"
                                    data-acao="ignorar" data-os="${osEsc}">
                                <i class="fas fa-eye-slash me-1"></i>Ignorar
                            </button>
                        </td>
                    </tr>`;
            };

            criticas.forEach(item => html += renderLinha(item));
            if (leves.length > 0) {
                html += `<tr class="table-light"><td colspan="5" class="small text-muted py-1 ps-2">
                    <i class="fas fa-exclamation-circle me-1 text-warning"></i>
                    Suspeitas leves (podem ser válidas)
                </td></tr>`;
                leves.forEach(item => html += renderLinha(item));
            }

            html += `</tbody></table>`;
            body.innerHTML = html;
        }

        // Info de ignoradas
        const ignoradasInfo = document.getElementById('auditoriaIgnoradasInfo');
        if (ignoradasInfo) {
            const count = this._getDismissedCount();
            ignoradasInfo.textContent = count > 0 ? `${count} O.S ignorada(s)` : '';
        }

        // Event delegation (uma única vez)
        if (!this._listaBound) {
            body.addEventListener('click', e => {
                const btn = e.target.closest('[data-acao]');
                if (!btn) return;
                const os = btn.dataset.os;
                const acao = btn.dataset.acao;
                if (acao === 'corrigir') { this._fecharModal('modalAuditoriaLista'); this.abrirModalCorrigir(os); }
                if (acao === 'dividir')  { this._fecharModal('modalAuditoriaLista'); this.abrirModalDividir(os); }
                if (acao === 'ignorar')  { this.ignorarOS(os); }
            });
            this._listaBound = true;
        }

        this._abrirModal('modalAuditoriaLista');
    }

    // ═══════════════════════════════════════════════════════════
    // Modal 2 — Corrigir
    // ═══════════════════════════════════════════════════════════

    abrirModalCorrigir(numeroOS) {
        this._osAtual = numeroOS;
        const body = document.getElementById('auditoriaCorrigirBody');
        if (!body) return;

        const info = this._suspeitas.get(numeroOS);
        const rdoList = info ? info.rdos.map(r => escapeHtml(r['Número RDO'] || r.numeroRDO || '')).join('<br>') : '';

        body.innerHTML = `
            <div class="alert alert-warning py-2 small mb-3">
                <i class="fas fa-exclamation-triangle me-1"></i>
                Esta ação atualiza o campo <strong>Número OS</strong> em <strong>todos os RDOs e abas relacionadas</strong>
                (RDO, Serviços, HI, Efetivo, Equipamentos, Materiais, Transportes).
            </div>
            <div class="mb-3">
                <label class="form-label fw-bold">O.S atual (suspeita)</label>
                <input type="text" class="form-control form-control-sm bg-light" value="${escAttr(numeroOS)}" readonly>
            </div>
            <div class="mb-3">
                <label class="form-label fw-bold">Nova O.S <span class="text-danger">*</span></label>
                <input type="text" class="form-control form-control-sm" id="audCorrigirNovaOS"
                       placeholder="Ex: 998070 ou 1017755"
                       maxlength="7" autocomplete="off">
                <div class="invalid-feedback" id="audCorrigirErro"></div>
            </div>
            <div class="alert alert-info py-2 small">
                <i class="fas fa-list me-1"></i>
                <strong>${info ? info.rdos.length : 0} RDO(s) serão atualizados:</strong><br>
                <span class="font-monospace">${rdoList}</span>
            </div>`;

        if (!this._corrigirBound) {
            document.getElementById('auditoriaCorrigirBody').addEventListener('keydown', e => {
                if (e.key === 'Enter') this.confirmarCorrigir();
            });
            this._corrigirBound = true;
        }

        this._abrirModal('modalAuditoriaCorrigir');
        setTimeout(() => document.getElementById('audCorrigirNovaOS')?.focus(), 300);
    }

    async confirmarCorrigir() {
        const input = document.getElementById('audCorrigirNovaOS');
        const erroEl = document.getElementById('audCorrigirErro');
        const btn = document.getElementById('btnConfirmarCorrigir');
        if (!input || !this._osAtual) return;

        const novaOS = input.value.trim();
        input.classList.remove('is-invalid');

        // Validar
        if (!novaOS) {
            input.classList.add('is-invalid');
            if (erroEl) erroEl.textContent = 'Informe o novo número de O.S.';
            return;
        }
        if (typeof validarNumeroOS === 'function' && !validarNumeroOS(novaOS)) {
            input.classList.add('is-invalid');
            if (erroEl) erroEl.textContent = 'Formato inválido. Use 6 dígitos (98xxxx/99xxxx) ou 7 dígitos (100xxxx–199xxxx).';
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Atualizando...';

        try {
            const resp = await this._callAppsScript({
                acao: 'atualizarOSCascata',
                antigaOS: this._osAtual,
                novaOS: novaOS
            });

            if (!resp.sucesso) throw new Error(resp.erro || 'Erro desconhecido');

            // Patch em memória
            this._patchMemoriaCorrigir(this._osAtual, novaOS);

            // Re-sincronizar gestaoOS
            if (typeof gestaoOS !== 'undefined') {
                gestaoOS.carregarDados(this._rdos, this._servicos, this._hi, this._efetivos);
            }

            this._fecharModal('modalAuditoriaCorrigir');
            mostrarToast(`O.S ${this._osAtual} corrigida para ${novaOS} com sucesso.`, 'success');
            this._osAtual = null;
            this.atualizarBadge();

        } catch (e) {
            mostrarToast('Erro ao corrigir O.S: ' + e.message, 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check me-1"></i>Confirmar Correção'; }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Modal 3 — Dividir
    // ═══════════════════════════════════════════════════════════

    abrirModalDividir(numeroOS) {
        this._osAtual = numeroOS;
        this._rdoAtual = null;
        this._atrib = {};

        const info = this._suspeitas.get(numeroOS);
        if (!info) return;

        const body = document.getElementById('auditoriaDividirBody');
        if (!body) return;

        // Se múltiplos RDOs, mostrar seletor primeiro
        if (info.rdos.length > 1) {
            this._renderizarSeletorRDO(body, info.rdos);
        } else {
            this._rdoAtual = info.rdos[0];
            this._renderizarPainelDivisao(body, info);
        }

        if (!this._dividirBound) {
            body.addEventListener('click', e => {
                const btn = e.target.closest('[data-acao-div]');
                if (!btn) return;
                const acao = btn.dataset.acaoDiv;
                if (acao === 'selecionar-rdo') {
                    const rdoNum = btn.dataset.rdo;
                    const inf = this._suspeitas.get(this._osAtual);
                    this._rdoAtual = inf.rdos.find(r => (r['Número RDO'] || r.numeroRDO) === rdoNum);
                    this._renderizarPainelDivisao(body, inf);
                }
                if (acao === 'atribuir') {
                    this._atribuirItem(btn.dataset.key, btn.dataset.target);
                }
            });
            this._dividirBound = true;
        }

        this._abrirModal('modalAuditoriaDividir');
    }

    _renderizarSeletorRDO(body, rdos) {
        let html = `
            <div class="alert alert-info small">
                <i class="fas fa-info-circle me-1"></i>
                Esta O.S tem múltiplos RDOs. Selecione qual dividir:
            </div>
            <div class="list-group">`;
        rdos.forEach(rdo => {
            const rdoNum = escapeHtml(rdo['Número RDO'] || rdo.numeroRDO || '');
            const data   = escapeHtml(rdo['Data'] || rdo.data || '');
            const enc    = escapeHtml(rdo['Encarregado'] || rdo.encarregado || '');
            const rdoEsc = escAttr(rdo['Número RDO'] || rdo.numeroRDO || '');
            html += `
                <button class="list-group-item list-group-item-action"
                        data-acao-div="selecionar-rdo" data-rdo="${rdoEsc}">
                    <strong>${rdoNum}</strong>
                    <span class="text-muted ms-2">${data}</span>
                    <span class="text-muted ms-2">${enc}</span>
                </button>`;
        });
        html += `</div>`;
        body.innerHTML = html;
    }

    _renderizarPainelDivisao(body, info) {
        const rdo = this._rdoAtual;
        if (!rdo) return;

        const rdoId = rdo['Número RDO'] || rdo.numeroRDO || '';
        const servicosRDO = info.servicos.filter(s => (s['Número RDO'] || s.numeroRDO) === rdoId);
        const hiRDO       = info.hi.filter(h => (h['Número RDO'] || h.numeroRDO) === rdoId);

        // Gerar cards de serviços
        let svcHtml = '';
        servicosRDO.forEach((s, i) => {
            const desc = s['Descrição'] || s.descricao || '-';
            const qty  = s['Quantidade'] || s.quantidade || 0;
            const coef = s['Coeficiente'] || s.coeficiente || 0;
            const hh   = (parseFloat(qty) * parseFloat(coef)).toFixed(2);
            const key  = `svc_${i}_${escAttr(desc)}_${qty}_${coef}`;
            const keyEsc = escAttr(key);
            svcHtml += `
                <div class="d-flex align-items-center border rounded p-1 mb-1 small" id="audItem_${keyEsc}" data-hh="${hh}">
                    <span class="flex-grow-1">${escapeHtml(desc)} | ${escapeHtml(String(qty))} | ${hh} HH</span>
                    <span class="badge bg-secondary ms-1" id="audBadge_${keyEsc}">—</span>
                    <button class="btn btn-xs btn-outline-primary ms-1 py-0 px-1"
                            data-acao-div="atribuir" data-key="${keyEsc}" data-target="os1">OS1</button>
                    <button class="btn btn-xs btn-outline-warning ms-1 py-0 px-1"
                            data-acao-div="atribuir" data-key="${keyEsc}" data-target="os2">OS2</button>
                </div>`;
        });

        // Gerar cards de HI
        let hiHtml = '';
        hiRDO.forEach((h, i) => {
            const tipo  = h['Tipo'] || h.tipo || '-';
            const desc  = h['Descrição'] || h.descricao || '-';
            const ini   = h['Hora Início'] || h.horaInicio || '-';
            const fim   = h['Hora Fim'] || h.horaFim || '-';
            const hh    = (parseFloat(h.hhImprodutivas || h['HH Improdutivas'] || 0)).toFixed(2);
            const key   = `hi_${i}_${escAttr(tipo)}_${ini}_${fim}`;
            const keyEsc = escAttr(key);
            hiHtml += `
                <div class="d-flex align-items-center border rounded p-1 mb-1 small" id="audItem_${keyEsc}" data-hh="${hh}">
                    <span class="flex-grow-1">${escapeHtml(tipo)} | ${escapeHtml(desc)} | ${escapeHtml(ini)}–${escapeHtml(fim)} | ${hh} HH</span>
                    <span class="badge bg-secondary ms-1" id="audBadge_${keyEsc}">—</span>
                    <button class="btn btn-xs btn-outline-primary ms-1 py-0 px-1"
                            data-acao-div="atribuir" data-key="${keyEsc}" data-target="os1">OS1</button>
                    <button class="btn btn-xs btn-outline-warning ms-1 py-0 px-1"
                            data-acao-div="atribuir" data-key="${keyEsc}" data-target="os2">OS2</button>
                </div>`;
        });

        body.innerHTML = `
            <div class="row g-2 mb-3">
                <div class="col-6">
                    <label class="form-label fw-bold small">OS1 — fica no RDO original <span class="text-danger">*</span></label>
                    <input type="text" class="form-control form-control-sm" id="audDividirOS1"
                           maxlength="7" placeholder="Ex: 998070" autocomplete="off">
                </div>
                <div class="col-6">
                    <label class="form-label fw-bold small">OS2 — novo RDO clonado <span class="text-danger">*</span></label>
                    <input type="text" class="form-control form-control-sm" id="audDividirOS2"
                           maxlength="7" placeholder="Ex: 998071" autocomplete="off">
                </div>
            </div>
            <div class="alert alert-info py-2 small mb-3">
                <i class="fas fa-info-circle me-1"></i>
                Atribua cada item a OS1 ou OS2. Itens sem atribuição ficam em OS1.
                RDO: <strong>${escapeHtml(rdoId)}</strong>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2 small">
                <div>
                    <span class="badge bg-primary me-1" id="audOS1HH">OS1: 0.00 HH</span>
                    <span class="badge bg-warning text-dark" id="audOS2HH">OS2: 0.00 HH</span>
                </div>
                <div class="text-muted" id="audAtribCount">0 de ${servicosRDO.length + hiRDO.length} item(s) atribuído(s)</div>
            </div>
            ${servicosRDO.length > 0 ? `<h6 class="small fw-bold">Serviços (${servicosRDO.length})</h6>${svcHtml}` : ''}
            ${hiRDO.length > 0 ? `<h6 class="small fw-bold mt-2">Horas Improdutivas (${hiRDO.length})</h6>${hiHtml}` : ''}
            ${servicosRDO.length === 0 && hiRDO.length === 0 ? '<p class="text-muted small">Nenhum serviço ou HI encontrado para este RDO.</p>' : ''}
        `;
    }

    _atribuirItem(itemKey, target) {
        this._atrib[itemKey] = target;
        const el    = document.getElementById('audItem_' + itemKey);
        const badge = document.getElementById('audBadge_' + itemKey);
        if (el) {
            el.style.borderColor = target === 'os1' ? '#0d6efd' : '#ffc107';
            el.style.backgroundColor = target === 'os1' ? '#f0f5ff' : '#fffbf0';
        }
        if (badge) {
            badge.className = target === 'os1' ? 'badge bg-primary ms-1' : 'badge bg-warning text-dark ms-1';
            badge.textContent = target === 'os1' ? 'OS1' : 'OS2';
        }
        this._atualizarResumoHH();
    }

    _atualizarResumoHH() {
        let hhOS1 = 0, hhOS2 = 0, atribuidos = 0;
        document.querySelectorAll('[id^="audItem_"]').forEach(el => {
            const key = el.id.replace('audItem_', '');
            const hh  = parseFloat(el.dataset.hh) || 0;
            const target = this._atrib[key];
            if (target === 'os2') hhOS2 += hh;
            else hhOS1 += hh; // padrão: os1
            if (target) atribuidos++;
        });
        const os1El = document.getElementById('audOS1HH');
        const os2El = document.getElementById('audOS2HH');
        const countEl = document.getElementById('audAtribCount');
        const total = document.querySelectorAll('[id^="audItem_"]').length;
        if (os1El) os1El.textContent = `OS1: ${hhOS1.toFixed(2)} HH`;
        if (os2El) os2El.textContent = `OS2: ${hhOS2.toFixed(2)} HH`;
        if (countEl) countEl.textContent = `${atribuidos} de ${total} item(s) atribuído(s)`;
    }

    async confirmarDividir() {
        const os1Input = document.getElementById('audDividirOS1');
        const os2Input = document.getElementById('audDividirOS2');
        const btn = document.getElementById('btnConfirmarDividir');
        if (!os1Input || !os2Input || !this._rdoAtual) return;

        const os1 = os1Input.value.trim();
        const os2 = os2Input.value.trim();

        // Validar OS1 e OS2
        os1Input.classList.remove('is-invalid');
        os2Input.classList.remove('is-invalid');
        let valido = true;

        if (!os1 || (typeof validarNumeroOS === 'function' && !validarNumeroOS(os1))) {
            os1Input.classList.add('is-invalid'); valido = false;
        }
        if (!os2 || (typeof validarNumeroOS === 'function' && !validarNumeroOS(os2))) {
            os2Input.classList.add('is-invalid'); valido = false;
        }
        if (!valido) { mostrarToast('Verifique os números de O.S informados.', 'warning'); return; }
        if (os1 === os2) { mostrarToast('OS1 e OS2 devem ser diferentes.', 'warning'); return; }

        // Verificar itens sem atribuição
        const totalItens = document.querySelectorAll('[id^="audItem_"]').length;
        const atribuidos = Object.keys(this._atrib).length;
        const semAtrib   = totalItens - atribuidos;

        if (semAtrib > 0) {
            const ok = confirm(`${semAtrib} item(s) sem atribuição serão mantidos em OS1 (${os1}). Confirmar?`);
            if (!ok) return;
        }

        // Montar payload
        const rdoId = this._rdoAtual['Número RDO'] || this._rdoAtual.numeroRDO;
        const info  = this._suspeitas.get(this._osAtual);
        const svcRDO = info.servicos.filter(s => (s['Número RDO'] || s.numeroRDO) === rdoId);
        const hiRDO  = info.hi.filter(h => (h['Número RDO'] || h.numeroRDO) === rdoId);

        const servicosOS2 = [];
        const hiOS2       = [];
        const movimentacao = [];

        // Mapear keys de atribuição de volta para dados reais
        document.querySelectorAll('[id^="audItem_"]').forEach(el => {
            const key = el.id.replace('audItem_', '');
            if (this._atrib[key] !== 'os2') return;

            if (key.startsWith('svc_')) {
                // key = "svc_i_desc_qty_coef"
                const parts = key.replace('svc_', '').split('_');
                const idx = parseInt(parts[0]);
                const svc = svcRDO[idx];
                if (svc) {
                    const desc = (svc['Descrição'] || svc.descricao || '').trim();
                    const qty  = String(svc['Quantidade'] || svc.quantidade || '').trim();
                    const coef = String(svc['Coeficiente'] || svc.coeficiente || '').trim();
                    servicosOS2.push(`${desc}|${qty}|${coef}`);
                    movimentacao.push({ tipo: 'servico', chave: `${desc}|${qty}|${coef}`,
                                        descricao: desc, hh: parseFloat(el.dataset.hh) || 0 });
                }
            } else if (key.startsWith('hi_')) {
                const parts = key.replace('hi_', '').split('_');
                const idx = parseInt(parts[0]);
                const hi = hiRDO[idx];
                if (hi) {
                    const data = (hi['Data RDO'] || hi.dataRDO || '').trim();
                    const tipo = (hi['Tipo'] || hi.tipo || '').trim();
                    const ini  = (hi['Hora Início'] || hi.horaInicio || '').trim();
                    const fim  = (hi['Hora Fim'] || hi.horaFim || '').trim();
                    const ops  = String(hi['Operadores'] || hi.operadores || '').trim();
                    hiOS2.push(`${data}|${tipo}|${ini}|${fim}|${ops}`);
                    movimentacao.push({ tipo: 'hi', chave: `${data}|${tipo}|${ini}|${fim}|${ops}`,
                                        descricao: `${tipo} ${ini}–${fim}`, hh: parseFloat(el.dataset.hh) || 0 });
                }
            }
        });

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Dividindo...';

        try {
            const resp = await this._callAppsScript({
                acao: 'dividirOS',
                numeroRDO: rdoId,
                os1, os2,
                servicosOS2, hiOS2, movimentacao
            });

            if (!resp.sucesso) throw new Error(resp.erro || 'Erro desconhecido');

            // Patch em memória: atualizar OS do RDO original
            const rdoMem = this._rdos.find(r => (r['Número RDO'] || r.numeroRDO) === rdoId);
            if (rdoMem) { rdoMem['Número OS'] = os1; rdoMem.numeroOS = os1; }

            this._detectarSuspeitas();
            this.atualizarBadge();

            if (typeof gestaoOS !== 'undefined') {
                gestaoOS.carregarDados(this._rdos, this._servicos, this._hi, this._efetivos);
            }

            this._fecharModal('modalAuditoriaDividir');
            mostrarToast(
                `O.S dividida! RDO original (${escapeHtml(rdoId)}) ficou com OS1=${os1}. ` +
                `Novo RDO ${escapeHtml(resp.novoNumeroRDO || '')} criado para OS2=${os2}. ` +
                `Recarregue os dados para ver o novo RDO.`,
                'success', 8000
            );

        } catch (e) {
            mostrarToast('Erro ao dividir O.S: ' + e.message, 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-code-branch me-1"></i>Confirmar Divisão'; }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Ignorar
    // ═══════════════════════════════════════════════════════════

    ignorarOS(numeroOS) {
        const info = this._suspeitas.get(numeroOS);
        const registro = {
            numeroOS,
            rdoIds: info ? info.rdos.map(r => r['Número RDO'] || r.numeroRDO) : [],
            datas:  info ? info.rdos.map(r => r['Data'] || r.data) : [],
            motivo: info ? info.nivel : '',
            ignoradoEm: Date.now()
        };
        try {
            localStorage.setItem('osAuditoria_ignorada_' + numeroOS, JSON.stringify(registro));
        } catch (e) { /* localStorage cheio */ }

        this._suspeitas.delete(numeroOS);
        this.atualizarBadge();

        // Re-renderizar lista se modal estiver aberto
        const modal = document.getElementById('modalAuditoriaLista');
        if (modal && modal.classList.contains('show')) {
            this._listaBound = false; // permite re-bind
            this.abrirModalLista();
        }
    }

    _getDismissedCount() {
        let count = 0;
        for (let i = 0; i < localStorage.length; i++) {
            if (localStorage.key(i)?.startsWith('osAuditoria_ignorada_')) count++;
        }
        return count;
    }

    abrirRevisarIgnoradas() {
        const ignoradas = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith('osAuditoria_ignorada_')) continue;
            try {
                const val = JSON.parse(localStorage.getItem(key));
                ignoradas.push(val);
            } catch (e) {
                ignoradas.push({ numeroOS: key.replace('osAuditoria_ignorada_', '') });
            }
        }

        if (ignoradas.length === 0) {
            mostrarToast('Nenhuma O.S ignorada.', 'info');
            return;
        }

        // Usar modal da lista para exibir ignoradas temporariamente
        const body = document.getElementById('auditoriaListaBody');
        if (!body) return;

        let html = `
            <div class="alert alert-secondary py-2 small mb-2">
                <i class="fas fa-eye-slash me-1"></i>O.S que foram ignoradas. Restaure para que apareçam na auditoria novamente.
            </div>
            <table class="table table-sm">
                <thead><tr><th>O.S</th><th>Motivo</th><th># RDOs</th><th>Ignorada em</th><th></th></tr></thead>
                <tbody>`;

        ignoradas.forEach(reg => {
            const osEsc = escAttr(reg.numeroOS || '');
            const data  = reg.ignoradoEm ? new Date(reg.ignoradoEm).toLocaleDateString('pt-BR') : '-';
            html += `
                <tr>
                    <td>${escapeHtml(reg.numeroOS || '')}</td>
                    <td class="small text-muted">${escapeHtml(reg.motivo || '-')}</td>
                    <td class="text-center">${(reg.rdoIds || []).length}</td>
                    <td class="small">${data}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-success py-0"
                                data-acao="restaurar" data-os="${osEsc}">
                            <i class="fas fa-undo me-1"></i>Restaurar
                        </button>
                    </td>
                </tr>`;
        });
        html += `</tbody></table>
            <button class="btn btn-sm btn-link p-0" data-acao="voltar-lista">
                <i class="fas fa-arrow-left me-1"></i>Voltar à lista
            </button>`;

        body.innerHTML = html;

        // Handler para restaurar / voltar
        const handler = e => {
            const btn = e.target.closest('[data-acao]');
            if (!btn) return;
            if (btn.dataset.acao === 'restaurar') {
                const os = btn.dataset.os;
                localStorage.removeItem('osAuditoria_ignorada_' + os);
                this._detectarSuspeitas();
                this.atualizarBadge();
                btn.closest('tr')?.remove();
                mostrarToast(`O.S ${escapeHtml(os)} restaurada.`, 'success');
            }
            if (btn.dataset.acao === 'voltar-lista') {
                body.removeEventListener('click', handler);
                this._listaBound = false;
                this.abrirModalLista();
            }
        };
        body.addEventListener('click', handler);
    }

    // ═══════════════════════════════════════════════════════════
    // Patch em memória
    // ═══════════════════════════════════════════════════════════

    _patchMemoriaCorrigir(antigaOS, novaOS) {
        const atualizar = arr => arr.forEach(item => {
            if ((item['Número OS'] || '').toString().trim() === antigaOS)
                item['Número OS'] = novaOS;
            if ((item.numeroOS || '').toString().trim() === antigaOS)
                item.numeroOS = novaOS;
        });
        atualizar(this._rdos);
        atualizar(this._servicos);
        atualizar(this._hi);
        this._detectarSuspeitas();
    }

    // ═══════════════════════════════════════════════════════════
    // Comunicação com Apps Script
    // ═══════════════════════════════════════════════════════════

    async _callAppsScript(payload, timeoutMs = 30000) {
        const url = (typeof _appsScriptUrl === 'function') ? _appsScriptUrl() : null;
        if (!url) throw new Error('URL do Apps Script não configurada.');

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const resp = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            return await resp.json();
        } finally {
            clearTimeout(timer);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Utilitários de modal
    // ═══════════════════════════════════════════════════════════

    _abrirModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        let instance = bootstrap.Modal.getInstance(el);
        if (!instance) instance = new bootstrap.Modal(el);
        instance.show();
    }

    _fecharModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        const instance = bootstrap.Modal.getInstance(el);
        if (instance) instance.hide();
    }
}

// Instância global
const osAuditoria = new OSAuditoria();
