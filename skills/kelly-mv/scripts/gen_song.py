#!/usr/bin/env python3
"""Local song-generation wrapper (STUB).

Invoked by app/server/song-service.mjs with a single JSON arg on argv[1]:

    {
      "model": "mlx-community/SongGeneration-v2-large",
      "lyrics": "<plain or LRC lyrics>",
      "style": "synthpop, city pop, female vocal, 102 bpm, F# minor",
      "voice_ref": "/abs/path/to/voice_clone_reference.wav" | null,
      "duration_seconds": 60,
      "output": "/abs/path/to/output.wav"
    }

On success it must print the final audio path as the LAST stdout line.

This is intentionally NOT wired yet. Recommended local backends (Apple Silicon):

  * SongGeneration v2 (Tencent) — native MLX weights:
      mlx-community/SongGeneration-v2-large   (best fit for "本地 MLX")
  * ACE-Step 1.5 — full vocals + instruments, <4GB, supports audio-prompt
      timbre cloning + lyric editing (use this for "用我 clone 的声音创歌";
      pass `voice_ref` as the timbre reference clip).
  * YuE / DiffRhythm — full-length song-from-lyrics alternates.

To enable: create a venv at app/.data/song/venv, install the chosen backend,
replace the body of main() with a real inference call that writes `output`,
then flip `draft_ready` in song-service.songConfigPayload().

NOTE on voice cloning: cloning a *singing* voice needs a singing reference clip.
A spoken sample clones timbre but not vocal performance well.
"""
import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: gen_song.py '<json-args>'", file=sys.stderr)
        return 2
    try:
        args = json.loads(sys.argv[1])
    except json.JSONDecodeError as exc:
        print(f"invalid JSON args: {exc}", file=sys.stderr)
        return 2

    backend = args.get("model", "songgeneration-v2-mlx")
    print(
        "local song generation is not wired yet. "
        f"Install a backend ({backend} or ace-step-1.5) and implement gen_song.py. "
        "See the module docstring.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
