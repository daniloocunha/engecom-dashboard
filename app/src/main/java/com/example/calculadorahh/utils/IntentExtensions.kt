package com.example.calculadorahh.utils

import android.content.Intent
import android.os.Build
import android.os.Parcelable

/**
 * Extensão para obter Parcelable de forma compatível com todas as versões do Android.
 * Resolve a deprecação de getParcelableExtra() no Android 13+ (API 33+).
 */
inline fun <reified T : Parcelable> Intent.getParcelableCompat(key: String): T? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        getParcelableExtra(key, T::class.java)
    } else {
        @Suppress("DEPRECATION")
        getParcelableExtra(key)
    }
}
