#!/usr/bin/env python3
"""
Build the built-in sound kits under assets/audio/<kit>/<slot>.wav from their
CC0 sources (see assets/audio/LICENSES.md). One-off tooling, not shipped.

Usage: python3 scripts/build-sound-kits.py <fischer808-clone> <MckSamplePacks-clone>

Every output is 44.1 kHz / 16-bit / mono, head-trimmed at -45 dBFS, tail-trimmed
at -60 dBFS, capped at 2 s with a 10 ms fade-out, and peak-normalised to -1 dBFS,
so the kits sit at the same level and the one-shots stay small.
"""
import json
import os
import re
import subprocess
import sys

FISCHER, MCK = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')

# OP-XY drum slots (src/core/opxy.ts), MIDI 53..76 in this order.
SLOTS = [
    'kick', 'kickAlt', 'snare', 'snare2', 'rim', 'clap', 'tamb', 'shaker',
    'closedHat', 'closedHat2', 'openHat', 'clave', 'lowTom', 'ride', 'midTom',
    'crash', 'hiTom', 'triangle', 'lowConga', 'hiConga', 'cowbell', 'guiro',
    'metal', 'chi',
]

# Fischer naming: <role><TONE/TUNING><DECAY/SNAPPY>, 00..75 per knob.
F = lambda p: os.path.join(FISCHER, p)
T = lambda p: os.path.join(MCK, 'TR8', p)
R = lambda p: os.path.join(MCK, 'RD6', p)

KITS = {
    '808': {
        'kick': F('bd8/BD2550.WAV'), 'kickAlt': F('bd8/BD5075.WAV'),
        'snare': F('sd8/SD2550.WAV'), 'snare2': F('sd8/SD5075.WAV'),
        'rim': F('rs8/RS.WAV'), 'clap': F('cp8/CP.WAV'),
        'tamb': F('ma8/MA.WAV'), 'shaker': F('ma8/MA.WAV'),
        'closedHat': F('ch8/CH.WAV'), 'closedHat2': F('ch8/CH.WAV'),
        'openHat': F('oh8/OH50.WAV'), 'clave': F('cl8/CL.WAV'),
        'lowTom': F('lt8/LT25.WAV'), 'ride': F('cy8/CY2525.WAV'), 'midTom': F('mt8/MT25.WAV'),
        'crash': F('cy8/CY5075.WAV'), 'hiTom': F('ht8/HT25.WAV'), 'triangle': F('cb8/CB.WAV'),
        'lowConga': F('lc8/LC25.WAV'), 'hiConga': F('hc8/HC25.WAV'),
        'cowbell': F('cb8/CB.WAV'), 'guiro': F('ma8/MA.WAV'),
        'metal': F('cy8/CY7525.WAV'), 'chi': F('ch8/CH.WAV'),
    },
    '909': {
        'kick': T('BD/004_909_Bass_Drum_1.wav'), 'kickAlt': T('BD/012_909_AttackBD_1.wav'),
        'snare': T('SD/005_909_Snare_Drum_1.wav'), 'snare2': T('SD/011_909_AttackSD_1.wav'),
        'rim': T('PERC/009_909_Rim_Shot.wav'), 'clap': T('PERC/019_909_Hand_Clap.wav'),
        'tamb': T('HATS/010_909_Closed_HiHat_Short.wav'), 'shaker': T('HATS/010_909_Closed_HiHat_Short.wav'),
        'closedHat': T('HATS/008_909_Closed_HiHat.wav'), 'closedHat2': T('HATS/010_909_Closed_HiHat_Short.wav'),
        'openHat': T('HATS/007_909_Open_HiHat.wav'), 'clave': T('PERC/009_909_Rim_Shot.wav'),
        'lowTom': T('TOMS/010_909_Low_Tom.wav'), 'ride': T('HATS/026_909_Ride_Cymbal.wav'), 'midTom': T('TOMS/011_909_Mid_Tom.wav'),
        'crash': T('HATS/020_909_Crash_Cymbal.wav'), 'hiTom': T('TOMS/012_909_High_Tom.wav'), 'triangle': T('HATS/027_909_Ride_Cymbal_Short.wav'),
        'lowConga': T('TOMS/013_909_Low_Tom_Short.wav'), 'hiConga': T('TOMS/015_909_High_Tom_Short.wav'),
        'cowbell': T('PERC/009_909_Rim_Shot.wav'), 'guiro': T('PERC/020_909_Hand_Clap_Long.wav'),
        'metal': T('HATS/021_909_Crash_Cymbal_Short.wav'), 'chi': T('HATS/009_909_Open_HiHat_Short.wav'),
    },
    # Behringer RD-6 (analog 606 circuit). The pack names files by number, so
    # roles were picked by measured decay/spectral centroid; the 606 has no
    # rim/clap-less slots etc., those fall back to the nearest voice.
    'analog': {
        'kick': R('BD/004.wav'), 'kickAlt': R('BD/006.wav'),
        'snare': R('SD/003.wav'), 'snare2': R('SD/004.wav'),
        'rim': R('SD/001.wav'), 'clap': R('CLAP/002.wav'),
        'tamb': R('HATS/001.wav'), 'shaker': R('HATS/002.wav'),
        'closedHat': R('HATS/001.wav'), 'closedHat2': R('HATS/003.wav'),
        'openHat': R('HATS/007.wav'), 'clave': R('HATS/003.wav'),
        'lowTom': R('TOMS/002.wav'), 'ride': R('HATS/011.wav'), 'midTom': R('TOMS/001.wav'),
        'crash': R('HATS/012.wav'), 'hiTom': R('TOMS/006.wav'), 'triangle': R('HATS/004.wav'),
        'lowConga': R('TOMS/005.wav'), 'hiConga': R('TOMS/008.wav'),
        'cowbell': R('TOMS/011.wav'), 'guiro': R('CLAP/004.wav'),
        'metal': R('HATS/008.wav'), 'chi': R('HATS/002.wav'),
    },
}

