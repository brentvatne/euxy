import CoreMIDI
import Foundation
import QuartzCore // CACurrentMediaTime

/// Minimal CoreMIDI wrapper: enumerate endpoints, connect one source (input)
/// and one destination (output), send raw MIDI bytes, and forward received raw
/// bytes. All MIDI message construction/parsing lives in JS (parse.ts) — this
/// layer stays deliberately dumb.
final class MidiManager {
  private var client: MIDIClientRef = 0
  private var inputPort: MIDIPortRef = 0
  private var outputPort: MIDIPortRef = 0
  private var connectedSource: MIDIEndpointRef = 0
  private var connectedDestination: MIDIEndpointRef = 0

  /// (bytes, timestampMs) on a CoreMIDI callback thread — the module hops to main.
  var onMessage: (([UInt8], Double) -> Void)?
  var onDevicesChanged: (() -> Void)?

  func setup() throws {
    var status = MIDIClientCreateWithBlock("euxy" as CFString, &client) { [weak self] notification in
      switch notification.pointee.messageID {
      case .msgSetupChanged, .msgObjectAdded, .msgObjectRemoved:
        self?.onDevicesChanged?()
      default:
        break
      }
    }
    guard status == noErr else { throw NSError(domain: "euxy.midi", code: Int(status)) }

    // Legacy block input port delivers MIDI 1.0 packet lists (raw bytes).
    status = MIDIInputPortCreateWithBlock(client, "Input" as CFString, &inputPort) { [weak self] pktList, _ in
      self?.read(pktList)
    }
    guard status == noErr else { throw NSError(domain: "euxy.midi", code: Int(status)) }

    status = MIDIOutputPortCreate(client, "Output" as CFString, &outputPort)
    guard status == noErr else { throw NSError(domain: "euxy.midi", code: Int(status)) }
  }

  private func name(of endpoint: MIDIEndpointRef) -> String {
    var cf: Unmanaged<CFString>?
    MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &cf)
    return (cf?.takeUnretainedValue() as String?) ?? "Unknown"
  }

  func outputs() -> [[String: Any]] {
    (0..<MIDIGetNumberOfDestinations()).map { i in
      let ep = MIDIGetDestination(i)
      return ["id": String(ep), "name": name(of: ep)]
    }
  }

  func inputs() -> [[String: Any]] {
    (0..<MIDIGetNumberOfSources()).map { i in
      let ep = MIDIGetSource(i)
      return ["id": String(ep), "name": name(of: ep)]
    }
  }

  func selectOutput(_ id: String) {
    connectedDestination = MIDIEndpointRef(UInt32(id) ?? 0)
  }

  func selectInput(_ id: String) {
    if connectedSource != 0 { MIDIPortDisconnectSource(inputPort, connectedSource) }
    let ep = MIDIEndpointRef(UInt32(id) ?? 0)
    if ep != 0, MIDIPortConnectSource(inputPort, ep, nil) == noErr {
      connectedSource = ep
    } else {
      connectedSource = 0
    }
  }

  func send(_ bytes: [UInt8]) {
    guard connectedDestination != 0, !bytes.isEmpty else { return }
    var packetList = MIDIPacketList()
    let packet = MIDIPacketListInit(&packetList)
    _ = MIDIPacketListAdd(&packetList, 1024, packet, 0, bytes.count, bytes)
    MIDISend(outputPort, connectedDestination, &packetList)
  }

  private func read(_ pktList: UnsafePointer<MIDIPacketList>) {
    let ts = CACurrentMediaTime() * 1000.0
    var packet = pktList.pointee.packet
    for _ in 0..<pktList.pointee.numPackets {
      let length = Int(packet.length)
      if length > 0 {
        let bytes = withUnsafeBytes(of: packet.data) { Array($0.prefix(length)) }
        onMessage?(bytes, ts)
      }
      packet = MIDIPacketNext(&packet).pointee
    }
  }

  func disconnect() {
    if connectedSource != 0 { MIDIPortDisconnectSource(inputPort, connectedSource) }
    connectedSource = 0
    connectedDestination = 0
  }

  deinit {
    disconnect()
    if inputPort != 0 { MIDIPortDispose(inputPort) }
    if outputPort != 0 { MIDIPortDispose(outputPort) }
    if client != 0 { MIDIClientDispose(client) }
  }
}
