# Laporan pengujian Markas Cell 2.0

Tanggal: 2026-11-15. Lingkungan: Linux, Python 3, Chromium (Playwright), Claude Code CLI yang sudah login.
Semua tes memakai folder data sementara dan **tidak menyentuh `data/markas.db` asli**.

## 1. Tes otomatis: 32/32 lulus

Cara jalan: `python tes_markas.py` (atau klik `TES.bat`). Waktu sekitar 2 detik.

| Kelompok | Jumlah | Yang dibuktikan |
|---|---|---|
| Database (`test_unit.TesDatabase`) | 8 | FK aktif dan ditegakkan, isi tim berulang aman, alias agent, keadaan ilegal ditolak, token beda model dijumlah benar, token dengan kunci tidak ganda, status basi tidak dihitung "kerja" |
| State machine (`TesStateMachine`) | 5 | transisi ilegal ditolak dan tercatat, REVIEW wajib artefak, APPROVED wajib QA, klaim tidak bisa dobel, retry dengan jeda lalu FAILED, tugas ke agent belum aktif ditolak |
| Backup (`TesBackup`) | 2 | backup + pulihkan, migrasi dari database v1 asli (data lama tetap ada di `tugas_v1`) |
| API (`test_api`) | 12 | baca tanpa kunci boleh, tulis tanpa kunci 401, kunci agent tidak boleh memberi perintah (403), sesi cookie owner, Host asing 400, rate limit 429, enum salah 422, transisi ilegal 409, idempotensi, mode STALE tanpa worker, demo tidak menyentuh database asli |
| Integrasi (`test_integrasi`, adapter uji) | 5 | perintah sampai disetujui, owner minta revisi, QA menolak lalu revisi lalu FAILED, agent gagal dicoba ulang tanpa artefak dobel, tugas yatim dikembalikan |

## 2. Tes browser E2E: lulus

`node tests/e2e_kontrol.js` menyalakan server dan worker (adapter uji) sendiri, lalu memeriksa:

```
ok  kunci salah ditolak
ok  masuk sebagai owner
ok  cookie sesi tidak terbaca JavaScript (HttpOnly)
ok  mode LIVE (worker terdeteksi)
ok  perintah diterima
ok  tugas #1 masuk "Perlu persetujuanmu" dengan QA lulus
ok  laci menampilkan file hasil
ok  laci menampilkan hasil QA
ok  tugas masuk revisi ke-1
ok  status akhir APPROVED
ok  riwayat lengkap: PENDING > ASSIGNED > RUNNING > REVIEW > REVISION > RUNNING > REVIEW > APPROVED
ok  persetujuan Cell tercatat
ok  kartu hilang dari daftar persetujuan
ok  tidak ada error JavaScript / dialog
E2E LULUS
```

## 3. Uji nyata dengan Claude Code (bukan adapter uji)

Database awal: salinan database v1 milik Cell. Migrasi berjalan, dan backup `sebelum-migrasi-v2` dibuat otomatis.

**Perintah #1 dari Cell:**
> Buatkan landing page satu halaman untuk usaha laundry kiloan bernama Laundry Bersih di Bandung: hero, daftar harga contoh, cara pesan, dan tombol WhatsApp (nomor contoh). Responsif di HP.

| Waktu | Kejadian | Pelaku |
|---|---|---|
| 16:36:47 | perintah masuk | Cell |
| 16:36:56 | dipecah jadi 1 tugas dengan 6 kriteria lulus (status PENDING > ASSIGNED) | Jarvis, dispatcher |
| 16:36:56 → 16:37:33 | menulis `index.html`, `style.css`, `script.js` (status RUNNING > REVIEW) | Bayu |
| 16:37:50 | QA lulus: cek otomatis + 6 kriteria diperiksa AI | Vera |
| 16:38:55 | **minta revisi**: "tambahkan testimoni 3 kartu [CONTOH], tombol hijau toska" | Cell |
| 16:38:56 → 16:39:27 | revisi ke-1 (status REVISION > RUNNING > REVIEW) | Bayu |
| 16:39:42 | QA versi 1 lulus | Vera |
| 16:39:54 | **disetujui** (status APPROVED) | Cell |

Hasil revisi dicek manual:
- Ada bagian "Kata Pelanggan" dengan 3 kartu, dan nama contohnya bertanda [CONTOH].
- Warna tombol berubah ke `--toska: #0f766e`.
- Tanda `[CONTOH]` muncul 13 kali.
- Tidak ada gulir horizontal di lebar 390 px.

Pemeriksaan keamanan pada server yang sama:
- Kunci agent mencoba menyetujui ditolak 403.
- Tanpa kunci ditolak 401.
- Menyetujui dua kali ditolak 409 dan tercatat di riwayat.

**Biaya nyata** (dari `total_cost_usd` Claude Code, model `claude-sonnet-5-5`):

| Agent | Panggilan | Token masuk (termasuk cache) | Token keluar | USD |
|---|---|---|---|---|
| Jarvis | 1 | 40.363 | 604 | 0,073 |
| Bayu | 2 | 271.425 | 10.188 | 0,414 |
| Vera | 2 | 255.682 | 3.605 | 0,224 |
| **Total** | 5 | 567.470 | 14.397 | **0,71** |

Sebagian besar token masuk adalah cache prompt Claude Code, jadi biayanya jauh lebih kecil daripada yang terlihat dari jumlah token.

Bukti gambar ada di `docs/bukti/`: `kontrol.png`, `detail-tugas.png`, dan `hasil-bayu.png`.

## 4. Bug yang ditemukan saat pengujian dan sudah diperbaiki

| Bug | Penyebab | Perbaikan |
|---|---|---|
| Jarvis memecah satu website menjadi 3 tugas; tugas CSS tidak bisa melihat HTML | tiap tugas punya folder sendiri | aturan prompt: satu deliverable = satu tugas |
| Worker `--sekali` berikutnya menolak jalan | detak worker lama tertinggal | worker menghapus detaknya saat berhenti |
| Folder tugas bisa bertabrakan setelah database direset | id mulai dari 1 lagi | nama folder memakai waktu pembuatan |
| `periksa()` diam-diam mengubah file backup | membuat tabel `schema_version` | cek dulu tabelnya ada |
| Kontrol menampilkan "Sedang kerja 9" padahal tidak ada yang kerja | status lama dari data v1 | status basi (>10 menit) tidak dihitung kerja |

## 5. Yang belum diuji

- Belum dijalankan di Windows sungguhan. File `.bat` ditulis dengan CRLF tetapi belum diklik di laptop Cell.
- Belum ada tes beban (banyak tugas sekaligus). Worker memang sengaja serial: satu tugas satu waktu.
- Belum diuji dengan agent selain Bayu karena specialist lain belum diaktifkan.
