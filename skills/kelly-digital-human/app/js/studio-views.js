import {
  decisionFor,
  effectiveStatus,
  els,
  esc,
  filteredChecks,
  isLocked,
  isMobileLayout,
  lockBanner,
  noticeBanner,
  pathLabel,
  selectedCheck,
  state,
  statusClass,
  statusLabel,
  streamStore,
  submitDecision,
  t,
  updateMouth,
} from "../app.js";
export function renderReview() {
  const items = filteredChecks();
  const selected = selectedCheck();
  if (selected) state.selectedId = selected.id;
  els.title.textContent = t("reviewTitle");
  els.subtitle.textContent = t("reviewSubtitle");
  els.content.innerHTML = `
    ${noticeBanner()}
    ${lockBanner()}
    <div class="review-layout">
      <section class="list-panel">
        <div class="list-head">
          <div><h2>${t("review")}</h2><p class="muted">${items.length} ${t("all").toLowerCase()}</p></div>
        </div>
        <div class="review-list">
          ${
            items
              .map((check) => {
                const status = effectiveStatus(check);
                return `<button class="review-row ${check.id === state.selectedId ? "active" : ""}" type="button" data-select="${esc(check.id)}">
                  <span class="row-title">${esc(check.label)}</span>
                  <span class="row-meta">${esc(check.owner)} · ${esc(check.evidence)}</span>
                  <span class="status-badge ${statusClass(status)}">${statusLabel(status)}</span>
                </button>`;
              })
              .join("") || `<div class="empty">${t("empty")}</div>`
          }
        </div>
      </section>
      <aside class="detail-panel">
        ${selected ? renderCheckDetail(selected) : `<div class="empty">${t("empty")}</div>`}
      </aside>
    </div>
  `;
}

