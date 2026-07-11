const copy = {
  en: {
    title: "Set up this app",
    intro: "Choose where this workflow stores its local handoff state.",
    provider: "Data provider",
    local: "Local files",
    localHint: "Private, offline-friendly JSON files on this machine.",
    busabase: "Busabase",
    busabaseHint: "Shared Base records, Drive state, and Vault secret references.",
    hosted: "Hosted",
    selfHosted: "Self-hosted",
    baseUrl: "Base URL",
    spaceId: "Space ID",
    secret: "API key readiness",
    ready: "Ready",
    missing: "Missing",
    continue: "Continue",
    copy: "Copy agent prompt",
    copied: "Copied",
    prompt: "Suggested agent prompt",
    error: "Setup could not be saved.",
    loading: "Checking setup...",
  },
  zh: {
    title: "设置此应用",
    intro: "选择此工作流保存本地交接状态的位置。",
    provider: "数据提供方",
    local: "本地文件",
    localHint: "仅在本机保存、适合离线使用的 JSON 文件。",
    busabase: "Busabase",
    busabaseHint: "使用共享 Base 记录、Drive 状态与 Vault 密钥引用。",
    hosted: "托管版",
    selfHosted: "自托管",
    baseUrl: "基础 URL",
    spaceId: "Space ID",
    secret: "API Key 就绪状态",
    ready: "已就绪",
    missing: "缺失",
    continue: "继续",
    copy: "复制给 Agent 的提示",
    copied: "已复制",
    prompt: "建议 Agent 提示",
    error: "无法保存设置。",
    loading: "正在检查设置...",
  },
};

