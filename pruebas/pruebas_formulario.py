"""
pruebas_formulario.py
=====================
Pruebas automáticas con Selenium del formulario de reservas
del Restaurante El Fogón Dorado.

Qué hace este programa:
  1. Levanta un servidor web local con la carpeta del proyecto.
  2. Abre Chrome (a la vista) y ejecuta cada prueba paso a paso,
     escribiendo en los campos como lo haría una persona.
  3. Toma una captura de pantalla al final de cada prueba.
  4. Genera un reporte PDF con los resultados y lo abre.

Cómo ejecutarlo (desde la carpeta del proyecto):
  py pruebas\\pruebas_formulario.py              -> normal: visible y con pausas
  py pruebas\\pruebas_formulario.py --rapido     -> sin pausas
  py pruebas\\pruebas_formulario.py --oculto     -> sin mostrar el navegador
  py pruebas\\pruebas_formulario.py --no-abrir   -> no abre el PDF al terminar
"""

import os
import sys
import time
import platform
import threading
import functools
import http.server
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

CARPETA_PRUEBAS  = Path(__file__).resolve().parent
CARPETA_PROYECTO = CARPETA_PRUEBAS.parent
CARPETA_REPORTES = CARPETA_PRUEBAS / "reportes"

HOY = date.today()
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

# Campos del formulario (ids del HTML)
CAMPOS = ["nombre", "identificacion", "telefono", "correo", "fechaNacimiento",
          "fechaReserva", "hora", "personas", "observaciones"]

# Datos correctos con los que se llena el formulario
DATOS_VALIDOS = {
    "nombre": "María Fernanda López",
    "identificacion": "1098765432",
    "telefono": "3001234567",
    "correo": "maria.lopez@correo.com",
    "fechaNacimiento": date(1995, 4, 20),
    "fechaReserva": HOY + timedelta(days=7),
    "hora": "19:30",
    "personas": "4",
    "tipo": "familiar",
    "observaciones": "Celebración de cumpleaños",
}


def hace_anios(anios):
    """Fecha de hoy hace X años (el 29 de febrero pasa a 28)."""
    try:
        return HOY.replace(year=HOY.year - anios)
    except ValueError:
        return HOY.replace(year=HOY.year - anios, day=28)


# Navegador que usan todas las funciones (se crea en main)
driver = None

# Ruta de la captura de la prueba actual
CAPTURA = {"ruta": None, "tomada": False}


# =============================================================
# 2. SERVIDOR WEB LOCAL
#    Sirve la carpeta del proyecto en http://127.0.0.1:<puerto>/
# =============================================================
class ManejadorSilencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass  # no llenar la consola con cada archivo que se pide


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


# =============================================================
# 3. NAVEGADOR
# =============================================================
def abrir_navegador():
    """Abre Chrome; si no está instalado, intenta con Microsoft Edge."""
    argumentos = ["--lang=es-CO", "--no-first-run", "--no-default-browser-check",
                  "--disable-search-engine-choice-screen"]
    if OCULTO:
        argumentos += ["--headless=new", "--window-size=1366,900"]

    intentos = [("Chrome", webdriver.ChromeOptions, webdriver.Chrome),
                ("Edge", webdriver.EdgeOptions, webdriver.Edge)]
    for nombre, Opciones, Navegador in intentos:
        try:
            opciones = Opciones()
            for argumento in argumentos:
                opciones.add_argument(argumento)
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
# 4. FUNCIONES DE APOYO PARA LAS PRUEBAS
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


def buscar(id_elemento):
    return driver.find_element(By.ID, id_elemento)


def clases(elemento):
    return elemento.get_attribute("class") or ""


def grupo_de(id_campo):
    """Devuelve el <div class="grupo"> que contiene el campo."""
    return driver.execute_script("return arguments[0].closest('.grupo');", buscar(id_campo))


def estilo(elemento, propiedad):
    """Valor de un estilo CSS ya calculado por el navegador."""
    return driver.execute_script("return getComputedStyle(arguments[0])[arguments[1]];",
                                 elemento, propiedad)


