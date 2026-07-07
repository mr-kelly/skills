# Kelly Digital Human

Digital-human implementation and demo desk for choosing between a fast 2D service integration and a high-control 3D UE/Unity build.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.png" alt="Kelly Digital Human overview"></td>
    <td width="50%"><img src="assets/screenshots/studio.png" alt="Kelly Digital Human live studio"></td>
  </tr>
  <tr>
    <td><strong>Solution overview</strong><br>Side-by-side 2D fast-launch and 3D custom-build paths, with readiness score, latency targets, and launch blockers.</td>
    <td><strong>Multimodal studio</strong><br>Animated avatar stream with lip motion, waveform, transcript, provider mode, route latency, and stream events.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/vendors.png" alt="Kelly Digital Human vendor architecture"></td>
    <td width="50%"><img src="assets/screenshots/qa.png" alt="Kelly Digital Human QA gate"></td>
  </tr>
  <tr>
    <td><strong>Vendor and architecture desk</strong><br>Compares 2D service integration, real-time RTC rendering, and UE/Unity 3D architecture with cost, speed, and control tradeoffs.</td>
    <td><strong>Launch QA gate</strong><br>Checks lip sync, stream latency, consent, script safety, fallback behavior, and production handoff state before launch.</td>
  </tr>
</table>

## Run

```bash
skills/kelly-digital-human/app/start.sh
```

Views: overview, studio, vendors, and QA. Demo mode is local and deterministic; it does not call external digital-human providers or engines.
