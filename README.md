# Plant Problem Logger

Aplikasi web lokal untuk pencatatan, pelacakan *downtime*, dan dokumentasi foto/video kendala mesin di area *plant*.

## Fitur Utama
- **Identitas Sesi Ringan:** Input nama pelapor/teknisi di awal sesi.
- **Quick Problem Logger:** Filter otomatis `Kode Mesin` dan `Nama Equipment` berdasarkan `Line`.
- **Waktu Resolve Fleksibel:** Jam selesai boleh kosong (*Open*), bisa diisi cepat via tombol **Selesaikan**, atau diedit/re-open kapan saja dengan kalkulasi durasi otomatis.
- **Deskripsi Kegiatan Perbaikan:** Kolom khusus untuk mencatat uraian langkah perbaikan.
- **Dokumentasi Foto & Video:** Lampiran multi-file saat *report* dan setelah *resolve* (maks. 25 MB/file) dengan pratinjau lightbox.
- **Master Equipment & Export CSV:** Kelola daftar mesin dan ekspor log ke `.csv`.

## Cara Menjalankan Secara Lokal (Windows)
1. Klik ganda `start.bat` (atau jalankan `powershell -ExecutionPolicy Bypass -File server.ps1 -OpenBrowser`).
2. Server otomatis mencari port kosong mulai dari `8080` dan membuka browser.

## Alur Push ke GitHub
1. Buat repository baru di GitHub (misalnya `plant-problem-logger`).
2. Jalankan perintah berikut di folder proyek ini:
   ```powershell
   git init
   git add .
   git commit -m "Initial commit: Plant Problem Logger"
   git branch -M main
   git remote add origin https://github.com/<USERNAME>/<REPO_NAME>.git
   git push -u origin main
   ```

## Catatan Penting Terkait Hosting / Deploy
- **GitHub Pages** hanya mendukung file statis (HTML/CSS/JS) dan **tidak** dapat menjalankan `server.ps1` (API simpan JSON & upload foto/video).
- Jika ingin **multi-user online** (data tersinkron antar HP/PC), backend perlu dimigrasi ke Node.js/Python + database/storage (misal Supabase/PostgreSQL) dan di-deploy dari repo GitHub ke platform seperti Render, Railway, atau VPS kantor.
