package com.houfu72.tend

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.houfu72.tend.core.MINUTE
import com.houfu72.tend.core.Phase
import com.houfu72.tend.core.Status
import com.houfu72.tend.core.TendException
import com.houfu72.tend.core.TendState
import com.houfu72.tend.core.Thought
import com.houfu72.tend.core.advance
import com.houfu72.tend.core.discardReview
import com.houfu72.tend.core.encodePretty
import com.houfu72.tend.core.endEarly
import com.houfu72.tend.core.freshTimer
import com.houfu72.tend.core.localDate
import com.houfu72.tend.core.pause
import com.houfu72.tend.core.restore
import com.houfu72.tend.core.saveReview
import com.houfu72.tend.core.setRhythm
import com.houfu72.tend.core.start
import com.houfu72.tend.core.weekStart
import com.houfu72.tend.core.weeklyMarkdown
import java.util.UUID

enum class Room { FOCUS, NOTEBOOK, SOURCES }
enum class NotifyStatus { AUTHORIZED, DENIED, NOT_DETERMINED }

/** What the room needs from Android: sound, touch feedback and the notification permission. */
interface Platform {
    fun chime()
    fun feedback()
    fun askNotifications()
    fun openNotificationSettings()
    fun share(filename: String, contents: String, mime: String)
    fun pickBackup()
    fun openUrl(url: String)
}

/**
 * The room's behaviour, ported from focus/app.js: one state, committed and saved after every change, with the
 * timer reconciled against the clock four times a second while Tend is on screen. It lives as long as the process,
 * so a rotation or a new window keeps a half-typed question.
 */
class TendController(context: Context) {
    private val app = context.applicationContext
    private val store = NotebookStore(app)
    private val main = Handler(Looper.getMainLooper())
    var platform: Platform? = null

    private val loaded = store.load()
    var state by mutableStateOf(loaded.state); private set
    var now by mutableLongStateOf(System.currentTimeMillis()); private set
    var room by mutableStateOf(Room.FOCUS); private set
    var quiet by mutableStateOf(false); private set
    var storageWarning by mutableStateOf<String?>(null); private set
    var toast by mutableStateOf<Pair<Long, String>?>(null); private set
    var startOpen by mutableStateOf(false)
    var settingsOpen by mutableStateOf(false)
    var tipIndex by mutableIntStateOf(-1)
    var restoreCandidate by mutableStateOf<TendState?>(null); private set
    var notifyStatus by mutableStateOf(NotifyStatus.NOT_DETERMINED)
    /** A source card or the parked thoughts to scroll to once their room is showing. */
    var scrollTarget by mutableStateOf<String?>(null)
    private var toastCount = 0L

    init {
        if (loaded.unreadable) storageWarning = "Saved data could not be opened. A new notebook is shown; your previous saved copy has been kept aside. Restore a backup in Settings if you have one."
        Reminders.sync(app, state)
    }

    fun showToast(message: String) { toast = ++toastCount to message }
    fun dismissToast() { toast = null }

    private fun commit(next: TendState) {
        state = next
        store.save(next) {
            main.post { storageWarning = "Your latest changes are only in memory because device storage could not be updated. Export a backup in Settings before leaving." }
        }
        Reminders.sync(app, next)
    }

    private fun uid() = UUID.randomUUID().toString()

    /** Catches the timer up with the clock; ends an interval or break whose deadline has passed. */
    fun reconcile() {
        now = System.currentTimeMillis()
        val next = advance(state, now)
        if (next === state) return
        val ended = state.timer
        val late = now - (ended.endAt ?: now)
        commit(next)
        platform?.feedback()
        // Later than this, the notification already rang while Tend was away.
        if (late < 2000 && state.settings.sound) platform?.chime()
        if (ended.phase == Phase.BREAK) showToast("Break finished. Begin again when you’re ready.")
        if (ended.phase == Phase.QUICK) showToast((ended.task?.question ?: "Quick timer") + ": time’s up. Nice work.")
    }

