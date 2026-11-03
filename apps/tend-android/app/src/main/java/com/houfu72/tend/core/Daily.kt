package com.houfu72.tend.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate

/**
 * The warm-up's names and rotation, mirrored from focus/daily.js so the room can say what today's task is. The tasks
 * themselves run in that shared page (DailyActivity), which saves its JSON under [KEY] through TendAndroidDaily.
 */
object Daily {
    const val PREFS = "tend-daily"
    const val KEY = "state"

    data class Challenge(val id: String, val name: String, val label: String, val time: String)

    val challenges = listOf(
        Challenge("track", "Track the ripe ones", "Sustained tracking", "About 1½ min"),
        Challenge("ripe", "Only the ripe", "Steady attention", "About 1 min"),
        Challenge("flank", "Middle arrow", "Ignoring distraction", "About 1 min"),
        Challenge("ink", "Ink, not word", "Holding back the obvious", "About 1 min"),
        Challenge("back", "Two back", "Working memory", "About 1½ min"),
        Challenge("time", "Count the seconds", "Time awareness", "About 1½ min"),
    )
    val rest = listOf("Sigh it out", "Look far away", "One good thing")

    /** One task a day in the person's own calendar: daily.js counts days since 1970-01-01 the same way. */
    fun challengeFor(date: LocalDate): Challenge = challenges[Math.floorMod(date.toEpochDay(), challenges.size.toLong()).toInt()]

    /** Days in a row today's task was finished. Like daily.js, a streak lasts until the end of the following day. */
    fun streakOn(json: String?, date: LocalDate): Int {
        val streak = runCatching { Json.parseToJsonElement(json ?: return 0).jsonObject["streak"]?.jsonObject }.getOrNull() ?: return 0
        val count = streak["count"]?.jsonPrimitive?.intOrNull ?: return 0
        val last = streak["last"]?.jsonPrimitive?.contentOrNull ?: return 0
        return if (last == date.toString() || last == date.minusDays(1).toString()) count.coerceAtLeast(0) else 0
    }
}
