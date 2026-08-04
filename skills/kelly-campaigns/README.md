# Kelly Campaigns

Kelly Campaigns is a Busabase-backed App-in-Skill desk for **outbound email marketing**: building segments, drafting campaigns / newsletters / sequences, running pre-send deliverability and subject-line QA, and approving every send before it is scheduled. It is structured around the **SEND** discipline — Setup, Engage, Nurture, Deliver — with an `email-quality-auditor` gate that scores each send (EQS) and returns **SHIP / FIX / BLOCK**.

This is outbound marketing to a subscriber list — distinct from `kelly-email`, which triages an incoming inbox.

## What It Shows

- **Overview**: upcoming sends, list health (subscribers, bounce/complaint/churn rates, avg open/click), and a SEND-phase breakdown.
- **Campaigns**: the review queue of drafted sends with type + phase + quality-gate badges, segment and audience size, deliverability risk, an editable body draft, an A/B subject picker, review notes, and Approve / Request changes / Block decisions that write straight to Busabase.
- **Deliverability**: a pre-send QA table — SPF/DKIM/DMARC, spam score, inbox readiness, and the SEND verdict per send — plus the read-only consent/suppression list.
- **Performance**: open / click / unsub / bounce by sent campaign.
- The AirApp never sends anything. Approved sends are scheduled by the skill through the configured ESP only after explicit approval, and a BLOCK verdict (or high deliverability risk) is a hard stop.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Campaigns overview"></td>
    <td width="50%"><img src="assets/screenshots/campaigns.webp" alt="Kelly Campaigns queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Send calendar plus list health — subscribers, bounce, churn, and complaint rates.</td>
    <td><strong>Campaigns</strong><br>Draft and approval queue across campaigns, newsletters, and sequence steps.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/deliverability.webp" alt="Kelly Campaigns deliverability QA"></td>
    <td width="50%"><img src="assets/screenshots/performance.webp" alt="Kelly Campaigns performance"></td>
  </tr>
  <tr>
    <td><strong>Deliverability</strong><br>Pre-send QA — SPF/DKIM/DMARC, spam score, and the EQS SHIP/FIX/BLOCK gate.</td>
    <td><strong>Performance</strong><br>Open, click, and unsubscribe rates by campaign.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir app install
pnpm --dir app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see a mock program ("Northwind Coffee") without a
Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=campaigns&lang=en#/campaigns
/?demo=deliverability&lang=en#/deliverability
/?demo=performance&lang=en#/performance
/?demo=detail&lang=en#/campaigns/send-summer-launch
```

Demo mode never reads or writes Busabase.

## Data

All state — segments, sends, the consent/suppression list, and the
operator/brand/ESP profile — lives in four Busabase Bases under one
application Folder. See `SKILL.md` and `references/campaigns-schema.md` for
the resource map. `scripts/execute_decisions.mjs` is the trusted process
that hands off an approved send's status; it connects with
`BUSABASE_BASE_URL` / `BUSABASE_API_KEY` / `BUSABASE_SPACE_ID` and performs
no ESP call or send itself.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
