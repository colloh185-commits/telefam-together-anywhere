package app.telefam.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.telefam.data.AuthRepository
import app.telefam.domain.Rules
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Email -> OTP flow. Pixel layout follows the web /auth screen. */
@Composable
fun AuthScreen(repo: AuthRepository, onGoogle: () -> Unit, onApple: (() -> Unit)?, onSignedIn: () -> Unit) {
    var step by remember { mutableStateOf(0) }
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var left by remember { mutableStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val red = MaterialTheme.colorScheme.primary

    LaunchedEffect(left) { if (left > 0) { delay(1000); left-- } }

    fun send() = scope.launch {
        val clean = email.trim().lowercase()
        if (!Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$").matches(clean)) { error = "Enter a valid email address"; return@launch }
        busy = true
        val r = repo.requestCode(clean)
        busy = false
        left = r.retryAfter
        step = 1
    }
    fun verify() = scope.launch {
        busy = true
        val ok = repo.verifyCode(email.trim().lowercase(), code)
        busy = false
        if (ok) onSignedIn() else { code = ""; error = "That code isn't right" }
    }

    BoxWithConstraints(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Canvas(Modifier.fillMaxWidth().height(120.dp)) {
            drawPath(Path().apply { moveTo(0f, 0f); lineTo(size.width, 0f); lineTo(size.width, size.height * .77f)
                cubicTo(size.width * .85f, size.height * .5f, size.width * .55f, size.height * .43f, 0f, size.height * .28f); close() }, Tf.WaveTop)
        }
        Canvas(Modifier.fillMaxWidth().height(180.dp).align(Alignment.BottomCenter)) {
            drawPath(Path().apply { moveTo(0f, size.height * .22f); cubicTo(size.width * .33f, 0f, size.width * .5f, size.height * .28f, size.width, size.height * .17f)
                lineTo(size.width, size.height); lineTo(0f, size.height); close() }, red)
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 56.dp, bottom = 160.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            LogoMark(92.dp, animated = true)
            Text("Telefam", color = red, fontSize = 44.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(top = 16.dp))
            Text("Stay connected. Stay together.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp)
            Surface(
                Modifier.padding(top = 32.dp).widthIn(max = 400.dp).fillMaxWidth().shadow(18.dp, RoundedCornerShape(24.dp)),
                shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface,
            ) {
                AnimatedContent(step, label = "step") { s ->
                    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        if (s == 0) {
                            Text("Enter Your Email", color = red, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                            Text("Enter your email to get OTP", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("Email", fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 8.dp))
                            OutlinedTextField(email, { email = it; error = null }, Modifier.fillMaxWidth(), placeholder = { Text("Enter your email") },
                                leadingIcon = { Icon(Icons.Outlined.Email, null, tint = red) }, singleLine = true, shape = RoundedCornerShape(12.dp),
                                isError = error != null, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                            error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp, modifier = Modifier.fillMaxWidth()) }
                            BrandButton("Send OTP", busy, Modifier.padding(top = 16.dp)) { send() }
                            Row(Modifier.padding(vertical = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                                HorizontalDivider(Modifier.weight(1f)); Text("  or  ", color = MaterialTheme.colorScheme.onSurfaceVariant); HorizontalDivider(Modifier.weight(1f))
                            }
                            ProviderButton("Continue with Google", onGoogle)
                            onApple?.let { Spacer(Modifier.height(10.dp)); ProviderButton("Continue with Apple", it) }
                        } else {
                            Text("Enter OTP", color = red, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                            Text("We sent a verification code to", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                            Text(email.trim().lowercase(), fontWeight = FontWeight.SemiBold)
                            Text("Enter the code below, or tap the link in the email.", fontSize = 12.sp, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            OtpBoxes(code, { code = it.filter(Char::isDigit).take(6); if (code.length == 6) verify() }, Modifier.padding(top = 24.dp))
                            BrandButton("Verify OTP", busy, Modifier.padding(top = 24.dp), enabled = code.length == 6) { verify() }
                            if (left > 0) {
                                Text("Resend code in ${Rules.countdown(left)}", modifier = Modifier.padding(top = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("After ${Rules.countdown(left)} you can Resend code", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            } else TextButton({ send() }) { Text("Resend code", color = red, fontWeight = FontWeight.SemiBold) }
                            TextButton({ step = 0; code = "" }) { Text("Change email", color = red) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun BrandButton(label: String, busy: Boolean, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Button(onClick, modifier.fillMaxWidth().height(44.dp), enabled = enabled && !busy, shape = RoundedCornerShape(12.dp)) {
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
        else Text(label, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
    }
}

@Composable
fun ProviderButton(label: String, onClick: () -> Unit) {
    OutlinedButton(onClick, Modifier.fillMaxWidth().height(44.dp), shape = RoundedCornerShape(12.dp)) { Text(label, fontWeight = FontWeight.Medium) }
}

@Composable
fun OtpBoxes(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    BasicTextField(value, onChange, modifier, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(6) { i ->
                val active = i == value.length
                Box(Modifier.size(44.dp, 48.dp).border(1.dp, if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center) { Text(value.getOrNull(i)?.toString() ?: "", fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
            }
        }
    }
}
