/**
 * Filtros Dinâmicos
 * Gerencia filtros e interações do usuário
 */

class DashboardFilters {
    constructor() {
        this.filtrosAplicados = {};
        this.filtrosFavoritos = this.carregarFavoritos();
    }

    /**
     * 🔍 Salva filtros atuais como favorito (Sprint 3)
     */
    salvarFavorito(nome) {
        const elMes   = document.getElementById('filtroMes');
        const elAno   = document.getElementById('filtroAno');
        const elTurma = document.getElementById('filtroTurma');
        const elTipo  = document.getElementById('filtroTipo');

        if (!elMes || !elAno || !elTurma || !elTipo) return false;

        const filtroAtual = {
            mes: parseInt(elMes.value),
            ano: parseInt(elAno.value),
            turma: elTurma.value,
            tipo: elTipo.value
        };

        this.filtrosFavoritos[nome] = filtroAtual;
        localStorage.setItem('filtrosFavoritos', JSON.stringify(this.filtrosFavoritos));
        debugLog(`[Filters] Favorito "${nome}" salvo`);
        return true;
    }

    /**
     * 🔍 Carrega filtros favoritos do localStorage (Sprint 3)
     */
    carregarFavoritos() {
        try {
            const favoritos = localStorage.getItem('filtrosFavoritos');
            return favoritos ? JSON.parse(favoritos) : {};
        } catch (error) {
            console.error('[Filters] Erro ao carregar favoritos:', error);
            return {};
        }
    }

    /**
     * 🔍 Aplica filtro favorito (Sprint 3)
     */
    aplicarFavorito(nome) {
        const favorito = this.filtrosFavoritos[nome];
        if (!favorito) return false;

        const elMes   = document.getElementById('filtroMes');
        const elAno   = document.getElementById('filtroAno');
        const elTurma = document.getElementById('filtroTurma');
        const elTipo  = document.getElementById('filtroTipo');

        if (elMes)   elMes.value   = favorito.mes;
        if (elAno)   elAno.value   = favorito.ano;
        if (elTurma) elTurma.value = favorito.turma;
        if (elTipo)  elTipo.value  = favorito.tipo;

        return true;
    }

    /**
     * 🔍 Remove filtro favorito (Sprint 3)
     */
    removerFavorito(nome) {
        delete this.filtrosFavoritos[nome];
        localStorage.setItem('filtrosFavoritos', JSON.stringify(this.filtrosFavoritos));
        return true;
    }

    /**
     * 🔍 Lista todos os favoritos (Sprint 3)
     */
    listarFavoritos() {
        return Object.keys(this.filtrosFavoritos);
    }

    /**
     * Inicializa event listeners para filtros
     */
    inicializar() {
        // Event listeners com null guards (elementos podem não existir em todas as views)
        const elMes   = document.getElementById('filtroMes');
        const elAno   = document.getElementById('filtroAno');
        const elTurma = document.getElementById('filtroTurma');
        const elTipo  = document.getElementById('filtroTipo');

        elMes?.addEventListener('change',   () => this.marcarComoPendente());
        elAno?.addEventListener('change',   () => this.marcarComoPendente());
        elTurma?.addEventListener('change', () => this.marcarComoPendente());
        elTipo?.addEventListener('change',  () => {
            this.filtrarTurmasPorTipo();
            this.marcarComoPendente();
        });
    }

    /**
     * Filtra turmas no select baseado no tipo selecionado
     */
    filtrarTurmasPorTipo() {
        const elTipo = document.getElementById('filtroTipo');
        if (!elTipo) return;
        const tipo = elTipo.value;

        const select = document.getElementById('filtroTurma');
        if (!select) return;

        const optgroupTPs  = select.querySelector('optgroup[label="TPs - Turmas de Produção"]');
        const optgroupTMCs = select.querySelector('optgroup[label="TMCs - Turmas de Manutenção"]');
        const optgroupTSs  = select.querySelector('optgroup[label="TSs - Turmas de Solda"]');
        const optgroupOutras = select.querySelector('optgroup[label="Outras"]');

        // Se os optgroups não existirem ainda (carregamento), não fazer nada
        if (!optgroupTPs && !optgroupTMCs && !optgroupTSs) return;

        /**
         * Habilita ou desabilita um optgroup e suas options
         */
        const setGrupo = (grp, habilitado) => {
            if (!grp) return;
            grp.disabled = !habilitado;
            Array.from(grp.querySelectorAll('option')).forEach(opt => opt.disabled = !habilitado);
        };

        if (tipo === 'todos') {
            setGrupo(optgroupTPs, true);
            setGrupo(optgroupTMCs, true);
            setGrupo(optgroupTSs, true);
            setGrupo(optgroupOutras, true);
        } else if (tipo === 'TP') {
            setGrupo(optgroupTPs, true);
            setGrupo(optgroupTMCs, false);
            setGrupo(optgroupTSs, false);
            setGrupo(optgroupOutras, false);
            // Resetar se estava selecionada uma turma de outro tipo
            if (select.value && !select.value.startsWith('TP')) select.value = 'todas';
        } else if (tipo === 'TMC') {
            setGrupo(optgroupTPs, false);
            setGrupo(optgroupTMCs, true);
            setGrupo(optgroupTSs, false);
            setGrupo(optgroupOutras, false);
            if (select.value && !select.value.startsWith('TMC')) select.value = 'todas';
        } else if (tipo === 'TS') {
            setGrupo(optgroupTPs, false);
            setGrupo(optgroupTMCs, false);
            setGrupo(optgroupTSs, true);
            setGrupo(optgroupOutras, false);
            if (select.value && !select.value.startsWith('TS')) select.value = 'todas';
        }
    }

    /**
     * Marca filtro como pendente (visual feedback)
     */
    marcarComoPendente() {
        const btnAplicar = document.querySelector('button[onclick="aplicarFiltros()"]');
        if (btnAplicar && !btnAplicar.classList.contains('btn-warning')) {
            btnAplicar.classList.remove('btn-primary');
            btnAplicar.classList.add('btn-warning');
            btnAplicar.innerHTML = '<i class="fas fa-sync me-2"></i>Filtros Alterados - Clique para Aplicar';
        }
    }

    /**
     * Reseta visual do botão após aplicar
     */
    resetarBotao() {
        const btnAplicar = document.querySelector('button[onclick="aplicarFiltros()"]');
        if (btnAplicar) {
            btnAplicar.classList.remove('btn-warning');
            btnAplicar.classList.add('btn-primary');
            btnAplicar.innerHTML = '<i class="fas fa-filter me-2"></i>Aplicar Filtros';
        }
    }

    /**
     * Obtém valores atuais dos filtros
     */
    obterFiltros() {
        return {
            mes: parseInt(document.getElementById('filtroMes')?.value || 0),
            ano: parseInt(document.getElementById('filtroAno')?.value || 0),
            turma: document.getElementById('filtroTurma')?.value || 'todas',
            tipo: document.getElementById('filtroTipo')?.value || 'todos'
        };
    }

}

// Instância global
const dashboardFilters = new DashboardFilters();

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        dashboardFilters.inicializar();
    });
} else {
    dashboardFilters.inicializar();
}