def enfocar(elemento):
    """Mueve la página para que el elemento quede en el centro de la pantalla."""
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", elemento)


def resaltar(elemento, activo=True):
    """Dibuja (o quita) un borde naranja para ver dónde está actuando la prueba."""
    driver.execute_script(
        "arguments[0].style.outline = arguments[1] ? '3px solid #ff9800' : '';"
        "arguments[0].style.outlineOffset = arguments[1] ? '3px' : '';",
        elemento, activo)


def teclear(campo, texto, lento=True):
    """Escribe letra por letra (para que se vea) o todo de una vez."""
    if lento and VELOCIDAD_TECLEO > 0:
        for letra in texto:
            campo.send_keys(letra)
            time.sleep(VELOCIDAD_TECLEO)
    else:
        campo.send_keys(texto)


def asignar_con_js(campo, valor):
    """Pone el valor con JavaScript y avisa al formulario que cambió."""
    driver.execute_script(
        "arguments[0].value = arguments[1];"
        "arguments[0].dispatchEvent(new Event('input', {bubbles: true}));"
        "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
        campo, valor)


def escribir(id_campo, texto, lento=True):
    campo = buscar(id_campo)
    enfocar(campo)
    resaltar(campo)
    campo.clear()
    teclear(campo, texto, lento)
    if lento:
        pausa()
    resaltar(campo, False)


def escribir_fecha(id_campo, fecha, lento=True):
    campo = buscar(id_campo)
    enfocar(campo)
    resaltar(campo)
    # Chrome en español muestra dd/mm/aaaa: se teclea día, mes y año
    teclear(campo, fecha.strftime("%d%m%Y"), lento)
    if campo.get_property("value") != fecha.isoformat():
        # Si el navegador usa otro formato (ej: mm/dd/aaaa) se asigna con JavaScript
        asignar_con_js(campo, fecha.isoformat())
    if lento:
        pausa()
    resaltar(campo, False)


def escribir_hora(id_campo, hora, lento=True):
    """hora en formato 24 h, ej: "19:30". El campo se teclea en 12 h: 07 30 p."""
    campo = buscar(id_campo)
    enfocar(campo)
    resaltar(campo)
    horas, minutos = (int(parte) for parte in hora.split(":"))
    hora_12 = horas % 12 or 12
    am_pm = "p" if horas >= 12 else "a"
    teclear(campo, f"{hora_12:02d}{minutos:02d}{am_pm}", lento)
    if campo.get_property("value") != hora:
        asignar_con_js(campo, hora)
    if lento:
        pausa()
    resaltar(campo, False)


def llenar_campo(id_campo, valor, lento=True):
    """Escoge la forma de escribir según el tipo de campo."""
    if isinstance(valor, date):
        escribir_fecha(id_campo, valor, lento)
    elif id_campo == "hora":
        escribir_hora(id_campo, valor, lento)
    else:
        escribir(id_campo, valor, lento)


def hacer_clic(elemento, lento=True):
    enfocar(elemento)
    resaltar(elemento)
    if lento:
        pausa()
    elemento.click()
    resaltar(elemento, False)
    if lento:
        pausa()


def elegir_tipo(valor, lento=True):
    """Hace clic en la tarjeta del tipo de reserva (el <label> que contiene el radio)."""
    radio = driver.find_element(By.CSS_SELECTOR, f'input[name="tipo"][value="{valor}"]')
    tarjeta = radio.find_element(By.XPATH, "./..")
    hacer_clic(tarjeta, lento)


def enviar_formulario(lento=True):
    hacer_clic(driver.find_element(By.CSS_SELECTOR, "button[type='submit']"), lento)


def llenar_formulario_valido(excepto=None, cambios=None, lento=False):
    """Llena todo el formulario con datos correctos.
    excepto: campo que se deja vacío (para que la prueba lo escriba después).
    cambios: datos que reemplazan a los de DATOS_VALIDOS."""
    datos = dict(DATOS_VALIDOS)
    if cambios:
        datos.update(cambios)
    for id_campo, valor in datos.items():
        if id_campo == excepto:
            continue
        if id_campo == "tipo":
            elegir_tipo(valor, lento)
        else:
            llenar_campo(id_campo, valor, lento)


