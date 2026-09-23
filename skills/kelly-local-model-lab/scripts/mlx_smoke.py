#!/usr/bin/env python3
"""Run a reproducible fixture-backed MLX-LM baseline, QLoRA train, and adapter evaluation."""

from __future__ import annotations

import argparse
from collections import Counter
import gc
import hashlib
import importlib.metadata
import json
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

CATEGORIES = {
    "finance",
    "invest",
    "rbf",
    "legal",
    "sales-crm",
    "comms",
    "marketing",
    "growth",
    "ecommerce",
    "industry-intel",
    "production",
    "education",
    "platform",
}
RISKS = {"sandbox", "read-only", "local-write", "gated-write"}
APP_TYPES = {
    "research-desk",
    "review-queue",
    "planner",
    "action-console",
    "retrospective-dashboard",
    "operating-dashboard",
    "control-panel",
    "collaboration-workspace",
}
EXPECTED_KEYS = {"name", "category", "risk", "surface", "app_type"}


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="mlx-community/Qwen3-0.6B-4bit")
    parser.add_argument("--model-source", default="mlx-community/Qwen3-0.6B-4bit")
    parser.add_argument("--model-revision", default="")
    parser.add_argument("--data", type=Path, default=root / "training" / "fixture")
    parser.add_argument("--output", type=Path, default=root / ".cache" / "smoke-run")
    parser.add_argument("--task", choices=("auto", "app_spec", "support_qa"), default="auto")
    parser.add_argument("--iters", type=int, default=80)
    parser.add_argument("--baseline-only", action="store_true")
    parser.add_argument("--skip-baseline", action="store_true")
    return parser.parse_args()


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number}: {error}") from error
    return rows


def infer_task(data_dir: Path, splits: dict[str, list[dict]], requested: str) -> str:
    if requested != "auto":
        return requested
    manifest_path = data_dir / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        task = manifest.get("task")
        if task in {"app_spec", "support_qa"}:
            return task
    first = next(row for rows in splits.values() for row in rows)
    try:
        return "app_spec" if schema_valid(json.loads(first["messages"][-1]["content"])) else "support_qa"
    except (KeyError, TypeError, json.JSONDecodeError):
        return "support_qa"


def validate_data(data_dir: Path, requested_task: str) -> tuple[dict[str, list[dict]], str, str]:
    splits = {name: load_jsonl(data_dir / f"{name}.jsonl") for name in ("train", "valid", "test")}
    task = infer_task(data_dir, splits, requested_task)
    prompts = set()
    digest = hashlib.sha256()
    for split, rows in splits.items():
        if not rows:
            raise ValueError(f"{split}.jsonl is empty")
        content = (data_dir / f"{split}.jsonl").read_bytes()
        digest.update(split.encode())
        digest.update(content)
        for index, row in enumerate(rows):
            messages = row.get("messages")
            if not isinstance(messages, list) or [message.get("role") for message in messages] != [
                "system",
                "user",
                "assistant",
            ]:
                raise ValueError(f"{split}[{index}] must contain system, user, assistant messages")
            prompt = messages[1].get("content", "").strip()
            if not prompt or prompt in prompts:
                raise ValueError(f"duplicate or empty prompt in {split}[{index}]")
            prompts.add(prompt)
            expected_text = messages[2].get("content", "").strip()
            if task == "app_spec":
                expected = json.loads(expected_text)
                if not schema_valid(expected):
                    raise ValueError(f"invalid expected app_spec in {split}[{index}]")
            elif not expected_text:
                raise ValueError(f"empty expected support answer in {split}[{index}]")
    return splits, digest.hexdigest(), task


def local_model_hash(model: str) -> str:
    model_path = Path(model)
    if not model_path.is_dir():
        return ""
    digest = hashlib.sha256()
    files = sorted(model_path.glob("*.safetensors"))
    for file in files:
        digest.update(file.name.encode())
        with file.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    return f"sha256:{digest.hexdigest()}" if files else ""


def schema_valid(value: object) -> bool:
    if not isinstance(value, dict) or set(value) != EXPECTED_KEYS:
        return False
    return (
        isinstance(value["name"], str)
        and value["category"] in CATEGORIES
        and value["risk"] in RISKS
        and isinstance(value["surface"], list)
        and all(isinstance(item, str) for item in value["surface"])
        and value["app_type"] in APP_TYPES
    )


def parse_object(text: str) -> dict | None:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        value = json.loads(text[start : end + 1])
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        return None


def chat_prompt(tokenizer, messages: list[dict]) -> str:
    kwargs = {"tokenize": False, "add_generation_prompt": True}
    try:
        return tokenizer.apply_chat_template(messages, enable_thinking=False, **kwargs)
    except TypeError:
        return tokenizer.apply_chat_template(messages, **kwargs)


