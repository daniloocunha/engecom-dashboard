/**
 * Gestão de O.S Trabalhadas — v3.0.19
 * Lista compacta por turma (somente TPs/TSs — TMCs excluídas)
 * Status, GeVia, Notas múltiplas, Já Mediu e Anexos salvos em localStorage + servidor
 *
 * Changelog v3.0.17:
 * - Fix CORS definitivo: todas as chamadas ao Apps Script passam pelo proxy
 *   do Cloudflare Worker (/api/apps-script) — servidor→servidor, sem CORS.
 *   Em desenvolvimento local continua usando CONFIG.APPS_SCRIPT_URL diretamente.
 *
 * Changelog v3.0.14 (merge epic-fermat + feat/melhorias-revisao-codigo):
 * - Feature 1: Coluna "Já Mediu" com toggle visual (○ Não / ✅ Sim) por O.S
 * - Feature 2: Notas múltiplas — lista de anotações por O.S (add/edit/delete)
 *   - Migração automática do formato antigo (string única → array JSON)
 *   - Array serializado como JSON na sincronização com servidor
 * - Feature 3: Anexos de PDF e fotos via Google Drive (Apps Script)
 *   - Upload base64 → Apps Script → Drive; URLs salvas em localStorage
 *   - Requer APPS_SCRIPT_URL e (opcionalmente) DRIVE_FOLDER_ID em config.js
 * - Feature 4: HI com sobreposição de horários — parciais (ops < 12) têm suas
 *   horas sobrepostas com completos (ops >= 12) descontadas do cálculo
 * - Mantidos: server sync cross-device, 6 status, LocalStorage ↔ servidor
 */

'use strict';

// ─── Helpers ────────────────────────────────────────────────────────────────

