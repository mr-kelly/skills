# Outline JSON Schema

`scripts/propose_video.ts` consumes a JSON file shaped like this:

```json
{
  "title": "视频4：……",
  "series": "aicoder",
  "purpose": "一句话主题",
  "hook": "10-15秒钩子台词",
  "pain_point": "痛点场景描述",
  "concept": "核心概念/产品揭晓",
  "verified_claims": "| 原草稿说法 | 核实结果 |\n| --- | --- |\n| ... | ... |",
  "owner": "kelly",
  "shots": [
    {
      "timecode": "0:00-0:05",
      "scene": "画面描述",
      "code_reference": "src/path/to/file.tsx",
      "script_line": "剧本台词",
      "note": "备注/纠正说明"
    }
  ]
}
```

Field notes:

- `series` must match an existing choice in the `videos.series` select field, or a new
  choice needs to be added first (`bases/{baseId}/fields/change-requests` PATCH on the
  `series` field, `options.choices`).
- `verified_claims` is a markdown table — always fill this in only *after* running the
  claim-verification workflow (see `references/claim-verification.md`), never invent it.
- `shots[].code_reference` should be a real file path/route when the shot demos an actual
  product surface, or `"—"` when it's a pure narrative/graphic beat with nothing to cite.
- Every shot gets `recording-status: "pending"` on creation.

## Series opening convention

Every video's `hook` + `pain_point` together are the cold open, and per the series
convention established 2026-07-11: keep it to **10–15 seconds of spoken content**, pure
pain point, no product name mentioned yet. The product reveal (`concept`) is a separate
beat that follows the hook, never folds into it.
