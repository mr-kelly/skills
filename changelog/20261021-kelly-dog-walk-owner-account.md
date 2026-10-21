---
title: 2026-10-21 kelly-dog-walk — running on the owner's own account is a normal path
---

# kelly-dog-walk: running on the owner's own account is a normal path

Date: 2026-10-21
Author: AI Assistant
AI Agent: Claude

## Prompts & Instructions

**Original Request:**
> Buda 集成连接 busabase，auth_verify 显示 owner，对 kelly-dog-walk skill 不友好。技能写了「用你自己的成员账号跑脚本。管理员和所有者不受『限制访问』约束；用管理员的 key，权限这道闸门就是摆设」，auth_verify 返回当前成员的 role 是 owner，导致用户有疑问。要改这个 skill。

**Refined Instructions:**
- A Buda agent connects to Busabase with the user's own account, so `auth_verify` says `owner`. The
  skill must treat that as the normal case, not as a reason to stop or to ask for a second account.
- Keep the stricter member-account setup, but as an optional step, and say plainly what each path
  does and does not enforce.

## What Changed

- **Rule 5 of 先记住的五条** no longer says "use your own member account". It says the owner's account
  is fine and to carry on: `propose.mjs` always submits with `autoMerge: false`, and Busabase honours an
  explicit `false` even for owners (`shouldAutoMerge` in busabase-core), so a playbook change still
  waits for a person to merge it. The one difference is stated: owners bypass 限制访问, so the server
  does not stop a direct playbook or judge edit, and rules 3 and 4 are what hold the gate.
- **安装 step 3** (the agent's own member account and its five node grants) is now marked optional,
  with when to skip it (the agent runs on the owner's account, e.g. through Buda) and when to do it
  (a shared space, or showing the server itself refusing the agent).
- The intro's 权限就是闸门 became 合并这一步就是闸门, which is true on both paths; README says the same.
- `propose.mjs`: the ChangeRequest message no longer claims the agent "only has 可提交变更" (false on an
  owner key, and the owner reads that message in review). The `merged` warning no longer blames the
  credential — with `autoMerge: false` even an owner's request should not merge, so it now says to
  check which account and which Busabase version.
- `setup.mjs` prints the grant list as optional; `lib/busabase.mjs`, `weather.mjs` and the missing-env
  error accept either account.
- The folder's 这个文件夹怎么用 prompt asks what to watch for when the agent runs on my account and
  whether to open a member account, instead of assuming one.

## Why

- Course students and Buda users connect their own space, where they are the owner. The old rule told
  the agent its credentials were wrong, so it hesitated and the user did not know what to do.

## Files Affected

- `skills/kelly-dog-walk/SKILL.md` - intro, rule 5, 安装 steps 1/3/4, the `merged` note
- `skills/kelly-dog-walk/README.md` - the gate paragraph
- `skills/kelly-dog-walk/scripts/propose.mjs` - ChangeRequest message and `merged` warning
- `skills/kelly-dog-walk/scripts/setup.mjs` - grant list labelled optional
- `skills/kelly-dog-walk/scripts/lib/busabase.mjs` - header comment and missing-env error
- `skills/kelly-dog-walk/scripts/weather.mjs` - header comment
- `skills/kelly-dog-walk/scripts/sync-content.mjs`, `content/_folder.json` - the folder prompt (regenerated)

## Breaking Changes

- None. No behaviour changed; only what the skill and its scripts tell the agent and the owner.

## Testing

- `npm run test:app-skills:oss:kelly-dog-walk` against a real local Busabase 0.96.0. The OSS host's
  single local user is a space manager, i.e. exactly the owner-key path: every `propose.mjs` run stays
  pending until the test merges it as the human.
- `node scripts/sync-content.mjs --check`, `npm run lint`.
- A/B: two fresh agents, one on the old SKILL.md and one on the new, each told `auth_verify` returned
  `owner` inside Buda and asked to set today's walk.

## Follow-up Tasks (Optional)

- Spaces that already installed the template keep the old SKILL.md node until the template is
  reinstalled or the skill node is updated.
