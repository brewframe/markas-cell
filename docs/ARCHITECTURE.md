# Arsitektur Markas Cell 2.0

Markas Cell 2.0 adalah sistem manajemen agent AI yang **benar-benar menjalankan pekerjaan**.
Gedung 3D tetap ada, tetapi sekarang hanya cermin: keadaan karakter dihitung dari tugas yang sungguh dikerjakan.

## Gambaran besar

```
Cell (owner)
  │  perintah lewat halaman Kontrol (perlu kunci owner)
  ▼
SERVER  backend/main.py  (FastAPI, 127.0.0.1:8300)
  │  hanya mencatat & menjawab. Tidak menjalankan AI.
  ▼
DATABASE  data/markas.db  (SQLite, WAL, foreign key aktif, migrasi bernomor)
  ▲
  │  dibaca & ditulis oleh proses terpisah
WORKER  backend/worker.py  (jendela kedua)
  ├─ Jarvis      orkestrator.py   perintah  -> 1-3 tugas berkontrak
  ├─ Dispatcher  orkestrator.py   PENDING   -> ASSIGNED
  ├─ Bayu        worker.py        ASSIGNED  -> RUNNING -> REVIEW (file di hasil/)
  └─ Vera        qa.py            cek otomatis + penilaian AI -> lulus / REVISION
  │
  └─ adapter/claude_code.py  ->  `claude -p` (Claude Code headless di laptop Cell)
```

Analogi: server = resepsionis, worker = dapur, database = buku besar, adapter = kompor.
Kalau dapur mati, resepsionis tetap buka dan dashboard menampilkan **STALE**.

## Komponen

| File | Tugas |
| --- | --- |
| `backend/config.py` | Lokasi file, kunci `.env`, daftar agent aktif (`AKTIF`), batas percobaan/revisi |
| `backend/db.py` | Koneksi per request, migrasi bernomor (`schema_version`), backup & restore |
| `backend/database.py` | Data gedung, agent, log, token, metrik, detak worker, idempotensi, retensi |
| `backend/tugas.py` | Kontrak tugas + **state machine** + riwayat, artefak, handoff, QA, persetujuan |
| `backend/keamanan.py` | Peran owner/agent/viewer, sesi cookie, cek Host, batas laju |
| `backend/skema.py` | Validasi input (enum `Literal`) |
| `backend/main.py` | API HTTP + file web |
| `backend/worker.py` | Putaran kerja: Jarvis → dispatcher → Bayu → Vera |
| `backend/orkestrator.py` | Jarvis + dispatcher |
| `backend/qa.py` | QA dua lapis |
| `backend/adapter/` | Colokan otak AI: `claude` (asli) dan `uji` (untuk tes, berlabel UJI) |
| `web/` | Landing, gedung 3D, skill agent, Kontrol |

## Keputusan penting dan alasannya

| Keputusan | Alasan | Konsekuensi |
| --- | --- | --- |
| Antrean di tabel SQLite, bukan Redis/Celery | Satu laptop, beberapa tugas per jam. Tabel + klaim atomik sudah cukup | Kalau nanti banyak worker di banyak mesin, pindah ke PostgreSQL |
| Worker proses terpisah | Crash worker tidak mematikan dashboard; tugas yatim dikembalikan ke antrean | Perlu 2 jendela (MULAI.bat membukanya otomatis) |
| Endpoint `def` + koneksi per request | FastAPI menjalankannya di threadpool; tidak ada koneksi global bersama | Sedikit lebih lambat dari satu koneksi, tapi aman |
| Claude Code headless sebagai otak (pilihan Cell) | Sudah terpasang, memakai langganan yang ada, tanpa API key di Markas | Worker hanya jalan saat laptop menyala; kuota langganan terpakai |
| Mulai dari 3 agent aktif | Lebih baik 3 agent yang menyelesaikan tugas daripada 29 yang hanya terlihat sibuk | 26 agent lain berlabel "belum aktif" |
| Satu perintah web = satu tugas | Tugas dikerjakan di folder masing-masing; memecah HTML/CSS ke tugas berbeda membuat hasil terpisah | Urutan antar-tugas belum didukung (lihat batasan) |

## Batasan yang diketahui (jujur)

- Satu worker, satu tugas pada satu waktu. Menjalankan dua worker sengaja ditolak.
- Tugas dari satu perintah tidak saling menunggu. Jarvis diarahkan membuat 1 tugas per hasil.
- Kunci agent masih satu untuk semua skrip; agent belum bisa dibatasi hanya melapor atas namanya sendiri.
- Waktu disimpan sebagai waktu lokal laptop (belum UTC).
- Angka token dan biaya berasal dari laporan Claude Code, bukan tagihan resmi.
