package com.example.calculadorahh.domain.managers

import com.example.calculadorahh.data.models.ChecklistPreenchido
import com.example.calculadorahh.data.models.ChecklistTemplate
import com.example.calculadorahh.data.models.ItemTemplate
import com.example.calculadorahh.data.models.RespostaItem
import com.example.calculadorahh.data.models.SecaoTemplate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Testes da lógica pura do checklist de inspeção: não conformidade,
 * veredito (avaliar), validação obrigatória (validar) e poda de respostas
 * excedentes de seções de repetição.
 */
class ChecklistManagerTest {

    private val itemTecnico = ItemTemplate(
        id = "tecnico", pergunta = "Item técnico", tipo = "sim_nao_na",
        naoConforme = "Não", observacao = true
    )
    private val itemInformativo = ItemTemplate(
        id = "informativo", pergunta = "Item informativo", tipo = "sim_nao",
        observacao = true
    )
    private val itemCritico = ItemTemplate(
        id = "critico", pergunta = "Item crítico", tipo = "sim_nao",
        critico = true, naoConforme = "Não", observacao = true
    )
    private val itemFotoObrigatoria = ItemTemplate(
        id = "fotos_medidas", pergunta = "Fotos das medidas", tipo = "foto",
        foto = true, fotoObrigatoria = true
    )
    private val itemComFoto = ItemTemplate(
        id = "com_foto", pergunta = "Item com foto", tipo = "sim_nao",
        naoConforme = "Não", observacao = true, foto = true
    )
    private val itemRessalva = ItemTemplate(
        id = "ressalva", pergunta = "Teve alguma ressalva?", tipo = "sim_nao",
        observacao = true, observacaoObrigatoriaQuando = "Sim"
    )

    private fun template(vararg secoes: SecaoTemplate) =
        ChecklistTemplate(id = "solda", titulo = "Teste", secoes = secoes.toList())

    private fun secaoGeral(vararg itens: ItemTemplate) =
        SecaoTemplate(id = "geral", titulo = "Geral", tipo = "geral", itens = itens.toList())

    private fun secaoRepeticao(vararg itens: ItemTemplate) =
        SecaoTemplate(id = "rep", titulo = "Por solda", tipo = "repeticao",
            rotuloItem = "Solda", itens = itens.toList())

    // ================= ehNaoConforme =================

    @Test
    fun `item informativo nunca e nao conforme`() {
        assertFalse(itemInformativo.ehNaoConforme("Não"))
        assertFalse(itemInformativo.ehNaoConforme("Sim"))
    }

    @Test
    fun `item tecnico e nao conforme apenas na resposta declarada`() {
        assertTrue(itemTecnico.ehNaoConforme("Não"))
        assertFalse(itemTecnico.ehNaoConforme("Sim"))
        assertFalse(itemTecnico.ehNaoConforme("Não Aplicável"))
        assertFalse(itemTecnico.ehNaoConforme(""))
    }

    @Test
    fun `nao conformidade invertida quando naoConforme e Sim`() {
        val item = ItemTemplate(id = "defeito", tipo = "sim_nao", naoConforme = "Sim")
        assertTrue(item.ehNaoConforme("Sim"))
        assertFalse(item.ehNaoConforme("Não"))
    }

    // ================= avaliar =================

    @Test
    fun `checklist sem respostas comeca aprovado`() {
        val t = template(secaoGeral(itemTecnico, itemInformativo))
        val resultado = ChecklistManager.avaliar(t, ChecklistPreenchido())
        assertEquals(ChecklistPreenchido.SITUACAO_APROVADA, resultado.situacao)
        assertEquals(0, resultado.naoConformidades)
    }

    @Test
    fun `nao conformidade tecnica reprova`() {
        val t = template(secaoGeral(itemTecnico))
        val p = ChecklistPreenchido(
            respostas = mapOf("geral__tecnico" to RespostaItem(valor = "Não"))
        )
        val resultado = ChecklistManager.avaliar(t, p)
        assertEquals(ChecklistPreenchido.SITUACAO_REPROVADA, resultado.situacao)
        assertEquals(1, resultado.naoConformidades)
        assertEquals(0, resultado.itensCriticosReprovados)
    }

    @Test
    fun `resposta negativa em item informativo nao reprova`() {
        val t = template(secaoGeral(itemInformativo))
        val p = ChecklistPreenchido(
            respostas = mapOf("geral__informativo" to RespostaItem(valor = "Não"))
        )
        val resultado = ChecklistManager.avaliar(t, p)
        assertEquals(ChecklistPreenchido.SITUACAO_APROVADA, resultado.situacao)
    }

    @Test
    fun `item critico reprovado conta como critico`() {
        val t = template(secaoGeral(itemCritico))
        val p = ChecklistPreenchido(
            respostas = mapOf("geral__critico" to RespostaItem(valor = "Não"))
        )
        val resultado = ChecklistManager.avaliar(t, p)
        assertEquals(1, resultado.itensCriticosReprovados)
        assertEquals(ChecklistPreenchido.SITUACAO_REPROVADA, resultado.situacao)
    }

