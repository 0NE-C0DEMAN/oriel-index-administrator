@echo off
REM ============================================================
REM  Oriel · Index Administrator — frontend dev server
REM  Babel-Standalone fetches .jsx via XHR, which file:// blocks.
REM  So we serve the folder via Python's built-in HTTP server.
REM ============================================================
cd /d "%~dp0"
echo.
echo  Oriel UI dev server  ->  http://localhost:8000
echo  Press Ctrl+C to stop
echo.
python -m http.server 8000
