import ExpoModulesCore

/// Built-in drum sounds for the sequencer. Thin bridge over `Sampler`; see
/// src/audio/ for the JS side (kit loading, the MIDI-connected gate).
public class AudioModule: Module {
  private let sampler = Sampler()
  private let io = DispatchQueue(label: "euxy.audio.load", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("Sampler")

    OnDestroy { self.sampler.stop() }

    // Decoding a kit is file IO; keep it off the JS thread.
    AsyncFunction("load") { (id: String, uri: String, promise: Promise) in
      self.io.async {
        guard let url = URL(string: uri), url.isFileURL else {
          promise.reject("ERR_AUDIO_URI", "Not a file URL: \(uri)")
          return
        }
        do {
          try self.sampler.load(id: id, url: url)
          promise.resolve(nil)
        } catch {
          promise.reject("ERR_AUDIO_LOAD", "\(error)")
        }
      }
    }
    Function("unloadAll") { self.sampler.unloadAll() }

    Function("setActive") { (on: Bool) in
      if on { self.sampler.activate() } else { self.sampler.stop() }
    }
    Function("stopAll") { self.sampler.stopAll() }

    // Same delay contract as Midi.send(bytes, delayMs): ms from now, host clock.
    Function("trigger") { (id: String, gain: Double, delayMs: Double?) in
      self.sampler.trigger(id: id, gain: Float(gain), delayMs: delayMs ?? 0)
    }
  }
}
