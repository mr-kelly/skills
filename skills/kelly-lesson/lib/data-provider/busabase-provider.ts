// Busabase LessonProvider: a thin HTTP client to a Busabase base.
//
// Busabase (#4437) publishes the whole review protocol over REST, so this is a
// mapping layer, not a backend. Lesson-plan fields (title/subject/grade/
// sections/...) live in a Busabase record's commit `fields`; an agent draft is
// a change_request, the human verdict is a review, an edit is an operation
// revision, publishing is a merge. The change-request status maps back onto
// kelly-lesson's plan statuses so the UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_LESSON_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_LESSON_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import type {
  AgentTasksFile,
  ConfigResult,
  ConfigSummary,
  Decision,
  DecisionBody,
  DecisionsFile,
  ExecutionReport,
  HttpError,
  LessonSnapshot,
  LessonState,
  Lock,
  Onboarding,
  Plan,
  PlanStatus,
  ProviderMeta,
  ReviewItem,
} from "../types.ts";

const STATUS_MAP: Record<string, PlanStatus> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const PLAN_FIELD_KEYS = [
  "title",
  "subject",
  "grade",
  "unit",
  "teacher_id",
  "source",
  "status",
  "class_length_minutes",
  "sections",
];

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_LESSON_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_LESSON_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_LESSON_BUSABASE_API_KEY || ""
    : process.env.KELLY_LESSON_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_LESSON_BUSABASE_URL / KELLY_LESSON_BUSABASE_BASE_ID.",
      );
    }
  }

  async function api(method: string, pathname: string, body?: unknown) {
    requireConfig();
    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`busabase ${method} ${pathname} -> ${res.status} ${detail}`.trim());
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function primaryOperation(cr: Record<string, unknown>) {
    const ops = cr.operations as Record<string, unknown>[] | undefined;
    return (cr.primaryOperation as Record<string, unknown>) || (Array.isArray(ops) ? ops[0] : null);
  }

  function crToPlan(cr: Record<string, unknown>, index: number): { plan: Plan; review: ReviewItem } {
    const op = primaryOperation(cr) || {};
    const headCommit = (op.headCommit as Record<string, unknown>) || {};
    const fields = (headCommit.fields as Record<string, unknown>) || {};
    const status = STATUS_MAP[String(cr.status)] || "needs_review";
    const planId = String(fields.plan_id || cr.id || `plan-${index + 1}`);
    const sections = (fields.sections as Plan["sections"]) || {};
    const plan: Plan = {
      plan_id: planId,
      ref: index + 1,
      title: String(fields.title || "(untitled)"),
      subject: String(fields.subject || ""),
      grade: String(fields.grade || ""),
      unit: String(fields.unit || ""),
      teacher_id: String(fields.teacher_id || ""),
      source: (fields.source as Plan["source"]) || "agent_draft",
      status,
      compliance_score: Number(fields.compliance_score || 0),
      class_length_minutes: Number(fields.class_length_minutes || 45),
      duration_minutes: Number(fields.duration_minutes || 0),
      sections,
      notes: String(fields.notes || ""),
    };
    const review: ReviewItem = {
      review_id: String(cr.id),
      ref: index + 1,
      plan_id: planId,
      status,
      compliance_summary: String(fields.compliance_summary || ""),
      suggestions: Array.isArray(fields.suggestions) ? (fields.suggestions as string[]) : [],
      feedback_draft: String(fields.feedback_draft || ""),
    };
    return { plan, review };
  }

  function countMetrics(plans: Plan[]) {
    return {
      teacher_count: new Set(plans.map((plan) => plan.teacher_id).filter(Boolean)).size,
      plan_count: plans.length,
      plans_approved: plans.filter((plan) => ["approved", "done"].includes(String(plan.status))).length,
      plans_in_revision: plans.filter((plan) => plan.status === "changes_requested").length,
      plans_needs_review: plans.filter((plan) => plan.status === "needs_review").length,
      checks_failed: 0,
      compliance_pass_rate: 0,
    };
  }

  function pickFields(plan: Record<string, unknown>) {
    const fields: Record<string, unknown> = {};
    for (const key of PLAN_FIELD_KEYS) {
      if (plan[key] !== undefined) fields[key] = plan[key];
    }
    return fields;
  }

  const configSummaryValue: ConfigSummary = {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
    school: {
      name: meta.config?.school?.name || "",
      kind: meta.config?.school?.kind || "",
      term: meta.config?.school?.term || "",
      class_length_minutes: meta.config?.school?.class_length_minutes ?? 45,
    },
    subjects: Array.isArray(meta.config?.subjects) ? meta.config.subjects : [],
    grades: Array.isArray(meta.config?.grades) ? meta.config.grades : [],
    template_sections: (Array.isArray(meta.config?.template_sections) ? meta.config.template_sections : []).map(
      (section) => ({
        key: section.key || "",
        label: section.label || section.key || "",
        required: Boolean(section.required),
      }),
    ),
    compliance_rules: (Array.isArray(meta.config?.compliance_rules) ? meta.config.compliance_rules : []).map(
      (rule) => ({
        rule_id: rule.rule_id || "",
        name: rule.name || rule.rule_id || "",
        severity: rule.severity || "warning",
        type: rule.type || "deterministic",
      }),
    ),
    export: {
      format: meta.config?.export?.format || "markdown",
      out_dir: meta.config?.export?.out_dir || "exports",
      docx_via_agent: meta.config?.export?.docx_via_agent ?? true,
    },
    feedback: {
      handoff_skill: meta.config?.feedback?.handoff_skill || "",
      requires_approval: meta.config?.feedback?.requires_approval ?? true,
      secret_envs: [],
      secrets_ready: true,
    },
  };

  function emptyDecisions(): DecisionsFile {
    return { updated_at: "", decisions: {} };
  }

  function remoteOnly(what: string): HttpError {
    const error: HttpError = new Error(
      `${what} is a local-file operation. Use KELLY_LESSON_DATA_PROVIDER=local to run the batch scripts, then publish plans to Busabase.`,
    );
    error.statusCode = 400;
    return error;
  }

  const provider = {
    kind: "busabase",

    configSummary(): ConfigSummary {
      return configSummaryValue;
    },

    async readConfig(): Promise<ConfigResult> {
      return { config: meta.config || {}, path: meta.source || "", is_example: Boolean(meta.is_example) };
    },

    async readSnapshot(): Promise<LessonSnapshot> {
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      const mapped = list.map((cr: Record<string, unknown>, index: number) => crToPlan(cr, index));
      const plans = mapped.map((entry) => entry.plan);
      const review_items = mapped.map((entry) => entry.review);
      return {
        schema_version: "1",
        generated_at: new Date().toISOString(),
        source: "busabase",
        school: {
          name: configSummaryValue.school.name,
          kind: configSummaryValue.school.kind,
          class_length_minutes: configSummaryValue.school.class_length_minutes,
          term: configSummaryValue.school.term,
        },
        metrics: countMetrics(plans),
        teachers: [],
        plans,
        rules: configSummaryValue.compliance_rules,
        checks: [],
        review_items,
        activity_log: [],
        warnings: [],
      };
    },

    async readDecisions(): Promise<DecisionsFile> {
      return emptyDecisions();
    },

    async readAgentTasks(): Promise<AgentTasksFile> {
      try {
        const tasks = await api("GET", "/api/v1/agent/tasks");
        const list = Array.isArray(tasks) ? tasks : tasks?.items || [];
        return { updated_at: new Date().toISOString(), tasks: list };
      } catch {
        return { updated_at: "", tasks: [] };
      }
    },

    async readExecutionReport(): Promise<ExecutionReport | null> {
      return null;
    },

    async readOnboarding(): Promise<Onboarding> {
      return { completed: true };
    },

    async readLock(): Promise<Lock | null> {
      return null;
    },

    async getState(): Promise<LessonState> {
      try {
        const [snapshot, agentTasks] = await Promise.all([this.readSnapshot(), this.readAgentTasks()]);
        return {
          app: "kelly-lesson",
          data_provider: this.kind,
          onboarding: { completed: true },
          lock: null,
          config_summary: this.configSummary(),
          decisions: emptyDecisions(),
          agent_tasks: agentTasks,
          execution_report: null,
          snapshot,
        };
      } catch (error) {
        // Surface connection problems the way the local provider would surface a
        // missing snapshot: an empty state plus a warning, so the UI still loads.
        return {
          app: "kelly-lesson",
          data_provider: this.kind,
          onboarding: { completed: true },
          lock: null,
          config_summary: this.configSummary(),
          decisions: emptyDecisions(),
          agent_tasks: { updated_at: "", tasks: [] },
          execution_report: null,
          snapshot: {
            schema_version: "1",
            generated_at: new Date().toISOString(),
            source: "busabase",
            school: {
              name: configSummaryValue.school.name,
              kind: configSummaryValue.school.kind,
              class_length_minutes: configSummaryValue.school.class_length_minutes,
              term: configSummaryValue.school.term,
            },
            metrics: countMetrics([]),
            teachers: [],
            plans: [],
            rules: configSummaryValue.compliance_rules,
            checks: [],
            review_items: [],
            activity_log: [],
            warnings: [
              {
                id: "busabase-unreachable",
                severity: "error",
                message: `Could not reach Busabase: ${(error as Error).message}`,
              },
            ],
          },
        };
      }
    },

    async applyDecision(payload: DecisionBody = {}): Promise<DecisionsFile> {
      const action = String(payload.action || "");
      const reviewId = String(payload.review_id || "");
      if (!reviewId) {
        const error: HttpError = new Error("review_id is required");
        error.statusCode = 400;
        throw error;
      }
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(reviewId)}`);
      const op = primaryOperation(cr);
      const current = ((op?.headCommit as Record<string, unknown>)?.fields as Record<string, unknown>) || {};

      if (action === "approve") {
        if (payload.draft && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(String(op.id))}/revisions`, {
            payload: {
              fields: { ...current, feedback_draft: payload.draft },
              message: "Edited before approval",
              author: "kelly-lesson",
            },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(reviewId)}/reviews`, {
          payload: { verdict: "approved", reason: payload.comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(String(op.id))}/revisions`, {
          payload: {
            fields: { ...current, feedback_draft: payload.draft ?? current.feedback_draft },
            message: payload.comment || "Saved edits",
            author: "kelly-lesson",
          },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(reviewId)}/reviews`, {
          payload: { verdict: "rejected", reason: payload.comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(reviewId)}/close`, {
          reason: payload.comment || "Closed by reviewer",
        });
      } else {
        const error: HttpError = new Error(`Unsupported action: ${action}`);
        error.statusCode = 400;
        throw error;
      }

      const now = new Date().toISOString();
      const decision: Decision = {
        action,
        comment: String(payload.comment || ""),
        draft: payload.draft === undefined ? undefined : String(payload.draft),
        decided_at: now,
      };
      return { updated_at: now, decisions: { [reviewId]: decision } };
    },

    async writeSnapshot(snapshot: LessonSnapshot): Promise<void> {
      // The ingest script's write path: create a change request per plan.
      for (const plan of snapshot.plans || []) {
        await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(plan as unknown as Record<string, unknown>),
            message: `Draft for ${plan.subject || "lesson"} — ${plan.title}`,
            submittedBy: "kelly-lesson",
          },
        });
      }
    },

    async writeDecisions(): Promise<void> {
      // Decisions are recorded remotely by applyDecision (reviews/merges); there
      // is no separate decisions file to persist against Busabase.
    },

    async writeAgentTasks(): Promise<void> {
      throw remoteOnly("Writing the agent-task queue");
    },

    async writeExecutionReport(): Promise<void> {
      throw remoteOnly("Writing the execution report");
    },
  };
  return provider;
}
