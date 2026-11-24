@echo off
REM Menjalankan semua tes otomatis (unit, API, integrasi). Data asli tidak disentuh.
cd /d %~dp0
set PY=python
where python >nul 2>nul || set PY=py
%PY% tes_markas.py
pause
