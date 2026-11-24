# Skema database (SQLite, versi 2)

File: `data/markas.db` (mode demo: `data/markas-demo.db`, terpisah).
Setiap koneksi menyalakan `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, dan `busy_timeout`, jadi server dan worker bisa membaca dan menulis bersamaan dengan aman.

## Migrasi

Tabel `schema_version` mencatat migrasi yang sudah jalan. Sebelum mengubah database lama, `db.siapkan()` membuat backup otomatis ke `data/cadangan/` (contoh: `markas-...-sebelum-migrasi-v2.db`).

| Versi | Isi |
|---|---|
| 1 | tabel asli: lantai, ruang, agent, koneksi, tugas (v1), log, token, metrik |
| 2 | Markas 2.0: tabel `tugas` v1 diganti nama menjadi `tugas_v1` (data tidak dihapus), tabel baru di bawah, kolom baru di agent dan token |

## Tabel dari versi 1

| Tabel | Isi |
|---|---|
| lantai, ruang | denah gedung |
| agent | id (nama), lantai, ruang, keadaan, pesan, diperbarui, **aktif** (baru), **peran** (baru: orkestrator / specialist / qa) |
| koneksi | serah-terima antar agent untuk gambar alur |
| log | catatan kejadian (dibersihkan setelah 30 hari) |
| token | pemakaian token. Kolom baru: **sumber** (lapor / worker), **biaya_usd**, **kunci** (unik, untuk idempotensi), **tugas** |
| metrik | CPU dan RAM laptop |
| tugas_v1 | arsip tugas lama (status antri/jalan/selesai). Hanya disimpan, tidak dipakai |

## Tabel baru di versi 2

| Tabel | Kolom penting | Gunanya |
|---|---|---|
| perintah | teks, prioritas, status `BARU/DIPROSES/DIPECAH/DITOLAK/GAGAL`, catatan | perintah Cell ke Jarvis |
| tugas | perintah (FK), judul, tujuan, kriteria (JSON), agent (FK), prioritas, status (7 nilai, CHECK), qa_status, percobaan, revisi, qa_percobaan, coba_setelah, worker, adapter, ringkasan, error, waktu-waktu | kontrak kerja satu specialist |
| riwayat_tugas | tugas, dari, ke, pelaku, peran, alasan, **ditolak** | jejak audit setiap perubahan status, termasuk yang ditolak |
| artefak | tugas, versi (= nomor revisi), path, ukuran, sha256, jenis. UNIQUE(tugas, versi, path) | bukti file hasil kerja. Tanpa artefak, tugas tidak boleh ke REVIEW |
| handoff | tugas, dari, ke, konteks (JSON) | serah-terima Bayu -> Vera |
| qa_hasil | tugas, versi, lulus, cek (JSON per kriteria), catatan, penilai | hasil pemeriksaan otomatis + AI |
| persetujuan | tugas, keputusan `setuju/revisi/tolak`, alasan, oleh | keputusan Cell |
| idem | kunci, jalur, respons | Idempotency-Key (dibersihkan setelah 7 hari) |
| layanan | nama, detak, info | detak jantung worker. Kalau lebih dari 20 detik, dashboard menampilkan STALE |

Semua tabel anak memakai `ON DELETE CASCADE` ke `tugas`, jadi tidak ada baris yatim.

## Backup dan pemulihan

```bash
python backend/db.py backup            # salin aman (backup API SQLite)
python backend/db.py periksa <file>    # integrity_check + versi, tanpa mengubah file
python backend/db.py pulihkan <file>   # backup database sekarang dulu, baru diganti
```

Backup data lama sebelum 2.0 tersimpan di `data/cadangan/markas-v1-sebelum-2.0.db`.
