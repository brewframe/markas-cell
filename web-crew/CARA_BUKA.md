# Web Markas Cell 2.1 · gaya CrewAI

## Cara memakai
1. **Pakai sungguhan:** klik dua kali `MULAI.bat` di folder `markas-cell`. Server + worker menyala, browser terbuka di http://localhost:8300.
2. Buka **Papan Tugas** → tempel kunci owner (file `.env`, baris `MARKAS_KUNCI_OWNER`) → **Masuk**.
3. Tulis perintah → **Kirim ke Jarvis**. Kartu bergerak sendiri: Antre → Dikerjakan → Cek QA → Menunggu OK.
4. Klik **✓ OK** atau **Revisi**. Klik kartu untuk melihat hasil QA, file hasil, dan riwayat.

**Cuma mau lihat-lihat?** Klik dua kali `web-crew/index.html`. Web jalan dalam **mode demo** (data contoh, tidak menyentuh database).

Tampilan lama (gedung 3D, kontrol) masih ada di http://localhost:8300/lama/

## Halaman
| Halaman | Isi | Data dari |
|---|---|---|
| `index.html` | Hero gedung, alur crew, lift 5 lantai, statistik | `/api/snapshot` |
| `papan.html` | Papan tugas + perintah + OK/Revisi | `/api/tugas`, `/api/perintah`, `/api/masuk` |
| `crew.html` | Kartu agent, status, riwayat tugas | `/api/tim`, `/api/agent/{nama}` |
| `pantau.html` | Token, biaya, CPU/RAM, log | `/api/snapshot` |

## File
| File | Fungsi |
|---|---|
| `css/crew.css` | Semua warna (bagian `:root`) dan skala ukuran huruf `--fs-*` |
| `js/seni.js` | Mesin gambar: hero, lantai 1-4, rooftop. Tajam sampai 4K |
| `js/umum.js` | Cek server, status live, scroll halus, notifikasi |
| `js/beranda.js` `papan.js` `crew.js` `pantau.js` | Isi tiap halaman |
| `js/pixel.js` | Karakter pixel dari `look` di tim.json |
| `js/data.js` | Salinan tim.json untuk mode demo. Perbarui: `python buat_data.py` |

## Palet (dari logo Menara Agent)
`#1c1a17` arang · `#f5f1e8` krem · `#e8a317` emas
Status: `#2ec4b6` kerja · `#f2c14e` menunggu OK · `#ab7df8` cek QA · `#4cc38a` selesai · `#4fc3f7` santai

## Tes
- `python tes_markas.py` → 33 tes backend (termasuk halaman web)
- `node tests/e2e_web.js` → alur lengkap di browser: masuk, perintah, QA, revisi, setujui
- `node tests/e2e_web.js layar` → sama, plus screenshot laptop / 4K / HP di folder `layar`
