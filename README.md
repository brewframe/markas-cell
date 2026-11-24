# Markas Cell

Kantor virtual untuk tim agent AI. Satu perintah dari pemilik masuk ke **Jarvis** (pemecah tugas), dikerjakan **Bayu** (pembuat file), diperiksa **Vera** (QA), lalu **menunggu persetujuan pemilik** sebelum dianggap selesai. Semua tercatat di database.

**Demo langsung (tanpa instal):** https://brewframe.github.io/markas-cell/
Demo memakai data contoh. Papan Tugas tidak bisa menerima perintah sungguhan di versi ini.

## Alur kerja

```
Cell -> Jarvis (memecah perintah) -> Bayu (membuat file) -> Vera (QA) -> Cell menyetujui
```

Status tugas tidak boleh melompat: PENDING, ASSIGNED, RUNNING, REVIEW, APPROVED (ditambah REVISION dan FAILED).

## Isi proyek

| Folder / file | Fungsi |
|---|---|
| `backend/main.py` | Server FastAPI: API, halaman web, SQLite |
| `backend/worker.py` | Pekerja yang menjalankan Jarvis, Bayu, Vera lewat Claude Code |
| `backend/laporan_wa.py` | Laporan harian ke WhatsApp (Fonnte) |
| `backend/perintah_harian.py` | Mengirim perintah tetap harian ke Jarvis |
| `web-crew/` | Web utama: Beranda, Papan Tugas, Kenali Crew, Pantau |
| `web/` | Tampilan lama (gedung 3D), di `/lama/` |
| `tests/` | Tes API dan tes browser (Playwright) |
| `docs/` | Dokumentasi dan changelog |

## Menjalankan di komputer sendiri (Windows)

Syarat: **Python 3.10+**. Untuk agent sungguhan: **Claude Code** terpasang dan login.

```bat
git clone https://github.com/brewframe/markas-cell.git
cd markas-cell
pip install -r requirements.txt
```

- **Coba cepat (demo, aman):** klik dua kali `MULAI_DEMO.bat`, lalu buka http://localhost:8300
- **Pakai sungguhan:** klik dua kali `MULAI.bat` (server + worker), buka http://localhost:8300/papan.html dan masuk dengan kunci owner dari file `.env`.

Rahasia (`.env`, kunci owner, token WhatsApp) dibuat lokal dan **tidak ikut repo**.

## Tes

```bat
python -m pytest tests
```

Detail lengkap: `CARA_JALANKAN.md` dan folder `docs/`.
