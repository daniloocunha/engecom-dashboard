/**
 * GlobalSearchIndex — Busca Global Inteligente
 * Versão: 1.0.0
 *
 * Funcionalidades:
 *  - Índice invertido em memória (token → [docs])
 *  - Normalização: sem acento, lowercase, pontuação removida
 *  - Sinônimos: os/o.s, hh/hora-homem, hi/improdutiva, tp/ts
 *  - Ranking: match exato > prefixo > match parcial; bônus por campo
 *  - Debounce de 200ms
 *  - Autocomplete com até 8 resultados agrupados por categoria
 *  - Ação "ir para" navega ao módulo certo
 */
class GlobalSearchIndex {
    constructor() {
        this._indice     = new Map();   // token → Set<docId>
        this._docs       = new Map();   // docId → doc
        this._construido = false;
        this._debounce   = null;

        this._sinonimos = {
            'os': ['o.s', 'ordem', 'numero os', 'numero de serviço'],
            'o.s': ['os', 'ordem'],
            'rdo': ['registro diario', 'relatorio', 'registro'],
            'hh': ['hora homem', 'hora-homem', 'horas'],
            'hi': ['improdutiva', 'hora improdutiva', 'perda'],
            'tp': ['turma producao', 'turma de producao'],
            'ts': ['turma soldagem', 'turma de soldagem'],
            'encarregado': ['lider', 'responsavel', 'chefe'],
        };
    }

    // ─── Construção do índice ─────────────────────────────────────────────────

    construir(dados) {
        if (!dados) return;
        this._indice.clear();
        this._docs.clear();
        let id = 0;

        // RDOs
        (dados.rdos || []).forEach(r => {
            if ((r['Deletado'] || r.deletado || '').toLowerCase() === 'sim') return;
            const doc = {
                id:       ++id,
                tipo:     'rdo',
                titulo:   r['Número RDO'] || r.numeroRDO || '—',
                sub:      `${r.Data || r.data || ''} · ${r['Código Turma'] || r.codigoTurma || ''} · ${r.Local || r.local || ''}`,
                chips:    [r['Número OS'] || r.numeroOS || '', r['Código Turma'] || r.codigoTurma || ''].filter(Boolean),
                acao:     { modulo: 'calendario', turma: r['Código Turma'] || r.codigoTurma || '', data: r.Data || r.data || '' },
                _campos:  [
                    { peso: 10, val: r['Número RDO'] || r.numeroRDO || '' },
                    { peso: 8,  val: r['Número OS']  || r.numeroOS  || '' },
                    { peso: 5,  val: r['Código Turma'] || r.codigoTurma || '' },
                    { peso: 4,  val: r.Encarregado   || r.encarregado   || '' },
                    { peso: 3,  val: r.Local         || r.local         || '' },
                    { peso: 2,  val: r.Observações   || r.observacoes   || '' },
                ],
                _raw: r,
            };
            this._indexar(doc);
        });

        // Serviços
        (dados.servicos || []).forEach(s => {
            const doc = {
                id:       ++id,
                tipo:     'servico',
                titulo:   s['Descrição'] || s.descricao || s.Descricao || '—',
                sub:      `RDO: ${s['Número RDO'] || s.numeroRDO || ''}`,
                chips:    [`Qtd: ${s.Quantidade || s.quantidade || ''}`, `Coef: ${s.Coeficiente || s.coeficiente || ''}`].filter(c => !c.endsWith(': ')),
                acao:     { modulo: 'calendario', numeroRDO: s['Número RDO'] || s.numeroRDO || '' },
                _campos:  [
                    { peso: 6, val: s['Descrição'] || s.descricao || '' },
                    { peso: 8, val: s['Número RDO'] || s.numeroRDO || '' },
                ],
                _raw: s,
            };
            this._indexar(doc);
        });

        // Horas Improdutivas
        (dados.horasImprodutivas || []).forEach(h => {
            const doc = {
                id:       ++id,
                tipo:     'hi',
                titulo:   h.Tipo || h.tipo || '—',
                sub:      `RDO: ${h['Número RDO'] || h.numeroRDO || ''} · ${h['Hora Início'] || h.horaInicio || ''} → ${h['Hora Fim'] || h.horaFim || ''}`,
                chips:    [`${h.Operadores || h.operadores || ''} op.`].filter(c => c !== ' op.'),
                acao:     { modulo: 'calendario', numeroRDO: h['Número RDO'] || h.numeroRDO || '' },
                _campos:  [
                    { peso: 5, val: h.Tipo || h.tipo || '' },
                    { peso: 8, val: h['Número RDO'] || h.numeroRDO || '' },
                    { peso: 2, val: h['Descrição'] || h.descricao || '' },
                ],
                _raw: h,
            };
            this._indexar(doc);
        });

        this._construido = true;
        debugLog(`[Search] Índice construído: ${this._docs.size} documentos`);
    }

