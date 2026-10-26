package com.houfu72.tend.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.graphics.SolidColor
import com.houfu72.tend.NotifyStatus
import com.houfu72.tend.TIPS
import com.houfu72.tend.TendController
import com.houfu72.tend.core.MINUTE
import com.houfu72.tend.core.Phase
import com.houfu72.tend.core.Status
import com.houfu72.tend.core.plural
import kotlinx.coroutines.delay

@Composable
fun Sheets(c: TendController) {
    val pending = c.state.pending
    when {
        pending != null -> ReviewSheet(c)
        c.restoreCandidate != null -> RestoreSheet(c)
        c.startOpen -> StartSheet(c)
        c.settingsOpen -> SettingsSheet(c)
        c.tipOpen -> TipSheet(c)
    }
}

@Composable
private fun Actions(content: @Composable () -> Unit) = Column(Modifier.fillMaxWidth().padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { content() }

@Composable
private fun StartSheet(c: TendController) {
    var question by remember { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    PixelDialog({ c.startOpen = false }) {
        DialogHeading("Pick one question.", "01 / A LITTLE INTENTION")
        SmallNote("Make it small enough to stay with. A task works too.", Modifier.padding(bottom = 18.dp))
        PixelField(question, { question = it }, Modifier.focusRequester(focus), singleLine = true, maxLength = 500,
            placeholder = "e.g. How does this paper model transport?", imeAction = ImeAction.Go, onSubmit = { c.startWithQuestion(question) })
        Actions {
            PrimaryKey("Start focusing", symbol = "▶") { c.startWithQuestion(question) }
            SecondaryKey("Not yet", Modifier.fillMaxWidth()) { c.startOpen = false }
        }
    }
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(Unit) { delay(100); focus.requestFocus(); keyboard?.show() }
}

@Composable
private fun ReviewSheet(c: TendController) {
    if (c.state.pending == null) return
    var armedAt by remember { mutableLongStateOf(0L) }
    PixelDialog({}, dismissible = false) {
        // Read the notes here, inside the dialog's own composition: a value captured outside reaches the dialog a
        // frame late, and the field would snap back to it mid-word.
        val pending = c.state.pending ?: return@PixelDialog
        DialogHeading("A moment to gather.", "03 / LEAVE YOURSELF A THREAD")
        SmallNote(
            (if (pending.completed) "Interval finished" else "Session ended early") + " · " +
                plural(Math.round(pending.durationMs.toDouble() / MINUTE), "minute") + " recorded. " + pending.question,
            Modifier.padding(bottom = 20.dp)
        )
        listOf(
            Triple("What did you learn?", pending.learned, "A finding, an assumption, a clearer understanding…") to c::setLearned,
            Triple("Where are you stuck?", pending.stuck, "An unresolved question is useful to record.") to c::setStuck,
            Triple("What is the next small action?", pending.next, "Leave a clear starting point for next time.") to c::setNext
        ).forEach { (field, onChange) ->
            Text(field.first, Type.label)
            Spacer(Modifier.height(8.dp))
            PixelField(field.second, onChange, placeholder = field.third)
            Spacer(Modifier.height(18.dp))
        }
        SmallNote("All three are optional. You can save the session as it is.")
        Actions {
            PrimaryKey("Save & start break") { c.finishReview(true) }
            SecondaryKey("Save & finish", Modifier.fillMaxWidth()) { c.finishReview(false) }
        }
        val armed = armedAt > 0
        Box(Modifier.fillMaxWidth().padding(top = 10.dp), contentAlignment = Alignment.Center) {
            TextLink(if (armed) "Press again to discard it" else "Don’t save this session", size = 11, color = if (armed) Px.tomato else Px.muted) {
                if (armed) { armedAt = 0; c.discardSession() } else armedAt = System.currentTimeMillis()
            }
        }
        if (armed) LaunchedEffect(armedAt) { delay(4000); armedAt = 0 }
    }
}

@Composable
private fun SettingsSheet(c: TendController) {
    val settings = c.state.settings
    val locked = c.state.timer.status != Status.IDLE || c.state.timer.phase != Phase.FOCUS
    var focus by remember { mutableStateOf(settings.focus.toString()) }
    var short by remember { mutableStateOf(settings.short.toString()) }
    var long by remember { mutableStateOf(settings.long.toString()) }
    var invalid by remember { mutableStateOf(false) }
    PixelDialog({ c.settingsOpen = false }) {
        DialogHeading("Your rhythm.", "MAKE YOURSELF COMFORTABLE", onClose = { c.settingsOpen = false }, closeLabel = "Close settings")
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            NumberField("Focus", focus, !locked, Modifier.weight(1f)) { focus = it }
            NumberField("Short break", short, !locked, Modifier.weight(1f)) { short = it }
            NumberField("Long break", long, !locked, Modifier.weight(1f)) { long = it }
        }
        Spacer(Modifier.height(12.dp))
        SmallNote(
            when {
                locked -> "Finish the current session or break before changing durations."
                invalid -> "Use 5–120 minutes of focus, a 1–30 minute short break and a 5–60 minute long break."
                else -> "Longer break after every four full sessions. Adjust the rhythm to your work."
            },
            color = if (invalid && !locked) Px.tomato else Px.muted
        )
        Spacer(Modifier.height(14.dp))
        SecondaryKey("Apply rhythm", Modifier.fillMaxWidth(), enabled = !locked) {
            invalid = !c.applyRhythm(focus.trim().toIntOrNull(), short.trim().toIntOrNull(), long.trim().toIntOrNull())
        }
        Spacer(Modifier.height(18.dp))
        SettingsRow("A gentle chime", "At the end of a session or break.") { PixelSwitch(settings.sound, "A gentle chime", c::setSound) }
        SettingsRow("Keep the screen awake", "While a timer is running.") { PixelSwitch(settings.keepAwake, "Keep the screen awake", c::setKeepAwake) }
        SettingsRow(
            "Session reminders",
            when (c.notifyStatus) {
                NotifyStatus.AUTHORIZED -> "Enabled. Android notification and Do Not Disturb settings still apply."
                NotifyStatus.DENIED -> "Turned off in Android settings. You can change this there."
                NotifyStatus.NOT_DETERMINED -> "Optional reminders when the app is in the background."
            }
        ) {
            when (c.notifyStatus) {
                NotifyStatus.AUTHORIZED -> SecondaryKey("Enabled", enabled = false) {}
                NotifyStatus.DENIED -> SecondaryKey("Open settings") { c.platform?.openNotificationSettings() }
                NotifyStatus.NOT_DETERMINED -> SecondaryKey("Enable") { c.platform?.askNotifications() }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Px.line))
        Spacer(Modifier.height(20.dp))
        PixelText("Your notes, your copy.")
        Spacer(Modifier.height(9.dp))
        SmallNote("Saved on this device. Export a backup before changing phones or clearing the app’s data. Android device backups may also include it.")
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SecondaryKey("Export backup", Modifier.weight(1f)) { c.exportBackup() }
            SecondaryKey("Restore backup", Modifier.weight(1f)) { c.platform?.pickBackup() }
        }
    }
}

