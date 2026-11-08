"""
Entorno de las pruebas Selenium de Konys Pizza.

- Genera js/config.js en modo PRUEBAS (apunta al Supabase local, nunca a la base real).
- Arranca tests/soporte/supabase-local.mjs (PostgreSQL embebido con las migraciones reales).
- Arranca scripts/servidor-local.mjs (mismas cabeceras y CSP que en Vercel).
- Abre Chrome con registro de consola y de red (goog:loggingPrefs).
- Al terminar restaura js/config.js (desde .env si existe).
"""
import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from selenium import webdriver

RAIZ = Path(__file__).resolve().parents[2]
PUERTO_WEB = 5181
PUERTO_SUPABASE = 54321
URL_WEB = f"http://localhost:{PUERTO_WEB}"
URL_SUPABASE = f"http://localhost:{PUERTO_SUPABASE}"
CLAVE_PUBLICA = "clave-publica-local"
# Contraseña de los usuarios de prueba del emulador: aleatoria en cada ejecución (no queda en el código).
CLAVE_PRUEBA = os.environ.get("SUPABASE_PRUEBA_CLAVE") or secrets.token_urlsafe(18)
CLAVE_SESION = "konys-admin-sesion"


def node(*argumentos, entorno=None, esperar=True):
    env = {**os.environ, **(entorno or {})}
    if esperar:
        return subprocess.run(["node", *argumentos], cwd=RAIZ, env=env, check=True,
                              capture_output=True, text=True, encoding="utf-8")
    return subprocess.Popen(["node", *argumentos], cwd=RAIZ, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8")


def generar_config(admin_email="admin@konys.test"):
    node("scripts/generar-config.mjs", "--pruebas", entorno={"ADMIN_EMAIL_PRUEBA": admin_email})


def restaurar_config():
    config = RAIZ / "js" / "config.js"
    if (RAIZ / ".env").exists():
        node("scripts/generar-config.mjs")
    elif config.exists():
        config.unlink()  # sin .env no debe quedar una configuración de pruebas


def esperar_url(url, segundos=60):
    limite = time.time() + segundos
    while time.time() < limite:
        try:
            with urllib.request.urlopen(url, timeout=2):
                return True
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(0.5)
    raise RuntimeError(f"No respondió {url}")


class Entorno:
    def __init__(self, visible=False):
        self.visible = visible
        self.procesos = []
        self.driver = None

    def __enter__(self):
        generar_config()
        self.procesos.append(node("tests/soporte/supabase-local.mjs", str(PUERTO_SUPABASE),
                                  entorno={"SUPABASE_PRUEBA_CLAVE": CLAVE_PRUEBA}, esperar=False))
        self.procesos.append(node("scripts/servidor-local.mjs", entorno={"PORT": str(PUERTO_WEB)}, esperar=False))
        esperar_url(f"{URL_SUPABASE}/__pruebas/estado", 90)
        esperar_url(URL_WEB, 30)
        self.driver = abrir_chrome(self.visible)
        return self

    def __exit__(self, *_):
        try:
            if self.driver:
                self.driver.quit()
        finally:
            for p in self.procesos:
                p.terminate()
            restaurar_config()


def abrir_chrome(visible):
    opciones = webdriver.ChromeOptions()
    for a in ["--lang=es-CO", "--no-first-run", "--no-default-browser-check",
              "--disable-search-engine-choice-screen", "--window-size=1366,900"]:
        opciones.add_argument(a)
    if not visible:
        opciones.add_argument("--headless=new")
    # Registros de consola y de red para detectar errores de la aplicación.
    opciones.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
    driver = webdriver.Chrome(options=opciones)
    driver.set_page_load_timeout(30)
    return driver


# ---------------------------------------------------------------------
# Llamadas HTTP directas a la API (para comprobar RLS con distintos permisos)
# ---------------------------------------------------------------------
def api(metodo, ruta, cuerpo=None, token=None, cabeceras=None):
    """Devuelve (estado, datos). token=None → rol anónimo (clave publishable)."""
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(f"{URL_SUPABASE}{ruta}", data=datos, method=metodo)
    req.add_header("apikey", CLAVE_PUBLICA)
    req.add_header("Authorization", f"Bearer {token or CLAVE_PUBLICA}")
    req.add_header("Content-Type", "application/json")
    for k, v in (cabeceras or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            texto = r.read().decode()
            return r.status, (json.loads(texto) if texto else None)
    except urllib.error.HTTPError as e:
        texto = e.read().decode()
        try:
            return e.code, json.loads(texto) if texto else None
        except json.JSONDecodeError:
            return e.code, texto


def token_de(email, clave=CLAVE_PRUEBA):
    estado, datos = api("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": clave})
    if estado != 200:
        raise RuntimeError(f"No se pudo iniciar sesión de prueba ({estado})")
    return datos["access_token"]


if __name__ == "__main__":
    sys.exit("Ejecuta tests/selenium/ejecutar.py")
