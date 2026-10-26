package com.houfu72.tend

import android.content.Context
import android.util.AtomicFile
import com.houfu72.tend.core.TendState
import com.houfu72.tend.core.createState
import com.houfu72.tend.core.encode
import com.houfu72.tend.core.restore
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

/** The notebook on this device: one JSON file in app storage, written off the main thread, newest state wins. */
class NotebookStore(context: Context) {
    private val dir = context.filesDir
    private val file = AtomicFile(File(dir, "notebook.json"))
    private val writer = Executors.newSingleThreadExecutor()
    private val queued = AtomicReference<TendState?>(null)

    class Loaded(val state: TendState, val unreadable: Boolean)

    fun load(): Loaded {
        if (!file.baseFile.exists()) return Loaded(createState(), false)
        return try {
            Loaded(restore(String(file.readFully(), Charsets.UTF_8)), false)
        } catch (_: Exception) {
            // Keep the unreadable copy aside before anything new is saved over it.
            runCatching { file.baseFile.copyTo(File(dir, "notebook-unreadable-${System.currentTimeMillis()}.json")) }
            Loaded(createState(), true)
        }
    }

    fun save(state: TendState, onError: () -> Unit) {
        if (queued.getAndSet(state) != null) return
        writer.execute {
            val latest = queued.getAndSet(null) ?: return@execute
            val stream = try { file.startWrite() } catch (_: Exception) { onError(); return@execute }
            try {
                stream.write(encode(latest).toByteArray(Charsets.UTF_8))
                file.finishWrite(stream)
            } catch (_: Exception) {
                file.failWrite(stream)
                onError()
            }
        }
    }

    /** For the restart receiver, which runs without the room. */
    fun readQuietly(): TendState? = runCatching { restore(String(file.readFully(), Charsets.UTF_8)) }.getOrNull()
}
