package dev.brent.euxy.midi

import android.content.Context
import android.content.pm.PackageManager
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiInputPort
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * android.media.midi counterpart of the CoreMIDI `MidiManager` on iOS.
 *
 * Naming follows the app's point of view, like the iOS module: an "output" is
 * somewhere we send to (a device's *input* port in Android terms) and an
 * "input" is something we receive from (a device's *output* port). Port ids are
 * `"<deviceId>:<portNumber>"`.
 */
class MidiManagerBridge(private val context: Context) {
  var onMessage: ((ByteArray, Double) -> Unit)? = null
  var onDevicesChanged: (() -> Unit)? = null

  private val handler = Handler(Looper.getMainLooper())
  private val manager: MidiManager? =
    if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_MIDI)) {
      context.getSystemService(Context.MIDI_SERVICE) as? MidiManager
    } else {
      null
    }

  private val openDevices = HashMap<Int, MidiDevice>()
  private var sendPort: MidiInputPort? = null
  private var receivePort: MidiOutputPort? = null
  private var selectedOutput: String? = null
  private var selectedInput: String? = null

  private val receiver = object : MidiReceiver() {
    override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
      val ts = if (timestamp == 0L) System.nanoTime() else timestamp
      onMessage?.invoke(msg.copyOfRange(offset, offset + count), ts / 1_000_000.0)
    }
  }

  private val deviceCallback = object : MidiManager.DeviceCallback() {
    override fun onDeviceAdded(device: MidiDeviceInfo) {
      onDevicesChanged?.invoke()
    }

    override fun onDeviceRemoved(device: MidiDeviceInfo) {
      openDevices.remove(device.id)?.let { closeQuietly(it) }
      if (selectedOutput?.startsWith("${device.id}:") == true) {
        sendPort = null
        selectedOutput = null
      }
      if (selectedInput?.startsWith("${device.id}:") == true) {
        receivePort = null
        selectedInput = null
      }
      onDevicesChanged?.invoke()
    }
  }

  fun setup() {
    @Suppress("DEPRECATION")
    manager?.registerDeviceCallback(deviceCallback, handler)
  }

  fun disconnect() {
    manager?.unregisterDeviceCallback(deviceCallback)
    receivePort?.let { closeQuietly(it) }
    sendPort?.let { closeQuietly(it) }
    receivePort = null
    sendPort = null
    openDevices.values.forEach { closeQuietly(it) }
    openDevices.clear()
    selectedOutput = null
    selectedInput = null
  }

  fun outputs(): List<Map<String, Any>> = ports(MidiDeviceInfo.PortInfo.TYPE_INPUT)

  fun inputs(): List<Map<String, Any>> = ports(MidiDeviceInfo.PortInfo.TYPE_OUTPUT)

  fun selectOutput(id: String) {
    sendPort?.let { closeQuietly(it) }
    sendPort = null
    selectedOutput = id.ifEmpty { null } ?: return
    withDevice(id) { device, port ->
      // A later selection may have won while the device was opening.
      if (selectedOutput != id) return@withDevice
      sendPort = device.openInputPort(port)
      if (sendPort == null) Log.w(TAG, "could not open input port $id")
    }
  }

  fun selectInput(id: String) {
    receivePort?.let { closeQuietly(it) }
    receivePort = null
    selectedInput = id.ifEmpty { null } ?: return
    withDevice(id) { device, port ->
      if (selectedInput != id) return@withDevice
      receivePort = device.openOutputPort(port)?.also { it.connect(receiver) }
      if (receivePort == null) Log.w(TAG, "could not open output port $id")
    }
  }

  /** Send raw bytes, optionally scheduled `afterMs` into the future on the device's own clock. */
  fun send(bytes: ByteArray, afterMs: Double) {
    val port = sendPort ?: return
    val timestamp = if (afterMs > 0) System.nanoTime() + (afterMs * 1_000_000.0).toLong() else 0L
    try {
      port.send(bytes, 0, bytes.size, timestamp)
    } catch (e: java.io.IOException) {
      Log.w(TAG, "send failed", e)
    }
  }

  private fun ports(type: Int): List<Map<String, Any>> {
    val mgr = manager ?: return emptyList()
    @Suppress("DEPRECATION")
    return mgr.devices.flatMap { info ->
      val ports = info.ports.filter { it.type == type }
      ports.map { port ->
        mapOf("id" to "${info.id}:${port.portNumber}", "name" to portName(info, port, ports.size > 1))
      }
    }
  }

  private fun portName(info: MidiDeviceInfo, port: MidiDeviceInfo.PortInfo, disambiguate: Boolean): String {
    val props = info.properties
    val device = props.getString(MidiDeviceInfo.PROPERTY_NAME)?.takeIf { it.isNotBlank() }
      ?: props.getString(MidiDeviceInfo.PROPERTY_PRODUCT)?.takeIf { it.isNotBlank() }
      ?: "MIDI device ${info.id}"
    if (!disambiguate) return device
    val portLabel = port.name?.takeIf { it.isNotBlank() } ?: "Port ${port.portNumber + 1}"
    return "$device · $portLabel"
  }

  private fun withDevice(id: String, body: (MidiDevice, Int) -> Unit) {
    val mgr = manager ?: return
    val (deviceId, port) = parseId(id) ?: return
    openDevices[deviceId]?.let {
      body(it, port)
      return
    }
    @Suppress("DEPRECATION")
    val info = mgr.devices.firstOrNull { it.id == deviceId } ?: return
    mgr.openDevice(info, { device ->
      if (device == null) {
        Log.w(TAG, "could not open MIDI device $deviceId")
        return@openDevice
      }
      openDevices[deviceId] = device
      body(device, port)
    }, handler)
  }

  private fun parseId(id: String): Pair<Int, Int>? {
    val parts = id.split(':')
    if (parts.size != 2) return null
    val device = parts[0].toIntOrNull() ?: return null
    val port = parts[1].toIntOrNull() ?: return null
    return device to port
  }

  private fun closeQuietly(c: java.io.Closeable) {
    try {
      c.close()
    } catch (_: java.io.IOException) {
    }
  }

  private companion object {
    const val TAG = "euxy-midi"
  }
}