def texto_error(id_campo):
    return buscar("error-" + id_campo).text.strip()


def errores_visibles():
    return [e for e in driver.find_elements(By.CSS_SELECTOR, ".error") if e.text.strip()]


def esperar_modal():
    """Espera (máx. 5 s) a que aparezca la ventana de confirmación."""
    try:
        return WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.ID, "modal")))
    except TimeoutException:
        errores = "; ".join(e.text for e in errores_visibles())
        raise AssertionError("No apareció la ventana de confirmación. "
                             f"Errores en pantalla: {errores or 'ninguno'}")


def leer_resumen():
    """Lee la lista del resumen de la reserva como diccionario {título: valor}."""
    resumen = {}
    for linea in driver.find_elements(By.CSS_SELECTOR, "#resumen li"):
        titulo = linea.find_element(By.TAG_NAME, "strong").text.strip()
        valor = linea.find_element(By.TAG_NAME, "span").text.strip()
        resumen[titulo] = valor
    return resumen


def tomar_captura():
    """Guarda la captura de la prueba actual (sin el cartel de las pruebas)."""
    ocultar_cartel()
    driver.save_screenshot(str(CAPTURA["ruta"]))
    CAPTURA["tomada"] = True


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


def mostrar_cartel(texto, color="#3b2418"):
    driver.execute_script(JS_CARTEL, texto, color)


def ocultar_cartel():
    driver.execute_script(
        "const c = document.getElementById('cartel-pruebas'); if (c) c.style.display = 'none';")


# =============================================================
# 5. REGISTRO DE PRUEBAS
#    El decorador @prueba agrega la función a la lista PRUEBAS.
# =============================================================
PRUEBAS = []


def prueba(nombre, esperado):
    def registrar(funcion):
        PRUEBAS.append({"nombre": nombre, "esperado": esperado, "funcion": funcion})
        return funcion
    return registrar


def verificar_error(id_campo, valor, mensaje_esperado, cambios=None):
    """Llena bien todo el formulario menos un campo, escribe en ese campo un dato
    incorrecto, envía y revisa que aparezca SOLO el error esperado."""
    llenar_formulario_valido(excepto=id_campo, cambios=cambios)
    llenar_campo(id_campo, valor, lento=True)
    enviar_formulario()

    error = texto_error(id_campo)
    comprobar(error == mensaje_esperado,
              f"Se esperaba \"{mensaje_esperado}\" pero apareció \"{error or '(ningún mensaje)'}\".")
    comprobar("invalido" in clases(grupo_de(id_campo)), "El campo no quedó marcado en rojo.")

    otros = [e.text for e in errores_visibles() if e.get_attribute("id") != "error-" + id_campo]
    comprobar(not otros, f"También aparecieron errores en otros campos: {'; '.join(otros)}")
    comprobar(not buscar("modal").is_displayed(), "Se registró la reserva a pesar del error.")

    enfocar(buscar(id_campo))
    return f"Apareció \"{error}\", el campo quedó en rojo y la reserva no se registró."


# =============================================================
# 6. LAS PRUEBAS
# =============================================================

@prueba("La página carga correctamente",
        "Se ven el título, el encabezado, los 10 campos, los estilos (css/styles.css) "
        "y el script (js/script.js); en computador los campos van en 2 columnas.")
