package app.telefam.domain

import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn

/** Mirrors src/lib/rules.ts. Keep both in sync. */
object Rules {
    const val MIN_AGE = 13
    val USERNAME = Regex("^[a-z0-9_.]{3,24}$")

    fun otpCooldownForHit(hit: Int): Int = when {
        hit <= 3 -> 60
        hit == 4 -> 15 * 60
        hit == 5 -> 60 * 60
        else -> 24 * 60 * 60
    }

    fun isOldEnough(dob: LocalDate, today: LocalDate = Clock.System.todayIn(TimeZone.UTC)): Boolean {
        var age = today.year - dob.year
        if (today.monthNumber < dob.monthNumber || (today.monthNumber == dob.monthNumber && today.dayOfMonth < dob.dayOfMonth)) age--
        return age in MIN_AGE..120
    }

    private val invisible = Regex("[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\uFEFF]")
    private val control = Regex("[\\u0000-\\u001F\\u007F]")

    fun sanitize(input: String): String =
        input.replace(invisible, "").replace(control, "").replace("<", "").replace(">", "")
            .replace(Regex("\\s+"), " ").trim()

    fun usernameFromEmail(email: String): String {
        var u = email.substringBefore("@").lowercase().substringBefore("+")
            .replace(Regex("[^a-z0-9_.]"), "").replace(Regex("\\.{2,}"), ".").trim('.')
        if (u.length > 20) u = u.take(20)
        while (u.length < 3) u += "0"
        return u
    }

    fun nameFromEmail(email: String): String =
        email.substringBefore("@").substringBefore("+").replace(Regex("[0-9]+"), " ")
            .split(Regex("[._\\-\\s]+")).filter { it.isNotBlank() }
            .joinToString(" ") { it.lowercase().replaceFirstChar(Char::uppercase) }.take(60)

    fun countdown(seconds: Int): String {
        val s = seconds.coerceAtLeast(0)
        val h = s / 3600; val m = (s % 3600) / 60; val sec = s % 60
        return if (h > 0) "$h:${m.pad()}:${sec.pad()}" else "${m.pad()}:${sec.pad()}"
    }
    private fun Int.pad() = toString().padStart(2, '0')
}
