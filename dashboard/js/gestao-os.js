/**
 * Gestão de O.S Trabalhadas — v3.0.7
 * Lista compacta por turma (somente TPs/TSs — TMCs excluídas)
 * Status (4 estados), GeVia e Notas salvos em localStorage
 */

'use strict';

// ─── Helpers ────────────────────────────────────────────────────────────────

function _esc(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

function _parseData(str) {
    if (!str) return null;
    const [d, m, y] = str.split('/');
    return new Date(+y, +m - 1, +d);
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

// ─── Classe principal ────────────────────────────────────────────────────────

class GestaoOS {
    constructor() {
        this.dados = null;
        this.filtroStatus = 'todas';
        this.filtroMes = null;
        this.filtroAno = null;
        this._grupos = null; // cache para uso no modal
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
    }

    setFiltros(mes, ano) {
        this.filtroMes = mes;
        this.filtroAno = ano;
    }

    // ── Status (localStorage) — 4 estados ─────────────────────────────────

    /**
     * Retorna o status salvo no localStorage.
     * Se não houver, usa o status da planilha (normalizado para 4 estados).
     */
    getStatus(grupo) {
        const salvo = localStorage.getItem('gestaoOS_status_' + grupo.numeroOS);
        return salvo || grupo.statusPlanilha;
    }

    /** Salva status e atualiza a linha inteira da tabela (cor de fundo) */
    setStatus(numeroOS, valor) {
        if (!valor) {
            localStorage.removeItem('gestaoOS_status_' + numeroOS);
        } else {
            localStorage.setItem('gestaoOS_status_' + numeroOS, valor);
        }

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
            badge.className = `badge bg-${cfg.cls} ms-2`;
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

        const colorMap = {
            'Aprovada':    '#e8f4ff',  // azul claro
            'Finalizada':  '#d4edda',  // verde claro
            'Em Progresso':'#fff9e6',  // amarelo muito claro
            'Reprovada':   '#fde8e8'   // vermelho claro
        };
        tr.style.backgroundColor = colorMap[status] || '';
        // Remover cursor para não sobrepor o hover do Bootstrap
        tr.style.transition = 'background-color 0.2s ease';
    }

    _statusConfig(status) {
        switch ((status || '').trim()) {
            case 'Aprovada':    return { cls: 'primary', label: 'Aprovada'    };
            case 'Finalizada':  return { cls: 'success', label: 'Finalizada'  };
            case 'Reprovada':   return { cls: 'danger',  label: 'Reprovada'   };
            default:            return { cls: 'warning', label: 'Em Progresso' };
        }
    }

    /** Retorna o <select> de status para a tabela (dentro da célula) */
    _statusSelectHTML(grupo) {
        const status = this.getStatus(grupo);
        const osEsc  = _esc(grupo.numeroOS);
        const opts   = [
            { val: 'Em Progresso', icon: '🟡' },
            { val: 'Aprovada',     icon: '🔵' },
            { val: 'Finalizada',   icon: '🟢' },
            { val: 'Reprovada',    icon: '🔴' }
        ];
        const optionsHTML = opts.map(o =>
            `<option value="${o.val}" ${status === o.val ? 'selected' : ''}>${o.icon} ${o.val}</option>`
        ).join('');

        const cfg      = this._statusConfig(status);
        const colorMap = { primary: '#cfe2ff', success: '#d1e7dd', warning: '#fff3cd', danger: '#f8d7da' };
        const bg       = colorMap[cfg.cls] || '#fff3cd';

        return `<select class="form-select form-select-sm fw-bold border-${cfg.cls}"
                         style="font-size:0.75rem;min-width:125px;background-color:${bg};cursor:pointer;"
                         onchange="event.stopPropagation();gestaoOS.setStatus('${osEsc}', this.value)"
                         onclick="event.stopPropagation()">
                  ${optionsHTML}
                </select>`;
    }

    /** Retorna o <select> de status para dentro do modal */
    _statusModalHTML(grupo, modalOsId) {
        const status = this.getStatus(grupo);
        const osEsc  = _esc(grupo.numeroOS);
        const opts   = [
            { val: 'Em Progresso', icon: '🟡' },
            { val: 'Aprovada',     icon: '🔵' },
            { val: 'Finalizada',   icon: '🟢' },
            { val: 'Reprovada',    icon: '🔴' }
        ];
        const optionsHTML = opts.map(o =>
            `<option value="${o.val}" ${status === o.val ? 'selected' : ''}>${o.icon} ${o.val}</option>`
        ).join('');
        const cfg      = this._statusConfig(status);
        const colorMap = { primary: '#cfe2ff', success: '#d1e7dd', warning: '#fff3cd', danger: '#f8d7da' };
        const bg       = colorMap[cfg.cls] || '#fff3cd';

        return `<select id="statusModal_${modalOsId}"
                         class="form-select form-select-sm fw-bold border-${cfg.cls} w-100"
                         style="background-color:${bg};font-size:0.85rem;"
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

        const status   = this.getStatus(grupo);
        const cfg      = this._statusConfig(status);
        const colorMap = { primary: '#cfe2ff', success: '#d1e7dd', warning: '#fff3cd', danger: '#f8d7da' };
        const bg       = colorMap[cfg.cls] || '#fff3cd';

        const sel = document.getElementById(`statusModal_${modalOsId}`);
        if (sel) {
            sel.className = `form-select form-select-sm fw-bold border-${cfg.cls} w-100`;
            sel.style.backgroundColor = bg;
        }
        // Atualiza badge no header do modal
        const badge = document.getElementById(`statusBadge_${modalOsId}`);
        if (badge) {
            badge.className = `badge bg-${cfg.cls} ms-2`;
            badge.textContent = status;
        }
    }

    _atualizarResumo() {
        if (!this._grupos) return;
        let total = 0, concluidas = 0, gevia = 0;
        this._grupos.forEach(gt => {
            gt.ordens.forEach(go => {
                total++;
                const s = this.getStatus(go);
                if (s === 'Finalizada' || s === 'Aprovada') concluidas++;
                if (this.getGeVia(go.numeroOS) === 'Lançado') gevia++;
            });
        });
        const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        el('resumoOS_concluidas', concluidas);
        el('resumoOS_andamento',  total - concluidas);
        el('resumoOS_gevia',      gevia);
    }

    // ── GeVia (localStorage) ──────────────────────────────────────────────

    getGeVia(numeroOS) {
        return localStorage.getItem('gestaoOS_gevia_' + numeroOS) || 'Pendente';
    }

    setGeVia(numeroOS, valor) {
        if (!valor || valor === 'Pendente') {
            localStorage.removeItem('gestaoOS_gevia_' + numeroOS);
        } else {
            localStorage.setItem('gestaoOS_gevia_' + numeroOS, valor);
        }
        const cel = document.getElementById(`gevia-cel-${CSS.escape(numeroOS)}`);
        if (cel) cel.innerHTML = this._geviaHTML(numeroOS);
        const badge = document.getElementById(`geviaBadge_${numeroOS.replace(/[^a-zA-Z0-9]/g, '_')}`);
        if (badge) badge.outerHTML = this._geviaBadgeHTML(numeroOS, numeroOS.replace(/[^a-zA-Z0-9]/g, '_'));
        this._atualizarResumo();
    }

    _geviaHTML(numeroOS) {
        const valor = this.getGeVia(numeroOS);
        const osEsc = _esc(numeroOS);
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
        const osEsc = _esc(numeroOS);
        return `<select id="geviaBadge_${modalOsId}"
                         class="form-select form-select-sm border-primary text-primary fw-bold d-inline-block"
                         style="width:auto;background-color:#e7f0ff;font-size:0.8rem;"
                         onchange="gestaoOS.setGeVia('${osEsc}', this.value)">
                  <option value="Pendente" ${valor === 'Pendente' ? 'selected' : ''}>○ Pendente</option>
                  <option value="Parcial"  ${valor === 'Parcial'  ? 'selected' : ''}>◑ Parcial</option>
                  <option value="Lançado"  ${valor === 'Lançado'  ? 'selected' : ''}>✔ Lançado</option>
                </select>`;
    }

    // ── Notas (localStorage) — editor textarea inline ──────────────────────

    getNota(numeroOS) {
        return localStorage.getItem('gestaoOS_nota_' + numeroOS) || '';
    }

    /** Abre/fecha o painel de edição inline embaixo da linha da tabela */
    editarNota(numeroOS) {
        const panelId = `notaPanel_${CSS.escape(numeroOS)}`;
        const existing = document.getElementById(panelId);
        if (existing) {
            existing.remove();
            return;
        }

        const nota    = this.getNota(numeroOS);
        const panelEl = document.createElement('tr');
        panelEl.id    = panelId;
        panelEl.innerHTML = `
          <td colspan="8" class="p-2" style="background:#fffde7;border-top:2px solid #ffc107;">
            <div class="d-flex gap-2 align-items-start">
              <textarea id="notaTA_${CSS.escape(numeroOS)}"
                        class="form-control form-control-sm flex-grow-1"
                        rows="3"
                        placeholder="Digite sua anotação sobre esta O.S..."
                        style="font-size:0.85rem;resize:vertical;">${_esc(nota)}</textarea>
              <div class="d-flex flex-column gap-1">
                <button class="btn btn-sm btn-warning"
                        onclick="gestaoOS.salvarNota('${_esc(numeroOS)}')"
                        title="Salvar">
                  <i class="fas fa-save"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary"
                        onclick="gestaoOS.editarNota('${_esc(numeroOS)}')"
                        title="Fechar">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            </div>
          </td>`;

        // Insere a linha do painel logo após a linha da O.S
        const tr = document.getElementById(`nota-cel-${CSS.escape(numeroOS)}`)?.closest('tr');
        if (tr && tr.nextSibling) {
            tr.parentNode.insertBefore(panelEl, tr.nextSibling);
        } else if (tr) {
            tr.parentNode.appendChild(panelEl);
        }

        setTimeout(() => {
            const ta = document.getElementById(`notaTA_${CSS.escape(numeroOS)}`);
            if (ta) ta.focus();
        }, 50);
    }

    salvarNota(numeroOS) {
        const ta = document.getElementById(`notaTA_${CSS.escape(numeroOS)}`);
        if (!ta) return;
        const texto = ta.value.trim();
        texto === ''
            ? localStorage.removeItem('gestaoOS_nota_' + numeroOS)
            : localStorage.setItem('gestaoOS_nota_' + numeroOS, texto);

        const cel = document.getElementById(`nota-cel-${CSS.escape(numeroOS)}`);
        if (cel) cel.innerHTML = this._notaHTML(numeroOS);

        const modalOsId  = numeroOS.replace(/[^a-zA-Z0-9]/g, '_');
        const notaDisplay = document.getElementById(`notaDisplay_${modalOsId}`);
        if (notaDisplay) {
            const salva = this.getNota(numeroOS);
            notaDisplay.innerHTML = salva
                ? _esc(salva)
                : '<em class="text-muted">Nenhuma anotação</em>';
        }
        document.getElementById(`notaPanel_${CSS.escape(numeroOS)}`)?.remove();
    }

    /** Editor de nota dentro do modal */
    abrirEditorNotaModal(numeroOS, modalOsId) {
        const nota     = this.getNota(numeroOS);
        const editorId = `notaEditorModal_${modalOsId}`;

        const existing = document.getElementById(editorId);
        if (existing) {
            existing.remove();
            return;
        }

        const display = document.getElementById(`notaDisplay_${modalOsId}`);
        if (!display) return;

        const editor = document.createElement('div');
        editor.id    = editorId;
        editor.innerHTML = `
          <div class="mt-2 d-flex gap-2 align-items-start">
            <textarea id="notaTAModal_${modalOsId}"
                      class="form-control flex-grow-1"
                      rows="4"
                      placeholder="Digite sua anotação..."
                      style="font-size:0.85rem;resize:vertical;">${_esc(nota)}</textarea>
            <div class="d-flex flex-column gap-1">
              <button class="btn btn-sm btn-warning"
                      onclick="gestaoOS.salvarNotaModal('${_esc(numeroOS)}','${modalOsId}')"
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
        setTimeout(() => {
            const ta = document.getElementById(`notaTAModal_${modalOsId}`);
            if (ta) ta.focus();
        }, 50);
    }

    salvarNotaModal(numeroOS, modalOsId) {
        const ta = document.getElementById(`notaTAModal_${modalOsId}`);
        if (!ta) return;
        const texto = ta.value.trim();
        texto === ''
            ? localStorage.removeItem('gestaoOS_nota_' + numeroOS)
            : localStorage.setItem('gestaoOS_nota_' + numeroOS, texto);

        const display = document.getElementById(`notaDisplay_${modalOsId}`);
        if (display) {
            const salva = this.getNota(numeroOS);
            display.innerHTML = salva ? _esc(salva) : '<em class="text-muted">Nenhuma anotação</em>';
        }
        const cel = document.getElementById(`nota-cel-${CSS.escape(numeroOS)}`);
        if (cel) cel.innerHTML = this._notaHTML(numeroOS);
        document.getElementById(`notaEditorModal_${modalOsId}`)?.remove();
    }

    _notaHTML(numeroOS) {
        const nota  = this.getNota(numeroOS);
        const icon  = nota ? '📝' : '➕';
        const title = nota ? _esc(nota.slice(0, 100)) : 'Adicionar anotação';
        return `<button class="btn btn-sm btn-outline-secondary py-0 px-1"
                    onclick="event.stopPropagation();gestaoOS.editarNota('${_esc(numeroOS)}')"
                    title="${title}" style="font-size:0.8rem;">${icon}</button>`;
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
            if (!numeroOS || numeroOS.toLowerCase() === 'sem os' || numeroOS === '0') return;

            const turma = (rdo['Código Turma'] || rdo.codigoTurma || 'Sem Turma').trim();
            if (_isTMC(turma)) return;

            const encarregado = (rdo.Encarregado || rdo.encarregado || '-').trim();
            const numeroRDO   = (rdo['Número RDO'] || rdo.numeroRDO || rdo.numeroRdo || '').trim();
            const statusRDO   = (rdo['Status OS']  || rdo.statusOS  || '').trim();
            const kmIni       = (rdo['KM Início']  || rdo.kmInicio  || '').toString().trim();
            const kmFim       = (rdo['KM Fim']     || rdo.kmFim     || '').toString().trim();
            const obs         = (rdo.Observações   || rdo.observacoes || rdo.observacao || '').trim();
            const dataStr     = (rdo.Data          || rdo.data       || '').trim();

            if (!turmas.has(turma)) turmas.set(turma, { encarregado, ordens: new Map() });
            const gt = turmas.get(turma);

            if (!gt.ordens.has(numeroOS)) {
                gt.ordens.set(numeroOS, {
                    numeroOS, turma, encarregado,
                    // statusPlanilha: guarda o status normalizado para 4 estados
                    statusPlanilha: 'Em Progresso',
                    datas: [], rdoIds: [],
                    kmInicio: '', kmFim: '',
                    observacoesRDO: new Set()
                });
            }
            const go = gt.ordens.get(numeroOS);

            if (dataStr)   go.datas.push(dataStr);
            if (numeroRDO) go.rdoIds.push(numeroRDO);
            if (obs)       go.observacoesRDO.add(obs);

            // Mapeia status da planilha para o sistema de 4 estados
            // Uma OS é "Finalizada" se qualquer RDO indicar conclusão
            const statusNorm = _normalizarStatusPlanilha(statusRDO);
            if (statusNorm === 'Finalizada') go.statusPlanilha = 'Finalizada';

            if (kmIni && (!go.kmInicio || kmIni < go.kmInicio)) go.kmInicio = kmIni;
            if (kmFim  && (!go.kmFim   || kmFim  > go.kmFim))  go.kmFim    = kmFim;
        });

        // ── PASSO 2: Calcular datas e filtrar por ÚLTIMO RDO no mês/ano
        turmas.forEach((gt, turma) => {
            gt.ordens.forEach((go, numeroOS) => {
                go.datas.sort((a, b) => (_parseData(a) || 0) - (_parseData(b) || 0));
                go.dataInicio    = go.datas[0]                    || '-';
                go.dataUltimoRDO = go.datas[go.datas.length - 1] || '-';

                if (this.filtroMes && this.filtroAno) {
                    const ultimo = go.dataUltimoRDO;
                    if (ultimo && ultimo !== '-') {
                        const [, m, y] = ultimo.split('/');
                        if (+m !== this.filtroMes || +y !== this.filtroAno) {
                            gt.ordens.delete(numeroOS);
                            return;
                        }
                    } else {
                        gt.ordens.delete(numeroOS);
                    }
                }
            });
            if (gt.ordens.size === 0) turmas.delete(turma);
        });

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

        // ── HI: usa _getHHImprodutivas() para cobrir todos os nomes de campo
        const hiRows = [];
        let totalHHImprod = 0;
        this.dados.horasImprodutivas.forEach(hi => {
            const hRDO = (hi['Número RDO'] || hi.numeroRDO || hi.numeroRdo || '').trim();
            if (!rdoIds.has(hRDO)) return;
            const tipo  = (hi.Tipo    || hi.tipo    || '-').trim();
            const data  = (hi['Data RDO'] || hi.dataRDO || hi.data || '').trim();
            const ops   = parseInt(hi.operadores || hi['Operadores'] || 0);
            const horas = this._getHHImprodutivas(hi);
            totalHHImprod += horas;
            hiRows.push(`<tr>
              <td>${_esc(tipo)}</td>
              <td>${_esc(data)}</td>
              <td class="text-end">${ops > 0 ? ops : '—'}</td>
              <td class="text-end fw-bold text-warning">${horas.toFixed(2)}</td>
            </tr>`);
        });
        const hiHTML = hiRows.join('')
            || '<tr><td colspan="4" class="text-muted text-center">Nenhuma HI</td></tr>';

        // ── Observações dos RDOs
        const obsArr  = Array.from(grupo.observacoesRDO);
        const obsHTML = obsArr.length
            ? obsArr.map(o => `<div class="alert alert-warning py-2 mb-2">
                <i class="fas fa-exclamation-circle me-2"></i>${_esc(o)}</div>`).join('')
            : '<span class="text-muted small">Nenhuma observação registrada nos RDOs</span>';

        const nota    = this.getNota(numeroOS);
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
                  <span class="badge bg-${cfg.cls} ms-2" id="statusBadge_${modalOsId}">${_esc(statusAtual)}</span>
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

                <!-- Nota pessoal -->
                <h6 class="border-bottom pb-1 mb-2">
                  <i class="fas fa-sticky-note me-1 text-info"></i>Minha Anotação
                  <button class="btn btn-sm btn-outline-info ms-2 py-0 px-2"
                          onclick="gestaoOS.abrirEditorNotaModal('${_esc(numeroOS)}','${modalOsId}')"
                          style="font-size:0.75rem;">
                    <i class="fas fa-pen me-1"></i>Editar
                  </button>
                </h6>
                <div class="mb-1 border rounded p-2 bg-light small"
                     id="notaDisplay_${modalOsId}"
                     style="min-height:40px;white-space:pre-wrap;">${nota ? _esc(nota) : '<em class="text-muted">Nenhuma anotação</em>'}</div>

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
                <h6 class="border-bottom pb-1 mb-2">
                  <i class="fas fa-pause-circle me-1 text-warning"></i>Horas Improdutivas
                </h6>
                <div class="table-responsive">
                  <table class="table table-sm table-striped mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Tipo</th>
                        <th>Data</th>
                        <th class="text-end">Operadores</th>
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

              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
              </div>
            </div>
          </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        new bootstrap.Modal(document.getElementById(modalId)).show();
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

        let totalOS = 0, totalConcluidas = 0, totalGevia = 0;
        const blocos = [];
        const turmasOrdenadas = Array.from(turmas.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        turmasOrdenadas.forEach(([turma, gt]) => {
            let ordens = Array.from(gt.ordens.values());

            // Filtro de status (4 estados)
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

            totalOS         += ordens.length;
            totalConcluidas += ordens.filter(o => {
                const s = this.getStatus(o);
                return s === 'Finalizada' || s === 'Aprovada';
            }).length;
            totalGevia += ordens.filter(o => this.getGeVia(o.numeroOS) === 'Lançado').length;

            const rows = ordens.map(o => {
                const status   = this.getStatus(o);
                const colorMap = {
                    'Aprovada':    '#e8f4ff',
                    'Finalizada':  '#d4edda',
                    'Em Progresso':'#fff9e6',
                    'Reprovada':   '#fde8e8'
                };
                const rowBg = colorMap[status] || '';

                return `<tr style="cursor:pointer;background-color:${rowBg};transition:background-color 0.2s;"
                            onclick="gestaoOS.abrirModal('${_esc(o.numeroOS)}')">
                  <td class="fw-bold text-primary">${_esc(o.numeroOS)}</td>
                  <td>${_fmtData(o.dataInicio)}</td>
                  <td>${_fmtData(o.dataUltimoRDO)}</td>
                  <td>${_esc(o.kmInicio) || '-'}</td>
                  <td>${_esc(o.kmFim)    || '-'}</td>
                  <td id="status-cel-${_esc(o.numeroOS)}" onclick="event.stopPropagation();">${this._statusSelectHTML(o)}</td>
                  <td id="gevia-cel-${_esc(o.numeroOS)}"  onclick="event.stopPropagation();">${this._geviaHTML(o.numeroOS)}</td>
                  <td id="nota-cel-${_esc(o.numeroOS)}"   onclick="event.stopPropagation();">${this._notaHTML(o.numeroOS)}</td>
                </tr>`;
            }).join('');

            blocos.push(`
            <div class="card mb-4 shadow-sm border-0">
              <div class="card-header fw-bold py-2" style="background:#f0f4f8;">
                <i class="fas fa-hard-hat me-2 text-primary"></i>${_esc(turma)}
                <span class="text-muted fw-normal ms-2">— Encarregado: ${_esc(gt.encarregado)}</span>
                <span class="badge bg-secondary ms-2">${ordens.length} O.S</span>
              </div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-hover table-sm mb-0 align-middle">
                    <thead class="table-light">
                      <tr>
                        <th>Nº O.S</th>
                        <th>Início</th>
                        <th>Último RDO</th>
                        <th>KM Início</th>
                        <th>KM Fim</th>
                        <th style="min-width:130px;">Status</th>
                        <th style="color:#0d6efd;min-width:110px;">GeVia</th>
                        <th>Nota</th>
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
                <i class="fas fa-search me-2"></i>Nenhuma O.S encontrada com os filtros selecionados.</div>`;
            return;
        }

        // Resumo no topo
        const resumo = `<div class="row g-3 mb-4">
          <div class="col-6 col-md-3">
            <div class="card text-center border-0 shadow-sm py-2">
              <div class="text-muted small">Total O.S</div>
              <h4 class="mb-0 text-primary">${totalOS}</h4>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card text-center border-0 shadow-sm py-2">
              <div class="text-muted small">Aprovadas / Finalizadas</div>
              <h4 class="mb-0 text-success" id="resumoOS_concluidas">${totalConcluidas}</h4>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card text-center border-0 shadow-sm py-2">
              <div class="text-muted small">Em Progresso / Reprovadas</div>
              <h4 class="mb-0 text-warning" id="resumoOS_andamento">${totalOS - totalConcluidas}</h4>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card text-center border-0 shadow-sm py-2">
              <div class="text-muted small" style="color:#0d6efd;">Lançadas no GeVia</div>
              <h4 class="mb-0" style="color:#0d6efd;" id="resumoOS_gevia">${totalGevia}</h4>
            </div>
          </div>
        </div>`;

        container.innerHTML = resumo + blocos.join('');
    }
}

// Instância global
const gestaoOS = new GestaoOS();
