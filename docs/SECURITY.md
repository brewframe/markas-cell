# Keamanan Markas Cell 2.0

Analogi: gedung punya tiga jenis kartu akses. **Owner** (Cell) boleh semuanya. **Agent** (skrip) hanya boleh melapor. **Viewer** (tamu) hanya boleh melihat.

## Ancaman yang ditutup

| Ancaman | Sebelum 2.0 | Sekarang |
|---|---|---|
| Siapa pun di jaringan/browser bisa membuat dan mengubah tugas | semua `POST` terbuka | `POST` wajib kunci owner/agent, diuji (`test_tulis_tanpa_kunci_ditolak_401`) |
| Situs jahat memakai DNS rebinding untuk memanggil `localhost:8300` | Host tidak dicek | Host selain `localhost`, `127.0.0.1`, `[::1]` ditolak 400 |
| Situs lain mengirim form atas nama Cell (CSRF) | - | sesi owner memakai cookie `SameSite=Strict` + `HttpOnly`. Kunci tidak disimpan di browser |
| Kunci agent dipakai untuk menyetujui tugas | - | peran dipisah: kunci agent hanya `status` dan `token` (403 untuk yang lain) |
| Banjir request | - | 30 request tulis per 10 detik per IP per jalur (429) |
| Klik dobel membuat tugas/token ganda | - | `Idempotency-Key` di perintah, tugas, token |
| Status dilompati (mis. langsung "selesai" tanpa hasil) | bebas | state machine + syarat: REVIEW wajib artefak, APPROVED wajib QA lulus. Pelanggaran dicatat |
| Agent menulis file di luar folder tugas | - | adapter Claude berjalan dengan `cwd` folder tugas, alat dibatasi `Read Write Edit Glob Grep`; `Bash`, `WebFetch`, `WebSearch`, `Task` dilarang |
| File hasil agent berisi HTML/JS jahat lalu dibuka owner | - | artefak dikirim dengan `Content-Security-Policy: sandbox` dan `nosniff`; path traversal (`../`) ditolak |
| Agent tidak sengaja menulis kunci API ke hasil | - | QA otomatis memindai pola rahasia (`sk-ant-...`, `api_key="..."`, `MARKAS_KUNCI_...`) dan menggagalkan tugas |
| Kunci bocor ke frontend/zip | - | kunci hanya di `.env` (tidak ikut zip, ada di `.gitignore`), dibandingkan waktu-konstan (`hmac.compare_digest`) |

## Kunci

- `.env` dibuat otomatis saat server pertama kali menyala:
  - `MARKAS_KUNCI_OWNER=o_...` untuk Cell, dipakai sekali di halaman Kontrol.
  - `MARKAS_KUNCI_AGENT=a_...` untuk skrip `lapor.py` dan hook agent.
- Kalau kunci bocor: hapus barisnya dari `.env`, lalu nyalakan ulang server. Kunci baru dibuat otomatis, dan sesi lama hilang karena disimpan di memori.
- Satu kunci dipakai bersama untuk semua agent. Kunci per agent belum dibuat (lihat batasan).

## Aturan kerja yang tetap berlaku (dari Buku Tim Agent)

- Tidak ada yang dikirim ke klien tanpa OK Cell. Tugas berhenti di `REVIEW` sampai Cell menekan Setujui.
- Tidak ada WA, email, atau posting otomatis. Adapter tidak punya alat jaringan.
- Angka contoh wajib bertanda `[CONTOH]`. Data finance hanya simulasi.

## Batasan yang diketahui (jujur)

1. **Hanya untuk satu laptop (localhost).** Server tidak memakai HTTPS. Jangan membuka port 8300 ke internet atau ke Wi-Fi umum.
2. **Kunci agent dipakai bersama.** Agent yang memegang kunci bisa melapor atas nama agent lain. Ini cukup untuk satu pemilik, tetapi perlu kunci per agent kalau nanti ada orang lain.
3. **Sesi disimpan di memori.** Kalau server dinyalakan ulang, Cell harus masuk lagi. Ini sengaja dibiarkan karena lebih aman dan sederhana.
4. **Claude Code memakai akun login Cell.** Biaya token masuk ke akun tersebut. Batas waktu per tugas 15 menit (`MARKAS_BATAS_WAKTU`).
5. **`acceptEdits` mengizinkan agent menulis file tanpa bertanya**, tetapi hanya di folder tugas. Pengamannya ada di daftar alat yang diizinkan, bukan sandbox sistem operasi.