# Short one-shots everywhere; only the long-ringing voices keep a 2 s tail.
MAX_S = 1.2
LONG = {'crash': 2.0, 'ride': 2.0, 'openHat': 1.5, 'metal': 2.0, 'kickAlt': 1.5}


def peak_db(path):
    out = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    m = re.search(r'max_volume: (-?[\d.]+) dB', out)
    return float(m.group(1)) if m else 0.0


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                capture_output=True, text=True).stdout.strip())


def build(src, dst, slot):
    # Normalise FIRST so the trim thresholds are relative to the hit, not to
    # whatever level the pack was recorded at (the quiet Fischer rim shot lost
    # all but 10 ms to a full-scale -60 dB threshold).
    gain = -1.0 - peak_db(src)
    trim = ('silenceremove=start_periods=1:start_threshold=-45dB,'
            'areverse,silenceremove=start_periods=1:start_threshold=-48dB,areverse')
    tmp = dst + '.tmp.wav'
    cap = LONG.get(slot, MAX_S)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', f'volume={gain:.2f}dB,{trim}', '-ac', '1',
                    '-ar', '44100', '-t', str(cap), '-c:a', 'pcm_s16le', tmp], check=True)
    dur = duration(tmp)
    fade_len = 0.03 if dur >= cap - 0.001 else 0.01
    fade = max(0.0, dur - fade_len)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', f'afade=t=out:st={fade:.4f}:d={fade_len}',
                    '-c:a', 'pcm_s16le', dst], check=True)
    os.remove(tmp)
    return dur


manifest = {}
for kit, table in KITS.items():
    d = os.path.join(OUT, kit)
    os.makedirs(d, exist_ok=True)
    manifest[kit] = {}
    for slot in SLOTS:
        src = table[slot]
        if not os.path.exists(src):
            sys.exit(f'missing source {src}')
        dst = os.path.join(d, f'{slot}.wav')
        dur = build(src, dst, slot)
        rel = os.path.relpath(src, FISCHER if kit == '808' else MCK)
        manifest[kit][slot] = rel
        print(f'{kit}/{slot}.wav  <- {rel}  {dur:.2f}s  {os.path.getsize(dst)//1024} KB')
with open(os.path.join(OUT, 'sources.json'), 'w') as f:
    json.dump(manifest, f, indent=2)
    f.write('\n')
