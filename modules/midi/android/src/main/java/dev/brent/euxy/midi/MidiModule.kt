package dev.brent.euxy.midi

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MidiModule : Module() {
  private val midi by lazy { MidiManagerBridge(appContext.reactContext!!.applicationContext) }
  private var isSetup = false

  private fun ensureSetup() {
    if (isSetup) return
    isSetup = true
    midi.onMessage = { bytes, timestampMs ->
      sendEvent("onMidiMessage", mapOf("bytes" to bytes.map { it.toInt() and 0xff }, "timestamp" to timestampMs))
    }
    midi.onDevicesChanged = { sendEvent("onDevicesChanged", emptyMap<String, Any?>()) }
    midi.setup()
  }

  override fun definition() = ModuleDefinition {
    Name("Midi")
    Events("onMidiMessage", "onDevicesChanged")

    OnStartObserving { ensureSetup() }
    OnDestroy { midi.disconnect() }

    Function("getOutputs") {
      ensureSetup()
      midi.outputs()
    }
    Function("getInputs") {
      ensureSetup()
      midi.inputs()
    }
    Function("selectOutput") { id: String ->
      ensureSetup()
      midi.selectOutput(id)
    }
    Function("selectInput") { id: String ->
      ensureSetup()
      midi.selectInput(id)
    }
    Function("send") { bytes: List<Int>, delayMs: Double? ->
      midi.send(ByteArray(bytes.size) { (bytes[it] and 0xff).toByte() }, delayMs ?: 0.0)
    }
    // Same clock as MidiReceiver timestamps (System.nanoTime), in milliseconds,
    // mirroring CACurrentMediaTime on iOS.
    Function("getTimestamp") { System.nanoTime() / 1_000_000.0 }
  }
}
