"""Synthesize narration cues and an original 120-second score, then mix to WAV."""
import asyncio
import json
from pathlib import Path
import sys
import wave

import av
import numpy as np

sys.path.insert(0, 'D:/Dev/python-packages/video-production')
import edge_tts

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / 'public' / 'audio'
RATE = 48000
DURATION = 120


async def synthesize(cues):
    for i, cue in enumerate(cues):
        path = OUT / f'voice-{i:02}.mp3'
        if path.exists() and path.stat().st_size > 1000:
            continue
        await edge_tts.Communicate(cue['text'], 'zh-CN-XiaoxiaoNeural', rate='+8%').save(str(path))
        print(f'Voice {i+1}/{len(cues)}', flush=True)


def read_audio(path):
    container = av.open(str(path))
    resampler = av.AudioResampler(format='fltp', layout='stereo', rate=RATE)
    pieces = []
    for frame in container.decode(audio=0):
        pieces.extend(item.to_ndarray().T for item in resampler.resample(frame))
    pieces.extend(item.to_ndarray().T for item in resampler.resample(None))
    container.close()
    return np.concatenate(pieces)


def save(path, samples):
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cues = json.loads((BASE / 'data' / 'narration.json').read_text(encoding='utf-8'))
    asyncio.run(synthesize(cues))
    total = RATE * DURATION
    voices = np.zeros((total, 2), dtype=np.float64)
    report = []
    for i, cue in enumerate(cues):
        sound = read_audio(OUT / f'voice-{i:02}.mp3')
        budget = int((cue['end'] - cue['start']) * RATE)
        original_length = len(sound) / RATE
        if len(sound) > budget:
            # Fit unusually long cues without cutting syllables or truncating text.
            source = np.linspace(0, len(sound) - 1, budget)
            sound = np.stack([np.interp(source, np.arange(len(sound)), sound[:, ch]) for ch in range(2)], axis=1)
        sound *= 0.73 / max(np.abs(sound).max(), 1e-6)
        begin = int(cue['start'] * RATE)
        voices[begin:begin+len(sound)] += sound
        report.append({'cue': i, 'original_seconds': round(original_length, 3), 'used_seconds': round(len(sound)/RATE, 3)})

    score = make_score(DURATION)
    mixed = mix_narration(voices, score)
    save(OUT/'soundtrack.wav',mixed)
    save(OUT/'music.wav',score)
    save(OUT/'narration.wav',voices)
    (OUT/'voice-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    def stamp(seconds):
        ms=int(seconds*1000); return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    (BASE/'output').mkdir(exist_ok=True)
    (BASE/'output'/'subtitles.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(cues)),encoding='utf-8')
    print('Mixed 120 seconds of narration, music and transition sounds.',flush=True)


def make_score(duration, scene_time=lambda seconds: seconds):
    """Keep the music at 100 BPM and move effects to the corresponding shots."""
    total = round(RATE * duration)
    score = np.zeros((total, 2), dtype=np.float64)

    def tone(start, length, midi, gain, pan=0, pad=False):
        begin = int(start * RATE)
        n = min(int(length * RATE), total - begin)
        if n <= 0:
            return
        t = np.arange(n) / RATE
        freq = 440 * 2 ** ((midi - 69) / 12)
        env = (1-np.exp(-t*(3 if pad else 110))) * np.exp(-t*(0.65 if pad else 3.8))
        sound = (np.sin(2*np.pi*freq*t) + 0.15*np.sin(2*np.pi*freq*2*t)) * env * gain
        sound *= np.minimum((n-1-np.arange(n))/(RATE*0.15),1)
        score[begin:begin+n,0] += sound * np.sqrt((1-pan)/2)
        score[begin:begin+n,1] += sound * np.sqrt((1+pan)/2)

    # A calm D-minor/F-major progression at 100 BPM follows the editorial rhythm.
    chords = [[50,57,65,69], [53,60,67,72], [48,55,64,67], [55,62,69,74]]
    for bar in range(int(np.ceil(duration / 2.4))):
        start = bar * 2.4
        chord = chords[bar % 4]
        for pitch in chord:
            tone(start, 3.0, pitch, 0.024 if start < scene_time(26) else 0.033, pad=True)
        for beat in range(4):
            tone(start+beat*0.6+0.02, 1.5, chord[(bar+beat)%4]+12, 0.036, (-1 if beat%2 else 1)*0.3)
        # Gentle low pulse gives the edit momentum without masking narration.
        tone(start, 0.48, chord[0]-12, 0.055)
    rng = np.random.default_rng(271108)
    # Soft swishes sit on the scene changes, the two light-up moments in the
    # knowledge sky (94.7s, 99.6s) and the tool emphasis changes.
    for start in [7.5,13.5,21.5,27.5,32,44,54,66,77,87,94.7,99.6,104,108.5,110.9,112.1,115]:
        n = int(RATE*0.34)
        noise = np.convolve(rng.normal(0,1,n), np.ones(32)/32, mode='same')
        noise *= np.sin(np.linspace(0,np.pi,n))**2 * 0.04
        begin = int((scene_time(start)-0.20)*RATE)
        score[begin:begin+n] += noise[:,None]
    # Short ticks tighten with the clock shot and stop as the workbench appears.
    tick = 28.15
    while tick < 31.6:
        n = int(RATE*0.043)
        t = np.arange(n)/RATE
        click = np.sin(2*np.pi*1700*t)*np.exp(-t*145)*np.minimum(t*1500,1)*0.072
        begin = int(scene_time(tick)*RATE)
        score[begin:begin+n] += click[:,None]
        tick += max(0.10,0.46-(tick-28.15)*0.105)
    score *= np.minimum(np.arange(total)/(RATE*1.3),1)[:,None]
    score *= np.minimum((total-1-np.arange(total))/(RATE*2.8),1)[:,None]
    return score


def mix_narration(voices, score):
    # Lower music slightly while speech is active; a smoothed envelope avoids pumping.
    active = (np.max(np.abs(voices),axis=1)>0.005).astype(float)
    active = np.convolve(active[::480], np.ones(30)/30, mode='same')
    envelope = np.interp(np.arange(len(voices)), np.arange(len(active))*480, active)
    mixed = voices + score * (1-0.5*envelope[:,None])
    return np.clip(mixed, -0.94, 0.94)


if __name__=='__main__':
    main()
