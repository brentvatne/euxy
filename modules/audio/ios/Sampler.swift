import AVFoundation

/// One-shot drum sampler on AVAudioEngine.
///
/// Why not expo-audio: its players wrap AVPlayer, which cannot start a sound at
/// a given host time and plays one voice per instance. The engine stamps every
/// note ~100 ms ahead in `mach_absolute_time` for CoreMIDI (MidiManager), so the
/// sampler takes the very same delay and schedules the buffer at that host time:
/// built-in sound lands where the MIDI note would have.
///
/// Voices: a fixed pool of player nodes used round-robin, every hit on the next
/// node, so overlapping hits (a hat under a crash tail) never cut each other.
/// All kit files are decoded to one float format at load time, so one node
/// format serves every buffer.
final class Sampler {
  private let engine = AVAudioEngine()
  private var nodes: [AVAudioPlayerNode] = []
  private var next = 0
  private var buffers: [String: AVAudioPCMBuffer] = [:]
  private var format: AVAudioFormat?
  private var active = false
  private var lastStartAttempt: TimeInterval = 0
  private let lock = NSLock()
  private var observers: [NSObjectProtocol] = []

  private static let voices = 24

  init() {
    for _ in 0..<Sampler.voices {
      let n = AVAudioPlayerNode()
      engine.attach(n)
      nodes.append(n)
    }
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { [weak self] _ in
      self?.restartIfActive()
    })
    observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] note in
      guard let self, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
      self.restartIfActive()
    })
  }

  deinit { observers.forEach(NotificationCenter.default.removeObserver) }

  // MARK: loading

  /// Decode `url` into memory under `id`; replaces an earlier buffer with that id.
  func load(id: String, url: URL) throws {
    let file = try AVAudioFile(forReading: url)
    guard let fmt = format ?? AVAudioFormat(standardFormatWithSampleRate: file.processingFormat.sampleRate, channels: 1) else {
      throw SamplerError.format
    }
    let buffer: AVAudioPCMBuffer
    if file.processingFormat == fmt {
      guard let b = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(file.length)) else { throw SamplerError.format }
      try file.read(into: b)
      buffer = b
    } else {
      buffer = try Sampler.convert(file, to: fmt)
    }
    lock.lock()
    if format == nil {
      format = fmt
      for n in nodes { engine.connect(n, to: engine.mainMixerNode, format: fmt) }
    }
    buffers[id] = buffer
    lock.unlock()
  }

  func unloadAll() {
    lock.lock(); buffers.removeAll(); lock.unlock()
  }

  // MARK: transport

  /// Bring the audio session + engine up. Idempotent; called when built-in
  /// sound turns on and again from `trigger` after an interruption.
  func start() throws {
    lock.lock(); active = true; lock.unlock()
    let session = AVAudioSession.sharedInstance()
    // Playback: the user opted in, so the silent switch does not mute it;
    // mixWithOthers so a metronome or reference track elsewhere keeps going.
    try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
    try session.setPreferredIOBufferDuration(0.005)
    try session.setActive(true)
    guard format != nil else { return } // nothing loaded yet; engine starts on first load+trigger
    if !engine.isRunning {
      engine.prepare()
      try engine.start()
    }
    for n in nodes where !n.isPlaying { n.play() }
  }

  /// Silence and release the session so other apps' audio ducking/mixing
  /// returns to normal. Buffers stay loaded.
  func stop() {
    lock.lock(); active = false; lock.unlock()
    for n in nodes { n.stop() }
    engine.stop()
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
  }

  /// Cut every sounding voice (panic / transport stop).
  func stopAll() {
    for n in nodes where n.isPlaying {
      n.stop()
      if engine.isRunning { n.play() }
    }
  }

  // MARK: playback

  /// Play `id` at `gain` (0…1), `delayMs` after now (0 = immediately).
  func trigger(id: String, gain: Float, delayMs: Double) {
    lock.lock()
    let buffer = buffers[id]
    let isActive = active
    lock.unlock()
    guard isActive, let buffer else { return }
    if !engine.isRunning {
      // No output route (e.g. a simulator without an audio device): retry at
      // most once a second instead of re-activating the session on every note.
      let t = Date().timeIntervalSinceReferenceDate
      guard t - lastStartAttempt > 1 else { return }
      lastStartAttempt = t
      try? start()
    }
    guard engine.isRunning else { return }

    let node = nodes[next]
    next = (next + 1) % nodes.count
    node.volume = max(0, min(1, gain))
    var when: AVAudioTime? = nil
    if delayMs > 0 {
      var info = mach_timebase_info()
      mach_timebase_info(&info)
      let ticks = UInt64(delayMs * 1_000_000.0 * Double(info.denom) / Double(info.numer))
      when = AVAudioTime(hostTime: mach_absolute_time() + ticks)
    }
    if !node.isPlaying { node.play() }
    node.scheduleBuffer(buffer, at: when, options: [.interrupts], completionHandler: nil)
  }

  // MARK: helpers

  private func restartIfActive() {
    lock.lock(); let a = active; lock.unlock()
    guard a else { return }
    for n in nodes { n.stop() }
    try? start()
  }

  private static func convert(_ file: AVAudioFile, to fmt: AVAudioFormat) throws -> AVAudioPCMBuffer {
    guard let src = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else {
      throw SamplerError.format
    }
    try file.read(into: src)
    let ratio = fmt.sampleRate / file.processingFormat.sampleRate
    let capacity = AVAudioFrameCount(Double(file.length) * ratio) + 64
    guard let converter = AVAudioConverter(from: file.processingFormat, to: fmt),
          let dst = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: capacity) else { throw SamplerError.format }
    var consumed = false
    var error: NSError?
    converter.convert(to: dst, error: &error) { _, status in
      if consumed { status.pointee = .endOfStream; return nil }
      consumed = true
      status.pointee = .haveData
      return src
    }
    if let error { throw error }
    return dst
  }
}

enum SamplerError: Error {
  case format
}
