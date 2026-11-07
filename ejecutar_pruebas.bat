@echo off
REM ==============================================================
REM  ejecutar_pruebas.bat - Pruebas automaticas con Selenium
REM
REM  Que hace:
REM   1. Busca Python e instala Selenium y ReportLab si faltan.
REM   2. Abre Chrome y ejecuta las pruebas del formulario A LA VISTA
REM      (se ve como escribe en cada campo y el resultado de cada prueba).
REM   3. Genera un reporte PDF en pruebas\reportes y lo abre.
REM
REM  Opciones (escribirlas despues del nombre del .bat en una consola):
REM    ejecutar_pruebas.bat --rapido    sin pausas
REM    ejecutar_pruebas.bat --oculto    sin mostrar el navegador
REM ==============================================================
title Pruebas automaticas - Formulario de reservas
cd /d "%~dp0"
set PYTHONUTF8=1

REM --- 1. Buscar Python: primero "py" y si no existe, "python" ---
set PYTHON=
py --version >nul 2>&1 && set PYTHON=py
if not defined PYTHON (
  python --version >nul 2>&1 && set PYTHON=python
)
if not defined PYTHON (
  echo [ERROR] No se encontro Python. Instalalo desde https://www.python.org
  pause
  exit /b 1
)

REM --- 2. Instalar las librerias si faltan ---
%PYTHON% -c "import selenium, reportlab" >nul 2>&1
if errorlevel 1 (
  echo Instalando Selenium y ReportLab, espera un momento...
  %PYTHON% -m pip install -r pruebas\requirements.txt
  if errorlevel 1 (
    echo [ERROR] No se pudieron instalar las librerias. Revisa la conexion a internet.
    pause
    exit /b 1
  )
)

REM --- 3. Ejecutar las pruebas ---
%PYTHON% pruebas\pruebas_formulario.py %*
set RESULTADO=%errorlevel%

echo.
if "%RESULTADO%"=="0" (
  echo   Todas las pruebas pasaron. El reporte PDF se abrio automaticamente.
) else (
  echo   Hubo pruebas fallidas o un error. Revisa el reporte PDF y los mensajes de arriba.
)
echo.
pause
exit /b %RESULTADO%