def prueba_carga():
    comprobar("Reservas" in driver.title, f"El título de la pestaña es \"{driver.title}\".")
    titulo = driver.find_element(By.TAG_NAME, "h1").text
    comprobar(titulo == "Reserva tu mesa", f"El encabezado dice \"{titulo}\".")

    faltantes = [c for c in CAMPOS + ["tipo"] if not driver.find_elements(By.ID, c)]
    comprobar(not faltantes, f"No se encontraron los campos: {', '.join(faltantes)}")
    radios = driver.find_elements(By.CSS_SELECTOR, 'input[name="tipo"]')
    comprobar(len(radios) == 4, f"Hay {len(radios)} tipos de reserva y deberían ser 4.")

    fondo = estilo(driver.find_element(By.CLASS_NAME, "encabezado"), "backgroundImage")
    comprobar("gradient" in fondo, "css/styles.css no se cargó (el encabezado no tiene degradado).")
    comprobar(buscar("fechaReserva").get_attribute("min") == HOY.isoformat(),
              "js/script.js no se cargó (la fecha mínima de reserva no es hoy).")

    columnas = estilo(driver.find_element(By.CLASS_NAME, "campos"), "gridTemplateColumns").split()
    comprobar(len(columnas) == 2, f"Los campos se ven en {len(columnas)} columna(s) y deberían ser 2.")
    return "Título, encabezado, 10 campos, 4 tipos de reserva, estilos y script cargados; 2 columnas."


@prueba("Enviar el formulario vacío",
        "Aparecen los 9 mensajes de campos obligatorios, el aviso general en rojo "
        "y el cursor queda en el primer campo (Nombre).")
def prueba_formulario_vacio():
    enviar_formulario()
    errores = errores_visibles()
    comprobar(len(errores) == 9, f"Se esperaban 9 mensajes de error y aparecieron {len(errores)}.")
    comprobar(buscar("avisoErrores").is_displayed(), "No apareció el aviso general de errores.")
    activo = driver.switch_to.active_element.get_attribute("id")
    comprobar(activo == "nombre", f"El cursor quedó en \"{activo}\" y no en Nombre.")
    comprobar(not buscar("modal").is_displayed(), "Se registró una reserva vacía.")
    enfocar(buscar("avisoErrores"))
    return "Aparecieron 9 mensajes de error, el aviso general y el cursor quedó en Nombre."


# ----- Datos incorrectos: (título, campo, valor, mensaje que debe aparecer) -----
CASOS_DE_ERROR = [
    ("Nombre sin apellido", "nombre", "Carlos",
     "Escribe tu nombre y al menos un apellido."),
    ("Nombre con números", "nombre", "Carlos 123",
     "El nombre solo puede tener letras y espacios."),
    ("Identificación con puntos", "identificacion", "10.987.654",
     "Escribe solo números, sin puntos ni espacios."),
    ("Identificación muy corta", "identificacion", "12345",
     "Debe tener entre 6 y 10 dígitos."),
    ("Teléfono incompleto", "telefono", "300123",
     "El teléfono debe tener 10 dígitos (tiene 6)."),
    ("Teléfono con letras", "telefono", "300abc4567",
     "El teléfono solo puede tener números."),
    ("Teléfono que no es colombiano", "telefono", "2001234567",
     "Debe empezar por 3 (celular) o por 60 (fijo)."),
    ("Correo sin dominio", "correo", "maria@correo",
     "Escribe un correo válido, por ejemplo: nombre@correo.com"),
    ("Correo sin arroba", "correo", "maria.correo.com",
     "Escribe un correo válido, por ejemplo: nombre@correo.com"),
    ("Persona menor de edad", "fechaNacimiento", hace_anios(15),
     "Debes ser mayor de edad (18 años o más) para reservar."),
    ("Fecha de nacimiento futura", "fechaNacimiento", HOY + timedelta(days=30),
     "La fecha de nacimiento no puede ser futura."),
    ("Reserva en una fecha pasada", "fechaReserva", HOY - timedelta(days=10),
     "La fecha de la reserva no puede ser anterior a hoy."),
    ("Hora después del cierre", "hora", "23:30",
     "Recibimos reservas de 12:00 m. a 10:00 p. m."),
    ("Hora antes de la apertura", "hora", "09:00",
     "Recibimos reservas de 12:00 m. a 10:00 p. m."),
    ("Más de 20 personas", "personas", "25",
     "Para más de 20 personas comunícate directamente con el restaurante."),
    ("Cero personas", "personas", "0",
     "La reserva debe ser al menos para 1 persona."),
]


