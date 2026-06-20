#!/usr/bin/env python
"""Generate a character voice sample with Qwen3-TTS VoiceDesign via mlx-audio.

Usage: gen_voice.py '{"model":"...","text":"...","instruct":"...","output":"/abs/x.wav"}'
Prints the final .wav path as the LAST stdout line. All library chatter goes to stderr.
"""
import sys, os, json, glob, contextlib, shutil

def main():
    args = json.loads(sys.argv[1])
    model = args["model"]
    text = args["text"]
    instruct = args.get("instruct", "")
    output = args["output"]
    out_dir = os.path.dirname(output) or "."
    os.makedirs(out_dir, exist_ok=True)
    prefix = os.path.splitext(os.path.basename(output))[0]

    from mlx_audio.tts.generate import generate_audio

    # Chinese sample lines -> zh; keep library logs on stderr so stdout = path only.
    with contextlib.redirect_stdout(sys.stderr):
        generate_audio(
            text=text,
            model=model,
            instruct=instruct,
            lang_code="zh",
            output_path=out_dir,
            file_prefix=prefix,
            audio_format="wav",
            save=True,
            verbose=False,
        )

    # Find what was written (file_prefix may get an index suffix) and normalise to `output`.
    candidates = sorted(glob.glob(os.path.join(out_dir, prefix + "*.wav")), key=os.path.getmtime)
    if not candidates:
        print("ERROR: no wav produced", file=sys.stderr)
        sys.exit(2)
    produced = candidates[-1]
    if produced != output:
        shutil.move(produced, output)
    print(output)

if __name__ == "__main__":
    main()
