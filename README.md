# mr-kelly/skills

Local Claude Code marketplace with skills at the repo root.

## Install

Recommended for multiple AI coding agents (via `npx skills`):

```
npx skills add mr-kelly/skills
```

In Claude Code:

```
/plugin marketplace add mr-kelly/skills
/plugin install mr-kelly-skills
```

## Layout

- `.claude-plugin/marketplace.json` defines the marketplace and plugin.
- `skills/` contains skill folders (each with a `SKILL.md`).

## Skills

- `agent-rules` - Single source of truth for agent rules and skills via symlinks.