def registrar_caso_de_error(titulo, id_campo, valor, mensaje):
    texto_valor = valor.strftime("%d/%m/%Y") if isinstance(valor, date) else valor

    @prueba(titulo, f"Al escribir \"{texto_valor}\" aparece: \"{mensaje}\"")
    def caso():
        return verificar_error(id_campo, valor, mensaje)


for caso_de_error in CASOS_DE_ERROR:
    registrar_caso_de_error(*caso_de_error)


@prueba("Hora ya pasada para una reserva de hoy",
        "Si la reserva es para hoy y la hora ya pasó, aparece: "
        "\"Para hoy, elige una hora posterior a la actual.\"")
def prueba_hora_pasada_hoy():
    ahora = datetime.now()
    hora = (ahora - timedelta(minutes=5)).strftime("%H:%M")
    if not ("12:00" <= hora <= "22:00"):
        raise PruebaOmitida("Solo se puede probar entre las 12:05 p. m. y las 10:05 p. m. "
                            f"(se ejecutó a las {ahora:%H:%M}).")
    return verificar_error("hora", hora, "Para hoy, elige una hora posterior a la actual.",
                           cambios={"fechaReserva": HOY})


@prueba("Teléfono escrito con espacios",
        "\"300 123 4567\" se acepta como teléfono válido y la reserva se registra.")
def prueba_telefono_con_espacios():
    llenar_formulario_valido(excepto="telefono")
    escribir("telefono", "300 123 4567")
    enviar_formulario()
    esperar_modal()
    pausa()
    return "El teléfono con espacios fue aceptado y la reserva se registró."


@prueba("El error desaparece al corregir el dato",
        "Después de un error en el correo, al escribirlo bien el mensaje se borra "
        "y el campo se pone en verde sin volver a enviar.")
def prueba_correccion_en_vivo():
    llenar_formulario_valido(excepto="correo")
    escribir("correo", "maria@correo")
    enviar_formulario()
    comprobar(texto_error("correo") != "", "No apareció el error del correo.")
    pausa()
    escribir("correo", "maria@correo.com")  # se corrige SIN volver a enviar
    comprobar(texto_error("correo") == "", f"El error sigue visible: \"{texto_error('correo')}\".")
    comprobar("valido" in clases(grupo_de("correo")), "El campo no se marcó en verde.")
    comprobar(not buscar("avisoErrores").is_displayed(), "El aviso general sigue visible.")
    return "El mensaje desapareció, el campo quedó en verde y el aviso general se ocultó."


@prueba("Selección del tipo de reserva",
        "Las 4 opciones se pueden elegir, solo una queda marcada a la vez "
        "y la elegida se pinta de color café.")
def prueba_tipos_de_reserva():
    for valor in ["familiar", "pareja", "amigos", "empresarial"]:
        elegir_tipo(valor)
        marcados = driver.find_elements(By.CSS_SELECTOR, 'input[name="tipo"]:checked')
        comprobar(len(marcados) == 1, f"Hay {len(marcados)} opciones marcadas al elegir {valor}.")
        comprobar(marcados[0].get_attribute("value") == valor, f"No quedó marcada la opción {valor}.")
        tarjeta = marcados[0].find_element(By.XPATH, "following-sibling::span")
        try:
            WebDriverWait(driver, 2).until(
                lambda d: estilo(tarjeta, "backgroundColor") == "rgb(111, 78, 55)")
        except TimeoutException:
            raise AssertionError(f"La tarjeta {valor} no se resaltó "
                                 f"(color: {estilo(tarjeta, 'backgroundColor')}).")
    return "Las 4 opciones se eligieron una por una y la seleccionada se resaltó en café."


@prueba("Contador de caracteres de observaciones",
        "Al escribir en Observaciones, el contador muestra cuántas letras van (ej: 35 / 250).")
def prueba_contador():
    texto = "Mesa cerca de la ventana, por favor"
    escribir("observaciones", texto)
    contador = buscar("contador").text
    comprobar(contador == f"{len(texto)} / 250",
              f"El contador dice \"{contador}\" y debería decir \"{len(texto)} / 250\".")
    return f"Se escribieron {len(texto)} caracteres y el contador mostró \"{contador}\"."


