/**
 * Sistema de Autenticação por Link Secreto
 * Dashboard Engecom/Encogel
 */

class Auth {
    constructor() {
        this.autenticado = false;
        this.tentativasRestantes = 3;
    }

    /**
     * Verifica se o usuário está autenticado
     */
    verificarAutenticacao() {
        // Verificar se já está autenticado na sessão
        if (sessionStorage.getItem('dashboard_auth') === 'true') {
            this.autenticado = true;
            return true;
        }

        // Verificar parâmetro ?key= na URL
        const urlParams = new URLSearchParams(window.location.search);
        const key = urlParams.get('key');

        if (key === CONFIG.SECRET_KEY) {
            this.autenticado = true;
            try { sessionStorage.setItem('dashboard_auth', 'true'); } catch (e) { /* modo privado */ }
            // Limpar a URL para não expor a chave
            this.limparURL();
            return true;
        }

        return false;
    }

    /**
     * Exibe tela de autenticação
     */
    exibirTelaAuth() {
        const html = `
            <div class="auth-container">
                <div class="auth-card">
                    <div class="auth-header">
                        <i class="fas fa-lock fa-3x mb-3" style="color: #1976D2;"></i>
                        <h2>Dashboard de Medição</h2>
                        <p class="text-muted">Engecom / Encogel</p>
                    </div>
                    <div class="auth-body">
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            Acesso restrito. Use o link fornecido ou insira a chave de acesso.
                        </div>
                        <form id="authForm" onsubmit="return false;">
                            <div class="mb-3">
                                <label for="authKey" class="form-label">Chave de Acesso</label>
                                <input
                                    type="password"
                                    class="form-control"
                                    id="authKey"
                                    placeholder="Digite a chave de acesso"
                                    autocomplete="off"
                                    required
                                >
                            </div>
                            <div id="authError" class="alert alert-danger d-none">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                <span id="authErrorMsg"></span>
                            </div>
                            <button type="submit" class="btn btn-primary w-100" id="btnAuth">
                                <i class="fas fa-sign-in-alt me-2"></i>
                                Acessar Dashboard
                            </button>
                        </form>
                        <div class="mt-3 text-center">
                            <small class="text-muted">
                                <i class="fas fa-shield-alt me-1"></i>
                                Conexão segura
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.innerHTML = html;

        // Event listener para o form
        document.getElementById('authForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.tentarAutenticar();
        });

        // Focus no input
        document.getElementById('authKey').focus();
    }

    /**
     * Tenta autenticar com a chave fornecida
     */
    tentarAutenticar() {
        const keyInput = document.getElementById('authKey');
        const key = keyInput.value.trim();
        const errorDiv = document.getElementById('authError');
        const errorMsg = document.getElementById('authErrorMsg');
        const btnAuth = document.getElementById('btnAuth');

        // Limpar erro anterior
        errorDiv.classList.add('d-none');

        if (key === CONFIG.SECRET_KEY) {
            // Autenticação bem-sucedida
            this.autenticado = true;
            try { sessionStorage.setItem('dashboard_auth', 'true'); } catch (e) { /* modo privado */ }

            // Animação de sucesso
            btnAuth.innerHTML = '<i class="fas fa-check me-2"></i>Acesso Liberado!';
            btnAuth.classList.remove('btn-primary');
            btnAuth.classList.add('btn-success');

            // Recarregar página após 1 segundo
            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } else {
            // Autenticação falhou
            this.tentativasRestantes--;

            if (this.tentativasRestantes > 0) {
                errorMsg.textContent = `Chave incorreta. ${this.tentativasRestantes} tentativa(s) restante(s).`;
                errorDiv.classList.remove('d-none');
                keyInput.value = '';
                keyInput.focus();

                // Shake animation
                keyInput.classList.add('shake');
                setTimeout(() => keyInput.classList.remove('shake'), 500);

            } else {
                // Bloqueado após 3 tentativas
                errorMsg.textContent = 'Acesso bloqueado. Entre em contato com o administrador.';
                errorDiv.classList.remove('d-none');
                keyInput.disabled = true;
                btnAuth.disabled = true;

                // Bloquear por 15 minutos
                const bloqueioAte = Date.now() + (15 * 60 * 1000);
                try { localStorage.setItem('dashboard_bloqueio', bloqueioAte); } catch (e) { /* modo privado */ }
            }
        }
    }

    /**
     * Verifica se está bloqueado por tentativas excessivas
     */
    verificarBloqueio() {
        const bloqueioAte = localStorage.getItem('dashboard_bloqueio');

        if (bloqueioAte && Date.now() < parseInt(bloqueioAte)) {
            const minutosRestantes = Math.ceil((parseInt(bloqueioAte) - Date.now()) / 60000);
            alert(`Acesso bloqueado por ${minutosRestantes} minuto(s) devido a tentativas excessivas.`);
            return true;
        }

        // Limpar bloqueio expirado
        if (bloqueioAte) {
            localStorage.removeItem('dashboard_bloqueio');
        }

        return false;
    }

    /**
     * Limpa a chave da URL (segurança)
     */
    limparURL() {
        const url = new URL(window.location);
        url.searchParams.delete('key');
        window.history.replaceState({}, document.title, url.pathname);
    }

    /**
     * Logout do sistema
     */
    logout() {
        if (confirm('Deseja realmente sair do dashboard?')) {
            sessionStorage.removeItem('dashboard_auth');
            this.autenticado = false;
            window.location.reload();
        }
    }

    /**
     * Verifica autenticação e exibe tela apropriada
     */
    inicializar() {
        // Verificar bloqueio
        if (this.verificarBloqueio()) {
            document.body.innerHTML = `
                <div class="auth-container">
                    <div class="auth-card">
                        <div class="auth-header">
                            <i class="fas fa-ban fa-3x mb-3" style="color: #F44336;"></i>
                            <h2>Acesso Bloqueado</h2>
                        </div>
                        <div class="auth-body">
                            <div class="alert alert-danger">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                Muitas tentativas de acesso falharam.
                                Aguarde 15 minutos antes de tentar novamente.
                            </div>
                        </div>
                    </div>
                </div>
            `;
            return false;
        }

        // Verificar autenticação
        if (!this.verificarAutenticacao()) {
            this.exibirTelaAuth();
            return false;
        }

        return true;
    }
}

// Instância global
const auth = new Auth();

// Estilos CSS para a tela de autenticação
const authStyles = `
<style>
    .auth-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 20px;
    }

    .auth-card {
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        max-width: 450px;
        width: 100%;
        overflow: hidden;
    }

    .auth-header {
        background: linear-gradient(135deg, #1976D2 0%, #1565C0 100%);
        color: white;
        padding: 40px 30px 30px;
        text-align: center;
    }

    .auth-header h2 {
        margin: 0 0 5px;
        font-weight: 600;
    }

    .auth-body {
        padding: 30px;
    }

    .auth-body .form-control {
        padding: 12px 16px;
        border-radius: 8px;
        border: 2px solid #e0e0e0;
        transition: all 0.3s;
    }

    .auth-body .form-control:focus {
        border-color: #1976D2;
        box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.1);
    }

    .auth-body .btn {
        padding: 12px;
        font-weight: 600;
        border-radius: 8px;
        transition: all 0.3s;
    }

    .auth-body .btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(25, 118, 210, 0.3);
    }

    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
    }

    .shake {
        animation: shake 0.5s;
    }

    .alert {
        border-radius: 8px;
        border: none;
    }
</style>
`;

// Injetar estilos no head
document.head.insertAdjacentHTML('beforeend', authStyles);
