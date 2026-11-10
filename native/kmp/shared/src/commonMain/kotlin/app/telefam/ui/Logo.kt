package app.telefam.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Red disc + white paper plane, drawn on a 100x100 grid (same paths as the web LogoMark). */
@Composable
fun LogoMark(size: Dp = 92.dp, animated: Boolean = false) {
    val t = rememberInfiniteTransition(label = "fly")
    val drift by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "d")
    Canvas(Modifier.size(size)) {
        val k = this.size.minDimension / 100f
        fun p(vararg pts: Float) = Path().apply { moveTo(pts[0] * k, pts[1] * k); for (i in 2 until pts.size step 2) lineTo(pts[i] * k, pts[i + 1] * k); close() }
        drawCircle(Brush.radialGradient(listOf(Color(0xFFEF2B37), Color(0xFFCF0F1F), Color(0xFFA50B17)), center = Offset(35 * k, 28 * k), radius = 80 * k))
        drawPath(p(46f, 58f, 60f, 78f, 96f, 62f, 80f, 24f), Brush.linearGradient(listOf(Color(0x8C7D0811), Color.Transparent)))
        val dx = if (animated) drift * 2f * k else 0f
        translate(dx, -dx * 1.5f) {
            rotate(if (animated) -3f * drift else 0f) {
                drawPath(p(19f, 49.5f, 80f, 23f, 44.5f, 57.5f), Color.White)
                drawPath(p(44.5f, 57.5f, 80f, 23f, 60.5f, 77.5f), Color(0xFFF6F1F1))
                drawPath(p(44.5f, 57.5f, 46.5f, 75f, 54.5f, 64.5f), Color(0xFFE9C9CC))
            }
        }
    }
}
