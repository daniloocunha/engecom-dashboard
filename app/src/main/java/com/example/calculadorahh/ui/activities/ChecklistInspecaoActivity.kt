package com.example.calculadorahh.ui.activities

import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.Environment
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.example.calculadorahh.BuildConfig
import com.example.calculadorahh.data.database.DatabaseHelper
import com.example.calculadorahh.data.models.ChecklistPreenchido
import com.example.calculadorahh.data.models.ChecklistTemplate
import com.example.calculadorahh.data.models.ItemTemplate
import com.example.calculadorahh.data.models.SecaoTemplate
import com.example.calculadorahh.databinding.ActivityChecklistInspecaoBinding
import com.example.calculadorahh.domain.managers.ChecklistManager
import com.example.calculadorahh.data.models.RespostaItem
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import java.io.File

/**
 * Tela de autoinspeção de qualidade, espelhando o formulário de auditoria da
 * RUMO. Renderiza dinamicamente o template (res/raw/checklist_<tipo>.json),
 * calcula em tempo real o veredito (Aprovada/Reprovada), permite anexar fotos
 * (câmera ou galeria) nos itens que o formulário da RUMO fotografa e valida o
 * preenchimento obrigatório antes de salvar.
 *
 * Extras esperados:
 * - EXTRA_TIPO (padrão "solda")
 * - EXTRA_NUMERO_RDO, EXTRA_NUMERO_OS, EXTRA_DATA, EXTRA_ENCARREGADO, EXTRA_LOCAL
 */
class ChecklistInspecaoActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_TIPO = "checklist_tipo"
        const val EXTRA_NUMERO_RDO = "checklist_numero_rdo"
        const val EXTRA_NUMERO_OS = "checklist_numero_os"
        const val EXTRA_DATA = "checklist_data"
        const val EXTRA_ENCARREGADO = "checklist_encarregado"
        const val EXTRA_LOCAL = "checklist_local"

        private const val MAX_SOLDAS = 30
        private const val ESTADO_PREENCHIDO = "estado_preenchido"
        private const val ESTADO_FOTO_CHAVE = "estado_foto_chave"
        private const val ESTADO_FOTO_ARQUIVO = "estado_foto_arquivo"

        // Cor de erro resolvida do tema — ver corDoTema()
        private val REGEX_DATA = Regex("""\d{2}/\d{2}/\d{4}""")
    }

    /** Referências de UI de um item, para marcar pendências de validação. */
    private data class ItemUi(
        val bloco: View,
        val enunciado: TextView,
        val corEnunciado: android.content.res.ColorStateList,
        val tilObservacao: TextInputLayout?,
        val containerFotos: LinearLayout?,
        val txtErroFoto: TextView?
    )

    private lateinit var binding: ActivityChecklistInspecaoBinding
    private lateinit var db: DatabaseHelper
    private lateinit var template: ChecklistTemplate

    private lateinit var preenchido: ChecklistPreenchido

    /** Container que hospeda as soldas de uma seção de repetição (re-renderizado). */
    private var containerRepeticao: LinearLayout? = null
    private var secaoRepeticao: SecaoTemplate? = null

    private val itemUis = mutableMapOf<String, ItemUi>()
    private val tilsIdentificacao = mutableMapOf<String, TextInputLayout>()

    /** Item aguardando o resultado da câmera/galeria. */
    private var fotoPendenteChave: String? = null
    private var fotoPendenteArquivo: File? = null

    private val capturarFoto =
        registerForActivityResult(ActivityResultContracts.TakePicture()) { sucesso ->
            val chave = fotoPendenteChave
            val arquivo = fotoPendenteArquivo
            fotoPendenteChave = null
            fotoPendenteArquivo = null
            if (sucesso && chave != null && arquivo != null && arquivo.exists()) {
                adicionarFoto(chave, arquivo.absolutePath)
            } else {
                arquivo?.delete()
            }
        }

    private val escolherDaGaleria =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            val chave = fotoPendenteChave
            fotoPendenteChave = null
            fotoPendenteArquivo = null
            if (uri == null || chave == null) return@registerForActivityResult
            val destino = novoArquivoFoto()
            try {
                contentResolver.openInputStream(uri)?.use { entrada ->
                    destino.outputStream().use { saida -> entrada.copyTo(saida) }
                }
                adicionarFoto(chave, destino.absolutePath)
            } catch (e: Exception) {
                destino.delete()
                Toast.makeText(this, "Não foi possível importar a foto", Toast.LENGTH_SHORT).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityChecklistInspecaoBinding.inflate(layoutInflater)
        setContentView(binding.root)

        db = DatabaseHelper.getInstance(this)

        val tipo = intent.getStringExtra(EXTRA_TIPO) ?: "solda"
        val carregado = ChecklistManager.carregarTemplate(this, tipo)
        if (carregado == null) {
            Toast.makeText(this, "Checklist indisponível para este tipo", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        template = carregado

        val numeroRDO = intent.getStringExtra(EXTRA_NUMERO_RDO) ?: ""

        // Restaura o estado após rotação/morte de processo (ex.: durante a câmera);
        // senão carrega checklist existente ou cria um novo a partir do RDO.
        val restaurado: ChecklistPreenchido? = savedInstanceState?.let {
            @Suppress("DEPRECATION")
            it.getParcelable(ESTADO_PREENCHIDO)
        }
        preenchido = restaurado
            ?: db.obterChecklist(numeroRDO, tipo)
            ?: ChecklistPreenchido(
                tipo = tipo,
                numeroRDO = numeroRDO,
                numeroOS = intent.getStringExtra(EXTRA_NUMERO_OS) ?: "",
                data = intent.getStringExtra(EXTRA_DATA) ?: "",
                encarregado = intent.getStringExtra(EXTRA_ENCARREGADO) ?: "",
                local = intent.getStringExtra(EXTRA_LOCAL) ?: "",
                qtdSoldas = 1
            )
        savedInstanceState?.getString(ESTADO_FOTO_CHAVE)?.let { fotoPendenteChave = it }
        savedInstanceState?.getString(ESTADO_FOTO_ARQUIVO)?.let { fotoPendenteArquivo = File(it) }

        binding.toolbar.title = template.titulo
        binding.toolbar.setNavigationOnClickListener { finish() }

        // Quando há um RDO vinculado, mostra-o como contexto (não editável).
        if (preenchido.numeroRDO.isNotBlank()) {
            binding.txtCabecalho.text = "RDO ${preenchido.numeroRDO}"
        } else {
            binding.txtCabecalho.visibility = View.GONE
        }

        renderizarTudo()
        atualizarVeredito()

        binding.fabSalvar.setOnClickListener { salvar() }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putParcelable(ESTADO_PREENCHIDO, preenchido)
        fotoPendenteChave?.let { outState.putString(ESTADO_FOTO_CHAVE, it) }
        fotoPendenteArquivo?.let { outState.putString(ESTADO_FOTO_ARQUIVO, it.absolutePath) }
    }

    // ==================================================================
    // Renderização dinâmica
    // ==================================================================

    private fun renderizarTudo() {
        binding.containerSecoes.removeAllViews()
        itemUis.clear()
        tilsIdentificacao.clear()
        renderizarIdentificacao()
        for (secao in template.secoes) {
            if (secao.isRepeticao) {
                renderizarSecaoRepeticao(secao)
            } else {
                renderizarSecaoGeral(secao)
            }
        }
        renderizarObservacoesGerais()
    }

    /**
     * Seção de identificação editável, espelhando o cabeçalho do formulário da
     * RUMO (O.S, encarregado + código, líder + código, data, local). Preenchida
     * a partir do RDO quando aberta por ele; digitável quando aberta avulsa
     * pela tela inicial. Todos os campos são obrigatórios.
     */
    private fun renderizarIdentificacao() {
        val card = novoCard()
        val col = card.getChildAt(0) as LinearLayout
        col.addView(tituloSecao("Identificação"))

        col.addView(campoIdentificacao("os", "Número da O.S", preenchido.numeroOS) {
            preenchido = preenchido.copy(numeroOS = it)
            oferecerChecklistExistente(it)
        })
        col.addView(campoIdentificacao("encarregado", "Encarregado (nome completo)", preenchido.encarregado) {
            preenchido = preenchido.copy(encarregado = it)
        })
        col.addView(campoIdentificacao("encarregado_codigo", "Encarregado (código)", preenchido.encarregadoCodigo) {
            preenchido = preenchido.copy(encarregadoCodigo = it)
        })
        col.addView(campoIdentificacao("lider", "Líder (nome)", preenchido.lider) {
            preenchido = preenchido.copy(lider = it)
        })
        col.addView(campoIdentificacao("lider_codigo", "Líder (código)", preenchido.liderCodigo) {
            preenchido = preenchido.copy(liderCodigo = it)
        })
        col.addView(campoIdentificacao("data", "Data de execução (dd/MM/aaaa)", preenchido.data) {
            preenchido = preenchido.copy(data = it)
        })
        col.addView(campoIdentificacao("local", "Localização (equipamento, SUB e KM — CV ou TG)", preenchido.local) {
            preenchido = preenchido.copy(local = it)
        })

        binding.containerSecoes.addView(card)
    }

    /** Campo de identificação rotulado; guarda a referência para marcar erros. */
    private fun campoIdentificacao(
        id: String,
        rotulo: String,
        valor: String,
        onChange: (String) -> Unit
    ): View {
        val til = TextInputLayout(this).apply {
            hint = rotulo
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(8) }
        }
        val edit = TextInputEditText(til.context).apply {
            setText(valor)
            setSingleLine(true)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    onChange(s?.toString()?.trim() ?: "")
                    til.error = null
                }
            })
        }
        til.addView(edit)
        tilsIdentificacao[id] = til
        return til
    }

    /** O.S para a qual já oferecemos carregar um checklist existente. */
    private var osOferecida: String? = null

    /**
     * Num checklist avulso (sem RDO), se o usuário digitar uma O.S que já tem
     * checklist salvo, oferece carregá-lo — sem isso o preenchimento anterior
     * seria sobrescrito sem aviso ao salvar.
     */
    private fun oferecerChecklistExistente(numeroOS: String) {
        if (preenchido.numeroRDO.isNotBlank() || preenchido.respostas.isNotEmpty()) return
        if (numeroOS.length < 6 || numeroOS == osOferecida) return
        val existente = db.obterChecklist(numeroOS, preenchido.tipo) ?: return
        osOferecida = numeroOS
        AlertDialog.Builder(this)
            .setTitle("Checklist já existente")
            .setMessage(
                "Já existe um checklist salvo para a O.S $numeroOS " +
                    "(situação: ${existente.situacao}). Deseja carregá-lo para edição?"
            )
            .setPositiveButton("Carregar") { _, _ ->
                preenchido = existente
                renderizarTudo()
                atualizarVeredito()
            }
            .setNegativeButton("Começar do zero", null)
            .show()
    }

    private fun renderizarSecaoGeral(secao: SecaoTemplate) {
        val card = novoCard()
        val col = card.getChildAt(0) as LinearLayout
        col.addView(tituloSecao(secao.titulo))
        for (item in secao.itens) {
            val chave = ChecklistPreenchido.chaveResposta(secao.id, item.id)
            col.addView(blocoItem(item, chave))
        }
        binding.containerSecoes.addView(card)
    }

    private fun renderizarSecaoRepeticao(secao: SecaoTemplate) {
        secaoRepeticao = secao

        // Cabeçalho da seção + controle de quantidade
        val card = novoCard()
        val col = card.getChildAt(0) as LinearLayout
        col.addView(tituloSecao(secao.titulo))

        val linha = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(4) }
        }
        linha.addView(TextView(this).apply {
            text = "Quantidade de ${secao.rotuloItem.lowercase()}s:"
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        })
        val btnMenos = botaoQtd("–")
        val txtQtd = TextView(this).apply {
            text = preenchido.qtdSoldas.toString()
            textSize = 18f
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(dp(48), ViewGroup.LayoutParams.WRAP_CONTENT)
        }
        val btnMais = botaoQtd("+")
        btnMenos.setOnClickListener {
            if (preenchido.qtdSoldas > 1) {
                preenchido = preenchido.copy(qtdSoldas = preenchido.qtdSoldas - 1)
                txtQtd.text = preenchido.qtdSoldas.toString()
                renderizarItensRepeticao()
                atualizarVeredito()
            }
        }
        btnMais.setOnClickListener {
            if (preenchido.qtdSoldas < MAX_SOLDAS) {
                preenchido = preenchido.copy(qtdSoldas = preenchido.qtdSoldas + 1)
                txtQtd.text = preenchido.qtdSoldas.toString()
                renderizarItensRepeticao()
                atualizarVeredito()
            }
        }
        linha.addView(btnMenos)
        linha.addView(txtQtd)
        linha.addView(btnMais)
        col.addView(linha)
        binding.containerSecoes.addView(card)

        // Container das soldas
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        containerRepeticao = container
        binding.containerSecoes.addView(container)
        renderizarItensRepeticao()
    }

    private fun renderizarItensRepeticao() {
        val secao = secaoRepeticao ?: return
        val container = containerRepeticao ?: return
        container.removeAllViews()
        itemUis.keys.removeAll { it.startsWith("${secao.id}__") }
        for (index in 0 until preenchido.qtdSoldas) {
            val card = novoCard()
            val col = card.getChildAt(0) as LinearLayout
            col.addView(tituloSecao("${secao.rotuloItem} #${index + 1}"))
            for (item in secao.itens) {
                val chave = ChecklistPreenchido.chaveResposta(secao.id, index, item.id)
                col.addView(blocoItem(item, chave))
            }
            container.addView(card)
        }
    }

    /** Card de observações gerais do checklist (campo livre, opcional). */
    private fun renderizarObservacoesGerais() {
        val card = novoCard()
        val col = card.getChildAt(0) as LinearLayout
        col.addView(tituloSecao("Observações Gerais"))

        val til = TextInputLayout(this).apply {
            hint = "Observações gerais (opcional)"
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(8) }
        }
        val edit = TextInputEditText(til.context).apply {
            setText(preenchido.observacoesGerais)
            minLines = 2
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    preenchido = preenchido.copy(observacoesGerais = s?.toString() ?: "")
                }
            })
        }
        til.addView(edit)
        col.addView(til)
        binding.containerSecoes.addView(card)
    }

    /** Bloco de uma pergunta: enunciado + opções (radio) + observação + fotos. */
    private fun blocoItem(item: ItemTemplate, chave: String): View {
        val bloco = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(12) }
        }

        // Enunciado (marca item crítico)
        val enunciado = TextView(this).apply {
            text = if (item.critico) "⚠ ${item.pergunta}  (ITEM CRÍTICO)" else item.pergunta
            setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
            if (item.critico) setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        bloco.addView(enunciado)

        // Opções (itens somente-foto não têm)
        if (!item.isSomenteFoto) {
            val valorAtual = preenchido.resposta(chave).valor
            val grupo = RadioGroup(this).apply {
                orientation = RadioGroup.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(2) }
            }
            item.opcoesEfetivas().forEachIndexed { i, valor ->
                val rb = RadioButton(this).apply {
                    id = View.generateViewId()
                    text = rotuloCurto(valor)
                    tag = valor
                    isChecked = valor == valorAtual
                    layoutParams = RadioGroup.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    ).apply { if (i > 0) marginStart = dp(8) }
                }
                grupo.addView(rb)
            }
            grupo.setOnCheckedChangeListener { _, checkedId ->
                val rb = grupo.findViewById<RadioButton>(checkedId)
                val valor = rb?.tag as? String ?: ""
                setResposta(chave) { it.copy(valor = valor) }
                limparMarcacaoPendencia(chave)
                atualizarVeredito()
            }
            bloco.addView(grupo)
        }

        // Observação opcional
        var tilObservacao: TextInputLayout? = null
        if (item.observacao) {
            val til = TextInputLayout(this).apply {
                hint = "Observação"
                boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(4) }
            }
            val edit = TextInputEditText(til.context).apply {
                setText(preenchido.resposta(chave).observacao)
                addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                    override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                    override fun afterTextChanged(s: Editable?) {
                        setResposta(chave) { it.copy(observacao = s?.toString() ?: "") }
                        til.error = null
                    }
                })
            }
            til.addView(edit)
            bloco.addView(til)
            tilObservacao = til
        }

        // Fotos (miniaturas + botão adicionar)
        var containerFotos: LinearLayout? = null
        var txtErroFoto: TextView? = null
        if (item.foto || item.isSomenteFoto) {
            val fotos = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            }
            val scrollFotos = HorizontalScrollView(this).apply {
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(4) }
                isHorizontalScrollBarEnabled = false
                addView(fotos)
            }
            bloco.addView(scrollFotos)

            val erroFoto = TextView(this).apply {
                text = "Anexe ao menos uma foto"
                setTextColor(corDoTema(com.example.calculadorahh.R.color.red_delete))
                textSize = 12f
                visibility = View.GONE
            }
            bloco.addView(erroFoto)

            val btnFoto = MaterialButton(
                this, null,
                com.google.android.material.R.attr.materialButtonOutlinedStyle
            ).apply {
                text = if (item.fotoObrigatoria) "📷 Adicionar foto (obrigatória)" else "📷 Adicionar foto"
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
                setOnClickListener { escolherOrigemFoto(chave) }
            }
            bloco.addView(btnFoto)

            containerFotos = fotos
            txtErroFoto = erroFoto
        }

        itemUis[chave] = ItemUi(
            bloco = bloco,
            enunciado = enunciado,
            corEnunciado = enunciado.textColors,
            tilObservacao = tilObservacao,
            containerFotos = containerFotos,
            txtErroFoto = txtErroFoto
        )
        containerFotos?.let { renderizarFotos(chave) }

        return bloco
    }

    // ==================================================================
    // Fotos
    // ==================================================================

    private fun dirFotos(): File =
        File(getExternalFilesDir(Environment.DIRECTORY_PICTURES), "checklists").apply { mkdirs() }

    private fun novoArquivoFoto(): File =
        File(dirFotos(), "chk_${preenchido.tipo}_${System.currentTimeMillis()}.jpg")

    private fun escolherOrigemFoto(chave: String) {
        AlertDialog.Builder(this)
            .setTitle("Adicionar foto")
            .setItems(arrayOf("Tirar foto", "Escolher da galeria")) { _, which ->
                fotoPendenteChave = chave
                if (which == 0) {
                    val arquivo = novoArquivoFoto()
                    fotoPendenteArquivo = arquivo
                    val uri = FileProvider.getUriForFile(
                        this, "${BuildConfig.APPLICATION_ID}.fileprovider", arquivo
                    )
                    capturarFoto.launch(uri)
                } else {
                    escolherDaGaleria.launch("image/*")
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun adicionarFoto(chave: String, caminho: String) {
        setResposta(chave) { it.copy(fotos = it.fotos + caminho) }
        renderizarFotos(chave)
    }

    private fun removerFoto(chave: String, caminho: String) {
        AlertDialog.Builder(this)
            .setMessage("Remover esta foto?")
            .setPositiveButton("Remover") { _, _ ->
                setResposta(chave) { it.copy(fotos = it.fotos - caminho) }
                File(caminho).delete()
                renderizarFotos(chave)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun verFoto(caminho: String) {
        val uri = FileProvider.getUriForFile(
            this, "${BuildConfig.APPLICATION_ID}.fileprovider", File(caminho)
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "image/jpeg")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "Nenhum app disponível para exibir a foto", Toast.LENGTH_SHORT).show()
        }
    }

    /** Reconstrói a fileira de miniaturas do item. */
    private fun renderizarFotos(chave: String) {
        val ui = itemUis[chave] ?: return
        val container = ui.containerFotos ?: return
        container.removeAllViews()
        val fotos = preenchido.resposta(chave).fotos
        if (fotos.isNotEmpty()) ui.txtErroFoto?.visibility = View.GONE
        for (caminho in fotos) {
            val thumb = ImageView(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(64), dp(64)).apply {
                    marginEnd = dp(8)
                }
                scaleType = ImageView.ScaleType.CENTER_CROP
                val bmp = miniatura(caminho)
                if (bmp != null) setImageBitmap(bmp)
                else setImageResource(android.R.drawable.ic_menu_report_image)
                contentDescription = "Foto anexada"
                setOnClickListener { verFoto(caminho) }
                setOnLongClickListener { removerFoto(chave, caminho); true }
            }
            container.addView(thumb)
        }
        if (fotos.isNotEmpty()) {
            val dica = TextView(this).apply {
                text = "toque = ver · segurar = remover"
                textSize = 10f
                gravity = Gravity.CENTER_VERTICAL
            }
            container.addView(dica)
        }
    }

    /** Decodifica uma miniatura leve (evita carregar a foto inteira na memória). */
    private fun miniatura(caminho: String): android.graphics.Bitmap? = try {
        val limites = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(caminho, limites)
        val alvo = dp(64)
        var amostra = 1
        while (limites.outWidth / (amostra * 2) >= alvo && limites.outHeight / (amostra * 2) >= alvo) {
            amostra *= 2
        }
        BitmapFactory.decodeFile(caminho, BitmapFactory.Options().apply { inSampleSize = amostra })
    } catch (e: Exception) {
        null
    }

    // ==================================================================
    // Estado e veredito
    // ==================================================================

    private inline fun setResposta(chave: String, transform: (RespostaItem) -> RespostaItem) {
        val atual = preenchido.resposta(chave)
        preenchido = ChecklistManager.comResposta(preenchido, chave, transform(atual))
    }

    private fun atualizarVeredito() {
        preenchido = ChecklistManager.avaliar(template, preenchido)
        val aprovada = preenchido.situacao == ChecklistPreenchido.SITUACAO_APROVADA

        // Cores do tema (design tokens) para funcionar em claro e escuro.
        val corTxt = corDoTema(
            if (aprovada) com.example.calculadorahh.R.color.green_sync
            else com.example.calculadorahh.R.color.red_delete
        )
        val corBg = corDoTema(
            if (aprovada) com.example.calculadorahh.R.color.green_a10
            else com.example.calculadorahh.R.color.red_a10
        )
        binding.cardVeredito.setCardBackgroundColor(corBg)
        binding.txtVeredito.setTextColor(corTxt)
        binding.txtVeredito.text = if (aprovada) "✅ Aprovada" else "❌ Reprovada"

        val detalhe = StringBuilder()
        detalhe.append(
            when (preenchido.naoConformidades) {
                0 -> "Nenhuma não conformidade"
                1 -> "1 não conformidade"
                else -> "${preenchido.naoConformidades} não conformidades"
            }
        )
        if (preenchido.itensCriticosReprovados > 0) {
            detalhe.append(" · ${preenchido.itensCriticosReprovados} crítico(s)")
        }
        binding.txtVeredictoDetalhe.setTextColor(corTxt)
        binding.txtVeredictoDetalhe.text = detalhe.toString()
    }

    // ==================================================================
    // Validação obrigatória e salvamento
    // ==================================================================

    /** Valida os campos de identificação; marca erros e devolve as TILs pendentes. */
    private fun validarIdentificacao(): List<TextInputLayout> {
        val pendentes = mutableListOf<TextInputLayout>()

        fun exigir(id: String, valor: String) {
            val til = tilsIdentificacao[id] ?: return
            if (valor.isBlank()) {
                til.error = "Campo obrigatório"
                pendentes += til
            } else {
                til.error = null
            }
        }

        exigir("os", preenchido.numeroOS)
        exigir("encarregado", preenchido.encarregado)
        exigir("encarregado_codigo", preenchido.encarregadoCodigo)
        exigir("lider", preenchido.lider)
        exigir("lider_codigo", preenchido.liderCodigo)
        exigir("data", preenchido.data)
        exigir("local", preenchido.local)

        if (preenchido.data.isNotBlank() && !REGEX_DATA.matches(preenchido.data)) {
            tilsIdentificacao["data"]?.let {
                it.error = "Use o formato dd/MM/aaaa"
                if (it !in pendentes) pendentes += it
            }
        }
        return pendentes
    }

    private fun limparMarcacaoPendencia(chave: String) {
        val ui = itemUis[chave] ?: return
        ui.enunciado.setTextColor(ui.corEnunciado)
    }

    /** Marca visualmente as pendências apontadas pelo validador. */
    private fun aplicarPendencias(pendencias: List<ChecklistManager.Pendencia>) {
        // limpa marcações anteriores
        for (ui in itemUis.values) {
            ui.enunciado.setTextColor(ui.corEnunciado)
            ui.txtErroFoto?.visibility = View.GONE
        }
        for (p in pendencias) {
            val ui = itemUis[p.chave] ?: continue
            when (p.tipo) {
                ChecklistManager.TipoPendencia.RESPOSTA ->
                    ui.enunciado.setTextColor(corDoTema(com.example.calculadorahh.R.color.red_delete))
                ChecklistManager.TipoPendencia.OBSERVACAO ->
                    ui.tilObservacao?.error = p.motivo
                ChecklistManager.TipoPendencia.FOTO ->
                    ui.txtErroFoto?.visibility = View.VISIBLE
            }
        }
    }

    /** Rola a tela até a view indicada. */
    private fun scrollAte(alvo: View) {
        val conteudo = binding.scrollChecklist.getChildAt(0)
        var y = 0
        var v: View? = alvo
        while (v != null && v !== conteudo) {
            y += v.top
            v = v.parent as? View
        }
        binding.scrollChecklist.smoothScrollTo(0, maxOf(0, y - dp(16)))
    }

    private fun salvar() {
        // Preenchimento obrigatório: identificação + todas as perguntas,
        // observação quando há não conformidade e fotos exigidas.
        val identPendentes = validarIdentificacao()
        val pendencias = ChecklistManager.validar(template, preenchido)
        aplicarPendencias(pendencias)

        val total = identPendentes.size + pendencias.size
        if (total > 0) {
            Toast.makeText(
                this,
                if (total == 1) "1 campo obrigatório pendente"
                else "$total campos obrigatórios pendentes",
                Toast.LENGTH_LONG
            ).show()
            val primeiraView = identPendentes.firstOrNull()
                ?: pendencias.firstNotNullOfOrNull { itemUis[it.chave]?.bloco }
            primeiraView?.let { scrollAte(it) }
            return
        }

        // Remove respostas órfãs de soldas excluídas (e apaga suas fotos).
        val (podado, fotosOrfas) = ChecklistManager.podarRespostasExcedentes(template, preenchido)
        preenchido = podado
        fotosOrfas.forEach { File(it).delete() }

        atualizarVeredito()
        val id = db.salvarChecklist(preenchido)
        if (id > 0) {
            Toast.makeText(
                this,
                "Checklist salvo — situação: ${preenchido.situacao}",
                Toast.LENGTH_LONG
            ).show()
            finish()
        } else {
            Toast.makeText(this, "Erro ao salvar o checklist", Toast.LENGTH_LONG).show()
        }
    }

    // ==================================================================
    // Helpers de UI
    // ==================================================================

    private fun rotuloCurto(valor: String): String =
        if (valor == "Não Aplicável") "N/A" else valor

    private fun tituloSecao(texto: String): TextView = TextView(this).apply {
        text = texto
        setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleMedium)
        setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    private fun novoCard(): MaterialCardView {
        val card = MaterialCardView(this).apply {
            radius = dp(12).toFloat()
            cardElevation = 0f
            strokeWidth = dp(1)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(8) }
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        card.addView(col)
        return card
    }

    private fun botaoQtd(texto: String): TextView = TextView(this).apply {
        text = texto
        textSize = 22f
        gravity = Gravity.CENTER
        setTextColor(corDoTema(com.example.calculadorahh.R.color.gold_primary))
        layoutParams = LinearLayout.LayoutParams(dp(40), dp(40))
        isClickable = true
        isFocusable = true
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    /** Resolve uma cor dos design tokens (respeita tema claro/escuro). */
    private fun corDoTema(res: Int): Int =
        androidx.core.content.ContextCompat.getColor(this, res)
}
