// Shared state loader. Factored out of app.js (unlike Kelly MV's single-file
// app.js, this skill keeps its original modular js/ split — see SKILL.md /
// the migration notes) so actions.js, settings.js, and app.js can all reload
// state after a write without an import cycle through app.js itself.
import { closeConnectGate } from "./connect-gate.js?v=0.1.0";
import { getProvider } from "./providers/index.js?v=0.1.0";
import { store } from "./store.js";

export async function loadState() {
  const provider = await getProvider();
  const [data, capabilities] = await Promise.all([
    provider.getState({ projectId: store.activeProjectId }),
    fetch("__kelly_drama/capabilities", { headers: { accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null),
  ]);
  data.capabilities = capabilities;
  closeConnectGate();
  store.state = data;
  window.dispatchEvent(new CustomEvent("kelly-drama:state", { detail: data }));
  return data;
}
