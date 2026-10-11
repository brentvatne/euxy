# Built-in sound kits

Every file under `assets/audio/` is in the public domain (CC0 1.0). They were
trimmed, mono-summed, resampled to 44.1 kHz / 16-bit and peak-normalised to
-1 dBFS by `scripts/build-sound-kits.py`; `sources.json` names the source file
behind every slot.

| Kit | Source | License |
| --- | --- | --- |
| `808` | Roland TR-808 sampled by Michael Fischer (Technopolis, 1994), via [tidalcycles/sounds-tr808-fischer](https://github.com/tidalcycles/sounds-tr808-fischer) | CC0 1.0 (repository); the 1994 release says the set is "ABSOLUTELY FREE!" |
| `909` | The TR-909 kit of a Roland TR-8 (Roland's own ACB model of the 909), recorded by MckAudio: [MckAudio/MckSamplePacks](https://github.com/MckAudio/MckSamplePacks) `TR8/` | CC0 1.0 |
| `analog` | Behringer RD-6 (analog TR-606 circuit), recorded by MckAudio: [MckAudio/MckSamplePacks](https://github.com/MckAudio/MckSamplePacks) `RD6/` | CC0 1.0 |

The RD-6 pack numbers its files; roles were assigned from measured decay and
spectral centroid. Slots a machine has no voice for (the 606 has no rim, clap
or cowbell; the 909 no shaker) fall back to the nearest voice of the same kit
rather than borrowing from another machine, so each kit stays itself.
