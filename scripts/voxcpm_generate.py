#!/usr/bin/env python3
"""
voxcpm_generate.py — Zoomies batch voice generation via VoxCPM2

Loads the model ONCE, then generates all shots in a single pass.
Called by voices.ts as a subprocess.

Usage:
    python scripts/voxcpm_generate.py --tasks /tmp/tasks.json --output-dir /tmp/zoomies-vo/

Input tasks.json format:
    [
      {
        "shot_id": "SC01-SH01",
        "character": "kitty",
        "text": "(A sophisticated woman...)dialogue line here",
        "output_filename": "CWBH_S1E1_SC01_SC01-SH01_KITTY_VO.wav",
        "reference_audio": null
      }
    ]

Output: JSON written to stdout
    {
      "results": [
        { "shot_id": "SC01-SH01", "character": "kitty",
          "output_path": "/tmp/.../CWBH_....wav", "success": true, "error": null }
      ],
      "model_sample_rate": 48000
    }
"""

import sys
import json
import argparse
import os

def main():
    parser = argparse.ArgumentParser(description="Zoomies VoxCPM2 batch voice generator")
    parser.add_argument("--tasks", required=True, help="Path to JSON tasks file")
    parser.add_argument("--output-dir", required=True, help="Directory for generated .wav files")
    parser.add_argument("--model", default="openbmb/VoxCPM2", help="HuggingFace model ID")
    parser.add_argument("--cfg-value", type=float, default=2.0, help="Classifier-free guidance (0.1–10.0)")
    parser.add_argument("--inference-timesteps", type=int, default=10, help="Diffusion steps (1–100)")
    parser.add_argument("--load-denoiser", action="store_true", default=False, help="Load denoiser (slower load)")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # Load tasks
    with open(args.tasks, "r") as f:
        tasks = json.load(f)

    if not tasks:
        print(json.dumps({"results": [], "model_sample_rate": 48000}))
        return

    # ── Load model (once) ────────────────────────────────────────────────────
    print(f"[voxcpm] Loading {args.model}...", file=sys.stderr)
    try:
        from voxcpm import VoxCPM
        import soundfile as sf
    except ImportError as e:
        error_result = {
            "results": [
                {
                    "shot_id": t["shot_id"],
                    "character": t["character"],
                    "output_path": None,
                    "success": False,
                    "error": f"Import error: {e}. Install with: pip install voxcpm soundfile",
                }
                for t in tasks
            ],
            "model_sample_rate": 48000,
        }
        print(json.dumps(error_result))
        sys.exit(1)

    try:
        model = VoxCPM.from_pretrained(args.model, load_denoiser=args.load_denoiser)
        sample_rate = model.tts_model.sample_rate
        print(f"[voxcpm] Model loaded ✅  sample_rate={sample_rate}Hz", file=sys.stderr)
    except Exception as e:
        error_result = {
            "results": [
                {
                    "shot_id": t["shot_id"],
                    "character": t["character"],
                    "output_path": None,
                    "success": False,
                    "error": f"Model load failed: {e}",
                }
                for t in tasks
            ],
            "model_sample_rate": 48000,
        }
        print(json.dumps(error_result))
        sys.exit(1)

    # ── Generate each shot ───────────────────────────────────────────────────
    results = []

    for i, task in enumerate(tasks):
        shot_id = task["shot_id"]
        character = task["character"]
        text = task["text"]
        output_filename = task["output_filename"]
        reference_audio = task.get("reference_audio")

        output_path = os.path.join(args.output_dir, output_filename)

        print(
            f"[voxcpm] [{i+1}/{len(tasks)}] {shot_id} — {character} "
            f"({'clone' if reference_audio else 'design'} mode)...",
            file=sys.stderr,
        )

        try:
            generate_kwargs = {
                "text": text,
                "cfg_value": args.cfg_value,
                "inference_timesteps": args.inference_timesteps,
            }

            if reference_audio and os.path.exists(reference_audio):
                # Voice cloning mode — preserves character timbre from reference clip
                generate_kwargs["reference_wav_path"] = reference_audio
            # else: Voice Design mode — zero-shot from description in parentheses

            wav = model.generate(**generate_kwargs)
            sf.write(output_path, wav, sample_rate)

            print(f"[voxcpm]   ✅ saved: {output_filename}", file=sys.stderr)
            results.append({
                "shot_id": shot_id,
                "character": character,
                "output_path": output_path,
                "success": True,
                "error": None,
            })

        except Exception as e:
            print(f"[voxcpm]   ❌ failed: {e}", file=sys.stderr)
            results.append({
                "shot_id": shot_id,
                "character": character,
                "output_path": None,
                "success": False,
                "error": str(e),
            })

    print(
        f"\n[voxcpm] Done: {sum(r['success'] for r in results)}/{len(results)} generated",
        file=sys.stderr,
    )

    # Write results to stdout for Node.js to parse
    print(json.dumps({"results": results, "model_sample_rate": sample_rate}))


if __name__ == "__main__":
    main()