function renderCheckDetail(check) {
  const status = effectiveStatus(check);
  const decision = decisionFor(check.id);
  const edits = state.edits[check.id] || {};
  const note = edits.note ?? decision?.note ?? decision?.comment ?? "";
  return `<article class="detail-card" data-check="${esc(check.id)}">
    <button class="back-to-list" type="button" data-back>${state.lang === "zh" ? "返回列表" : "Back to list"}</button>
    <header class="detail-head">
      <div>
        <span class="eyebrow">${t("qa")}</span>
        <h2>${esc(check.label)}</h2>
        <p class="muted">${t("owner")}: ${esc(check.owner)}</p>
      </div>
      <span class="status-badge ${statusClass(status)}">${statusLabel(status)}</span>
    </header>
    <section class="detail-section">
      <h3>${t("evidence")}</h3>
      <p>${esc(check.evidence)}</p>
    </section>
    <section class="detail-section">
      <h3>${t("note")}</h3>
      <textarea data-field="note" rows="5" placeholder="${esc(t("notePlaceholder"))}">${esc(note)}</textarea>
    </section>
    <footer class="detail-actions">
      <button class="approve" type="button" data-action="approve" ${isLocked() ? "disabled" : ""}>${t("approve")}</button>
      <button type="button" data-action="request_changes" ${isLocked() ? "disabled" : ""}>${t("requestChanges")}</button>
      <button class="danger" type="button" data-action="block" ${isLocked() ? "disabled" : ""}>${t("block")}</button>
    </footer>
    ${
      decision
        ? `<div class="decision-log">${t("decision")}: ${esc(decision.action)} · ${esc(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</div>`
        : ""
    }
  </article>`;
}

export function renderStudio() {
  const snapshot = state.snapshot;
  const persona = snapshot.personas.find((item) => item.id === streamStore.currentPersona) || snapshot.personas[0];
  const pipeline = snapshot.pipelines.find((item) => item.id === streamStore.currentProvider) || snapshot.pipelines[0];
  const script =
    state.lang === "zh"
      ? "你好，我是 Kelly AI 数字人助理。今天我会用一个实时视频流，演示语音输入、唇形驱动、字幕、延迟监控和上线 QA 的完整闭环。"
      : "Hi, I am Kelly's AI digital host. This live stream shows voice input, lip sync, captions, latency monitoring, and the QA gate before launch.";
  els.title.textContent = t("studioTitle");
  els.subtitle.textContent = t("studioSubtitle");
  els.content.innerHTML = `
    <div class="studio-layout">
      <section class="video-stage">
        <div class="video-grid"></div>
        <div class="stage-hud">
          <span class="hud-chip">LIVE PREVIEW</span>
          <span class="hud-chip">${esc(pipeline.label)}</span>
          <span class="hud-chip">${pipeline.latency_ms}ms</span>
          <span class="spacer"></span>
          <span class="hud-chip">${streamStore.running ? "STREAMING" : "PAUSED"}</span>
        </div>
        <div class="avatar-wrap">
          <div class="avatar-glow"></div>
          <div class="avatar" id="avatar">
            <div class="torso"></div>
            <div class="neck"></div>
            <div class="hair"></div>
            <div class="head"></div>
            <div class="eye left"></div>
            <div class="eye right"></div>
            <div class="nose"></div>
            <div class="mouth" id="mouth"></div>
          </div>
        </div>
        <div class="subtitle">
          <canvas id="waveform" class="waveform" width="900" height="90"></canvas>
          <div class="subtitle-line">${esc(script)}</div>
        </div>
      </section>
      <aside class="studio-side">
        <section class="panel">
          <h2>${t("studio")}</h2>
          <p class="muted">${esc(persona.look)}</p>
        </section>
        <section class="panel control-stack">
          ${selectControl(
            t("persona"),
            "persona",
            snapshot.personas.map((item) => [item.id, item.name]),
          )}
          ${selectControl(
            t("providerMode"),
            "provider",
            snapshot.pipelines.map((item) => [item.id, item.label]),
          )}
          ${selectControl(t("inputMode"), "inputMode", [
            ["text", "Text to voice"],
            ["audio", "Voice stream"],
            ["llm", "LLM answer"],
          ])}
          <div class="control-row">
            <label>${t("script")}</label>
            <textarea rows="5">${esc(script)}</textarea>
          </div>
          <div class="button-row">
            <button class="approve" type="button" data-stream-action="start">${streamStore.running ? t("pause") : t("start")}</button>
            <button type="button" data-stream-action="reset">${t("reset")}</button>
          </div>
        </section>
        <section class="panel">
          <h2>${t("routeLatency")}</h2>
          ${pipeline.stages.map((stage, index) => `<div class="event-row"><span>${index + 1}. ${esc(stage)}</span><strong>${Math.round((pipeline.latency_ms / pipeline.stages.length) * (0.82 + index * 0.05))}ms</strong></div>`).join("")}
        </section>
        ${
          (snapshot.events || []).length
            ? `<section class="panel">
          <h2>${t("streamEvents")}</h2>
          ${(snapshot.events || [])
            .map(
              (event) =>
                `<div class="event-row"><span><span class="hud-chip">${esc(event.kind)}</span> ${esc(event.label)}</span><strong>${esc(event.at)}</strong></div>`,
            )
            .join("")}
        </section>`
            : ""
        }
      </aside>
    </div>
  `;
  streamStore.waveContext = document.querySelector("#waveform")?.getContext("2d") || null;
  updateMouth();
}

function selectControl(label, name, options) {
  return `<div class="control-row">
    <label>${esc(label)}</label>
    <select data-control="${esc(name)}">
      ${options.map(([value, optionLabel]) => `<option value="${esc(value)}" ${value === selectedValue(name) ? "selected" : ""}>${esc(optionLabel)}</option>`).join("")}
    </select>
  </div>`;
}

function selectedValue(name) {
  if (name === "persona") return streamStore.currentPersona;
  if (name === "provider") return streamStore.currentProvider;
  return "text";
}

export function renderVendors() {
  els.title.textContent = t("vendorsTitle");
  els.subtitle.textContent = t("vendorsSubtitle");
  els.content.innerHTML = `
    <div class="vendors-layout">
      <section class="panel">
        <table class="table">
          <thead>
            <tr>
              <th>Vendor / route</th>
              <th>${t("path")}</th>
              <th>${t("integration")}</th>
              <th>${t("speed")}</th>
              <th>${t("control")}</th>
              <th>${t("cost")}</th>
              <th>${t("risks")}</th>
            </tr>
          </thead>
          <tbody>
            ${state.snapshot.vendors
              .map(
                (vendor) => `<tr>
                  <td><strong>${esc(vendor.label)}</strong></td>
                  <td><span class="path-badge ${vendor.path === "2d_fast" ? "fast" : "custom"}">${pathLabel(vendor.path)}</span></td>
                  <td>${esc(vendor.integration)}</td>
                  <td>${esc(vendor.speed)}</td>
                  <td>${esc(vendor.control)}</td>
                  <td>${esc(vendor.cost)}</td>
                  <td>${esc(vendor.risk)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </section>
      <aside class="panel">
        <h2>${t("architecture")}</h2>
        <div class="architecture">
          ${[
            "Input stream",
            "Reasoning or script",
            "TTS / voice",
            "Avatar renderer",
            "RTC / web player",
            "QA and fallback",
          ]
            .map(
              (label, index) => `<div class="arch-node">
                <span class="node-index">${index + 1}</span>
                <div><strong>${esc(label)}</strong><p class="muted">${architectureCopy(index)}</p></div>
              </div>`,
            )
            .join("")}
        </div>
      </aside>
    </div>
  `;
}

function architectureCopy(index) {
  const copy = [
    "Text, TTS audio, uploaded audio, or live voice after approval.",
    "LLM answer, support macro, product script, or human-approved copy.",
    "Vendor voice, cloned voice with consent, or existing audio stream.",
    "2D service for speed; UE/Unity for custom brand character.",
    "Embed as live stream, clip, WebRTC track, or controlled demo player.",
    "Block unsafe claims, missing consent, stream failure, and bad lip sync.",
  ];
  return copy[index];
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  els.content.innerHTML = `
    <div class="settings-grid">
      <section class="panel">
        <h2>${t("configuration")}</h2>
        <dl class="settings-list">
          <dt>${t("dataProvider")}</dt><dd>local</dd>
          <dt>${t("handoffFiles")}</dt><dd>app/.data/digital_human_snapshot.json<br>app/.data/decisions.json<br>app/.data/agent.lock</dd>
          <dt>${t("currentPath")}</dt><dd>${pathLabel(state.snapshot.project.recommended_path)}</dd>
        </dl>
      </section>
      <section class="panel">
        <h2>${t("safety")}</h2>
        <ul class="safety-list">
          <li>No vendor API calls in demo mode.</li>
          <li>No camera or microphone access.</li>
          <li>No voice, likeness, or customer audio upload without explicit approval.</li>
          <li>Public demo requires QA gate approval.</li>
        </ul>
      </section>
    </div>
  `;
}

export function bindContentEvents() {
  document.querySelectorAll("[data-select]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.select;
      if (isMobileLayout()) document.body.classList.add("mobile-detail-open");
      renderReview();
    });
  });
  document.querySelector("[data-back]")?.addEventListener("click", () => {
    document.body.classList.remove("mobile-detail-open");
  });
  document.querySelectorAll("[data-field]").forEach((field) => {
    field.addEventListener("input", () => {
      const card = field.closest("[data-check]");
      state.edits[card.dataset.check] = { ...state.edits[card.dataset.check], [field.dataset.field]: field.value };
    });
  });
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest("[data-check]");
      submitDecision(card.dataset.check, button.dataset.action, card);
    });
  });
  document.querySelector('[data-control="persona"]')?.addEventListener("change", (event) => {
    streamStore.currentPersona = event.target.value;
    renderStudio();
  });
  document.querySelector('[data-control="provider"]')?.addEventListener("change", (event) => {
    streamStore.currentProvider = event.target.value;
    renderStudio();
  });
  document.querySelector('[data-stream-action="start"]')?.addEventListener("click", () => {
    streamStore.running = !streamStore.running;
    renderStudio();
  });
  document.querySelector('[data-stream-action="reset"]')?.addEventListener("click", () => {
    streamStore.audioLevel = 0.24;
    streamStore.running = true;
    renderStudio();
  });
}
