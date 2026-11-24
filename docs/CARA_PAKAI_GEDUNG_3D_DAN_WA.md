# Markas Cell 2.2 · Gedung 3D sungguhan + laporan WhatsApp

Versi ini membuat **Gedung 3D** (tampilan lama) menjadi pusat kendali sungguhan, mirip video kantor virtual:
setiap karakter bergerak sesuai **data asli di database**, bukan animasi contoh.

## 1. Mana yang REAL, mana yang DEMO

| Cara menjalankan | Data | Agent bekerja? | Token |
|---|---|---|---|
| `MULAI_3D.bat` atau `MULAI.bat` | `data/markas.db` (asli) | **Ya**, lewat Claude Code di laptopmu | **Real**, dibaca dari keluaran Claude Code |
| `MULAI_DEMO.bat` | `data/markas-demo.db` | Tidak, hanya animasi | Contoh (label DEMO) |
| GitHub Pages | data contoh di browser | Tidak | Contoh |

Lihat lencana di pojok kanan atas: **Live** = real. **DEMO** / **Pratinjau** = contoh.
Worker mati = **Worker mati** (perintah tercatat tapi tidak dikerjakan).

## 2. Menjalankan (Windows, CMD)

```bat
cd /d C:\Users\LOQ\markas-cell
claude --version
```
Kalau `claude` belum ada: pasang Claude Code lalu jalankan `claude` sekali untuk login.

Lalu klik dua kali **`MULAI_3D.bat`**. Dua jendela terbuka:
- **Server**: browser terbuka di `http://localhost:8300/lama/markas.html` (gedung 3D)
- **Markas Worker**: yang benar-benar menjalankan Jarvis, Bayu, dan Vera

## 3. Memberi perintah dari gedung 3D

1. Panel kanan, tab **Perintah**. Tempel kunci owner (file `.env`, baris `MARKAS_KUNCI_OWNER`), klik **Masuk**.
2. Tulis perintah, misalnya `buatkan landing page laundry kiloan, ada tombol WA`, klik **Kirim ke Jarvis**.
3. Kamera terbang ke Lantai 4. **Jarvis, Cell, Bayu, dan Vera berjalan ke Ruang Rapat** (gelembung biru "Rapat perintah #1").
4. Bayu kembali ke mejanya di Lantai 2 dan bekerja. Gelembung putih di atas kepalanya berisi tugas yang sedang dikerjakan.
5. Vera memeriksa (QA). Kalau lulus, Bayu melambai dengan tanda **!** dan muncul di tab **Perlu OK**.
6. Di tab **Perlu OK**: **✓ OK** untuk menyetujui, **Revisi** untuk minta perbaikan, **Lihat hasil** untuk membuka file.

Token: HUD **🪙 Token hari ini** di atas gedung, dan klik karakter mana pun untuk melihat token agent itu hari ini.

## 4. WhatsApp

Isi file `.env` (folder markas-cell):
```
FONNTE_TOKEN=token_dari_fonnte.com
WA_TUJUAN=628xxxxxxxxxx
WA_NOTIF=1
```
Simpan, lalu tutup dan jalankan ulang `MULAI_3D.bat`.

| Kapan WA terkirim | Isi |
|---|---|
| Tugas lolos QA (menunggu OK) | "🟡 Menunggu OK kamu · #id judul · dikerjakan Bayu" |
| Tugas gagal | "🔴 Tugas #id gagal · sebabnya" |
| Kamu klik **Kirim laporan ke WA** (gedung 3D atau Papan Tugas) | Laporan lengkap per agent |
| Kamu perintahkan Jarvis: `kirim laporan ke WA` | Laporan lengkap per agent (langsung, tanpa memakai token AI) |
| Jadwal otomatis 20.00 (`OTOMATIS_PASANG.bat`) | Laporan lengkap per agent |

Contoh isi laporan per agent:
```
*Laporan per agent*
• *Jarvis* (membagi tugas) santai
   2 perintah dipecah · 4.120 token (±$0.03)
• *Bayu* (mengerjakan) sedang kerja: Buat landing page laundry
   1 selesai, 1 tunggu OK, 1 jalan · 58.300 token (±$0.41)
• *Vera* (memeriksa) santai
   2 QA lulus, 1 dikembalikan · 9.870 token (±$0.07)
```

Kalau `FONNTE_TOKEN` kosong, tidak ada WA otomatis. Tombol kirim memberi tautan **Buka WhatsApp** (wa.me) untuk mengirim manual.
`WA_NOTIF=0` mematikan kabar otomatis. Laporan lewat tombol tetap bisa.

## 5. Batasan yang jujur

- Yang bekerja sungguhan baru **Jarvis, Bayu, Vera**. 26 agent lain tampil di gedung dan bisa melapor status/token lewat `/api/token`, tapi belum mengerjakan tugas sendiri.
- Bayu hanya membuat **file** (HTML, CSS, JS, Markdown) di folder `hasil/`. Ia tidak mengirim email/WA ke klien dan tidak menjalankan perintah shell.
- Server hanya bisa dibuka dari laptopmu (`127.0.0.1`). Jangan membukanya ke internet, karena kunci owner mengendalikan agent.
- Token Fonnte & kunci owner ada di `.env`, yang tidak ikut ke GitHub.
