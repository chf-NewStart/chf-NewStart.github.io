package com.houfu72.tend.core

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put

// Reading and writing the notebook as the web room's JSON. restore() is core.js's restore(): it checks every
// field, keeps notes as plain text, drops what it cannot trust and throws only when the file is not a Tend backup.

@OptIn(ExperimentalSerializationApi::class)
private val pretty = Json { prettyPrint = true; prettyPrintIndent = "  " }

fun toJson(state: TendState): JsonObject = buildJsonObject {
    put("schema", SCHEMA)
    put("settings", buildJsonObject {
        put("focus", state.settings.focus); put("short", state.settings.short); put("long", state.settings.long)
        put("sound", state.settings.sound); put("keepAwake", state.settings.keepAwake); put("notify", state.settings.notify)
    })
    put("plan", state.plan)
    put("task", task(state.task))
    put("later", buildJsonArray { state.later.forEach { add(buildJsonObject { put("id", it.id); put("text", it.text); put("done", it.done) }) } })
    put("sessions", buildJsonArray { state.sessions.forEach { add(session(it)) } })
    put("completedCount", state.completedCount)
    val timer = state.timer
    put("timer", buildJsonObject {
        put("phase", timer.phase.json); put("status", timer.status.json)
        put("durationMs", timer.durationMs); put("remainingMs", timer.remainingMs)
        put("endAt", timer.endAt); put("startedAt", timer.startedAt); put("id", timer.id)
        put("task", timer.task?.let(::task) ?: JsonNull)
    })
    put("pending", state.pending?.let(::session) ?: JsonNull)
}

private fun task(task: Task) = buildJsonObject { put("question", task.question); put("finish", task.finish) }

private fun session(item: Session) = buildJsonObject {
    put("id", item.id); put("question", item.question); put("finish", item.finish)
    put("startedAt", isoString(item.startedAt)); put("endedAt", isoString(item.endedAt))
    put("durationMs", item.durationMs); put("completed", item.completed)
    put("learned", item.learned); put("stuck", item.stuck); put("next", item.next)
}

fun encode(state: TendState): String = toJson(state).toString()
fun encodePretty(state: TendState): String = pretty.encodeToString(JsonObject.serializer(), toJson(state))

// JavaScript-style reads: a number only when it is a finite JSON number, a string only when it is a string.
private fun JsonElement?.obj(): JsonObject? = this as? JsonObject
private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
private fun JsonElement?.num(): Double? = (this as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it.isFinite() }
private fun JsonElement?.isTrue(): Boolean = (this as? JsonPrimitive)?.let { !it.isString && it.content == "true" } == true
private fun JsonElement?.isFalse(): Boolean = (this as? JsonPrimitive)?.let { !it.isString && it.content == "false" } == true
private fun clamp(value: Double?, fallback: Double, min: Double, max: Double): Double =
    if (value != null) value.coerceIn(min, max) else fallback
private fun Double.jsRound(): Long = kotlin.math.floor(this + 0.5).toLong()

private fun normalizeSession(element: JsonElement?): Session {
    val item = element.obj()
    val id = item?.get("id").str()
    val endedAt = item?.get("endedAt").str()?.let(::parseIso)
    val startedAt = item?.get("startedAt").str()?.let(::parseIso)
    if (item == null || id == null || endedAt == null || startedAt == null) throw TendException("A saved session is invalid.")
    return Session(
        id = text(id, 160), question = text(item["question"].str(), 500), finish = text(item["finish"].str(), 500),
        startedAt = startedAt, endedAt = endedAt,
        durationMs = clamp(item["durationMs"].num(), 0.0, 0.0, 120.0 * MINUTE).jsRound(), completed = item["completed"].isTrue(),
        learned = text(item["learned"].str()), stuck = text(item["stuck"].str()), next = text(item["next"].str())
    )
}

