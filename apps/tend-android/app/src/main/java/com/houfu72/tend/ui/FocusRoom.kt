package com.houfu72.tend.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.layout.layout
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.BasicText
import com.houfu72.tend.TendController
import com.houfu72.tend.core.MINUTE
import com.houfu72.tend.core.Phase
import com.houfu72.tend.core.Status
import com.houfu72.tend.core.localDate
import com.houfu72.tend.core.remaining

private val PRESETS = listOf(15 to 3, 25 to 5, 50 to 10)

@Composable
fun FocusRoom(c: TendController, wide: Boolean, onLink: (String) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Spacer(Modifier.height(26.dp))
        Eyebrow("GIVE ONE THING YOUR ATTENTION")
        Spacer(Modifier.height(10.dp))
        PixelText("One question.", Type.h1)
        PixelText("Go deeper.", Type.h1, color = Px.tomato)
        Spacer(Modifier.height(26.dp))
        if (wide) {
            Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                TimerCard(c, Modifier.weight(1.1f))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(28.dp)) { IntentionCard(c); LaterCard(c) }
            }
        } else {
            TimerCard(c)
            Spacer(Modifier.height(28.dp))
            IntentionCard(c)
            Spacer(Modifier.height(28.dp))
            LaterCard(c)
        }
        DeskBottom(c)
        Footer(onLink)
    }
}

@Composable
fun TimerCard(c: TendController, modifier: Modifier = Modifier, quiet: Boolean = false) {
    val state = c.state
    val timer = state.timer
    val isBreak = timer.phase == Phase.BREAK
    val isQuick = timer.phase == Phase.QUICK
    val reviewing = timer.status == Status.REVIEW
    val running = timer.status == Status.RUNNING
    val editable = timer.status == Status.IDLE && timer.phase == Phase.FOCUS
    Column(
        modifier.fillMaxWidth().then(if (quiet) Modifier else Modifier.pixelFrame(Px.edge).background(Px.card)).padding(horizontal = 20.dp, vertical = if (quiet) 0.dp else 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (!quiet) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(6.dp).then(if (running) Modifier.shadow(6.dp, CircleShape, ambientColor = Px.green, spotColor = Px.green) else Modifier).clip(CircleShape).background(Px.green))
                Spacer(Modifier.width(7.dp))
                Text(if (isBreak) "A LITTLE BREATHING ROOM" else if (isQuick) "QUICK TIMER" else "FOCUS SESSION", Type.mono.copy(fontSize = 9.sp, letterSpacing = 0.13.em), Modifier.weight(1f), color = Px.ink)
                TextLink("⛶  Quiet view", size = 11) { c.setQuietView(true) }
            }
            Spacer(Modifier.height(12.dp))
            Rhythms(c, editable)
            Spacer(Modifier.height(10.dp))
        }
        Dial(c, quiet)
        val dots = state.completedCount % 4 + if (state.completedCount % 4 == 0 && isBreak && state.completedCount > 0) 4 else 0
        Row(
            Modifier.padding(vertical = 18.dp).semantics { contentDescription = "$dots of 4 full sessions toward a longer break" },
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            repeat(4) { i -> Box(Modifier.size(8.dp).then(if (i < dots) Modifier.background(Px.tomato) else Modifier.border(1.dp, Px.pip))) }
        }
        PrimaryKey(
            label = when { reviewing -> "Reflect on this session"; running -> "Pause"; timer.status == Status.PAUSED -> "Continue"; isBreak -> "Start break"; else -> "Start focusing" },
            symbol = when { reviewing -> "↳"; running -> "Ⅱ"; else -> "▶" }, isBreak = isBreak, onClick = c::toggleTimer
        )
        if (running || timer.status == Status.PAUSED || isBreak) {
            Spacer(Modifier.height(4.dp))
            TextLink(if (isBreak) "Skip break · return to focus" else if (isQuick) "Stop timer" else "Finish early & reflect", onClick = c::endOrSkip)
        }
        if (!quiet) {
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                SmallNote(if (isBreak) "A little distance from the work." else if (isQuick) "A quick timer from Siri. Your question is still here." else "${state.settings.focus} minutes of focus, then ${state.settings.short} to breathe.", color = Px.muted)
                if (!isQuick) Citation(if (isBreak) 5 else 3, c::openSource)
            }
        }
    }
}

