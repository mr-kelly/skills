---
name: kelly-llm-fine-tune
description: Curate high-quality domain instruction datasets, RLHF alignment rankings, and LLM benchmark scorecards.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# LLM Fine-Tuning & Model Evaluation Desk

Operate and manage llm fine-tuning & model evaluation desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
