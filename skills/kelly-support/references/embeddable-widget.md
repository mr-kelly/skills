# Embeddable visitor widget (future extension — not built)

kelly-support is the **operator desk**: the agent triages and drafts, the human reviews and approves, and everything is gated before it reaches a customer. A visitor-facing chat bubble — the little "Chat with us" button a customer clicks on a marketing site — is a **separate, future** surface. This note records the intended approach so the desk stays self-contained today and the widget can be added later without reshaping the schema.

Do NOT build the widget as part of the desk. The desk must remain independently runnable with the five configured channels; `webchat_widget` today means transcripts are ingested, not that a live bubble is hosted.

## The idea

A one-line embed a customer's website owner drops onto their pages:

```html
<script src="https://widget.example.com/support.js" data-account="webchat" async></script>
```

The script mounts a shadow-DOM chat bubble that talks to a small public **widget gateway** (a distinct service — never the operator desk directly). The gateway:

1. Opens a **cross-origin visitor session** (an anonymous, short-lived session id in a first-party cookie or `localStorage`), rate-limited and origin-checked against an allowlist of the account's domains. No operator credentials or KB internals ever reach the browser.
2. Turns each visitor message into a **ticket** on the same channel (`channel: "webchat"`, `connector: "webchat_widget"`), writing through the **same data-provider seam** the desk uses (`createProvider()` → `queueReply` / snapshot ingest). The gateway is a provider client, so local and Busabase backends both work unchanged.
3. Streams back only what the desk has cleared: an agent draft is never auto-sent — it still passes `support-qa` and a human decision. An auto-reply is possible only for `SHIP` macros the operator has pre-approved for automation; refunds, commitments, and anything the gate would `BLOCK` are always held.

## Why it is out of scope now

- It needs a public, authenticated gateway with abuse protection — a network surface the desk deliberately does not have (the desk is `127.0.0.1`-only).
- It needs a hosted, versioned JS bundle and a CSP/origin policy per customer domain.
- The review/approval and gate semantics are identical to the desk's, so nothing in `references/support-schema.md` changes — a `webchat` ticket from the widget looks exactly like one ingested today. That is the point: the widget is an additional intake, not a new model.

## What already supports it

- `channel: "webchat"` and `connector: "webchat_widget"` are first-class in the schema and config today; the desk renders and reviews such tickets already.
- `provider_conversation_id` uses `wc:<session>` for web-chat targets, which maps cleanly onto a visitor session id.
- The data-provider interface (`queueReply`, `decideApproval`, snapshot ingest) is the exact write path a gateway would call.

When the widget is built, it is a new package (a gateway service + a bundled `support.js`), not a change to this desk.
