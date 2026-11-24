# Changelog

## 2.2.0 (2026-11-24): gedung 3D sungguhan + laporan WA per agent

- **Gedung 3D jadi pusat kendali**: tab **Perintah** (masuk owner, perintah ke Jarvis), tab **Perlu OK**
  (✓ OK / Revisi / Lihat hasil per tugas), HUD **token hari ini**, token per agent saat karakter diklik.
- **Gelembung tugas** di atas kepala setiap agent yang bekerja (teks asli dari database), bisa dimatikan.
- **Rapat**: saat Jarvis memecah perintah, Jarvis, Cell, Bayu, Vera berjalan ke Ruang Rapat lantai 4.
- **WhatsApp** (`backend/wa.py`): laporan per agent (perintah, tugas, QA, token real; token demo tidak dihitung),
  tombol **Kirim laporan ke WA** (gedung 3D & Papan Tugas), perintah `kirim laporan ke WA` ke Jarvis
  dikerjakan langsung tanpa token AI, kabar otomatis saat tugas menunggu OK atau gagal (`WA_NOTIF`, sekali per tugas).
- API baru: `GET /api/laporan`, `POST /api/laporan/wa` (owner). Snapshot berisi status WA tanpa nomor/token.
- Database versi 3: tabel `notif_wa`. Backup otomatis dibuat sebelum migrasi.
- `MULAI_3D.bat` membuka gedung 3D langsung. Worker dijalankan dengan `-u` supaya log langsung tampil.
- Menu **Gedung 3D** di web baru. Tes: `tests/test_wa.py` (9 tes), `tests/e2e_3d.js` (browser, 21 pemeriksaan).

## 2.1.0 (2026-11-16): web baru gaya CrewAI

- **Tampilan utama baru** di `web-crew/` (dibuka di http://localhost:8300). Tampilan lama tetap ada di `/lama/`.
- **Semua gambar dibuat dengan kode** (`web-crew/js/seni.js`): gedung Menara di kota malam, 4 lantai kantor, rooftop.
  Digambar sebagai pixel art lalu diperbesar tanpa dihaluskan, jadi tajam di HP sampai monitor 4K.
- **Beranda**: animasi alur Cell → Jarvis → Bayu → Vera → OK, lift gedung yang menempel saat scroll
  (pintu lift menutup lalu membuka saat ganti lantai), statistik live dari database.
- **Papan Tugas**: masuk owner, kirim perintah ke Jarvis (`Idempotency-Key`), OK / Revisi / Coba lagi, detail tugas
  (QA, file hasil, riwayat). Tanpa server: mode demo di browser.
- **Kenali Crew**: status live tiap agent + riwayat tugas. **Pantau**: token, biaya, CPU/RAM, log.
- Tes baru: `tests/test_api.py::test_halaman_web_baru_dan_lama` dan `node tests/e2e_web.js` (alur lengkap di browser).

## 2.0.0 (2026-11-15): dari dashboard visual menjadi sistem agent sungguhan

### Kritis (P0)
- **Worker sungguhan** (`backend/worker.py`): proses terpisah yang menjalankan Jarvis (memecah perintah), dispatcher, Bayu (membuat file lewat Claude Code headless), dan Vera (QA).
- **State machine tugas**: `PENDING > ASSIGNED > RUNNING > REVIEW > APPROVED`, ditambah `REVISION` dan `FAILED`. Perubahan ilegal ditolak 409 dan dicatat di `riwayat_tugas`.
- **Tugas berkontrak**: judul, tujuan, kriteria lulus. Hasil disimpan sebagai artefak (path + sha256).
- **Bukti, bukan klaim**: `REVIEW` wajib ada file hasil, dan `APPROVED` wajib QA lulus serta OK dari Cell.
- **Database**:
  - `PRAGMA foreign_keys=ON`, WAL, `busy_timeout`.
  - Migrasi bernomor (`schema_version`), backup otomatis sebelum migrasi.
  - Perintah `python backend/db.py backup|periksa|pulihkan`.
- **Data lama aman**: tabel tugas v1 diganti nama menjadi `tugas_v1`, tidak dihapus. Backupnya ada di `data/cadangan/markas-v1-sebelum-2.0.db`.

### Keamanan (P1)
- Peran owner/agent/viewer dengan kunci di `.env`; sesi owner memakai cookie HttpOnly + SameSite=Strict.
- Cek header Host (anti DNS rebinding), rate limit tulis, `Idempotency-Key`.
- Artefak dikirim dengan CSP sandbox. QA memindai rahasia di file hasil.

### Keandalan
- Retry dengan jeda 30 s, 60 s, 120 s (maks 3 percobaan), maks 2 revisi.
- Detak jantung worker; dashboard menampilkan mode `LIVE`, `STALE` (worker mati), `DEMO`, `PRATINJAU`.
- Tugas yatim (worker mati di tengah jalan) dikembalikan ke antrean saat worker menyala lagi.
- Hanya satu worker boleh hidup.
- Token per model tidak lagi tergabung; laporan token idempoten; biaya USD dari Claude Code dicatat.
- Log dibersihkan setelah 30 hari.
- Agent yang mengaku "kerja" tetapi lebih dari 10 menit tanpa kabar ditandai **basi** dan tidak dihitung sebagai "sedang kerja".

### Tampilan (identitas gedung 3D dipertahankan)
- Halaman Kontrol baru:
  - Masuk owner, Perintah ke Jarvis, "Perlu persetujuanmu" (Setujui terkunci sampai QA lulus, Minta revisi dengan alasan).
  - Laci detail tugas: file, laporan, QA per kriteria, riwayat status, handoff, token.
- Gedung 3D: panel Jarvis/Bayu bisa menerima perintah; agent yang belum aktif diberi keterangan jujur.
- Banner mode di semua halaman. Polling berhenti saat tab disembunyikan.

### Dihapus
- Tombol manual "Mulai/Selesai/Gagal" di Kontrol. Alasan teknis: tombol itu membuat status berubah tanpa ada pekerjaan, persis masalah yang dikritik review.
- Demo yang membuat tugas palsu. Mode demo sekarang memakai database terpisah dan menolak perintah sungguhan.

### Tes
- 32 tes otomatis (unit, API, integrasi dengan adapter uji) dan 1 tes E2E browser (Playwright).

## 1.x
- Gedung 3D 5 lantai, landing page, dashboard skill, halaman kontrol, logo Menara Agent.
