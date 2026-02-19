package com.example.calculadorahh.ui.fragments

import com.example.calculadorahh.R
import com.example.calculadorahh.data.models.*
import com.example.calculadorahh.ui.adapters.*
import com.example.calculadorahh.viewmodels.CalculadoraHHViewModel

import android.annotation.SuppressLint
import android.app.TimePickerDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.calculadorahh.databinding.FragmentCalculadoraHhBinding
import java.util.Calendar

class CalculadoraHHFragment : Fragment() {

    private var _binding: FragmentCalculadoraHhBinding? = null
    private val binding get() = _binding!!

    private val viewModel: CalculadoraHHViewModel by viewModels()

    private lateinit var servicosAdapter: ServicosAdapter
    private lateinit var hisAdapter: HIsAdapter

    private var servicoSelecionado: Servico? = null
    private var horaInicio: String = ""
    private var horaFim: String = ""

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCalculadoraHhBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        configurarRecyclerViews()
        configurarListeners()
        observarViewModel()

        // Carrega os dados do JSON
        viewModel.carregarServicos()
    }

    private fun configurarRecyclerViews() {
        servicosAdapter = ServicosAdapter(mutableListOf()) { servico ->
            viewModel.removerServico(servico)
        }
        binding.rvServicosAdicionados.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = servicosAdapter
        }

        hisAdapter = HIsAdapter(
            mutableListOf(),
            onRemoveClicked = { hi ->
                viewModel.removerHI(hi)
            },
            onDuplicateClicked = { hi ->
                // Preencher campo tipo com dados do HI duplicado
                binding.etTipoHI.setText(hi.tipoHI)
                // Scroll para cima para mostrar os campos
                binding.root.parent?.let { parent ->
                    if (parent is androidx.core.widget.NestedScrollView) {
                        parent.smoothScrollTo(0, 0)
                    }
                }
            }
        )
        binding.rvHIsAdicionados.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = hisAdapter
        }
    }

    @SuppressLint("SetTextI18n", "DefaultLocale")
    private fun configurarListeners() {
        // Mostrar/ocultar aviso quando checkbox é marcado
        binding.cbServicoCustomizado.setOnCheckedChangeListener { _, isChecked ->
            binding.tvAvisoCustomizado.visibility = if (isChecked) View.VISIBLE else View.GONE

            // Se marcar customizado, permitir digitar texto livre
            if (isChecked) {
                binding.actvServico.inputType = android.text.InputType.TYPE_CLASS_TEXT or
                                                 android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                binding.tilServico.hint = "Digite o nome do serviço"
            } else {
                binding.actvServico.inputType = android.text.InputType.TYPE_NULL
                binding.tilServico.hint = "Buscar Serviço"
            }
        }

        binding.btnAdicionar.setOnClickListener {
            val isCustomizado = binding.cbServicoCustomizado.isChecked

            if (isCustomizado) {
                // Serviço customizado: permite texto livre
                val nomeCustomizado = binding.actvServico.text.toString().trim()
                if (nomeCustomizado.isEmpty()) {
                    Toast.makeText(requireContext(), "Digite o nome do serviço", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                viewModel.adicionarServicoCustomizado(
                    nomeCustomizado,
                    binding.etQuantidade.text.toString(),
                    binding.etObservacoesServico.text.toString()
                )
            } else {
                // Serviço normal: requer seleção da lista
                if (servicoSelecionado == null) {
                    Toast.makeText(requireContext(), "Selecione um serviço", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                viewModel.adicionarServico(
                    servicoSelecionado!!,
                    binding.etQuantidade.text.toString(),
                    binding.etObservacoesServico.text.toString()
                )
            }

            // Limpar campos
            binding.etQuantidade.text?.clear()
            binding.etObservacoesServico.text?.clear()
            binding.actvServico.text?.clear()
            binding.cbServicoCustomizado.isChecked = false
            servicoSelecionado = null
        }

        binding.btnHoraInicio.setOnClickListener {
            mostrarTimePicker { hora, minuto ->
                horaInicio = String.format("%02d:%02d", hora, minuto)
                binding.btnHoraInicio.text = horaInicio
            }
        }

        binding.btnHoraFim.setOnClickListener {
            mostrarTimePicker { hora, minuto ->
                horaFim = String.format("%02d:%02d", hora, minuto)
                binding.btnHoraFim.text = horaFim
            }
        }

        binding.btnAdicionarHI.setOnClickListener {
            viewModel.adicionarHI(
                binding.etTipoHI.text.toString(),
                horaInicio,
                horaFim
            )
            // Limpar campos após adicionar
            binding.etTipoHI.text?.clear()
            horaInicio = ""
            horaFim = ""
            binding.btnHoraInicio.text = "Selecionar Horário"
            binding.btnHoraFim.text = "Selecionar Horário"
        }
    }

    @SuppressLint("DefaultLocale")
    private fun observarViewModel() {
        viewModel.servicosBase.observe(viewLifecycleOwner) { servicos ->
            if (servicos != null && servicos.isNotEmpty()) {
                val nomes = servicos.map(Servico::descricao)
                val adapter = ArrayAdapter(
                    requireContext(),
                    android.R.layout.simple_dropdown_item_1line,
                    nomes
                )
                binding.actvServico.setAdapter(adapter)

                // Listener para seleção
                binding.actvServico.setOnItemClickListener { _, _, position, _ ->
                    val descricaoSelecionada = adapter.getItem(position)
                    servicoSelecionado = servicos.find { it.descricao == descricaoSelecionada }
                }
            }
        }

        viewModel.servicosAdicionados.observe(viewLifecycleOwner) { servicos ->
            servicosAdapter.updateData(servicos)
        }

        viewModel.hisAdicionados.observe(viewLifecycleOwner) { his ->
            hisAdapter.updateData(his)
        }

        viewModel.totalHoras.observe(viewLifecycleOwner) { total ->
            binding.tvTotalHoras.text = String.format("%.2f h", total)
            if (total < CalculadoraHHViewModel.META_HORAS_DIARIAS) {
                binding.tvTotalHoras.setTextColor(ContextCompat.getColor(requireContext(), android.R.color.holo_red_dark))
            } else {
                binding.tvTotalHoras.setTextColor(ContextCompat.getColor(requireContext(), android.R.color.holo_green_dark))
            }
        }

        viewModel.horasFaltantes.observe(viewLifecycleOwner) { faltante ->
            if (faltante > 0) {
                binding.tvFaltante.text = String.format("Faltam %.1fh para completar o dia", faltante)
                binding.tvFaltante.visibility = View.VISIBLE
            } else {
                binding.tvFaltante.visibility = View.GONE
            }
        }
    }

    private fun mostrarTimePicker(callback: (Int, Int) -> Unit) {
        val calendar = Calendar.getInstance()
        val hora = calendar.get(Calendar.HOUR_OF_DAY)
        val minuto = calendar.get(Calendar.MINUTE)

        TimePickerDialog(requireContext(), { _, selectedHora, selectedMinuto ->
            callback(selectedHora, selectedMinuto)
        }, hora, minuto, true).show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
