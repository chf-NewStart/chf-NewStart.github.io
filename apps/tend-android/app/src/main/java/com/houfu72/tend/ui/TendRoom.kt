package com.houfu72.tend.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.houfu72.tend.Room
import com.houfu72.tend.TendController
import com.houfu72.tend.core.Status
import kotlinx.coroutines.delay

@Composable
fun TendRoom(c: TendController) {
    val view = LocalView.current
    val keepAwake = c.state.settings.keepAwake && c.state.timer.status == Status.RUNNING
    LaunchedEffect(keepAwake) { view.keepScreenOn = keepAwake }
    BackHandler(enabled = c.quiet || c.room != Room.FOCUS) { if (c.quiet) c.setQuietView(false) else c.changeRoom(Room.FOCUS) }
    val onLink: (String) -> Unit = { c.platform?.openUrl(it) }

    Box(Modifier.fillMaxSize().roomBackground().scanlines()) {
        BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            val wide = maxWidth >= 840.dp
            if (c.quiet) QuietRoom(c) else Column(Modifier.fillMaxSize()) {
                TopBar(c)
                // One scroll position per room, so switching tabs returns to where you were.
                val scrolls = remember { Room.entries.associateWith { ScrollState(0) } }
                val targets = remember { Targets() }
                val scroll = scrolls.getValue(c.room)
                Box(Modifier.weight(1f).fillMaxWidth().onGloballyPositioned { targets.viewport = it }) {
                    Column(
                        Modifier.fillMaxSize().verticalScroll(scroll).imePadding().padding(horizontal = if (wide) 40.dp else 20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Column(Modifier.widthIn(max = if (wide) 1100.dp else 600.dp).fillMaxWidth().padding(bottom = 16.dp)) {
                            when (c.room) {
                                Room.FOCUS -> FocusRoom(c, wide, onLink)
                                Room.NOTEBOOK -> NotebookRoom(c, wide, targets::modifier)
                                Room.SOURCES -> SourcesRoom(targets::modifier, onLink)
                            }
                            if (c.room != Room.FOCUS) Footer(onLink)
                        }
                    }
                }
                val target = c.scrollTarget
                LaunchedEffect(target, c.room) {
                    if (target == null) return@LaunchedEffect
                    delay(60) // let the room lay out
                    targets.offset(target, scroll.value)?.let { scroll.animateScrollTo((it - 24).coerceAtLeast(0)) }
                    c.scrollTarget = null
                }
            }
        }
        c.storageWarning?.let {
            Box(Modifier.align(Alignment.TopCenter).windowInsetsPadding(WindowInsets.safeDrawing).padding(12.dp).pixelFrame(Px.tomatoDeep).background(Color(0xFF1A0B08)).padding(14.dp)) {
                Text(it, Type.small.copy(fontSize = 12.sp), color = Px.ink)
            }
        }
        val toast = c.toast
        if (toast != null) {
            Toast(toast.second, Modifier.windowInsetsPadding(WindowInsets.safeDrawing).padding(bottom = 25.dp))
            LaunchedEffect(toast.first) { delay(4000); if (c.toast?.first == toast.first) c.dismissToast() }
        }
    }
    Sheets(c)
}

/** Source cards and parked thoughts the room can scroll to: positions are read when needed. */
private class Targets {
    var viewport: LayoutCoordinates? = null
    private val nodes = HashMap<String, LayoutCoordinates>()
    fun modifier(key: String): Modifier = Modifier.onGloballyPositioned { nodes[key] = it }
    fun offset(key: String, scroll: Int): Int? {
        val node = nodes[key]?.takeIf { it.isAttached } ?: return null
        val top = viewport?.takeIf { it.isAttached } ?: return null
        return (node.positionInRoot().y - top.positionInRoot().y).toInt() + scroll
    }
}

