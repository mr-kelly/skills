// Thin entry point: every real implementation lives under ./js/*.js as plain
// ES modules (no build step, no framework — see app-in-skill-creator's
// runtime-architecture.md). This file only wires the modules together and
// bootstraps the page.
import { toast } from "./js/api.js";
import { activeHelpTab, closeHelp, isHelpOpen, openHelp, setHelpTab } from "./js/help-modal.js";
import { applyTranslations, onLanguageChange, setLanguageMode, t } from "./js/i18n.js";
import { decide, refresh, renderBulkActions, renderCounts, renderDetail, renderList } from "./js/list-detail.js";
import { applyRouteFromHash, navigateTo, registerRouterHooks, syncRoute } from "./js/router.js";
import {
  applyProviderGate,
  autosaveBusabaseConfig,
  backFromBusabaseStep,
  confirmProviderChoice,
  continueFromBusabaseStep,
  copySetupPrompt,
  goToBusabaseStep,
  registerSetupHooks,
  returnToChooseStep,
  scheduleBusabaseAutosave,
  selectProviderDraft,
  updateBusabaseFormVisibility,
} from "./js/setup.js";
import {
  applyLockState,
  closeDetailActionMenu,
  isLocked,
  isMobileLayout,
  pollLock,
  setMobileDetailOpen,
  setMobileSidebarOpen,
  syncModeButtons,
  syncResponsiveShell,
  toggleSidebar,
} from "./js/shell.js";
import { $, store } from "./js/store.js";

// --- Wire up the circular edges between modules (see each module's own
// comments for why): setup.js and router.js need the real refresh(), and
// router.js also needs the real Help modal + shell functions. ---
registerSetupHooks({ refresh });
registerRouterHooks({
  isHelpOpen,
  openHelp,
  closeHelp,
  activeHelpTab,
  syncModeButtons,
  isMobileLayout,
  setMobileDetailOpen,
});
onLanguageChange(() => {
  renderCounts();
  renderList();
  renderDetail();
  applyProviderGate();
  applyLockState();
});

function wire() {
  $("helpButton").onclick = () => openHelp();
  $("mobileHelpButton").onclick = () => openHelp();
  $("providerGateHelpButton").onclick = () => openHelp("config");
  $("setupChooseLocal").onclick = () => selectProviderDraft("local");
  $("setupChooseBusabase").onclick = () => selectProviderDraft("busabase");
  $("setupChooseNextButton").onclick = confirmProviderChoice;
  $("busabaseBackButton").onclick = backFromBusabaseStep;
  $("busabaseContinueButton").onclick = continueFromBusabaseStep;
  $("busabaseReconfigureButton").onclick = goToBusabaseStep;
  $("setupChangeProviderButton").onclick = returnToChooseStep;
  $("busabaseHostingOptions").addEventListener("change", (event) => {
    if (!event.target.matches("[data-busabase-hosting]")) return;
    updateBusabaseFormVisibility();
    autosaveBusabaseConfig();
  });
  for (const id of ["busabaseBaseUrlInput", "busabaseSpaceIdInput"]) {
    $(id)?.addEventListener("input", scheduleBusabaseAutosave);
  }
  $("setupCopyPrompt").onclick = copySetupPrompt;
  $("closeHelp").onclick = () => closeHelp();
  $("helpModal").addEventListener("click", (event) => {
    if (event.target.id === "helpModal") closeHelp();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isHelpOpen()) closeHelp();
    if (event.key === "Escape") closeDetailActionMenu();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".action-cluster")) closeDetailActionMenu();
    const option = event.target.closest?.("[data-ui-language-option]");
    if (option && !(event.target instanceof HTMLInputElement && event.target.matches("[data-ui-language]"))) {
      const input = option.querySelector("[data-ui-language]");
      if (input instanceof HTMLInputElement) {
        event.preventDefault();
        setLanguageMode(input.value);
      }
    }
  });
  document.addEventListener("change", (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.matches("[data-ui-language]")) {
      setLanguageMode(input.value);
    }
  });
  $("sidebarToggle").onclick = toggleSidebar;
  $("mobileSidebarToggle").onclick = () => setMobileSidebarOpen(true);
  $("sidebarScrim").onclick = () => setMobileSidebarOpen(false);
  $("detailPanel").addEventListener("click", (event) => {
    if (event.target.closest(".back-to-list")) setMobileDetailOpen(false);
  });
  window.addEventListener("resize", syncResponsiveShell);
  document.querySelectorAll("[data-help-tab]").forEach((button) => {
    button.onclick = () => {
      setHelpTab(button.dataset.helpTab);
      syncRoute({ push: true });
    };
  });
  $("approveSelected").onclick = () => decide("approve_proposed");
  $("archiveSelected").onclick = () => decide("approve_archive");
  $("draftSelected").onclick = () => decide("draft_reply");
  $("reviewSelected").onclick = () => decide("needs_review");
  $("noActionSelected").onclick = () => decide("no_action");
  $("bulkDecisionSelect").onchange = (event) => {
    const action = event.target.value;
    if (!action) return;
    decide(action).finally(() => {
      event.target.value = "";
    });
  };
  $("selectAll").onchange = (event) => {
    if (isLocked()) {
      event.target.checked = false;
      return toast(t("lock.processing"));
    }
    if (event.target.checked) store.state.items.forEach((item) => store.checked.add(item.id));
    else store.checked.clear();
    renderList();
    renderBulkActions();
  };
  $("searchInput").addEventListener("input", () => refresh({ preserveScroll: false }));
  document.querySelectorAll("#filters button").forEach((button) => {
    button.onclick = () => {
      setMobileSidebarOpen(false);
      setMobileDetailOpen(false);
      navigateTo({ mode: button.dataset.mode, selectedId: null }, { refreshData: true });
    };
  });
  document.querySelectorAll(".human-work [data-mode]").forEach((button) => {
    button.onclick = () => {
      setMobileSidebarOpen(false);
      setMobileDetailOpen(false);
      navigateTo({ mode: button.dataset.mode, selectedId: null }, { refreshData: true });
    };
  });
}

applyTranslations();
syncResponsiveShell();
wire();
syncModeButtons();
window.addEventListener("hashchange", () => applyRouteFromHash({ refreshData: true }));
refresh({ preserveScroll: false }).catch((error) => toast(error.message));
store.lockTimer = setInterval(() => pollLock().catch((error) => toast(error.message)), 3000);
store.refreshTimer = setInterval(() => refresh().catch((error) => toast(error.message)), 15000);
