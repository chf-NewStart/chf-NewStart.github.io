package com.houfu72.tend.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Local reasoning JSON. The shared JavaScript core validates its records on load. */
object Reasoning {
    const val PREFS = "tend-reasoning"
    const val KEY = "state"

    fun forBackup(json: String?): JsonElement? = json?.let {
        runCatching { Json.parseToJsonElement(it) as? JsonObject }.getOrNull()
    }

    fun fromBackup(contents: String): String? =
        runCatching { (Json.parseToJsonElement(contents) as? JsonObject)?.get("reasoning") as? JsonObject }.getOrNull()?.toString()
}
