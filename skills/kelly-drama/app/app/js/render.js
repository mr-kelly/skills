import { updateChrome } from "./chrome.js";
import { renderEpisodesWorkspace } from "./episodes.js";
import { renderListAndDetail } from "./list-detail.js";
import { renderOverview } from "./overview.js";
import { store } from "./store.js";

export function render() {
  if (!store.state) return;
  updateChrome();
  if (store.view === "overview") renderOverview();
  else if (store.view === "episodes") renderEpisodesWorkspace();
  else renderListAndDetail();
}
