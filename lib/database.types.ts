export interface Profile {
  id: string;
  full_name: string | null;
  company: string | null;
  created_at: string;
}

export interface Case {
  id: string;
  user_id: string;
  project_name: string;
  canton: string;
  contract_date: string;
  discovery_date: string;
  notice_recipient_name: string | null;
  notice_recipient_address: string | null;
  defect_statement: string | null;
  checklist: {
    defectDocumented: boolean;
    evidenceAttached: boolean;
    noticeDrafted: boolean;
    calendarReminderExported: boolean;
  };
  status: "active" | "review" | "archived";
  created_at: string;
  updated_at: string;
}

export interface CaseNoticeDraft {
  id: string;
  user_id: string;
  case_id: string;
  project_name: string;
  canton: string;
  notice_recipient_name: string;
  notice_recipient_address: string;
  defect_statement: string;
  contract_date: string;
  discovery_date: string;
  notice_deadline: string | null;
  regime: "old" | "new";
  created_at: string;
}

export interface CaseNoticeDispatch {
  id: string;
  user_id: string;
  case_id: string;
  notice_draft_id: string;
  dispatched_at: string;
  channel: "registered-mail" | "a-mail-plus" | "courier" | "hand-delivery";
  reference: string | null;
  created_at: string;
}

export interface CaseNoticeDispatchEvidence {
  id: string;
  user_id: string;
  case_id: string;
  dispatch_id: string;
  evidence_id: string;
  created_at: string;
}

export interface CaseEvidence {
  id: string;
  user_id: string;
  case_id: string;
  storage_path: string;
  original_name: string;
  mime_type: "application/pdf" | "image/jpeg" | "image/png";
  size_bytes: number;
  created_at: string;
}

export interface CaseActivityEvent {
  id: string;
  user_id: string;
  case_id: string;
  evidence_id: string;
  event_type: "evidence_uploaded";
  source_name: string;
  source_mime_type: "application/pdf" | "image/jpeg" | "image/png";
  source_size_bytes: number;
  occurred_at: string;
}

export interface Protocol {
  id: string;
  user_id: string;
  case_id: string | null;
  project_name: string;
  contractor: string;
  client: string;
  defect_description: string | null;
  signature_data: string | null;
  status: "draft" | "awaiting-signature" | "finalized";
  created_at: string;
  finalized_at: string | null;
}