@Composable
private fun NumberField(label: String, value: String, enabled: Boolean, modifier: Modifier, onChange: (String) -> Unit) {
    Column(modifier) {
        Text(label, Type.label.copy(fontSize = 11.sp))
        SmallNote("minutes", Modifier.padding(bottom = 8.dp))
        BasicTextField(
            value, { onChange(it.filter(Char::isDigit).take(3)) }, enabled = enabled, singleLine = true,
            textStyle = Type.field.copy(color = if (enabled) Px.ink else Px.muted), cursorBrush = SolidColor(Px.green),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth().pixelFrame(Px.edge).background(Px.field).padding(horizontal = 12.dp, vertical = 11.dp)
        )
    }
}

@Composable
private fun SettingsRow(title: String, note: String, control: @Composable () -> Unit) {
    Box(Modifier.fillMaxWidth().height(1.dp).background(Px.line))
    Row(Modifier.fillMaxWidth().padding(vertical = 17.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(15.dp)) {
        Column(Modifier.weight(1f)) {
            Text(title, Type.label)
            SmallNote(note, Modifier.padding(top = 3.dp))
        }
        control()
    }
}

@Composable
private fun RestoreSheet(c: TendController) {
    PixelDialog(c::cancelRestore) {
        DialogHeading("Restore this notebook?")
        SmallNote("This will replace the notes and timer currently on this device. Export a backup first if you want to keep them.")
        Actions {
            PrimaryKey("Restore notebook", onClick = c::confirmRestore)
            SecondaryKey("Cancel", Modifier.fillMaxWidth(), onClick = c::cancelRestore)
        }
    }
}

@Composable
private fun TipSheet(c: TendController) {
    val tip = TIPS[c.tipIndex.coerceIn(TIPS.indices)]
    PixelDialog({ c.tipOpen = false }) {
        DialogHeading(tip.title, "A SMALL THING TO COME BACK TO", onClose = { c.tipOpen = false }, closeLabel = "Close focus reminder")
        Text(tip.body, Type.body.copy(fontSize = 14.sp, lineHeight = 23.sp))
        Spacer(Modifier.height(12.dp))
        SmallNote(tip.credit, color = Px.muted)
        Actions {
            SecondaryKey("Another reminder", Modifier.fillMaxWidth()) { c.showTip(next = true) }
            SecondaryKey("Read the source ↗", Modifier.fillMaxWidth()) { c.tipOpen = false; c.openSource(tip.source) }
        }
    }
}

