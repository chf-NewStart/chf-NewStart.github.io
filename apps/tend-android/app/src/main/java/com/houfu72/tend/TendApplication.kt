package com.houfu72.tend

import android.app.Application

class TendApplication : Application() {
    /** One controller for the process, so a rotation or a new window keeps the room exactly as it was. */
    val controller by lazy { TendController(this) }

    override fun onCreate() {
        super.onCreate()
        Reminders.createChannels(this)
    }

    companion object {
        /** True while the room is on screen: it chimes and opens the reflection itself, so no notification is posted. */
        @Volatile var visible = false
    }
}
