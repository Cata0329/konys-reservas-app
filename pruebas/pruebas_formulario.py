"""
pruebas_formulario.py
=====================
Pruebas automáticas con Selenium de Konys Pizza · Sistema de reservas.
Basado en el ejemplo del curso (github.com/cacarrascal/EjemploSelenium).

Qué hace este programa:
  1. Genera js/config.js y levanta un servidor web local con la carpeta del proyecto.
  2. Abre Chrome (o Edge si no hay Chrome) y ejecuta cada prueba paso a paso.
  3. Después de cada prueba revisa la consola del navegador: cualquier error (SEVERE)
     o advertencia (WARNING) no prevista hace fallar la prueba.
  4. Toma una captura al final de cada prueba y genera un reporte PDF.

Base de datos:
  --real   usa el Supabase del proyecto (necesita .env). Las pruebas de administración
           necesitan ADMIN_EMAIL_PRUEBAS y ADMIN_PASSWORD_PRUEBAS en variables de entorno
           (nunca se escriben en el código). Sin ellas esas pruebas salen OMITIDAS.
  --local  usa una copia local con las mismas migraciones (tests/soporte/supabase-local.mjs);
           no toca la base real. Es el modo por defecto si no existe .env.
  Los datos que crean las pruebas se llaman «PRUEBA SELENIUM» y se eliminan al terminar
  cada prueba (bloque finally) y otra vez al final de la ejecución.

Cómo ejecutarlo (desde la carpeta del proyecto):
  py pruebas\\pruebas_formulario.py                       -> normal: visible y con pausas
  py pruebas\\pruebas_formulario.py --rapido --oculto     -> sin pausas y sin ver el navegador
  py pruebas\\pruebas_formulario.py --no-abrir            -> no abre el PDF al terminar
  py pruebas\\pruebas_formulario.py --local               -> fuerza la base local
"""

import base64
import json
import os
import platform
import re
import secrets
import subprocess
import sys
import threading
import time
import functools
import http.server
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

import selenium
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    WebDriverException,
    TimeoutException,
    NoAlertPresentException,
    NoSuchWindowException,
    InvalidSessionIdException,
)

from reporte_pdf import generar_reporte


# =============================================================
# 1. CONFIGURACIÓN
# =============================================================
RAPIDO    = "--rapido" in sys.argv       # sin pausas
OCULTO    = "--oculto" in sys.argv       # navegador invisible (headless)
ABRIR_PDF = "--no-abrir" not in sys.argv

PAUSA            = 0 if RAPIDO else 0.4    # pausa entre acciones (segundos)
PAUSA_RESULTADO  = 0 if RAPIDO else 0.9    # tiempo que se ve el resultado de cada prueba
VELOCIDAD_TECLEO = 0 if RAPIDO else 0.035  # pausa entre cada letra al escribir
ESPERA           = 20                      # máximo de segundos esperando contenido de Supabase

CARPETA_PRUEBAS  = Path(__file__).resolve().parent
CARPETA_PROYECTO = CARPETA_PRUEBAS.parent
CARPETA_REPORTES = CARPETA_PRUEBAS / "reportes"
CONFIG_JS        = CARPETA_PROYECTO / "js" / "config.js"

MODO = "real" if "--real" in sys.argv or ((CARPETA_PROYECTO / ".env").exists() and "--local" not in sys.argv) else "local"

HOY = date.today()
NOMBRE_PRUEBA = "PRUEBA SELENIUM"
CLAVE_SESION = "konys-admin-sesion"
PLATOS_INVENTADOS = ["Margherita de la casa", "Pepperoni Konys", "Vegetal al horno", "Pollo BBQ",
                     "Palitos de ajo y queso", "Tiramisú", "Calzone de arequipe"]

# Campos del formulario de reserva (ids del HTML de reservar.html, paso 3)
CAMPOS = ["nombre", "contacto"]
DATOS_VALIDOS = {"nombre": NOMBRE_PRUEBA, "contacto": "300 123 4567", "personas": 2, "hora": "20:00"}

# Credenciales de administración: SOLO desde variables de entorno (o generadas para la base local).
ADMIN = {"correo": os.environ.get("ADMIN_EMAIL_PRUEBAS", ""), "clave": os.environ.get("ADMIN_PASSWORD_PRUEBAS", "")}
OTRO = {"correo": "", "clave": ""}          # usuario autenticado SIN permisos (solo base local)
SUPA = {"url": "", "clave": ""}             # URL y clave publishable (de js/config.js)

# Navegador que usan todas las funciones (se crea en main)
driver = None

# Ruta de la captura de la prueba actual
CAPTURA = {"ruta": None, "tomada": False}
CARTEL = {"texto": "", "color": "#173F35"}
REGISTROS = {"consola": [], "red": []}


def fecha_lejana(dia_iso_minimo=3):
    """Fecha a ~45 días (dentro de los 60 permitidos), de miércoles a domingo:
    esos días tienen jornada de noche tanto con el horario antiguo como con el nuevo."""
    d = HOY + timedelta(days=45)
    while d.isoweekday() < dia_iso_minimo:
        d += timedelta(days=1)
    return d


