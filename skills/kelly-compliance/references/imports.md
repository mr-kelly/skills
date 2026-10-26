# Import contracts

Normalized JSON:

```json
{"format":"kelly-compliance-report@1","producer":"Existing scanner export","frameworkVersion":"kelly-soc2-readiness@1","scopeVersion":1,"rows":[{"key":"sg-1","title":"Public SSH","provider":"aws","account":"111111111111","region":"us-east-1","resourceKey":"sg-prod","resourceType":"security-group","checkId":"network-public-admin","status":"fail","observedAt":"2026-09-30T12:00:00Z","evidenceMode":"snapshot","sourceLocator":"private:exports/q3.json#sg-1","summary":"TCP 22 is open to 0.0.0.0/0."}]}
```

Require 1–500 unique rows and max 2 MB per CLI/UI import. Status: pass/fail/manual/unknown. All times need an explicit timezone. Period evidence requires coverageStart/end. Exact framework, scope version, account and region must agree with the selected program. Unknown check aliases remain unmapped.

Prowler accepts existing CheckID/Status arrays with CheckTitle, AWSAccountId/AccountId, Region, ResourceId, Timestamp/UpdatedAt and StatusExtended/Description. Security Hub accepts existing Findings ASFF SchemaVersion 2018-10-08, Resources, AwsAccountId, Region, Compliance and UpdatedAt/CreatedAt. Neither adapter executes a scanner or enables services.

GitHub: {format:"kelly-github-change-evidence@1",changes:[{repository,number,organization,author,commitId,mergedAt,deployedAt,reviews:[{reviewer,submittedAt,state,commitId,dismissed}],checks:[{commitId,conclusion,completedAt}]}]}. Only the latest pre-merge review per reviewer counts: non-author, non-dismissed APPROVED for the merged commit. All required checks must succeed on that commit before merge, with merge before deployment. A PR interval never proves a full reporting period.

addEvidence requires title/account/region/resourceKey/checkId/sourceLocator/summary/observedAt/collectedAt/evidenceMode/technicalResult. requirementKey defaults checkId and must match the selected control's evidence-requirements. Period mode requires coverageStart/end. Optional sha256 is the private source hash; without it the hash covers the supplied summary only. Each mapping starts pending.

Collection cannot precede observation or be in the future; coverage-end cannot exceed observation. Authentic historical records collected later can support the true past interval with independent applicability review. No fabricated history or backdated approvals. Every control dimension is reviewed independently; identity snapshots do not prove offboarding, backups do not prove restoration.
