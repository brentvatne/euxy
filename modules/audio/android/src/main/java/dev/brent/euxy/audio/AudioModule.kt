package dev.brent.euxy.audio

import android.media.AudioAttributes
import android.media.SoundPool
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Built-in drum sounds, Android side. SoundPool has no scheduled start, so a
 * delayed hit is posted on a dedicated handler thread for `delayMs` — the
 * same contract as Midi.send(bytes, delayMs), with timer accuracy instead of
 * CoreMIDI's sample accuracy (good enough to monitor a pattern on a phone).
 */
class AudioModule : Module() {
  private val pool: SoundPool by lazy {
    SoundPool.Builder()
      .setMaxStreams(24)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build(),
      )
      .build()
      .also { p ->
        // One listener for every load: SoundPool keeps only the last one set,
        // so per-call listeners would drop the earlier loads of a 24-file kit.
        p.setOnLoadCompleteListener { _, soundId, status ->
          val pending = synchronized(loads) { loads.remove(soundId) } ?: return@setOnLoadCompleteListener
          if (status == 0) {
            synchronized(sounds) { sounds[pending.first] = soundId }
            pending.second.resolve(null)
          } else {
            pending.second.reject("ERR_AUDIO_LOAD", "SoundPool status $status for ${pending.first}", null)
          }
        }
      }
  }
  private val thread by lazy { HandlerThread("euxy.audio", android.os.Process.THREAD_PRIORITY_URGENT_AUDIO).also { it.start() } }
  private val handler by lazy { Handler(thread.looper) }
  private val sounds = HashMap<String, Int>()
  private val loads = HashMap<Int, Pair<String, Promise>>()
  private val streams = ArrayDeque<Int>()
  @Volatile private var active = false

  override fun definition() = ModuleDefinition {
    Name("Sampler")

    OnDestroy {
      handler.removeCallbacksAndMessages(null)
      pool.release()
      thread.quitSafely()
    }

    AsyncFunction("load") { id: String, uri: String, promise: Promise ->
      val soundId = startLoad(uri)
      if (soundId == 0) {
        promise.reject("ERR_AUDIO_LOAD", "Could not load $uri", null)
        return@AsyncFunction
      }
      synchronized(loads) { loads[soundId] = Pair(id, promise) }
    }
    Function("unloadAll") {
      synchronized(sounds) {
        sounds.values.forEach { pool.unload(it) }
        sounds.clear()
      }
    }
    Function("setActive") { on: Boolean ->
      active = on
      if (!on) stopAll()
    }
    Function("stopAll") { stopAll() }
    Function("trigger") { id: String, gain: Double, delayMs: Double? ->
      if (!active) return@Function
      val soundId = synchronized(sounds) { sounds[id] } ?: return@Function
      val g = gain.coerceIn(0.0, 1.0).toFloat()
      val play = Runnable {
        if (!active) return@Runnable
        val stream = pool.play(soundId, g, g, 1, 0, 1f)
        if (stream != 0) synchronized(streams) {
          streams.addLast(stream)
          while (streams.size > 24) streams.removeFirst()
        }
      }
      val delay = delayMs ?: 0.0
      if (delay > 0) handler.postDelayed(play, delay.toLong()) else handler.post(play)
    }
  }

  /**
   * expo-asset hands over one of three forms: a cache file
   * (`file:///data/.../ExponentAsset-<hash>.wav`, dev client and updates), or for
   * assets embedded in a release build either `file:///android_asset/<name>` or
   * `file:///android_res/raw/<name>`, which only AssetManager / the res table resolve.
   */
  private fun startLoad(uri: String): Int {
    val context = appContext.reactContext ?: return 0
    val path = Uri.parse(uri).path ?: return 0
    Regex("^/android_asset/(.+)$").find(path)?.let { m ->
      return try {
        context.assets.openFd(m.groupValues[1]).use { pool.load(it, 1) }
      } catch (e: java.io.IOException) {
        0
      }
    }
    Regex("^/android_res/raw/([^/]+?)(\\.[A-Za-z0-9]+)?$").find(path)?.let { m ->
      val resId = context.resources.getIdentifier(m.groupValues[1], "raw", context.packageName)
      return if (resId == 0) 0 else pool.load(context, resId, 1)
    }
    return if (File(path).exists()) pool.load(path, 1) else 0
  }

  private fun stopAll() {
    handler.removeCallbacksAndMessages(null)
    synchronized(streams) {
      streams.forEach { pool.stop(it) }
      streams.clear()
    }
  }
}
