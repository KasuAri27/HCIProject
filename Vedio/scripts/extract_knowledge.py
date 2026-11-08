"""Create a short review clip from the finished film's 87–104 second section."""
from fractions import Fraction
from pathlib import Path

import av

ROOT = Path(__file__).resolve().parents[1]


def main():
    source = av.open(str(ROOT / 'output/study-film-2min.mp4'))
    output = av.open(str(ROOT / 'output/knowledge-preview.mp4'), 'w')
    video = output.add_stream('libx264', rate=30)
    video.width, video.height, video.pix_fmt = 1920, 1080, 'yuv420p'
    video.options = {'crf': '18', 'preset': 'fast'}
    audio = output.add_stream('aac', rate=48000)
    audio.layout = 'stereo'
    audio.bit_rate = 192000
    video_frames = 0
    audio_samples = 0
    input_frame = 0
    try:
        for frame in source.decode():
            if isinstance(frame, av.VideoFrame):
                if 2610 <= input_frame < 3120:
                    frame.pts = video_frames
                    frame.time_base = Fraction(1, 30)
                    for packet in video.encode(frame):
                        output.mux(packet)
                    video_frames += 1
                input_frame += 1
            else:
                # Slice at sample boundaries, keeping narration aligned with
                # the same segment's burned-in subtitles and node animations.
                first_sample = round(frame.pts * frame.time_base * 48000)
                lo = max(0, 87*48000-first_sample)
                hi = min(frame.samples, 104*48000-first_sample)
                if hi <= lo:
                    continue
                data = frame.to_ndarray()[:, lo:hi].copy()
                clipped = av.AudioFrame.from_ndarray(data, format=frame.format.name, layout='stereo')
                clipped.sample_rate = 48000
                clipped.pts = audio_samples
                clipped.time_base = Fraction(1, 48000)
                for packet in audio.encode(clipped):
                    output.mux(packet)
                audio_samples += clipped.samples
        for stream in (video, audio):
            for packet in stream.encode(None):
                output.mux(packet)
        assert video_frames == 510, video_frames
        assert audio_samples == 17*48000, audio_samples
    finally:
        source.close()
        output.close()
    print(f'Created 17-second preview: {video_frames} frames, {audio_samples} audio samples.')


if __name__ == '__main__':
    main()
