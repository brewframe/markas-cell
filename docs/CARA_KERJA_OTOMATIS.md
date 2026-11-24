# Cara kerja Markas Cell + mode otomatis

## Alur satu perintah
```
Kamu (web / perintah_harian.txt)
   │  POST /api/perintah  (kunci owner)
   ▼
SERVER  backend/main.py  ──►  DATABASE data/markas.db  ◄──  WEB web-crew/ (membaca tiap 4 detik)
                                   ▲
WORKER  backend/worker.py  ────────┘  (memeriksa database tiap 2 detik)
   1. Jarvis   : memecah perintah jadi tugas (judul, tujuan, kriteria lulus)
   2. Bayu     : mengerjakan, file hasil disimpan di hasil/tugas-<id>/
   3. Vera QA  : cek otomatis + cek kriteria → lulus / revisi
   4. Kamu     : OK atau Revisi di Papan Tugas → APPROVED
```
Server = resepsionis (menerima & mencatat). Worker = dapur (yang benar-benar bekerja). Database = buku besar.
Web hanya jendela untuk melihat buku besar dan memberi keputusan.

## Mode otomatis (sekali pasang)
1. Isi `.env` di folder markas-cell: `FONNTE_TOKEN=...` dan `WA_TUJUAN=628...` (sama dengan agent-berita-ai).
2. Tulis perintah rutin di `data/perintah_harian.txt` (satu baris satu perintah).
3. Klik dua kali `OTOMATIS_PASANG.bat`.

| Jadwal | Kapan | Apa |
|---|---|---|
| MarkasCell-Nyala | saat login Windows | server + worker menyala diam-diam (`MULAI_DIAM.bat`) |
| MarkasCell-Perintah | 07.00 | `perintah_harian.py --kirim` → Jarvis |
| MarkasCell-Laporan | 20.00 | `laporan_wa.py --kirim` → WA kamu |

Matikan semua: `OTOMATIS_HAPUS.bat`. Catatan jalannya: `laporan/otomatis.log`, `laporan/worker.log`.

## Coba manual dulu
```
python backend\perintah_harian.py          (pratinjau)
python backend\laporan_wa.py               (pratinjau laporan WA)
python backend\laporan_wa.py --kirim       (kirim sungguhan)
```

## Batas yang sengaja dipasang
- Hasil kerja agent TIDAK pernah dikirim ke klien tanpa OK darimu.
- Laptop harus menyala (Task Scheduler). Untuk 24 jam penuh perlu VPS (langkah lanjutan).
- Biaya: Jarvis/Bayu/Vera memakai Claude Code di laptopmu, jadi setiap perintah memakai kuota Claude-mu.
