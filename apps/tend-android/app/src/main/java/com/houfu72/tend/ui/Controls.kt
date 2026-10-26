package com.houfu72.tend.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.text.BasicText

@Composable
fun Text(text: String, style: TextStyle, modifier: Modifier = Modifier, color: Color = Color.Unspecified, align: TextAlign? = null, maxLines: Int = Int.MAX_VALUE) =
    BasicText(text, modifier, style.merge(TextStyle(color = color, textAlign = align ?: TextAlign.Unspecified)), maxLines = maxLines)

@Composable
fun Text(text: AnnotatedString, style: TextStyle, modifier: Modifier = Modifier, color: Color = Color.Unspecified) =
    BasicText(text, modifier, style.merge(TextStyle(color = color)))

/** Plank Pixel only has capitals, so display text is upper-cased before it is drawn. */
@Composable
fun PixelText(text: String, style: TextStyle = Type.h2, modifier: Modifier = Modifier, color: Color = Color.Unspecified, align: TextAlign? = null) =
    Text(text.uppercase(), style, modifier, color, align)

@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier) = Text(text, Type.eyebrow, modifier)

@Composable
fun SmallNote(text: String, modifier: Modifier = Modifier, color: Color = Color.Unspecified, align: TextAlign? = null) = Text(text, Type.small, modifier, color, align)

/** A plain clickable with no ripple: the pixel keys show their own pressed state. */
@Composable
fun Modifier.press(enabled: Boolean = true, role: Role = Role.Button, source: MutableInteractionSource? = null, onClick: () -> Unit): Modifier {
    val interaction = source ?: remember { MutableInteractionSource() }
    return clickable(interactionSource = interaction, indication = null, enabled = enabled, role = role, onClick = onClick)
}

@Composable
fun Citation(number: Int, onOpen: (Int) -> Unit) = Text(
    "[$number]", Type.mono.copy(fontSize = 10.sp),
    Modifier.press { onOpen(number) }.padding(horizontal = 6.dp, vertical = 10.dp).semantics { contentDescription = "Read source $number" }
)

@Composable
fun SectionLabel(title: String, number: String? = null, citation: Int? = null, onCitation: (Int) -> Unit = {}, trailing: (@Composable () -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        if (number != null) Box(
            Modifier.size(26.dp).border(1.dp, Px.green.copy(alpha = 0.3f)), contentAlignment = Alignment.Center
        ) { Text(number, Type.mono.copy(fontSize = 12.sp), color = Px.green) }
        PixelText(title, Type.h2, Modifier.weight(1f))
        if (citation != null) Citation(citation, onCitation)
        trailing?.invoke()
    }
}

@Composable
fun PixelCard(
    modifier: Modifier = Modifier, background: Color = Px.card, edge: Color = Px.edge, padding: Dp = 20.dp,
    content: @Composable ColumnScope.() -> Unit
) = Column(modifier.fillMaxWidth().pixelFrame(edge).background(background).padding(padding), content = content)

/** The tomato key (mint during a break): Plank Pixel label, a darker lip along the bottom, sinks when pressed. */
@Composable
fun PrimaryKey(label: String, modifier: Modifier = Modifier, symbol: String? = null, isBreak: Boolean = false, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val face = if (isBreak) Px.green else Px.tomato
    val lip = if (isBreak) Color(0xFF2A9D5A) else Px.tomatoDeep
    val edge = if (isBreak) Color(0xFFB6FFD0) else Color(0xFFFF8B76)
    val ink = if (isBreak) Color(0xFF03140A) else Color(0xFF1D0703)
    Row(
        modifier.fillMaxWidth().heightIn(min = 58.dp).offset(y = if (pressed) 2.dp else 0.dp).pixelFrame(edge).background(face)
            .drawBehind { val h = (if (pressed) 2 else 4).dp.toPx(); drawRect(lip, Offset(0f, size.height - h), Size(size.width, h)) }
            .press(source = source, onClick = onClick).padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically
    ) {
        if (symbol != null) { Text(symbol, Type.mono.copy(fontSize = 13.sp), color = ink); Spacer(Modifier.width(10.dp)) }
        PixelText(label, Type.h2, color = ink)
    }
}

@Composable
fun SecondaryKey(label: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier.heightIn(min = 46.dp).alpha(if (enabled) 1f else 0.45f).pixelFrame(Px.dialogEdge)
            .background(if (pressed) Color(0xFF13211A) else Px.keyDark).press(enabled, source = source, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) { Text(label.uppercase(), Type.key, align = TextAlign.Center) }
}

@Composable
fun TextLink(label: String, modifier: Modifier = Modifier, color: Color = Px.muted, size: Int = 12, underline: Boolean = false, onClick: () -> Unit) = Box(
    modifier.heightIn(min = 44.dp).press(onClick = onClick).padding(horizontal = 4.dp), contentAlignment = Alignment.Center
) {
    Text(label, Type.body.copy(fontSize = size.sp, textDecoration = if (underline) TextDecoration.Underline else null), color = color, align = TextAlign.Center)
}

