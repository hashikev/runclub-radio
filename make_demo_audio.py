#!/usr/bin/env python3
"""Generate distinguishable demo tracks so the app is audible out-of-the-box.
These are royalty-free tones the user replaces with real MP3s. Pure stdlib (no numpy)."""
import wave, struct, math, os

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "tracks")

def write_wav(path, samples):
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 30000)) for s in samples)
        w.writeframes(frames)

def tone(freq, dur, vol=0.5):
    n = int(SR * dur)
    for i in range(n):
        # gentle attack/release envelope so notes don't click
        env = min(1, i / (SR * 0.02)) * min(1, (n - i) / (SR * 0.05))
        yield vol * env * math.sin(2 * math.pi * freq * i / SR)

def melody(notes, note_dur, total, vol=0.5):
    """Loop a sequence of note frequencies to fill `total` seconds."""
    out = []
    while len(out) < SR * total:
        for f in notes:
            out.extend(tone(f, note_dur, vol))
    return out[: int(SR * total)]

# Three recognizably different demo tracks (different keys / patterns)
A4, C5, E5, G5, B4, D5, F5 = 440, 523, 659, 784, 494, 587, 698
tracks = {
    "demo-1-sunrise.wav":  melody([A4, C5, E5, G5], 0.35, 24),
    "demo-2-tempo.wav":    melody([C5, C5, G5, E5, G5], 0.22, 24),
    "demo-3-cooldown.wav": melody([E5, D5, C5, B4, A4], 0.45, 24),
}
for name, samples in tracks.items():
    p = os.path.join(OUT, name)
    write_wav(p, samples)
    print("wrote", p)
print("done")
