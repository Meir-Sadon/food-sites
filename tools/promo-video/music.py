#!/usr/bin/env python3
"""Synthesizes a light upbeat background track (no samples, no licences): python3 music.py <seconds> <out.wav>"""
import sys, wave
import numpy as np
dur = float(sys.argv[1]); out = sys.argv[2]
sr = 44100; bpm = 104; beat = 60 / bpm
n = int(dur * sr); mix = np.zeros(n)
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def add(t0, sig, gain):
    i = int(t0 * sr)
    if i >= n: return
    sig = sig[: n - i]; mix[i:i + len(sig)] += sig * gain
def pluck(f, d=0.5):
    t = np.arange(int(d * sr)) / sr
    return (np.sin(2*np.pi*f*t) + .35*np.sin(2*np.pi*2*f*t)*np.exp(-t*14) + .15*np.sin(2*np.pi*3*f*t)*np.exp(-t*20)) * np.exp(-t*7)
def pad(f, d):
    t = np.arange(int(d * sr)) / sr
    env = np.minimum(1, t/0.4) * np.minimum(1, (d-t)/0.5)
    return (np.sin(2*np.pi*f*t) + np.sin(2*np.pi*f*1.004*t)) * .5 * env
def kick():
    t = np.arange(int(.25*sr))/sr
    return np.sin(2*np.pi*(55+90*np.exp(-t*30))*t) * np.exp(-t*12)
def hat():
    t = np.arange(int(.05*sr))/sr
    return np.random.default_rng(1).normal(size=len(t)) * np.exp(-t*90)
# C - Am - F - G, one bar each
chords = [(60, 64, 67, 72), (57, 60, 64, 69), (53, 57, 60, 65), (55, 59, 62, 67)]
bars = int(dur / (4 * beat)) + 1
for b in range(bars):
    c = chords[b % 4]; t0 = b * 4 * beat
    for m in c[:3]: add(t0, pad(hz(m - 12), 4 * beat), .05)
    add(t0, pluck(hz(c[0] - 24), 1.2), .22)
    add(t0 + 2 * beat, pluck(hz(c[0] - 24), .8), .16)
    for k in range(8):
        note = c[[0, 1, 2, 3, 2, 1, 2, 3][k]] + 12
        add(t0 + k * beat / 2, pluck(hz(note), .4), .14 if k % 2 == 0 else .09)
    if b >= 2:
        for k in range(4): add(t0 + k * beat, kick(), .28)
        for k in range(8): add(t0 + k * beat / 2 + beat / 4 if False else t0 + k * beat / 2, hat(), .05)
fade = np.minimum(1, np.minimum(np.arange(n) / (sr * 1.5), (n - np.arange(n)) / (sr * 3)))
mix = np.tanh(mix * 1.2) * fade * 0.7
with wave.open(out, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
