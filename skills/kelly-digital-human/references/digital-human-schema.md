# Kelly Digital Human Schema

Use this schema for local handoff files under `app/.data/`. The demo app can render without a local snapshot by using `app/server/demo.ts`, but production work should write the same shape to `digital_human_snapshot.json`.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-digital-human",
  "project": {
    "name": "AI Host Demo",
    "target_scene": "sales_demo",
    "recommended_path": "2d_fast",
    "readiness_score": 78,
    "verdict": "FIX"
  },
  "metrics": {
    "target_latency_ms": 850,
    "current_latency_ms": 620,
    "lip_sync_score": 92,
    "qa_passed": 6,
    "qa_total": 8
  },
  "personas": [
    {
      "id": "host-cn",
      "name": "Kelly AI Host",
      "path": "2d_fast",
      "language": "zh-CN",
      "voice": "warm product narrator",
      "look": "photoreal business presenter",
      "disclosure": "我是 AI 数字人助理"
    }
  ],
  "pipelines": [
    {
      "id": "silicon-2d",
      "path": "2d_fast",
      "label": "2D vendor stream",
      "provider": "existing digital-human service",
      "input": "text_or_audio_stream",
      "output": "lip_synced_video_stream",
      "latency_ms": 620,
      "status": "ready_for_demo"
    }
  ],
  "vendors": [
    {
      "id": "silicon-intelligence",
      "label": "Silicon Intelligence-style 2D service",
      "path": "2d_fast",
      "integration": "API/SDK, send text or audio, receive video stream",
      "speed": "fast",
      "control": "medium",
      "cost": "low_to_medium",
      "risk": "vendor lock-in and avatar licensing"
    }
  ],
  "qa_checks": [
    {
      "id": "lip-sync",
      "label": "Lip sync quality",
      "status": "pass",
      "owner": "product",
      "evidence": "demo script mouth timing looks natural"
    }
  ],
  "events": [
    {
      "at": "T+0.2s",
      "kind": "audio_chunk",
      "label": "voice stream accepted"
    }
  ]
}
```

## Decisions

`decisions.json` stores human review decisions from the QA gate:

```json
{
  "decisions": {
    "lip-sync": {
      "action": "approve",
      "note": "Looks launchable for demo",
      "decided_at": "ISO timestamp"
    }
  }
}
```

Allowed decision actions: `approve`, `request_changes`, `block`.

## Path Values

- `2d_fast`: low-cost photoreal 2D service integration.
- `3d_custom`: UE/Unity custom-rendered digital human.
- `hybrid`: 2D demo now, 3D brand asset later.

## Verdict Values

- `SHIP`: safe to show or launch for the declared scope.
- `FIX`: demo works but has specific blockers or polish tasks.
- `BLOCK`: do not show publicly until the issue is resolved.
