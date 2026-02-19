package com.example.calculadorahh.utils

import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText

/**
 * TextWatcher para formatação automática de horário no formato HH:MM
 * Ao digitar 0800, formata automaticamente para 08:00
 *
 * Uso: TimeInputMask.apply(editText)
 */
class TimeInputMask(private val editText: EditText) : TextWatcher {
    private var isUpdating = false
    private val mask = "##:##"

    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
        if (isUpdating) return

        val str = s.toString().replace(Regex("\\D"), "")
        isUpdating = true

        val formatted = StringBuilder()
        var i = 0
        for (m in mask.toCharArray()) {
            if (m != '#' && i < str.length) {
                formatted.append(m)
                continue
            }
            if (i < str.length) {
                formatted.append(str[i])
                i++
            }
        }

        editText.setText(formatted.toString())
        editText.setSelection(formatted.length)
        isUpdating = false
    }

    override fun afterTextChanged(s: Editable?) {}

    companion object {
        /**
         * Aplica a máscara de tempo a um EditText
         */
        fun apply(editText: EditText) {
            editText.addTextChangedListener(TimeInputMask(editText))
        }
    }
}
