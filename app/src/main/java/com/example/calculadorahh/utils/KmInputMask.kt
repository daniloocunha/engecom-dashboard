package com.example.calculadorahh.utils

import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText

/**
 * Máscara de entrada para campos de KM no formato 123+456
 */
object KmInputMask {

    /**
     * Aplica a máscara de KM em um EditText
     */
    fun apply(editText: EditText) {
        editText.addTextChangedListener(KmTextWatcher(editText))
    }

    private class KmTextWatcher(private val editText: EditText) : TextWatcher {
        private var isFormatting = false

        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}

        override fun afterTextChanged(s: Editable?) {
            if (isFormatting) return
            isFormatting = true

            val text = s.toString().replace(".", "").replace("+", "")
            if (text.isNotEmpty() && text.length <= 6) {
                val formatted = when (text.length) {
                    1, 2, 3 -> text
                    else -> "${text.dropLast(3)}+${text.substring(text.length - 3)}"
                }
                editText.setText(formatted)
                editText.setSelection(formatted.length)
            }

            isFormatting = false
        }
    }
}
