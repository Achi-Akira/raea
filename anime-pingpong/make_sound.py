"""Synthesizes duel.wav (10 s, 48 kHz stereo) for the anime ping-pong duel, cued to the shot list in edit.tsx.

Everything is built from sine sweeps and filtered noise: taiko hits, whooshes, impact booms, a riser and a drone.
"""
import sys
import wave
import numpy as np

SR = 48000
FPS = 30
N = SR * 10
rng = np.random.default_rng(7)
mix = np.zeros((N, 2))


def at(frame):
    return int(frame / FPS * SR)


def put(sig, frame, gain=1.0, pan=0.0):
    i = at(frame)
    sig = sig[: max(0, N - i)]
    l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    mix[i : i + len(sig), 0] += sig * gain * l
    mix[i : i + len(sig), 1] += sig * gain * r


def env(n, attack=0.002, decay=0.3):
    t = np.arange(n) / SR
    return np.minimum(t / attack, 1) * np.exp(-t / decay)


def lowpass(x, a):
    # one-pole low-pass, a in (0, 1): smaller is darker
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += a * (v - acc)
        y[i] = acc
    return y


def taiko(f0=70, dur=0.9):
    n = int(SR * dur)
    t = np.arange(n) / SR
    freq = f0 * (1 + 1.5 * np.exp(-t / 0.03))
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * env(n, 0.001, 0.25)
    slap = rng.standard_normal(n) * env(n, 0.0005, 0.02)
    return np.tanh(1.6 * (body + 0.3 * slap))


def boom(dur=1.6):
    n = int(SR * dur)
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * np.cumsum(40 + 120 * np.exp(-t / 0.08)) / SR) * env(n, 0.001, 0.6)
    crack = lowpass(rng.standard_normal(n), 0.5) * env(n, 0.0005, 0.08)
    return np.tanh(2.2 * (sub + 0.7 * crack))


def whoosh(dur=0.5, up=True):
    n = int(SR * dur)
    x = rng.standard_normal(n)
    shape = np.sin(np.linspace(0, np.pi, n)) ** 2
    # sweep the filter by blending two low-passes
    a = lowpass(x, 0.05)
    b = x - lowpass(x, 0.3)
    k = np.linspace(0, 1, n) if up else np.linspace(1, 0, n)
    return (a * (1 - k) * 3 + b * k) * shape


def pock():
    n = int(SR * 0.12)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 2300 * t) * env(n, 0.0003, 0.015) + 0.4 * rng.standard_normal(n) * env(n, 0.0002, 0.004)


def riser(dur):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = 200 * (8 ** (t / dur))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    noise = (rng.standard_normal(n) - lowpass(rng.standard_normal(n), 0.2)) * 0.6
    return (tone * 0.4 + noise) * (t / dur) ** 2


def zap(dur=0.4):
    n = int(SR * dur)
    x = np.sign(np.sin(2 * np.pi * np.cumsum(90 + 600 * rng.random(n)) / SR))
    return lowpass(x, 0.3) * env(n, 0.001, 0.12)


# drone under the whole piece: two detuned low saws, swelling into the finale
t = np.arange(N) / SR
drone = sum(((t * f) % 1 * 2 - 1) for f in (55.0, 55.4, 82.4)) / 3
drone = lowpass(drone, 0.02) * (0.25 + 0.2 * np.clip((t - 8.8) / 0.5, 0, 1))
mix[:, 0] += drone
mix[:, 1] += drone

# 0-36 standoff: taiko pulse and the crackle between their eyes
for fr in (0, 9, 18, 24, 30):
    put(taiko(65), fr, 0.9)
put(zap(1.1), 2, 0.25, -0.2)
put(boom(), 6, 0.35, -0.6)   # KAI
put(boom(), 12, 0.35, 0.6)   # REN
# 36-66 eye: whoosh in, a ting when the pupil snaps
put(whoosh(0.4), 33, 0.6)
put(pock(), 50, 0.4)
put(taiko(180, 0.3), 50, 0.35)
# 66-105 serve: toss, hit, travel
put(whoosh(0.6, up=True), 68, 0.35, -0.5)
put(pock(), 88, 1.0, -0.6)
put(taiko(90), 88, 0.8, -0.4)
put(whoosh(0.5), 90, 0.6, 0.2)
# 105 impact frame
put(boom(), 105, 1.0, 0.3)
put(pock(), 105, 1.0, 0.4)
# 120-165 tracking: rushing air, whip pan
put(whoosh(1.4, up=False) * 0.8, 120, 0.5)
put(whoosh(0.35, up=True), 155, 0.9, -0.7)
# 165-200 hero power-up
put(riser(0.45), 165, 0.4)
put(boom(), 178, 0.9)
for fr in (178, 184, 190, 194, 197):
    put(taiko(70), fr, 0.8)
# 200-235 ball cam: riser into KAI's swing
put(riser(1.1), 200, 0.55)
put(pock(), 232, 1.0)
# 235-265 split then clash
put(zap(0.5), 235, 0.4)
put(whoosh(0.3), 236, 0.6)
put(boom(1.8), 250, 1.2)
put(boom(1.2), 253, 0.6, 0.5)
put(taiko(50, 1.2), 250, 1.0)
# 265-300 finale: hit then a held ring
put(boom(2.2), 265, 0.9)
n = int(SR * 1.2)
ring = np.sin(2 * np.pi * 880 * np.arange(n) / SR) * env(n, 0.01, 0.5) * 0.25
put(ring, 268, 1.0)
for fr in (270, 280, 288, 294):
    put(taiko(60), fr, 0.9)

# master: normalize to about -1 dBFS peak
mix = np.tanh(mix * 0.8)
mix *= 0.63 / np.max(np.abs(mix))
fade = np.clip((N - np.arange(N)) / (SR * 0.3), 0, 1)
mix *= fade[:, None]
pcm = (mix * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", sys.argv[1])
