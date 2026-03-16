/**
 * Utilitários de segurança HTML
 * Sanitização de strings e sistema de toasts não-bloqueantes
 */

/**
 * Escapa caracteres HTML especiais para prevenir XSS.
 * Usar sempre que inserir dados externos via innerHTML.
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escapa texto para uso seguro dentro de atributos HTML.
 * Escapa &, <, >, " e ' para prevenir XSS e quebra de atributo.
 * @param {string|any} str
 * @returns {string}
 */
function escAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Exibe um toast Bootstrap não-bloqueante.
 * @param {string} msg   - Mensagem a exibir
 * @param {string} tipo  - 'success' | 'danger' | 'warning' | 'info'  (padrão: 'info')
 * @param {number} duracao - Duração em ms (padrão: 5000)
 */
function mostrarToast(msg, tipo = 'info', duracao = 5000) {
    const iconMap = {
        success: 'check-circle',
        danger:  'exclamation-circle',
        warning: 'exclamation-triangle',
        info:    'info-circle'
    };
    const icon = iconMap[tipo] || 'info-circle';
    const id   = 'toast-app-' + Date.now();

    const toastHTML = `
        <div id="${id}" class="toast align-items-center text-bg-${tipo} border-0 position-fixed bottom-0 end-0 m-3"
             role="alert" style="z-index:9999;max-width:420px;" data-bs-delay="${duracao}">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas fa-${icon} me-2"></i>${escapeHtml(msg)}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto"
                        data-bs-dismiss="toast" aria-label="Fechar"></button>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', toastHTML);
    const el = document.getElementById(id);

    if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
        const toast = new bootstrap.Toast(el);
        toast.show();
        el.addEventListener('hidden.bs.toast', () => el.remove());
    } else {
        // Fallback se Bootstrap não estiver disponível
        alert(msg);
        el.remove();
    }
}
