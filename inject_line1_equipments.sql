-- Inject 31 Master Equipment Line 1 (Konveyor) ke Supabase
-- Jalankan di Supabase -> SQL Editor

insert into public.equipments (kode_mesin, jenis_equipment, line, is_active)
select v.kode_mesin, 'Konveyor', '1', true
from (values
  ('101 HC 001'),
  ('101 HC 03A'),
  ('101 HC 03B'),
  ('101 IC 002A'),
  ('101 IC 002B'),
  ('101 HCIC 002A'),
  ('101 HCIC 002B'),
  ('101 ICHC 005'),
  ('101 HCIC 003'),
  ('101 HC 008 (Residu)'),
  ('101 HC 010A'),
  ('101 HC 010B'),
  ('101 HCIC 004A'),
  ('101 HCIC 004B'),
  ('101 HC 013A'),
  ('101 HC 013B'),
  ('101 HCIC 010A'),
  ('101 HCIC 010B'),
  ('101 HC 018'),
  ('101 HCIC 005A'),
  ('101 HCIC 005B'),
  ('101 HC 014A'),
  ('101 HC 014B'),
  ('101 HCIC 006A'),
  ('101 HCIC 006B'),
  ('101 ICHC 011A'),
  ('101 ICHC 011B'),
  ('101 IC 012'),
  ('101 HC 016A'),
  ('101 HC 016B'),
  ('101 IC 015')
) as v(kode_mesin)
where not exists (
  select 1 from public.equipments e
  where e.kode_mesin = v.kode_mesin and e.line = '1'
);
