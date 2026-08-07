-- Establish explicit, user-reviewed source facts for a future defect notice.
-- Columns remain nullable so existing Cases continue to load and can visibly
-- report an incomplete source basis until the user supplies the facts.
alter table public.cases
  add column if not exists notice_recipient_name text,
  add column if not exists notice_recipient_address text,
  add column if not exists defect_statement text;

alter table public.cases
  drop constraint if exists cases_notice_recipient_name_valid,
  add constraint cases_notice_recipient_name_valid check (
    notice_recipient_name is null or (
      btrim(notice_recipient_name) <> '' and
      char_length(notice_recipient_name) <= 200
    )
  ),
  drop constraint if exists cases_notice_recipient_address_valid,
  add constraint cases_notice_recipient_address_valid check (
    notice_recipient_address is null or (
      btrim(notice_recipient_address) <> '' and
      char_length(notice_recipient_address) <= 1000
    )
  ),
  drop constraint if exists cases_defect_statement_valid,
  add constraint cases_defect_statement_valid check (
    defect_statement is null or (
      btrim(defect_statement) <> '' and
      char_length(defect_statement) <= 4000
    )
  );
