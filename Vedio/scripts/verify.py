"""Decode every frame and sample both streams; save a review sheet and JSON proof."""
import json
from pathlib import Path

import av
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MOVIE = ROOT / 'output' / 'study-film-v3.mp4'


def main():
    container = av.open(str(MOVIE))
    video = container.streams.video[0]
    audio = container.streams.audio[0]
    assert (video.width, video.height) == (1920, 1080)
    assert video.average_rate == 30
    assert video.codec_context.name == 'h264'
    assert audio.codec_context.name == 'aac'
    duration = container.duration / av.time_base
    assert 119.9 <= duration <= 120.1, duration
    sample_frames = [90,255,310,370,454,535,623,730,879,943,1160,1510,1840,
                     2080,2220,2370,2520,2720,2820,2940,3060,3180,3300,3390,3540]
    chosen = {frame: i for i,frame in enumerate(sample_frames)}
    sheet = Image.new('RGB', (2400, 1500), '#D6E1D9')
    draw = ImageDraw.Draw(sheet)
    frame_count = 0
    audio_samples = 0
    audio_peak = 0.0
    audio_energy = 0.0
    first_pts = None
    last_pts = None
    for frame in container.decode():
        if isinstance(frame, av.VideoFrame):
            assert frame.width == 1920 and frame.height == 1080
            if frame_count == 3000:
                frame.to_image().save(ROOT/'output/preview-graph.png')
            if frame_count in chosen:
                slot = chosen[frame_count]
                x, y = slot%5*480, slot//5*300
                sheet.paste(frame.to_image().resize((480,270)),(x,y))
                draw.text((x+12,y+279),f'{frame_count/30:.1f}s',fill='#143831')
            first_pts = frame.pts if first_pts is None else first_pts
            last_pts = frame.pts
            frame_count += 1
        else:
            data = frame.to_ndarray().astype(np.float64)
            audio_peak = max(audio_peak,float(np.max(np.abs(data))))
            audio_energy += float(np.sum(data*data))
            audio_samples += frame.samples
    assert frame_count == 3600, frame_count
    assert audio_samples >= 120*48000, audio_samples
    assert 0.1 < audio_peak <= 1.0, audio_peak
    capture = json.loads((ROOT/'public/ui/capture-report.json').read_text(encoding='utf-8'))
    assert capture['browser_errors'] == []
    # Product names are excluded from visible authored text and narration. The
    # archived application source may still contain historical internal names.
    authored = ''.join(p.read_text(encoding='utf-8') for p in (ROOT/'src').glob('*.tsx'))
    authored += (ROOT/'data/narration.json').read_text(encoding='utf-8')
    assert 'HCIProject' not in authored and '学习助手' not in authored
    sheet.save(ROOT/'output/review-sheet.jpg',quality=92)
    sheet.save(ROOT/'output/storyboard-review.png')
    report = {'status':'PASS','duration_seconds':duration,'resolution':[1920,1080], 'fps':30,
              'decoded_video_frames':frame_count,'video_codec':'h264','audio_codec':'aac',
              'audio_sample_rate':audio.rate,'decoded_audio_samples':audio_samples,
              'audio_peak':round(audio_peak,4),'file_bytes':MOVIE.stat().st_size,
              'browser_capture_errors':capture['browser_errors'],
              'sampled_seconds':[round(frame/30,2) for frame in sample_frames],
              'visual_review':'Sampled contact sheet generated for manual inspection; not a real user test.'}
    (ROOT/'output/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    container.close()


if __name__=='__main__':
    main()
