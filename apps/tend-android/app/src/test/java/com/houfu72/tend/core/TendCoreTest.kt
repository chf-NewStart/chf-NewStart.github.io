package com.houfu72.tend.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

// The web room's tests (tests/focus-timer.test.cjs), case for case, plus checks that JSON from the web loads here.
class TendCoreTest {
    private val min = MINUTE
    private fun seed() = createState().copy(task = Task("Compare transport assumptions", "One clear distinction"))
    private fun roundTrip(state: TendState, now: Long) = restore(encode(state), now)

    @Test fun `an idle focus session needs one explicit task`() {
        val error = assertThrows(TendException::class.java) { start(createState(), 1000, "a") }
        assertTrue(error.message!!.startsWith("Choose one"))
        assertEquals(seed().task.question, start(seed(), 1000, "a").timer.task!!.question)
    }

    @Test fun `background time and a reload use a deadline, not tick counts`() {
        val state = start(seed(), 1000, "a")
        val restored = roundTrip(state, 1000 + 17 * min)
        assertEquals(8 * min, remaining(restored.timer, 1000 + 17 * min))
    }

    @Test fun `a session left overnight records only its intended interval once`() {
        val state = start(seed(), 1000, "a")
        val done = advance(state, 1000 + 12 * 60 * min)
        assertEquals(25 * min, done.pending!!.durationMs)
        assertEquals(isoString(1000 + 25 * min), isoString(done.pending!!.endedAt))
        assertSame(done, advance(done, 1000 + 13 * 60 * min))
        val saved = saveReview(done, learned = "A distinction")
        assertEquals(1, saved.sessions.size)
        assertSame(saved, saveReview(saved))
    }

    @Test fun `paused time is excluded, including after a reload`() {
        var state = start(seed(), 1000, "a")
        state = pause(state, 1000 + 5 * min)
        state = roundTrip(state, 1000 + 60 * min)
        assertEquals(20 * min, remaining(state.timer))
        state = start(state, 1000 + 60 * min)
        state = advance(state, 1000 + 80 * min)
        assertEquals(25 * min, state.pending!!.durationMs)
    }

    @Test fun `pausing after the deadline completes the session instead of losing it`() {
        val state = pause(start(seed(), 0, "a"), 26 * min)
        assertEquals(Status.REVIEW, state.timer.status)
        assertTrue(state.pending!!.completed)
    }

    @Test fun `ending early records only elapsed active time`() {
        var state = start(seed(), 1000, "a")
        state = pause(state, 1000 + 3 * min)
        state = endEarly(state, 1000 + 60 * min)
        assertEquals(3 * min, state.pending!!.durationMs)
        assertFalse(state.pending!!.completed)
        val saved = saveReview(state, takeBreak = true)
        assertEquals(0, saved.completedCount)
        assertEquals(5 * min, saved.timer.durationMs)
    }

    @Test fun `the fourth full session earns a long break and never auto-starts another focus`() {
        var state = seed().copy(completedCount = 3)
        state = start(state, 0, "four")
        state = saveReview(advance(state, 25 * min), next = "Check the boundary condition", takeBreak = true)
        assertEquals(15 * min, state.timer.durationMs)
        assertEquals(Status.IDLE, state.timer.status)
        state = start(state, 25 * min, "break")
        state = advance(state, 24 * 60 * min)
        assertEquals(Phase.FOCUS, state.timer.phase)
        assertEquals(Status.IDLE, state.timer.status)
        assertEquals(1, state.sessions.size)
        assertEquals("Check the boundary condition", state.task.question)
    }

    @Test fun `custom rhythms survive finishing a break`() {
        var state = setRhythm(seed(), 50.0, 10.0, 25.0)
        state = start(state, 0, "a")
        state = saveReview(advance(state, 50 * min), takeBreak = true)
        state = start(state, 50 * min, "b")
        state = advance(state, 60 * min)
        assertEquals(50 * min, state.timer.durationMs)
        assertEquals(10, state.settings.short)
    }

    @Test fun `durations cannot change in the middle of a session`() {
        val state = start(seed(), 0, "a")
        assertSame(state, setRhythm(state, 50.0, 10.0))
    }

