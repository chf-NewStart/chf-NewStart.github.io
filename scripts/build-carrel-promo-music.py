#!/usr/bin/env python3
"""Render the original chill-piano bed used by the Carrel promo video."""

from __future__ import annotations

import argparse
import math
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 48_000
TEMPO = 72
BEAT = 60 / TEMPO


def midi_frequency(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def add_piano(
    left: np.ndarray,
    right: np.ndarray,
    note: int,
    start: float,
    duration: float,
    amplitude: float,
    pan: float = 0.0,
) -> None:
    """Add a warm, damped piano-like note to a stereo buffer."""
    start_sample = max(0, int(start * SAMPLE_RATE))
    sample_count = min(int(duration * SAMPLE_RATE), len(left) - start_sample)
    if sample_count <= 0:
        return

    time = np.arange(sample_count, dtype=np.float64) / SAMPLE_RATE
    frequency = midi_frequency(note)
    attack = 1.0 - np.exp(-time * 90.0)
    decay = 0.72 * np.exp(-time * 2.35) + 0.28 * np.exp(-time * 0.72)
    envelope = attack * decay

    # Slightly stretched upper partials make this gentler and less organ-like.
    tone = (
        np.sin(2 * math.pi * frequency * time)
        + 0.34 * np.sin(2 * math.pi * frequency * 2.003 * time + 0.18)
        + 0.13 * np.sin(2 * math.pi * frequency * 3.008 * time + 0.43)
        + 0.05 * np.sin(2 * math.pi * frequency * 4.015 * time + 0.71)
    )
    note_audio = amplitude * envelope * tone / 1.38

    left_gain = math.sqrt((1.0 - pan) / 2.0)
    right_gain = math.sqrt((1.0 + pan) / 2.0)
    target = slice(start_sample, start_sample + sample_count)
    left[target] += note_audio * left_gain
    right[target] += note_audio * right_gain


def add_room(signal: np.ndarray) -> np.ndarray:
    """Apply a small, transparent room made from quiet feedback-free echoes."""
    wet = signal.copy()
    for delay_seconds, gain in ((0.083, 0.14), (0.151, 0.09), (0.237, 0.055)):
        delay = int(delay_seconds * SAMPLE_RATE)
        wet[delay:] += signal[:-delay] * gain
    return wet


def render(duration: float) -> np.ndarray:
    sample_count = int(duration * SAMPLE_RATE)
    left = np.zeros(sample_count, dtype=np.float64)
    right = np.zeros(sample_count, dtype=np.float64)

    # Ten slow bars, composed for this demo. MIDI pitches use C4 = 60.
    progression = [
        (48, (55, 59, 64)),  # Cmaj7
        (45, (52, 55, 60)),  # Am7
        (41, (48, 52, 57)),  # Fmaj7
        (43, (50, 52, 59)),  # G6
        (48, (55, 59, 64)),  # Cmaj7
        (40, (47, 50, 55)),  # Em7
        (41, (48, 52, 57)),  # Fmaj7
        (43, (50, 52, 57)),  # Gsus2 / G6 colour
        (45, (52, 55, 60)),  # Am7
        (48, (53, 57, 64)),  # C with an open F colour
    ]
    melody = [
        (67, 71, 69),
        (64, 67, 64),
        (60, 64, 62),
        (59, 64, 62),
        (67, 71, 72),
        (67, 62, 59),
        (64, 69, 67),
        (62, 64, 59),
        (64, 67, 69),
        (67, 64, 60),
    ]

    bar_duration = 4 * BEAT
    for bar, ((root, chord), phrase) in enumerate(zip(progression, melody)):
        bar_start = bar * bar_duration
        add_piano(left, right, root, bar_start, 3.25, 0.24, -0.08)
        add_piano(left, right, root + 12, bar_start + 2 * BEAT, 2.2, 0.10, 0.10)

        # Two restrained chord breaths per bar.
        for chord_time, chord_amp in ((0.0, 0.19), (2 * BEAT, 0.13)):
            for index, chord_note in enumerate(chord):
                add_piano(
                    left,
                    right,
                    chord_note,
                    bar_start + chord_time + index * 0.024,
                    2.65,
                    chord_amp,
                    (-0.28, 0.05, 0.30)[index],
                )

        # A small three-note answer leaves plenty of breathing room.
        for offset, note, pan in zip((1.25, 2.7, 3.35), phrase, (-0.18, 0.18, 0.0)):
            add_piano(left, right, note, bar_start + offset * BEAT, 1.75, 0.085, pan)

    left = add_room(left)
    right = add_room(right)

    # Gentle master saturation, then a long entrance and exit.
    stereo = np.column_stack((left, right))
    stereo = np.tanh(stereo * 1.08)
    fade_in = min(int(1.7 * SAMPLE_RATE), sample_count)
    fade_out = min(int(2.4 * SAMPLE_RATE), sample_count)
    stereo[:fade_in] *= np.linspace(0.0, 1.0, fade_in)[:, None]
    stereo[-fade_out:] *= np.linspace(1.0, 0.0, fade_out)[:, None]

    peak = float(np.max(np.abs(stereo))) or 1.0
    stereo *= 0.34 / peak  # Roughly -9.4 dBFS peak: present, never pushy.
    return stereo


def write_wav(path: Path, audio: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(audio * 32767.0, -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--duration", type=float, default=33.566667)
    args = parser.parse_args()
    write_wav(args.output, render(args.duration))


if __name__ == "__main__":
    main()
