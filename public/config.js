// Konfigurasi Plant Problem Logger
// USE_SUPABASE:
// - "auto" (default): otomatis pakai server lokal saat dibuka di localhost, dan pakai Supabase saat di-deploy online (GitHub Pages).
// - true  : paksa pakai Supabase (termasuk di localhost).
// - false : paksa pakai server lokal (server.ps1).

window.APP_CONFIG = {
  USE_SUPABASE: "auto",
  SUPABASE_URL: "https://mzczuofvngnvcafubhdh.supabase.co/rest/v1/",
  SUPABASE_ANON_KEY: "sb_publishable_EyxeticMeak-YvYrscCKGw_ifZRncMW",
  SUPABASE_BUCKET: "plant-media",

  CATEGORIES: ["elektrikal", "mekanikal", "material", "preparation", "Maint. Day", "Start Feeding"],
  STATUSES: ["critical", "moderate"],
  SHIFTS: ["Shift 1", "Shift 2", "Shift 3"],
};
