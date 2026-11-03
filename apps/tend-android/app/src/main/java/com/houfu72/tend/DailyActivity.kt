package com.houfu72.tend

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.HapticFeedbackConstants
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.houfu72.tend.core.Daily

/**
 * The warm-up and rest page: focus/daily.html, copied into the app's assets at build time (app/build.gradle.kts).
 * Its nine short tasks run from one shared page on the web, the iPhone and here, so their rules can't drift apart;
 * the rest of Tend for Android stays native. Only that bundled page is ever loaded, so only it sees the bridge.
 */
class DailyActivity : ComponentActivity() {
    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences(Daily.PREFS, MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        val frame = FrameLayout(this).apply { setBackgroundColor(PAPER) }
        web = WebView(this).apply {
            setBackgroundColor(PAPER)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            addJavascriptInterface(Bridge(), "TendAndroidDaily")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url
                    if (url.scheme == "file" && url.path.orEmpty().startsWith(ASSETS)) return false
                    if (url.scheme == "https") runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                    return true
                }
            }
        }
        frame.addView(web, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        // Edge to edge: the page sits inside the system bars and above the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(frame) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(frame)
        web.loadUrl("file://${ASSETS}daily.html" + if (intent.getBooleanExtra(EXTRA_REST, false)) "#rest" else "")
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /** window.TendAndroidDaily in the page: daily.js keeps its JSON here, and closes or buzzes through it. */
    private inner class Bridge {
        @JavascriptInterface fun load(): String = prefs.getString(Daily.KEY, null) ?: "null"
        @JavascriptInterface fun save(json: String) { if (json.length <= 1_000_000) prefs.edit().putString(Daily.KEY, json).apply() }
        @JavascriptInterface fun close() = runOnUiThread { finish() }
        @JavascriptInterface fun buzz() = runOnUiThread {
            web.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.LONG_PRESS)
        }
    }

    companion object {
        const val EXTRA_REST = "rest"
        private const val ASSETS = "/android_asset/daily/"
        private const val PAPER = 0xFF040706.toInt()
    }
}