def evaluate_app_spec(model, tokenizer, rows: list[dict]) -> dict:
    from mlx_lm import generate

    results = []
    latencies = []
    valid_json = 0
    valid_schema = 0
    exact_fields = 0
    total_fields = len(rows) * len(EXPECTED_KEYS)
    for row in rows:
        messages = row["messages"]
        expected = json.loads(messages[-1]["content"])
        prompt = chat_prompt(tokenizer, messages[:-1])
        started = time.perf_counter()
        output = generate(model, tokenizer, prompt=prompt, max_tokens=180, verbose=False)
        latencies.append((time.perf_counter() - started) * 1000)
        parsed = parse_object(output)
        if parsed is not None:
            valid_json += 1
            if schema_valid(parsed):
                valid_schema += 1
            exact_fields += sum(parsed.get(key) == expected[key] for key in EXPECTED_KEYS)
        results.append({"prompt": messages[-2]["content"], "expected": expected, "output": output, "parsed": parsed})
    latencies.sort()
    count = len(rows)
    return {
        "case_count": count,
        "json_valid_pct": round(valid_json / count * 100, 2),
        "schema_valid_pct": round(valid_schema / count * 100, 2),
        "exact_field_pct": round(exact_fields / total_fields * 100, 2),
        "median_latency_ms": round(latencies[len(latencies) // 2], 2),
        "cases": results,
    }


def normalize_answer(value: str) -> str:
    without_thinking = re.sub(r"<think>.*?</think>", "", value, flags=re.DOTALL | re.IGNORECASE)
    normalized = unicodedata.normalize("NFKC", without_thinking).casefold()
    return "".join(char for char in normalized if not char.isspace() and not unicodedata.category(char).startswith("P"))


def character_f1(expected: str, actual: str) -> float:
    expected_chars = Counter(normalize_answer(expected))
    actual_chars = Counter(normalize_answer(actual))
    if not expected_chars or not actual_chars:
        return 1.0 if expected_chars == actual_chars else 0.0
    overlap = sum((expected_chars & actual_chars).values())
    precision = overlap / sum(actual_chars.values())
    recall = overlap / sum(expected_chars.values())
    return 2 * precision * recall / (precision + recall) if precision + recall else 0.0


def evaluate_support_qa(model, tokenizer, rows: list[dict]) -> dict:
    from mlx_lm import generate

    results = []
    latencies = []
    exact_matches = 0
    f1_scores = []
    for row in rows:
        messages = row["messages"]
        expected = messages[-1]["content"].strip()
        prompt = chat_prompt(tokenizer, messages[:-1])
        started = time.perf_counter()
        output = generate(model, tokenizer, prompt=prompt, max_tokens=180, verbose=False).strip()
        latencies.append((time.perf_counter() - started) * 1000)
        exact = normalize_answer(output) == normalize_answer(expected)
        score = character_f1(expected, output)
        exact_matches += int(exact)
        f1_scores.append(score)
        results.append(
            {
                "prompt": messages[-2]["content"],
                "expected": expected,
                "output": output,
                "normalized_exact": exact,
                "character_f1": round(score, 4),
            }
        )
    latencies.sort()
    count = len(rows)
    return {
        "case_count": count,
        "exact_match_pct": round(exact_matches / count * 100, 2),
        "character_f1_pct": round(sum(f1_scores) / count * 100, 2),
        "median_latency_ms": round(latencies[len(latencies) // 2], 2),
        "cases": results,
    }


def evaluate(model_name: str, rows: list[dict], task: str, adapter_path: Path | None = None) -> dict:
    import mlx.core as mx
    from mlx_lm import load

    load_kwargs = {"adapter_path": str(adapter_path)} if adapter_path else {}
    model, tokenizer = load(model_name, **load_kwargs)
    result = evaluate_app_spec(model, tokenizer, rows) if task == "app_spec" else evaluate_support_qa(model, tokenizer, rows)
    del model
    mx.clear_cache()
    gc.collect()
    return result


def train(args: argparse.Namespace, adapter_path: Path) -> list[str]:
    command = [
        sys.executable,
        "-m",
        "mlx_lm",
        "lora",
        "--model",
        args.model,
        "--train",
        "--data",
        str(args.data),
        "--adapter-path",
        str(adapter_path),
        "--iters",
        str(args.iters),
        "--batch-size",
        "1",
        "--mask-prompt",
        "--num-layers",
        "8",
        "--learning-rate",
        "0.0001",
        "--max-seq-length",
        "512",
        "--steps-per-eval",
        "20",
        "--seed",
        "7",
    ]
    subprocess.run(command, check=True)
    return command


def main() -> None:
    args = parse_args()
    splits, dataset_hash, task = validate_data(args.data, args.task)
    args.output.mkdir(parents=True, exist_ok=True)
    adapter_path = args.output / "adapters"
    report_path = args.output / "report.json"
    if args.skip_baseline and report_path.exists():
        report = json.loads(report_path.read_text(encoding="utf-8"))
    else:
        report = {
            "model": args.model,
            "model_source": args.model_source,
            "model_revision": args.model_revision,
            "model_hash": local_model_hash(args.model),
            "task": task,
            "dataset_hash": f"sha256:{dataset_hash}",
            "dataset_counts": {key: len(value) for key, value in splits.items()},
            "mlx_lm_version": importlib.metadata.version("mlx-lm"),
            "python": sys.version,
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    if not args.skip_baseline:
        report["baseline"] = evaluate(args.model, splits["test"], task)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.baseline_only:
        report["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(report_path)
        return
    report["train_command"] = train(args, adapter_path)
    report["adapter"] = evaluate(args.model, splits["test"], task, adapter_path)
    report["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(report_path)


if __name__ == "__main__":
    main()
