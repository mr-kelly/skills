# Kelly PR Review UI

Local file-only approval desk for GitHub pull request reviews.

The UI does not call GitHub. It reads:

```text
app/.cache/current_batch.json
```

and writes:

```text
app/.cache/decisions.json
```

Ask `/kelly-pr-review` or run the scripts to generate and execute batches. Execution uses `gh pr review` only after approved decisions are present.