    fun toggleTimer() {
        reconcile()
        if (state.pending != null) return
        val timer = state.timer
        if (timer.status == Status.RUNNING) { commit(pause(state, now)); return }
        if (timer.phase == Phase.FOCUS && timer.status == Status.IDLE && state.task.question.isBlank()) { startOpen = true; return }
        try { commit(start(state, now, uid())) } catch (error: TendException) { showToast(error.message ?: "Choose one question or task first."); return }
        // Asked once, the first time a focus session starts: reminders are how a locked phone hears the end.
        if (state.timer.phase == Phase.FOCUS && notifyStatus == NotifyStatus.NOT_DETERMINED) platform?.askNotifications()
    }

    fun startWithQuestion(question: String): Boolean {
        if (question.isBlank()) return false
        startOpen = false
        commit(state.copy(task = state.task.copy(question = question.trim())))
        toggleTimer()
        return true
    }

    fun endOrSkip() {
        reconcile()
        if (state.timer.phase == Phase.BREAK && state.timer.status == Status.IDLE) commit(state.copy(timer = freshTimer(state.settings)))
        else commit(endEarly(state, now))
    }

    // Both fields stay editable mid-session (a stopping point often comes once you've started); the edit goes into the
    // session's own copy too, so the reflection records it. A session's question can be reworded but never emptied.
    fun setQuestion(value: String) = editTask(question = value.take(500))
    fun setFinish(value: String) = editTask(finish = value.take(500))

    private fun editTask(question: String? = null, finish: String? = null) {
        var next = state.copy(task = state.task.copy(question = question ?: state.task.question, finish = finish ?: state.task.finish))
        val timer = state.timer
        val live = timer.phase == Phase.FOCUS && (timer.status == Status.RUNNING || timer.status == Status.PAUSED)
        val session = timer.task
        if (live && session != null && (finish != null || !question.isNullOrBlank())) {
            next = next.copy(timer = timer.copy(task = session.copy(question = question?.trim() ?: session.question, finish = finish ?: session.finish)))
        }
        commit(next)
    }

    /** Leaving the question field mid-session: an emptied question goes back to the session's own. */
    fun questionEdited() {
        val session = state.timer.task ?: return
        if (state.timer.phase == Phase.FOCUS && state.timer.status != Status.IDLE && state.task.question.isBlank()) {
            commit(state.copy(task = state.task.copy(question = session.question)))
        }
    }
    fun setPlan(value: String) = commit(state.copy(plan = value.take(4000)))

    fun setLearned(value: String) { state.pending?.let { commit(state.copy(pending = it.copy(learned = value.take(4000)))) } }
    fun setStuck(value: String) { state.pending?.let { commit(state.copy(pending = it.copy(stuck = value.take(4000)))) } }
    fun setNext(value: String) { state.pending?.let { commit(state.copy(pending = it.copy(next = value.take(4000)))) } }

    fun finishReview(takeBreak: Boolean) {
        val pending = state.pending ?: return
        var next = saveReview(state, pending.learned, pending.stuck, pending.next, takeBreak)
        if (takeBreak) next = start(next, System.currentTimeMillis(), uid())
        commit(next)
        showToast(if (takeBreak) "Session saved. Take a little breathing room." else "Session saved. There’s a thread to come back to.")
    }

    fun discardSession() {
        commit(discardReview(state))
        showToast("Session not saved. Your question is still here.")
    }

    /** Returns false when the field should keep its text (nothing typed, or the list is full). */
    fun parkThought(text: String): Boolean {
        val thought = text.trim()
        if (thought.isEmpty()) return false
        if (state.later.size >= 1000) { showToast("Review or remove some parked thoughts before adding more."); return false }
        commit(state.copy(later = state.later + Thought(uid(), thought.take(1000))))
        showToast("Parked. Come back to your question.")
        return true
    }

    fun toggleThought(id: String) = commit(state.copy(later = state.later.map { if (it.id == id) it.copy(done = !it.done) else it }))
    fun deleteThought(id: String) = commit(state.copy(later = state.later.filter { it.id != id }))
    fun clearReviewed() = commit(state.copy(later = state.later.filter { !it.done }))

