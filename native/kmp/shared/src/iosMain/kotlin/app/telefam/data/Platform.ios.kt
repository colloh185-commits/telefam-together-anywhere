@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package app.telefam.data

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.darwin.Darwin
import kotlinx.cinterop.*
import kotlinx.coroutines.suspendCancellableCoroutine
import platform.AuthenticationServices.*
import platform.CoreFoundation.*
import platform.Foundation.*
import platform.Security.*
import platform.UIKit.UIDevice
import platform.darwin.NSObject
import kotlin.coroutines.resume

actual object Platform {
    actual fun httpClient(config: HttpClientConfig<*>.() -> Unit): HttpClient = HttpClient(Darwin) {
        engine { configureRequest { setTimeoutInterval(20.0) } }
        config()
    }
    actual suspend fun deviceId(): String = (UIDevice.currentDevice.identifierForVendor?.UUIDString ?: "ios").let { sha256Hex(it + "|" + UIDevice.currentDevice.model) }
    actual val vault: TokenVault = KeychainVault
    actual fun integrityOk(): Boolean = !NSFileManager.defaultManager.fileExistsAtPath("/Applications/Cydia.app") &&
        !NSFileManager.defaultManager.fileExistsAtPath("/private/var/lib/apt")
}

private fun sha256Hex(s: String): String = telefamcore.tf_sha256_hex(s)?.toKString() ?: s

/** Keychain item, this-device-only, available after first unlock (survives app restarts, not backups). */
object KeychainVault : TokenVault {
    private const val SERVICE = "app.telefam.rt"
    override suspend fun saveRefresh(token: String) { clear(); memScoped {
        val q = CFDictionaryCreateMutable(null, 4, null, null)
        CFDictionaryAddValue(q, kSecClass, kSecClassGenericPassword)
        CFDictionaryAddValue(q, kSecAttrService, CFBridgingRetain(SERVICE))
        CFDictionaryAddValue(q, kSecAttrAccessible, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)
        CFDictionaryAddValue(q, kSecValueData, CFBridgingRetain((token as NSString).dataUsingEncoding(NSUTF8StringEncoding)))
        SecItemAdd(q, null)
    } }
    override suspend fun readRefresh(): String? = memScoped {
        val q = CFDictionaryCreateMutable(null, 4, null, null)
        CFDictionaryAddValue(q, kSecClass, kSecClassGenericPassword)
        CFDictionaryAddValue(q, kSecAttrService, CFBridgingRetain(SERVICE))
        CFDictionaryAddValue(q, kSecReturnData, kCFBooleanTrue)
        val out = alloc<CFTypeRefVar>()
        if (SecItemCopyMatching(q, out.ptr) != errSecSuccess) return null
        val data = CFBridgingRelease(out.value) as NSData
        NSString.create(data, NSUTF8StringEncoding) as String?
    }
    override suspend fun clear() { memScoped {
        val q = CFDictionaryCreateMutable(null, 2, null, null)
        CFDictionaryAddValue(q, kSecClass, kSecClassGenericPassword)
        CFDictionaryAddValue(q, kSecAttrService, CFBridgingRetain(SERVICE))
        SecItemDelete(q)
    } }
}

/** Sign in with Apple: returns the identity token, exchanged by the backend for Telefam tokens. */
class AppleSignIn : NSObject(), ASAuthorizationControllerDelegateProtocol {
    private var done: ((String?) -> Unit)? = null
    suspend fun start(nonceSha256: String): String? = suspendCancellableCoroutine { cont ->
        done = { cont.resume(it) }
        val req = ASAuthorizationAppleIDProvider().createRequest().apply {
            requestedScopes = listOf(ASAuthorizationScopeFullName, ASAuthorizationScopeEmail)
            nonce = nonceSha256
        }
        ASAuthorizationController(listOf(req)).apply { delegate = this@AppleSignIn; performRequests() }
    }
    override fun authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization: ASAuthorization) {
        val cred = didCompleteWithAuthorization.credential as? ASAuthorizationAppleIDCredential
        done?.invoke(cred?.identityToken?.let { NSString.create(it, NSUTF8StringEncoding) as String? })
    }
    override fun authorizationController(controller: ASAuthorizationController, didCompleteWithError: NSError) { done?.invoke(null) }
}
