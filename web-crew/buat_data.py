"""Membuat ulang js/data.js dari ../data/tim.json dan ../data/gedung.json.
Jalankan setelah kamu mengubah tim.json:  python buat_data.py"""
import json
from pathlib import Path

SINI = Path(__file__).parent
DATA = SINI.parent / "data"
tim = json.loads((DATA / "tim.json").read_text(encoding="utf-8"))
g = json.loads((DATA / "gedung.json").read_text(encoding="utf-8"))
gedung = {
    "lantai": g["lantai"],
    "ruang": [{k: r[k] for k in ("id", "lantai", "nama", "divisi")} for r in g["ruang"]],
    "penempatan": g["penempatan"],
}
isi = json.dumps({"tim": tim, "gedung": gedung}, ensure_ascii=False)
(SINI / "js" / "data.js").write_text(
    "/* DATA.JS · dibuat otomatis oleh buat_data.py, jangan diedit manual */\nwindow.MARKAS = " + isi + ";\n",
    encoding="utf-8")
print("js/data.js diperbarui:", len(tim["agent"]), "agent")
