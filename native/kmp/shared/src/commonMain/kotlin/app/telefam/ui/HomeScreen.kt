package app.telefam.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class Dest(val label: String, val icon: ImageVector)
private val dests = listOf(Dest("Chats", Icons.Filled.Chat), Dest("Contacts", Icons.Outlined.Contacts), Dest("Post", Icons.Filled.Add),
    Dest("Feeds", Icons.Outlined.DynamicFeed), Dest("Profile", Icons.Outlined.AccountCircle))

/**
 * Compact (phones, folded): bottom bar with raised Post button.
 * Medium/Expanded (tablets, unfolded foldables, iPad, desktop): navigation rail.
 */
@Composable
fun HomeScreen(width: WindowWidthSizeClass, comingSoon: (String) -> Unit, openProfile: () -> Unit) {
    val onTab: (String) -> Unit = { if (it == "Profile") openProfile() else if (it != "Chats") comingSoon(it) }
    val header = LocalHeaderColor.current
    Row(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (width != WindowWidthSizeClass.Compact) {
            NavigationRail(header = { LogoMark(38.dp) }) {
                dests.forEach { d ->
                    if (d.label == "Post") FloatingActionButton({ onTab(d.label) }, shape = CircleShape, containerColor = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(vertical = 8.dp)) { Icon(d.icon, "Post") }
                    else NavigationRailItem(d.label == "Chats", { onTab(d.label) }, { Icon(d.icon, null) }, label = { Text(d.label) })
                }
            }
        }
        Scaffold(
            containerColor = header,
            bottomBar = { if (width == WindowWidthSizeClass.Compact) BottomBar(onTab) },
        ) { pad ->
            Column(Modifier.padding(pad).fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(12.dp, 12.dp, 4.dp, 28.dp), verticalAlignment = Alignment.CenterVertically) {
                    Surface(Modifier.weight(1f).height(40.dp).clickable { comingSoon("Search") }, shape = CircleShape, color = MaterialTheme.colorScheme.surface) {
                        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Search, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("  Search chats, people, groups", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp)
                        }
                    }
                    IconButton({ comingSoon("Menu") }) { Icon(Icons.Filled.MoreVert, "More options", tint = MaterialTheme.colorScheme.onPrimary) }
                }
                Surface(Modifier.fillMaxSize().offset(y = (-16).dp), shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp), color = MaterialTheme.colorScheme.background) {
                    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Box(Modifier.size(92.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) {
                            Icon(Icons.Outlined.Forum, null, Modifier.size(44.dp), tint = MaterialTheme.colorScheme.primary)
                        }
                        Text("Start a conversation", fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 20.dp))
                        Text("Tap the button below to chat with your friends, family or groups", textAlign = TextAlign.Center,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.widthIn(max = 300.dp).padding(top = 8.dp))
                        Button({ comingSoon("Chats") }, Modifier.padding(top = 24.dp).height(44.dp), shape = CircleShape) {
                            Icon(Icons.Outlined.AddComment, null); Text("  Start chat", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BottomBar(onTab: (String) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
        Row(Modifier.fillMaxWidth().height(64.dp).navigationBarsPadding(), horizontalArrangement = Arrangement.SpaceAround, verticalAlignment = Alignment.Bottom) {
            dests.forEach { d ->
                val selected = d.label == "Chats"
                Column(Modifier.weight(1f).clickable { onTab(d.label) }.padding(bottom = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (d.label == "Post") Box(Modifier.offset(y = (-16).dp).size(56.dp).background(MaterialTheme.colorScheme.primary, CircleShape), contentAlignment = Alignment.Center) {
                        Icon(d.icon, "Post", tint = MaterialTheme.colorScheme.onPrimary)
                    } else Icon(d.icon, null, tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(d.label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
