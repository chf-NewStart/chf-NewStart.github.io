# Tend uses no reflection-based serialization: the notebook is read and written as JsonElement trees.

# The warm-up page calls DailyActivity's bridge by name (window.TendAndroidDaily.load/save/close/buzz).
-keepclassmembers class com.houfu72.tend.DailyActivity$Bridge { @android.webkit.JavascriptInterface <methods>; }
