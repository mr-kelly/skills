# Owned resource map

Canonical declaration: content/kelly-compliance-app/app/js/config.js. Eight Bases are programs (scope), resources (asset × check), controls (requirements/owner/frequency), assessments (immutable scope/run state), evidence (source/hash/observed/collected/covered times), evidence-links (independent mapping review), issues (owner/due/new evidence verification), exceptions (risk/compensation/owner/expiry).

Exact text indexes program-reference/control-reference/evidence-reference/assessment-reference support valueFilters; every returned record must also match its true relations. Scalar fields precede relation fields. Runtime binding uses appId, resourceKey and schemaVersion; app-root is the Folder key. No deployment IDs are distributed. Each native table View/Base, Folder/manual/guide/Drive/AirApp has actionable scenario prompts.

UI reads one page of 50 per resource/action and calls totals current loaded scope. Next pages require user action. Only explicit report export walks pages with a global budget, progress callback and cancellation signal. ChangeRequest outcomes must be saved and refetched before dependent actions proceed.