    @Test
    fun `avaliar considera todas as repeticoes ate qtdSoldas`() {
        val t = template(secaoRepeticao(itemTecnico))
        val p = ChecklistPreenchido(
            qtdSoldas = 2,
            respostas = mapOf(
                "rep__0__tecnico" to RespostaItem(valor = "Sim"),
                "rep__1__tecnico" to RespostaItem(valor = "Não"),
                // índice 2 está fora de qtdSoldas e não deve contar
                "rep__2__tecnico" to RespostaItem(valor = "Não")
            )
        )
        val resultado = ChecklistManager.avaliar(t, p)
        assertEquals(1, resultado.naoConformidades)
    }

    // ================= validar =================

    @Test
    fun `validar exige resposta em toda pergunta`() {
        val t = template(secaoGeral(itemTecnico, itemInformativo))
        val pendencias = ChecklistManager.validar(t, ChecklistPreenchido())
        assertEquals(2, pendencias.size)
        assertTrue(pendencias.all { it.tipo == ChecklistManager.TipoPendencia.RESPOSTA })
    }

    @Test
    fun `validar exige observacao quando nao conforme`() {
        val t = template(secaoGeral(itemTecnico))
        val semObs = ChecklistPreenchido(
            respostas = mapOf("geral__tecnico" to RespostaItem(valor = "Não"))
        )
        val pendencias = ChecklistManager.validar(t, semObs)
        assertEquals(1, pendencias.size)
        assertEquals(ChecklistManager.TipoPendencia.OBSERVACAO, pendencias[0].tipo)

        val comObs = ChecklistPreenchido(
            respostas = mapOf("geral__tecnico" to RespostaItem(valor = "Não", observacao = "trilho danificado"))
        )
        assertTrue(ChecklistManager.validar(t, comObs).isEmpty())
    }

    @Test
    fun `validar exige observacao da ressalva quando Sim`() {
        val t = template(secaoGeral(itemRessalva))
        val semObs = ChecklistPreenchido(
            respostas = mapOf("geral__ressalva" to RespostaItem(valor = "Sim"))
        )
        val pendencias = ChecklistManager.validar(t, semObs)
        assertEquals(1, pendencias.size)
        assertEquals(ChecklistManager.TipoPendencia.OBSERVACAO, pendencias[0].tipo)

        val semRessalva = ChecklistPreenchido(
            respostas = mapOf("geral__ressalva" to RespostaItem(valor = "Não"))
        )
        assertTrue(ChecklistManager.validar(t, semRessalva).isEmpty())
    }

    @Test
    fun `validar exige foto obrigatoria`() {
        val t = template(secaoGeral(itemFotoObrigatoria))
        val pendencias = ChecklistManager.validar(t, ChecklistPreenchido())
        assertEquals(1, pendencias.size)
        assertEquals(ChecklistManager.TipoPendencia.FOTO, pendencias[0].tipo)

        val comFoto = ChecklistPreenchido(
            respostas = mapOf("geral__fotos_medidas" to RespostaItem(fotos = listOf("/x/foto.jpg")))
        )
        assertTrue(ChecklistManager.validar(t, comFoto).isEmpty())
    }

    @Test
    fun `validar exige foto como evidencia de nao conformidade`() {
        val t = template(secaoGeral(itemComFoto))
        val ncSemFoto = ChecklistPreenchido(
            respostas = mapOf("geral__com_foto" to RespostaItem(valor = "Não", observacao = "obs"))
        )
        val pendencias = ChecklistManager.validar(t, ncSemFoto)
        assertEquals(1, pendencias.size)
        assertEquals(ChecklistManager.TipoPendencia.FOTO, pendencias[0].tipo)

        // Conforme: foto não é exigida
        val conforme = ChecklistPreenchido(
            respostas = mapOf("geral__com_foto" to RespostaItem(valor = "Sim"))
        )
        assertTrue(ChecklistManager.validar(t, conforme).isEmpty())
    }

    @Test
    fun `validar cobre todas as repeticoes`() {
        val t = template(secaoRepeticao(itemTecnico))
        val p = ChecklistPreenchido(
            qtdSoldas = 3,
            respostas = mapOf("rep__0__tecnico" to RespostaItem(valor = "Sim"))
        )
        val pendencias = ChecklistManager.validar(t, p)
        assertEquals(2, pendencias.size)
        assertEquals(setOf("rep__1__tecnico", "rep__2__tecnico"), pendencias.map { it.chave }.toSet())
    }

    // ================= podarRespostasExcedentes =================

    @Test
    fun `poda remove respostas alem de qtdSoldas e devolve fotos orfas`() {
        val t = template(secaoGeral(itemInformativo), secaoRepeticao(itemTecnico))
        val p = ChecklistPreenchido(
            qtdSoldas = 1,
            respostas = mapOf(
                "geral__informativo" to RespostaItem(valor = "Sim"),
                "rep__0__tecnico" to RespostaItem(valor = "Sim"),
                "rep__1__tecnico" to RespostaItem(valor = "Não", fotos = listOf("/x/orfa.jpg"))
            )
        )
        val (podado, fotosOrfas) = ChecklistManager.podarRespostasExcedentes(t, p)
        assertEquals(setOf("geral__informativo", "rep__0__tecnico"), podado.respostas.keys)
        assertEquals(listOf("/x/orfa.jpg"), fotosOrfas)
    }
}
