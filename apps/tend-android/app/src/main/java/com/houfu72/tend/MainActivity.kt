package com.houfu72.tend

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.HapticFeedbackConstants
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.houfu72.tend.ui.TendRoom
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class MainActivity : ComponentActivity(), Platform {
    private lateinit var controller: TendController
    private lateinit var chime: Chime
    private val prefs by lazy { getSharedPreferences("tend", MODE_PRIVATE) }

    private val notificationRequest = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        prefs.edit().putBoolean("askedNotifications", true).apply()
        refreshNotifyStatus()
    }

    private val backupPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(::readBackup) }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        controller = (application as TendApplication).controller
        controller.platform = this
        chime = Chime(this)
        setContent { TendRoom(controller) }
        // The room keeps time against the clock, four times a second while it is on screen.
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (true) { controller.reconcile(); delay(250) }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        TendApplication.visible = true
        Reminders.clearNotice(this)
        refreshNotifyStatus()
        // Catch up before the first frame, so a return never shows the time Tend had when it went away.
        controller.reconcile()
    }

    override fun onStop() {
        TendApplication.visible = false
        super.onStop()
    }

    override fun onDestroy() {
        if (controller.platform === this) controller.platform = null
        chime.release()
        super.onDestroy()
    }

    private fun refreshNotifyStatus() {
        val enabled = NotificationManagerCompat.from(this).areNotificationsEnabled()
        controller.notifyStatus = when {
            Build.VERSION.SDK_INT < 33 -> if (enabled) NotifyStatus.AUTHORIZED else NotifyStatus.DENIED
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED ->
                if (enabled) NotifyStatus.AUTHORIZED else NotifyStatus.DENIED
            prefs.getBoolean("askedNotifications", false) -> NotifyStatus.DENIED
            else -> NotifyStatus.NOT_DETERMINED
        }
    }

    override fun chime() = chime.play()

    override fun feedback() {
        window.decorView.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.LONG_PRESS)
    }

    override fun askNotifications() {
        if (Build.VERSION.SDK_INT >= 33) notificationRequest.launch(Manifest.permission.POST_NOTIFICATIONS) else openNotificationSettings()
    }

    override fun openNotificationSettings() {
        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        try { startActivity(intent) } catch (_: ActivityNotFoundException) {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
        }
    }

    override fun share(filename: String, contents: String, mime: String) {
        try {
            val dir = File(cacheDir, "exports").apply { mkdirs() }
            val file = File(dir, filename).apply { writeText(contents) }
            val uri = FileProvider.getUriForFile(this, "$packageName.exports", file)
            val send = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri).putExtra(Intent.EXTRA_SUBJECT, filename)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            send.clipData = ClipData.newRawUri(filename, uri)
            startActivity(Intent.createChooser(send, null))
        } catch (_: Exception) {
            controller.showToast("The export could not be prepared. Your notebook is still here.")
        }
    }

    override fun pickBackup() = backupPicker.launch(arrayOf("application/json", "text/*", "application/octet-stream"))

    private fun readBackup(uri: Uri) {
        lifecycleScope.launch {
            val text = withContext(Dispatchers.IO) {
                runCatching {
                    contentResolver.openInputStream(uri)?.use { stream ->
                        val bytes = stream.readNBytesCompat(20 * 1024 * 1024 + 1)
                        if (bytes.size > 20 * 1024 * 1024) null else String(bytes, Charsets.UTF_8)
                    }
                }.getOrNull()
            }
            if (text == null) controller.showToast("This backup could not be opened.") else controller.importBackup(text)
        }
    }

    override fun openUrl(url: String) {
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: ActivityNotFoundException) {
            controller.showToast("No browser is available to open this link.")
        }
    }
}

private fun java.io.InputStream.readNBytesCompat(limit: Int): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(64 * 1024)
    while (out.size() < limit) {
        val read = read(buffer, 0, minOf(buffer.size, limit - out.size()))
        if (read < 0) break
        out.write(buffer, 0, read)
    }
    return out.toByteArray()
}
