/**
 * JustificativasHI — Consulta ao catálogo de justificativas de Horas Improdutivas (HI)
 *
 * Espelha a API de `JustificativasHIManager.kt` do app (fonte de referência), lendo o
 * catálogo embutido em `JUSTIFICATIVAS_HI_BASE` (gerado por
 * scripts/sync-justificativas-hi.js a partir de app/src/main/res/raw/justificativas_hi.json).
 *
 * As consultas são síncronas de propósito: são chamadas dentro de laços de cálculo
 * (merge de HI, apuração de perdas) que não podem ficar `async`. O catálogo muda raramente
 * (é editado à mão e sincronizado via `npm run sync-justificativas`), então não há fetch
 * assíncrono aqui — diferente do fallback CORS de servicos.json em sheets-api.js.
 */
class JustificativasHI {
    /** Catálogo completo. Devolve um catálogo vazio se o arquivo gerado não foi carregado. */
    static _catalogo() {
        if (typeof JUSTIFICATIVAS_HI_BASE !== 'undefined') return JUSTIFICATIVAS_HI_BASE;
        return { versao: 0, categorias: [], justificativas: [] };
    }

    /** Normaliza texto para comparação: minúsculo, sem acento e sem pontuação. */
    static normalizar(texto) {
        return (texto || '')
            .toString()
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    /**
     * Resolve o nome gravado num RDO para a justificativa do catálogo.
     * Tenta, nesta ordem: id, nome exato, alias e nome normalizado (tolera acento,
     * caixa e pontuação). Devolve null se não houver correspondência.
     */
    static resolver(nome) {
        if (!nome) return null;
        const todas = this._catalogo().justificativas || [];

        let achou = todas.find(j => j.id === nome);
        if (achou) return achou;

        achou = todas.find(j => j.nome === nome);
        if (achou) return achou;

        achou = todas.find(j => (j.aliases || []).includes(nome));
        if (achou) return achou;

        const alvo = this.normalizar(nome);
        if (!alvo) return null;
        return todas.find(j =>
            this.normalizar(j.nome) === alvo ||
            (j.aliases || []).some(a => this.normalizar(a) === alvo)
        ) || null;
    }

    /** true se a justificativa deve entrar no total de HI (neutros não entram). Desconhecida = true (falha seguro). */
    static considerarHI(nome) {
        const j = this.resolver(nome);
        return j ? j.considerarHI !== false : true;
    }

    /** 'NAO_CONTROLAVEL' | 'CONTROLAVEL' | 'NEUTRO'. Desconhecida = 'CONTROLAVEL' (falha seguro). */
    static categoria(nome) {
        const j = this.resolver(nome);
        return j ? j.categoria : 'CONTROLAVEL';
    }

    /** Multiplicador de HH (ex.: Chuva = 0.5). Desconhecida = 1.0. */
    static fatorHH(nome) {
        const j = this.resolver(nome);
        return (j && j.fatorHH != null) ? j.fatorHH : 1.0;
    }

    /** Duração mínima em minutos para o evento contar (ex.: trens = 20). Desconhecida = 0. */
    static minutosMinimos(nome) {
        const j = this.resolver(nome);
        return (j && j.minutosMinimos != null) ? j.minutosMinimos : 0;
    }

    /**
     * HH do evento, já aplicando as regras do catálogo:
     * - eventos abaixo de minutosMinimos são descartados (0);
     * - justificativas neutras não geram HH de perda (0);
     * - o total é multiplicado por fatorHH (ex.: Chuva = 0,5).
     *
     * Nome fora do catálogo: calcula HH simples (duração × operadores), igual ao app —
     * falha para o lado seguro, contando a hora em vez de descartá-la silenciosamente.
     *
     * @param {string} nome       Tipo/nome gravado no RDO (id, nome ou alias)
     * @param {number} minutos    duração do evento em minutos
     * @param {number} operadores colaboradores envolvidos
     */
    static calcularHH(nome, minutos, operadores) {
        const j = this.resolver(nome);
        if (!j) return (minutos / 60) * operadores;
        if (j.considerarHI === false) return 0;
        if (minutos < (j.minutosMinimos || 0)) return 0;
        return (minutos / 60) * operadores * (j.fatorHH != null ? j.fatorHH : 1.0);
    }

    /** Justificativas ativas, na ordem de exibição definida no catálogo. */
    static ativas() {
        return (this._catalogo().justificativas || [])
            .filter(j => j.ativa !== false)
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.JustificativasHI = JustificativasHI;
}