const params = new URLSearchParams(location.search);
if (!params.has("demo")) {
  const root = document.createElement("div");
  root.id = "ksSetupGate";
  root.className = "ks-setup-overlay";
  root.innerHTML =
    '<section class="ks-setup-panel" role="dialog" aria-modal="true" aria-labelledby="ksSetupTitle"><header class="ks-setup-head"><div><h1 id="ksSetupTitle"></h1><p id="ksSetupIntro"></p></div><select id="ksSetupLanguage" aria-label="Language"><option value="auto">Auto</option><option value="en">English</option><option value="zh">中文</option></select></header><div id="ksSetupBody" class="ks-setup-body"><p class="ks-setup-loading"></p></div><footer class="ks-setup-footer"><button id="ksSetupCopy" type="button"></button><button id="ksSetupContinue" class="ks-setup-primary" type="button"></button></footer></section>';
  document.documentElement.classList.add("ks-setup-active");
  document.body.prepend(root);

  const languageSelect = root.querySelector("#ksSetupLanguage");
  const body = root.querySelector("#ksSetupBody");
  const continueButton = root.querySelector("#ksSetupContinue");
  const copyButton = root.querySelector("#ksSetupCopy");
  let setup = null;
  let provider = "local";
  let language = localStorage.getItem("kelly-ui-language") || "auto";

  function resolvedLanguage() {
    return language === "auto" ? (navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en") : language;
  }

  function t(key) {
    return copy[resolvedLanguage()][key] || copy.en[key] || key;
  }

  function promptText() {
    const name = document.title || "this App-in-Skill";
    if (!setup?.provider_selected)
      return `Help me configure ${name}. Start by helping me choose local or Busabase storage. Do not ask me to paste passwords, API keys, tokens, or cookies into chat.`;
    if (provider === "busabase")
      return `Help me configure ${name} in Busabase provider mode. Store non-secret config in ${setup.recommended_config}. Put secret values in Vault or ${setup.recommended_env}; never ask me to paste them into chat. Missing secret references: ${(setup.missing_env || []).join(", ") || "none"}.`;
    return `Help me configure ${name} in local provider mode. Store non-secret config in ${setup.recommended_config} and secrets in ${setup.recommended_env}. Never ask me to paste secret values into chat.`;
  }

  function render() {
    root.querySelector("#ksSetupTitle").textContent = t("title");
    root.querySelector("#ksSetupIntro").textContent = t("intro");
    continueButton.textContent = t("continue");
    copyButton.textContent = t("copy");
    if (!setup) {
      body.innerHTML = `<p class="ks-setup-loading">${t("loading")}</p>`;
      return;
    }
    const b = setup.busabase || {};
    body.innerHTML = `<h2>${t("provider")}</h2><div class="ks-provider-grid"><button type="button" class="ks-provider-card ${provider === "local" ? "is-selected" : ""}" data-provider="local"><strong>${t("local")}</strong><span>${t("localHint")}</span></button>${setup.has_busabase ? `<button type="button" class="ks-provider-card ${provider === "busabase" ? "is-selected" : ""}" data-provider="busabase"><strong>${t("busabase")}</strong><span>${t("busabaseHint")}</span></button>` : ""}</div>${provider === "busabase" ? `<div class="ks-busabase-fields"><div class="ks-hosting-choice"><label><input type="radio" name="ksHosting" value="hosted" ${b.hosting !== "self_hosted" ? "checked" : ""}> ${t("hosted")}</label><label><input type="radio" name="ksHosting" value="self_hosted" ${b.hosting === "self_hosted" ? "checked" : ""}> ${t("selfHosted")}</label></div><label>${t("baseUrl")}<input id="ksBaseUrl" type="url" value="${escapeHtml(b.base_url || "")}" placeholder="http://127.0.0.1:15419"></label><label id="ksSpaceRow">${t("spaceId")}<input id="ksSpaceId" value="${escapeHtml(b.space_id || "")}"></label><div id="ksSecretRow" class="ks-secret-row"><span><strong>${t("secret")}</strong><small>${escapeHtml(b.api_key_env || "")}</small></span><span class="ks-ready-pill ${b.api_key_configured ? "is-ready" : ""}">${b.api_key_configured ? t("ready") : t("missing")}</span></div></div>` : ""}<section class="ks-prompt"><strong>${t("prompt")}</strong><pre>${escapeHtml(promptText())}</pre></section><p id="ksSetupError" class="ks-setup-error" hidden></p>`;
    body.querySelectorAll("[data-provider]").forEach((button) =>
      button.addEventListener("click", () => {
        provider = button.dataset.provider;
        render();
      }),
    );
    body
      .querySelectorAll('input[name="ksHosting"]')
      .forEach((input) => input.addEventListener("change", renderHosting));
    renderHosting();
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"]/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
    );
  }

  function renderHosting() {
    const hosting = body.querySelector('input[name="ksHosting"]:checked')?.value || "hosted";
    const space = body.querySelector("#ksSpaceRow");
    const secret = body.querySelector("#ksSecretRow");
    if (space) space.hidden = hosting === "self_hosted";
    if (secret) secret.hidden = hosting === "self_hosted";
  }

  languageSelect.value = language;
  languageSelect.addEventListener("change", () => {
    language = languageSelect.value;
    localStorage.setItem("kelly-ui-language", language);
    const appLanguage = document.querySelector("#language");
    if (appLanguage) {
      appLanguage.value = language;
      appLanguage.dispatchEvent(new Event("change", { bubbles: true }));
    }
    render();
  });

  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(promptText());
    copyButton.textContent = t("copied");
    setTimeout(() => {
      copyButton.textContent = t("copy");
    }, 1200);
  });

  continueButton.addEventListener("click", async () => {
    continueButton.disabled = true;
    const hosting = body.querySelector('input[name="ksHosting"]:checked')?.value || "hosted";
    const payload = {
      provider,
      hosting,
      base_url: body.querySelector("#ksBaseUrl")?.value || "",
      space_id: body.querySelector("#ksSpaceId")?.value || "",
    };
    try {
      const response = await fetch("/api/setup/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("error"));
      if (result.setup?.state === "ready") location.reload();
      setup = result.setup;
      provider = setup.provider;
      render();
    } catch (error) {
      const node = body.querySelector("#ksSetupError");
      node.hidden = false;
      node.textContent = error instanceof Error ? error.message : t("error");
    } finally {
      continueButton.disabled = false;
    }
  });

  fetch("/api/setup")
    .then(async (response) => {
      if (!response.ok) throw new Error(t("error"));
      const result = await response.json();
      setup = result.setup;
      provider = setup.provider || "local";
      if (setup.state === "ready") {
        root.remove();
        document.documentElement.classList.remove("ks-setup-active");
        return;
      }
      render();
    })
    .catch((error) => {
      setup = { provider_selected: false, has_busabase: false };
      render();
      const node = body.querySelector("#ksSetupError");
      if (node) {
        node.hidden = false;
        node.textContent = error.message;
      }
    });
}
