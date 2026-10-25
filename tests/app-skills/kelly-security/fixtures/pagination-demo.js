// Appended to the Demo module by ui_test.py in an isolated browser context.
// These are synthetic records with the same bare relation-id shape as live data.
for (let index = 2; index < 6; index++) {
  let host = data.hosts[index];
  let run = data.runs[index];
  if (!host) {
    host = row("hosts", `fleet${index}`, {
      title: `Lab fleet ${index + 1}`,
      "ssh-alias": `lab-fleet-${index + 1}`,
      role: "Synthetic pagination fixture",
      summary: "no-indicators",
      "is-example": true,
    });
    data.hosts.push(host);
    run = row("runs", `fleet${index}`, {
      title: `Lab fleet ${index + 1} · fixture investigation`,
      host: host.id,
      "scope-reference": "Synthetic fixture only",
      "window-start": "2026-10-19T00:00:00Z",
      "window-end": "2026-10-26T07:00:00Z",
      "check-profile": "intrusion-triage",
      "batch-reference": "demo-batch",
      status: "completed",
      "requested-at": "2026-10-26T06:00:00Z",
      "is-example": true,
    });
    data.runs.push(run);
  }
  for (const [checkIndex, check] of appConfig.checks.entries()) {
    data.checks.push(
      row("checks", `fleet${index}x${checkIndex}`, {
        title: check.name,
        run: run.id,
        "run-reference": run.id,
        "check-id": check.id,
        attempt: 1,
        status: "completed",
        conclusion: "no-indicators",
        "observed-at": "2026-10-26T06:25:00Z",
        "coverage-note": "",
        summary: `Synthetic result for Lab fleet ${index + 1}`,
      }),
    );
  }
}

globalThis.__kellyDemoReads = [];
const originalFixturePage = demoProvider.page;
demoProvider.page = async (key, options = {}) => {
  globalThis.__kellyDemoReads.push({ key, cursor: options.cursor ?? null });
  return originalFixturePage(key, options);
};
