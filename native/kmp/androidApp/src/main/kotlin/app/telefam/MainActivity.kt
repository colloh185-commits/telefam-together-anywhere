package app.telefam

import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.*
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import app.telefam.data.AuthRepository
import app.telefam.data.Platform
import app.telefam.ui.AuthScreen
import app.telefam.ui.HomeScreen
import app.telefam.ui.TelefamTheme

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen() // animated launcher (res/drawable/avd_launcher.xml)
        super.onCreate(savedInstanceState)
        Platform.context = applicationContext
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        enableEdgeToEdge()
        val repo = AuthRepository(BuildConfig.API_BASE)
        var ready = false
        splash.setKeepOnScreenCondition { !ready }

        setContent {
            val size = calculateWindowSizeClass(this)
            var signedIn by remember { mutableStateOf<Boolean?>(null) }
            LaunchedEffect(Unit) { signedIn = repo.restore(); ready = true }
            TelefamTheme {
                when (signedIn) {
                    true -> HomeScreen(size.widthSizeClass, comingSoon = { Toast.makeText(this, "Coming soon", Toast.LENGTH_SHORT).show() }, openProfile = {})
                    false -> AuthScreen(repo, onGoogle = { /* Credential Manager -> id token -> /v1/auth/google */ }, onApple = null, onSignedIn = { signedIn = true })
                    null -> Unit
                }
            }
        }
    }
}
