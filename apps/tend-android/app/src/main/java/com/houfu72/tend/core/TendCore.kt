package com.houfu72.tend.core

import java.time.DayOfWeek
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

// Tend's timer and notebook, ported from focus/core.js. Pure functions over immutable state; the saved
// JSON is the web room's "tend-focus-v1" shape, so a backup moves freely between web, iOS and Android.
// A function that changes nothing returns the very same state object, as in the web room.

const val SCHEMA = "tend-focus-v1"
const val MINUTE = 60_000L

enum class Phase(val json: String) { FOCUS("focus"), BREAK("break") }
enum class Status(val json: String) { IDLE("idle"), RUNNING("running"), PAUSED("paused"), REVIEW("review") }

data class Settings(
    val focus: Int = 25, val short: Int = 5, val long: Int = 15,
    val sound: Boolean = true, val keepAwake: Boolean = false, val notify: Boolean = false
)

data class Task(val question: String = "", val finish: String = "")

data class Thought(val id: String, val text: String, val done: Boolean = false)

/** A saved session, or the pending one waiting for its reflection. Times are epoch milliseconds. */
data class Session(
    val id: String, val question: String, val finish: String,
    val startedAt: Long, val endedAt: Long, val durationMs: Long, val completed: Boolean,
    val learned: String = "", val stuck: String = "", val next: String = ""
)

data class Timer(
    val phase: Phase, val status: Status, val durationMs: Long, val remainingMs: Long,
    val endAt: Long? = null, val startedAt: Long? = null, val id: String? = null, val task: Task? = null
)

data class TendState(
    val settings: Settings = Settings(),
    val plan: String = "",
    val task: Task = Task(),
    val later: List<Thought> = emptyList(),
    val sessions: List<Session> = emptyList(),
    val completedCount: Int = 0,
    val timer: Timer = freshTimer(settings),
    val pending: Session? = null
)

class TendException(message: String) : Exception(message)

fun text(value: String?, max: Int = 4000): String = value?.take(max) ?: ""

private fun number(value: Double?, fallback: Double, min: Double, max: Double): Double =
    if (value != null && value.isFinite()) min(max, max(min, value)) else fallback

fun freshTimer(settings: Settings, phase: Phase = Phase.FOCUS, minutes: Int = settings.focus) =
    Timer(phase, Status.IDLE, minutes * MINUTE, minutes * MINUTE)

fun createState() = TendState()

fun remaining(timer: Timer, now: Long = System.currentTimeMillis()): Long =
    if (timer.status == Status.RUNNING) max(0L, min(timer.durationMs, (timer.endAt ?: now) - now)) else timer.remainingMs

fun elapsed(timer: Timer, now: Long = System.currentTimeMillis()): Long = max(0L, timer.durationMs - remaining(timer, now))

private fun makePending(timer: Timer, now: Long, completed: Boolean) = Session(
    id = timer.id ?: "session-$now", question = timer.task?.question ?: "", finish = timer.task?.finish ?: "",
    startedAt = timer.startedAt ?: now, endedAt = if (completed) timer.endAt ?: now else now,
    durationMs = if (completed) timer.durationMs else elapsed(timer, now), completed = completed
)

fun advance(state: TendState, now: Long = System.currentTimeMillis()): TendState {
    val timer = state.timer
    if (timer.status != Status.RUNNING || remaining(timer, now) > 0) return state
    if (timer.phase == Phase.BREAK) return state.copy(timer = freshTimer(state.settings))
    return state.copy(
        pending = makePending(timer, now, true),
        timer = timer.copy(status = Status.REVIEW, remainingMs = 0, endAt = null)
    )
}

fun start(state: TendState, now: Long = System.currentTimeMillis(), id: String = "session-$now"): TendState {
    val current = advance(state, now)
    val timer = current.timer
    if (timer.status == Status.REVIEW || timer.status == Status.RUNNING) return current
    if (timer.status == Status.PAUSED) return current.copy(timer = timer.copy(status = Status.RUNNING, endAt = now + timer.remainingMs))
    if (timer.phase == Phase.FOCUS && current.task.question.isBlank()) throw TendException("Choose one question or task first.")
    return current.copy(
        timer = timer.copy(
            status = Status.RUNNING, endAt = now + timer.remainingMs, startedAt = now, id = id,
            task = if (timer.phase == Phase.FOCUS) current.task.copy(question = current.task.question.trim()) else null
        )
    )
}

fun pause(state: TendState, now: Long = System.currentTimeMillis()): TendState {
    val current = advance(state, now)
    if (current.timer.status != Status.RUNNING) return current
    return current.copy(timer = current.timer.copy(status = Status.PAUSED, remainingMs = remaining(current.timer, now), endAt = null))
}