function _esc(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

/** Escapa para uso dentro de atributos HTML (garante que " e ' não quebrem o atributo) */
function _escAttr(text) {
    return _esc(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Exibe uma mensagem de erro temporária via Toast Bootstrap (sem bloquear a UI) */
function _mostrarToastErro(msg) {
    const id = 'toast-gestao-os-' + Date.now();
    const toastHTML = `
    <div id="${id}" class="toast align-items-center text-bg-danger border-0 position-fixed bottom-0 end-0 m-3"
         role="alert" style="z-index:9999;max-width:380px;" data-bs-delay="6000">
      <div class="d-flex">
        <div class="toast-body"><i class="fas fa-exclamation-circle me-2"></i>${_esc(msg)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', toastHTML);
    const el = document.getElementById(id);
    if (el && typeof bootstrap !== 'undefined') {
        const t = new bootstrap.Toast(el);
        t.show();
        el.addEventListener('hidden.bs.toast', () => el.remove(), { once: true });
    } else {
        console.error('[GestaoOS]', msg);
        alert(msg);
    }
}

function _parseData(str) {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length < 3) return null; // formato inválido (ex: ISO 2026-03-23)
    const [d, m, y] = parts;
    if (!y) return null;
    const year = y.length === 2 ? 2000 + +y : +y;
    return new Date(year, +m - 1, +d);
}

function _fmtData(str) {
    if (!str || str === '-') return '-';
    const p = str.split('/');
    if (p.length === 3) return `${p[0]}/${p[1]}/${p[2].slice(-2)}`;
    return str;
}

/** Retorna true se a turma for TMC (excluída desta aba) */
function _isTMC(turma) {
    return turma.toUpperCase().startsWith('TMC');
}

/** Cores de fundo de linha/célula por status (fonte única) */
const STATUS_ROW_COLORS = {
    'Aprovada':              '#e8f4ff',  // azul claro
    'Finalizada':            '#d4edda',  // verde claro
    'Em Progresso':          '#fff9e6',  // amarelo muito claro
    'Reprovada':             '#fde8e8',  // vermelho claro
    'Aguardando Auditoria':  '#fff0e0',  // laranja claro
    'Erro de preenchimento': '#f5e8ff'   // roxo claro
};

/** Opções do select de status com ícones (fonte única) */
const STATUS_OPTS = [
    { val: 'Em Progresso',          icon: '🟡' },
    { val: 'Aprovada',              icon: '🔵' },
    { val: 'Finalizada',            icon: '🟢' },
    { val: 'Reprovada',             icon: '🔴' },
    { val: 'Aguardando Auditoria',  icon: '🟠' },
    { val: 'Erro de preenchimento', icon: '🟣' }
];

/**
 * Converte string de KM para número (metros) para comparação correta.
 * Suporta formato de estacamento ferroviário "123+456" e números simples.
 * Retorna null se o valor não for parseável.
 */
function _kmToNum(kmStr) {
    if (!kmStr) return null;
    const s = String(kmStr).trim().replace(',', '.');
    const match = s.match(/^(\d+)\+(\d+)$/);  // formato 123+456
    if (match) return parseInt(match[1]) * 1000 + parseInt(match[2]);
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

/**
 * Normaliza o status que vem da planilha para o sistema de 4 estados.
 * 'Concluída' / 'Concluida' da planilha → 'Finalizada'
 * Qualquer outra coisa → 'Em Progresso'
 */
function _normalizarStatusPlanilha(statusRDO) {
    const s = (statusRDO || '').toLowerCase().trim();
    if (s.includes('conclu') || s.includes('finaliz')) return 'Finalizada';
    return 'Em Progresso';
}

/**
 * Retorna a URL de endpoint do Apps Script.
 *
 * Em produção (Cloudflare Workers), usa o proxy reverso local /api/apps-script
 * para evitar erros de CORS — o Worker encaminha a requisição servidor→servidor.
 *
 * Em desenvolvimento local (localhost/127.0.0.1), usa CONFIG.APPS_SCRIPT_URL
 * diretamente (adicione a URL real em js/config.js para testar localmente).
 */
function _appsScriptUrl() {
    const isLocal = typeof location !== 'undefined' &&
        (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    if (!isLocal) {
        return '/api/apps-script';  // proxy do Cloudflare Worker — sem CORS
    }
    return (typeof CONFIG !== 'undefined' && CONFIG.APPS_SCRIPT_URL)
        ? CONFIG.APPS_SCRIPT_URL
        : '';
}

// ─── Classe principal ────────────────────────────────────────────────────────

class GestaoOS {
    constructor() {
        this.dados = null;
        this.filtroStatus = 'todas';
        this.filtroMes = null;
        this.filtroAno = null;
        this._grupos = null; // cache para uso no modal
        this._dadosServidor      = {}; // { [numeroOS]: { status, gevia, nota } }
        this._servidorCarregado  = false;
        this._carregandoServidor = false;
        this._debounceTimers     = {}; // { [numeroOS]: timeoutId } — evita burst de requests
    }

    // ── Dados ─────────────────────────────────────────────────────────────

    carregarDados(rdos, servicos, horasImprodutivas, efetivos) {
        this.dados = {
            rdos: rdos || [],
            servicos: servicos || [],
            horasImprodutivas: horasImprodutivas || []
        };
        debugLog('[GestaoOS] Dados carregados:', {
            rdos: this.dados.rdos.length,
            servicos: this.dados.servicos.length,
            hi: this.dados.horasImprodutivas.length
        });
        // Carregar dados persistidos do servidor (async, re-renderiza quando completo)
        if (!this._servidorCarregado && !this._carregandoServidor) {
            this._carregandoServidor = true;
            this._carregarDoServidor();
        }
    }

    setFiltros(mes, ano) {
        this.filtroMes = mes;
        this.filtroAno = ano;
    }

    // ── Status (servidor → localStorage → planilha) ────────────────────────

    /**
     * Retorna o status: prioridade servidor > localStorage > planilha.
     */
    getStatus(grupo) {
        const sv = this._dadosServidor[grupo.numeroOS];
        if (sv && sv.status) return sv.status;
        const salvo = localStorage.getItem('gestaoOS_status_' + grupo.numeroOS);
        return salvo || grupo.statusPlanilha;
    }

    /** Salva status localmente, no cache e no servidor; atualiza a UI */
    setStatus(numeroOS, valor) {
        if (!this._dadosServidor[numeroOS]) this._dadosServidor[numeroOS] = {};
        if (!valor) {
            localStorage.removeItem('gestaoOS_status_' + numeroOS);
            delete this._dadosServidor[numeroOS].status;
        } else {
            try { localStorage.setItem('gestaoOS_status_' + numeroOS, valor); } catch (e) { /* quota/privado */ }
            this._dadosServidor[numeroOS].status = valor;
        }
        // Persistir no servidor em background
        this._salvarNoServidor(numeroOS);

        // Atualiza cor da linha inteira
        this._atualizarCorLinha(numeroOS, valor);

        // Atualiza o select dentro da célula (sem re-renderizar a linha)
        const cel = document.getElementById(`status-cel-${CSS.escape(numeroOS)}`);
        if (cel) {
            let grupo = null;
            this._grupos?.forEach(gt => { if (gt.ordens.has(numeroOS)) grupo = gt.ordens.get(numeroOS); });
            if (grupo) cel.innerHTML = this._statusSelectHTML(grupo);
        }

        // Atualiza badge + select no modal se aberto
        const modalOsId = numeroOS.replace(/[^a-zA-Z0-9]/g, '_');
        const badge = document.getElementById(`statusBadge_${modalOsId}`);
        if (badge) {
            const cfg = this._statusConfig(valor);
            badge.className = 'badge ms-2';
            badge.style.backgroundColor = cfg.badge;
            badge.style.color = cfg.badgeText;
            badge.textContent = valor;
        }
        this._atualizarStatusModal(numeroOS, modalOsId);
        this._atualizarResumo();
    }

    /** Aplica cor de fundo à linha <tr> com base no status */
    _atualizarCorLinha(numeroOS, status) {
        const cel = document.getElementById(`status-cel-${CSS.escape(numeroOS)}`);
        const tr  = cel?.closest('tr');
        if (!tr) return;
        tr.style.backgroundColor = STATUS_ROW_COLORS[status] || '';
        tr.style.transition = 'background-color 0.2s ease';
    }

    _statusConfig(status) {
        switch ((status || '').trim()) {
            case 'Aprovada':              return { cls: 'primary', bg: '#cfe2ff', badge: '#0d6efd', badgeText: '#fff' };
            case 'Finalizada':            return { cls: 'success', bg: '#d1e7dd', badge: '#198754', badgeText: '#fff' };
            case 'Reprovada':             return { cls: 'danger',  bg: '#f8d7da', badge: '#dc3545', badgeText: '#fff' };
            case 'Aguardando Auditoria':  return { cls: '',        bg: '#ffe8cc', badge: '#fd7e14', badgeText: '#fff' };
            case 'Erro de preenchimento': return { cls: '',        bg: '#f0d9ff', badge: '#7c3aed', badgeText: '#fff' };
            default:                      return { cls: 'warning', bg: '#fff3cd', badge: '#cc9900', badgeText: '#000' };
        }
    }

    /** Retorna o <select> de status para a tabela (dentro da célula) */
    _statusSelectHTML(grupo) {
        const status = this.getStatus(grupo);
        const osEsc  = _escAttr(grupo.numeroOS);
        const optionsHTML = STATUS_OPTS.map(o =>
            `<option value="${o.val}" ${status === o.val ? 'selected' : ''}>${o.icon} ${o.val}</option>`
        ).join('');

        const cfg        = this._statusConfig(status);
        const borderStyle = cfg.cls ? `border-${cfg.cls}` : '';
        const extraStyle  = cfg.cls ? '' : `border-color:${cfg.badge};`;

        return `<select class="form-select form-select-sm fw-bold ${borderStyle}"
                         style="font-size:0.75rem;min-width:155px;background-color:${cfg.bg};cursor:pointer;${extraStyle}"
                         onchange="event.stopPropagation();gestaoOS.setStatus('${osEsc}', this.value)"
                         onclick="event.stopPropagation()">
                  ${optionsHTML}
                </select>`;
    }

    /** Retorna o <select> de status para dentro do modal */
    _statusModalHTML(grupo, modalOsId) {
        const status = this.getStatus(grupo);
        const osEsc  = _escAttr(grupo.numeroOS);
        const optionsHTML = STATUS_OPTS.map(o =>
            `<option value="${o.val}" ${status === o.val ? 'selected' : ''}>${o.icon} ${o.val}</option>`
        ).join('');
        const cfg         = this._statusConfig(status);
        const borderClass = cfg.cls ? `border-${cfg.cls}` : '';
        const extraStyle  = cfg.cls ? '' : `border-color:${cfg.badge};`;

        return `<select id="statusModal_${modalOsId}"
                         class="form-select form-select-sm fw-bold ${borderClass} w-100"
                         style="background-color:${cfg.bg};font-size:0.85rem;${extraStyle}"
                         onchange="gestaoOS.setStatus('${osEsc}', this.value);gestaoOS._atualizarStatusModal('${osEsc}','${modalOsId}')">
                  ${optionsHTML}
                </select>
                <div class="text-muted mt-1" style="font-size:0.68rem;">
                  Planilha: ${_esc(grupo.statusPlanilha)}
                </div>`;
    }

    /** Atualiza visual do select de status dentro do modal após mudança */
    _atualizarStatusModal(numeroOS, modalOsId) {
        let grupo = null;
        this._grupos?.forEach(gt => { if (gt.ordens.has(numeroOS)) grupo = gt.ordens.get(numeroOS); });
        if (!grupo) return;

        const status      = this.getStatus(grupo);
        const cfg         = this._statusConfig(status);
        const borderClass = cfg.cls ? `border-${cfg.cls}` : '';

        const sel = document.getElementById(`statusModal_${modalOsId}`);
        if (sel) {
            sel.className = `form-select form-select-sm fw-bold ${borderClass} w-100`;
            sel.style.backgroundColor = cfg.bg;
            sel.style.borderColor = cfg.cls ? '' : cfg.badge;
        }
        // Atualiza badge no header do modal
        const badge = document.getElementById(`statusBadge_${modalOsId}`);
        if (badge) {
            badge.className = 'badge ms-2';
            badge.style.backgroundColor = cfg.badge;
            badge.style.color = cfg.badgeText;
            badge.textContent = status;
        }
    }

    _atualizarResumo() {
        if (!this._grupos) return;
        let total = 0, concluidas = 0, reprovadas = 0, gevia = 0, mediu = 0;
        this._grupos.forEach(gt => {
            gt.ordens.forEach(go => {
                if (this.filtroStatus && this.filtroStatus !== 'todas') {
                    if (this.getStatus(go) !== this.filtroStatus) return;
                }
                total++;
                const s = this.getStatus(go);
                if (s === 'Finalizada' || s === 'Aprovada') concluidas++;
                if (s === 'Reprovada') reprovadas++;
                if (this.getGeVia(go.numeroOS) === 'Lançado') gevia++;
                if (this.getMediu(go.numeroOS)) mediu++;
            });
        });
        const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        el('resumoOS_concluidas', concluidas);
        el('resumoOS_andamento',  total - concluidas - reprovadas);
        el('resumoOS_reprovadas', reprovadas);
        el('resumoOS_gevia',      gevia);
        el('resumoOS_mediu',      mediu);
    }

    // ── GeVia (servidor → localStorage) ──────────────────────────────────

    getGeVia(numeroOS) {
        const sv = this._dadosServidor[numeroOS];
        if (sv && sv.gevia) return sv.gevia;
        return localStorage.getItem('gestaoOS_gevia_' + numeroOS) || 'Pendente';
    }

    setGeVia(numeroOS, valor) {
        if (!this._dadosServidor[numeroOS]) this._dadosServidor[numeroOS] = {};
        if (!valor || valor === 'Pendente') {
            localStorage.removeItem('gestaoOS_gevia_' + numeroOS);
            this._dadosServidor[numeroOS].gevia = 'Pendente';
        } else {
            try { localStorage.setItem('gestaoOS_gevia_' + numeroOS, valor); } catch (e) { /* quota/privado */ }
            this._dadosServidor[numeroOS].gevia = valor;
        }
        this._salvarNoServidor(numeroOS);
        const cel = document.getElementById(`gevia-cel-${CSS.escape(numeroOS)}`);
        if (cel) cel.innerHTML = this._geviaHTML(numeroOS);
        const badge = document.getElementById(`geviaBadge_${numeroOS.replace(/[^a-zA-Z0-9]/g, '_')}`);
        if (badge) badge.outerHTML = this._geviaBadgeHTML(numeroOS, numeroOS.replace(/[^a-zA-Z0-9]/g, '_'));
        this._atualizarResumo();
    }

    _geviaHTML(numeroOS) {
        const valor = this.getGeVia(numeroOS);
        const osEsc = _escAttr(numeroOS);
        return `<select class="form-select form-select-sm border-primary text-primary fw-bold"
                         style="font-size:0.75rem;min-width:95px;background-color:#e7f0ff;cursor:pointer;"
                         onchange="event.stopPropagation();gestaoOS.setGeVia('${osEsc}', this.value)"
                         onclick="event.stopPropagation()">
                  <option value="Pendente" ${valor === 'Pendente' ? 'selected' : ''}>○ Pendente</option>
                  <option value="Parcial"  ${valor === 'Parcial'  ? 'selected' : ''}>◑ Parcial</option>
                  <option value="Lançado"  ${valor === 'Lançado'  ? 'selected' : ''}>✔ Lançado</option>
                </select>`;
    }

    _geviaBadgeHTML(numeroOS, modalOsId) {
        const valor = this.getGeVia(numeroOS);
        const osEsc = _escAttr(numeroOS);
        return `<select id="geviaBadge_${modalOsId}"
                         class="form-select form-select-sm border-primary text-primary fw-bold d-inline-block"
                         style="width:auto;background-color:#e7f0ff;font-size:0.8rem;"
                         onchange="gestaoOS.setGeVia('${osEsc}', this.value)">
                  <option value="Pendente" ${valor === 'Pendente' ? 'selected' : ''}>○ Pendente</option>
                  <option value="Parcial"  ${valor === 'Parcial'  ? 'selected' : ''}>◑ Parcial</option>
                  <option value="Lançado"  ${valor === 'Lançado'  ? 'selected' : ''}>✔ Lançado</option>
                </select>`;
    }

    // ── Já Mediu ───────────────────────────────────────────────────────────

    getMediu(numeroOS) {
        // Preferir valor local (mais recente); fallback para servidor
        const local = localStorage.getItem('gestaoOS_mediu_' + numeroOS);
        if (local !== null) return local === 'sim';
        const sv = this._dadosServidor?.[numeroOS];
        return sv?.mediu === 'sim';
    }

    setMediu(numeroOS, valor) {
        if (valor) {
            try { localStorage.setItem('gestaoOS_mediu_' + numeroOS, 'sim'); } catch (e) { /* quota/privado */ }
        } else {
            localStorage.removeItem('gestaoOS_mediu_' + numeroOS);
        }
        // Atualizar cache em memória
        if (!this._dadosServidor[numeroOS]) this._dadosServidor[numeroOS] = {};
        this._dadosServidor[numeroOS].mediu = valor ? 'sim' : 'nao';
        // Sincronizar com servidor para que outros dispositivos vejam o estado atualizado
        this._salvarNoServidor(numeroOS);
        const cel = document.getElementById(`mediu-cel-${CSS.escape(numeroOS)}`);
        if (cel) cel.innerHTML = this._mediuHTML(numeroOS);
        this._atualizarResumo();
    }

    _mediuHTML(numeroOS) {
        const mediu = this.getMediu(numeroOS);
        const osEsc = _escAttr(numeroOS);
        if (mediu) {
            return `<button class="btn btn-sm btn-success py-0 px-1"
                        onclick="event.stopPropagation();gestaoOS.setMediu('${osEsc}', false)"
                        title="Clique para desmarcar" style="font-size:0.78rem;white-space:nowrap;">
                      ✅ Sim
                    </button>`;
        }
        return `<button class="btn btn-sm btn-outline-secondary py-0 px-1"
                    onclick="event.stopPropagation();gestaoOS.setMediu('${osEsc}', true)"
                    title="Clique para marcar como medido" style="font-size:0.78rem;white-space:nowrap;">
                  ○ Não
                </button>`;
    }

    // ── Notas múltiplas (Feature 2) — localStorage + servidor ─────────────

    /**
     * Retorna o array de notas. Prioridade: servidor > localStorage (notas) > localStorage (nota antiga).
     * Migração automática de formato antigo (string → array).
     */
    getNotas(numeroOS) {
        // 1. Verificar cache do servidor (pode ser JSON array como string)
        const sv = this._dadosServidor[numeroOS];
        if (sv && sv.nota !== undefined && sv.nota !== '') {
            if (typeof sv.nota === 'string' && sv.nota.startsWith('[')) {
                try { return JSON.parse(sv.nota); } catch { return [sv.nota]; }
            }
            return sv.nota ? [sv.nota] : [];
        }
        // 2. localStorage novo formato (array JSON)
        const json = localStorage.getItem('gestaoOS_notas_' + numeroOS);
        if (json !== null) {
            try { return JSON.parse(json); } catch { return []; }
        }
        // 3. Migração: formato antigo (string única) → array
        const old = localStorage.getItem('gestaoOS_nota_' + numeroOS);
        if (old) {
            const arr = [old];
            this.setNotas(numeroOS, arr);
            localStorage.removeItem('gestaoOS_nota_' + numeroOS);
            return arr;
        }
        return [];
    }

    /** Salva o array de notas em localStorage e sincroniza com servidor */
    setNotas(numeroOS, arr) {
        if (!this._dadosServidor[numeroOS]) this._dadosServidor[numeroOS] = {};
        const notaStr = (arr && arr.length > 0) ? JSON.stringify(arr) : '';
        this._dadosServidor[numeroOS].nota = notaStr;
        if (!arr || arr.length === 0) {
            localStorage.removeItem('gestaoOS_notas_' + numeroOS);
        } else {
            try { localStorage.setItem('gestaoOS_notas_' + numeroOS, notaStr); } catch (e) { /* quota/privado */ }
        }
        this._salvarNoServidor(numeroOS);
    }

    _notaHTML(numeroOS) {
        const notas = this.getNotas(numeroOS);
        const n = notas.length;
        const title = n > 0 ? _escAttr(notas[0].slice(0, 80)) + (n > 1 ? ` (+${n - 1})` : '') : 'Adicionar anotação';
        const label = n > 0 ? `📝 ${n}` : '➕';
        return `<button class="btn btn-sm btn-outline-secondary py-0 px-1"
                    onclick="event.stopPropagation();gestaoOS.abrirNotasPanel('${_escAttr(numeroOS)}')"
                    title="${title}" style="font-size:0.8rem;">${label}</button>`;
    }

    /** Abre/fecha painel inline de múltiplas notas sob a linha da tabela */
    abrirNotasPanel(numeroOS) {
        const panelId  = `notaPanel_${CSS.escape(numeroOS)}`;
        const existing = document.getElementById(panelId);
        if (existing) { existing.remove(); return; }

        const panelEl  = document.createElement('tr');
        panelEl.id     = panelId;
        panelEl.innerHTML = `
          <td colspan="10" class="p-2" style="background:#fffde7;border-top:2px solid #ffc107;">
            <div id="notaPanelInner_${CSS.escape(numeroOS)}">
              ${this._notasPanelContent(numeroOS)}
            </div>
          </td>`;

        const tr = document.getElementById(`nota-cel-${CSS.escape(numeroOS)}`)?.closest('tr');
        if (tr?.nextSibling) tr.parentNode.insertBefore(panelEl, tr.nextSibling);
        else if (tr) tr.parentNode.appendChild(panelEl);
    }

    _notasPanelContent(numeroOS) {
        const notas  = this.getNotas(numeroOS);
        const osEsc  = _escAttr(numeroOS);
        const liItems = notas.map((nota, i) => `
          <div class="d-flex align-items-start gap-1 mb-1" id="notaItem_${CSS.escape(numeroOS)}_${i}">
            <div class="flex-grow-1 border rounded p-1 bg-white small" style="white-space:pre-wrap;">${_esc(nota)}</div>
            <button class="btn btn-xs btn-outline-secondary py-0 px-1" style="font-size:0.7rem;"
                    onclick="gestaoOS.editarNotaPanel('${osEsc}', ${i})" title="Editar">✏️</button>
            <button class="btn btn-xs btn-outline-danger py-0 px-1" style="font-size:0.7rem;"
                    onclick="gestaoOS.excluirNotaPanel('${osEsc}', ${i})" title="Excluir">🗑️</button>
          </div>`).join('');

        return `
          ${liItems || '<div class="text-muted small mb-2">Nenhuma anotação ainda.</div>'}
          <div class="d-flex gap-2 mt-1">
            <button class="btn btn-sm btn-warning py-0 px-2"
                    onclick="gestaoOS.iniciarNovaNotaPanel('${osEsc}')">
              <i class="fas fa-plus me-1"></i>Nova anotação
            </button>
            <button class="btn btn-sm btn-outline-secondary py-0 px-2"
                    onclick="gestaoOS.abrirNotasPanel('${osEsc}')">
              <i class="fas fa-times"></i> Fechar
            </button>
          </div>
          <div id="notaNovaArea_${CSS.escape(numeroOS)}"></div>`;
    }

    _atualizarPanelNotas(numeroOS) {
        const inner = document.getElementById(`notaPanelInner_${CSS.escape(numeroOS)}`);
        if (inner) inner.innerHTML = this._notasPanelContent(numeroOS);
        const cel = document.getElementById(`nota-cel-${CSS.escape(numeroOS)}`);
        if (cel) cel.innerHTML = this._notaHTML(numeroOS);
    }

    iniciarNovaNotaPanel(numeroOS) {
        const areaEl = document.getElementById(`notaNovaArea_${CSS.escape(numeroOS)}`);
        if (!areaEl || areaEl.querySelector('textarea')) return;
        areaEl.innerHTML = `
          <div class="mt-2 d-flex gap-2 align-items-start">
            <textarea id="notaNovaTA_${CSS.escape(numeroOS)}"
                      class="form-control form-control-sm flex-grow-1" rows="2"
                      placeholder="Digite a nova anotação..." style="font-size:0.85rem;resize:vertical;"></textarea>
            <div class="d-flex flex-column gap-1">
              <button class="btn btn-sm btn-warning py-0 px-2"
                      onclick="gestaoOS.salvarNovaNotaPanel('${_escAttr(numeroOS)}')">
                <i class="fas fa-save"></i>
              </button>
              <button class="btn btn-sm btn-outline-secondary py-0 px-2"
                      onclick="document.getElementById('notaNovaArea_${CSS.escape(numeroOS)}').innerHTML=''">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>`;
        setTimeout(() => document.getElementById(`notaNovaTA_${CSS.escape(numeroOS)}`)?.focus(), 50);
    }

    salvarNovaNotaPanel(numeroOS) {
        const ta = document.getElementById(`notaNovaTA_${CSS.escape(numeroOS)}`);
        if (!ta) return;
        const texto = ta.value.trim();
        if (!texto) return;
        const notas = this.getNotas(numeroOS);
        notas.push(texto);
        this.setNotas(numeroOS, notas);
        this._atualizarPanelNotas(numeroOS);
        this._atualizarNotasModal(numeroOS);
    }

    editarNotaPanel(numeroOS, idx) {
        const notas = this.getNotas(numeroOS);
        if (idx < 0 || idx >= notas.length) return;
        const itemEl = document.getElementById(`notaItem_${CSS.escape(numeroOS)}_${idx}`);
        if (!itemEl) return;
        const textoAtual = notas[idx];
        itemEl.innerHTML = `
          <textarea id="notaEditTA_${CSS.escape(numeroOS)}_${idx}"
                    class="form-control form-control-sm flex-grow-1" rows="2"
                    style="font-size:0.85rem;resize:vertical;">${_esc(textoAtual)}</textarea>
          <button class="btn btn-sm btn-warning py-0 px-1"
                  onclick="gestaoOS.salvarEdicaoNotaPanel('${_escAttr(numeroOS)}', ${idx})">
            <i class="fas fa-save"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary py-0 px-1"
                  onclick="gestaoOS._atualizarPanelNotas('${_escAttr(numeroOS)}')">
            <i class="fas fa-times"></i>
          </button>`;
        setTimeout(() => document.getElementById(`notaEditTA_${CSS.escape(numeroOS)}_${idx}`)?.focus(), 50);
    }

    salvarEdicaoNotaPanel(numeroOS, idx) {
        const ta = document.getElementById(`notaEditTA_${CSS.escape(numeroOS)}_${idx}`);
        if (!ta) return;
        const texto = ta.value.trim();
        if (!texto) return;
        const notas = this.getNotas(numeroOS);
        if (idx < 0 || idx >= notas.length) return;
        notas[idx] = texto;
        this.setNotas(numeroOS, notas);
        this._atualizarPanelNotas(numeroOS);
        this._atualizarNotasModal(numeroOS);
    }

    excluirNotaPanel(numeroOS, idx) {
        const notas = this.getNotas(numeroOS);
        if (idx < 0 || idx >= notas.length) return;
        notas.splice(idx, 1);
        this.setNotas(numeroOS, notas);
        this._atualizarPanelNotas(numeroOS);
        this._atualizarNotasModal(numeroOS);
    }

    /** Atualiza a seção de notas no modal aberto (se houver) */
    _atualizarNotasModal(numeroOS) {
        const modalOsId  = numeroOS.replace(/[^a-zA-Z0-9]/g, '_');
        const notaDisplay = document.getElementById(`notaDisplay_${modalOsId}`);
        if (!notaDisplay) return;
        const notas = this.getNotas(numeroOS);
        notaDisplay.innerHTML = notas.length
            ? notas.map((n, i) => `<div class="border rounded p-1 mb-1 bg-white small" style="white-space:pre-wrap;">${_esc(n)}</div>`).join('')
            : '<em class="text-muted">Nenhuma anotação</em>';
    }

    /** Editor de nota dentro do modal (mantém compatibilidade com modal antigo) */
    abrirEditorNotaModal(numeroOS, modalOsId) {
        const editorId = `notaEditorModal_${modalOsId}`;
        const existing = document.getElementById(editorId);
        if (existing) { existing.remove(); return; }

        const display = document.getElementById(`notaDisplay_${modalOsId}`);
        if (!display) return;

        const editor = document.createElement('div');
        editor.id    = editorId;
        editor.innerHTML = `
          <div class="mt-2 d-flex gap-2 align-items-start">
            <textarea id="notaTAModal_${modalOsId}"
                      class="form-control flex-grow-1" rows="3"
                      placeholder="Digite a nova anotação..."
                      style="font-size:0.85rem;resize:vertical;"></textarea>
            <div class="d-flex flex-column gap-1">
              <button class="btn btn-sm btn-warning"
                      onclick="gestaoOS.salvarNotaModal('${_escAttr(numeroOS)}','${modalOsId}')"
                      title="Salvar">
                <i class="fas fa-save"></i> Salvar
              </button>
              <button class="btn btn-sm btn-outline-secondary"
                      onclick="document.getElementById('${editorId}').remove()"
                      title="Cancelar">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>`;
        display.parentNode.insertBefore(editor, display.nextSibling);
        setTimeout(() => document.getElementById(`notaTAModal_${modalOsId}`)?.focus(), 50);
    }

    salvarNotaModal(numeroOS, modalOsId) {
        const ta = document.getElementById(`notaTAModal_${modalOsId}`);
        if (!ta) return;
        const texto = ta.value.trim();
        if (!texto) return;
        const notas = this.getNotas(numeroOS);
        notas.push(texto);
        this.setNotas(numeroOS, notas);
        this._atualizarNotasModal(numeroOS);
        const cel = document.getElementById(`nota-cel-${CSS.escape(numeroOS)}`);
        if (cel) cel.innerHTML = this._notaHTML(numeroOS);
        document.getElementById(`notaEditorModal_${modalOsId}`)?.remove();
    }

    // ── Anexos via Google Drive (Feature 3) ───────────────────────────────

    getAnexos(numeroOS) {
        const json = localStorage.getItem('gestaoOS_anexos_' + numeroOS);
        if (json) {
            try { return JSON.parse(json); } catch { /* fall through */ }
        }
        // Fallback: dados do servidor (outro computador pode ter feito o upload)
        const sv = this._dadosServidor?.[numeroOS];
        if (sv?.anexos) {
            try { return typeof sv.anexos === 'string' ? JSON.parse(sv.anexos) : sv.anexos; } catch { return []; }
        }
        return [];
    }

    setAnexos(numeroOS, arr) {
        if (!arr || arr.length === 0) {
            localStorage.removeItem('gestaoOS_anexos_' + numeroOS);
        } else {
            try { localStorage.setItem('gestaoOS_anexos_' + numeroOS, JSON.stringify(arr)); } catch (e) { /* quota */ }
        }
        this._salvarNoServidor(numeroOS); // sincronizar anexos com o servidor
    }

    /**
     * Retorna URL de thumbnail do Google Drive que funciona em <img> sem login.
     * - lh3.googleusercontent.com/d/ID=w200 : URL CDN do Google, funciona sem sessão
     *   para arquivos com permissão "qualquer pessoa com o link".
     * - drive.google.com/thumbnail exige cookies de sessão Google (falha em outros PCs).
     */
    _driveThumbUrl(a) {
        const id = a.fileId ||
                   (a.url || '').match(/\/d\/([^/?&]+)/)?.[1] ||
                   (a.url || '').match(/[?&]id=([^&]+)/)?.[1] || '';
        if (!id) return a.url || '';
        return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w200`;
    }

    _anexosHTML(numeroOS, modalOsId) {
        const anexos = this.getAnexos(numeroOS);
        const uploadDisponivel = Boolean(_appsScriptUrl());
        const addBtn = uploadDisponivel
            ? `<label class="btn btn-sm btn-outline-primary py-0 px-2 mb-2" style="cursor:pointer;font-size:0.8rem;">
                 <i class="fas fa-paperclip me-1"></i>Adicionar
                 <input type="file" accept="image/*,application/pdf" style="display:none;"
                        onchange="gestaoOS._uploadAnexo('${_escAttr(numeroOS)}','${modalOsId}',this)">
               </label>`
            : `<span class="text-muted ms-2" style="font-size:0.75rem;" title="Configure APPS_SCRIPT_URL no wrangler.jsonc (produção) ou js/config.js (local)">
                 <i class="fas fa-info-circle"></i> Anexos indisponíveis (Apps Script não configurado)
               </span>`;

        const items = anexos.map((a, i) => {
            const isImg = (a.tipo || '').startsWith('image/');
            const isPdf = (a.tipo || '') === 'application/pdf';
            const thumbUrl = this._driveThumbUrl(a);

            // Miniatura: imagem real para fotos, ícone para PDF/outros
            const thumb = isImg
                ? `<img src="${_esc(thumbUrl)}"
                        style="width:72px;height:72px;object-fit:cover;border-radius:6px;display:block;background:#e9ecef;"
                        title="${_escAttr(a.nome)}"
                        onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';">
                   <span style="display:none;width:72px;height:72px;border-radius:6px;background:#e9ecef;
                                 align-items:center;justify-content:center;font-size:2rem;" title="${_escAttr(a.nome)}">🖼️</span>`
                : `<span style="display:flex;width:72px;height:72px;border-radius:6px;background:#e9ecef;
                                align-items:center;justify-content:center;font-size:2.2rem;"
                          title="${_escAttr(a.nome)}">${isPdf ? '📄' : '📎'}</span>`;

            const nomeExibido = a.nome.length > 14 ? a.nome.slice(0, 12) + '…' : a.nome;

            return `<div class="d-inline-flex flex-column align-items-center me-2 mb-2" style="max-width:76px;">
                      <a href="${_esc(a.url)}" target="_blank" title="${_escAttr(a.nome)}"
                         style="border:1px solid #dee2e6;border-radius:6px;overflow:hidden;display:block;">
                        ${thumb}
                      </a>
                      <span class="text-muted text-center" style="font-size:0.62rem;margin-top:3px;max-width:76px;
                                   word-break:break-all;line-height:1.2;" title="${_escAttr(a.nome)}">${_esc(nomeExibido)}</span>
                      <button class="btn btn-link text-danger p-0" style="font-size:0.7rem;line-height:1;"
                              onclick="gestaoOS._deletarAnexo('${_escAttr(numeroOS)}','${modalOsId}',${i})"
                              title="Remover anexo">✕</button>
                    </div>`;
        }).join('');

        return `${addBtn}<div class="d-flex flex-wrap mt-1">${items || '<span class="text-muted small">Nenhum anexo.</span>'}</div>`;
    }

    async _uploadAnexo(numeroOS, modalOsId, inputEl) {
        const file = inputEl?.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { _mostrarToastErro('Arquivo muito grande (máx 5 MB).'); return; }

        const url = _appsScriptUrl();
        if (!url) { _mostrarToastErro('APPS_SCRIPT_URL não configurada.'); return; }

        const addBtn = document.querySelector(`#modalDetalheOS_${numeroOS.replace(/[^a-zA-Z0-9]/g, '_')} label.btn-outline-primary`);
        if (addBtn) { addBtn.style.opacity = '0.5'; addBtn.style.pointerEvents = 'none'; }

        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload  = e => resolve(e.target.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 60000);
            const resp  = await fetch(url, {
                method: 'POST',
                body: JSON.stringify({ acao: 'uploadAnexo', numeroOS, nome: file.name, tipo: file.type, base64 }),
                signal: ctrl.signal
            });
            clearTimeout(timer);
            const j = await resp.json();
            if (j.sucesso && j.url) {
                const anexos = this.getAnexos(numeroOS);
                anexos.push({ nome: file.name, url: j.url, fileId: j.fileId || '', tipo: file.type });
                this.setAnexos(numeroOS, anexos);
                const cont = document.getElementById(`anexosCont_${modalOsId}`);
                if (cont) cont.innerHTML = this._anexosHTML(numeroOS, modalOsId);
            } else {
                _mostrarToastErro(j.erro || 'Erro ao fazer upload.');
            }
        } catch (e) {
            _mostrarToastErro(`Falha no upload: ${e.message}`);
        } finally {
            if (addBtn) { addBtn.style.opacity = ''; addBtn.style.pointerEvents = ''; }
            if (inputEl) inputEl.value = '';
        }
    }

    async _deletarAnexo(numeroOS, modalOsId, idx) {
        const anexos = this.getAnexos(numeroOS);
        const a = anexos[idx];
        if (!a) return;

        const url = _appsScriptUrl();
        if (url && a.fileId) {
            try {
                await fetch(url, { method: 'POST', body: JSON.stringify({ acao: 'deletarAnexo', fileId: a.fileId }) });
            } catch { /* silencioso */ }
        }
        anexos.splice(idx, 1);
        this.setAnexos(numeroOS, anexos);
        const cont = document.getElementById(`anexosCont_${modalOsId}`);
        if (cont) cont.innerHTML = this._anexosHTML(numeroOS, modalOsId);
    }

    // ── Persistência no servidor (Google Sheets via Apps Script) ───────────

    /**
     * Busca dados de status/gevia/nota de todas as O.S salvos no servidor.
     * Chamado uma vez ao carregar dados. Re-renderiza quando completo.
     */
    async _carregarDoServidor() {
        const url = _appsScriptUrl();
        if (!url) { this._carregandoServidor = false; return; }

        try {
            const resp = await fetch(url, {
                method: 'POST',
                body: JSON.stringify({ acao: 'listarGestaoOS' })
            });
            const json = await resp.json();
            if (json.sucesso && json.dados) {
                this._dadosServidor    = json.dados;
                this._servidorCarregado  = true;
                console.log('[GestaoOS] ✅ Servidor: carregados', Object.keys(json.dados).length, 'registros');
                if (this.dados) this.renderizar();
                // Migrar dados do localStorage que ainda não estão no servidor
                this._migrarLocalStorageParaServidor();
            } else {
                const msg = json.erro || json.error || JSON.stringify(json);
                console.warn('[GestaoOS] ⚠️ Apps Script com erro:', msg);
                if (json._htmlTrecho) {
                    console.warn('[GestaoOS] 📄 Trecho da resposta HTML do Apps Script:\n', json._htmlTrecho);
                }
                console.warn('[GestaoOS] → Verifique o Apps Script: execute uma função manualmente para autorizar escopos (Drive, Sheets), depois reimplante.');
            }
        } catch (e) {
            console.warn('[GestaoOS] Falha ao carregar servidor (usando localStorage):', e.message);
        } finally {
            this._carregandoServidor = false;
        }
    }

    /**
     * Salva o estado atual de uma O.S no servidor com DEBOUNCE de 600ms.
     * Múltiplas chamadas rápidas (ex: digitação na nota) geram apenas 1 request.
     */
    _salvarNoServidor(numeroOS) {
        // Cancelar envio pendente para este OS e agendar novo
        clearTimeout(this._debounceTimers[numeroOS]);
        this._debounceTimers[numeroOS] = setTimeout(() => {
            this._enviarParaServidor(numeroOS);
        }, 600);
    }

    /**
     * Executa o fetch para o servidor (chamado pelo debounce — fire-and-forget).
     * Para fluxo de migração, use _enviarParaServidorAsync (aguarda resposta).
     */
    _enviarParaServidor(numeroOS) {
        this._enviarParaServidorAsync(numeroOS).catch(() => {});
    }

    /**
     * Versão assíncrona: retorna Promise que resolve após sucesso ou falha final.
     * Usada pela migração sequencial para garantir que um item termine antes do próximo.
     * @param {string} numeroOS
     * @param {number} tentativa - 1 a 3
     */
    async _enviarParaServidorAsync(numeroOS, tentativa = 1) {
        const url = _appsScriptUrl();
        if (!url) return;

        // Recuperar valores mais atuais do cache servidor → fallback localStorage
        let grupo = null;
        this._grupos?.forEach(gt => { if (gt.ordens.has(numeroOS)) grupo = gt.ordens.get(numeroOS); });

        const sv     = this._dadosServidor[numeroOS] || {};
        const status = sv.status || (grupo ? this.getStatus(grupo) : null)
                     || localStorage.getItem('gestaoOS_status_' + numeroOS) || 'Em Progresso';
        const gevia  = sv.gevia  || localStorage.getItem('gestaoOS_gevia_' + numeroOS) || 'Pendente';
        // nota: aceita JSON array (notas múltiplas) ou string (formato antigo)
        const nota   = sv.nota !== undefined ? sv.nota
                     : (localStorage.getItem('gestaoOS_notas_' + numeroOS)
                     || localStorage.getItem('gestaoOS_nota_' + numeroOS) || '');
        // mediu: localStorage tem prioridade (última ação do usuário)
        const mediuLocal = localStorage.getItem('gestaoOS_mediu_' + numeroOS);
        const mediu = mediuLocal !== null ? mediuLocal : (sv.mediu || 'nao');

        // anexos: localStorage tem prioridade; fallback para servidor
        const anexosLocal = localStorage.getItem('gestaoOS_anexos_' + numeroOS);
        const anexos = anexosLocal !== null ? anexosLocal
                     : (sv.anexos ? (typeof sv.anexos === 'string' ? sv.anexos : JSON.stringify(sv.anexos)) : '[]');

        // Atualizar cache com valores definitivos antes de enviar
        if (!this._dadosServidor[numeroOS]) this._dadosServidor[numeroOS] = {};
        Object.assign(this._dadosServidor[numeroOS], { status, gevia, nota, mediu, anexos });

        try {
            const resp = await fetch(url, {
                method: 'POST',
                body: JSON.stringify({ acao: 'salvarGestaoOS', numeroOS, status, gevia, nota, mediu, anexos })
            });
            const j = await resp.json();

            if (j.sucesso) {
                console.log('[GestaoOS] ✅ Salvo:', numeroOS, j.acao);
            } else if (j.erro && j.erro.includes('ocupado') && tentativa <= 3) {
                // Servidor ocupado (LockService) → aguardar e retentar
                const delay = tentativa * 3000;
                console.warn(`[GestaoOS] ⏳ Ocupado (${numeroOS}) tentativa ${tentativa}/3, aguardando ${delay/1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                await this._enviarParaServidorAsync(numeroOS, tentativa + 1);
            } else {
                console.warn('[GestaoOS] ⚠️ Erro ao salvar:', j.erro);
            }
        } catch (e) {
            console.warn('[GestaoOS] Falha ao salvar no servidor:', e.message);
        }
    }

    /**
     * Varre o localStorage e envia para o servidor qualquer O.S que ainda
     * não esteja lá. Executado uma vez após carregar dados do servidor.
     * Migração SEQUENCIAL: aguarda cada resposta antes de enviar o próximo,
     * eliminando concorrência no LockService do Apps Script.
     */
    async _migrarLocalStorageParaServidor() {
        const osNums = new Set();
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const match = key && key.match(/^gestaoOS_(status|gevia|notas|nota)_(.+)$/);
            if (match) osNums.add(match[2]);
        }

        // Enviar O.S que não existem no servidor OU que divergem (mudança feita offline).
        // Sem esse filtro, alterações offline em O.S já existentes seriam silenciosamente perdidas.
        const paraEnviar = [...osNums].filter(os => {
            const sv = this._dadosServidor[os];
            if (!sv) return true; // não existe no servidor → enviar (migração)
            // Verificar divergência nos campos editáveis
            const localStatus = localStorage.getItem('gestaoOS_status_' + os);
            const localGevia  = localStorage.getItem('gestaoOS_gevia_'  + os);
            const localNota   = localStorage.getItem('gestaoOS_notas_'  + os)
                             || localStorage.getItem('gestaoOS_nota_'   + os);
            return (localStatus !== null && localStatus !== sv.status)
                || (localGevia  !== null && localGevia  !== sv.gevia)
                || (localNota   !== null && localNota   !== sv.nota);
        });
        if (paraEnviar.length === 0) return;

        console.log('[GestaoOS] 📤 Migrando', paraEnviar.length, 'O.S do localStorage → servidor (sequencial, 1 por vez)...');
        // Sequencial: cada item só inicia após o anterior terminar (sem concorrência no lock)
        for (const numeroOS of paraEnviar) {
            await this._enviarParaServidorAsync(numeroOS);
        }
        console.log('[GestaoOS] ✅ Migração concluída.');
    }


    // ── Detecção de sobreposição de HI (Feature 4) ───────────────────────

    /** Converte "HH:MM" → minutos desde meia-noite. Retorna null se inválido. */
    _parseTime(hhmm) {
        if (!hhmm) return null;
        const parts = String(hhmm).trim().split(':');
        if (parts.length < 2) return null;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (isNaN(h) || isNaN(m)) return null;
        return h * 60 + m;
    }

    /**
     * Recalcula HH improdutivas descontando sobreposições:
     * Entradas "completas" (ops >= 12) dominam; entradas "parciais" (ops < 12)
     * têm sua duração clipada nos intervalos já cobertos pelas completas.
     * @param {Array} hiEntries - [{ tipo, data, operadores, horaInicio, horaFim, hhOriginal }]
     * @returns {{ resultado: Array, totalHH: number, totalMinutosDescontados: number }}
     */
    _resolverSobreposicaoHI(hiEntries) {
        const resultado = hiEntries.map(hi => ({
            ...hi, hhAjustado: hi.hhOriginal, ajustado: false, minutosDescontados: 0
        }));

        // Agrupar por dia
        const porDia = new Map();
        hiEntries.forEach((hi, idx) => {
            const dia = hi.data || '__sem_data__';
            if (!porDia.has(dia)) porDia.set(dia, []);
            porDia.get(dia).push(idx);
        });

        let totalMinutosDescontados = 0;
        porDia.forEach(indices => {
            const completoIdxs = indices.filter(i => (hiEntries[i].operadores || 0) >= 12);
            const parcialIdxs  = indices.filter(i => (hiEntries[i].operadores || 0) < 12);
            if (completoIdxs.length === 0 || parcialIdxs.length === 0) return;

            // Construir e mesclar intervalos das entradas completas
            const rawIntervals = [];
            completoIdxs.forEach(i => {
                const hi = hiEntries[i];
                const s  = this._parseTime(hi.horaInicio);
                const e  = this._parseTime(hi.horaFim);
                if (s === null || e === null) return;
                const fim = (e < s) ? e + 24 * 60 : e;
                rawIntervals.push([s, fim]);
            });
            rawIntervals.sort((a, b) => a[0] - b[0]);
            const merged = [];
            rawIntervals.forEach(([s, e]) => {
                if (!merged.length || s > merged[merged.length - 1][1]) merged.push([s, e]);
                else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
            });

            // Clipar cada entrada parcial
            parcialIdxs.forEach(i => {
                const hi = hiEntries[i];
                const s  = this._parseTime(hi.horaInicio);
                const e  = this._parseTime(hi.horaFim);
                if (s === null || e === null) return;
                const fim     = (e < s) ? e + 24 * 60 : e;
                const duracao = fim - s;
                let sobreposicao = 0;
                merged.forEach(([ms, me]) => {
                    const os = Math.max(s, ms);
                    const oe = Math.min(fim, me);
                    if (oe > os) sobreposicao += oe - os;
                });
                if (sobreposicao <= 0) return;
                const minutosRestantes = Math.max(0, duracao - sobreposicao);
                const ops        = hi.operadores || 0;
                const fatorChuva = (hi.tipo || '').toLowerCase().includes('chuva') ? 0.5 : 1.0;
                resultado[i].hhAjustado         = (minutosRestantes / 60) * ops * fatorChuva;
                resultado[i].ajustado           = true;
                resultado[i].minutosDescontados = sobreposicao;
                totalMinutosDescontados        += sobreposicao;
            });
        });

        const totalHH = resultado.reduce((sum, r) => sum + r.hhAjustado, 0);
        return { resultado, totalHH, totalMinutosDescontados };
    }

    // ── Limpeza de localStorage órfão ─────────────────────────────────────

    _limparLocalStorageOrfao() {
        // Usar _dadosServidor como fonte completa de O.S conhecidas.
        // NUNCA usar this._grupos: pode estar filtrado por mês/ano e causaria remoção
        // de dados de O.S fora do filtro ativo (bug de perda de dados).
        // Só executar após o servidor ter carregado para evitar remoções prematuras.
        if (!this._servidorCarregado) return;

        const osAtivas = new Set(Object.keys(this._dadosServidor || {}));
        // Também preservar O.S visíveis na tela (segurança extra para dados sem espelho no servidor)
        if (this._grupos) {
            this._grupos.forEach(gt => gt.ordens.forEach((go, os) => osAtivas.add(os)));
        }
        const prefixos = [
            'gestaoOS_status_', 'gestaoOS_gevia_',
            'gestaoOS_nota_', 'gestaoOS_notas_',
            'gestaoOS_mediu_', 'gestaoOS_anexos_'
        ];
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            for (const p of prefixos) {
                if (key.startsWith(p)) {
                    const os = key.slice(p.length);
                    if (!osAtivas.has(os)) keysToRemove.push(key);
                    break;
                }
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        if (keysToRemove.length > 0)
            console.log('[GestaoOS] 🧹 localStorage: removidas', keysToRemove.length, 'chaves órfãs');
    }

    // ── Leitura de HH de HI (múltiplos nomes de campo possíveis) ──────────

    /**
     * Extrai o valor de HH improdutivas de um objeto HI do sheets-api.
     * O sheets-api retorna o campo como 'hhImprodutivas' ou 'HH Improdutivas'.
     * Fazemos fallback para todos os nomes possíveis.
     */
    _getHHImprodutivas(hi) {
        // Campos calculados pelo sheets-api (preferência)
        const v = hi.hhImprodutivas
               ?? hi['HH Improdutivas']
               ?? hi['HH Improdutivo']
               ?? hi.totalHH
               ?? hi['Total HH'];
        if (v !== undefined && v !== null && v !== '') return parseFloat(v) || 0;

        // Fallback: calcular manualmente a partir de duração × operadores
        const duracao = hi.duracaoHoras ?? hi['Duração Horas'] ?? hi.duracao;
        if (duracao !== undefined) {
            const ops = parseFloat(hi.operadores || hi['Operadores'] || 1);
            return (parseFloat(duracao) || 0) * ops;
        }
        return 0;
    }

    // ── Agrupamento (two-pass: filtra por último RDO no mês) ──────────────

    _agrupar() {
        const turmas = new Map();

        // ── PASSO 1: Coleta TODOS os RDOs válidos (sem filtro de mês)
        this.dados.rdos.forEach(rdo => {
            const deletado = (rdo['Deletado'] || rdo.deletado || '').toLowerCase();
            if (deletado === 'sim') return;

            const numeroOS = (rdo['Número OS'] || rdo.numeroOS || '').trim();
            // Usar a flag _osInvalida do sheets-api.js (cobre 'Sem O.S', vazio, SEM O NUMERO DA OS AINDA, etc.)
            if (!numeroOS || rdo._osInvalida || numeroOS === '0') return;

            const turma = (rdo['Código Turma'] || rdo.codigoTurma || 'Sem Turma').trim();
            if (_isTMC(turma)) return;

            const encarregado = (rdo.Encarregado || rdo.encarregado || '-').trim();
            const local       = (rdo.Local        || rdo.local       || '').trim();
            const numeroRDO   = (rdo['Número RDO'] || rdo.numeroRDO || rdo.numeroRdo || '').trim();
            const statusRDO   = (rdo['Status OS']  || rdo.statusOS  || '').trim();
            const kmIni       = (rdo['KM Início']  || rdo.kmInicio  || '').toString().trim();
            const kmFim       = (rdo['KM Fim']     || rdo.kmFim     || '').toString().trim();
            const obs         = (rdo.Observações   || rdo.observacoes || rdo.observacao || '').trim();
            const dataStr     = (rdo.Data          || rdo.data       || '').trim();

            // Usar Set para acumular todos os encarregados únicos da turma
            if (!turmas.has(turma)) turmas.set(turma, { encarregados: new Set(), ordens: new Map() });
            const gt = turmas.get(turma);
            if (encarregado && encarregado !== '-') gt.encarregados.add(encarregado);

            if (!gt.ordens.has(numeroOS)) {
                gt.ordens.set(numeroOS, {
                    numeroOS, turma, encarregado,
                    // statusPlanilha: guarda o status normalizado para 4 estados
                    statusPlanilha: 'Em Progresso',
                    datas: [], rdoIds: [],
                    kmInicio: '', kmFim: '',
                    locais: new Set(),
                    observacoesRDO: new Map()  // chave: "data|obs" → {data, obs}
                });
            }
            const go = gt.ordens.get(numeroOS);

            if (dataStr)   go.datas.push(dataStr);
            if (numeroRDO) go.rdoIds.push(numeroRDO);
            if (obs) {
                const key = `${dataStr}|${obs}`;
                if (!go.observacoesRDO.has(key)) go.observacoesRDO.set(key, { data: dataStr, obs });
            }
            if (local)     go.locais.add(local);

            // Mapeia status da planilha para o sistema de 4 estados
            // Uma OS é "Finalizada" se qualquer RDO indicar conclusão
            const statusNorm = _normalizarStatusPlanilha(statusRDO);
            if (statusNorm === 'Finalizada') go.statusPlanilha = 'Finalizada';

            const numKmIni    = _kmToNum(kmIni);
            const numKmAtual  = _kmToNum(go.kmInicio);
            if (numKmIni !== null && (numKmAtual === null || numKmIni < numKmAtual)) go.kmInicio = kmIni;

            const numKmFim     = _kmToNum(kmFim);
            const numKmFimAtual = _kmToNum(go.kmFim);
            if (numKmFim !== null && (numKmFimAtual === null || numKmFim > numKmFimAtual)) go.kmFim = kmFim;
        });

        // ── PASSO 2: Calcular datas e filtrar por ÚLTIMO RDO no mês/ano
        const turmasParaDeletar = [];
        turmas.forEach((gt, turma) => {
            const ordensParaDeletar = [];
            gt.ordens.forEach((go, numeroOS) => {
                go.datas.sort((a, b) => (_parseData(a) || 0) - (_parseData(b) || 0));
                go.dataInicio    = go.datas[0]                    || '-';
                go.dataUltimoRDO = go.datas[go.datas.length - 1] || '-';
                go.local = go.locais.size > 0
                    ? Array.from(go.locais).join(' / ')
                    : '-';

                if (this.filtroMes && this.filtroAno) {
                    const hasRDOInMonth = go.datas.some(d => {
                        const parts = d.split('/');
                        if (parts.length < 3) return false;
                        const year = parts[2].length === 2 ? 2000 + +parts[2] : +parts[2];
                        return +parts[1] === this.filtroMes &&
                               year === this.filtroAno;
                    });
                    if (!hasRDOInMonth) ordensParaDeletar.push(numeroOS);
                }
            });
            ordensParaDeletar.forEach(os => gt.ordens.delete(os));
            if (gt.ordens.size === 0) turmasParaDeletar.push(turma);
        });
        turmasParaDeletar.forEach(t => turmas.delete(t));

        return turmas;
    }

    // ── Modal de detalhes ─────────────────────────────────────────────────

    abrirModal(numeroOS) {
        if (!this._grupos) return;
        let grupo = null;
        this._grupos.forEach(gt => { if (gt.ordens.has(numeroOS)) grupo = gt.ordens.get(numeroOS); });
        if (!grupo) return;

        const rdoIds      = new Set(grupo.rdoIds);
        const statusAtual = this.getStatus(grupo);
        const cfg         = this._statusConfig(statusAtual);
        const modalOsId   = numeroOS.replace(/[^a-zA-Z0-9]/g, '_');

        // ── Serviços: agrega por descrição, somando Qtd e HH separados
        const servicosPorDesc = {};
        this.dados.servicos.forEach(s => {
            const sRDO = (s['Número RDO'] || s.numeroRDO || s.numeroRdo || '').trim();
            if (!rdoIds.has(sRDO)) return;
            const desc = (s.Descrição || s.descricao || 'Serviço').trim();
            const qtd  = parseFloat(s.Quantidade  || s.quantidade  || 0);
            const coef = parseFloat(s.Coeficiente || s.coeficiente || 0);
            const hh   = qtd * coef;
            if (!servicosPorDesc[desc]) servicosPorDesc[desc] = { qtd: 0, hh: 0, coef };
            servicosPorDesc[desc].qtd += qtd;
            servicosPorDesc[desc].hh  += hh;
        });

        const servicosRows = Object.entries(servicosPorDesc)
            .sort((a, b) => b[1].hh - a[1].hh)
            .map(([desc, v]) =>
                `<tr>
                   <td>${_esc(desc)}</td>
                   <td class="text-end">${v.qtd % 1 === 0 ? v.qtd.toFixed(0) : v.qtd.toFixed(2)}</td>
                   <td class="text-end text-muted" style="font-size:0.8rem;">${v.coef > 0 ? v.coef.toFixed(3) : '—'}</td>
                   <td class="text-end fw-bold text-primary">${v.hh.toFixed(2)}</td>
                 </tr>`)
            .join('') || '<tr><td colspan="4" class="text-muted text-center">Nenhum serviço</td></tr>';

        const totalHHProd = Object.values(servicosPorDesc).reduce((s, v) => s + v.hh, 0);
        const totalQtd    = Object.values(servicosPorDesc).reduce((s, v) => s + v.qtd, 0);

        // ── HI: coleta entradas e aplica resolução de sobreposição (Feature 4)
        const hiEntries = [];
        this.dados.horasImprodutivas.forEach(hi => {
            const hRDO = (hi['Número RDO'] || hi.numeroRDO || hi.numeroRdo || '').trim();
            if (!rdoIds.has(hRDO)) return;
            const tipo       = (hi.Tipo    || hi.tipo    || '-').trim();
            const data       = (hi['Data RDO'] || hi.dataRDO || hi.data || '').trim();
            const operadores = parseInt(hi.operadores || hi['Operadores'] || 0) || 0;
            const horaInicio = (hi.horaInicio || hi['Hora Início'] || hi['Hora Inicio'] || '').trim();
            const horaFim    = (hi.horaFim    || hi['Hora Fim']    || '').trim();
            const hhOriginal = this._getHHImprodutivas(hi);
            hiEntries.push({ tipo, data, operadores, horaInicio, horaFim, hhOriginal });
        });
        const { resultado: hiResolvido, totalHH: totalHHImprod, totalMinutosDescontados } =
            this._resolverSobreposicaoHI(hiEntries);
        const hiRows = hiResolvido.map(r => {
            const ajusteLabel = r.ajustado
                ? `<span class="badge bg-warning text-dark ms-1" title="Sobreposição: −${r.minutosDescontados}min descontados">⚠ −${r.minutosDescontados}min</span>`
                : '';
            return `<tr>
              <td>${_esc(r.tipo)}${ajusteLabel}</td>
              <td>${_esc(r.data)}</td>
              <td class="text-end">${r.horaInicio && r.horaFim ? _esc(r.horaInicio) + '–' + _esc(r.horaFim) : (r.operadores > 0 ? r.operadores + ' ops' : '—')}</td>
              <td class="text-end fw-bold text-warning">${r.hhAjustado.toFixed(2)}</td>
            </tr>`;
        });
        const hiHTML = hiRows.join('')
            || '<tr><td colspan="4" class="text-muted text-center">Nenhuma HI</td></tr>';
        const hiDescontoNote = totalMinutosDescontados > 0
            ? `<div class="alert alert-warning py-1 px-2 mt-1 mb-0 small">
                 <i class="fas fa-info-circle me-1"></i>
                 ${totalMinutosDescontados} minutos descontados por sobreposição com turnos completos (≥12 operadores)
               </div>`
            : '';

        // ── Observações dos RDOs
        const obsArr  = Array.from(grupo.observacoesRDO.values())
            .sort((a, b) => {
                const da = _parseData(a.data), db = _parseData(b.data);
                if (!da && !db) return 0;
                if (!da) return 1;
                if (!db) return -1;
                return da - db;
            });
        const obsHTML = obsArr.length
            ? obsArr.map(item => `<div class="alert alert-warning py-1 mb-2 d-flex align-items-start gap-2">
                <i class="fas fa-exclamation-circle mt-1 flex-shrink-0"></i>
                <div>
                  <span class="badge bg-secondary me-1" style="font-size:0.7rem;">${_esc(_fmtData(item.data))}</span>
                  ${_esc(item.obs)}
                </div>
              </div>`).join('')
            : '<span class="text-muted small">Nenhuma observação registrada nos RDOs</span>';

        const notas   = this.getNotas(numeroOS);
        const modalId = 'modalDetalheOS_' + modalOsId;
        document.getElementById(modalId)?.remove();

        const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">
                  <i class="fas fa-clipboard-list me-2 text-primary"></i>
                  O.S <strong>${_esc(numeroOS)}</strong>
                  <span class="badge ms-2" id="statusBadge_${modalOsId}" style="background-color:${cfg.badge};color:${cfg.badgeText};">${_esc(statusAtual)}</span>
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">

                <!-- Info rápida -->
                <div class="row g-2 mb-3">
                  <div class="col-6 col-md-2 text-center">
                    <div class="text-muted small">Início</div>
                    <strong>${_fmtData(grupo.dataInicio)}</strong>
                  </div>
                  <div class="col-6 col-md-2 text-center">
                    <div class="text-muted small">Último RDO</div>
                    <strong>${_fmtData(grupo.dataUltimoRDO)}</strong>
                  </div>
                  <div class="col-6 col-md-2 text-center">
                    <div class="text-muted small">KM Início / Fim</div>
                    <strong>${_esc(grupo.kmInicio) || '-'} / ${_esc(grupo.kmFim) || '-'}</strong>
                  </div>
                  <div class="col-6 col-md-2 text-center">
                    <div class="text-muted small">HH Prod / Improd</div>
                    <strong class="text-primary">${totalHHProd.toFixed(1)}</strong>
                    <span class="text-muted">/</span>
                    <strong class="text-warning">${totalHHImprod.toFixed(1)}</strong>
                  </div>
                  <div class="col-6 col-md-2 text-center">
                    <div class="text-muted small mb-1">GeVia</div>
                    ${this._geviaBadgeHTML(numeroOS, modalOsId)}
                  </div>
                  <div class="col-6 col-md-2">
                    <div class="text-muted small mb-1">Status</div>
                    ${this._statusModalHTML(grupo, modalOsId)}
                  </div>
                </div>

                <!-- ⚠️ Observações dos RDOs em destaque -->
                <h6 class="border-bottom pb-1 mb-2">
                  <i class="fas fa-exclamation-triangle me-1 text-warning"></i>Observações dos RDOs
                </h6>
                <div class="mb-3">${obsHTML}</div>

                <!-- Notas múltiplas (Feature 2) -->
                <h6 class="border-bottom pb-1 mb-2">
                  <i class="fas fa-sticky-note me-1 text-info"></i>Anotações
                  <button class="btn btn-sm btn-outline-info ms-2 py-0 px-2"
                          onclick="gestaoOS.abrirEditorNotaModal('${_escAttr(numeroOS)}','${modalOsId}')"
                          style="font-size:0.75rem;">
                    <i class="fas fa-plus me-1"></i>Nova nota
                  </button>
                </h6>
                <div class="mb-1 border rounded p-2 bg-light small"
                     id="notaDisplay_${modalOsId}"
                     style="min-height:40px;">
                  ${notas.length
                    ? notas.map(n => `<div class="border rounded p-1 mb-1 bg-white" style="white-space:pre-wrap;">${_esc(n)}</div>`).join('')
                    : '<em class="text-muted">Nenhuma anotação</em>'}
                </div>

                <!-- Anexos (Feature 3) -->
                <h6 class="border-bottom pb-1 mb-2 mt-3">
                  <i class="fas fa-paperclip me-1 text-secondary"></i>Anexos
                </h6>
                <div id="anexosCont_${modalOsId}">
                  ${this._anexosHTML(numeroOS, modalOsId)}
                </div>

                <!-- Serviços -->
                <h6 class="border-bottom pb-1 mb-2 mt-3">
                  <i class="fas fa-tools me-1 text-primary"></i>Serviços Executados
                </h6>
                <div class="table-responsive mb-3">
                  <table class="table table-sm table-striped mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Serviço</th>
                        <th class="text-end">Qtd</th>
                        <th class="text-end text-muted" style="font-size:0.8rem;">Coef.</th>
                        <th class="text-end">HH</th>
                      </tr>
                    </thead>
                    <tbody>${servicosRows}</tbody>
                    <tfoot>
                      <tr class="fw-bold table-primary">
                        <td>Total</td>
                        <td class="text-end">${totalQtd % 1 === 0 ? totalQtd.toFixed(0) : totalQtd.toFixed(2)}</td>
                        <td></td>
                        <td class="text-end">${totalHHProd.toFixed(2)} HH</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <!-- HI -->
                <h6 class="border-bottom pb-1 mb-2 mt-3">
                  <i class="fas fa-pause-circle me-1 text-warning"></i>Horas Improdutivas
                </h6>
                <div class="table-responsive">
                  <table class="table table-sm table-striped mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Tipo</th>
                        <th>Data</th>
                        <th class="text-end">Horário / Ops</th>
                        <th class="text-end">HH</th>
                      </tr>
                    </thead>
                    <tbody>${hiHTML}</tbody>
                    <tfoot>
                      <tr class="fw-bold table-warning">
                        <td colspan="3">Total</td>
                        <td class="text-end">${totalHHImprod.toFixed(2)} HH</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                ${hiDescontoNote}

              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
              </div>
            </div>
          </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modalEl = document.getElementById(modalId);
        const bsModal  = new bootstrap.Modal(modalEl);
        modalEl.addEventListener('hidden.bs.modal', () => {
            bsModal.dispose();
            modalEl.remove();
        }, { once: true });
        bsModal.show();
    }

    // ── Correção de O.S inválida via Apps Script ──────────────────────────

    /**
     * Salva a O.S corrigida de um RDO no Google Sheets via Apps Script.
     * Chamada pelo botão inline na seção "Sem O.S".
     */
    async salvarOS(numeroRDO, inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const novaOS = input.value.trim();

        if (!validarNumeroOS(novaOS)) {
            input.classList.add('is-invalid');
            input.title = 'Formato inválido. Use 6 dígitos (98/99xxxx) ou 7 dígitos (100xxxx…199xxxx)';
            setTimeout(() => { input.classList.remove('is-invalid'); }, 3000);
            return;
        }

        const btn = input.nextElementSibling;
        const btnOrigText = btn?.innerHTML;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

        try {
            const url = _appsScriptUrl();
            if (!url) throw new Error('APPS_SCRIPT_URL não configurada');

            const resp = await fetch(url, {
                method: 'POST',
                // Sem Content-Type: application/json para evitar preflight CORS
                body: JSON.stringify({ acao: 'atualizarOS', numeroRDO, novaOS })
            });

            let json;
            try { json = await resp.json(); } catch (_) { json = {}; }

            if (resp.ok && json.sucesso !== false) {
                // Feedback visual de sucesso antes do fade-out
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-check"></i> Salvo!';
                    btn.classList.replace('btn-success', 'btn-outline-success');
                }

                // Atualizar o dado em memória para evitar re-aparecer
                const rdo = this.dados.rdos.find(r => {
                    const nr = (r['Número RDO'] || r.numeroRDO || r.numeroRdo || '').trim();
                    return nr === numeroRDO;
                });
                if (rdo) {
                    rdo['Número OS'] = novaOS;
                    rdo.numeroOS     = novaOS;
                    rdo._osInvalida  = false;
                }

                // Fade-out da linha e re-renderização da aba completa (mostra OS na lista)
                const tr = input.closest('tr');
                if (tr) {
                    tr.style.transition = 'opacity 0.4s';
                    tr.style.opacity = '0';
                    setTimeout(() => {
                        tr.remove();
                        this.renderizar(); // exibe a OS corrigida na lista principal
                    }, 400);
                } else {
                    this.renderizar();
                }
            } else {
                throw new Error(json.erro || json.message || `HTTP ${resp.status}`);
            }
        } catch (err) {
            alert(`Erro ao salvar O.S: ${err.message}`);
            if (btn) { btn.disabled = false; btn.innerHTML = btnOrigText; }
        }
    }

    // ── Seção "Sem O.S" ───────────────────────────────────────────────────

    _renderizarSemOS() {
        if (!this.dados) return '';

        const rdosSemOS = this.dados.rdos.filter(r => {
            if (!r._osInvalida) return false;
            if (this.filtroMes && this.filtroAno) {
                const dataStr = (r.Data || r.data || '').trim();
                if (!dataStr) return false;
                const parts = dataStr.split('/');
                if (parts.length < 3) return false;
                const year = parts[2].length === 2 ? 2000 + +parts[2] : +parts[2];
                if (+parts[1] !== this.filtroMes || year !== this.filtroAno) return false;
            }
            return true;
        });
        if (!rdosSemOS.length) return '';

        // Ordenar por data desc
        rdosSemOS.sort((a, b) => {
            const da = _parseData((a.Data || a.data || '').trim());
            const db = _parseData((b.Data || b.data || '').trim());
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return db - da;
        });

        const rows = rdosSemOS.map((rdo, idx) => {
            const numeroRDO  = (rdo['Número RDO'] || rdo.numeroRDO || rdo.numeroRdo || '').trim();
            const data       = (rdo.Data || rdo.data || '').trim();
            const turma      = (rdo['Código Turma'] || rdo.codigoTurma || '-').trim();
            const encarregado= (rdo.Encarregado || rdo.encarregado || '-').trim();
            const osOriginal = (rdo._osOriginal || '').trim();
            const inputId    = `inputOS_${idx}_${CSS.escape(numeroRDO)}`;

            return `<tr>
              <td class="text-monospace small">${_esc(numeroRDO)}</td>
              <td>${_fmtData(data)}</td>
              <td>${_esc(turma)}</td>
              <td>${_esc(encarregado)}</td>
              <td class="text-muted small">${_esc(osOriginal) || '<em>vazio</em>'}</td>
              <td style="min-width:220px;">
                <div class="input-group input-group-sm">
                  <input id="${inputId}"
                         type="text"
                         class="form-control"
                         placeholder="Ex: 998070 ou 1001234"
                         maxlength="7"
                         style="font-family:monospace;">
                  <button class="btn btn-success btn-sm"
                          onclick="gestaoOS.salvarOS('${_esc(numeroRDO)}', '${inputId}')"
                          title="Salvar O.S">
                    <i class="fas fa-check"></i> Salvar
                  </button>
                </div>
              </td>
            </tr>`;
        }).join('');

        return `
        <div class="card mb-4 shadow-sm border-warning mt-2">
          <div class="card-header fw-bold py-2 text-warning" style="background:#fff8e1;">
            <i class="fas fa-exclamation-triangle me-2"></i>RDOs sem O.S válida
            <span class="badge bg-warning text-dark ms-2">${rdosSemOS.length}</span>
            <span class="text-muted fw-normal small ms-2">— Corrija o número da O.S para que estes RDOs apareçam na lista acima</span>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm table-hover mb-0 align-middle">
                <thead class="table-warning">
                  <tr>
                    <th>Número RDO</th>
                    <th>Data</th>
                    <th>Turma</th>
                    <th>Encarregado</th>
                    <th>O.S Original</th>
                    <th>Corrigir O.S</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        </div>`;
    }

    // ── Renderização ──────────────────────────────────────────────────────

    renderizar() {
        const container = document.getElementById('gestaoOSContainer');
        if (!container) return;
        if (!this.dados || !this.dados.rdos.length) {
            container.innerHTML = `<div class="alert alert-info">
                <i class="fas fa-spinner fa-spin me-2"></i>Aguardando dados...</div>`;
            return;
        }

        const turmas = this._agrupar();
        this._grupos = turmas;

        if (!turmas.size) {
            container.innerHTML = `<div class="alert alert-warning">
                <i class="fas fa-search me-2"></i>Nenhuma O.S encontrada.</div>`;
            return;
        }

        this._limparLocalStorageOrfao();

        let totalOS = 0, totalConcluidas = 0, totalReprovadas = 0, totalGevia = 0, totalMediu = 0;
        const blocos = [];
        const turmasOrdenadas = Array.from(turmas.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        turmasOrdenadas.forEach(([turma, gt]) => {
            let ordens = Array.from(gt.ordens.values());

            // Filtro de status
            if (this.filtroStatus && this.filtroStatus !== 'todas') {
                ordens = ordens.filter(o => this.getStatus(o) === this.filtroStatus);
            }
            if (!ordens.length) return;

            // Ordenar por dataInicio, mais antiga primeiro
            ordens.sort((a, b) => {
                const da = _parseData(a.dataInicio);
                const db = _parseData(b.dataInicio);
                if (!da && !db) return 0;
                if (!da) return 1;
                if (!db) return -1;
                return da - db;
            });

            totalOS            += ordens.length;
            totalConcluidas    += ordens.filter(o => { const s = this.getStatus(o); return s === 'Finalizada' || s === 'Aprovada'; }).length;
            totalReprovadas    += ordens.filter(o => this.getStatus(o) === 'Reprovada').length;
            totalGevia         += ordens.filter(o => this.getGeVia(o.numeroOS) === 'Lançado').length;
            totalMediu         += ordens.filter(o => this.getMediu(o.numeroOS)).length;

            const rows = ordens.map(o => {
                const status = this.getStatus(o);
                const rowBg  = STATUS_ROW_COLORS[status] || '';

                return `<tr style="cursor:pointer;background-color:${rowBg};transition:background-color 0.2s;"
                            onclick="gestaoOS.abrirModal('${_escAttr(o.numeroOS)}')">
                  <td class="fw-bold text-primary text-nowrap">${_esc(o.numeroOS)}</td>
                  <td class="text-center"><span class="badge bg-secondary" title="${o.rdoIds.length} RDO(s)">${o.rdoIds.length}</span></td>
                  <td class="text-nowrap">${_fmtData(o.dataInicio)}</td>
                  <td class="text-nowrap">${_fmtData(o.dataUltimoRDO)}</td>
                  <td class="text-center small text-nowrap text-muted">${_esc(o.kmInicio) || '—'} / ${_esc(o.kmFim) || '—'}</td>
                  <td class="text-muted small" title="${_escAttr(o.local)}" style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(o.local)}</td>
                  <td class="text-center" id="mediu-cel-${CSS.escape(o.numeroOS)}" onclick="event.stopPropagation();">${this._mediuHTML(o.numeroOS)}</td>
                  <td id="status-cel-${CSS.escape(o.numeroOS)}" onclick="event.stopPropagation();">${this._statusSelectHTML(o)}</td>
                  <td id="gevia-cel-${CSS.escape(o.numeroOS)}"  onclick="event.stopPropagation();">${this._geviaHTML(o.numeroOS)}</td>
                  <td class="text-center" id="nota-cel-${CSS.escape(o.numeroOS)}"   onclick="event.stopPropagation();">${this._notaHTML(o.numeroOS)}</td>
                </tr>`;
            }).join('');

            blocos.push(`
            <div class="card mb-4 shadow-sm border-0">
              <div class="card-header fw-bold py-2" style="background:#f0f4f8;">
                <i class="fas fa-hard-hat me-2 text-primary"></i>${_esc(turma)}
                <span class="text-muted fw-normal ms-2">— Encarregado: ${_esc(Array.from(gt.encarregados).join(' / ') || '-')}</span>
                <span class="badge bg-secondary ms-2">${ordens.length} O.S</span>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-hover table-sm mb-0 align-middle">
                    <thead class="table-light">
                      <tr>
                        <th class="text-nowrap" style="min-width:90px;">Nº O.S</th>
                        <th class="text-center text-nowrap" style="min-width:52px;">RDOs</th>
                        <th class="text-nowrap" style="min-width:88px;">1º RDO</th>
                        <th class="text-nowrap" style="min-width:100px;">Último RDO</th>
                        <th class="text-center text-nowrap" style="min-width:120px;">KM Início / Fim</th>
                        <th class="text-nowrap" style="min-width:110px;">Local</th>
                        <th class="text-center text-nowrap" style="min-width:82px;">Já Medida</th>
                        <th class="text-nowrap" style="min-width:130px;">Status</th>
                        <th class="text-nowrap" style="min-width:100px;">GeVia</th>
                        <th class="text-center text-nowrap" style="min-width:62px;">Notas</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </div>
              </div>
            </div>`);
        });

        if (!blocos.length) {
            container.innerHTML = `<div class="alert alert-warning">
                <i class="fas fa-search me-2"></i>Nenhuma O.S encontrada com os filtros selecionados.</div>`
                + this._renderizarSemOS();
            return;
        }

        // Resumo no topo (6 cards)
        const resumo = `<div class="row g-2 mb-4">
          <div class="col-6 col-md">
            <div class="card text-center border-0 shadow-sm py-2">
              <div class="text-muted small">Total O.S</div>
              <h4 class="mb-0 text-primary">${totalOS}</h4>
            </div>
          </div>
          <div class="col-6 col-md">
            <div class="card text-center border-0 shadow-sm py-2">
              <div class="text-muted small">Aprovadas/Finalizadas</div>
              <h4 class="mb-0 text-success" id="resumoOS_concluidas">${totalConcluidas}</h4>
            </div>
          </div>
          <div class="col-6 col-md">
            <div class="card text-center border-0 shadow-sm py-2">
              <div class="text-muted small">Em Progresso</div>
              <h4 class="mb-0 text-warning" id="resumoOS_andamento">${totalOS - totalConcluidas - totalReprovadas}</h4>
            </div>
          </div>
          <div class="col-6 col-md">
            <div class="card text-center border-0 shadow-sm py-2">
              <div class="text-muted small">Reprovadas</div>
              <h4 class="mb-0 text-danger" id="resumoOS_reprovadas">${totalReprovadas}</h4>
            </div>
          </div>
          <div class="col-6 col-md">
            <div class="card text-center border-0 shadow-sm py-2">
              <div class="text-muted small" style="color:#0d6efd;">Lançadas GeVia</div>
              <h4 class="mb-0" style="color:#0d6efd;" id="resumoOS_gevia">${totalGevia}</h4>
            </div>
          </div>
          <div class="col-6 col-md">
            <div class="card text-center border-0 shadow-sm py-2">
              <div class="text-muted small" style="color:#0dcaf0;">Já Mediu</div>
              <h4 class="mb-0" style="color:#0dcaf0;" id="resumoOS_mediu">${totalMediu}</h4>
            </div>
          </div>
        </div>`;

        container.innerHTML = resumo + blocos.join('') + this._renderizarSemOS();
    }
}

// Instância global
const gestaoOS = new GestaoOS();
