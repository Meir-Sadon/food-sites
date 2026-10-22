#!/usr/bin/env python3
"""Synthesizes a calm, light background track (no samples, no licences): python3 music.py <seconds> <out.wav>
Slow tempo, soft pads and a sparse marimba-like melody that changes every few bars, so it never loops audibly."""
import sys, wave
import numpy as np
dur = float(sys.argv[1]); out = sys.argv[2]
sr = 44100; bpm = 84; beat = 60 / bpm
n = int(dur * sr); mix = np.zeros(n); rng = np.random.default_rng(7)
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def add(t0, sig, gain):
    i = int(t0 * sr)
    if i >= n: return
    sig = sig[: n - i]; mix[i:i + len(sig)] += sig * gain
def pluck(f, d=.9):
    t = np.arange(int(d * sr)) / sr
    return (np.sin(2*np.pi*f*t) + .25*np.sin(2*np.pi*4*f*t)*np.exp(-t*30)) * np.exp(-t*5)
def pad(f, d):
    t = np.arange(int(d * sr)) / sr
    env = np.minimum(1, t / 1.2) * np.minimum(1, (d - t) / 1.5)
    return (np.sin(2*np.pi*f*t) + .6*np.sin(2*np.pi*f*1.003*t) + .3*np.sin(2*np.pi*2*f*t)) * .4 * env
def brush():
    t = np.arange(int(.09 * sr)) / sr
    return rng.normal(size=len(t)) * np.exp(-t * 55)
prog = [[(60, 64, 67), 72], [(57, 60, 64), 69], [(53, 57, 60), 65], [(55, 59, 62), 67],
        [(52, 55, 59), 71], [(57, 60, 64), 69], [(50, 53, 57), 62], [(55, 59, 62), 67]]
scale = [0, 2, 4, 7, 9]
bars = int(dur / (4 * beat)) + 2
for b in range(bars):
    chord, top = prog[b % 8]; t0 = b * 4 * beat
    for m in chord: add(t0, pad(hz(m), 4 * beat + 1.0), .05)
    add(t0, pluck(hz(chord[0] - 12), 1.6), .12)
    # sparse melody: 3-4 notes per bar from the pentatonic scale around the chord root, different every bar
    root = chord[0] + 12
    for k in sorted(rng.choice(8, size=3 + (b % 2), replace=False)):
        m = root + scale[rng.integers(0, 5)] + (12 if rng.random() < .35 else 0)
        add(t0 + k * beat / 2, pluck(hz(m), .8), .07)
    if b >= 4:
        for k in range(4): add(t0 + k * beat + beat / 2, brush(), .018)
fade = np.minimum(1, np.minimum(np.arange(n) / (sr * 2), (n - np.arange(n)) / (sr * 3)))
mix = np.tanh(mix * 1.1) * fade * 0.5
with wave.open(out, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
