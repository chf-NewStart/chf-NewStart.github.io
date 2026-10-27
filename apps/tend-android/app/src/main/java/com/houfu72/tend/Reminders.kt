package com.houfu72.tend

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.houfu72.tend.core.Phase
import com.houfu72.tend.core.Status
import com.houfu72.tend.core.TendState

/** The end-of-session reminder, as on iOS: one alarm at the deadline, a notice without task or note text. */
object Reminders {
    private const val CHANNEL_CHIME = "session-end"
    private const val CHANNEL_QUIET = "session-end-quiet"
    private const val NOTICE_ID = 1
    private var scheduled: String? = null

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        val chime = NotificationChannel(CHANNEL_CHIME, context.getString(R.string.channel_chime), NotificationManager.IMPORTANCE_HIGH).apply {
            description = context.getString(R.string.channel_description)
            setSound(Uri.parse("android.resource://${context.packageName}/${R.raw.chime}"),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        }
        val quiet = NotificationChannel(CHANNEL_QUIET, context.getString(R.string.channel_quiet), NotificationManager.IMPORTANCE_HIGH).apply {
            description = context.getString(R.string.channel_description)
            setSound(null, null)
        }
        manager.createNotificationChannels(listOf(chime, quiet))
    }

    private fun alarmIntent(context: Context, isBreak: Boolean = false, sound: Boolean = true, isQuick: Boolean = false) = PendingIntent.getBroadcast(
        context, 0,
        Intent(context, ReminderReceiver::class.java).setAction(ACTION_END).putExtra("break", isBreak).putExtra("sound", sound).putExtra("quick", isQuick),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    /** Sets, moves or clears the alarm to match the timer. Cheap to call after every change. */
    fun sync(context: Context, state: TendState) {
        val alarms = context.getSystemService(AlarmManager::class.java)
        val timer = state.timer
        val endAt = timer.endAt
        if (timer.status != Status.RUNNING || endAt == null || endAt <= System.currentTimeMillis()) {
            // "" means cleared in this process; null means unknown (a fresh process may inherit an old alarm).
            if (scheduled != "") alarms.cancel(alarmIntent(context))
            scheduled = ""
            return
        }
        val isBreak = timer.phase == Phase.BREAK
        val isQuick = timer.phase == Phase.QUICK
        val signature = "$endAt-${timer.phase.json}-${state.settings.sound}"
        if (signature == scheduled) return
        val intent = alarmIntent(context, isBreak, state.settings.sound, isQuick)
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, intent)
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endAt, intent)
        }
        scheduled = signature
    }

    fun post(context: Context, isBreak: Boolean, sound: Boolean, isQuick: Boolean = false) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notice = NotificationCompat.Builder(context, if (sound) CHANNEL_CHIME else CHANNEL_QUIET)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFFF5A43.toInt())
            // Task and note text are intentionally left out of lock-screen reminders.
            .setContentTitle(if (isBreak) "A little room to begin again" else if (isQuick) "Time’s up" else "A moment to gather")
            .setContentText(if (isBreak) "Your break has finished. Return when you’re ready." else if (isQuick) "Your quick timer has finished. Nice work." else "Your focus interval has finished. Leave yourself a thread for next time.")
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try { NotificationManagerCompat.from(context).notify(NOTICE_ID, notice) } catch (_: SecurityException) { /* Permission withdrawn. */ }
    }

    fun clearNotice(context: Context) = NotificationManagerCompat.from(context).cancel(NOTICE_ID)

    const val ACTION_END = "com.houfu72.tend.SESSION_END"
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Reminders.ACTION_END -> if (!TendApplication.visible) {
                Reminders.post(context, intent.getBooleanExtra("break", false), intent.getBooleanExtra("sound", true), intent.getBooleanExtra("quick", false))
            }
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED ->
                NotebookStore(context).readQuietly()?.let { Reminders.sync(context, it) }
        }
    }
}
