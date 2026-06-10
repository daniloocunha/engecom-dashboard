/**
 * Filtros Dinâmicos
 * Gerencia o estado visual do botão "Aplicar Filtros" (mês/ano)
 */

class DashboardFilters {
    /**
     * Inicializa event listeners para filtros
     */
    inicializar() {
        // Event listeners com null guards (elementos podem não existir em todas as views)
        const elMes = document.getElementById('filtroMes');
        const elAno = document.getElementById('filtroAno');

        elMes?.addEventListener('change', () => this.marcarComoPendente());
        elAno?.addEventListener('change', () => this.marcarComoPendente());
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
