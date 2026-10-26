package com.houfu72.tend

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool

/** The room's soft 8-bit chime (res/raw/chime.wav, rendered from the web room's arpeggio). */
class Chime(context: Context) {
    private val pool = SoundPool.Builder().setMaxStreams(1).setAudioAttributes(
        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    ).build()
    private val sound = pool.load(context, R.raw.chime, 1)

    fun play() { pool.play(sound, 0.6f, 0.6f, 1, 0, 1f) }
    fun release() = pool.release()
}
