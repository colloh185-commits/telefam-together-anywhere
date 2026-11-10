package app.telefam

import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import app.telefam.ui.HomeScreen
import app.telefam.ui.TelefamTheme

@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
fun main() = application {
    Window(onCloseRequest = ::exitApplication, title = "Telefam", state = rememberWindowState(width = 1200.dp, height = 800.dp)) {
        TelefamTheme { HomeScreen(calculateWindowSizeClass().widthSizeClass, comingSoon = {}, openProfile = {}) }
    }
}