    _indexar(doc) {
        this._docs.set(doc.id, doc);
        const tokens = new Set();

        doc._campos.forEach(({ val }) => {
            this._tokenizar(val).forEach(t => tokens.add(t));
        });

        tokens.forEach(token => {
            if (!this._indice.has(token)) this._indice.set(token, new Set());
            this._indice.get(token).add(doc.id);
        });
    }

    _tokenizar(texto) {
        if (!texto) return [];
        return this._normalizar(texto)
            .split(/[\s\-\/\.\+]+/)
            .filter(t => t.length > 1);
    }

    _normalizar(texto) {
        return String(texto)
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s\-\/\.\+]/g, ' ');
    }

    // ─── Busca ───────────────────────────────────────────────────────────────

    buscar(query, limite = 8) {
        if (!this._construido || !query || query.trim().length < 2) return [];

        const termosOriginais = this._tokenizar(query);
        const termos = this._expandirSinonimos(termosOriginais);

        // Encontrar docs candidatos
        const scores = new Map(); // docId → score

        termos.forEach(termo => {
            // Match exato de token
            if (this._indice.has(termo)) {
                this._indice.get(termo).forEach(docId => {
                    scores.set(docId, (scores.get(docId) || 0) + 3);
                });
            }
            // Match por prefixo
            this._indice.forEach((ids, token) => {
                if (token !== termo && token.startsWith(termo)) {
                    ids.forEach(docId => {
                        scores.set(docId, (scores.get(docId) || 0) + 1);
                    });
                }
            });
        });

        // Calcular score final ponderado pelo campo
        const resultados = [];
        scores.forEach((score, docId) => {
            const doc = this._docs.get(docId);
            if (!doc) return;

            let scoreTotal = 0;
            termosOriginais.forEach(termo => {
                doc._campos.forEach(({ peso, val }) => {
                    const norm = this._normalizar(val);
                    if (norm.includes(termo)) scoreTotal += peso;
                    if (norm === termo) scoreTotal += peso * 2; // match exato
                });
            });
            scoreTotal += score;

            if (scoreTotal > 0) {
                resultados.push({ doc, score: scoreTotal });
            }
        });

        // Ordenar por score desc
        resultados.sort((a, b) => b.score - a.score);

        // Agrupar por tipo (máx 3 por tipo, total 8)
        return this._agrupar(resultados, limite);
    }

    _expandirSinonimos(termos) {
        const expandidos = new Set(termos);
        termos.forEach(t => {
            (this._sinonimos[t] || []).forEach(s => {
                this._tokenizar(s).forEach(tk => expandidos.add(tk));
            });
        });
        return Array.from(expandidos);
    }

    _agrupar(resultados, limite) {
        const porTipo = { rdo: [], servico: [], hi: [] };
        resultados.forEach(r => {
            const tipo = r.doc.tipo;
            if (porTipo[tipo] && porTipo[tipo].length < 4) {
                porTipo[tipo].push(r);
            }
        });

        const final = [
            ...porTipo.rdo,
            ...porTipo.servico,
            ...porTipo.hi,
        ];
        return final.slice(0, limite).map(r => r.doc);
    }

    // ─── Navegação ───────────────────────────────────────────────────────────

    navegar(doc) {
        const acao = doc.acao;
        if (!acao) return;

        // Determinar turma a partir do numeroRDO se não vier diretamente
        let turma = acao.turma;
        let data  = acao.data;

        if (!turma && acao.numeroRDO) {
            const rdo = this._encontrarRDO(acao.numeroRDO);
            if (rdo) {
                turma = rdo['Código Turma'] || rdo.codigoTurma || '';
                data  = rdo.Data || rdo.data || '';
            }
        }

        if (!turma || !data) {
            mostrarToast('Não foi possível navegar: turma ou data não encontrada.', 'warning');
            return;
        }

        // Fechar dropdown de busca
        this._fecharDropdown();

        // Usar a função de navegação existente na Visão Geral
        if (typeof window._vgNavDia === 'function') {
            window._vgNavDia(acao.numeroRDO || null, data, turma);
        } else {
            // Fallback: navegar para a aba do calendário correspondente
            const tipo = turma.startsWith('TS') ? 'ts' : 'tp';
            const tabEl = document.getElementById(`tab-calendario-${tipo}`);
            if (tabEl) tabEl.click();

            setTimeout(() => {
                if (tipo === 'tp' && typeof calendarioTP !== 'undefined') {
                    const [d, m, y] = data.split('/');
                    if (d && m && y) {
                        calendarioTP.setFiltros(parseInt(m), parseInt(y), 'todas');
                        calendarioTP.renderizarTodos();
                    }
                } else if (typeof calendarioTS !== 'undefined') {
                    const [d, m, y] = data.split('/');
                    if (d && m && y) {
                        calendarioTS.setFiltros(parseInt(m), parseInt(y), 'todas');
                        calendarioTS.renderizarTodos();
                    }
                }
            }, 300);
        }
    }

    _encontrarRDO(numeroRDO) {
        for (const [, doc] of this._docs) {
            if (doc.tipo === 'rdo' && (doc._raw['Número RDO'] || doc._raw.numeroRDO) === numeroRDO) {
                return doc._raw;
            }
        }
        return null;
    }

    // ─── UI ──────────────────────────────────────────────────────────────────

    inicializarUI() {
        const input = document.getElementById('buscaGlobalInput');
        const drop  = document.getElementById('buscaGlobalDrop');
        if (!input || !drop) return;

        input.addEventListener('input', () => {
            clearTimeout(this._debounce);
            this._debounce = setTimeout(() => this._atualizar(input, drop), 200);
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Escape') this._fecharDropdown();
            if (e.key === 'Enter') {
                const primeiro = drop.querySelector('.search-item');
                if (primeiro) primeiro.click();
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const items = drop.querySelectorAll('.search-item');
                if (items.length) { items[0].focus(); }
            }
        });

        // Navegação por teclado dentro do dropdown
        drop.addEventListener('keydown', e => {
            const items = Array.from(drop.querySelectorAll('.search-item'));
            const idx   = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown' && idx < items.length - 1) { e.preventDefault(); items[idx + 1].focus(); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); idx > 0 ? items[idx - 1].focus() : input.focus(); }
            if (e.key === 'Escape')    { this._fecharDropdown(); input.focus(); }
        });

        // Fechar ao clicar fora
        document.addEventListener('click', e => {
            if (!e.target.closest('#buscaGlobalWrapper')) this._fecharDropdown();
        });
    }

    _atualizar(input, drop) {
        const q = input.value.trim();

        if (q.length < 2) {
            drop.style.display = 'none';
            return;
        }

        const resultados = this.buscar(q);

        if (!resultados.length) {
            drop.innerHTML = '<div class="search-empty">Nenhum resultado encontrado</div>';
            drop.style.display = 'block';
            return;
        }

        // Agrupar por tipo
        const grupos = {};
        resultados.forEach(doc => {
            if (!grupos[doc.tipo]) grupos[doc.tipo] = [];
            grupos[doc.tipo].push(doc);
        });

        const labels = { rdo: '📄 RDOs', servico: '🔧 Serviços', hi: '⏸ Horas Improdutivas' };

        let html = '';
        Object.entries(grupos).forEach(([tipo, docs]) => {
            html += `<div class="search-group-label">${labels[tipo] || tipo}</div>`;
            docs.forEach(doc => {
                const chipsHtml = doc.chips.map(c =>
                    `<span class="search-chip">${_escHtml(c)}</span>`
                ).join('');

                html += `<div class="search-item" tabindex="0"
                    data-doc-id="${doc.id}"
                    onclick="searchIndex._clicarItem(${doc.id})"
                    onkeydown="if(event.key==='Enter')searchIndex._clicarItem(${doc.id})">
                  <div class="search-item-titulo">${_escHtml(doc.titulo)}</div>
                  <div class="search-item-sub">${_escHtml(doc.sub)}</div>
                  ${chipsHtml ? `<div class="search-chips">${chipsHtml}</div>` : ''}
                </div>`;
            });
        });

        drop.innerHTML = html;
        drop.style.display = 'block';
    }

    _clicarItem(docId) {
        const doc = this._docs.get(docId);
        if (doc) this.navegar(doc);
    }

    _fecharDropdown() {
        const drop = document.getElementById('buscaGlobalDrop');
        if (drop) drop.style.display = 'none';
        const input = document.getElementById('buscaGlobalInput');
        if (input) input.value = '';
    }
}

// Instância global
const searchIndex = new GlobalSearchIndex();