@Composable
private fun Rhythms(c: TendController, editable: Boolean) {
    Row(Modifier.fillMaxWidth().pixelFrame(Px.edge).background(Px.card).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        PRESETS.forEach { (focus, short) ->
            val on = c.state.settings.focus == focus && c.state.settings.short == short
            Box(
                Modifier.weight(1f).heightIn(min = 40.dp).alpha(if (editable || on) 1f else 0.45f).background(if (on) Px.green else Color.Transparent)
                    .press(enabled = editable) { c.choosePreset(focus, short) },
                contentAlignment = Alignment.Center
            ) { Text("$focus / $short", Type.mono.copy(fontSize = 11.sp), color = if (on) Color(0xFF03140A) else Px.muted) }
        }
        Box(
            Modifier.weight(1f).heightIn(min = 40.dp).alpha(if (editable) 1f else 0.45f).press(enabled = editable) { c.settingsOpen = true }
                .semantics { contentDescription = "Set custom timer duration" },
            contentAlignment = Alignment.Center
        ) { Text("Custom", Type.mono.copy(fontSize = 11.sp)) }
    }
}

@Composable
private fun Dial(c: TendController, quiet: Boolean) {
    val timer = c.state.timer
    val isBreak = timer.phase == Phase.BREAK
    val running = timer.status == Status.RUNNING
    val ms = remaining(timer, c.now)
    val left = if (timer.durationMs > 0) ms.toFloat() / timer.durationMs else 0f
    val seconds = (ms + 999) / 1000
    val time = "%02d:%02d".format(seconds / 60, seconds % 60)
    val blinkOn = !running || (c.now / 500) % 2 == 0L
    val density = LocalDensity.current
    // The digits ignore the font-size setting so they always fit inside the ring.
    val digits = with(density) { (if (quiet) 70 else 60).dp.toSp() }
    Box(Modifier.widthIn(max = if (quiet) 340.dp else 320.dp).fillMaxWidth().aspectRatio(1f), contentAlignment = Alignment.Center) {
        PixelRing(Modifier.matchParentSize(), left, if (isBreak) Px.green else Px.tomato, running, blinkOn)
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            PixelTomato(Modifier.size(if (quiet) 64.dp else 40.dp, if (quiet) 56.dp else 35.dp), if (isBreak) 1f else 1f - left)
            Spacer(Modifier.height(8.dp))
            Text(
                when {
                    timer.status == Status.REVIEW -> "READY TO REFLECT"; timer.status == Status.PAUSED -> "PAUSED"; isBreak -> "TAKE A BREATH"
                    timer.phase == Phase.QUICK -> "KEEP GOING"; running -> "STAY WITH THIS"; else -> "SETTLE IN"
                },
                Type.mono.copy(fontSize = 10.sp, letterSpacing = 0.24.em), color = if (isBreak) Px.blue else Px.green
            )
            Spacer(Modifier.height(10.dp))
            val glow = if (isBreak) Px.green.copy(alpha = 0.35f) else Color(0x66FF5A43)
            val digitStyle = Type.h1.copy(fontSize = digits, lineHeight = digits, color = Px.ink, shadow = Shadow(glow, blurRadius = with(density) { 22.dp.toPx() }))
            Row(Modifier.semantics(mergeDescendants = true) { contentDescription = "${seconds / 60} minutes and ${seconds % 60} seconds remaining" }) {
                BasicText(time.substring(0, 2), style = digitStyle)
                // Plank Pixel's colon sits at the left of its box: trim the right so each side gets one blank cell.
                BasicText(":", Modifier.alpha(if (blinkOn) 1f else 0.12f).layout { measurable, constraints ->
                    val placeable = measurable.measure(constraints)
                    val trim = (digits.toPx() * 0.3f).toInt()
                    layout(placeable.width - trim, placeable.height) { placeable.place(0, 0) }
                }, style = digitStyle)
                BasicText(time.substring(3), style = digitStyle)
            }
            Spacer(Modifier.height(10.dp))
            Text(
                when {
                    timer.status == Status.REVIEW -> "leave yourself a thread"; isBreak -> "look away, stretch, get some water"
                    timer.phase == Phase.QUICK -> (timer.task?.question ?: "quick timer").lowercase(); else -> "one question at a time"
                },
                Type.mono.copy(fontSize = 10.sp), Modifier.widthIn(max = 220.dp), color = Px.muted, align = TextAlign.Center
            )
        }
    }
}