@prueba("Límite de 250 caracteres en observaciones",
        "Si se escriben 260 letras, el campo solo guarda 250 y el contador muestra 250 / 250.")
def prueba_limite_observaciones():
    escribir("observaciones", "a" * 260, lento=False)
    largo = len(buscar("observaciones").get_property("value"))
    contador = buscar("contador").text
    comprobar(largo == 250, f"El campo guardó {largo} caracteres.")
    comprobar(contador == "250 / 250", f"El contador dice \"{contador}\".")
    pausa()
    return f"Se intentaron 260 letras, el campo guardó {largo} y el contador mostró \"{contador}\"."


@prueba("Registro exitoso de una reserva",
        "Con todos los datos correctos aparece \"¡Reserva registrada!\" con el resumen: "
        "nombre, fecha, hora (7:30 p. m.), 4 personas, tipo Familiar, correo y observaciones.")
def prueba_registro_exitoso():
    llenar_formulario_valido(lento=True)
    enviar_formulario()
    esperar_modal()

    titulo = buscar("modalTitulo").text
    comprobar(titulo == "¡Reserva registrada!", f"El título de la confirmación es \"{titulo}\".")
    mensaje = buscar("modalMensaje").text
    comprobar(mensaje.startswith("Gracias, María."), f"El mensaje dice \"{mensaje}\".")

    resumen = leer_resumen()
    esperados = {
        "Nombre": DATOS_VALIDOS["nombre"],
        "Hora": "7:30 p. m.",
        "Personas": "4 personas",
        "Tipo": "Familiar",
        "Correo": DATOS_VALIDOS["correo"],
        "Observaciones": DATOS_VALIDOS["observaciones"],
    }
    for titulo_linea, valor in esperados.items():
        comprobar(resumen.get(titulo_linea) == valor,
                  f"En el resumen, \"{titulo_linea}\" dice \"{resumen.get(titulo_linea)}\" "
                  f"y se esperaba \"{valor}\".")
    fecha = DATOS_VALIDOS["fechaReserva"]
    fecha_esperada = f"{fecha.day} de {MESES[fecha.month - 1]} de {fecha.year}"
    comprobar(fecha_esperada in resumen.get("Fecha", ""),
              f"La fecha del resumen es \"{resumen.get('Fecha')}\" y debía incluir \"{fecha_esperada}\".")
    pausa(1.5)
    return (f"Apareció la confirmación con el resumen completo: {resumen['Fecha']}, "
            f"{resumen['Hora']}, {resumen['Personas']}, {resumen['Tipo']}.")


@prueba("El formulario se limpia después de registrar",
        "Al cerrar la confirmación con \"Aceptar\", todos los campos quedan vacíos, "
        "sin colores, el contador en 0 y el cursor en Nombre.")
def prueba_formulario_limpio():
    llenar_formulario_valido()
    enviar_formulario()
    esperar_modal()
    pausa()
    hacer_clic(buscar("btnCerrarModal"))

    comprobar(not buscar("modal").is_displayed(), "La ventana de confirmación no se cerró.")
    con_datos = [c for c in CAMPOS if buscar(c).get_property("value") != ""]
    comprobar(not con_datos, f"Estos campos no se limpiaron: {', '.join(con_datos)}")
    comprobar(not driver.find_elements(By.CSS_SELECTOR, 'input[name="tipo"]:checked'),
              "El tipo de reserva sigue seleccionado.")
    comprobar(not driver.find_elements(By.CSS_SELECTOR, ".grupo.invalido, .grupo.valido"),
              "Quedaron campos pintados de rojo o verde.")
    contador = buscar("contador").text
    comprobar(contador == "0 / 250", f"El contador dice \"{contador}\".")
    activo = driver.switch_to.active_element.get_attribute("id")
    comprobar(activo == "nombre", f"El cursor quedó en \"{activo}\".")
    driver.execute_script("window.scrollTo(0, 0);")
    return "Todos los campos quedaron vacíos, sin colores, el contador en 0 y el cursor en Nombre."


