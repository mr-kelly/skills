import { demoSnapshot } from "../retouch-model.js?v=0.1.0";

export const demoProvider = {
  kind: "demo",
  async getState() {
    return {
      app: "kelly-portrait-retouch",
      demo: true,
      data_provider: "demo",
      readiness: {
        runtime: "ready",
        onboarding: "complete",
        action: "none",
        change_request_id: null,
        safe_context: { mode: "read-only-demo" },
      },
      snapshot: demoSnapshot(),
    };
  },
  async submitDecision() {
    throw new Error("Demo mode is read-only.");
  },
  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
  async saveOnboarding() {
    throw new Error("Demo mode is read-only.");
  },
};
