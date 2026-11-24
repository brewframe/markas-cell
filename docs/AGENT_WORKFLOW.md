# Alur kerja agent

## Dari perintah sampai disetujui

1. **Cell** menulis perintah di halaman Kontrol → `POST /api/perintah` → status perintah `BARU`.
2. **Jarvis** (worker) mengambil perintah, memanggil Claude Code **tanpa alat tulis**, dan meminta rencana JSON:
   judul, tujuan, kriteria lulus. Hasilnya 1–3 tugas `PENDING`, plus catatan serah terima Jarvis → Bayu.
   Jarvis boleh **menolak** perintah yang tidak bisa dikerjakan specialist web (misalnya kirim WA, transaksi uang).
3. **Dispatcher** memindah `PENDING → ASSIGNED` untuk specialist yang aktif.
4. **Bayu** (worker) mengklaim tugas (`ASSIGNED → RUNNING`), lalu menjalankan Claude Code di folder
   `hasil/tugas-<id>-<waktu>/` dengan alat Read/Write/Edit/Glob/Grep saja. Bash, web, dan sub-agent dimatikan.
5. Kalau ada file hasil, file dicatat di tabel `artefak` (path, ukuran, sha256) dan tugas pindah `RUNNING → REVIEW`.
   Kalau gagal, dicoba lagi dengan jeda 30 s, 60 s, ... sampai 3 kali, lalu `FAILED`.
6. **Vera** menjalankan QA:
   - Cek otomatis: ada file, ukuran < 5 MB, HTML terbaca, tidak ada pola kunci rahasia.
   - Penilaian AI (hanya membaca): setiap kriteria dinilai lulus/tidak dengan alasan.
   - Lulus → `qa_status = lulus`, Bayu tampil **menunggu OK Cell** di gedung.
   - Gagal → `REVISION` dengan catatan QA (maksimal 2 revisi, lalu `FAILED`).
7. **Cell** membuka detail tugas, melihat file, hasil QA, dan riwayat, lalu memilih **Setujui** atau **Minta revisi**.
   Hanya owner yang bisa `REVIEW → APPROVED`, dan hanya kalau QA lulus.

## State machine

```
PENDING ──dispatcher──▶ ASSIGNED ──worker──▶ RUNNING ──worker (ada artefak)──▶ REVIEW ──owner (QA lulus)──▶ APPROVED
                           ▲                   │  │                              │
                           └──worker/sistem────┘  └──worker (3x gagal)──▶ FAILED ◀┘ qa/owner (revisi habis)
                              (retry, worker mati)                          │
                                                       owner "coba lagi" ───┘──▶ PENDING
REVIEW ──qa/owner──▶ REVISION ──worker──▶ RUNNING
```

Semua transisi lewat satu fungsi, `tugas.pindah()`. Transisi lain ditolak (HTTP 409) dan **tetap dicatat**
di `riwayat_tugas` dengan `ditolak = 1`.

## Kontrak tugas

| Kolom | Isi |
| --- | --- |
| `judul`, `tujuan` | Apa yang dibuat dan untuk apa |
| `kriteria` | Daftar kriteria lulus (JSON) yang dinilai QA satu per satu |
| `agent` | Specialist yang mengerjakan (sekarang: Bayu) |
| `percobaan`, `revisi` | Hitungan retry dan revisi |
| `qa_status` | belum / menunggu / lulus / gagal / error |
| `adapter` | Otak yang mengerjakan: `claude` atau `uji` (tes) |

## Keadaan karakter di gedung

Untuk agent aktif, keadaan **dihitung** (`database.turunkan_keadaan`):
`RUNNING` → kerja, `REVIEW` + QA lulus → menunggu, selain itu santai.
Agent lain masih bisa melapor lewat `lapor.py` / papan lama, dan ditandai **Basi?** kalau mengaku kerja
lebih dari 10 menit tanpa kabar.

## Menambah agent aktif berikutnya

1. Tambahkan nama dan perannya di `config.AKTIF` (misalnya `"Kirana": "specialist"`).
2. Kalau perannya bukan web, buat prompt specialist khusus di `worker.py`.
3. Tambah tes integrasi untuk alurnya sebelum dipakai.
