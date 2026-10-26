package com.houfu72.tend.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.houfu72.tend.TendController
import com.houfu72.tend.core.MINUTE
import com.houfu72.tend.core.Session
import com.houfu72.tend.core.localDate
import com.houfu72.tend.core.plural
import com.houfu72.tend.core.weekSessions
import com.houfu72.tend.core.weekStart
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle as DayStyle
import java.util.Locale
import kotlin.math.roundToLong

@Composable
fun PageHeading(eyebrow: String, title: String, intro: String) {
    Column(Modifier.padding(top = 32.dp, bottom = 28.dp)) {
        Eyebrow(eyebrow)
        Spacer(Modifier.height(12.dp))
        PixelText(title, Type.h1)
        Spacer(Modifier.height(14.dp))
        Text(intro, Type.small.copy(fontSize = 12.sp, lineHeight = 20.sp))
    }
}

@Composable
fun NotebookRoom(c: TendController, wide: Boolean, target: (String) -> Modifier) {
    val state = c.state
    Column(Modifier.fillMaxWidth()) {
        PageHeading("A THREAD TO COME BACK TO", "Your notebook.", "Keep the question, the small discoveries, and the next step.")
        val plan = @Composable { m: Modifier ->
            PixelCard(m) {
                SectionLabel("One result for this week", "01", 2, c::openSource)
                Spacer(Modifier.height(16.dp))
                Text("What would you like to be able to show or explain?", Type.label)
                Spacer(Modifier.height(8.dp))
                PixelField(state.plan, c::setPlan, minLines = 3, placeholder = "e.g. A comparison of transport assumptions in two models.")
                Spacer(Modifier.height(12.dp))
                SmallNote("A direction you can revise. An unresolved question can be progress, too.")
            }
        }
        if (wide) Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) { plan(Modifier.weight(1f)); WeekCard(c, Modifier.weight(1f)) }
        else { plan(Modifier); Spacer(Modifier.height(28.dp)); WeekCard(c) }
        Spacer(Modifier.height(34.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).padding(end = 12.dp)) {
                PixelText("Session notes")
                Spacer(Modifier.height(6.dp))
                SmallNote("Timer minutes record elapsed sessions, not attention or research quality.", color = Px.muted)
            }
            SecondaryKey("Export this week ↗") { c.exportWeek() }
        }
        Spacer(Modifier.height(20.dp))
        if (state.sessions.isEmpty()) {
            PixelCard {
                PixelText("Small discoveries belong here.")
                Spacer(Modifier.height(8.dp))
                SmallNote("Finish a session and leave a few words for your future self.")
                Spacer(Modifier.height(16.dp))
                SecondaryKey("Choose your first question →") { c.changeRoom(com.houfu72.tend.Room.FOCUS) }
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(22.dp)) { state.sessions.asReversed().forEach { SessionCard(it) } }
        }
        Spacer(Modifier.height(30.dp))
        val open = state.later.count { !it.done }
        PixelCard(target("parked")) {
            SectionLabel("Parked thoughts", trailing = { if (open > 0) SmallNote("$open to return to") })
            Spacer(Modifier.height(8.dp))
            if (state.later.isEmpty()) SmallNote("Nothing parked. There’s room when you need it.")
            state.later.asReversed().forEach { ThoughtRow(it.text, it.done, { c.toggleThought(it.id) }, { c.deleteThought(it.id) }) }
            if (state.later.any { it.done }) TextLink("Clear reviewed thoughts", onClick = c::clearReviewed)
        }
        Spacer(Modifier.height(10.dp))
    }
}

