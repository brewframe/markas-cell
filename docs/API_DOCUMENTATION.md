# API Markas Cell 2.0

Alamat bawaan: `http://localhost:8300`. Dokumentasi interaktif otomatis: `/docs` (Swagger dari FastAPI).

## Peran dan cara membuktikan diri

| Peran | Cara | Boleh |
|---|---|---|
| viewer | tidak perlu apa-apa | semua `GET`, kecuali file artefak |
| agent | header `X-Markas-Key: <MARKAS_KUNCI_AGENT>` | `POST /api/status`, `POST /api/token` |
| owner | header `X-Markas-Key: <MARKAS_KUNCI_OWNER>`, atau cookie sesi dari `POST /api/masuk` | semuanya |

Kedua kunci dibuat otomatis di file `.env` saat server pertama kali menyala. Browser hanya menyimpan cookie sesi `markas_sesi` (HttpOnly, SameSite=Strict, berlaku 12 jam), bukan kuncinya.

## Kode jawaban umum

| Kode | Arti |
|---|---|
| 200 | berhasil |
| 400 | header Host bukan localhost / 127.0.0.1 / [::1] |
| 401 | belum masuk atau kunci salah |
| 403 | kunci benar tetapi perannya tidak berhak (misalnya kunci agent memberi perintah) |
| 404 | tugas, agent, atau file tidak ada |
| 409 | perubahan status melanggar aturan, atau sedang mode demo |
| 422 | isi request tidak valid (pydantic) |
| 429 | lebih dari 30 request tulis per 10 detik dari IP yang sama ke jalur yang sama |

## Baca (viewer)

| Metode | Jalur | Isi |
|---|---|---|
| GET | `/api/snapshot?setelah=<id log>` | semua yang dibutuhkan dashboard: agent, 30 tugas terbaru, 8 perintah, log baru, token, metrik, statistik, `mode` (DEMO/LIVE/STALE), `worker` |
| GET | `/api/health` | status server, versi database, mode, info worker |
| GET | `/api/saya` | peran pemanggil saat ini (`viewer` / `agent` / `owner`) |
| GET | `/api/gedung` | denah lantai dan ruang |
| GET | `/api/tim` | daftar agent beserta profil |
| GET | `/api/agent`, `/api/agent/{nama}` | data agent; nama boleh alias |
| GET | `/api/tugas` | daftar tugas |
| GET | `/api/tugas/{id}` | detail lengkap: riwayat status (termasuk yang ditolak), artefak, handoff, hasil QA, persetujuan, token, teks perintah asal |
| GET | `/api/perintah` | perintah yang masuk ke Jarvis dan statusnya |
| GET | `/api/log?setelah=<id>` | log kejadian |

## Sesi owner

```http
POST /api/masuk     {"kunci": "o_..."}   -> set cookie, {"peran":"owner"}
POST /api/keluar                          -> hapus cookie
```

## Laporan agent (agent / owner)

```http
POST /api/status  {"agent":"Nova","keadaan":"kerja|menunggu|santai","pesan":"..."}
POST /api/token   {"agent":"Nova","model":"haiku","masuk":1200,"keluar":350}
                  Header opsional Idempotency-Key: laporan yang sama tidak tercatat dua kali.
```

Untuk agent yang **aktif** di 2.0 (Jarvis, Bayu, Vera), keadaan dihitung dari tugasnya, jadi laporan status manual tidak menimpanya.

## Perintah dan tugas (owner)

| Metode | Jalur | Body | Hasil |
|---|---|---|---|
| POST | `/api/perintah` | `{"teks": "5-2000 huruf", "prioritas": "rendah/normal/tinggi"}` | perintah `BARU`, nanti dipecah Jarvis |
| POST | `/api/tugas` | `{"judul","tujuan","kriteria":[maks 6],"agent":"Bayu","prioritas"}` | tugas langsung ke specialist, status `PENDING` |
| POST | `/api/tugas/{id}/setujui` | `{"alasan": ""}` | `REVIEW -> APPROVED`. Ditolak 409 kalau QA belum lulus |
| POST | `/api/tugas/{id}/revisi` | `{"alasan": "wajib, min 3 huruf"}` | `REVIEW -> REVISION`. Kalau jatah revisi (2x) habis -> `FAILED` |
| POST | `/api/tugas/{id}/ulang` | - | `FAILED -> PENDING` |
| GET | `/api/tugas/{id}/artefak/{aid}` | - | file hasil agent, dikirim dengan `Content-Security-Policy: sandbox` |

`POST /api/perintah` dan `POST /api/tugas` menerima header `Idempotency-Key`. Kalau tombol terklik dua kali, jawaban kedua sama dengan yang pertama dan tidak ada tugas ganda.

Mode demo (`--demo`) menolak perintah dan tugas dengan 409, supaya data contoh tidak tercampur dengan pekerjaan sungguhan.

## Contoh dari terminal

```bash
K=o_xxxxx   # dari .env
curl -X POST localhost:8300/api/perintah -H "X-Markas-Key: $K" -H "Content-Type: application/json" \
     -d '{"teks":"Buat landing page laundry di Bandung"}'
curl localhost:8300/api/tugas/1
curl -X POST localhost:8300/api/tugas/1/setujui -H "X-Markas-Key: $K" -H "Content-Type: application/json" -d '{}'
```
