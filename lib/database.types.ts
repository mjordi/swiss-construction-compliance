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
  checklist: {
    defectDocumented: boolean;
    evidenceAttached: boolean;
    noticeDrafted: boolean;
    calendarReminderExported: boolean;
  };
  created_at: string;
  updated_at: string;
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
}
