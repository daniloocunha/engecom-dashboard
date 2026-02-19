# ================================
# ProGuard Rules - CalculadoraHH
# Versão: 1.5.0
# Atualizado: 2025-11-18
# ================================

# Manter source file e line numbers para stack traces legíveis
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ================================
# Google API Client
# ================================
-keep class com.google.** { *; }
-dontwarn com.google.**
-dontwarn org.apache.http.**
-dontwarn android.net.http.**

# Google Auth
-keep class com.google.auth.** { *; }
-dontwarn com.google.auth.**

# Google API Services (Sheets)
-keep class com.google.api.** { *; }
-dontwarn com.google.api.**

# ================================
# Gson / JSON
# ================================
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**

# Manter todos os data models (usados com Gson)
-keep class com.example.calculadorahh.data.models.** { *; }

# Gson TypeToken
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken

# Gson específico
-keepclassmembers,allowobfuscation class * {
  @com.google.gson.annotations.SerializedName <fields>;
}

# ================================
# Kotlin
# ================================
-keep class kotlin.** { *; }
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-keepclassmembers class **$WhenMappings {
    <fields>;
}
-keepclassmembers class kotlin.Metadata {
    public <methods>;
}

# Kotlin Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.** {
    volatile <fields>;
}
-dontwarn kotlinx.**

# ================================
# Android Parcelable
# ================================
-keep class * implements android.os.Parcelable {
  public static final android.os.Parcelable$Creator *;
}
-keepclassmembers class * implements android.os.Parcelable {
  public <fields>;
}
-keepnames class * implements android.os.Parcelable

# ================================
# AndroidX
# ================================
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
-dontwarn androidx.**

# ViewBinding
-keep class * implements androidx.viewbinding.ViewBinding {
    public static ** bind(android.view.View);
    public static ** inflate(android.view.LayoutInflater);
}

# Lifecycle
-keep class * extends androidx.lifecycle.ViewModel {
    <init>();
}
-keep class * extends androidx.lifecycle.AndroidViewModel {
    <init>(android.app.Application);
}

# ================================
# WorkManager
# ================================
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.CoroutineWorker {
    public <init>(...);
}
-keep class androidx.work.impl.WorkManagerImpl
-keep class com.example.calculadorahh.workers.** { *; }

# ================================
# Database (SQLite)
# ================================
-keep class com.example.calculadorahh.data.database.** { *; }

# ================================
# Services
# ================================
-keep class com.example.calculadorahh.services.** { *; }

# ================================
# App Específico
# ================================
# Manter Application class
-keep class com.example.calculadorahh.CalculadoraHHApplication { *; }

# Manter Activities, Fragments, Services
-keep class * extends android.app.Activity
-keep class * extends androidx.fragment.app.Fragment
-keep class * extends android.app.Service
-keep class * extends android.content.BroadcastReceiver

# Manter managers e utils
-keep class com.example.calculadorahh.domain.managers.** { *; }
-keep class com.example.calculadorahh.utils.** { *; }

# ================================
# Reflection
# ================================
# Classes que usam reflection
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ================================
# Enums
# ================================
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ================================
# Serializable
# ================================
-keepnames class * implements java.io.Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    !private <fields>;
    !private <methods>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ================================
# Otimizações
# ================================
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 5
-allowaccessmodification
-dontpreverify

# ================================
# Remove Logs em Produção
# ================================
# Remove logs verbose, debug e info para reduzir tamanho do APK
-assumenosideeffects class android.util.Log {
    public static *** v(...);
    public static *** d(...);
    public static *** i(...);
}
# Mantém warnings e errors para debugging em produção

# ================================
# Debugging
# ================================
# Descomente para ver warnings detalhados durante build:
# -verbose
# -printmapping build/outputs/mapping/release/mapping.txt
# -printseeds build/outputs/mapping/release/seeds.txt
# -printusage build/outputs/mapping/release/usage.txt