    @Test fun `pending reflection drafts survive a reload`() {
        var state = advance(start(seed(), 0, "a"), 25 * min)
        state = state.copy(pending = state.pending!!.copy(learned = "The pool is shared"))
        state = roundTrip(state, 26 * min)
        assertEquals("The pool is shared", state.pending!!.learned)
        assertEquals(Status.REVIEW, state.timer.status)
    }

    @Test fun `invalid and oversized backups fail without replacing usable state`() {
        assertThrows(TendException::class.java) { restore("{broken") }
        assertThrows(TendException::class.java) { restore("""{"schema":"other","sessions":[]}""") }
        assertThrows(TendException::class.java) {
            restore(buildJsonObject { put("schema", SCHEMA); put("sessions", JsonArray(List(10001) { JsonNull })) })
        }
        // JSON.stringify writes Infinity as null; a running timer with a bad deadline cannot be trusted.
        val json = toJson(seed()).toMutableMap()
        json["settings"] = JsonObject(json["settings"]!!.jsonObject + ("focus" to JsonNull))
        json["timer"] = JsonObject(json["timer"]!!.jsonObject + mapOf("status" to JsonPrimitive("running"), "endAt" to JsonPrimitive("bad")))
        val restored = restore(JsonObject(json))
        assertEquals(Status.IDLE, restored.timer.status)
        assertEquals(25, restored.settings.focus)
    }

    @Test fun `backup restoration preserves notes as text and deduplicates session IDs`() {
        var state = saveReview(advance(start(seed(), 0, "a"), 25 * min), learned = "<script>never execute me</script>")
        state = state.copy(sessions = state.sessions + state.sessions[0])
        state = restore(encode(state))
        assertEquals(1, state.sessions.size)
        assertEquals("<script>never execute me</script>", state.sessions[0].learned)
    }

    @Test fun `weekly exports use the local Monday boundary and preserve actual reflections`() {
        val zone = ZoneId.of("America/Toronto")
        val monday = LocalDateTime.of(2026, 10, 26, 10, 0).atZone(zone).toInstant().toEpochMilli()
        val start = Instant.ofEpochMilli(weekStart(monday, zone)).atZone(zone)
        assertEquals(DayOfWeek.MONDAY, start.dayOfWeek)
        assertEquals(0, start.hour)
        var state = saveReview(advance(start(seed(), monday, "a"), monday + 25 * min), "One finding", "One question", "One action")
        state = state.copy(plan = "One weekly result")
        val report = weeklyMarkdown(state, monday, zone)
        assertTrue(report.contains("One weekly result"))
        assertTrue(report.contains("Learned: One finding"))
        assertTrue(report.contains("1 session · 25 timer minutes"))
        val nextMonday = LocalDateTime.of(2026, 11, 2, 10, 0).atZone(zone).toInstant().toEpochMilli()
        assertEquals(0, weekSessions(state.sessions, nextMonday, zone).size)
    }

    @Test fun `a discarded session leaves no record and keeps the question ready`() {
        var state = advance(start(seed(), 0, "a"), 25 * min)
        state = discardReview(state.copy(pending = state.pending!!.copy(learned = "never mind")))
        assertNull(state.pending)
        assertEquals(0, state.sessions.size)
        assertEquals(0, state.completedCount)
        assertEquals(Status.IDLE, state.timer.status)
        assertEquals(Phase.FOCUS, state.timer.phase)
        assertEquals(seed().task.question, state.task.question)
        assertSame(state, discardReview(state))
    }

    @Test fun `the web notification opt-in survives a reload and defaults to off`() {
        assertFalse(createState().settings.notify)
        val state = createState().let { it.copy(settings = it.settings.copy(notify = true)) }
        assertTrue(restore(encode(state)).settings.notify)
        val bare = JsonObject(toJson(createState()) + ("settings" to buildJsonObject { put("focus", 25) }))
        assertFalse(restore(bare).settings.notify)
    }

    @Test fun `counts read naturally`() {
        assertEquals("1 session", plural(1, "session"))
        assertEquals("0 sessions", plural(0, "session"))
        assertEquals("2 minutes", plural(2, "minute"))
    }