@Composable
private fun TopBar(c: TendController) {
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f).press { c.changeRoom(Room.FOCUS) }.semantics { contentDescription = "Tend home" }, verticalAlignment = Alignment.CenterVertically) {
                PixelTomato(Modifier.size(26.dp, 23.dp))
                Spacer(Modifier.width(12.dp))
                Column {
                    PixelText("Tend", Type.h1)
                    Text("focus / note / return", Type.mono.copy(fontSize = 9.sp))
                }
            }
            IconKey("Show a focus reminder", { c.showTip() }) { PixelTomato(Modifier.size(19.dp, 17.dp)) }
            Spacer(Modifier.width(12.dp))
            IconKey("Open settings", { c.settingsOpen = true }) { SlidersIcon() }
        }
        Row(Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 14.dp), horizontalArrangement = Arrangement.Center) {
            val open = c.state.later.count { !it.done }
            Tab("Focus", c.room == Room.FOCUS) { c.changeRoom(Room.FOCUS) }
            Tab("Notebook", c.room == Room.NOTEBOOK, badge = open.takeIf { it > 0 }) { c.changeRoom(Room.NOTEBOOK) }
            Tab("Sources ↗", c.room == Room.SOURCES) { c.changeRoom(Room.SOURCES) }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Px.line))
    }
}

@Composable
private fun Tab(label: String, selected: Boolean, badge: Int? = null, onClick: () -> Unit) {
    Row(
        Modifier.padding(horizontal = 6.dp).heightIn(min = 44.dp)
            .then(if (selected) Modifier.pixelFrame(Px.intentionEdge).background(Px.tabOn) else Modifier)
            .press(onClick = onClick).semantics { role = Role.Tab; this.selected = selected }.padding(horizontal = 13.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label.uppercase(), Type.mono.copy(fontSize = 12.sp, letterSpacing = 0.04.em), color = if (selected) Px.green else Px.muted)
        if (badge != null) {
            Spacer(Modifier.width(8.dp))
            Box(Modifier.background(Color(0xFF14261C)).padding(horizontal = 6.dp, vertical = 1.dp)) { Text("$badge", Type.mono.copy(fontSize = 10.sp), color = Px.green) }
        }
    }
}

@Composable
private fun IconKey(label: String, onClick: () -> Unit, content: @Composable () -> Unit) = Box(
    Modifier.size(44.dp).pixelFrame(Px.edge).background(Color(0xFF0A100D)).press(onClick = onClick).semantics { contentDescription = label },
    contentAlignment = Alignment.Center
) { content() }

@Composable
private fun SlidersIcon() = Canvas(Modifier.size(22.dp)) {
    val s = size.width / 24f
    val stroke = Stroke(1.5f * s)
    drawLine(Px.ink, Offset(4 * s, 7 * s), Offset(20 * s, 7 * s), 1.5f * s)
    drawLine(Px.ink, Offset(4 * s, 17 * s), Offset(20 * s, 17 * s), 1.5f * s)
    drawCircle(Color(0xFF0A100D), 3 * s, Offset(9 * s, 7 * s)); drawCircle(Px.ink, 3 * s, Offset(9 * s, 7 * s), style = stroke)
    drawCircle(Color(0xFF0A100D), 3 * s, Offset(16 * s, 17 * s)); drawCircle(Px.ink, 3 * s, Offset(16 * s, 17 * s), style = stroke)
}

/** Quiet view: just the ring, the tomato, the time and the question. */
@Composable
private fun QuietRoom(c: TendController) {
    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(top = 90.dp, bottom = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Column(Modifier.widthIn(max = 530.dp).fillMaxWidth()) {
                TimerCard(c, quiet = true)
                Spacer(Modifier.height(26.dp))
                IntentionCard(c, quiet = true)
            }
        }
        SecondaryKey("Exit quiet view", Modifier.align(Alignment.TopEnd).padding(top = 20.dp, end = 25.dp)) { c.setQuietView(false) }
    }
}