@Composable
private fun WeekCard(c: TendController, modifier: Modifier = Modifier) {
    val zone = ZoneId.systemDefault()
    val start = Instant.ofEpochMilli(weekStart(c.now)).atZone(zone).toLocalDate()
    val days = (0L until 7L).map { start.plusDays(it) }
    val week = weekSessions(c.state.sessions, c.now)
    val minutes = days.map { day -> week.filter { localDate(it.endedAt) == day.toString() }.sumOf { it.durationMs }.toDouble() / MINUTE }
    val max = maxOf(25.0, minutes.max())
    val today = localDate(c.now)
    PixelCard(modifier) {
        PixelText("This week, gently")
        Spacer(Modifier.height(20.dp))
        Row(
            Modifier.fillMaxWidth().height(130.dp).semantics {
                contentDescription = days.zip(minutes).joinToString(", ") { (d, m) -> d.dayOfWeek.getDisplayName(DayStyle.FULL, Locale.getDefault()) + " " + m.roundToLong() + " minutes" }
            },
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            days.forEachIndexed { i, day ->
                Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                    val color = if (day.toString() == today) Px.tomato else Px.green.copy(alpha = 0.55f)
                    val fraction = maxOf(0.03f, (minutes[i] / max).toFloat())
                    Canvas(Modifier.weight(1f).widthIn(max = 24.dp).fillMaxWidth()) {
                        val seg = 5.dp.toPx(); val gap = 2.dp.toPx()
                        val height = size.height * fraction
                        var y = size.height
                        while (y > size.height - height) {
                            val h = minOf(seg, y - (size.height - height))
                            drawRect(color, Offset(0f, y - h), Size(size.width, h))
                            y -= seg + gap
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(day.dayOfWeek.getDisplayName(DayStyle.NARROW, Locale.getDefault()), Type.mono.copy(fontSize = 10.sp), color = if (day.toString() == today) Px.ink else Px.muted)
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        val total = minutes.sum().roundToLong()
        SmallNote(if (week.isNotEmpty()) plural(week.size, "session") + " · " + plural(total, "minute") + " recorded. A thread you’re building." else "Your first session belongs here.")
    }
}

private val whenFormat: DateTimeFormatter = DateTimeFormatter.ofPattern(
    android.text.format.DateFormat.getBestDateTimePattern(Locale.getDefault(), "MMMd jmm"), Locale.getDefault()
)

@Composable
private fun SessionCard(item: Session) {
    PixelCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(whenFormat.format(Instant.ofEpochMilli(item.endedAt).atZone(ZoneId.systemDefault())), Type.mono.copy(fontSize = 10.sp))
            Text("${(item.durationMs.toDouble() / MINUTE).roundToLong()} min", Type.mono.copy(fontSize = 10.sp))
            Spacer(Modifier.weight(1f))
            Box(Modifier.border(1.dp, Px.line).padding(horizontal = 7.dp, vertical = 2.dp)) {
                Text(if (item.completed) "Full interval" else "Ended early", Type.mono.copy(fontSize = 10.sp))
            }
        }
        Spacer(Modifier.height(14.dp))
        PixelText(item.question)
        if (item.finish.isNotEmpty()) { Spacer(Modifier.height(8.dp)); SmallNote(item.finish) }
        val notes = listOf("Learned" to item.learned, "Stuck on" to item.stuck, "Next small action" to item.next).filter { it.second.isNotEmpty() }
        Spacer(Modifier.height(14.dp))
        if (notes.isEmpty()) SmallNote("Session saved without reflection notes.")
        notes.forEach { (label, value) ->
            Text(label.uppercase(), Type.eyebrow.copy(fontSize = 9.sp))
            Spacer(Modifier.height(4.dp))
            Text(value, Type.body)
            Spacer(Modifier.height(12.dp))
        }
    }
}

private class Source(val type: String, val title: String, val author: String, val summary: String, val inTend: String, val links: List<Pair<String, String>>)

private val SOURCES = listOf(
    Source("BOOK · 2016", "Deep Work", "Cal Newport · Grand Central Publishing",
        "Make deliberate room for demanding work, with routines that protect your attention.",
        "One question before the timer, a useful stopping point, and Quiet view. These prompts are our adaptation.",
        listOf("Book & publisher’s introduction ↗" to "https://www.hachettebookgroup.com/titles/cal-newport/deep-work/9781455586677/")),
    Source("BOOK · 2024", "Slow Productivity", "Cal Newport · Portfolio",
        "Reduce simultaneous commitments, allow a sustainable pace, and give worthwhile work sustained care.",
        "One intended weekly result instead of a growing list of competing projects. This is our adaptation of Newport’s approach.",
        listOf("The author on the book’s principles ↗" to "https://calnewport.com/my-new-book-slow-productivity/")),
    Source("METHOD", "The Pomodoro Technique", "Francesco Cirillo",
        "Choose one activity, use work intervals and breaks, and observe interruptions and actual effort.",
        "A 25/5 starting rhythm and a longer break after four full sessions. Custom rhythms are available. The method is broader than a timer; 25/5 is not established here as universally optimal.",
        listOf("The creator’s explanation ↗" to "https://www.pomodorotechnique.com/what-is-the-pomodoro-technique/")),
    Source("RESEARCH · META-ANALYSIS · 2006", "Make an if–then plan", "Peter M. Gollwitzer & Paschal Sheeran",
        "The authors’ meta-analysis found that specifying when and how to act can support goal attainment across studied settings.",
        "An optional plan: if you drift, jot down the thought and return. This particular distraction prompt was not tested in the cited analysis.",
        listOf("Implementation Intentions and Goal Achievement ↗" to "https://doi.org/10.1016/S0065-2601(06)38002-1",
            "Author-hosted paper (PDF) ↗" to "https://www.socmot.uni-konstanz.de/sites/default/files/06_Gollwitzer_Sheeran_Implementation_Intentions_And_Goal.pdf")),
    Source("RESEARCH · SYSTEMATIC REVIEW & META-ANALYSIS · 2022", "Breaks are part of the work",
        "Patricia Albulescu, Irina Macsinga, Andrei Rusu, Coralia Sulea, Alexandra Bodnaru & Bogdan Tudor Tulbure · PLOS ONE 17(8), e0272460",
        "Across 22 study samples, short breaks had small beneficial effects on energy and fatigue. The overall performance effect was not statistically significant; demanding work may require longer recovery.",
        "A reminder to step away and adjust your break to your needs. This study does not establish the app’s presets as optimal or promise better research performance.",
        listOf("“Give me a break!” — read the open-access paper ↗" to "https://doi.org/10.1371/journal.pone.0272460"))
)

@Composable
fun SourcesRoom(target: (String) -> Modifier, onLink: (String) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        PageHeading("THE IDEAS BEHIND THE PRACTICE", "Rooted in something.", "Books offer approaches. Studies offer evidence. Here’s what each contributes.")
        Row(Modifier.padding(bottom = 26.dp)) {
            Box(Modifier.width(2.dp).height(86.dp).background(Px.green.copy(alpha = 0.35f)))
            Spacer(Modifier.width(18.dp))
            Text("↳", Type.body.copy(fontSize = 25.sp), color = Px.green)
            Spacer(Modifier.width(14.dp))
            Text(
                "Tend combines a focus timer with original research prompts. The specific interface, weekly result, and three-question reflection are our adaptations; the sources below have not validated this app.",
                Type.small.copy(lineHeight = 20.sp)
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(26.dp)) {
            SOURCES.forEachIndexed { i, source ->
                PixelCard(target("source-${i + 1}"), padding = 22.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("%02d".format(i + 1), Type.mono.copy(fontSize = 19.sp), Modifier.weight(1f))
                        Text(source.type, Type.mono.copy(fontSize = 8.sp), align = TextAlign.End)
                    }
                    Spacer(Modifier.height(22.dp))
                    PixelText(source.title)
                    Spacer(Modifier.height(10.dp))
                    SmallNote(source.author, color = Px.muted)
                    Spacer(Modifier.height(16.dp))
                    Text(source.summary, Type.body)
                    Spacer(Modifier.height(16.dp))
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Px.line))
                    Spacer(Modifier.height(16.dp))
                    Text("IN TEND", Type.eyebrow.copy(fontSize = 10.sp))
                    Spacer(Modifier.height(4.dp))
                    Text(source.inTend, Type.body, color = Px.muted)
                    Spacer(Modifier.height(12.dp))
                    source.links.forEach { (label, url) -> TextLink(label, color = Px.green, underline = true) { onLink(url) } }
                }
            }
        }
        Spacer(Modifier.height(24.dp))
        SmallNote("Independent app by Houfu Chen. No affiliation with or endorsement by the authors. Summaries are paraphrases; book text is not reproduced.", color = Px.muted)
        Spacer(Modifier.height(10.dp))
    }
}