    fun choosePreset(focus: Int, short: Int) = commit(setRhythm(state, focus.toDouble(), short.toDouble()))

    /** The settings form. Returns false (and changes nothing) when a duration is outside its range. */
    fun applyRhythm(focus: Int?, short: Int?, long: Int?): Boolean {
        if (focus == null || focus !in 5..120 || short == null || short !in 1..30 || long == null || long !in 5..60) return false
        commit(setRhythm(state, focus.toDouble(), short.toDouble(), long.toDouble()))
        settingsOpen = false
        showToast("Your rhythm is set.")
        return true
    }

    fun setSound(on: Boolean) = commit(state.copy(settings = state.settings.copy(sound = on)))
    fun setKeepAwake(on: Boolean) = commit(state.copy(settings = state.settings.copy(keepAwake = on)))

    fun changeRoom(next: Room) {
        if (next != Room.FOCUS && quiet) quiet = false
        room = next
    }

    fun setQuietView(on: Boolean) {
        quiet = on
        if (on) room = Room.FOCUS
    }

    fun openSource(number: Int) {
        changeRoom(Room.SOURCES)
        scrollTarget = "source-$number"
    }

    fun showParked() {
        changeRoom(Room.NOTEBOOK)
        scrollTarget = "parked"
    }

    fun showTip(next: Boolean = false) {
        tipIndex = when {
            tipIndex < 0 -> TIPS.indices.random()
            next -> (tipIndex + 1 + (0 until TIPS.size - 1).random()) % TIPS.size
            else -> tipIndex
        }
        tipOpen = true
    }
    var tipOpen by mutableStateOf(false)

    fun exportWeek() { platform?.share("tend-week-${localDate(weekStart())}.md", weeklyMarkdown(state), "text/markdown") }
    fun exportBackup() { platform?.share("tend-backup-${localDate()}.json", encodePretty(state), "application/json") }

    fun importBackup(contents: String) {
        try {
            var restored = restore(contents)
            if (restored.timer.status == Status.RUNNING) restored = pause(restored)
            restoreCandidate = restored
            settingsOpen = false
        } catch (error: TendException) {
            showToast(error.message ?: "This backup could not be opened.")
        }
    }

    fun confirmRestore() {
        val restored = restoreCandidate ?: return
        restoreCandidate = null
        commit(restored)
        showToast("Notebook restored.")
    }

    fun cancelRestore() { restoreCandidate = null }

    val todayMinutes: Long get() = state.sessions.filter { localDate(it.endedAt) == localDate(now) }.sumOf { it.durationMs }.let { Math.round(it.toDouble() / MINUTE) }
}

class Tip(val title: String, val body: String, val source: Int, val credit: String)

val TIPS = listOf(
    Tip("Keep one question in view.", "Make this interval small enough to finish with a clearer understanding. You can choose the next question afterward.", 1, "Adapted from Deep Work · Cal Newport"),
    Tip("Choose a stopping point.", "A useful note, one assumption understood, or a clearer question can be enough for this interval.", 1, "Our research prompt, inspired by Deep Work"),
    Tip("An interesting idea can wait.", "If you drift, make a short note and return to the task you chose. The note gives the idea somewhere to stay.", 4, "An adaptation of if–then planning · Gollwitzer & Sheeran"),
    Tip("Leave room for a break.", "Step away and notice what recovery you need. Short breaks may help with energy and fatigue; demanding work can need longer.", 5, "Paraphrased from the break research · Albulescu et al."),
    Tip("Give one result some room.", "Keep this week’s intended result concrete. Let fewer simultaneous commitments have more of your attention.", 2, "Adapted from Slow Productivity · Cal Newport"),
    Tip("Leave yourself a thread.", "Before you stop, write the next small action. You’ll have a place to begin when you return.", 3, "Our reflection prompt, inspired by the Pomodoro method")
)
