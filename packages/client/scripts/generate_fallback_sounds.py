"""
Regenerates the call/voice/stream sounds (and the alone-in-call pad) in assets_fallback/sounds.

The upstream sound pack lives in a private assets repo that the build does not
have, so these files used to be 1 second of digital silence (-91 dB) and only
message_sound.ogg ever played. These are short synthesized tones instead.

Usage (needs ffmpeg with libvorbis on PATH):
    python -I generate_fallback_sounds.py
"""

import math
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

RATE = 44100
PEAK = 0.45
OUT = Path(__file__).parent / "assets_fallback" / "sounds"

# (frequency Hz, seconds); frequency 0 is a rest
SOUNDS = {
    "mute": [(520, 0.09), (390, 0.15)],
    "unmute": [(390, 0.09), (520, 0.15)],
    "deafen": [(520, 0.08), (390, 0.08), (290, 0.16)],
    "undeafen": [(290, 0.08), (390, 0.08), (520, 0.16)],
    "user_join_voice": [(440, 0.08), (660, 0.17)],
    "user_leave_voice": [(660, 0.08), (440, 0.17)],
    "stream_start": [(392, 0.08), (523, 0.08), (659, 0.17)],
    "stream_end": [(659, 0.08), (523, 0.08), (392, 0.17)],
    "stream_viewer_join": [(784, 0.07), (988, 0.13)],
    "stream_viewer_leave": [(988, 0.07), (784, 0.13)],
    "user_moved": [(587, 0.07), (740, 0.07), (587, 0.11)],
    "ringtone_incoming": [
        (880, 0.16), (660, 0.16), (0, 0.08), (880, 0.16), (660, 0.16), (0, 0.9),
    ],
    "ringtone_outgoing": [(440, 0.4), (0, 0.4), (440, 0.4), (0, 0.8)],
}


def render(notes):
    samples = []
    for freq, seconds in notes:
        count = int(RATE * seconds)
        for i in range(count):
            if freq == 0:
                samples.append(0.0)
                continue
            t = i / RATE
            attack = min(1.0, t / 0.006)
            decay = math.exp(-5.0 * t / seconds)
            tone = math.sin(2 * math.pi * freq * t) + 0.25 * math.sin(
                4 * math.pi * freq * t
            )
            samples.append(PEAK * attack * decay * tone / 1.25)
    return samples


def main():
    for name, notes in SOUNDS.items():
        samples = render(notes)
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = Path(tmp) / f"{name}.wav"
            with wave.open(str(wav_path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(RATE)
                wav.writeframes(
                    b"".join(struct.pack("<h", int(s * 32767)) for s in samples)
                )
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
                 "-c:a", "libvorbis", "-q:a", "4", str(OUT / f"{name}.ogg")],
                check=True,
            )
        print("wrote", name)


def render_pad(seconds=16, rate=22050):
    """Quiet looping pad for the alone-in-call hold music.

    Every frequency is a multiple of 1/seconds Hz and every swell repeats a whole
    number of times, so the last sample flows into the first and the loop has no click.
    """
    notes = [(174.5625, 0.5), (261.625, 0.55), (329.625, 0.45), (392.0, 0.4), (493.875, 0.3)]
    count = seconds * rate
    out = []
    for i in range(count):
        t = i / rate
        v = 0.0
        for n, (freq, gain) in enumerate(notes):
            swell = 0.55 + 0.45 * math.sin(2 * math.pi * (n + 1) * t / seconds + n)
            v += gain * swell * math.sin(2 * math.pi * freq * t)
        out.append(0.16 * v / len(notes) * 2)
    return out, rate


def write_pad(name="alone_in_call"):
    samples, rate = render_pad()
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / f"{name}.wav"
        with wave.open(str(wav_path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(b"".join(struct.pack("<h", int(s * 32767)) for s in samples))
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
             "-c:a", "libvorbis", "-q:a", "3", str(OUT / f"{name}.ogg")],
            check=True,
        )
    print("wrote", name)


main()
write_pad()
