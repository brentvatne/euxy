import ExpoModulesCore
import QuartzCore

public class MidiModule: Module {
  private lazy var midi = MidiManager()
  private var isSetup = false

  private func ensureSetup() {
    guard !isSetup else { return }
    // CoreMIDI clients must be created on a thread with a live run loop.
    // Module functions run on Expo's module queue — creating the client there
    // means MIDI setup notifications are never delivered, so onDevicesChanged
    // never fires AND the process's endpoint list stays frozen at whatever was
    // connected at creation time (hot-plugged devices are invisible until the
    // app relaunches). Hop to main for the client's lifetime home.
    let work = {
      do {
        try self.midi.setup()
        self.isSetup = true
        self.midi.onMessage = { [weak self] bytes, ts in
          self?.sendEvent("onMidiMessage", ["bytes": bytes.map { Int($0) }, "timestamp": ts])
        }
        self.midi.onDevicesChanged = { [weak self] in
          self?.sendEvent("onDevicesChanged", [:])
        }
      } catch {
        print("euxy MIDI setup failed: \(error)")
      }
    }
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.sync(execute: work)
    }
  }

  public func definition() -> ModuleDefinition {
    Name("Midi")
    Events("onMidiMessage", "onDevicesChanged")

    OnStartObserving { self.ensureSetup() }
    OnDestroy { self.midi.disconnect() }

    Function("getOutputs") { () -> [[String: Any]] in
      self.ensureSetup()
      return self.midi.outputs()
    }
    Function("getInputs") { () -> [[String: Any]] in
      self.ensureSetup()
      return self.midi.inputs()
    }
    Function("selectOutput") { (id: String) in
      self.ensureSetup()
      self.midi.selectOutput(id)
    }
    Function("selectInput") { (id: String) in
      self.ensureSetup()
      self.midi.selectInput(id)
    }
    Function("send") { (bytes: [Int], delayMs: Double?) in
      self.midi.send(bytes.map { UInt8($0 & 0xFF) }, afterMs: delayMs ?? 0)
    }
    Function("getTimestamp") { () -> Double in
      CACurrentMediaTime() * 1000.0
    }
  }
}
