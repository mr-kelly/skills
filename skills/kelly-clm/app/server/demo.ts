const now = "2026-07-07T09:00:00.000Z";

function L(zh) {
  return (en, zhText) => (zh ? zhText : en);
}

export function demoState(query = {}) {
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const l = L(zh);
  const contracts = [
    {
      id: "ct-nimbus-msa",
      ref: 1,
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
      next_action: l(
        "Confirm liability fallback and signature package owner.",
        "确认责任限制 fallback 和签署包负责人。",
      ),
      risk: "medium",
    },
    {
      id: "ct-orbit-dpa",
      ref: 2,
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
      next_action: l(
        "Review deletion and subprocessor obligations before approval.",
        "审批前复核删除和 subprocessor 义务。",
      ),
      risk: "high",
    },
    {
      id: "ct-luma-sow",
      ref: 3,
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
      next_action: l("Attach approved issue list to signature package.", "将已批准 issue list 附到签署包。"),
      risk: "low",
    },
    {
      id: "ct-acme-nda",
      ref: 4,
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
      next_action: l("Track return/destroy obligation after evaluation closes.", "评估结束后跟踪返还/销毁义务。"),
      risk: "low",
    },
  ];
  const obligations = [
    {
      id: "obl-orbit-delete",
      contract_id: "ct-orbit-dpa",
      title: l("Delete or return personal data after termination", "终止后删除或返还个人数据"),
      owner: "Privacy",
      due_date: "2026-08-19",
      status: "at_risk",
      evidence: l("DPA deletion section needs final owner", "DPA 删除章节需要确认最终负责人"),
    },
    {
      id: "obl-luma-m1",
      contract_id: "ct-luma-sow",
      title: l("Collect milestone 1 acceptance evidence", "收集里程碑 1 验收证据"),
      owner: "Delivery",
      due_date: "2026-08-05",
      status: "open",
      evidence: l("SOW acceptance window starts after complete delivery", "SOW 验收期从完整交付后开始"),
    },
    {
      id: "obl-zenith-sla",
      contract_id: "ct-nimbus-msa",
      title: l("Track monthly SLA credit exposure", "跟踪每月 SLA credit 暴露"),
      owner: "Customer Success",
      due_date: "2026-09-01",
      status: "open",
      evidence: l("SLA exhibit has credit cap", "SLA 附件包含 credit 上限"),
    },
    {
      id: "obl-acme-return",
      contract_id: "ct-acme-nda",
      title: l("Return or destroy confidential materials", "返还或销毁保密材料"),
      owner: "Security",
      due_date: "2026-10-15",
      status: "open",
      evidence: l("NDA section 6", "NDA 第 6 条"),
    },
  ];
  const approvals = [
    {
      id: "ap-zenith-renewal",
      contract_id: "ct-nimbus-msa",
      title: l("Create renewal notice reminder", "创建续约通知提醒"),
      summary: l(
        "Add 2028-06-01 notice deadline to revenue ops calendar.",
        "将 2028-06-01 通知截止日加入 Revenue Ops 日历。",
      ),
      status: "needs_review",
    },
    {
      id: "ap-orbit-obligation",
      contract_id: "ct-orbit-dpa",
      title: l("Assign deletion obligation owner", "分配删除义务负责人"),
      summary: l("Privacy needs an owner before approval can be marked ready.", "审批就绪前需要 Privacy 明确负责人。"),
      status: "needs_review",
    },
  ];
  const metrics = {
    contracts: contracts.length,
    renewals_90d: 1,
    obligations_at_risk: obligations.filter((item) => item.status === "at_risk").length,
    approvals: approvals.filter((item) => item.status === "needs_review").length,
  };
  return {
    app: "kelly-clm",
    demo: true,
    generated_at: now,
    profile: {
      company: l("Example Legal Ops", "示例法务运营"),
      boundary: l("Local handoff only", "仅本地交接"),
    },
    contracts,
    obligations,
    approvals,
    metrics,
  };
}