fun endEarly(state: TendState, now: Long = System.currentTimeMillis()): TendState {
    val current = advance(state, now)
    val timer = current.timer
    if (timer.status != Status.RUNNING && timer.status != Status.PAUSED) return current
    if (timer.phase == Phase.BREAK || elapsed(timer, now) < 1000) return current.copy(timer = freshTimer(current.settings))
    return current.copy(
        pending = makePending(timer, now, false),
        timer = timer.copy(status = Status.REVIEW, remainingMs = remaining(timer, now), endAt = null)
    )
}

fun saveReview(state: TendState, learned: String? = null, stuck: String? = null, next: String? = null, takeBreak: Boolean = false): TendState {
    val pending = state.pending ?: return state
    val session = pending.copy(learned = text(learned), stuck = text(stuck), next = text(next))
    val sessions = if (state.sessions.any { it.id == session.id }) state.sessions else state.sessions + session
    val completedCount = state.completedCount + if (session.completed) 1 else 0
    val longBreak = session.completed && completedCount % 4 == 0
    return state.copy(
        sessions = sessions, completedCount = completedCount, pending = null,
        task = Task(question = text(session.next.ifEmpty { session.question }, 500), finish = ""),
        timer = if (takeBreak) freshTimer(state.settings, Phase.BREAK, if (longBreak) state.settings.long else state.settings.short)
        else freshTimer(state.settings)
    )
}

fun discardReview(state: TendState): TendState {
    if (state.pending == null) return state
    return state.copy(pending = null, timer = freshTimer(state.settings))
}

fun setRhythm(state: TendState, focus: Double?, short: Double?, long: Double? = state.settings.long.toDouble()): TendState {
    if (state.timer.status != Status.IDLE || state.timer.phase != Phase.FOCUS) return state
    val settings = state.settings.copy(
        focus = number(focus, 25.0, 5.0, 120.0).roundToInt(),
        short = number(short, 5.0, 1.0, 30.0).roundToInt(),
        long = number(long, 15.0, 5.0, 60.0).roundToInt()
    )
    return state.copy(settings = settings, timer = freshTimer(settings))
}

// JavaScript's Math.round: halves round up.
private fun Double.roundToInt(): Int = kotlin.math.floor(this + 0.5).toInt()

fun localDate(value: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): String =
    Instant.ofEpochMilli(value).atZone(zone).toLocalDate().toString()

/** Monday 00:00 of the local week that contains [value]. */
fun weekStart(value: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): Long =
    Instant.ofEpochMilli(value).atZone(zone).toLocalDate()
        .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay(zone).toInstant().toEpochMilli()

fun weekSessions(sessions: List<Session>, now: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): List<Session> {
    val start = weekStart(now, zone)
    val end = Instant.ofEpochMilli(start).atZone(zone).toLocalDate().plusDays(7).atStartOfDay(zone).toInstant().toEpochMilli()
    return sessions.filter { it.endedAt in start until end }
}

fun plural(count: Long, word: String) = "$count $word" + if (count == 1L) "" else "s"
fun plural(count: Int, word: String) = plural(count.toLong(), word)

private fun minutes(ms: Long): Long = (ms.toDouble() / MINUTE).let { kotlin.math.floor(it + 0.5).toLong() }

fun weeklyMarkdown(state: TendState, now: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): String {
    val sessions = weekSessions(state.sessions, now, zone)
    val lines = mutableListOf(
        "# Research notes — week of " + localDate(weekStart(now, zone), zone), "", "## Intended result", "", state.plan.ifEmpty { "(Not set)" }, "",
        "## Work recorded", "", plural(sessions.size, "session") + " · " + plural(minutes(sessions.sumOf { it.durationMs }), "timer minute"), "",
        "Timer minutes record elapsed sessions, not a measure of attention or research quality.", ""
    )
    sessions.forEach { item ->
        lines += listOf("### " + localDate(item.endedAt, zone) + " — " + item.question, "",
            "Session: " + (if (item.completed) "full interval" else "ended early") + " · " + minutes(item.durationMs) + " min", "")
        if (item.finish.isNotEmpty()) lines += listOf("Intended outcome: " + item.finish, "")
        lines += listOf("Learned: " + item.learned.ifEmpty { "(No note)" }, "", "Stuck on: " + item.stuck.ifEmpty { "(No note)" }, "",
            "Next action: " + item.next.ifEmpty { "(No note)" }, "")
    }
    val parked = state.later.filter { !it.done }
    if (parked.isNotEmpty()) lines += listOf("## Parked thoughts", "") + parked.map { "- " + it.text } + ""
    return lines.joinToString("\n")
}

// ISO timestamps exactly as JavaScript's toISOString() writes them.
private val isoFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

fun isoString(ms: Long): String = isoFormat.format(Instant.ofEpochMilli(ms))

fun parseIso(value: String): Long? =
    runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()
        ?: runCatching { OffsetDateTime.parse(value).toInstant().toEpochMilli() }.getOrNull()

internal fun Double.toMillis(): Long = this.roundToLong()
