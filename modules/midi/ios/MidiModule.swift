import ExpoModulesCore
import Foundation
import QuartzCore

/// CoreMIDI's lifetime home: one dedicated thread with a live run loop.
///
/// Why a thread at all: client setup notifications are delivered on the run
/// loop that was current at `MIDIClientCreate`, so creating the client on
/// Expo's module queue means `onDevicesChanged` never fires and the endpoint
/// list stays frozen at launch time (hot-plugged devices invisible).
///
/// Why NOT main (where the client used to live): the first CoreMIDI call is a
/// synchronous XPC to MIDIServer, and when the server has to cold-start (after
/// a reboot, or whenever it exited since the last run) that call blocks for
/// ~600 ms. On main during boot it stalled the first Fabric mount for exactly
/// that long — the "slow cold launch / faster re-open" pattern.
private final class MidiThread: Thread {
  private let ready = DispatchSemaphore(value: 0)
  private var runLoop: CFRunLoop!

  override init() {
    super.init()
    name = "euxy.midi"
    qualityOfService = .userInitiated
    start()
    ready.wait()
  }

  override func main() {
    runLoop = CFRunLoopGetCurrent()
    // An idle source keeps the run loop alive between CoreMIDI callbacks.
    var ctx = CFRunLoopSourceContext()
    let keepAlive = CFRunLoopSourceCreate(nil, 0, &ctx)
    CFRunLoopAddSource(runLoop, keepAlive, .defaultMode)
    ready.signal()
    CFRunLoopRun()
  }

  func async(_ block: @escaping () -> Void) {
    CFRunLoopPerformBlock(runLoop, CFRunLoopMode.defaultMode.rawValue, block)
    CFRunLoopWakeUp(runLoop)
  }

  func sync<T>(_ block: @escaping () -> T) -> T {
    if Thread.current === self { return block() }
    let done = DispatchSemaphore(value: 0)
    var result: T!
    async {
      result = block()
      done.signal()
    }
    done.wait()
    return result
  }
}

public class MidiModule: Module {
  private lazy var midi = MidiManager()
  private lazy var thread = MidiThread()
  /// Written on the MIDI thread, read from the JS thread by the sync getters.
  private let stateLock = NSLock()
  private var isSetupStorage = false
  private var isSetup: Bool {
    get { stateLock.withLock { isSetupStorage } }
    set { stateLock.withLock { isSetupStorage = newValue } }
  }

  /// Runs on the MIDI thread. The first call pays the MIDIServer connection.
  private func setupIfNeeded() {
    guard !isSetup else { return }
    do {
      try midi.setup()
      isSetup = true
      midi.onMessage = { [weak self] bytes, ts in
        self?.sendEvent("onMidiMessage", ["bytes": bytes.map { Int($0) }, "timestamp": ts])
      }
      midi.onDevicesChanged = { [weak self] in
        self?.sendEvent("onDevicesChanged", [:])
      }
      // Lists handed out before this point were empty; have JS re-enumerate.
      sendEvent("onDevicesChanged", [:])
    } catch {
      print("euxy MIDI setup failed: \(error)")
    }
  }

  public func definition() -> ModuleDefinition {
    Name("Midi")
    Events("onMidiMessage", "onDevicesChanged")

    // Kick the (possibly slow) MIDIServer connection off early, off every thread
    // the UI needs. Nothing below may wait for it: a sync getter blocking the JS
    // thread on a cold MIDIServer held back React's first commit (and with it
    // the boot fade) by the whole client-creation time.
    OnStartObserving { self.thread.async { self.setupIfNeeded() } }
    OnDestroy { self.midi.disconnect() }

    // Sync by contract (screens enumerate during render); before setup they
    // report no devices and setup's onDevicesChanged triggers the re-read.
    Function("getOutputs") { () -> [[String: Any]] in
      guard self.isSetup else {
        self.thread.async { self.setupIfNeeded() }
        return []
      }
      return self.thread.sync { self.midi.outputs() }
    }
    Function("getInputs") { () -> [[String: Any]] in
      guard self.isSetup else {
        self.thread.async { self.setupIfNeeded() }
        return []
      }
      return self.thread.sync { self.midi.inputs() }
    }
    // Selection is ordered behind setup on the MIDI thread; the caller never waits.
    Function("selectOutput") { (id: String) in
      self.thread.async {
        self.setupIfNeeded()
        self.midi.selectOutput(id)
      }
    }
    Function("selectInput") { (id: String) in
      self.thread.async {
        self.setupIfNeeded()
        self.midi.selectInput(id)
      }
    }
    Function("send") { (bytes: [Int], delayMs: Double?) in
      self.midi.send(bytes.map { UInt8($0 & 0xFF) }, afterMs: delayMs ?? 0)
    }
    Function("getTimestamp") { () -> Double in
      CACurrentMediaTime() * 1000.0
    }
  }
}