    // Android only: a notebook saved by the web room (JSON.stringify of its state) opens here unchanged.
    @Test fun `a quick timer ends without a reflection, is not recorded and leaves the question alone`() {
        val state = start(seed().copy(timer = quickTimer("Plank", 90_000)), 0, "q")
        assertEquals(Phase.QUICK, state.timer.phase)
        assertEquals("Plank", state.timer.task!!.question)
        assertEquals(90_000L, state.timer.endAt)
        assertEquals(seed().task, state.task)
        val done = advance(state, 91_000)
        assertNull(done.pending)
        assertEquals(0, done.sessions.size)
        assertEquals(0, done.completedCount)
        assertEquals(Phase.FOCUS, done.timer.phase)
        assertEquals(Status.IDLE, done.timer.status)
        assertEquals(seed().task.question, done.task.question)
        val stopped = endEarly(pause(state, 30_000), 40_000)
        assertNull(stopped.pending)
        assertEquals(Phase.FOCUS, stopped.timer.phase)
        assertEquals("Plank", start(pause(state, 30_000), 50_000).timer.task!!.question)
    }

    @Test fun `a 30-second quick timer survives a reload, and nothing shorter than 5 seconds does`() {
        val state = start(seed().copy(timer = quickTimer("Rest", 30_000)), 0, "q")
        val restored = roundTrip(state, 10_000)
        assertEquals(30_000L, restored.timer.durationMs)
        assertEquals("Rest", restored.timer.task!!.question)
        assertEquals(20_000L, remaining(restored.timer, 10_000))
        val tiny = roundTrip(state.copy(timer = state.timer.copy(durationMs = 1000, remainingMs = 1000, endAt = 1000)), 0)
        assertEquals(5_000L, tiny.timer.durationMs)
    }

    @Test fun `an iPhone quick timer in a backup opens here`() {
        val iphone = """{"schema":"tend-focus-v1","settings":{"focus":25,"short":5,"long":15},"plan":"","task":{"question":"Write the introduction","finish":""},
            "later":[],"sessions":[],"completedCount":0,"timer":{"phase":"quick","status":"running","durationMs":90000,"remainingMs":90000,
            "endAt":1793020290000,"startedAt":1793020200000,"id":"q1","task":{"question":"Plank","finish":""}},"pending":null}"""
        val state = restore(iphone, 1793020200000 + 30_000)
        assertEquals(Phase.QUICK, state.timer.phase)
        assertEquals("Plank", state.timer.task!!.question)
        assertEquals(60_000L, remaining(state.timer, 1793020200000 + 30_000))
        assertEquals("Write the introduction", state.task.question)
    }

    @Test fun `a web room backup opens with its sessions, thoughts and running timer`() {
        val web = """{"schema":"tend-focus-v1","settings":{"focus":50,"short":10,"long":20,"sound":false,"keepAwake":true,"notify":false},
            "plan":"A comparison","task":{"question":"How is sugar split?","finish":""},
            "later":[{"id":"t1","text":"Email Sardar","done":false},{"id":"t2","text":"Old tab","done":true},{"text":"no id"}],
            "sessions":[{"id":"s1","question":"Q","finish":"","startedAt":"2026-10-26T14:00:00.000Z","endedAt":"2026-10-26T14:25:00.000Z",
            "durationMs":1500000,"completed":true,"learned":"L","stuck":"","next":"N"}],"completedCount":1,
            "timer":{"phase":"focus","status":"running","durationMs":3000000,"remainingMs":3000000,"endAt":1793023200000,
            "startedAt":1793020200000,"id":"s2","task":{"question":"How is sugar split?","finish":""}},"pending":null}"""
        val state = restore(web, 1793020200000 + 10 * min)
        assertEquals(50, state.settings.focus)
        assertFalse(state.settings.sound)
        assertEquals(2, state.later.size)
        assertEquals("2026-10-26T14:25:00.000Z", isoString(state.sessions[0].endedAt))
        assertEquals(Status.RUNNING, state.timer.status)
        assertEquals(40 * min, remaining(state.timer, 1793020200000 + 10 * min))
        // And what Android writes, the web room's parser reads: same keys, ISO dates, numbers for the clock.
        val written = Json.parseToJsonElement(encode(state)).jsonObject
        assertEquals("2026-10-26T14:00:00.000Z", (written["sessions"] as JsonArray)[0].jsonObject["startedAt"]!!.let { (it as JsonPrimitive).content })
        assertEquals("1793023200000", written["timer"]!!.jsonObject["endAt"].toString())
    }
}
