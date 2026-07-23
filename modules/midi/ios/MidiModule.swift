import ExpoModulesCore
import QuartzCore

public class MidiModule: Module {
  private lazy var midi = MidiManager()
  private var isSetup = false

  private func ensureSetup() {
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
    } catch {
      print("euxy MIDI setup failed: \(error)")
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
    Function("send") { (bytes: [Int]) in
      self.midi.send(bytes.map { UInt8($0 & 0xFF) })
    }
    Function("getTimestamp") { () -> Double in
      CACurrentMediaTime() * 1000.0
    }
  }
}
