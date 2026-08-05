// Deterministic, fully offline demo payload for documentation/screenshots.
// Never reads or writes Busabase, never persists anything -- matches the
// ?demo=1 contract used across Kelly App-in-Skills. The four contracts, four
// obligations, and two approvals below are ported verbatim (same ids, same
// names, same dates, same bilingual copy) from the retired
// app/server/demo.ts. Metrics are recomputed fresh via clm-model.js's
// computeMetrics() instead of demo.ts's old inline (partly hardcoded)
// metrics object -- see clm-model.js's computeMetrics() comment.
import { buildState, computeMetrics } from "../clm-model.js?v=0.1.0";

const NOW = "2026-07-07T09:00:00.000Z";

function L(zh) {
  return (en, zhText) => (zh ? zhText : en);
}

function demoContracts(zh) {
  const l = L(zh);
  return [
    {
      id: "ct-nimbus-msa",
      name: "Nimbus Analytics MSA",
      counterparty: "Zenith Retail Group",
      type: "MSA",
      stage: "negotiation",
      owner: "Mira Chen",
      business_owner: "Jon Park",
      value: "USD 180k ARR",
      start_date: "2026-08-01",
      end_date: "2028-07-31",
      renewal_date: "2028-07-31",
      notice_deadline: "2028-06-01",
      notice_acknowledged_at: "",
      next_action: l(
        "Confirm liability fallback and signature package owner.",
        "确认责任限制 fallback 和签署包负责人。",
      ),
      risk: "medium",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "ct-orbit-dpa",
      name: "Orbit Processor DPA",
      counterparty: "Orbit Cloud",
      type: "DPA",
      stage: "approval",
      owner: "Privacy Counsel",
      business_owner: "Nadia Singh",
      value: "Vendor privacy",
      start_date: "2026-07-20",
      end_date: "2027-07-19",
      renewal_date: "2027-07-19",
      notice_deadline: "2027-05-20",
      notice_acknowledged_at: "",
      next_action: l(
        "Review deletion and subprocessor obligations before approval.",
        "审批前复核删除和 subprocessor 义务。",
      ),
      risk: "high",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "ct-luma-sow",
      name: "Luma Implementation SOW",
      counterparty: "Luma Retail",
      type: "SOW",
      stage: "signature_ready",
      owner: "Services Legal",
      business_owner: "Theo Lim",
      value: "USD 42k fixed fee",
      start_date: "2026-07-15",
      end_date: "2026-10-15",
      renewal_date: "",
      notice_deadline: "",
      notice_acknowledged_at: "",
      next_action: l("Attach approved issue list to signature package.", "将已批准 issue list 附到签署包。"),
      risk: "low",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "ct-acme-nda",
      name: "Acme Mutual NDA",
      counterparty: "Acme Robotics",
      type: "NDA",
      stage: "active",
      owner: "Legal Ops",
      business_owner: "Mira Chen",
      value: "Supplier evaluation",
      start_date: "2026-07-01",
      end_date: "2028-07-01",
      renewal_date: "",
      notice_deadline: "",
      notice_acknowledged_at: "",
      next_action: l("Track return/destroy obligation after evaluation closes.", "评估结束后跟踪返还/销毁义务。"),
      risk: "low",
      created_at: NOW,
      updated_at: NOW,
    },
  ];
}

function demoObligations(zh) {
  const l = L(zh);
  return [
    {
      id: "obl-orbit-delete",
      contract_id: "ct-orbit-dpa",
      title: l("Delete or return personal data after termination", "终止后删除或返还个人数据"),
      owner: "Privacy",
      due_date: "2026-08-19",
      status: "at_risk",
      evidence: l("DPA deletion section needs final owner", "DPA 删除章节需要确认最终负责人"),
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "obl-luma-m1",
      contract_id: "ct-luma-sow",
      title: l("Collect milestone 1 acceptance evidence", "收集里程碑 1 验收证据"),
      owner: "Delivery",
      due_date: "2026-08-05",
      status: "open",
      evidence: l("SOW acceptance window starts after complete delivery", "SOW 验收期从完整交付后开始"),
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "obl-zenith-sla",
      contract_id: "ct-nimbus-msa",
      title: l("Track monthly SLA credit exposure", "跟踪每月 SLA credit 暴露"),
      owner: "Customer Success",
      due_date: "2026-09-01",
      status: "open",
      evidence: l("SLA exhibit has credit cap", "SLA 附件包含 credit 上限"),
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "obl-acme-return",
      contract_id: "ct-acme-nda",
      title: l("Return or destroy confidential materials", "返还或销毁保密材料"),
      owner: "Security",
      due_date: "2026-10-15",
      status: "open",
      evidence: l("NDA section 6", "NDA 第 6 条"),
      created_at: NOW,
      updated_at: NOW,
    },
  ];
}

function demoApprovals(zh) {
  const l = L(zh);
  return [
    {
      id: "ap-zenith-renewal",
      contract_id: "ct-nimbus-msa",
      title: l("Create renewal notice reminder", "创建续约通知提醒"),
      summary: l(
        "Add 2028-06-01 notice deadline to revenue ops calendar.",
        "将 2028-06-01 通知截止日加入 Revenue Ops 日历。",
      ),
      status: "needs_review",
      decision_note: "",
      decided_at: "",
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "ap-orbit-obligation",
      contract_id: "ct-orbit-dpa",
      title: l("Assign deletion obligation owner", "分配删除义务负责人"),
      summary: l("Privacy needs an owner before approval can be marked ready.", "审批就绪前需要 Privacy 明确负责人。"),
      status: "needs_review",
      decision_note: "",
      decided_at: "",
      created_at: NOW,
      updated_at: NOW,
    },
  ];
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const lang = String(params.get("lang") || "");
    const zh = lang.toLowerCase().startsWith("zh");
    const contracts = demoContracts(zh);
    const obligations = demoObligations(zh);
    const approvals = demoApprovals(zh);
    return {
      ...buildState(contracts, obligations, approvals, {
        app: "kelly-clm",
        demo: true,
        generated_at: NOW,
        profile: {
          company: zh ? "示例法务运营" : "Example Legal Ops",
          boundary: zh ? "仅本地交接" : "Local handoff only",
        },
      }),
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
    };
  },

  async createContract() {
    throw new Error("Demo mode is read-only.");
  },

  async updateContract() {
    throw new Error("Demo mode is read-only.");
  },

  async markObligationDone() {
    throw new Error("Demo mode is read-only.");
  },

  async acknowledgeRenewal() {
    throw new Error("Demo mode is read-only.");
  },

  async saveApprovalDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};

// Exported for app.js's demo-mode in-memory writes (mirrors
// kelly-revshare-simulator's app.js special-casing state.demo before calling
// the provider) so ?demo=1 stays fully interactive for screenshots without
// ever touching Busabase.
export { computeMetrics };