# =============================================================
# 2. SERVIDOR WEB LOCAL Y BASE DE DATOS
#    Sirve la carpeta del proyecto en http://127.0.0.1:<puerto>/
# =============================================================
class ManejadorSilencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass  # no llenar la consola con cada archivo que se pide

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class ServidorSilencioso(http.server.ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        pass  # ignora las conexiones que el navegador corta al cerrarse


def iniciar_servidor():
    manejador = functools.partial(ManejadorSilencioso, directory=str(CARPETA_PROYECTO))
    # Puerto 0 = el sistema escoge un puerto libre
    servidor = ServidorSilencioso(("127.0.0.1", 0), manejador)
    hilo = threading.Thread(target=servidor.serve_forever, daemon=True)
    hilo.start()
    return servidor, f"http://127.0.0.1:{servidor.server_address[1]}/"


def node(*argumentos, entorno=None, esperar=True):
    env = {**os.environ, **(entorno or {})}
    if esperar:
        return subprocess.run(["node", *argumentos], cwd=CARPETA_PROYECTO, env=env, check=True,
                              capture_output=True, text=True, encoding="utf-8")
    return subprocess.Popen(["node", *argumentos], cwd=CARPETA_PROYECTO, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def preparar_base():
    """Genera js/config.js y, en modo local, arranca el Supabase de pruebas."""
    proceso = None
    if MODO == "local":
        clave = secrets.token_urlsafe(18)
        node("scripts/generar-config.mjs", "--pruebas")
        proceso = node("tests/soporte/supabase-local.mjs", "54321", entorno={"SUPABASE_PRUEBA_CLAVE": clave}, esperar=False)
        ADMIN.update(correo="admin@konys.test", clave=clave)
        OTRO.update(correo="otro@konys.test", clave=clave)
    else:
        node("scripts/generar-config.mjs")
    texto = CONFIG_JS.read_text(encoding="utf-8")
    SUPA["url"] = re.search(r'"SUPABASE_URL":\s*"([^"]*)"', texto).group(1)
    SUPA["clave"] = re.search(r'"SUPABASE_PUBLISHABLE_KEY":\s*"([^"]*)"', texto).group(1)
    if not SUPA["url"]:
        raise RuntimeError("js/config.js no tiene SUPABASE_URL: revisa el archivo .env")
    limite = time.time() + 90
    while time.time() < limite:
        try:
            api("GET", "/rest/v1/categorias?select=id&limit=1")
            return proceso
        except OSError:
            time.sleep(0.5)
    raise RuntimeError(f"Supabase no respondió en {SUPA['url']}")


def restaurar_config():
    """En modo local, js/config.js vuelve a apuntar a la configuración real (o se borra)."""
    if MODO != "local":
        return
    if (CARPETA_PROYECTO / ".env").exists():
        node("scripts/generar-config.mjs")
    elif CONFIG_JS.exists():
        CONFIG_JS.unlink()


# =============================================================
# 3. API DE SUPABASE (para comprobar resultados y limpiar datos)
# =============================================================
def api(metodo, ruta, cuerpo=None, token=None, prefer=None):
    """Devuelve (estado, datos). token=None → rol anónimo (clave publishable)."""
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(SUPA["url"] + ruta, data=datos, method=metodo)
    req.add_header("apikey", SUPA["clave"])
    req.add_header("Authorization", f"Bearer {token or SUPA['clave']}")
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            texto = r.read().decode()
            return r.status, (json.loads(texto) if texto else None)
    except urllib.error.HTTPError as e:
        texto = e.read().decode()
        try:
            return e.code, (json.loads(texto) if texto else None)
        except json.JSONDecodeError:
            return e.code, texto


def token_de(credenciales):
    estado, datos = api("POST", "/auth/v1/token?grant_type=password",
                        {"email": credenciales["correo"], "password": credenciales["clave"]})
    if estado != 200:
        raise AssertionError(f"No se pudo iniciar sesión por la API ({estado}).")
    return datos["access_token"]


def q(texto):
    return urllib.parse.quote(texto, safe="")


def limpiar_datos_de_prueba():
    """Elimina todo lo creado con el nombre «PRUEBA SELENIUM» (reservas, mesas y platos)."""
    if not hay_admin():
        return
    token = token_de(ADMIN)
    patron = q(f"{NOMBRE_PRUEBA}*")
    api("DELETE", f"/rest/v1/reservas?cliente_nombre=like.{patron}", token=token)
    api("DELETE", f"/rest/v1/mesas?nombre=like.{patron}", token=token)
    api("DELETE", f"/rest/v1/platos?nombre=like.{patron}", token=token)


def hay_admin():
    return bool(ADMIN["correo"] and ADMIN["clave"])


def mesas_publicas():
    estado, mesas = api("GET", "/rest/v1/mesas?select=id,nombre,zona,capacidad&order=id.asc")
    comprobar(estado == 200, f"No se pudieron leer las mesas ({estado}).")
    return mesas


# =============================================================
# 4. NAVEGADOR
# =============================================================
def abrir_navegador():
    """Abre Chrome; si no está instalado, intenta con Microsoft Edge."""
    argumentos = ["--lang=es-CO", "--no-first-run", "--no-default-browser-check",
                  "--disable-search-engine-choice-screen", "--window-size=1366,900"]
    if OCULTO:
        argumentos += ["--headless=new"]

    intentos = [("Chrome", webdriver.ChromeOptions, webdriver.Chrome),
                ("Edge", webdriver.EdgeOptions, webdriver.Edge)]
    for nombre, Opciones, Navegador in intentos:
        try:
            opciones = Opciones()
            for argumento in argumentos:
                opciones.add_argument(argumento)
            # Registro de la consola (errores y advertencias) y de la red.
            opciones.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
            navegador = Navegador(options=opciones)
            if not OCULTO:
                navegador.maximize_window()
            return navegador
        except WebDriverException as error:
            print(f"  No se pudo abrir {nombre}: {primera_linea(error)}")
    return None


def primera_linea(error):
    """Primera línea del mensaje de un error (los de Selenium son muy largos)."""
    texto = getattr(error, "msg", None) or str(error) or type(error).__name__
    return texto.strip().splitlines()[0][:300]


# =============================================================
# 5. FUNCIONES DE APOYO PARA LAS PRUEBAS
# =============================================================
class PruebaOmitida(Exception):
    """Se lanza cuando una prueba no se puede ejecutar en este momento."""


def comprobar(condicion, mensaje_si_falla):
    """Si la condición es falsa, la prueba falla con el mensaje indicado."""
    if not condicion:
        raise AssertionError(mensaje_si_falla)


def pausa(segundos=None):
    segundos = PAUSA if segundos is None else segundos
    if segundos > 0 and not RAPIDO:
        time.sleep(segundos)


def ir(pagina):
    """Abre una página del sitio (siempre recarga, aunque solo cambie el #) y espera el header."""
    destino = URL + pagina.lstrip("/")
    misma = driver.current_url.split("#")[0] == destino.split("#")[0]
    driver.get(destino)
    if misma:
        driver.refresh()
    mostrar_cartel(CARTEL["texto"], CARTEL["color"])


def esperar(condicion, mensaje, segundos=ESPERA):
    try:
        return WebDriverWait(driver, segundos).until(condicion)
    except TimeoutException:
        raise AssertionError(mensaje)


def visible(selector, segundos=ESPERA):
    return esperar(EC.visibility_of_element_located((By.CSS_SELECTOR, selector)),
                   f"No apareció «{selector}» en {segundos} s.", segundos)


def todos(selector):
    return driver.find_elements(By.CSS_SELECTOR, selector)


def texto(selector):
    return driver.find_element(By.CSS_SELECTOR, selector).text.strip()


def js(codigo, *args):
    return driver.execute_script(codigo, *args)


def enfocar(elemento):
    """Mueve la página (al instante) para que el elemento quede en el centro de la pantalla."""
    driver.execute_script("arguments[0].scrollIntoView({block: 'center', behavior: 'instant'});", elemento)


def resaltar(elemento, activo=True):
    """Dibuja (o quita) un borde naranja para ver dónde está actuando la prueba."""
    driver.execute_script(
        "arguments[0].style.outline = arguments[1] ? '3px solid #ff9800' : '';"
        "arguments[0].style.outlineOffset = arguments[1] ? '3px' : '';",
        elemento, activo)


def teclear(campo, valor, lento=True):
    """Escribe letra por letra (para que se vea) o todo de una vez."""
    if lento and VELOCIDAD_TECLEO > 0:
        for letra in valor:
            campo.send_keys(letra)
            time.sleep(VELOCIDAD_TECLEO)
    else:
        campo.send_keys(valor)


def escribir(selector, valor, lento=True):
    campo = visible(selector)
    enfocar(campo)
    resaltar(campo)
    campo.clear()
    teclear(campo, valor, lento)
    pausa()
    resaltar(campo, False)
    return campo


def hacer_clic(selector_o_elemento, lento=True):
    elemento = visible(selector_o_elemento) if isinstance(selector_o_elemento, str) else selector_o_elemento
    enfocar(elemento)
    esperar(EC.element_to_be_clickable(elemento), "El elemento no se puede pulsar.", 5)
    resaltar(elemento)
    if lento:
        pausa()
    elemento.click()
    try:
        resaltar(elemento, False)
    except WebDriverException:
        pass  # el clic pudo cambiar de página
    if lento:
        pausa()


def elegir(selector, valor):
    """Selecciona una opción de un <select> y avisa al formulario."""
    campo = visible(selector)
    js("arguments[0].value = arguments[1];"
       "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));", campo, valor)


def esperar_alerta(fragmento, segundos=ESPERA):
    # Se lee con JavaScript: la página puede repintar la alerta mientras se espera.
    return esperar(lambda d: d.execute_script(
        "return [...document.querySelectorAll('.alerta')].some(a => a.textContent.includes(arguments[0]))", fragmento),
        f"No apareció un mensaje con «{fragmento}».", segundos)


def esperar_notificacion(fragmento):
    esperar(lambda d: d.execute_script(
        "return [...document.querySelectorAll('.notificacion')].some(n => n.textContent.includes(arguments[0]))", fragmento),
        f"No apareció la notificación «{fragmento}».")


def sesion_guardada():
    valor = js(f"return sessionStorage.getItem('{CLAVE_SESION}')")
    return json.loads(valor) if valor else None


def en_acceso():
    return driver.find_element(By.ID, "acceso").is_displayed() and not driver.find_element(By.ID, "panel-admin").is_displayed()


def iniciar_sesion_admin(pagina="admin.html", credenciales=None):
    credenciales = credenciales or ADMIN
    ir(pagina)
    escribir("#correo", credenciales["correo"])
    escribir("#clave", credenciales["clave"], lento=False)
    hacer_clic("#btn-ingresar")


def entrar_al_panel(pagina="admin.html"):
    iniciar_sesion_admin(pagina)
    visible("#panel-admin .principal h1")


def necesita_admin():
    if not hay_admin():
        raise PruebaOmitida("Faltan ADMIN_EMAIL_PRUEBAS y ADMIN_PASSWORD_PRUEBAS (variables de entorno): "
                            "sin ellas no se puede entrar al panel ni limpiar los datos de prueba.")


def tomar_captura():
    """Guarda la captura de la prueba actual (sin el cartel de las pruebas)."""
    ocultar_cartel()
    driver.save_screenshot(str(CAPTURA["ruta"]))
    CAPTURA["tomada"] = True


# ----- Consola y red del navegador -----
def leer_registros():
    """Acumula los registros de consola y de red (las lecturas los vacían en ChromeDriver)."""
    try:
        for e in driver.get_log("browser"):
            REGISTROS["consola"].append({"nivel": e["level"], "mensaje": e["message"]})
        for e in driver.get_log("performance"):
            m = json.loads(e["message"])["message"]
            if m["method"] == "Network.requestWillBeSent":
                REGISTROS["red"].append({"tipo": "peticion", "url": m["params"]["request"]["url"],
                                         "metodo": m["params"]["request"]["method"]})
            elif m["method"] == "Network.responseReceived" and m["params"]["response"]["status"] >= 400:
                r = m["params"]["response"]
                REGISTROS["red"].append({"tipo": "error", "estado": r["status"], "url": r["url"]})
            elif m["method"] == "Network.loadingFailed" and not m["params"].get("canceled"):
                REGISTROS["red"].append({"tipo": "error", "estado": "fallo", "url": m["params"].get("errorText", "")})
    except WebDriverException:
        pass  # Edge u otro navegador sin registros: solo se pierde esta verificación


def hubo_peticion(fragmento):
    leer_registros()
    return any(r["tipo"] == "peticion" and fragmento in r["url"] for r in REGISTROS["red"])


def problemas_de_consola(esperados):
    """Errores/advertencias de consola y respuestas HTTP ≥ 400 que NO estaban previstas."""
    leer_registros()
    previsto = lambda t: any(re.search(p, t) for p in esperados)  # noqa: E731
    consola = [c for c in REGISTROS["consola"] if c["nivel"] in ("SEVERE", "WARNING") and not previsto(c["mensaje"])]
    red = [r for r in REGISTROS["red"] if r["tipo"] == "error" and not previsto(f"{r['estado']} {r['url']}")]
    previstos = sum(1 for c in REGISTROS["consola"] if c["nivel"] in ("SEVERE", "WARNING") and previsto(c["mensaje"]))
    return consola, red, previstos


# ----- Cartel que muestra en el navegador qué prueba se está ejecutando -----
JS_CARTEL = """
let cartel = document.getElementById('cartel-pruebas');
if (!cartel) {
  cartel = document.createElement('div');
  cartel.id = 'cartel-pruebas';
  cartel.style.cssText = 'position:fixed;top:14px;left:14px;z-index:9999;max-width:250px;' +
    'padding:10px 14px;border-radius:10px;font:600 13px/1.4 Segoe UI,Arial,sans-serif;' +
    'color:#fff;white-space:pre-line;box-shadow:0 6px 20px rgba(0,0,0,.45);pointer-events:none;';
  document.body.appendChild(cartel);
}
cartel.style.display = 'block';
cartel.style.background = arguments[1];
cartel.textContent = arguments[0];
"""


def mostrar_cartel(texto_cartel, color="#173F35"):
    CARTEL.update(texto=texto_cartel, color=color)
    if OCULTO or not texto_cartel:
        return  # sin ventana no hace falta (y así no se altera la página)
    try:
        driver.execute_script(JS_CARTEL, texto_cartel, color)
    except WebDriverException:
        pass


def ocultar_cartel():
    try:
        driver.execute_script(
            "const c = document.getElementById('cartel-pruebas'); if (c) c.style.display = 'none';")
    except WebDriverException:
        pass


# =============================================================
# 6. REGISTRO DE PRUEBAS
#    El decorador @prueba agrega la función a la lista PRUEBAS.
# =============================================================
PRUEBAS = []


def prueba(grupo, nombre, esperado, errores_esperados=()):
    """errores_esperados: patrones de consola/red que la prueba provoca A PROPÓSITO
    (p. ej. el 400 de una contraseña incorrecta). Cualquier otro error la hace fallar."""
    def registrar(funcion):
        PRUEBAS.append({"grupo": grupo, "nombre": nombre, "esperado": esperado,
                        "funcion": funcion, "esperados": list(errores_esperados)})
        return funcion
    return registrar


# =============================================================
# 7. LAS PRUEBAS
# =============================================================

# ----- Grupo 1: carga y títulos de cada página -----
PAGINAS = [
    ("index.html", "Konys Pizza · Reserva tu mesa", "#portada-tarjeta, #form-consulta", "Inicio"),
    ("mesas.html", "Mesas · Konys Pizza", "[data-testid=mesa]", "Mesas"),
    ("carta.html", "Carta · Konys Pizza", "[data-testid=plato]", "Carta"),
    ("contacto.html", "Contacto · Konys Pizza", ".tabla-horario", "Contacto"),
    ("reservar.html", "Reserva tu mesa · Konys Pizza", ".opcion-mesa", None),
    ("admin.html", "Acceso · Panel Konys Pizza", "#correo", None),
]


def registrar_carga(pagina, titulo, selector, activa):
    @prueba("1. Carga de páginas", f"Carga de {pagina}",
            f"El título contiene «{titulo}», se cargan los estilos y el contenido de Supabase "
            f"({selector})" + (f" y el menú marca «{activa}» como página activa." if activa else "."))
    def caso():
        ir(pagina)
        visible(selector.split(",")[-1].strip())
        comprobar(titulo in driver.title, f"El título de la pestaña es «{driver.title}».")
        esperar(lambda d: titulo in d.title, f"El título de la pestaña es «{driver.title}».")
        fuente = js("return getComputedStyle(document.body).fontFamily")
        comprobar("Figtree" in fuente, f"css/styles.css no se aplicó (fuente {fuente}).")
        if activa:
            actual = texto(".nav [aria-current='page']")
            comprobar(actual == activa, f"La página activa del menú es «{actual}».")
        return f"Título «{driver.title}», estilos aplicados y contenido cargado."


for datos_pagina in PAGINAS:
    registrar_carga(*datos_pagina)


# ----- Grupo 2: navegación entre páginas -----
@prueba("2. Navegación", "Menú principal entre páginas separadas",
        "Los enlaces Inicio, Mesas, Carta, Reservar y Contacto abren cada página y el menú marca la activa.")
def prueba_navegacion():
    ir("index.html")
    visible(".nav")
    recorrido = []
    for nombre, esperado_url in [("Mesas", "mesas.html"), ("Carta", "carta.html"), ("Contacto", "contacto.html"),
                                 ("Inicio", "index.html")]:
        enlace = driver.find_element(By.XPATH, f"//nav[@id='nav']/a[normalize-space()='{nombre}']")
        hacer_clic(enlace)
        esperar(lambda d: esperado_url in d.current_url, f"No se abrió {esperado_url}.")
        activa = visible(".nav [aria-current='page']").text
        comprobar(activa == nombre, f"En {esperado_url} el menú marca «{activa}».")
        recorrido.append(nombre)
    enlace = driver.find_element(By.XPATH, "//nav[@id='nav']/a[normalize-space()='Reservar']")
    hacer_clic(enlace)
    visible("#titulo-reserva")
    return "Recorrido Mesas → Carta → Contacto → Inicio → Reservar con la página activa marcada."


@prueba("2. Navegación", "La consulta rápida del inicio lleva a Mesas",
        "Al elegir fecha, hora y personas en el inicio se abre mesas.html con esos datos ya aplicados.")
def prueba_consulta_rapida():
    ir("index.html")
    esperar(lambda d: d.find_element(By.ID, "consulta-fecha").is_enabled(), "El selector de fecha no se habilitó.")
    fechas = js("return [...document.querySelectorAll('#consulta-fecha option')].map(o => o.value)")
    elegir("#consulta-fecha", fechas[-1])
    elegir("#consulta-personas", "4")
    hacer_clic("#btn-consulta")
    esperar(lambda d: "mesas.html" in d.current_url, "No se abrió la página de mesas.")
    visible("[data-testid=mesa]")
    comprobar(f"fecha={fechas[-1]}" in driver.current_url, f"La URL no lleva la fecha: {driver.current_url}")
    comprobar(js("return document.querySelector('#consulta-fecha').value") == fechas[-1], "La fecha no quedó seleccionada.")
    capacidades = [int(re.search(r"hasta (\d+)", e.text).group(1)) for e in todos("[data-testid=mesa] .tarjeta-mesa__meta")]
    comprobar(capacidades and min(capacidades) >= 4, f"Con 4 personas se ven mesas de {capacidades}.")
    return f"Mesas para {fechas[-1]} y 4 personas: {len(capacidades)} mesas, todas con capacidad ≥ 4."


# ----- Grupo 3: mesas -----
@prueba("3. Mesas", "Mesas visibles con zona, capacidad y estado",
        "Se ven todas las mesas activas de Supabase, cada una con zona, capacidad y estado (Disponible/Ocupada).")
def prueba_mesas_visibles():
    ir("mesas.html")
    visible("[data-testid=mesa]")
    api_mesas = mesas_publicas()
    tarjetas = todos("[data-testid=mesa]")
    comprobar(len(tarjetas) == len(api_mesas), f"Se ven {len(tarjetas)} mesas y Supabase tiene {len(api_mesas)} activas.")
    for t in tarjetas:
        meta = t.find_element(By.CSS_SELECTOR, ".tarjeta-mesa__meta").text
        estado = t.find_element(By.CSS_SELECTOR, ".etiqueta").text
        comprobar(re.search(r"(Salón|Terraza) · hasta \d+ personas", meta), f"Datos incompletos: «{meta}».")
        comprobar(estado in ("Disponible", "Ocupada"), f"Estado inesperado: «{estado}».")
    return f"{len(tarjetas)} mesas activas, todas con zona, capacidad y estado."


@prueba("3. Mesas", "Filtros por zona y por número de personas",
        "El filtro Terraza deja solo mesas de terraza y «6 personas» solo mesas de 6 o más.")
def prueba_filtros_mesas():
    ir("mesas.html")
    visible("[data-testid=mesa]")
    hacer_clic("[data-zona='terraza']")
    zonas = {e.text.split(" · ")[0] for e in todos("[data-testid=mesa] .tarjeta-mesa__meta")}
    comprobar(zonas <= {"Terraza"}, f"Con el filtro Terraza se ven: {zonas}.")
    hacer_clic("[data-zona='']")
    hacer_clic("[data-personas='6']")
    capacidades = [int(re.search(r"hasta (\d+)", e.text).group(1)) for e in todos("[data-testid=mesa] .tarjeta-mesa__meta")]
    comprobar(all(c >= 6 for c in capacidades), f"Con 6 personas se ven capacidades {capacidades}.")
    return f"Terraza: solo terraza. 6 personas: capacidades {capacidades or 'ninguna (estado vacío)'}."


# ----- Grupo 4: flujo de reserva -----
def abrir_reserva(mesa_id, fecha, hora=None):
    pagina = f"reservar.html?mesa={mesa_id}&fecha={fecha.isoformat()}" + (f"&hora={hora}" if hora else "")
    ir(pagina)
    visible("#titulo-paso")
    esperar(lambda d: d.find_elements(By.CSS_SELECTOR, "[data-hora], .hora:disabled"), "No aparecieron los horarios.")


def mesa_para(personas=2):
    candidatas = [m for m in mesas_publicas() if m["capacidad"] >= personas]
    if not candidatas:
        raise PruebaOmitida(f"No hay mesas activas para {personas} personas.")
    return candidatas[0]


@prueba("4. Reserva", "Flujo completo: mesa → fecha → hora → datos → confirmación",
        "La confirmación muestra el nombre, la mesa, la fecha, la hora y las personas, y la reserva existe en "
        "Supabase con esos datos. Al terminar se elimina.")
def prueba_reserva_completa():
    necesita_admin()
    mesa = mesa_para(2)
    fecha = fecha_lejana()
    try:
        ir("reservar.html")
        hacer_clic(f"[data-mesa='{mesa['id']}']")
        hacer_clic("#continuar-1")
        visible("#titulo-paso")
        # Ir al mes de la fecha lejana con las flechas del calendario.
        for _ in range(3):
            if driver.find_elements(By.CSS_SELECTOR, f"[data-fecha='{fecha.isoformat()}']"):
                break
            hacer_clic("#mes-siguiente")
            time.sleep(0.5)
        hacer_clic(f"[data-fecha='{fecha.isoformat()}']")
        hacer_clic(f"[data-hora='{DATOS_VALIDOS['hora']}']")
        hacer_clic("#continuar-2")
        escribir("#nombre", DATOS_VALIDOS["nombre"])
        escribir("#contacto", DATOS_VALIDOS["contacto"])
        hacer_clic("#confirmar")
        visible("#confirmacion h1")
        resumen = texto("#confirmacion")
        for dato in [NOMBRE_PRUEBA, mesa["nombre"], "8:00 p. m.", str(fecha.day)]:
            comprobar(dato in resumen, f"La confirmación no muestra «{dato}».")
        codigo = re.search(r"Código de reserva: ([0-9A-F]{8})", resumen).group(1)
        estado, filas = api("POST", "/rest/v1/rpc/consultar_reserva", {"p_codigo": codigo, "p_nombre": NOMBRE_PRUEBA})
        comprobar(estado == 200 and filas, f"La reserva {codigo} no está en Supabase ({estado}).")
        r = filas[0]
        comprobar(r["fecha"] == fecha.isoformat() and r["hora_inicio"].startswith("20:00") and r["num_personas"] == 2,
                  f"Datos guardados distintos: {r}")
        return f"Reserva {codigo}: {mesa['nombre']}, {fecha:%d/%m/%Y} 8:00 p. m., 2 personas (eliminada al terminar)."
    finally:
        limpiar_datos_de_prueba()


# ----- Grupo 5: validaciones (no guardan nada) -----
def ir_a_datos(mesa, fecha, hora="20:00"):
    abrir_reserva(mesa["id"], fecha, hora)
    hacer_clic(f"[data-hora='{hora}']")
    hacer_clic("#continuar-2")
    visible("#nombre")


def sin_guardar():
    comprobar(not hubo_peticion("rpc/crear_reserva"), "Se intentó guardar la reserva a pesar del error.")
    comprobar(not driver.find_element(By.ID, "confirmacion").is_displayed(), "Se mostró una confirmación.")


@prueba("5. Validaciones", "Nombre vacío",
        "Aparece «Escribe tu nombre completo para guardar la reserva.», el campo queda marcado y no se guarda nada.")
def prueba_nombre_vacio():
    ir_a_datos(mesa_para(2), fecha_lejana())
    hacer_clic("#confirmar")
    comprobar("Escribe tu nombre completo" in texto("#form-datos"), "No apareció el error del nombre.")
    comprobar(driver.find_element(By.ID, "nombre").get_attribute("aria-invalid") == "true", "El campo no quedó marcado.")
    sin_guardar()
    return "Error visible, campo marcado y sin petición de guardado."


@prueba("5. Validaciones", "Personas = 0",
        "El botón «−» no deja bajar de 1 persona y el servidor rechaza una reserva para 0 personas.")
def prueba_personas_cero():
    mesa = mesa_para(2)
    ir_a_datos(mesa, fecha_lejana())
    while texto("#valor-personas") != "1":
        hacer_clic("#menos", lento=False)
    comprobar(not driver.find_element(By.ID, "menos").is_enabled(), "Con 1 persona el botón «−» debería desactivarse.")
    estado, datos = api("POST", "/rest/v1/rpc/crear_reserva", {
        "p_mesa_id": mesa["id"], "p_fecha": fecha_lejana().isoformat(), "p_hora_inicio": "20:00",
        "p_cliente_nombre": NOMBRE_PRUEBA, "p_num_personas": 0})
    comprobar(estado == 400 and "PERSONAS_INVALIDAS" in json.dumps(datos), f"El servidor respondió {estado} {datos}.")
    sin_guardar()
    return "La interfaz no baja de 1 y el servidor rechaza 0 personas (PERSONAS_INVALIDAS); nada guardado."


@prueba("5. Validaciones", "Más personas que la capacidad de la mesa",
        "Aparece «La Mesa X recibe hasta N personas», el botón Confirmar se desactiva y el servidor también lo rechaza.")
def prueba_capacidad():
    mesa = min((m for m in mesas_publicas() if m["capacidad"] < 12), key=lambda m: m["capacidad"])
    ir_a_datos(mesa, fecha_lejana())
    while int(texto("#valor-personas")) <= mesa["capacidad"]:
        hacer_clic("#mas", lento=False)
    comprobar(f"recibe hasta {mesa['capacidad']} personas" in texto("#form-datos"), "No apareció el mensaje de capacidad.")
    comprobar(not driver.find_element(By.ID, "confirmar").is_enabled(), "Confirmar debería estar desactivado.")
    estado, datos = api("POST", "/rest/v1/rpc/crear_reserva", {
        "p_mesa_id": mesa["id"], "p_fecha": fecha_lejana().isoformat(), "p_hora_inicio": "20:00",
        "p_cliente_nombre": NOMBRE_PRUEBA, "p_num_personas": mesa["capacidad"] + 1})
    comprobar(estado == 400 and "CAPACIDAD_EXCEDIDA" in json.dumps(datos), f"El servidor respondió {estado} {datos}.")
    sin_guardar()
    return f"{mesa['nombre']} (hasta {mesa['capacidad']}): bloqueado en la página y rechazado por el servidor."


@prueba("5. Validaciones", "Contacto inválido",
        "Con «abc» en Teléfono aparece «Escribe un teléfono válido» y no se guarda nada.")
def prueba_contacto_invalido():
    ir_a_datos(mesa_para(2), fecha_lejana())
    escribir("#nombre", NOMBRE_PRUEBA)
    escribir("#contacto", "abc")
    hacer_clic("#confirmar")
    comprobar("Escribe un teléfono válido" in texto("#form-datos"), "No apareció el error del contacto.")
    sin_guardar()
    return "Error del teléfono visible y sin petición de guardado."


@prueba("5. Validaciones", "Sin elegir hora",
        "Sin hora seleccionada el botón «Continuar a tus datos» está desactivado.")
def prueba_sin_hora():
    abrir_reserva(mesa_para(2)["id"], fecha_lejana())
    comprobar(not driver.find_element(By.ID, "continuar-2").is_enabled(), "Se puede continuar sin hora.")
    hacer_clic("[data-hora]")
    comprobar(driver.find_element(By.ID, "continuar-2").is_enabled(), "Tras elegir hora debería habilitarse.")
    return "Botón desactivado sin hora y habilitado al elegir una."


# ----- Grupo 6: horario ocupado y doble reserva -----
def reservar_por_api(mesa, fecha, hora, nombre=NOMBRE_PRUEBA):
    estado, datos = api("POST", "/rest/v1/rpc/crear_reserva", {
        "p_mesa_id": mesa["id"], "p_fecha": fecha.isoformat(), "p_hora_inicio": hora,
        "p_cliente_nombre": nombre, "p_num_personas": 2})
    comprobar(estado == 200, f"No se pudo crear la reserva de apoyo ({estado} {datos}).")


@prueba("6. Disponibilidad", "Un horario ocupado aparece tachado",
        "Tras reservar las 9:00 p. m. de una mesa, esa hora y las que se cruzan (8:30 y 9:30) aparecen ocupadas.")
def prueba_horario_ocupado():
    necesita_admin()
    mesa, fecha = mesa_para(2), fecha_lejana()
    try:
        reservar_por_api(mesa, fecha, "21:00")
        abrir_reserva(mesa["id"], fecha)
        ocupadas = js("return [...document.querySelectorAll('.hora:disabled')].map(b => b.getAttribute('aria-label'))")
        for h in ["8:30 p. m., ocupado", "9:00 p. m., ocupado", "9:30 p. m., ocupado"]:
            comprobar(h in ocupadas, f"«{h}» no aparece ocupada: {ocupadas}")
        comprobar(not todos("[data-hora='21:00']"), "Las 9:00 p. m. siguen seleccionables.")
        return "8:30, 9:00 y 9:30 p. m. tachadas; 8:00 y 10:00 p. m. libres."
    finally:
        limpiar_datos_de_prueba()


@prueba("6. Disponibilidad", "Doble reserva: dos clientes a la vez",
        "Si otro cliente confirma la misma mesa y hora justo antes, aparece «Alguien acaba de reservar» y solo "
        "queda una reserva en Supabase.",
        errores_esperados=[r"rpc/crear_reserva"])
def prueba_doble_reserva():
    necesita_admin()
    mesa, fecha = mesa_para(2), fecha_lejana()
    try:
        ir_a_datos(mesa, fecha, "22:00")
        escribir("#nombre", NOMBRE_PRUEBA)
        reservar_por_api(mesa, fecha, "22:00", f"{NOMBRE_PRUEBA} OTRO CLIENTE")
        hacer_clic("#confirmar")
        esperar_alerta("Alguien acaba de reservar")
        comprobar(not driver.find_element(By.ID, "confirmacion").is_displayed(), "Se mostró una confirmación.")
        _, ocupacion = api("POST", "/rest/v1/rpc/ocupacion", {"p_desde": fecha.isoformat(), "p_hasta": fecha.isoformat()})
        mismas = [o for o in ocupacion if o["mesa_id"] == mesa["id"] and o["hora_inicio"].startswith("22:00")]
        comprobar(len(mismas) == 1, f"Hay {len(mismas)} reservas en la misma franja.")
        return "El segundo cliente vio «Alguien acaba de reservar»; una sola reserva en la base."
    finally:
        limpiar_datos_de_prueba()


# ----- Grupo 7: carta real -----
def menu_oficial():
    datos = json.loads((CARPETA_PROYECTO / "docs" / "menu-oficial-konys.json").read_text(encoding="utf-8"))
    nombres = set()

    def recorrer(s):
        nombres.update(p["nombre"] for p in s["productos"])
        for sub in s["subsecciones"]:
            recorrer(sub)
    for s in datos["secciones"]:
        recorrer(s)
    return datos, nombres


@prueba("7. Carta", "Categorías reales de la carta",
        "Las pestañas coinciden con las categorías de Supabase (más «Recomendados») y con el menú oficial de Konys.")
def prueba_categorias():
    ir("carta.html")
    visible("[data-testid=plato]")
    pestanas = [p.text for p in todos(".pestana")]
    datos, _ = menu_oficial()
    oficiales = [s["nombre"] for s in datos["secciones"]]
    comprobar(pestanas == oficiales, f"Pestañas {pestanas} ≠ menú oficial {oficiales}. "
                                     "¿Se ejecutaron 002_carta_real.sql y seed_carta_real.sql?")
    return f"{len(pestanas)} pestañas: {', '.join(pestanas)}."


@prueba("7. Carta", "Solo platos reales y disponibles",
        "Todos los platos visibles están en el menú oficial y ninguno de los inventados ni de los ocultos aparece.")
def prueba_platos_reales():
    ir("carta.html")
    visible("[data-testid=plato]")
    vistos = set()
    for pestana in todos(".pestana"):
        js("arguments[0].click()", pestana)
        vistos.update(js("return [...document.querySelectorAll('[data-testid=plato] h3')].map(h => h.textContent.trim())"))
    _, oficiales = menu_oficial()
    extras = sorted(vistos - oficiales)
    comprobar(not extras, f"Platos que no están en el menú oficial: {extras}")
    comprobar(not (vistos & set(PLATOS_INVENTADOS)), "Se ven platos inventados.")
    if hay_admin():
        _, todos_platos = api("GET", "/rest/v1/platos?select=nombre,disponible", token=token_de(ADMIN))
        ocultos = {p["nombre"] for p in todos_platos if not p["disponible"]}
        comprobar(not (vistos & ocultos), f"Se ven platos ocultos: {vistos & ocultos}")
    return f"{len(vistos)} platos visibles, todos oficiales; ningún plato oculto ni inventado."


@prueba("7. Carta", "Buscador de la carta",
        "Al buscar «limonada» aparecen solo platos que contienen esa palabra.")
def prueba_buscador():
    ir("carta.html")
    visible("[data-testid=plato]")
    escribir("#buscar-carta", "limonada")
    esperar(lambda d: "encontrado" in d.find_element(By.ID, "resultado-busqueda").text, "No se mostró el resultado.")
    nombres = [e.text for e in todos("[data-testid=plato] h3")]
    comprobar(nombres and all("limonada" in n.lower() for n in nombres), f"Resultados: {nombres}")
    return f"«limonada» → {', '.join(nombres)}."


@prueba("7. Carta", "Las fotos de los platos cargan",
        "Las imágenes tienen loading=lazy y tamaño definido, y todas cargan sin errores.")
def prueba_imagenes():
    ir("carta.html")
    visible("[data-testid=plato]")
    rotas, cargadas = [], 0
    for pestana in todos(".pestana")[1:]:
        js("arguments[0].click()", pestana)
        for img in todos("[data-testid=plato] img"):
            comprobar(img.get_attribute("loading") == "lazy" and img.get_attribute("width"), "Imagen sin lazy o sin tamaño.")
            js("arguments[0].loading = 'eager'", img)
            esperar(lambda d: d.execute_script("return arguments[0].complete", img), "Una imagen no terminó de cargar.")
            if js("return arguments[0].naturalWidth", img) > 0:
                cargadas += 1
            else:
                rotas.append(img.get_attribute("src"))
    comprobar(not rotas, f"Imágenes que no cargan: {rotas}")
    comprobar(cargadas > 0, "No se encontró ninguna foto.")
    return f"{cargadas} fotos cargadas, 0 rotas."


# ----- Grupo 8: panel de administración -----
@prueba("8. Administración", "Inicio de sesión incorrecto",
        "Con una contraseña incorrecta aparece «Correo o contraseña incorrectos» y no se abre el panel.",
        errores_esperados=[r"auth/v1/token"])
def prueba_login_incorrecto():
    necesita_admin()
    ir("admin.html")
    escribir("#correo", ADMIN["correo"])
    escribir("#clave", "contraseña-equivocada")
    hacer_clic("#btn-ingresar")
    esperar_alerta("Correo o contraseña incorrectos")
    comprobar(en_acceso(), "El panel se abrió con una contraseña incorrecta.")
    return "Mensaje de error visible y panel cerrado."


@prueba("8. Administración", "Inicio de sesión correcto",
        "Con las credenciales correctas se abre el panel; la sesión queda solo en sessionStorage (no en localStorage).")
def prueba_login_correcto():
    necesita_admin()
    entrar_al_panel()
    comprobar(sesion_guardada() is not None, "No se guardó la sesión.")
    en_local = js("return Object.values(localStorage).some(v => /eyJ|access_token/.test(v))")
    comprobar(not en_local, "Hay un token en localStorage.")
    return "Panel abierto; token solo en sessionStorage."


@prueba("8. Administración", "Acceso directo al panel sin sesión",
        "Abrir admin.html#mesas sin iniciar sesión muestra el acceso y no carga ningún dato del panel.")
def prueba_acceso_directo():
    ir("admin.html#mesas")
    visible("#correo")
    time.sleep(1)
    comprobar(en_acceso(), "Se mostró el panel sin sesión.")
    comprobar(js("return document.querySelector('#principal').innerHTML.trim()") == "", "El panel cargó contenido.")
    estado, _ = api("GET", "/rest/v1/reservas?select=id")
    comprobar(estado in (401, 403), f"Un visitante anónimo pudo leer reservas ({estado}).")
    return f"Se muestra el acceso; la API rechaza leer reservas sin sesión ({estado})."


@prueba("8. Administración", "Crear mesa y activarla/desactivarla",
        "La mesa nueva aparece en el sitio público; al desactivarla deja de aparecer. Se elimina al final.")
def prueba_crear_mesa():
    necesita_admin()
    try:
        entrar_al_panel("admin.html#mesas")
        hacer_clic("#agregar-mesa")
        escribir(".cajon #m-nombre", NOMBRE_PRUEBA)
        escribir(".cajon #m-capacidad", "4")
        hacer_clic(".cajon [data-guardar]")
        esperar_notificacion(f"{NOMBRE_PRUEBA} registrada")
        nueva = next((m for m in mesas_publicas() if m["nombre"] == NOMBRE_PRUEBA), None)
        comprobar(nueva, "La mesa nueva no aparece para el público.")
        hacer_clic(f"label[for='activa-{nueva['id']}']")
        esperar_notificacion("desactivada")
        comprobar(NOMBRE_PRUEBA not in [m["nombre"] for m in mesas_publicas()], "La mesa desactivada sigue visible.")
        hacer_clic(f"label[for='activa-{nueva['id']}']")
        esperar_notificacion("activada")
        return "Mesa creada (visible), desactivada (oculta) y reactivada; eliminada al terminar."
    finally:
        limpiar_datos_de_prueba()


@prueba("8. Administración", "Filtros de reservas",
        "Al filtrar por estado «Cancelada» la tabla solo muestra reservas canceladas (o el mensaje de que no hay).")
def prueba_filtros_reservas():
    necesita_admin()
    entrar_al_panel("admin.html#reservas")
    visible("#f-fecha")
    js("document.querySelector('#f-fecha').value = ''")
    elegir("#f-estado", "cancelada")
    hacer_clic("#filtros button[type='submit']")
    esperar(lambda d: d.find_elements(By.CSS_SELECTOR, "#tabla-reservas .tabla, #tabla-reservas .vacio"), "La tabla no se actualizó.")
    estados = [e.text for e in todos("#tabla-reservas tbody td:nth-child(7)")]
    comprobar(all(e == "Cancelada" for e in estados), f"Con el filtro aparecen: {set(estados)}")
    return f"{len(estados)} reservas, todas canceladas." if estados else "Sin reservas canceladas: se muestra el estado vacío."


@prueba("8. Administración", "Gestión de la carta: crear, editar y eliminar un plato",
        "El plato nuevo (oculto) no aparece en la carta pública, el cambio de precio se guarda y se elimina al final.")
def prueba_gestion_carta():
    necesita_admin()
    try:
        entrar_al_panel("admin.html#carta")
        hacer_clic("#agregar-plato")
        escribir(".cajon #p-nombre", NOMBRE_PRUEBA)
        escribir(".cajon #p-precio", "10000")
        hacer_clic(".cajon label[for='p-disponible']")  # se crea oculto: nunca se muestra al público
        hacer_clic(".cajon [data-guardar]")
        esperar_notificacion("agregado a la carta")
        _, publicos = api("GET", f"/rest/v1/platos?select=id&nombre=eq.{q(NOMBRE_PRUEBA)}")
        comprobar(publicos == [], "El plato oculto aparece en la carta pública.")
        token = token_de(ADMIN)
        _, filas = api("GET", f"/rest/v1/platos?select=id,precio,disponible&nombre=eq.{q(NOMBRE_PRUEBA)}", token=token)
        comprobar(filas and filas[0]["precio"] == 10000 and not filas[0]["disponible"], f"Plato guardado: {filas}")
        escribir("#f-buscar", NOMBRE_PRUEBA)
        hacer_clic(f"[data-editar='{filas[0]['id']}']")
        escribir(".cajon #p-precio", "12000")
        hacer_clic(".cajon [data-guardar]")
        esperar_notificacion("actualizado")
        _, filas = api("GET", f"/rest/v1/platos?select=precio&nombre=eq.{q(NOMBRE_PRUEBA)}", token=token)
        comprobar(filas[0]["precio"] == 12000, f"El precio no cambió: {filas}")
        return "Plato creado oculto (invisible al público), precio editado de $10.000 a $12.000; eliminado al terminar."
    finally:
        limpiar_datos_de_prueba()


@prueba("8. Administración", "Cerrar sesión (y el botón Atrás no muestra el panel)",
        "Al cerrar sesión vuelve el acceso, se borra la sesión guardada y «Atrás» no reabre el panel.")
def prueba_cerrar_sesion():
    necesita_admin()
    entrar_al_panel("admin.html#mesas")
    hacer_clic("[data-seccion='reservas']")
    visible("#f-fecha")
    hacer_clic("#cerrar-sesion")
    esperar(lambda d: en_acceso(), "No volvió a la pantalla de acceso.")
    esperar_alerta("Cerraste sesión")
    comprobar(sesion_guardada() is None, "La sesión sigue guardada.")
    driver.back()
    time.sleep(1.5)
    comprobar(en_acceso(), "El botón Atrás volvió a mostrar el panel.")
    return "Acceso visible, sesión borrada y «Atrás» no reabre el panel."


# ----- Grupo 9: seguridad -----
@prueba("9. Seguridad", "Cierre por inactividad (valor corto solo en localhost)",
        "Con ?inactividad=10: a los 8 s aparece el aviso con «Seguir conectado»; sin actividad la sesión se cierra "
        "y se muestra «Tu sesión se cerró por inactividad».")
def prueba_inactividad():
    necesita_admin()
    entrar_al_panel("admin.html?inactividad=10#mesas")
    visible("#aviso-inactividad", 15)
    hacer_clic("#seguir-conectado")
    esperar(lambda d: not d.find_element(By.ID, "aviso-inactividad").is_displayed(), "El aviso no se cerró.", 5)
    comprobar(not en_acceso(), "La sesión se cerró aunque se pulsó «Seguir conectado».")
    inicio = time.time()
    esperar(lambda d: en_acceso(), "La sesión no se cerró por inactividad.", 15)
    esperar_alerta("Tu sesión se cerró por inactividad")
    comprobar(sesion_guardada() is None, "La sesión sigue guardada.")
    return f"Aviso y «Seguir conectado» funcionan; sin actividad se cerró a los {time.time() - inicio:.1f} s."


@prueba("9. Seguridad", "Valor de producción del cierre por inactividad",
        "INACTIVIDAD_MS = 300000 (5 minutos) y el parámetro corto se ignora fuera de localhost.")
def prueba_inactividad_produccion():
    ir("admin.html")
    visible("#correo")
    valores = driver.execute_async_script("""
      const fin = arguments[arguments.length - 1];
      import('./js/admin/inactividad.js').then((m) => fin({
        produccion: m.INACTIVIDAD_MS,
        vercel: m.tiempoInactividad(new URL('https://konys-reservas-app.vercel.app/admin?inactividad=10')),
        local: m.tiempoInactividad(new URL('http://127.0.0.1/admin?inactividad=10')),
      }));""")
    comprobar(valores == {"produccion": 300000, "vercel": 300000, "local": 10000}, f"Valores: {valores}")
    return "Producción 300 000 ms; en Vercel se ignora ?inactividad; en localhost 10 000 ms."


@prueba("9. Seguridad", "El token (JWT) nunca aparece en la URL",
        "Tras iniciar sesión y navegar el panel la URL no contiene tokens; un token puesto en la URL se borra y no inicia sesión.")
def prueba_token_url():
    ir("admin.html#access_token=eyJfalso&refresh_token=falso")
    visible("#correo")
    comprobar("token" not in driver.current_url, f"La URL conserva el token: {driver.current_url}")
    comprobar(sesion_guardada() is None, "Un token en la URL inició sesión.")
    if not hay_admin():
        return "Token falso borrado de la URL y sin sesión (la parte con login se omitió: sin credenciales)."
    entrar_al_panel("admin.html#reservas")
    for seccion in ["mesas", "horarios", "carta"]:
        hacer_clic(f"[data-seccion='{seccion}']")
        comprobar(not re.search(r"eyJ|access_token|refresh_token", driver.current_url), f"Token en la URL: {driver.current_url}")
    return "Token falso borrado y sin sesión; navegando el panel la URL nunca contiene el JWT."


@prueba("9. Seguridad", "Texto con HTML se muestra como texto (XSS)",
        "Una reserva a nombre de «PRUEBA SELENIUM <img src=x onerror=alert(1)>» muestra el texto tal cual, "
        "sin crear la imagen ni ejecutar código. Se elimina al final.")
def prueba_xss():
    necesita_admin()
    nombre = f"{NOMBRE_PRUEBA} <img src=x onerror=alert(1)>"
    mesa, fecha = mesa_para(2), fecha_lejana(4)
    try:
        ir_a_datos(mesa, fecha, "19:00")
        escribir("#nombre", nombre)
        hacer_clic("#confirmar")
        visible("#confirmacion h1")
        try:
            driver.switch_to.alert
            raise AssertionError("Se ejecutó el código: apareció una alerta.")
        except NoAlertPresentException:
            pass
        comprobar(nombre in texto("#confirmacion"), "El nombre no se muestra como texto.")
        comprobar(not todos("#confirmacion img"), "El HTML se convirtió en una imagen.")
        return "El nombre con HTML se mostró como texto, sin imagen ni alerta."
    finally:
        limpiar_datos_de_prueba()


@prueba("9. Seguridad", "Usuario autenticado sin permisos de administración",
        "Una cuenta que no está en la tabla administradores no entra al panel ni puede cambiar precios por la API.")
def prueba_sin_permisos():
    if not OTRO["correo"]:
        raise PruebaOmitida("Solo en la base local: en Supabase real no hay una cuenta sin permisos de prueba.")
    iniciar_sesion_admin(credenciales=OTRO)
    esperar_alerta("no tiene permisos")
    comprobar(en_acceso() and sesion_guardada() is None, "El usuario sin permisos quedó dentro.")
    token = token_de(OTRO)
    _, cambio = api("PATCH", f"/rest/v1/platos?nombre=eq.{q('HAWAIANA')}", {"precio": 1}, token=token,
                    prefer="return=representation")
    comprobar(cambio == [], f"Pudo cambiar un precio: {cambio}")
    return "Acceso denegado y la API no modificó ningún precio (0 filas)."


@prueba("9. Seguridad", "Cerrar sesión en una pestaña cierra las demás",
        "Con el panel abierto en dos pestañas, al cerrar sesión en una la otra vuelve al acceso (evento storage).")
def prueba_varias_pestanas():
    necesita_admin()
    entrar_al_panel("admin.html#mesas")
    primera = driver.current_window_handle
    driver.switch_to.new_window("tab")
    try:
        entrar_al_panel("admin.html#reservas")
        hacer_clic("#cerrar-sesion")
        esperar(lambda d: en_acceso(), "La segunda pestaña no cerró sesión.")
    finally:
        driver.close()
        driver.switch_to.window(primera)
    esperar(lambda d: en_acceso(), "La primera pestaña siguió dentro del panel.", 10)
    return "Al cerrar sesión en una pestaña, la otra volvió al acceso."


# ----- Grupo 10: diseño adaptable -----
@prueba("10. Responsive", "Diseño adaptable en celular (375 px)",
        "En 375 px ninguna página tiene desplazamiento horizontal y el menú se convierte en botón.")
def prueba_responsive():
    try:
        driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride",
                               {"width": 375, "height": 812, "deviceScaleFactor": 1, "mobile": True})
    except Exception:
        raise PruebaOmitida("Este navegador no permite simular la pantalla de un celular.")
    try:
        revisadas = []
        for pagina, selector in [("index.html", "#form-consulta"), ("mesas.html", "[data-testid=mesa]"),
                                 ("carta.html", "[data-testid=plato]"), ("contacto.html", ".tabla-horario"),
                                 ("reservar.html", ".opcion-mesa"), ("admin.html", "#correo")]:
            ir(pagina)
            visible(selector)
            ancho = js("return [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            comprobar(ancho[0] <= ancho[1], f"{pagina} se desborda: {ancho[0]} px de contenido en {ancho[1]} px.")
            if pagina != "reservar.html" and pagina != "admin.html":
                comprobar(driver.find_element(By.CSS_SELECTOR, ".cabecera__menu").is_displayed(), f"{pagina}: falta el botón de menú.")
            revisadas.append(pagina)
        ir("carta.html")
        visible("[data-testid=plato]")
        tomar_captura()  # la foto se toma aquí, mientras se simula el celular
    finally:
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    return "Sin desbordamiento en: " + ", ".join(revisadas) + "."


# ----- Grupo 11: consola -----
@prueba("11. Consola", "Recorrido completo sin errores ni advertencias en consola",
        "Al recorrer todas las páginas (y el panel si hay credenciales) la consola no muestra errores ni advertencias "
        "y ninguna petición falla (sin 404 de config.js, fuentes, imágenes ni favicon).")
def prueba_consola():
    revisadas = []
    for pagina, selector in [("index.html", "#form-consulta"), ("mesas.html", "[data-testid=mesa]"),
                             ("carta.html", "[data-testid=plato]"), ("contacto.html", ".tabla-horario"),
                             ("reservar.html", ".opcion-mesa"), ("mi-reserva.html", "#form-consulta"),
                             ("admin.html", "#correo")]:
        ir(pagina)
        visible(selector)
        time.sleep(0.5)
        revisadas.append(pagina)
    if hay_admin():
        entrar_al_panel()
        for seccion in ["resumen", "mesas", "horarios", "reservas", "categorias", "carta"]:
            hacer_clic(f"[data-seccion='{seccion}']")
            visible("#principal h1")
            time.sleep(0.4)
            revisadas.append(f"admin#{seccion}")
        hacer_clic("#cerrar-sesion")
        esperar(lambda d: en_acceso(), "No cerró sesión.")
    consola, red, _ = problemas_de_consola([])
    comprobar(not consola and not red, f"Errores: {consola + red}")
    return "Sin errores ni advertencias en: " + ", ".join(revisadas) + "."


# =============================================================
# 8. EJECUCIÓN DE TODAS LAS PRUEBAS
# =============================================================
COLORES_ESTADO = {"APROBADA": "#14583A", "FALLIDA": "#A3302A", "OMITIDA": "#6b6b6b"}


def ejecutar_pruebas(carpeta_capturas):
    resultados = []
    total = len(PRUEBAS)

    for numero, datos in enumerate(PRUEBAS, start=1):
        nombre = datos["nombre"]
        print(f"  [{numero:02d}/{total}] {nombre[:52]:.<54} ", end="", flush=True)
        CAPTURA["ruta"] = carpeta_capturas / f"{numero:02d}.png"
        CAPTURA["tomada"] = False
        inicio = time.perf_counter()
        consola_txt = "No se revisó."

        try:
            driver.get(URL + "index.html")  # cada prueba empieza desde el inicio, sin sesión
            js("sessionStorage.clear(); localStorage.clear();")
            leer_registros()
            REGISTROS["consola"].clear()
            REGISTROS["red"].clear()
            mostrar_cartel(f"Prueba {numero} de {total}\n{nombre}")
            pausa()
            obtenido = datos["funcion"]() or "Correcto."
            estado = "APROBADA"
            consola, red, previstos = problemas_de_consola(datos["esperados"])
            if consola or red:
                estado = "FALLIDA"
                detalle = "; ".join((c.get("mensaje") or f"{c.get('estado')} {c.get('url')}")[:180] for c in consola + red)
                obtenido += f" PERO la consola/red tuvo errores no previstos: {detalle}"
                consola_txt = detalle
            else:
                consola_txt = ("Sin errores ni advertencias." if not previstos else
                               f"Sin errores no previstos ({previstos} mensaje(s) de error provocados a propósito "
                               "por la prueba: respuesta de rechazo del servidor).")
        except PruebaOmitida as motivo:
            estado, obtenido = "OMITIDA", str(motivo)
        except AssertionError as fallo:
            estado, obtenido = "FALLIDA", str(fallo)
        except (NoSuchWindowException, InvalidSessionIdException):
            print("NAVEGADOR CERRADO")
            print("\n  Se cerró el navegador: se detienen las pruebas.")
            break
        except Exception as error:
            estado = "FALLIDA"
            obtenido = f"Error inesperado ({type(error).__name__}): {primera_linea(error)}"

        duracion = time.perf_counter() - inicio

        try:
            if not CAPTURA["tomada"]:
                tomar_captura()
            mostrar_cartel(f"{estado}\n{nombre}", COLORES_ESTADO[estado])
            pausa(PAUSA_RESULTADO)
        except WebDriverException:
            pass

        print(estado)
        if estado == "FALLIDA":
            print(f"         ↳ {obtenido[:300]}")
        resultados.append({
            "numero": numero,
            "grupo": datos["grupo"],
            "nombre": nombre,
            "esperado": datos["esperado"],
            "obtenido": obtenido,
            "estado": estado,
            "consola": consola_txt,
            "duracion": duracion,
            "captura": str(CAPTURA["ruta"]) if CAPTURA["tomada"] else None,
        })
    return resultados


def mostrar_resumen_final(aprobadas, fallidas, omitidas):
    """Pantalla final en el navegador con el resultado."""
    try:
        driver.get(URL + "index.html")
        driver.execute_script("""
            const capa = document.createElement('div');
            capa.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;' +
              'align-items:center;justify-content:center;background:rgba(23,63,53,.9);' +
              'font-family:Segoe UI,Arial,sans-serif;';
            const caja = document.createElement('div');
            caja.style.cssText = 'background:#fff;border-top:6px solid #E9D56B;border-radius:16px;' +
              'padding:32px 44px;text-align:center;white-space:pre-line;font-size:18px;' +
              'line-height:1.7;color:#252824;box-shadow:0 25px 60px rgba(0,0,0,.5);';
            caja.textContent = arguments[0];
            capa.appendChild(caja);
            document.body.appendChild(capa);
        """, f"PRUEBAS TERMINADAS\n\nAprobadas: {aprobadas}\nFallidas: {fallidas}\n"
             f"Omitidas: {omitidas}\n\nGenerando el reporte PDF...")
        pausa(3)
    except WebDriverException:
        pass


# =============================================================
# 9. PROGRAMA PRINCIPAL
# =============================================================
URL = ""


def main():
    global driver, URL

    print()
    print("  ==========================================================")
    print("   PRUEBAS AUTOMÁTICAS - Konys Pizza · Sistema de reservas")
    print("  ==========================================================")

    marca = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    carpeta_capturas = CARPETA_REPORTES / f"capturas_{marca}"
    carpeta_capturas.mkdir(parents=True, exist_ok=True)

    print(f"  Base de datos: {'Supabase real del proyecto' if MODO == 'real' else 'copia local de pruebas (no toca la base real)'}")
    proceso_base = preparar_base()
    if not hay_admin():
        print("  Aviso: sin ADMIN_EMAIL_PRUEBAS / ADMIN_PASSWORD_PRUEBAS las pruebas del panel saldrán OMITIDAS.")
    servidor, URL = iniciar_servidor()
    print(f"  Servidor local: {URL}")
    print("  Abriendo el navegador...")
    driver = abrir_navegador()
    if driver is None:
        print("\n  [ERROR] No se pudo abrir Chrome ni Edge. Revisa que estén instalados")
        print("  y que haya internet la primera vez (Selenium descarga el driver).")
        servidor.shutdown()
        return 2

    capacidades = driver.capabilities
    navegador = f"{capacidades.get('browserName', '?').title()} {capacidades.get('browserVersion', '')}"
    print(f"  Navegador: {navegador}")
    print(f"  Pruebas a ejecutar: {len(PRUEBAS)}\n")

    inicio = datetime.now()
    try:
        limpiar_datos_de_prueba()  # por si una ejecución anterior se interrumpió
        resultados = ejecutar_pruebas(carpeta_capturas)
        aprobadas = sum(r["estado"] == "APROBADA" for r in resultados)
        fallidas = sum(r["estado"] == "FALLIDA" for r in resultados)
        omitidas = sum(r["estado"] == "OMITIDA" for r in resultados)
        mostrar_resumen_final(aprobadas, fallidas, omitidas)
    finally:
        try:
            limpiar_datos_de_prueba()
        except Exception as error:  # noqa: BLE001
            print(f"  [AVISO] No se pudieron limpiar los datos de prueba: {primera_linea(error)}")
        try:
            driver.quit()
        except Exception:
            pass
        servidor.shutdown()
        if proceso_base:
            proceso_base.terminate()
        restaurar_config()
    fin = datetime.now()

    info = {
        "inicio": inicio,
        "fin": fin,
        "navegador": navegador,
        "selenium": selenium.__version__,
        "python": platform.python_version(),
        "sistema": f"{platform.system()} {platform.release()} ({platform.version()})",
        "url": URL,
        "base": ("Supabase real del proyecto (datos de prueba «PRUEBA SELENIUM» eliminados al terminar)" if MODO == "real"
                 else "Copia local con las mismas migraciones (tests/soporte/supabase-local.mjs); la base real no se tocó"),
        "modo": ("Navegador oculto" if OCULTO else "Navegador visible")
                + (", sin pausas" if RAPIDO else ", con pausas para ver cada paso"),
        "total_registradas": len(PRUEBAS),
    }

    ruta_pdf = CARPETA_REPORTES / f"reporte_pruebas_{marca}.pdf"
    generar_reporte(ruta_pdf, resultados, info)
    (CARPETA_REPORTES / "ultimo_resultado.json").write_text(json.dumps(
        [{k: v for k, v in r.items() if k != "captura"} for r in resultados], ensure_ascii=False, indent=2), encoding="utf-8")

    print()
    print(f"  Resultado: {aprobadas} aprobadas, {fallidas} fallidas, {omitidas} omitidas")
    print(f"  Reporte PDF: {ruta_pdf}")
    if ABRIR_PDF:
        os.startfile(ruta_pdf)  # abre el PDF con el programa predeterminado

    return 0 if fallidas == 0 and len(resultados) == len(PRUEBAS) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n  Pruebas canceladas por el usuario.")
        sys.exit(130)
