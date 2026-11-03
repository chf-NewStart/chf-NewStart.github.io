package com.houfu72.tend.core

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

/** The room's warm-up strip must name the same task and streak as focus/daily.js (tests/tend-daily.test.cjs). */
class DailyTest {
    @Test fun todaysTaskMatchesTheWebRotation() {
        // daily.js: dayNumber(new Date(2026, 10, 3)) is 20760, so 3 Nov is "track", 4 Nov "ripe" and 9 Nov "track" again.
        val day = LocalDate.of(2026, 11, 3)
        assertEquals(20760L, day.toEpochDay())
        assertEquals("track", Daily.challengeFor(day).id)
        assertEquals("ripe", Daily.challengeFor(day.plusDays(1)).id)
        assertEquals("track", Daily.challengeFor(day.plusDays(6)).id)
        assertEquals(Daily.challenges.map { it.id }.toSet(), (0L..5L).map { Daily.challengeFor(day.plusDays(it)).id }.toSet())
    }

    @Test fun streakLastsUntilTheEndOfTheNextDay() {
        val json = """{"best":{},"plays":{},"streak":{"count":3,"last":"2026-11-03"},"good":[]}"""
        assertEquals(3, Daily.streakOn(json, LocalDate.of(2026, 11, 3)))
        assertEquals(3, Daily.streakOn(json, LocalDate.of(2026, 11, 4)))
        assertEquals(0, Daily.streakOn(json, LocalDate.of(2026, 11, 5)))
        assertEquals(0, Daily.streakOn(null, LocalDate.of(2026, 11, 3)))
        assertEquals(0, Daily.streakOn("not json", LocalDate.of(2026, 11, 3)))
    }

    @Test fun backupCarriesTheWarmUpAndOlderReadersIgnoreIt() {
        val daily = """{"best":{"ink":80},"plays":{},"streak":{"count":2,"last":"2026-11-03"},"good":[{"d":"2026-11-03","t":"Sun","w":""}]}"""
        val file = encodePretty(TendState(), Daily.forBackup(daily))
        assertEquals(Json.parseToJsonElement(daily), Json.parseToJsonElement(Daily.fromBackup(file)!!))
        assertEquals(TendState().settings, restore(file).settings)
        assertEquals(null, Daily.fromBackup(encodePretty(TendState())))
        assertEquals(null, Daily.forBackup("not json"))
    }
}