@prueba("Cerrar la confirmación con la tecla Escape",
        "Con la ventana de confirmación abierta, la tecla Esc la cierra.")
def prueba_tecla_escape():
    llenar_formulario_valido()
    enviar_formulario()
    esperar_modal()
    pausa()
    ActionChains(driver).send_keys(Keys.ESCAPE).perform()
    pausa()
    comprobar(not buscar("modal").is_displayed(), "La ventana no se cerró con Escape.")
    return "La ventana de confirmación se cerró al presionar Esc."


@prueba("Botón Limpiar",
        "El botón \"Limpiar\" borra los datos escritos, los mensajes de error y el aviso general.")
def prueba_boton_limpiar():
    escribir("nombre", "Carlos")
    escribir("correo", "maria@correo")
    enviar_formulario()
    cantidad = len(errores_visibles())
    comprobar(cantidad > 0, "No aparecieron errores antes de limpiar.")
    hacer_clic(driver.find_element(By.CSS_SELECTOR, "button[type='reset']"))

    con_datos = [c for c in CAMPOS if buscar(c).get_property("value") != ""]
    comprobar(not con_datos, f"Estos campos no se borraron: {', '.join(con_datos)}")
    restantes = len(errores_visibles())
    comprobar(restantes == 0, f"Quedaron {restantes} mensajes de error.")
    comprobar(not buscar("avisoErrores").is_displayed(), "El aviso general sigue visible.")
    driver.execute_script("window.scrollTo(0, 0);")
    return f"Se borraron los datos y los {cantidad} mensajes de error que había."


@prueba("Seguridad: el código HTML se muestra como texto",
        "Si en Observaciones se escribe código HTML, el resumen lo muestra como texto "
        "y no lo ejecuta (no se crean etiquetas ni aparecen alertas).")
def prueba_seguridad_html():
    texto = "<b>torta</b> <img src=x onerror=alert(1)>"
    llenar_formulario_valido(excepto="observaciones")
    escribir("observaciones", texto)
    enviar_formulario()
    esperar_modal()

    try:
        driver.switch_to.alert
        raise AssertionError("Se ejecutó el código: apareció una alerta.")
    except NoAlertPresentException:
        pass
    mostrado = leer_resumen().get("Observaciones")
    comprobar(mostrado == texto, f"El resumen muestra \"{mostrado}\".")
    etiquetas = driver.find_elements(By.CSS_SELECTOR, "#resumen b, #resumen img")
    comprobar(not etiquetas, "El código se convirtió en etiquetas HTML dentro del resumen.")
    pausa(1)
    return "El texto con etiquetas se mostró tal cual, sin ejecutarse ni crear elementos."


@prueba("Diseño adaptable en celular (375 px)",
        "En la pantalla de un celular los campos pasan a 1 columna, los tipos de reserva "
        "a 2 columnas y los botones quedan uno debajo del otro.")
def prueba_responsive():
    try:
        driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride",
                               {"width": 375, "height": 812, "deviceScaleFactor": 1, "mobile": True})
    except Exception:
        raise PruebaOmitida("Este navegador no permite simular la pantalla de un celular.")
    try:
        pausa(1)
        columnas = estilo(driver.find_element(By.CLASS_NAME, "campos"), "gridTemplateColumns").split()
        tipos = estilo(buscar("tipo"), "gridTemplateColumns").split()
        botones = estilo(driver.find_element(By.CLASS_NAME, "acciones"), "flexDirection")

        comprobar(len(columnas) == 1, f"Los campos se ven en {len(columnas)} columnas.")
        comprobar(len(tipos) == 2, f"Los tipos de reserva se ven en {len(tipos)} columnas.")
        comprobar(botones == "column-reverse", f"Los botones usan flex-direction: {botones}.")

        enfocar(buscar("tipo"))
        pausa(1)
        tomar_captura()  # la foto se toma aquí, mientras se simula el celular
    finally:
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    return "En 375 px: campos en 1 columna, tipos de reserva en 2 columnas y botones apilados."