@Composable
fun IntentionCard(c: TendController, quiet: Boolean = false) {
    val timer = c.state.timer
    val inSession = timer.phase == Phase.FOCUS && timer.status != Status.IDLE
    val locked = inSession && timer.status == Status.REVIEW
    // While you type, the field shows what you typed (spaces and all); otherwise the session's own copy.
    var typing by remember { mutableStateOf(false) }
    val question = if (inSession && !typing) timer.task?.question ?: "" else c.state.task.question
    val finish = if (inSession) timer.task?.finish ?: "" else c.state.task.finish
    val questionFocus = Modifier.onFocusChanged {
        if (it.isFocused && !typing && inSession) c.setQuestion(timer.task?.question ?: c.state.task.question)
        if (!it.isFocused && typing) c.questionEdited()
        typing = it.isFocused
    }
    if (quiet) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 25.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            SmallNote(if (inSession) "Your question for this session" else "What’s your one question or task?", align = TextAlign.Center)
            Spacer(Modifier.height(14.dp))
            PixelField(question, c::setQuestion, questionFocus, enabled = !locked, frame = false, maxLength = 500,
                style = Type.field.copy(fontSize = 18.sp, lineHeight = 29.sp, textAlign = TextAlign.Center), placeholder = "e.g. How does this paper model transport?")
        }
        return
    }
    PixelCard(background = Px.intentionCard, edge = Px.intentionEdge) {
        SectionLabel("A little intention", "01", 1, c::openSource)
        Spacer(Modifier.height(16.dp))
        Text(if (inSession) "Your question for this session" else "What’s your one question or task?", Type.label)
        Spacer(Modifier.height(8.dp))
        PixelField(question, c::setQuestion, questionFocus, enabled = !locked, maxLength = 500, placeholder = "e.g. How does this paper model transport?")
        Spacer(Modifier.height(20.dp))
        Text(
            buildAnnotatedString {
                append("What would a useful stopping point look like?  ")
                withStyle(SpanStyle(color = Px.muted, fontSize = 11.sp, fontWeight = FontWeight.Normal)) { append("optional") }
            }, Type.label
        )
        Spacer(Modifier.height(8.dp))
        PixelField(finish, c::setFinish, enabled = !locked, maxLength = 500, placeholder = "One assumption understood. A small comparison. A clearer question.")
        Spacer(Modifier.height(13.dp))
        SmallNote("↳  Make it small enough to stay with.")
    }
}

@Composable
private fun LaterCard(c: TendController) {
    var draft by remember { mutableStateOf("") }
    val open = c.state.later.filter { !it.done }
    PixelCard(background = Px.laterCard) {
        SectionLabel("Leave it here, for later", "02", 4, c::openSource)
        Spacer(Modifier.height(13.dp))
        SmallNote("A new idea, a worry, another tab to open.\nWrite it down. Your question will still be here.", Modifier.padding(bottom = 16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            PixelField(draft, { draft = it }, Modifier.weight(1f), placeholder = "Park a thought…", singleLine = true, maxLength = 1000,
                imeAction = ImeAction.Done, onSubmit = { if (c.parkThought(draft)) draft = "" })
            Spacer(Modifier.width(12.dp))
            Box(
                Modifier.size(48.dp).pixelFrame(Px.dialogEdge).background(Px.keyDark).press { if (c.parkThought(draft)) draft = "" }
                    .semantics { contentDescription = "Save thought for later" },
                contentAlignment = Alignment.Center
            ) { Text("+", Type.h2, color = Px.green) }
        }
        Spacer(Modifier.height(8.dp))
        open.takeLast(2).forEach { ThoughtRow(it.text, it.done, { c.toggleThought(it.id) }, { c.deleteThought(it.id) }) }
        if (open.size > 2) TextLink("See all ${open.size} in Notebook →", onClick = c::showParked)
        Spacer(Modifier.height(10.dp))
        SmallNote("If I drift, I’ll make a note and return.")
    }
}

@Composable
private fun DeskBottom(c: TendController) {
    val today = c.state.sessions.count { localDate(it.endedAt) == localDate(c.now) }
    val minutes = c.todayMinutes
    Column(Modifier.fillMaxWidth().padding(top = 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SmallNote("❧  Showing up counts. So does coming back.")
        if (today > 0) Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) { repeat(minOf(12, today)) { PixelTomato(Modifier.size(16.dp, 14.dp)) } }
        Row(horizontalArrangement = Arrangement.spacedBy(25.dp)) {
            Stat(today.toLong(), if (today == 1) "session today" else "sessions today")
            Stat(minutes, if (minutes == 1L) "minute tended" else "minutes tended")
        }
    }
}

@Composable
private fun Stat(value: Long, words: String) = Text(
    buildAnnotatedString {
        withStyle(SpanStyle(color = Px.ink, fontWeight = FontWeight.SemiBold)) { append("$value ") }
        append(words)
    }, Type.small.copy(fontSize = 10.sp)
)

@Composable
fun Footer(onLink: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 30.dp, bottom = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Px.line))
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            TextLink("From Houfu’s desk ↗", size = 10) { onLink("https://houfu72.com/#tools-section") }
            TextLink("Privacy", size = 10) { onLink("https://houfu72.com/focus/privacy.html") }
            TextLink("Help", size = 10) { onLink("https://houfu72.com/focus/support.html") }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(4.dp).clip(CircleShape).background(Px.green))
            Spacer(Modifier.width(7.dp))
            SmallNote("Notes stay on this device", Modifier, Px.muted)
        }
    }
}
