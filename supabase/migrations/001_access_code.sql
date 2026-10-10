-- Run once in the Supabase SQL editor on an existing database (new installs already have this in schema.sql).
alter table bookings add column if not exists access_code text;
