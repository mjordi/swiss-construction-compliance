import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "supabase/migrations/20260815000000_case_notice_dispatches.sql";
const sql = () => readFileSync(path, "utf8").toLowerCase();

describe("case notice dispatch migration", () => {
  it("creates an owner- and source-bound append-only dispatch record", () => {
    const text = sql();
    expect(text).toContain("create table public.case_notice_dispatches");
    expect(text).toMatch(/id uuid primary key default gen_random_uuid\(\)/);
    expect(text).toMatch(/dispatched_at timestamptz not null/);
    expect(text).toMatch(/channel text not null[\s\S]*registered-mail[\s\S]*a-mail-plus[\s\S]*courier[\s\S]*hand-delivery/);
    expect(text).toMatch(/reference text[\s\S]*char_length\(reference\) <= 200/);
    expect(text).toMatch(/created_at timestamptz not null default now\(\)/);
    expect(text).toMatch(/notice_draft_id uuid references public\.case_notice_drafts\(id\) on delete cascade not null/);
    expect(text).toMatch(/case_id uuid references public\.cases\(id\) on delete cascade not null/);
    expect(text).toMatch(/create trigger case_notice_dispatches_source_guard[\s\S]*before insert/);
    expect(text).toMatch(/draft\.id = new\.notice_draft_id[\s\S]*draft\.case_id = new\.case_id[\s\S]*draft\.user_id = new\.user_id[\s\S]*compliance_case\.user_id = new\.user_id/);
    expect(text).not.toMatch(/alter table public\.(cases|case_notice_drafts)[\s\S]*add constraint/);
  });

  it("grants owner-scoped select and client-column insert only", () => {
    const text = sql();
    expect(text).toContain("alter table public.case_notice_dispatches enable row level security");
    expect(text).toMatch(/for select[\s\S]*auth\.uid\(\) = user_id/);
    expect(text).toMatch(/for insert[\s\S]*auth\.uid\(\) = user_id/);
    const grant = text.match(/grant insert\s*\(([\s\S]*?)\)\s*on public\.case_notice_dispatches to authenticated;/)?.[1] ?? "";
    expect(grant.split(",").map((value) => value.trim())).toEqual([
      "user_id", "case_id", "notice_draft_id", "dispatched_at", "channel", "reference",
    ]);
    expect(grant).not.toMatch(/\b(id|created_at)\b/);
    expect(text).not.toMatch(/create policy[\s\S]*?for (update|delete)/);
    expect(text).not.toMatch(/grant[^;]*(update|delete)/);
  });

  it("documents factual dispatch semantics and Case-lifetime privacy erasure", () => {
    const text = sql();
    expect(text).toMatch(/records the owner['’]s statement that dispatch occurred/);
    expect(text).toMatch(/does not prove delivery or receipt/);
    expect(text).toMatch(/append-only for the case lifetime/);
    expect(text).toMatch(/privacy erasure/);
  });
});
