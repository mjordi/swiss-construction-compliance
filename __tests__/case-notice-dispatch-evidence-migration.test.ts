import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = () => readFileSync("supabase/migrations/20260817000000_case_notice_dispatch_evidence.sql", "utf8").toLowerCase();

describe("case notice dispatch evidence migration", () => {
  it("creates one append-only association per dispatch with generated fields", () => {
    const text = sql();
    expect(text).toContain("create table public.case_notice_dispatch_evidence");
    expect(text).toMatch(/id uuid primary key default gen_random_uuid\(\)/);
    expect(text).toMatch(/dispatch_id uuid references public\.case_notice_dispatches\(id\) on delete cascade not null unique/);
    expect(text).toMatch(/evidence_id uuid references public\.case_evidence\(id\) on delete cascade not null/);
    expect(text).toMatch(/created_at timestamptz not null default now\(\)/);
  });

  it("database-validates owner, Case, dispatch source, and evidence", () => {
    const text = sql();
    expect(text).toMatch(/security definer\s+set search_path = ''/);
    expect(text).toMatch(/dispatch\.id = new\.dispatch_id[\s\S]*dispatch\.user_id = new\.user_id[\s\S]*dispatch\.case_id = new\.case_id/);
    expect(text).toMatch(/draft\.id = dispatch\.notice_draft_id[\s\S]*draft\.user_id = new\.user_id[\s\S]*draft\.case_id = new\.case_id/);
    expect(text).toMatch(/evidence\.id = new\.evidence_id[\s\S]*evidence\.user_id = new\.user_id[\s\S]*evidence\.case_id = new\.case_id/);
    expect(text).toMatch(/before insert/);
  });

  it("grants owner-only select and client-column insert with no mutation", () => {
    const text = sql();
    expect(text).toMatch(/for select[\s\S]*auth\.uid\(\) = user_id/);
    expect(text).toMatch(/for insert[\s\S]*auth\.uid\(\) = user_id/);
    expect(text).toContain("revoke all on public.case_notice_dispatch_evidence from authenticated");
    const grant = text.match(/grant insert\s*\(([\s\S]*?)\)\s*on public\.case_notice_dispatch_evidence to authenticated;/)?.[1] ?? "";
    expect(grant.split(",").map((value) => value.trim())).toEqual(["user_id", "case_id", "dispatch_id", "evidence_id"]);
    expect(text).not.toMatch(/create policy[\s\S]*?for (update|delete)/);
    expect(text).not.toMatch(/grant[^;]*(update|delete)/);
  });

  it("documents user-linked evidence without delivery or receipt verification", () => {
    expect(sql()).toMatch(/user-linked supporting evidence[\s\S]*not verified (proof of )?delivery or receipt/);
  });
});