# =============================================================
# 7. EJECUCIÓN DE TODAS LAS PRUEBAS
# =============================================================
COLORES_ESTADO = {"APROBADA": "#2e7d4f", "FALLIDA": "#b3261e", "OMITIDA": "#6b6b6b"}


def ejecutar_pruebas(url, carpeta_capturas):
    resultados = []
    total = len(PRUEBAS)

    for numero, datos in enumerate(PRUEBAS, start=1):
        nombre = datos["nombre"]
        print(f"  [{numero:02d}/{total}] {nombre:.<52} ", end="", flush=True)
        CAPTURA["ruta"] = carpeta_capturas / f"{numero:02d}.png"
        CAPTURA["tomada"] = False
        inicio = time.perf_counter()

        try:
            driver.get(url)  # cada prueba empieza con la página recién cargada
            mostrar_cartel(f"Prueba {numero} de {total}\n{nombre}")
            pausa()
            obtenido = datos["funcion"]() or "Correcto."
            estado = "APROBADA"
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
        resultados.append({
            "numero": numero,
            "nombre": nombre,
            "esperado": datos["esperado"],
            "obtenido": obtenido,
            "estado": estado,
            "duracion": duracion,
            "captura": str(CAPTURA["ruta"]) if CAPTURA["tomada"] else None,
        })
    return resultados


def mostrar_resumen_final(url, aprobadas, fallidas, omitidas):
    """Pantalla final en el navegador con el resultado."""
    try:
        driver.get(url)
        driver.execute_script("""
            const capa = document.createElement('div');
            capa.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;' +
              'align-items:center;justify-content:center;background:rgba(28,20,16,.88);' +
              'font-family:Segoe UI,Arial,sans-serif;';
            const caja = document.createElement('div');
            caja.style.cssText = 'background:#fff;border-top:6px solid #c8a27a;border-radius:16px;' +
              'padding:32px 44px;text-align:center;white-space:pre-line;font-size:18px;' +
              'line-height:1.7;color:#2b201a;box-shadow:0 25px 60px rgba(0,0,0,.5);';
            caja.textContent = arguments[0];
            capa.appendChild(caja);
            document.body.appendChild(capa);
        """, f"PRUEBAS TERMINADAS\n\nAprobadas: {aprobadas}\nFallidas: {fallidas}\n"
             f"Omitidas: {omitidas}\n\nGenerando el reporte PDF...")
        pausa(3)
    except WebDriverException:
        pass


# =============================================================
# 8. PROGRAMA PRINCIPAL
# =============================================================
def main():
    global driver

    print()
    print("  ==========================================================")
    print("   PRUEBAS AUTOMÁTICAS - Formulario de reservas (Selenium)")
    print("  ==========================================================")

    marca = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    carpeta_capturas = CARPETA_REPORTES / f"capturas_{marca}"
    carpeta_capturas.mkdir(parents=True, exist_ok=True)

    servidor, url = iniciar_servidor()
    print(f"  Servidor local: {url}")
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
        resultados = ejecutar_pruebas(url, carpeta_capturas)
        aprobadas = sum(r["estado"] == "APROBADA" for r in resultados)
        fallidas = sum(r["estado"] == "FALLIDA" for r in resultados)
        omitidas = sum(r["estado"] == "OMITIDA" for r in resultados)
        mostrar_resumen_final(url, aprobadas, fallidas, omitidas)
    finally:
        try:
            driver.quit()
        except Exception:
            pass
        servidor.shutdown()
    fin = datetime.now()

    info = {
        "inicio": inicio,
        "fin": fin,
        "navegador": navegador,
        "selenium": selenium.__version__,
        "python": platform.python_version(),
        "sistema": f"{platform.system()} {platform.release()} ({platform.version()})",
        "url": url,
        "modo": ("Navegador oculto" if OCULTO else "Navegador visible")
                + (", sin pausas" if RAPIDO else ", con pausas para ver cada paso"),
        "total_registradas": len(PRUEBAS),
    }

    ruta_pdf = CARPETA_REPORTES / f"reporte_pruebas_{marca}.pdf"
    generar_reporte(ruta_pdf, resultados, info)

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
