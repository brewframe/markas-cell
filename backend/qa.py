"""QA Vera: memeriksa hasil kerja sebelum sampai ke Cell.

Dua lapis pemeriksaan:
1. Cek otomatis (tanpa AI): ada file, ukuran wajar, HTML bisa dibaca, tidak ada kunci rahasia.
2. Penilaian Vera (AI, hanya membaca): setiap kriteria lulus dinilai satu per satu.
Tugas hanya lulus QA kalau KEDUA lapis lulus.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser

import config
import database as data
import tugas as T
from adapter import AdapterAgent, AdapterError
from adapter.dasar import ambil_json

POLA_RAHASIA = [
    (re.compile(r"sk-ant-[A-Za-z0-9_\-]{10,}"), "kunci Anthropic"),
    (re.compile(r"sk-[A-Za-z0-9]{20,}"), "kunci API"),
    (re.compile(r"(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]"), "nilai rahasia"),
    (re.compile(r"MARKAS_KUNCI_[A-Z]+\s*=\s*\S+"), "kunci Markas"),
]
BATAS_UKURAN = 5 * 1024 * 1024

PROMPT = """PERAN: QA (Vera, Manajer QA Markas Cell)
Periksa file di folder kerja ini (gunakan alat Read/Glob). Jangan mengubah file apa pun.

Tujuan tugas: {tujuan}
Kriteria lulus:
{kriteria}

Nilai SETIAP kriteria dengan jujur berdasarkan isi file. Jangan menilai lulus kalau tidak yakin.
Balas HANYA dengan JSON:
{{"lulus": true/false, "catatan": "ringkasan untuk owner, maks 3 kalimat",
  "kriteria": [{{"kriteria": "...", "lulus": true/false, "alasan": "..."}}]}}"""


class _CekHTML(HTMLParser):
    pass


def cek_otomatis(con, tid: int, artefak: list[dict]) -> list[dict]:
    folder = T.folder_kerja(con, tid)
    cek = [{"cek": "Ada file hasil", "lulus": bool(artefak), "detail": f"{len(artefak)} file"}]
    for a in artefak:
        f = folder / a["path"]
        if a["ukuran"] > BATAS_UKURAN:
            cek.append({"cek": f"Ukuran {a['path']}", "lulus": False, "detail": f"{a['ukuran']} byte > 5 MB"})
            continue
        try:
            isi = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue       # file biner (gambar dll) tidak dicek isinya
        temuan = [nama for pola, nama in POLA_RAHASIA if pola.search(isi)]
        cek.append({"cek": f"Tanpa data rahasia: {a['path']}", "lulus": not temuan,
                    "detail": ", ".join(temuan) or "bersih"})
        if a["path"].lower().endswith((".html", ".htm")):
            try:
                _CekHTML().feed(isi)
                ok = "<html" in isi.lower() or "<!doctype" in isi.lower()
                cek.append({"cek": f"HTML terbaca: {a['path']}", "lulus": ok,
                            "detail": "struktur dasar ada" if ok else "tidak ada tag <html>"})
            except Exception as e:  # HTMLParser jarang gagal, tapi jangan sampai worker berhenti
                cek.append({"cek": f"HTML terbaca: {a['path']}", "lulus": False, "detail": str(e)[:200]})
    return cek


def periksa(con, t: dict, adapter: AdapterAgent) -> bool:
    """Jalankan QA untuk tugas REVIEW. Lulus -> menunggu Cell. Gagal -> REVISION / FAILED."""
    tid, versi = t["id"], t["revisi"]
    data.set_status(con, "Vera", "kerja", f"QA tugas #{tid}")
    try:
        artefak = [dict(r) for r in con.execute("SELECT * FROM artefak WHERE tugas=? AND versi=?", (tid, versi))]
        cek = cek_otomatis(con, tid, artefak)
        lulus_otomatis = all(c["lulus"] for c in cek)
        catatan = ""
        if lulus_otomatis:
            kriteria = "\n".join(f"- {k}" for k in t["kriteria"])
            h = adapter.jalankan(PROMPT.format(tujuan=t["tujuan"], kriteria=kriteria), T.folder_kerja(con, tid),
                                 boleh_tulis=False, batas_detik=config.BATAS_WAKTU_AGENT)
            data.catat_token(con, "Vera", h.model, h.masuk, h.keluar, sumber="worker", biaya_usd=h.biaya_usd,
                             kunci=h.sesi, tugas=tid)
            nilai = ambil_json(h.teks)
            for k in nilai.get("kriteria") or []:
                cek.append({"cek": f"Kriteria: {k.get('kriteria', '')}"[:300], "lulus": bool(k.get("lulus")),
                            "detail": str(k.get("alasan", ""))[:500]})
            catatan = str(nilai.get("catatan", ""))[:1000]
            lulus = bool(nilai.get("lulus")) and all(c["lulus"] for c in cek)
        else:
            lulus = False
            catatan = "Cek otomatis gagal: " + "; ".join(f"{c['cek']} ({c['detail']})" for c in cek if not c["lulus"])
        T.simpan_qa(con, tid, versi, lulus, cek, catatan, "Vera" if lulus_otomatis else "cek otomatis")
        if lulus:
            con.execute("UPDATE tugas SET qa_status='lulus', diperbarui=datetime('now','localtime') WHERE id=?", (tid,))
            data.catat(con, "Vera", f"QA #{tid} LULUS, menunggu OK Cell", "ok", commit=False)
            con.commit()
            data.turunkan_keadaan(con, t["agent"])
        else:
            con.execute("UPDATE tugas SET qa_status='gagal' WHERE id=?", (tid,))
            con.commit()
            T.minta_revisi(con, tid, "Vera", "qa", "QA: " + (catatan or "kriteria belum terpenuhi"))
        return lulus
    except AdapterError as e:
        n = t["qa_percobaan"] + 1
        con.execute("UPDATE tugas SET qa_status=?, qa_percobaan=?, error=? WHERE id=?",
                    ("error" if n >= 2 else "menunggu", n, f"QA error: {e}"[:2000], tid))
        data.catat(con, "Vera", f"QA #{tid} error ({n}x): {e}", "error", commit=False)
        con.commit()
        return False
    finally:
        data.set_status(con, "Vera", "santai", "")
