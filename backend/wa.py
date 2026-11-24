"""Kurir WhatsApp Markas Cell (lewat Fonnte).

Analogi: ini "kurir pos" kantor. Siapa pun di gedung (server, worker, jadwal laporan)
cukup menyerahkan teks ke kurir; kurir yang tahu alamat (WA_TUJUAN) dan kunci pintunya
(FONNTE_TOKEN). Kalau token belum diisi, kurir tidak mengirim apa pun, tapi memberi
tautan wa.me supaya kamu bisa mengirim manual.

Setelan di .env:
    FONNTE_TOKEN=xxxxx        token dari fonnte.com
    WA_TUJUAN=628xxxxxxxxxx   nomor WA kamu (awali 62, tanpa + dan spasi)
    WA_NOTIF=1                kabar otomatis saat tugas menunggu OK / gagal (0 = mati)
"""
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request

import config

ALAMAT_FONNTE = "https://api.fonnte.com/send"


def setelan() -> dict:
    env = config.baca_env()
    tujuan = re.sub(r"\D", "", env.get("WA_TUJUAN", ""))
    token = env.get("FONNTE_TOKEN", "").strip()
    return {"token": token, "tujuan": tujuan,
            "notif": env.get("WA_NOTIF", "1").strip() != "0" and bool(token and tujuan)}


def status() -> dict:
    """Ringkasan aman untuk browser: TIDAK pernah berisi token atau nomor lengkap."""
    s = setelan()
    return {"siap": bool(s["token"] and s["tujuan"]), "ada_tujuan": bool(s["tujuan"]), "ada_token": bool(s["token"]),
            "notif": s["notif"], "tujuan_samar": ("…" + s["tujuan"][-4:]) if s["tujuan"] else ""}


def tautan_manual(teks: str, tujuan: str) -> str:
    return "https://wa.me/" + tujuan + "?text=" + urllib.parse.quote(teks)


def _kirim_fonnte(teks: str, token: str, tujuan: str) -> None:
    isi = urllib.parse.urlencode({"target": tujuan, "message": teks}).encode()
    req = urllib.request.Request(ALAMAT_FONNTE, data=isi, method="POST", headers={"Authorization": token})
    with urllib.request.urlopen(req, timeout=30) as r:
        jawab = json.loads(r.read() or b"{}")
    if not jawab.get("status"):
        raise RuntimeError(f"Fonnte menolak: {str(jawab.get('reason') or jawab)[:200]}")


def kirim(teks: str) -> dict:
    """Kirim teks ke WA_TUJUAN. Tidak pernah melempar error: hasilnya selalu dict.

    cara = "fonnte"   terkirim otomatis
           "manual"   token kosong, pakai tautan wa.me
           "belum"    WA_TUJUAN belum diisi
           "gagal"    Fonnte menolak / internet mati (lihat pesan)
    """
    s = setelan()
    if not s["tujuan"]:
        return {"terkirim": False, "cara": "belum", "pesan": "WA_TUJUAN belum diisi di file .env"}
    if not s["token"]:
        return {"terkirim": False, "cara": "manual", "pesan": "FONNTE_TOKEN kosong. Klik tautan untuk kirim manual.",
                "tautan": tautan_manual(teks, s["tujuan"])}
    try:
        _kirim_fonnte(teks, s["token"], s["tujuan"])
    except Exception as e:  # jaringan putus, token salah, kuota habis, dll.
        return {"terkirim": False, "cara": "gagal", "pesan": str(e)[:200], "tautan": tautan_manual(teks, s["tujuan"])}
    return {"terkirim": True, "cara": "fonnte", "pesan": "Terkirim ke WA …" + s["tujuan"][-4:]}


# ---------- perintah "kirim laporan ke WA" ----------
_POLA_LAPORAN = re.compile(
    r"^\s*(tolong\s+|jarvis[,\s]+)*(kirim(kan)?|send)\b.*\b(laporan|report|rekap|ringkasan)\b.*\b(wa|whatsapp)\b"
    r"|^\s*(tolong\s+|jarvis[,\s]+)*(laporan|rekap|report)\b.*\b(ke|via|lewat)\s+(wa|whatsapp)\b", re.I)


def minta_laporan(teks: str) -> bool:
    """True kalau perintah Cell berarti 'kirim laporan ke WA' (dikerjakan langsung, tanpa AI)."""
    return bool(_POLA_LAPORAN.search(teks or ""))


# ---------- kabar otomatis dari worker ----------
def siapkan_tabel(con) -> None:
    con.execute("""CREATE TABLE IF NOT EXISTS notif_wa (
        tugas INTEGER NOT NULL, jenis TEXT NOT NULL, waktu TEXT NOT NULL, hasil TEXT DEFAULT '',
        PRIMARY KEY (tugas, jenis))""")


def kabari_perubahan(con, alamat_web: str = "http://localhost:8300/lama/markas.html") -> int:
    """Kirim kabar WA untuk tugas yang baru lolos QA (menunggu OK) atau baru gagal.
    Setiap tugas hanya dikabari sekali per jenis (dicatat di tabel notif_wa)."""
    s = setelan()
    if not s["notif"]:
        return 0
    from db import sekarang
    import database as data

    siapkan_tabel(con)
    baris = con.execute(
        """SELECT t.id, t.judul, t.agent, t.status, t.error, t.revisi,
                  CASE WHEN t.status='FAILED' THEN 'gagal' ELSE 'perlu_ok' END jenis
           FROM tugas t
           WHERE ((t.status='REVIEW' AND t.qa_status='lulus') OR t.status='FAILED')
             AND t.diperbarui >= datetime('now','localtime','-2 hours')
             AND NOT EXISTS (SELECT 1 FROM notif_wa n WHERE n.tugas=t.id
                             AND n.jenis = (CASE WHEN t.status='FAILED' THEN 'gagal' ELSE 'perlu_ok' || t.revisi END))
           ORDER BY t.id LIMIT 5""").fetchall()
    n = 0
    for r in baris:
        if r["jenis"] == "gagal":
            teks = (f"🔴 *Tugas #{r['id']} gagal*\n{r['judul']} ({r['agent']})\n"
                    f"Sebab: {(r['error'] or '-')[:160]}\nBuka {alamat_web} untuk mengulang.")
            jenis = "gagal"
        else:
            teks = (f"🟡 *Menunggu OK kamu*\n#{r['id']} {r['judul']}\nDikerjakan {r['agent']}, QA Vera lulus"
                    + (f" (revisi ke-{r['revisi']})" if r["revisi"] else "") + f".\nSetujui di {alamat_web}")
            jenis = "perlu_ok" + str(r["revisi"])
        h = kirim(teks)
        con.execute("INSERT OR REPLACE INTO notif_wa VALUES (?,?,?,?)", (r["id"], jenis, sekarang(), h["cara"]))
        data.catat(con, "sistem", f"Kabar WA tugas #{r['id']}: {h['pesan']}", "ok" if h["terkirim"] else "warn", commit=False)
        con.commit()
        n += 1
    return n