/** Opens saved or imported JSON. Throws [TendException] when it is not a usable Tend notebook. */
fun restore(input: String, now: Long = System.currentTimeMillis()): TendState {
    val data = try { Json.parseToJsonElement(input) } catch (_: Exception) { throw TendException("This is not a Tend backup.") }
    return restore(data, now)
}

fun restore(input: JsonElement, now: Long = System.currentTimeMillis()): TendState {
    val data = input.obj()
    val sessionsJson = data?.get("sessions") as? JsonArray
    if (data == null || data["schema"].str() != SCHEMA || sessionsJson == null || sessionsJson.size > 10000) throw TendException("This is not a Tend backup.")
    val s = data["settings"].obj()
    val settings = Settings(
        focus = clamp(s?.get("focus").num(), 25.0, 5.0, 120.0).jsRound().toInt(),
        short = clamp(s?.get("short").num(), 5.0, 1.0, 30.0).jsRound().toInt(),
        long = clamp(s?.get("long").num(), 15.0, 5.0, 60.0).jsRound().toInt(),
        sound = !s?.get("sound").isFalse(), keepAwake = s?.get("keepAwake").isTrue(), notify = s?.get("notify").isTrue()
    )
    val taskJson = data["task"].obj()
    val later = ((data["later"] as? JsonArray) ?: JsonArray(emptyList())).take(1000)
        .mapNotNull { it.obj() }.filter { it["id"].str() != null }
        .map { Thought(id = text(it["id"].str(), 160), text = text(it["text"].str(), 1000), done = it["done"].isTrue()) }
    // Later copies of a session ID replace earlier ones but keep the first one's place, as a JavaScript Map does.
    val sessions = LinkedHashMap<String, Session>().apply { sessionsJson.forEach { normalizeSession(it).let { item -> put(item.id, item) } } }.values.toList()
    var state = TendState(
        settings = settings, plan = text(data["plan"].str()),
        task = Task(text(taskJson?.get("question").str(), 500), text(taskJson?.get("finish").str(), 500)),
        later = later, sessions = sessions,
        completedCount = clamp(data["completedCount"].num(), sessions.count { it.completed }.toDouble(), 0.0, 1_000_000.0).jsRound().toInt(),
        timer = freshTimer(settings)
    )
    val timer = data["timer"].obj()
    val phase = Phase.entries.firstOrNull { it.json == timer?.get("phase").str() }
    val status = Status.entries.firstOrNull { it.json == timer?.get("status").str() }
    if (timer != null && phase != null && status != null) {
        val durationMs = clamp(timer["durationMs"].num(), settings.focus.toDouble() * MINUTE, SHORTEST.toDouble(), 120.0 * MINUTE).jsRound()
        val needsTask = phase == Phase.FOCUS && status != Status.IDLE
        val timerTask = timer["task"].obj()
        val validTask = timerTask?.get("question").str()?.takeIf { it.isNotBlank() } != null
        val startedAt = timer["startedAt"].num()
        val endAt = timer["endAt"].num()
        val id = timer["id"].str()
        val validClock = startedAt != null && id != null && (status != Status.RUNNING || endAt != null)
        if (status == Status.IDLE || (validClock && (!needsTask || validTask))) {
            state = state.copy(timer = Timer(
                phase = phase, status = status, durationMs = durationMs,
                remainingMs = clamp(timer["remainingMs"].num(), durationMs.toDouble(), 0.0, durationMs.toDouble()).jsRound(),
                endAt = if (status == Status.RUNNING) endAt?.toMillis() else null, startedAt = startedAt?.toMillis(), id = id,
                task = if (validTask) Task(text(timerTask?.get("question").str(), 500), text(timerTask?.get("finish").str(), 500)) else null
            ))
        }
    }
    val pending = data["pending"]
    if (pending != null && pending !is JsonNull && state.timer.status == Status.REVIEW) state = state.copy(pending = normalizeSession(pending))
    if (state.timer.status == Status.REVIEW && state.pending == null) state = state.copy(timer = freshTimer(state.settings))
    return advance(state, now)
}
