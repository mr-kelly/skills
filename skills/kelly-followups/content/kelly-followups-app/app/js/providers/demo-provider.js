// Deterministic, explicitly-labeled, read-only demo data.
import { buildSnapshot } from "../followups-model.js?v=0.1.0";

const TODAY = "2026-09-02";

const FOLLOWUPS = [
  {
    record_id: "fu-1",
    meeting: "周三产品评审",
    person: "阿明",
    action: "把演示环境的账号权限改成只读",
    due: "2026-09-01",
    status: "pending",
  },
  {
    record_id: "fu-2",
    meeting: "周三产品评审",
    person: "小雨",
    action: "把客户提的报价疑问回复清楚",
    due: TODAY,
    status: "pending",
  },
  {
    record_id: "fu-3",
    meeting: "周一晨会",
    person: "老张",
    action: "确认交付延期的新日期",
    due: "2026-09-10",
    status: "pending",
  },
  {
    record_id: "fu-4",
    meeting: "周一晨会",
    person: "阿明",
    action: "上周那个客户的合同已经补签",
    due: "2026-08-28",
    status: "done",
  },
];

export const demoProvider = {
  kind: "demo",
  async getState() {
    const snapshot = buildSnapshot({ followups: FOLLOWUPS }, TODAY);
    return {
      app: "kelly-followups",
      demo: true,
      data_provider: "demo",
      lock: null,
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      snapshot,
    };
  },
  async applyDecision() {
    throw new Error("Demo mode is read-only.");
  },
  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
