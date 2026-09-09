const MAX_PROMPT_LENGTH = 4000;

export function requestAgentAction({ requestId, label, prompt }) {
  const cleanId = String(requestId || "").trim();
  const cleanPrompt = String(prompt || "").trim();
  if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(cleanId) || !cleanPrompt || cleanPrompt.length > MAX_PROMPT_LENGTH) {
    return false;
  }
  if (window.parent === window) return false;
  window.parent.postMessage(
    {
      type: "buda:agent-action-request",
      version: 1,
      requestId: cleanId,
      label: String(label || "").slice(0, 120),
      prompt: cleanPrompt,
    },
    "*",
  );
  return true;
}

export function generationAgentPrompt({ projectId, kind, targetId }) {
  const selector = kind === "card" || kind === "voice" ? `--character ${targetId}` : `--shot ${targetId}`;
  return `Use $kelly-drama for project ${projectId}. Run the trusted generation dispatcher for this exact request: node scripts/execute_generation_requests.mjs --apply --kind ${kind} ${selector}. Report the generated asset or the actionable failure reason, then refresh the Kelly Drama UI.`;
}

export function episodeRenderAgentPrompt({ projectId, episodeId }) {
  return `Use $kelly-drama to assemble the approved shots for project ${projectId}, episode ${episodeId}. Run: node scripts/render_episode.mjs --project ${projectId} --episode ${episodeId} --apply. Verify duration, audio stream, subtitle sidecar, and Busabase Asset readback, then refresh the Kelly Drama UI.`;
}

export function generationCapability(capabilities, kind) {
  if (!capabilities) return { available: true, reason: "" };
  if (kind === "image" || kind === "card") {
    const capability = capabilities.providers?.image || { available: false };
    return { ...capability, reason_key: capability.available ? "" : "capability_image_missing" };
  }
  if (kind === "voice") {
    const providers = capabilities.providers || {};
    const available = providers.qwen_tts?.available || providers.api_tts?.available;
    return {
      available: Boolean(available),
      reason: available
        ? "A TTS provider is available."
        : [providers.qwen_tts?.reason, providers.api_tts?.reason].filter(Boolean).join(" "),
      reason_key: available ? "" : "capability_voice_missing",
    };
  }
  if (kind === "video") {
    const providers = capabilities.providers || {};
    const available = providers.seedance?.available || providers.minimax_h3?.available || providers.ltx?.available;
    return {
      available: Boolean(available),
      reason: available
        ? "A video provider is available."
        : [providers.seedance?.reason, providers.minimax_h3?.reason, providers.ltx?.reason].filter(Boolean).join(" "),
      reason_key: available ? "" : "capability_video_missing",
    };
  }
  return { available: true, reason: "" };
}

export function preferredVideoBackend(capabilities, configured = "") {
  const providers = capabilities?.providers || {};
  if (/h3/i.test(configured) && providers.minimax_h3?.available) return "minimax-h3";
  if (/ltx/i.test(configured) && providers.ltx?.available) return "ltx";
  if (/seedance|ark/i.test(configured) && providers.seedance?.available) return "seedance";
  if (providers.minimax_h3?.available) return "minimax-h3";
  if (providers.seedance?.available) return "seedance";
  if (providers.ltx?.available) return "ltx";
  return "seedance";
}
