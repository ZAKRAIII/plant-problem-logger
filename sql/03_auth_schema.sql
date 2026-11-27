-- ============================================================
-- 03_auth_schema.sql
-- Jalankan di Supabase SQL Editor (sekali saja)
-- ============================================================

-- 1. Tabel pengguna aplikasi
create table if not exists app_users (
  id        uuid default gen_random_uuid() primary key,
  username  text unique not null,
  full_name text,
  pwd_hash  text not null,            -- SHA-256 hex dari password
  role      text check (role in ('admin','teknisi')) not null default 'teknisi',
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- 2. Tambah kolom created_by ke problem_logs (skip jika sudah ada)
alter table problem_logs
  add column if not exists created_by_id   uuid references app_users(id) on delete set null,
  add column if not exists created_by_name text;

-- 3. Grant izin tabel baru ke role anon (untuk operasi via apikey)
grant select, insert, update, delete on app_users to anon;

-- ============================================================
-- SEED: Akun admin awal
-- Password: admin123  →  SHA-256 hash di bawah
-- Ganti pwd_hash jika ingin password berbeda.
-- Hash generator: https://emn178.github.io/online-tools/sha256.html
-- ============================================================
insert into app_users (username, full_name, role, pwd_hash, is_active)
values (
  'admin',
  'Administrator',
  'admin',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a', -- admin123
  true
)
on conflict (username) do nothing;
