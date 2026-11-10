package app.telefam.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color

/** Same tokens as src/styles.css (oklch values converted to sRGB). */
object Tf {
    val Red = Color(0xFFC8102E)
    val RedDeep = Color(0xFF9E0B1F)
    val RedSoft = Color(0xFFFCECEC)
    val WaveTop = Color(0xFFFBEDED)
    val Ink = Color(0xFF1F2430)
    val Muted = Color(0xFF6B7280)
    val Border = Color(0xFFE3E5EA)
    val DarkBg = Color(0xFF14161B)
    val DarkCard = Color(0xFF1D2026)
    val DarkHeader = Color(0xFF8F1D1D)
}

enum class ThemeChoice { Light, Dark, System }
val LocalHeaderColor = compositionLocalOf { Tf.Red }

@Composable
fun TelefamTheme(choice: ThemeChoice = ThemeChoice.System, content: @Composable () -> Unit) {
    val dark = choice == ThemeChoice.Dark || (choice == ThemeChoice.System && isSystemInDarkTheme())
    val colors = if (dark) darkColorScheme(
        primary = Color(0xFFE0393E), onPrimary = Color.White, background = Tf.DarkBg, surface = Tf.DarkCard,
        onBackground = Color(0xFFF2F3F5), onSurface = Color(0xFFF2F3F5), surfaceVariant = Color(0xFF2A2D33),
        outline = Color(0x1AFFFFFF), primaryContainer = Color(0xFF4A1A1C),
    ) else lightColorScheme(
        primary = Tf.Red, onPrimary = Color.White, background = Color(0xFFFFFDFD), surface = Color.White,
        onBackground = Tf.Ink, onSurface = Tf.Ink, surfaceVariant = Color(0xFFF4F5F7),
        outline = Tf.Border, primaryContainer = Tf.RedSoft,
    )
    androidx.compose.runtime.CompositionLocalProvider(LocalHeaderColor provides if (dark) Tf.DarkHeader else Tf.Red) {
        MaterialTheme(colorScheme = colors, content = content)
    }
}
