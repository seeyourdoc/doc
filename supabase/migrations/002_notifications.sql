-- Run once in the Supabase SQL editor on an existing database (new installs already have this in schema.sql).
-- Existing consultations are marked as already notified, so they don't get a burst of emails; new ones start at false.
alter table consultation_rooms add column if not exists open_notified boolean not null default true;
alter table consultation_rooms add column if not exists ending_notified boolean not null default true;
alter table consultation_rooms alter column open_notified set default false;
alter table consultation_rooms alter column ending_notified set default false;
alter table consultation_rooms add column if not exists last_msg_notice_at timestamptz;
