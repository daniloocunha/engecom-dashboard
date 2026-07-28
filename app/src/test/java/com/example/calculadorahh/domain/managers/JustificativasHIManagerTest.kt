package com.example.calculadorahh.domain.managers

import com.example.calculadorahh.data.models.CatalogoJustificativasHI
import com.example.calculadorahh.data.models.CategoriaHI
import com.example.calculadorahh.data.models.JustificativaHI
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Testes da lógica pura do catálogo de justificativas de HI: resolução de nomes
 * (incluindo históricos), agrupamento, filtro e cálculo de HH com as regras do
 * catálogo (neutros, fator da Chuva e duração mínima de trem).
 */
class JustificativasHIManagerTest {

    private val chuva = JustificativaHI(
        id = "chuva", nome = "Chuva", categoria = CategoriaHI.NAO_CONTROLAVEL,
        considerarHI = true, considerarPerdaRumo = true, fatorHH = 0.5, ordem = 30
    )
    private val passagemTrens = JustificativaHI(
        id = "passagem_trens", nome = "Passagem de Trens",
        categoria = CategoriaHI.NAO_CONTROLAVEL, fatorHH = 1.0, minutosMinimos = 20,
        ordem = 20, aliases = listOf("Passagens de Trem")
    )
    private val faltaMaterial = JustificativaHI(
        id = "falta_material", nome = "Falta de Material",
        categoria = CategoriaHI.CONTROLAVEL, ordem = 100
    )
    private val outros = JustificativaHI(
        id = "outros", nome = "Outros", categoria = CategoriaHI.CONTROLAVEL,
        exigeDescricao = true, ordem = 160
    )
    private val almoco = JustificativaHI(
        id = "almoco", nome = "Almoço / Refeição", categoria = CategoriaHI.NEUTRO,
        considerarHI = false, considerarPerdaRumo = false, ordem = 200,
        aliases = listOf("Almoço/Refeição")
    )
    private val inativa = JustificativaHI(
        id = "obsoleta", nome = "Obsoleta", categoria = CategoriaHI.CONTROLAVEL,
        ativa = false, ordem = 900
    )

    private val catalogo = CatalogoJustificativasHI(
        versao = 1,
        categorias = listOf(
            CategoriaHI(CategoriaHI.NAO_CONTROLAVEL, "Não Controlável", ordem = 1),
            CategoriaHI(CategoriaHI.CONTROLAVEL, "Controlável", ordem = 2),
            CategoriaHI(CategoriaHI.NEUTRO, "Neutro (não conta como HI)", ordem = 3)
        ),
        justificativas = listOf(chuva, passagemTrens, faltaMaterial, outros, almoco, inativa)
    )

    // ================= resolver =================

    @Test
    fun `resolve por nome exato`() {
        assertEquals(chuva, JustificativasHIManager.resolver(catalogo, "Chuva"))
    }

    @Test
    fun `resolve por id`() {
        assertEquals(faltaMaterial, JustificativasHIManager.resolver(catalogo, "falta_material"))
    }

    @Test
    fun `resolve nome historico por alias`() {
        // RDOs antigos gravaram "Passagens de Trem" (nome do spinner anterior)
        assertEquals(passagemTrens, JustificativasHIManager.resolver(catalogo, "Passagens de Trem"))
        assertEquals(almoco, JustificativasHIManager.resolver(catalogo, "Almoço/Refeição"))
    }

    @Test
    fun `resolve ignorando acento caixa e pontuacao`() {
        assertEquals(almoco, JustificativasHIManager.resolver(catalogo, "almoco refeicao"))
        assertEquals(chuva, JustificativasHIManager.resolver(catalogo, "CHUVA"))
        assertEquals(faltaMaterial, JustificativasHIManager.resolver(catalogo, "falta de material"))
    }

