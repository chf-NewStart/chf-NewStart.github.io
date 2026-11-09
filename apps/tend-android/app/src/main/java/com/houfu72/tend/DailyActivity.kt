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
import com.houfu72.tend.core.Reasoning

/**
 * The shared warm-up, rest and reasoning pages, copied into the app's assets at build time.
 * Their rules and authored content share the web and iPhone implementation; the Android room stays native.
 * Only local bundled pages are allowed to navigate within this privileged web view.
 */
class DailyActivity : ComponentActivity() {
    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences(Daily.PREFS, MODE_PRIVATE) }
    private val reasoningPrefs by lazy { getSharedPreferences(Reasoning.PREFS, MODE_PRIVATE) }

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
            addJavascriptInterface(ReasoningBridge(), "TendAndroidReasoning")
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
        val page = if (intent.getBooleanExtra(EXTRA_REASONING, false)) "reasoning.html" else "daily.html"
        web.loadUrl("file://$ASSETS$page" + if (page == "daily.html" && intent.getBooleanExtra(EXTRA_REST, false)) "#rest" else "")
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

    /** Independent local predictions and notes; the page performs content validation before using them. */
    private inner class ReasoningBridge {
        @JavascriptInterface fun load(): String = reasoningPrefs.getString(Reasoning.KEY, null) ?: "null"
        @JavascriptInterface fun save(json: String): Boolean {
            if (json.toByteArray(Charsets.UTF_8).size > 4 * 1024 * 1024 || Reasoning.forBackup(json) == null) return false
            return reasoningPrefs.edit().putString(Reasoning.KEY, json).commit()
        }
        @JavascriptInterface fun close() = runOnUiThread { finish() }
    }

    companion object {
        const val EXTRA_REST = "rest"
        const val EXTRA_REASONING = "reasoning"
        private const val ASSETS = "/android_asset/daily/"
        private const val PAPER = 0xFF040706.toInt()
    }
}
