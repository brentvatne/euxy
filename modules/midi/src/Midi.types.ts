export type MidiNativeDevice = { id: string; name: string };

export type MidiModuleEvents = {
  onMidiMessage: (event: { bytes: number[]; timestamp: number }) => void;
  onDevicesChanged: () => void;
};