    @Test
    fun `nome desconhecido ou vazio devolve null`() {
        assertNull(JustificativasHIManager.resolver(catalogo, "Greve de marcianos"))
        assertNull(JustificativasHIManager.resolver(catalogo, ""))
        assertNull(JustificativasHIManager.resolver(catalogo, "   "))
    }

    // ================= categorias e listagem =================

    @Test
    fun `ativas ignora inativas e respeita a ordem`() {
        val ativas = JustificativasHIManager.ativas(catalogo)
        assertFalse(ativas.contains(inativa))
        assertEquals(
            listOf("passagem_trens", "chuva", "falta_material", "outros", "almoco"),
            ativas.map { it.id }
        )
    }

    @Test
    fun `agrupamento segue a ordem das categorias`() {
        val grupos = JustificativasHIManager.agrupadasPorCategoria(catalogo)
        assertEquals(
            listOf(CategoriaHI.NAO_CONTROLAVEL, CategoriaHI.CONTROLAVEL, CategoriaHI.NEUTRO),
            grupos.map { it.first.id }
        )
        assertEquals(listOf("passagem_trens", "chuva"), grupos[0].second.map { it.id })
        assertEquals(listOf("almoco"), grupos[2].second.map { it.id })
    }

    @Test
    fun `flags de neutro seguem o catalogo`() {
        assertTrue(almoco.ehNeutra)
        assertFalse(almoco.considerarHI)
        assertFalse(almoco.considerarPerdaRumo)
        assertFalse(JustificativasHIManager.considerarHI(catalogo, "Almoço / Refeição"))
        assertTrue(JustificativasHIManager.considerarHI(catalogo, "Chuva"))
    }

    @Test
    fun `tipo fora do catalogo conta como HI por seguranca`() {
        assertTrue(JustificativasHIManager.considerarHI(catalogo, "Tipo Legado Qualquer"))
    }

    // ================= filtro =================

    @Test
    fun `filtro vazio devolve todas as ativas`() {
        assertEquals(5, JustificativasHIManager.filtrar(catalogo, "").size)
    }

    @Test
    fun `filtro casa nome sem acento e alias`() {
        assertEquals(listOf("almoco"), JustificativasHIManager.filtrar(catalogo, "almoco").map { it.id })
        assertEquals(listOf("passagem_trens"), JustificativasHIManager.filtrar(catalogo, "trem").map { it.id })
        assertEquals(listOf("falta_material"), JustificativasHIManager.filtrar(catalogo, "MATERIAL").map { it.id })
    }

    @Test
    fun `filtro sem resultado devolve lista vazia`() {
        assertTrue(JustificativasHIManager.filtrar(catalogo, "zzzz").isEmpty())
    }

    // ================= calcularHH =================

    @Test
    fun `HH padrao e duracao vezes operadores`() {
        // 60 min x 12 operadores = 12 HH
        assertEquals(12.0, JustificativasHIManager.calcularHH(faltaMaterial, 60, 12), 0.001)
    }

    @Test
    fun `chuva conta metade`() {
        assertEquals(6.0, JustificativasHIManager.calcularHH(chuva, 60, 12), 0.001)
    }

    @Test
    fun `neutro nao gera HH`() {
        assertEquals(0.0, JustificativasHIManager.calcularHH(almoco, 60, 12), 0.001)
    }

    @Test
    fun `trem abaixo do minimo e descartado`() {
        assertEquals(0.0, JustificativasHIManager.calcularHH(passagemTrens, 19, 12), 0.001)
        assertEquals(4.0, JustificativasHIManager.calcularHH(passagemTrens, 20, 12), 0.001)
    }

    @Test
    fun `justificativa desconhecida usa calculo simples`() {
        assertEquals(12.0, JustificativasHIManager.calcularHH(null, 60, 12), 0.001)
    }

    @Test
    fun `outros exige descricao`() {
        assertTrue(outros.exigeDescricao)
        assertFalse(faltaMaterial.exigeDescricao)
    }
}
