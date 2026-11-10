package app.telefam.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.*
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Platform pieces (Keystore/Keychain vault, device id, pinned engine). */
expect object Platform {
    fun httpClient(config: HttpClientConfig<*>.() -> Unit): HttpClient
    suspend fun deviceId(): String
    val vault: TokenVault
    fun integrityOk(): Boolean
}

interface TokenVault {
    suspend fun saveRefresh(token: String)
    suspend fun readRefresh(): String?
    suspend fun clear()
}

@Serializable data class CodeReq(val email: String, val device: String)
@Serializable data class CodeRes(val ok: Boolean, val retryAfter: Int)
@Serializable data class VerifyReq(val email: String, val code: String, val device: String)
@Serializable data class Tokens(val accessToken: String, val refreshToken: String, val expiresIn: Int)
@Serializable data class RefreshReq(val refreshToken: String, val device: String)

class AuthRepository(private val baseUrl: String) {
    // Access token lives in memory only; refresh token in the hardware-backed vault.
    @Volatile private var access: String? = null
    private val refreshLock = Mutex()

    private val http = Platform.httpClient {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
        install(HttpTimeout) { connectTimeoutMillis = 8_000; requestTimeoutMillis = 20_000; socketTimeoutMillis = 20_000 }
        install(HttpRequestRetry) {
            retryOnExceptionOrServerErrors(maxRetries = 3)
            exponentialDelay(base = 2.0, maxDelayMs = 15_000, randomizationMs = 800)
        }
        defaultRequest { url(baseUrl); header("X-Client", "telefam-native") }
    }

    suspend fun requestCode(email: String): CodeRes = runCatching {
        http.post("/v1/auth/code") { contentType(ContentType.Application.Json); setBody(CodeReq(email, Platform.deviceId())) }.body<CodeRes>()
    }.getOrElse { CodeRes(false, 0) }

    suspend fun verifyCode(email: String, code: String): Boolean = runCatching {
        if (!Platform.integrityOk()) return false
        val t: Tokens = http.post("/v1/auth/verify") { contentType(ContentType.Application.Json); setBody(VerifyReq(email, code, Platform.deviceId())) }.body()
        store(t); true
    }.getOrDefault(false)

    /** Silent sign-in on launch: users are never asked to sign in again while the refresh token is valid. */
    suspend fun restore(): Boolean = refresh()

    /** Single-flight rotation: one refresh at a time; the old token is invalid after use (reuse revokes the family). */
    suspend fun refresh(): Boolean = refreshLock.withLock {
        val rt = Platform.vault.readRefresh() ?: return false
        val res = runCatching {
            http.post("/v1/auth/refresh") { contentType(ContentType.Application.Json); setBody(RefreshReq(rt, Platform.deviceId())) }
        }.getOrNull() ?: return access != null // offline: keep local session
        if (res.status.value == 401) { signOut(); return false }
        store(res.body()); true
    }

    fun bearer(): String? = access

    private suspend fun store(t: Tokens) { access = t.accessToken; Platform.vault.saveRefresh(t.refreshToken) }

    suspend fun signOut() { access = null; Platform.vault.clear() }
}
