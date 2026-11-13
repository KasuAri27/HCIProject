"""Measure where each narration clause is actually spoken.

The film shows one clause per subtitle. Splitting a cue by character count
drifts by up to a second, so this reads the synthesized voice files, finds
the pauses between sentences and writes absolute clause times to
data/subtitle-timing.json. Run after make_audio.py whenever voices change.
"""
import json
import re
from pathlib import Path

import av
import numpy as np

BASE = Path(__file__).resolve().parents[1]
AUDIO = BASE / 'public' / 'audio'
RATE = 48000
HOP = 480  # 10 ms analysis step


def envelope(path):
    """Mono loudness per 10 ms step."""
    container = av.open(str(path))
    resampler = av.AudioResampler(format='fltp', layout='mono', rate=RATE)
    pieces = []
    for frame in container.decode(audio=0):
        pieces.extend(item.to_ndarray()[0] for item in resampler.resample(frame))
    pieces.extend(item.to_ndarray()[0] for item in resampler.resample(None))
    container.close()
    sound = np.concatenate(pieces)
    steps = len(sound) // HOP
    return np.sqrt((sound[:steps * HOP].reshape(steps, HOP) ** 2).mean(axis=1))


def silent_runs(loud):
    """Return (start, end) step ranges of pauses inside the spoken region."""
    quiet = loud < loud.max() * 0.035
    spoken = np.flatnonzero(~quiet)
    first, last = spoken[0], spoken[-1]
    runs, begin = [], None
    for i in range(first, last + 1):
        if quiet[i] and begin is None:
            begin = i
        elif not quiet[i] and begin is not None:
            runs.append((begin, i))
            begin = None
    return first, last + 1, runs


def main():
    cues = json.loads((BASE / 'data' / 'narration.json').read_text(encoding='utf-8'))
    timing = []
    for i, cue in enumerate(cues):
        clauses = re.findall(r'[^。！？；]+[。！？；]?', cue['text'])
        loud = envelope(AUDIO / f'voice-{i:02}.mp3')
        first, last, runs = silent_runs(loud)
        # Sentence-final pauses are the longest ones; commas are shorter.
        breaks = sorted(sorted(runs, key=lambda r: r[0] - r[1])[:len(clauses) - 1])
        assert len(breaks) == len(clauses) - 1, (i, cue['text'], runs)
        edges = [first] + [edge for run in breaks for edge in run] + [last]
        for n, text in enumerate(clauses):
            begin, end = edges[n * 2] / 100, edges[n * 2 + 1] / 100
            timing.append({'cue': i, 'start': round(cue['start'] + begin, 2),
                           'end': round(cue['start'] + end, 2), 'text': text})
        assert cue['start'] + last / 100 <= cue['end'] + 0.05, f'cue {i} overruns its window'
    (BASE / 'data' / 'subtitle-timing.json').write_text(
        json.dumps(timing, ensure_ascii=False, indent=1), encoding='utf-8')
    for item in timing:
        print(f"{item['start']:7.2f} - {item['end']:7.2f}  {item['text']}")


if __name__ == '__main__':
    main()
