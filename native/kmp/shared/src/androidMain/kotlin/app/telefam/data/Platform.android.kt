package app.telefam.data

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.Debug
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.okhttp.OkHttp
import okhttp3.CertificatePinner
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@SuppressLint("StaticFieldLeak")
actual object Platform {
    lateinit var context: Context

    actual fun httpClient(config: HttpClientConfig<*>.() -> Unit): HttpClient = HttpClient(OkHttp) {
        engine {
            config {
                // Pins live in the C++ vault so they don't appear as plain strings in the APK.
                certificatePinner(CertificatePinner.Builder().apply { NativeVault.pins().forEach { add(NativeVault.host(), it) } }.build())
                retryOnConnectionFailure(true)
            }
        }
        config()
    }

    @SuppressLint("HardwareIds")
    actual suspend fun deviceId(): String {
        val raw = listOf(
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID),
            Build.MANUFACTURER, Build.MODEL, Build.HARDWARE, Build.BOARD,
            context.resources.displayMetrics.let { "${it.widthPixels}x${it.heightPixels}@${it.densityDpi}" },
        ).joinToString("|")
        return MessageDigest.getInstance("SHA-256").digest(raw.toByteArray()).joinToString("") { "%02x".format(it) }
    }

    actual val vault: TokenVault = KeystoreVault

    /** Cheap local checks; server additionally verifies a Play Integrity token. */
    actual fun integrityOk(): Boolean {
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) return false
        val su = listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/app/Superuser.apk")
        if (su.any { File(it).exists() }) return false
        if (Build.TAGS?.contains("test-keys") == true) return false
        return NativeVault.selfCheck(context.packageCodePath)
    }
}

/** AES-256-GCM key in Android Keystore (StrongBox when available); refresh token encrypted at rest. */
object KeystoreVault : TokenVault {
    private const val ALIAS = "tf_rt_v1"
    private val prefs by lazy { Platform.context.getSharedPreferences("tf_v", Context.MODE_PRIVATE) }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).apply { if (Build.VERSION.SDK_INT >= 28) setIsStrongBoxBacked(true) }.build()
        return runCatching { KeyGenerator.getInstance("AES", "AndroidKeyStore").apply { init(spec) }.generateKey() }
            .getOrElse {
                val fallback = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build()
                KeyGenerator.getInstance("AES", "AndroidKeyStore").apply { init(fallback) }.generateKey()
            }
    }

    override suspend fun saveRefresh(token: String) {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val blob = c.iv + c.doFinal(token.toByteArray())
        prefs.edit().putString("rt", Base64.encodeToString(blob, Base64.NO_WRAP)).apply()
    }

    override suspend fun readRefresh(): String? = runCatching {
        val blob = Base64.decode(prefs.getString("rt", null) ?: return null, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, blob, 0, 12)) }
        String(c.doFinal(blob, 12, blob.size - 12))
    }.getOrNull()

    override suspend fun clear() { prefs.edit().clear().apply() }
}

/** JNI bridge to core-cpp (obfuscated constants + APK signature self-check). */
object NativeVault {
    init { System.loadLibrary("telefamcore") }
    external fun host(): String
    external fun pins(): Array<String>
    external fun selfCheck(apkPath: String): Boolean
}