/** A typed field: Plex Mono on a dark well whose notched edge lights up while you type. */
@Composable
fun PixelField(
    value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier, placeholder: String = "",
    minLines: Int = 2, singleLine: Boolean = false, enabled: Boolean = true, maxLength: Int = 4000,
    style: TextStyle = Type.field, frame: Boolean = true, imeAction: ImeAction = ImeAction.Default, onSubmit: (() -> Unit)? = null
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    BasicTextField(
        value = value, onValueChange = { onValueChange(it.take(maxLength)) }, enabled = enabled, singleLine = singleLine,
        minLines = if (singleLine) 1 else minLines, textStyle = style, cursorBrush = SolidColor(Px.green), interactionSource = source,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = imeAction),
        keyboardActions = KeyboardActions(onAny = { onSubmit?.invoke() }),
        modifier = modifier.fillMaxWidth().then(if (frame) Modifier.pixelFrame(if (focused) Px.focusEdge else Px.edge).background(Px.field) else Modifier),
        decorationBox = { inner ->
            Box(if (frame) Modifier.padding(horizontal = 14.dp, vertical = 12.dp) else Modifier) {
                if (value.isEmpty()) Text(placeholder, style, color = Px.muted.copy(alpha = 0.7f))
                inner()
            }
        }
    )
}

/** A square on/off switch with a cream knob, as in the settings sheet. */
@Composable
fun PixelSwitch(checked: Boolean, label: String, onChange: (Boolean) -> Unit) = Box(
    Modifier.size(width = 40.dp, height = 24.dp).background(if (checked) Px.green else Color(0xFF43534A))
        .toggleable(checked, role = Role.Switch, onValueChange = onChange).semantics { contentDescription = label }
) {
    Box(Modifier.padding(3.dp).size(18.dp).offset(x = if (checked) 16.dp else 0.dp).background(Px.ink))
}

/** A parked thought: a square check, its text, and a delete key. */
@Composable
fun ThoughtRow(text: String, done: Boolean, onToggle: () -> Unit, onDelete: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.Top) {
        Box(
            Modifier.size(44.dp).toggleable(done, role = Role.Checkbox) { onToggle() }
                .semantics { contentDescription = (if (done) "Mark as unreviewed: " else "Mark as reviewed: ") + text },
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.size(14.dp).then(if (done) Modifier.background(Px.green) else Modifier.border(1.dp, Color(0xFF526B5C))), contentAlignment = Alignment.Center) {
                if (done) Text("✓", Type.mono.copy(fontSize = 10.sp), color = Color(0xFF04140B))
            }
        }
        Text(
            text, Type.body.copy(textDecoration = if (done) TextDecoration.LineThrough else null),
            Modifier.weight(1f).padding(top = 12.dp, bottom = 10.dp), color = if (done) Px.muted else Px.ink
        )
        Box(
            Modifier.size(44.dp).press(onClick = onDelete).semantics { contentDescription = "Delete thought: $text" },
            contentAlignment = Alignment.Center
        ) { Text("×", Type.body.copy(fontSize = 18.sp), color = Px.muted) }
    }
}

/**
 * A sheet in the pixel style: notched 4dp edge with a black moat. It fills the window and keeps clear of the system
 * bars and the keyboard itself, so a sheet taller than what is left scrolls to its buttons instead of hiding them.
 */
@Composable
fun PixelDialog(onDismiss: () -> Unit, dismissible: Boolean = true, content: @Composable ColumnScope.() -> Unit) = Dialog(
    onDismissRequest = onDismiss,
    properties = DialogProperties(dismissOnBackPress = dismissible, dismissOnClickOutside = false, usePlatformDefaultWidth = false, decorFitsSystemWindows = false)
) {
    Box(
        Modifier.fillMaxSize().pointerInput(dismissible) { detectTapGestures { if (dismissible) onDismiss() } }
            .windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 22.dp, vertical = 24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            Modifier.widthIn(max = 560.dp).fillMaxWidth().pointerInput(Unit) { detectTapGestures { } }
                .pixelFrame(Color.Black, 13.dp).pixelFrame(Px.dialogEdge, 4.dp).background(Px.dialog)
                .verticalScroll(rememberScrollState()).padding(horizontal = 22.dp, vertical = 26.dp),
            content = content
        )
    }
}

@Composable
fun DialogHeading(title: String, eyebrow: String? = null, onClose: (() -> Unit)? = null, closeLabel: String = "Close") {
    Box(Modifier.fillMaxWidth().padding(bottom = 20.dp)) {
        Column(Modifier.padding(end = if (onClose != null) 40.dp else 0.dp)) {
            if (eyebrow != null) { Eyebrow(eyebrow); Spacer(Modifier.size(12.dp)) }
            PixelText(title, Type.h2)
        }
        if (onClose != null) Box(
            Modifier.align(Alignment.TopEnd).size(40.dp).pixelFrame(Px.edge).background(Color(0xFF0A100D)).press(onClick = onClose)
                .semantics { contentDescription = closeLabel },
            contentAlignment = Alignment.Center
        ) { Text("×", Type.body.copy(fontSize = 18.sp)) }
    }
}

@Composable
fun BoxScope.Toast(message: String, modifier: Modifier = Modifier) = Box(
    modifier.align(Alignment.BottomCenter).padding(horizontal = 24.dp).pixelFrame(Px.focusEdge).background(Px.toast).padding(horizontal = 19.dp, vertical = 12.dp)
) { Text(message, Type.body.copy(fontSize = 12.sp), color = Px.green, align = TextAlign.Center) }
