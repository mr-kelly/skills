export type WorkflowStatus = "needs_review" | "changes_requested" | "approved" | "done" | "blocked";
export type DecisionAction = "approve" | "request_changes" | "revise" | "block";
export type InvoiceCategory = "vendor_invoice" | "receipt" | "credit_note" | "statement" | "other";

export interface FieldConfidence {
  value?: unknown;
  confidence?: number;
  source_text?: string;
}

export interface InvoiceLineItem {
  line_id: string;
  description: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  tax_rate?: number;
  category?: string;
  confidence?: number;
  notes?: string;
}

export interface InvoiceRecord {
  id: string;
  ref: string;
  title: string;
  status: WorkflowStatus;
  category: InvoiceCategory;
  source_file: string;
  source_path?: string;
  source_type?: string;
  source_page?: number;
  vendor_name: string;
  vendor_tax_id?: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string;
  currency: string;
  subtotal?: number;
  tax?: number;
  total: number;
  amount_due?: number;
  payment_terms?: string;
  bill_to?: string;
  purchase_order?: string;
  iban_or_account_hint?: string;
  confidence: number;
  field_confidence?: Record<string, FieldConfidence>;
  risk: string[];
  warnings: string[];
  notes?: string;
  line_items: InvoiceLineItem[];
  proposed_action?: string;
  reason?: string;
  decision?: DecisionEntry;
  execution?: Record<string, unknown>;
}

export interface InvoiceBatch {
  schema_version: "1";
  batch_id: string;
  generated_at: string;
  source: "kelly-invoice-sheet";
  mode: "app-in-skill";
  extractor: {
    name: string;
    model?: string;
    notes?: string;
  };
  input_files: Array<{
    path: string;
    name: string;
    type?: string;
    pages?: number;
  }>;
  metrics: {
    total: number;
    needs_review: number;
    changes_requested: number;
    approved: number;
    done: number;
    blocked: number;
    low_confidence: number;
    total_amount: number;
    currencies: string[];
  };
  invoices: InvoiceRecord[];
}

export interface DecisionEntry {
  item_id: string;
  action: DecisionAction;
  comment?: string;
  patch?: Partial<InvoiceRecord>;
  decided_at: string;
}

export interface DecisionsFile {
  schema_version: "1";
  updated_at: string;
  decisions: Record<string, DecisionEntry>;
}

export interface AgentTasksFile {
  schema_version: "1";
  updated_at: string;
  tasks: Array<{
    item_id: string;
    reason: string;
    comment?: string;
    created_at: string;
  }>;
}

export interface Config {
  data_provider?: string;
  default_currency?: string;
  export?: {
    directory?: string;
    include_line_items?: boolean;
  };
  extraction?: {
    preferred_ocr?: string;
    low_confidence_threshold?: number;
  };
  review_policy?: {
    auto_approve_min_confidence?: number;
    block_missing_fields?: string[];
  };
  [key: string]: unknown;
}

export interface ConfigResult {
  config: Config;
  path: string;
  is_example: boolean;
}

export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

export interface DecisionBody {
  item_id?: string;
  action?: string;
  comment?: string;
  patch?: Record<string, unknown>;
}

export interface HttpError extends Error {
  statusCode?: number;
}
