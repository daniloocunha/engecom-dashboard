package com.example.calculadorahh.data.models


import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize
import android.os.Parcelable

// ========== DATA CLASS PRINCIPAL ==========
@Parcelize
data class RDOData(
    val numeroRDO: String = "",
    val data: String,
    val codigoTurma: String,
    val encarregado: String,
    val local: String,
    val numeroOS: String,
    val statusOS: String,
    val kmInicio: String,
    val kmFim: String,
    val horarioInicio: String,
    val horarioFim: String,
    val clima: String,
    val temaDDS: String,
    val houveServico: Boolean,
    val causaNaoServico: String = "",   // "RUMO", "ENGECOM" ou "" quando houveServico=true
    val servicos: List<ServicoRDO>,
    val materiais: List<MaterialRDO>,
    val efetivo: Efetivo,
    val equipamentos: List<Equipamento>,
    val hiItens: List<HIItem>,
    val houveTransporte: Boolean = false,
    val transportes: List<TransporteItem> = emptyList(),
    val nomeColaboradores: String = "",
    val observacoes: String
) : Parcelable

// ========== DATA CLASS PARA HISTÓRICO ==========
@Parcelize
data class RDODataCompleto(
    val id: Long = 0,
    val numeroRDO: String = "",
    val data: String = "",
    val codigoTurma: String = "",
    val encarregado: String = "",
    val local: String = "",
    val numeroOS: String = "",
    val statusOS: String = "",
    val kmInicio: String = "",
    val kmFim: String = "",
    val horarioInicio: String = "",
    val horarioFim: String = "",
    val temaDDS: String = "",
    val clima: String = "",
    val houveServico: Boolean = false,
    val causaNaoServico: String = "",   // "RUMO", "ENGECOM" ou "" quando houveServico=true
    val servicos: List<ServicoRDO> = emptyList(),
    val materiais: List<MaterialRDO> = emptyList(),
    val horasImprodutivas: List<HIItem> = emptyList(),
    val efetivo: Efetivo = Efetivo(0, 0, 0, 0, 0, 0),
    val equipamentos: List<Equipamento> = emptyList(),
    val houveTransporte: Boolean = false,
    val transportes: List<TransporteItem> = emptyList(),
    val nomeColaboradores: String = "",
    val observacoes: String = "",
    // Novos campos de sincronização
    val syncStatus: String = "pending",
    val ultimaTentativaSync: String = "",
    val mensagemErroSync: String = "",
    val tentativasSync: Int = 0
) : Parcelable {
    // Propriedade computada para total de efetivo
    val total: Int
        get() = efetivo.encarregado + efetivo.operadores + efetivo.operadorEGP +
                efetivo.tecnicoSeguranca + efetivo.soldador + efetivo.motoristas
}

@Parcelize
data class ServicoRDO(
    val descricao: String,
    val quantidade: Double,
    val unidade: String,
    val observacoes: String? = null,  // Nullable para compatibilidade com RDOs antigos
    val isCustomizado: Boolean = false,  // Marca serviços customizados
    val hhManual: Double? = null  // HH manual para serviços customizados (opcional)
) : Parcelable


@Parcelize
data class MaterialRDO(
    val descricao: String,
    val quantidade: Double,
    val unidade: String
) : Parcelable


@Parcelize
data class Equipamento(
    val tipo: String,
    val placa: String
) : Parcelable


@Parcelize
data class HIItem(
    val tipo: String,
    val descricao: String,
    val horaInicio: String,
    val horaFim: String,
    @SerializedName("operadores")  // Mantém compatibilidade com JSON existente no banco
    val colaboradores: Int = 12  // Colaboradores envolvidos no evento HI (default 12, Gson retorna 0 para records antigos)
) : Parcelable


@Parcelize
data class Efetivo(
    val encarregado: Int,
    val operadores: Int,
    val operadorEGP: Int,
    val tecnicoSeguranca: Int,
    val soldador: Int,
    val motoristas: Int
) : Parcelable