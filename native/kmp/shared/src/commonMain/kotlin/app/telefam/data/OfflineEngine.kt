package app.telefam.data

import kotlinx.coroutines.*

/**
 * Offline-first action queue backed by the C++ core (persisted outbox + backoff scheduler).
 * UI writes go here first and return immediately; the engine flushes when the network allows.
 */
expect object CoreEngine {
    fun enqueue(kind: String, payloadJson: String): Long
    fun nextBatch(max: Int): List<Pair<Long, String>>
    fun ack(ids: LongArray)
    fun fail(ids: LongArray): Long // returns ms until next attempt (exp. backoff + jitter)
    fun cooldownForHit(hit: Int): Int
}

class OfflineEngine(private val send: suspend (List<String>) -> Boolean, private val online: () -> Boolean) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var job: Job? = null

    fun track(event: String, meta: Map<String, String> = emptyMap()) {
        val json = buildString {
            append("{\"event\":\"").append(event.filter { it.isLetterOrDigit() || it == '.' || it == '_' }.take(64)).append("\",\"meta\":{")
            append(meta.entries.take(12).joinToString(",") { "\"${it.key.take(32)}\":\"${it.value.replace("\"", "").take(200)}\"" })
            append("}}")
        }
        CoreEngine.enqueue("event", json)
        kick()
    }

    fun kick(delayMs: Long = 500) {
        job?.cancel()
        job = scope.launch {
            delay(delayMs)
            while (isActive && online()) {
                val batch = CoreEngine.nextBatch(25)
                if (batch.isEmpty()) break
                val ids = batch.map { it.first }.toLongArray()
                if (send(batch.map { it.second })) CoreEngine.ack(ids)
                else { delay(CoreEngine.fail(ids)); }
            }
        }
    }
}
