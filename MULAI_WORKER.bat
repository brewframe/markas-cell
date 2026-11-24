@echo off
REM Menjalankan WORKER saja (kalau jendela worker tertutup). Server harus sudah menyala lewat MULAI.bat.
REM Worker memakai Claude Code di laptop ini: pastikan perintah "claude" sudah terpasang dan login.
cd /d %~dp0
set PY=python
where python >nul 2>nul || set PY=py
%PY% backend\worker.py
pause
