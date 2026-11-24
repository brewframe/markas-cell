@echo off
REM Mematikan semua jadwal otomatis Markas Cell (tidak menghapus data apa pun).
for %%t in (MarkasCell-Nyala MarkasCell-Perintah MarkasCell-Laporan) do schtasks /Delete /TN %%t /F
echo Semua jadwal Markas Cell dihapus.
pause
