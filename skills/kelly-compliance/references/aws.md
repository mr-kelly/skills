# Finite AWS reads

Use an existing local profile, never a browser key. Current authorization is independently checked through exact allow-account/allow-region/scope/scope-version. A saved row is not authorization. STS get-caller-identity binds the actual account first; foreign identity aborts. Example programs cannot run real AWS. One profile per run, at most 2 declared accounts, 5 regions and 500 observations; other accounts remain gaps.

Only these catalog calls exist: ec2 describe-security-groups; cloudtrail describe-trails; securityhub get-findings; rds describe-db-instances. No wildcard write permissions such as securityhub:* or config:* are requested. No assume-role, remediation, IAM change, automatic pagination, agent installation or paid service enable/configure calls.

Each execFile argument array has 30 s/4 MB bounds, no shell interpolation/prompt/pager. NextToken and RDS Marker generate explicit source pagination gaps. Missing permission/configuration is a gap, never a pass. CloudTrail configuration cannot establish actual/historical recording. Source account/region must agree with actual identity and selected region.

collectAws(options,{execAws}) accepts a fake dependency returning {stdout,stderr,code}. Synthetic tests do not verify live customer AWS permissions or account state.
