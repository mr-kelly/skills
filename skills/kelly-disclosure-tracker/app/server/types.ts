// Core domain types shared across the kelly-disclosure-tracker server, provider,
// and scripts. A "vehicle" is one financing vehicle (fund/SPV) whose standardized
// disclosure package spans three generic regulatory roles:
//   - origination   : the onshore origination entity (originates/services the assets)
//   - fund_manager  : the offshore fund-manager entity (manages the vehicle)
//   - listing_venue : the exchange/listing venue where the vehicle's notes/units are listed
//
// This is a generic, brand-free compliance/IR workspace: no real company, filing
// system, or exchange is referenced. All data is local and synthetic.

export type EntityRole = "origination" | "fund_manager" | "listing_venue";

export type ItemStatus = "needs_review" | "changes_requested" | "done" | "blocked";

export type DecisionAction = "verified" | "needs_source" | "flagged";

export interface Reconciliation {
  field: string;
  origination_value: string;
  listing_value: string;
  match: boolean;
  note?: string;
}

export interface Decision {
  action: DecisionAction;
  comment?: string;
  decided_at: string;
}

export interface DisclosureItem {
  id: string;
  vehicle_id: string;
  role: EntityRole;
  item_key: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  status: ItemStatus;
  proposed_action: "collect_document" | "reconcile_figures" | "confirm_filing" | "no_action";
  reason: string;
  reconciliation?: Reconciliation;
  decision?: Decision;
}

export interface VehicleMetrics {
  total: number;
  needs_review: number;
  changes_requested: number;
  done: number;
  blocked: number;
}

export interface Vehicle {
  vehicle_id: string;
  name: string;
  vehicle_type: "fund" | "spv";
  origination_entity: string;
  fund_manager_entity: string;
  listing_venue: string;
  base_currency: string;
  target_close_date: string;
  metrics: VehicleMetrics;
  readiness: "ready" | "blocked" | "in_progress";
}

export interface BatchMetrics {
  vehicles_ready: number;
  vehicles_blocked: number;
  vehicles_in_progress: number;
  items_needs_review: number;
  items_changes_requested: number;
  items_done: number;
  items_blocked: number;
}

export interface Batch {
  batch_id: string;
  generated_at: string;
  source: string;
  mode: string;
  metrics: BatchMetrics;
  vehicles: Vehicle[];
  items: DisclosureItem[];
}

export interface DecisionsFile {
  [itemId: string]: Decision;
}

export interface ExecutionReport {
  generated_at: string;
  results: Array<{
    item_id: string;
    status: "written" | "skipped" | "error";
    detail?: string;
  }>;
}

export interface Onboarding {
  completed: boolean;
  completed_at?: string;
  config_version?: string;
}

export interface Config {
  data_provider?: string;
  locale?: string;
  reviewer_name?: string;
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  reviewer_name: string;
  data_provider: string;
}
