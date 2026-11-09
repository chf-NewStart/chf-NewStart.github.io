package com.houfu72.tend.core

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class ReasoningTest {
    @Test fun backupKeepsPrivateReasoningNotesBesideTheNotebookAndWarmUp() {
        val reasoning = """{"schema":"tend-reasoning-v1","attempts":[{"initialPrediction":"less","finalPrediction":"same","reason":"My assumption changed"}]}"""
        val daily = """{"good":[{"d":"2026-11-08","t":"Sun"}]}"""
        val file = encodePretty(TendState(), Daily.forBackup(daily), Reasoning.forBackup(reasoning))
        assertEquals(Json.parseToJsonElement(reasoning), Json.parseToJsonElement(Reasoning.fromBackup(file)!!))
        assertEquals(Json.parseToJsonElement(daily), Json.parseToJsonElement(Daily.fromBackup(file)!!))
        assertEquals(TendState().settings, restore(file).settings)
    }

    @Test fun oldOrMalformedBackupsDoNotReplaceReasoning() {
        assertEquals(null, Reasoning.fromBackup(encodePretty(TendState())))
        assertEquals(null, Reasoning.fromBackup("not json"))
        assertEquals(null, Reasoning.fromBackup("""{"reasoning":[]}"""))
        assertEquals(null, Reasoning.forBackup("not json"))
        assertEquals(null, Reasoning.forBackup("[]"))
    }
}
