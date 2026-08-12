# Sales Outreach Research Playbook

Use this method for every `/kelly-sales-outreach research` round.

## 1. Form a testable ICP

Start from the stored offer. Separate user facts from Agent hypotheses. Write a
short hypothesis covering:

- company size/stage and geography;
- industries or business models;
- buyer and champion roles;
- operational pain the offer can solve;
- observable trigger that makes timing plausible;
- exclusions that prevent false positives.

If proof is weak, lower confidence rather than inventing customer outcomes.

## 2. Search for signals

Prefer sources in this order:

1. Company website, newsroom, jobs, documentation, case studies, filings.
2. Public trade associations, event/exhibitor lists, official directories.
3. Reputable news and public market signals.

Useful signals include hiring for the affected workflow, a new location/team,
funding, regulatory pressure, a product launch, service incidents, new tooling,
or explicit strategic priorities. “This company is in the industry” is not a
pain signal.

Stay within public access. Do not bypass controls, use stolen credentials,
purchase lists, or automate against a site that forbids it.

## 3. Score consistently

Use a 100-point model and state uncertainty:

- 30 points: pain/use-case fit;
- 20 points: observable timing signal;
- 20 points: company size/stage fit;
- 15 points: reachable buyer role;
- 10 points: region/delivery fit;
- 5 points: strength/freshness of evidence.

Scores above 85 should be rare and supported by first-party evidence. A high
score never compensates for missing provenance.

Evidence types:

| Type | Meaning |
| --- | --- |
| `first-party` | The company itself published the fact. |
| `public-directory` | A reputable public directory or event/association source. |
| `market-signal` | News or another public signal supporting a timing hypothesis. |

## 4. Find a public business contact

Seek the buying function, not just any inbox. Prefer an official contact page,
public team page, event speaker profile, association listing, or business social
profile that visibly prints the address.

Never infer `first.last@domain`, use enrichment data without lawful provenance,
or treat a guessed address as low confidence. No source means no import.

## 5. Draft one first touch

Keep plain text concise:

1. One sentence naming the observed company signal.
2. One sentence connecting that signal to the offer.
3. One factual proof point, only if stored in the profile.
4. One low-friction next step.
5. A truthful identity and opt-out-respecting tone.

Avoid fake familiarity, “I noticed” claims without a source, generic praise,
tracking pixels, manipulative urgency, or attachments the user did not approve.

## 6. Import and review

Create a JSON document with `companies` and `leads` arrays matching
`sales-outreach-schema.md`. Run the dry import first. Fix every rejected missing
source rather than weakening validation.

Research in 20-30 account rounds. A bounded queue gets reviewed; an unbounded
list becomes spam inventory.

## 7. Learn from outcomes

When outcomes exist, compare reply/meeting/opt-out patterns by ICP attributes,
evidence type, buyer role, and message angle. Treat the result as a proposal to
change the next research round, not an automatic rewrite of production rules.
