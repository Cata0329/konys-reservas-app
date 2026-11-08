"""
Pruebas Selenium de Konys Pizza (funcionales, seguridad, inactividad y consola).

Ejecutar desde la raíz del proyecto (requiere Node.js, Python 3, Chrome):
    py -X utf8 tests/selenium/ejecutar.py            # Chrome oculto
    py -X utf8 tests/selenium/ejecutar.py --visible  # ver el navegador
    py -X utf8 tests/selenium/ejecutar.py F09 S03    # solo algunos casos

Cada caso comprueba el RESULTADO real (datos en la base, estado de la
sesión, mensajes), no solo que existan elementos. Además, después de cada
caso se leen la consola de Chrome y las respuestas HTTP: cualquier error
no previsto hace fallar el caso.

Resultados: tests/selenium/resultados/ (JSON + capturas) y la tabla de
docs/INFORME_PRUEBAS_SELENIUM.md.
"""
import json
import re
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

sys.path.insert(0, str(Path(__file__).parent))
from entorno import (CLAVE_PRUEBA, CLAVE_SESION, RAIZ, URL_SUPABASE, URL_WEB,  # noqa: E402
                     Entorno, api, generar_config, token_de)

RESULTADOS = Path(__file__).parent / "resultados"
INFORME = RAIZ / "docs" / "INFORME_PRUEBAS_SELENIUM.md"
MENU = json.loads((RAIZ / "docs" / "menu-oficial-konys.json").read_text(encoding="utf-8"))
PLATOS_PRUEBA = ["Margherita de la casa", "Pepperoni Konys", "Vegetal al horno", "Pollo BBQ",
                 "Palitos de ajo y queso", "Tiramisú", "Calzone de arequipe"]

driver = None
CASOS = []


def caso(codigo, grupo, nombre, errores_esperados=()):
    """Registra un caso. errores_esperados: patrones de consola/red provocados A PROPÓSITO."""
    def registrar(funcion):
        CASOS.append({"codigo": codigo, "grupo": grupo, "nombre": nombre,
                      "funcion": funcion, "esperados": list(errores_esperados)})
        return funcion
    return registrar


def comprobar(condicion, mensaje):
    if not condicion:
        raise AssertionError(mensaje)


# ---------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------
def esperar(condicion, segundos=10, mensaje="Tiempo de espera agotado"):
    try:
        return WebDriverWait(driver, segundos).until(condicion)
    except TimeoutException:
        raise AssertionError(mensaje)


def visible(selector, segundos=10):
    return esperar(EC.visibility_of_element_located((By.CSS_SELECTOR, selector)), segundos,
                   f"No apareció «{selector}»")


def ir(ruta):
    """Navega y SIEMPRE recarga (si solo cambia el #hash, el navegador no recargaría la página)."""
    destino = f"{URL_WEB}/{ruta.lstrip('/')}"
    misma_pagina = driver.current_url.split("#")[0] == destino.split("#")[0]
    driver.get(destino)
    if misma_pagina:
        driver.refresh()


def js(codigo, *args):
    return driver.execute_script(codigo, *args)


def texto(selector):
    return driver.find_element(By.CSS_SELECTOR, selector).text


def clic(selector):
    el = visible(selector)
    # La página usa scroll-behavior: smooth; se desplaza al instante para no pulsar en movimiento.
    js("arguments[0].scrollIntoView({block:'center', behavior:'instant'})", el)
    esperar(EC.element_to_be_clickable(el), 5, f"«{selector}» no se puede pulsar")
    el.click()
    return el


def escribir(selector, valor):
    el = visible(selector)
    el.clear()
    el.send_keys(valor)
    return el


def sesion_guardada():
    valor = js(f"return sessionStorage.getItem('{CLAVE_SESION}')")
    return json.loads(valor) if valor else None


def login(clave=CLAVE_PRUEBA, ruta="admin", esperar_panel=True):
    ir(ruta)
    visible("#clave")
    escribir("#clave", clave)
    clic("#btn-ingresar")
    if esperar_panel:
        visible("#panel-admin .principal h1", 15)


def en_acceso():
    return driver.find_element(By.ID, "acceso").is_displayed() and not driver.find_element(By.ID, "panel-admin").is_displayed()


def nombres_visibles_en_carta():
    """Recorre todas las pestañas de la carta y devuelve {nombre: (precio, src_imagen)}."""
    ir("")
    visible(".pestana")
    vistos = {}
    for pestana in driver.find_elements(By.CSS_SELECTOR, ".pestana"):
        js("arguments[0].click()", pestana)
        time.sleep(0.15)
        for tarjeta in driver.find_elements(By.CSS_SELECTOR, "#carta-lista .tarjeta-plato"):
            nombre = js("return arguments[0].querySelector('h3').textContent", tarjeta).strip()
            precio = js("return arguments[0].querySelector('.tarjeta-plato__precio').textContent", tarjeta).strip()
            img = js("const i=arguments[0].querySelector('img'); return i ? i.getAttribute('src') : null", tarjeta)
            vistos[nombre] = (precio, img)
    return vistos


def productos_oficiales():
    unicos = {}

    def recorrer(s):
        for p in s["productos"]:
            unicos[p["id_clubify"]] = p
        for sub in s["subsecciones"]:
            recorrer(sub)
    for s in MENU["secciones"]:
        recorrer(s)
    return list(unicos.values())


def precio_texto(valor):
    return "Precio por confirmar" if not valor else "$" + f"{valor:,}".replace(",", ".")


def esperar_alerta(tipo_o_texto, segundos=10):
    return esperar(lambda d: any(tipo_o_texto in a.text for a in d.find_elements(By.CSS_SELECTOR, ".alerta")),
                   segundos, f"No apareció una alerta con «{tipo_o_texto}»")


def notificacion(texto_esperado, segundos=10):
    esperar(lambda d: any(texto_esperado in n.text for n in d.find_elements(By.CSS_SELECTOR, ".notificacion")),
            segundos, f"No apareció la notificación «{texto_esperado}»")


def cerrar_sesion_si_hay():
    try:
        if driver.current_url.startswith(URL_WEB):
            js("sessionStorage.clear()")
    except Exception:
        pass


# ---------------------------------------------------------------------
# Consola y red (Chrome DevTools vía ChromeDriver)
# ---------------------------------------------------------------------
def leer_registros():
    consola = [{"nivel": e["level"], "mensaje": e["message"]} for e in driver.get_log("browser")]
    red = []
    for e in driver.get_log("performance"):
        m = json.loads(e["message"])["message"]
        if m["method"] == "Network.responseReceived":
            r = m["params"]["response"]
            if r["status"] >= 400:
                red.append({"estado": r["status"], "url": r["url"]})
        elif m["method"] == "Network.loadingFailed" and not m["params"].get("canceled"):
            red.append({"estado": "fallo", "url": m["params"].get("errorText", ""), "tipo": m["params"].get("type")})
    return consola, red


def clasificar(consola, red, esperados):
    def esperado(texto):
        return any(re.search(p, texto) for p in esperados)
    errores_consola = [c for c in consola if c["nivel"] in ("SEVERE",) and not esperado(c["mensaje"])]
    avisos = [c for c in consola if c["nivel"] == "WARNING"]
    errores_red = [r for r in red if not esperado(f"{r['estado']} {r['url']}")]
    previstos = [c for c in consola if c["nivel"] == "SEVERE" and esperado(c["mensaje"])] + \
                [r for r in red if esperado(f"{r['estado']} {r['url']}")]
    return errores_consola, avisos, errores_red, previstos


# =====================================================================
# PRUEBAS FUNCIONALES — SITIO PÚBLICO
# =====================================================================
@caso("F01", "Funcional", "La página principal carga con mesas activas y sin errores")
def f01():
    ir("")
    visible(".tarjeta-mesa", 20)
    comprobar("Konys Pizza" in driver.title, f"Título: {driver.title}")
    comprobar("quedarte" in texto("h1"), "No se ve el titular principal")
    mesas = [e.text for e in driver.find_elements(By.CSS_SELECTOR, ".tarjeta-mesa h3")]
    comprobar(len(mesas) == 8 and "Mesa 9" not in mesas, f"Mesas visibles: {mesas} (Mesa 9 está inactiva)")
    comprobar("Bucaramanga" in texto("#contacto"), "Falta la dirección en el pie")
    return f"{len(mesas)} mesas activas visibles; la Mesa 9 (inactiva) no aparece."


@caso("F02", "Funcional", "Navegación entre secciones y páginas")
def f02():
    ir("")
    visible(".nav")
    driver.find_element(By.CSS_SELECTOR, ".nav a[href='#carta']").click()
    esperar(lambda d: d.execute_script("const r=document.querySelector('#carta').getBoundingClientRect(); return r.top < 200 && r.bottom > 0"),
            5, "La sección Carta no quedó visible tras pulsar el enlace")
    driver.find_element(By.CSS_SELECTOR, ".nav a[href='mi-reserva.html']").click()
    visible("#form-consulta")
    comprobar(driver.title.startswith("Mi reserva"), driver.title)
    driver.back()
    visible(".cabecera__cta").click()
    visible("#titulo-reserva")
    return "Carta (ancla), Mi reserva y Reservar se abren correctamente."


@caso("F03", "Funcional", "Las categorías de la carta corresponden al menú oficial")
def f03():
    ir("")
    visible(".pestana", 20)
    pestanas = [p.text for p in driver.find_elements(By.CSS_SELECTOR, ".pestana")]
    oficiales = [s["nombre"] for s in MENU["secciones"]]
    comprobar(pestanas == oficiales, f"Pestañas {pestanas} ≠ secciones oficiales {oficiales}")
    estado, cats = api("GET", "/rest/v1/categorias?select=id,nombre&order=orden.asc")
    comprobar(estado == 200 and len(cats) == 14, f"Categorías en la base: {estado} {cats}")
    return f"{len(pestanas)} pestañas (Recomendados + 14 categorías) en el mismo orden que la fuente oficial."


@caso("F04", "Funcional", "Solo se muestran productos reales con su precio oficial")
def f04():
    vistos = nombres_visibles_en_carta()
    oficiales = productos_oficiales()
    faltan = [p["nombre"] for p in oficiales if p["nombre"] not in vistos]
    comprobar(not faltan, f"Productos oficiales que no se ven: {faltan}")
    mal_precio = [(p["nombre"], vistos[p["nombre"]][0]) for p in oficiales if vistos[p["nombre"]][0] != precio_texto(p["precio"])]
    comprobar(not mal_precio, f"Precios distintos a la fuente: {mal_precio}")
    ficticios = [n for n in PLATOS_PRUEBA if n in vistos]
    comprobar(not ficticios, f"Se ven platos de prueba: {ficticios}")
    extras = [n for n in vistos if n not in {p['nombre'] for p in oficiales}]
    comprobar(not extras, f"Se ven productos que no están en el menú oficial: {extras}")
    return f"{len(vistos)} productos visibles = {len(oficiales)} oficiales; precios iguales; 0 platos ficticios."


@caso("F05", "Funcional", "Las fotos oficiales cargan y los productos sin foto lo indican")
def f05():
    ir("")
    visible(".pestana", 20)
    cargadas, rotas, sin_foto = 0, [], []
    for pestana in driver.find_elements(By.CSS_SELECTOR, ".pestana"):
        js("arguments[0].click()", pestana)
        for img in driver.find_elements(By.CSS_SELECTOR, "#carta-lista .tarjeta-plato img"):
            js("arguments[0].loading='eager'; arguments[0].scrollIntoView({block:'center'})", img)
            ok = esperar(lambda d: d.execute_script("return arguments[0].complete", img), 20, "Imagen sin terminar de cargar")
            if ok and js("return arguments[0].naturalWidth", img) > 0:
                cargadas += 1
            else:
                rotas.append(img.get_attribute("src"))
        sin_foto += [e.text for e in driver.find_elements(By.CSS_SELECTOR, "#carta-lista .tarjeta-plato__sin-foto")]
    comprobar(not rotas, f"Imágenes rotas: {rotas}")
    comprobar(cargadas >= 65, f"Solo cargaron {cargadas} fotos")
    comprobar(len(sin_foto) == 2, f"Productos rotulados sin foto: {len(sin_foto)}")
    return f"{cargadas} fotos oficiales mostradas (incluye repetidas en Recomendados), 0 rotas; 2 productos rotulados «sin foto oficial»."


@caso("F06", "Funcional", "Menú Almuerzos muestra su franja de 12:00 a 2:30 p. m.")
def f06():
    ir("")
    visible(".pestana", 20)
    clic("#tab-menu_almuerzos")
    alerta = esperar_alerta("Esta sección se sirve solo de 12:00 p. m. a 2:30 p. m.")
    comprobar(alerta, "Sin aviso de franja")
    nombres = [e.text for e in driver.find_elements(By.CSS_SELECTOR, "#carta-lista h3")]
    comprobar(nombres == ["LASAÑA DE CARNE", "LASAÑA MIXTA", "LASAÑA DE MADURO"], f"Productos: {nombres}")
    return "Aviso de franja visible y los 3 productos oficiales de almuerzo."


@caso("F07", "Funcional", "Consulta de mesas disponibles por fecha y hora")
def f07():
    ir("")
    esperar(lambda d: d.find_element(By.ID, "consulta-fecha").is_enabled(), 20, "El selector de fecha no se habilitó")
    fechas = js("return [...document.querySelectorAll('#consulta-fecha option')].map(o=>o.value)")
    js("const s=document.querySelector('#consulta-fecha'); s.value=arguments[0]; s.dispatchEvent(new Event('change'))", fechas[1])
    js("const s=document.querySelector('#consulta-personas'); s.value='6'; s.dispatchEvent(new Event('change'))")
    clic("#btn-consulta")
    esperar(lambda d: "Disponibilidad para" in d.find_element(By.ID, "mesas-contexto").text, 10, "No se actualizó la disponibilidad")
    mesas = [e.text for e in driver.find_elements(By.CSS_SELECTOR, ".tarjeta-mesa h3")]
    comprobar(mesas == ["Mesa 5", "Mesa 8"], f"Con 6 personas deberían verse solo las mesas de 6: {mesas}")
    return f"Filtro de 6 personas para {fechas[1]}: {', '.join(mesas)}."


def abrir_reserva_mesa(mesa_id, fecha=None):
    ir(f"reservar.html?mesa={mesa_id}" + (f"&fecha={fecha}" if fecha else ""))
    visible("#titulo-paso", 20)
    esperar(lambda d: d.find_elements(By.CSS_SELECTOR, "[data-hora]"), 20, "No aparecieron horarios libres")


def proximo_dia(iso_dia):
    """Próxima fecha (desde mañana) con día ISO 1..7, en formato AAAA-MM-DD."""
    from datetime import date, timedelta
    d = date.today() + timedelta(days=1)
    while d.isoweekday() != iso_dia:
        d += timedelta(days=1)
    return d.isoformat()


@caso("F08", "Funcional", "Consulta de horarios: calendario y horas según la configuración")
def f08():
    fecha = proximo_dia(3)  # miércoles: almuerzo y noche
    abrir_reserva_mesa(6, fecha)
    horas = js("return [...document.querySelectorAll('.hora')].map(b=>b.textContent.trim())")
    comprobar(horas[:3] == ["12:30 p. m.", "1:00 p. m.", "1:30 p. m."] and horas[-1] == "10:00 p. m.", f"Horas: {horas}")
    lunes = proximo_dia(1)
    dia_lunes = driver.find_elements(By.CSS_SELECTOR, f"[data-fecha='{lunes}']")
    comprobar(not dia_lunes, "El lunes (sin atención) no debe ser seleccionable")
    return f"{len(horas)} horas para el {fecha} (almuerzo 12:30–1:30, noche 5:00–10:00); los lunes están cerrados."


def completar_reserva(nombre, personas=None, contacto="300 123 4567"):
    clic("[data-hora]")
    clic("#continuar-2")
    visible("#nombre")
    escribir("#nombre", nombre)
    if personas:
        while int(texto("#valor-personas")) < personas:
            clic("#mas")
        while int(texto("#valor-personas")) > personas:
            clic("#menos")
    escribir("#contacto", contacto)


@caso("F09", "Funcional", "Creación de una reserva y verificación en la base de datos")
def f09():
    fecha = proximo_dia(4)
    abrir_reserva_mesa(3, fecha)
    hora = js("return document.querySelector('[data-hora]').dataset.hora")
    completar_reserva("Laura Gómez", personas=3)
    clic("#confirmar")
    visible("#confirmacion h1", 15)
    codigo = re.search(r"Código de reserva: ([0-9A-F]{8})", texto("#confirmacion")).group(1)
    estado, filas = api("POST", "/rest/v1/rpc/consultar_reserva", {"p_codigo": codigo, "p_nombre": "Laura Gómez"})
    comprobar(estado == 200 and filas and filas[0]["estado"] == "confirmada", f"La reserva no está en la base: {estado} {filas}")
    comprobar(filas[0]["fecha"] == fecha and filas[0]["hora_inicio"].startswith(hora) and filas[0]["num_personas"] == 3,
              f"Datos guardados distintos: {filas[0]}")
    CONTEXTO["reserva"] = {"codigo": codigo, "nombre": "Laura Gómez", "fecha": fecha, "hora": hora}
    return f"Reserva {codigo} guardada: Mesa 3, {fecha} {hora}, 3 personas, estado confirmada."


@caso("F10", "Funcional", "Validación de formularios (nombre vacío y capacidad excedida)")
def f10():
    abrir_reserva_mesa(1, proximo_dia(5))
    clic("[data-hora]")
    clic("#continuar-2")
    clic("#confirmar")
    comprobar("Escribe tu nombre completo" in texto("#form-datos"), "Sin error de nombre vacío")
    comprobar(driver.find_element(By.ID, "nombre").get_attribute("aria-invalid") == "true", "El campo no quedó marcado")
    for _ in range(2):
        clic("#mas")
    comprobar(texto("#valor-personas") == "4", "No subió a 4 personas")
    comprobar(not driver.find_element(By.ID, "confirmar").is_enabled(), "Confirmar debería bloquearse (Mesa 1 = 2 personas)")
    comprobar("recibe hasta 2 personas" in texto("#form-datos"), "Falta el mensaje de capacidad")
    estado, _ = api("POST", "/rest/v1/rpc/crear_reserva", {"p_mesa_id": 1, "p_fecha": proximo_dia(5), "p_hora_inicio": "20:00",
                                                          "p_cliente_nombre": "Grupo Grande", "p_num_personas": 4})
    comprobar(estado == 400, f"El servidor debería rechazar 4 personas en la Mesa 1 (respondió {estado})")
    return "Nombre vacío marcado; 4 personas en Mesa 1 bloqueado en la interfaz y rechazado por el servidor (400)."


@caso("F11", "Funcional", "Prevención de reservas duplicadas (dos clientes a la vez)",
      errores_esperados=[r"rpc/crear_reserva.*400|400.*rpc/crear_reserva|crear_reserva - Failed to load resource"])
def f11():
    fecha = proximo_dia(6)
    abrir_reserva_mesa(7, fecha)
    hora = js("return document.querySelector('[data-hora]').dataset.hora")
    completar_reserva("Andrés Pinto", personas=2)
    # Otro cliente confirma la misma mesa y hora justo antes.
    estado, _ = api("POST", "/rest/v1/rpc/crear_reserva", {"p_mesa_id": 7, "p_fecha": fecha, "p_hora_inicio": hora,
                                                          "p_cliente_nombre": "Otro Cliente", "p_num_personas": 2})
    comprobar(estado == 200, f"La primera reserva debería entrar ({estado})")
    clic("#confirmar")
    esperar_alerta("Alguien acaba de reservar", 15)
    comprobar(not driver.find_element(By.ID, "confirmacion").is_displayed(), "No debe mostrarse confirmación")
    tachada = js("return [...document.querySelectorAll('.hora:disabled')].some(b=>b.getAttribute('aria-label').includes('ocupado'))")
    comprobar(tachada, "La hora tomada debería verse ocupada")
    estado, ocupacion = api("POST", "/rest/v1/rpc/ocupacion", {"p_desde": fecha, "p_hasta": fecha})
    propias = [o for o in ocupacion if o["mesa_id"] == 7 and o["hora_inicio"].startswith(hora)]
    comprobar(len(propias) == 1, f"Debe existir UNA sola reserva en esa franja: {propias}")
    return f"Mesa 7 {fecha} {hora}: el segundo cliente recibió «Alguien acaba de reservar»; 1 sola reserva en la base."


@caso("F12", "Funcional", "Mi reserva: consulta y cancelación por el cliente")
def f12():
    r = CONTEXTO.get("reserva")
    comprobar(r, "Requiere la reserva de F09")
    ir(f"mi-reserva.html?codigo={r['codigo'].lower()}")
    visible("#nombre")
    comprobar("codigo=" not in driver.current_url, "El código debe quitarse de la URL")
    escribir("#nombre", "Nombre Equivocado")
    clic("#btn-consultar")
    esperar_alerta("No encontramos esa reserva")
    escribir("#nombre", r["nombre"])
    clic("#btn-consultar")
    visible("#resultado .resumen")
    comprobar("Confirmada" in texto("#resultado"), texto("#resultado"))
    clic("#cancelar")
    clic("dialog .btn--destructivo")
    esperar_alerta("Reserva cancelada")
    comprobar("Cancelada" in texto("#resultado"), "El estado no cambió a Cancelada")
    estado, ocupacion = api("POST", "/rest/v1/rpc/ocupacion", {"p_desde": r["fecha"], "p_hasta": r["fecha"]})
    libre = not [o for o in ocupacion if o["mesa_id"] == 3 and o["hora_inicio"].startswith(r["hora"])]
    comprobar(libre, "La franja cancelada debería quedar libre")
    return f"Con nombre equivocado no se muestra nada; con el correcto se ve y se cancela; la franja {r['hora']} quedó libre."


# =====================================================================
# PRUEBAS FUNCIONALES — PANEL
# =====================================================================
@caso("A01", "Funcional", "Inicio de sesión administrativo (incorrecto y correcto)",
      errores_esperados=[r"auth/v1/token.*400|400.*auth/v1/token|token\?grant_type=password - Failed to load resource"])
def a01():
    ir("admin")
    visible("#clave")
    escribir("#clave", "incorrecta")
    clic("#btn-ingresar")
    esperar_alerta("Contraseña incorrecta")
    comprobar(en_acceso(), "Con contraseña incorrecta no debe abrirse el panel")
    login()
    comprobar(sesion_guardada() is not None, "No se guardó la sesión")
    comprobar(js("return localStorage.length") == 0, "La sesión no debe quedar en localStorage")
    return "Contraseña incorrecta rechazada; correcta abre el panel; sesión solo en sessionStorage."


@caso("A02", "Funcional", "Gestión de mesas: crear, desactivar y eliminar",
      errores_esperados=[r"rest/v1/mesas.*409|409.*rest/v1/mesas|mesas\?id=eq\.6 - Failed to load resource"])
def a02():
    login(ruta="admin#mesas")
    visible("#agregar-mesa")
    clic("#agregar-mesa")
    escribir(".cajon #m-nombre", "Mesa Selenium")
    js("document.querySelector('.cajon #m-zona').value='terraza'")
    escribir(".cajon #m-capacidad", "5")
    clic(".cajon [data-guardar]")
    notificacion("Mesa Selenium registrada")
    _, publicas = api("GET", "/rest/v1/mesas?select=id,nombre")
    nueva = next((m for m in publicas if m["nombre"] == "Mesa Selenium"), None)
    comprobar(nueva, "La mesa nueva no es visible para el público")
    js("document.querySelector('#activa-' + arguments[0]).click()", nueva["id"])
    notificacion("desactivada")
    _, publicas = api("GET", "/rest/v1/mesas?select=nombre")
    comprobar("Mesa Selenium" not in [m["nombre"] for m in publicas], "Una mesa inactiva no debe verse en público")
    # Una mesa con reservas registradas no se puede eliminar (integridad del historial).
    estado, _ = api("POST", "/rest/v1/rpc/crear_reserva", {"p_mesa_id": 2, "p_fecha": proximo_dia(4), "p_hora_inicio": "18:00",
                                                          "p_cliente_nombre": "Historial Mesa Dos", "p_num_personas": 2})
    comprobar(estado == 200, f"No se pudo crear la reserva de apoyo ({estado})")
    js("document.querySelector('[data-eliminar=\"2\"]').click()")
    clic("dialog .btn--destructivo")
    notificacion("tiene reservas registradas")
    _, mesa2 = api("GET", "/rest/v1/mesas?select=id&id=eq.2")
    comprobar(mesa2, "La Mesa 2 con historial no debió eliminarse")
    js("document.querySelector('[data-eliminar=\"' + arguments[0] + '\"]').click()", nueva["id"])
    clic("dialog .btn--destructivo")
    notificacion("Mesa Selenium eliminada")
    return "Mesa creada (visible al público), desactivada (oculta), Mesa 2 con historial protegida, mesa nueva eliminada."


@caso("A03", "Funcional", "Gestión de horarios: editar y validar una jornada")
def a03():
    login(ruta="admin#horarios")
    visible("#semana .semana__fila")
    _, antes = api("GET", "/rest/v1/horarios?select=id,dia_semana,jornada,hora_fin&dia_semana=eq.2")
    martes = antes[0]
    js("document.querySelector('[data-editar=\"' + arguments[0] + '\"]').click()", martes["id"])
    fila = visible(f"[data-fila='{martes['id']}']")
    js("arguments[0].querySelector('[data-campo=hora_fin]').value='22:00'", fila)
    js("arguments[0].querySelector('[data-guardar]').click()", fila)
    notificacion("Horario guardado")
    _, despues = api("GET", "/rest/v1/horarios?select=hora_fin&dia_semana=eq.2")
    comprobar(despues[0]["hora_fin"] == "22:00:00", f"No se guardó: {despues}")
    estado, err = api("POST", "/rest/v1/rpc/crear_reserva", {"p_mesa_id": 2, "p_fecha": proximo_dia(2), "p_hora_inicio": "21:30",
                                                            "p_cliente_nombre": "Fuera Turno", "p_num_personas": 2})
    comprobar(estado == 400 and "FUERA_DE_HORARIO" in json.dumps(err), f"21:30 ya no cabe y debe rechazarse: {estado} {err}")
    return "Martes noche cambiado a 5:00–10:00 p. m.; el servidor rechaza una reserva a las 9:30 p. m. (FUERA_DE_HORARIO)."


@caso("A04", "Funcional", "Gestión de reservas: filtrar y cambiar estado")
def a04():
    login(ruta="admin#reservas")
    visible("#f-fecha")
    js("document.querySelector('#f-fecha').value=''")
    js("document.querySelector('#f-estado').value='confirmada'")
    clic("#filtros button[type=submit]")
    esperar(lambda d: d.find_elements(By.CSS_SELECTOR, "[data-reserva]"), 10, "No hay reservas confirmadas en la tabla")
    sel = driver.find_element(By.CSS_SELECTOR, "[data-reserva]")
    id_reserva = sel.get_attribute("data-reserva")
    js("arguments[0].value='completada'; arguments[0].dispatchEvent(new Event('change', {bubbles:true}))", sel)
    notificacion("Reserva marcada como completada")
    token = sesion_guardada()["access_token"]
    _, filas = api("GET", f"/rest/v1/reservas?select=estado&id=eq.{id_reserva}", token=token)
    comprobar(filas and filas[0]["estado"] == "completada", f"Estado en la base: {filas}")
    return "Filtro por estado aplicado y una reserva pasó a «completada» en la base."


@caso("A05", "Funcional", "Gestión de categorías: crear, editar y proteger las que tienen platos")
def a05():
    login(ruta="admin#categorias")
    visible("#agregar-categoria")
    clic("#agregar-categoria")
    escribir(".cajon #c-nombre", "Temporada Selenium")
    escribir(".cajon #c-id", "Temporada Selenium")
    clic(".cajon [data-guardar]")
    comprobar("minúsculas" in texto(".cajon"), "Debe validar el identificador")
    escribir(".cajon #c-id", "temporada_selenium")
    clic(".cajon [data-guardar]")
    notificacion("creada")
    js("document.querySelector('[data-editar=\"temporada_selenium\"]').click()")
    escribir(".cajon #c-nombre", "Temporada Selenium 2")
    clic(".cajon [data-guardar]")
    notificacion("actualizada")
    _, cats = api("GET", "/rest/v1/categorias?select=nombre&id=eq.temporada_selenium")
    comprobar(cats and cats[0]["nombre"] == "Temporada Selenium 2", f"No se actualizó: {cats}")
    js("document.querySelector('[data-eliminar=\"pizzas\"]').click()")
    comprobar("No se puede eliminar" in visible("dialog").text, "Debe impedir borrar Pizzas")
    clic("dialog .btn--secundario")
    js("document.querySelector('[data-eliminar=\"temporada_selenium\"]').click()")
    clic("dialog .btn--destructivo")
    notificacion("eliminada")
    _, cats = api("GET", "/rest/v1/categorias?select=id&id=eq.temporada_selenium")
    comprobar(cats == [], "La categoría debería haberse eliminado")
    return "Categoría creada (con validación del identificador), editada y eliminada; «Pizzas» protegida."


@caso("A06", "Funcional", "Gestión de platos: crear sin precio, ocultar y eliminar")
def a06():
    login(ruta="admin#carta")
    visible("#agregar-plato")
    clic("#agregar-plato")
    escribir(".cajon #p-nombre", "Plato Selenium")
    js("document.querySelector('.cajon #p-categoria').value='congelados'")
    clic(".cajon [data-guardar]")
    notificacion("agregado a la carta")
    _, pub = api("GET", "/rest/v1/platos?select=id,precio,origen&nombre=eq.Plato%20Selenium")
    comprobar(pub and pub[0]["precio"] is None and pub[0]["origen"] == "manual", f"Plato en la base: {pub}")
    escribir("#f-buscar", "Plato Selenium")
    js("document.querySelector('#visible-' + arguments[0]).click()", pub[0]["id"])
    notificacion("quedó oculto")
    _, pub2 = api("GET", "/rest/v1/platos?select=id&nombre=eq.Plato%20Selenium")
    comprobar(pub2 == [], "Un plato oculto no debe verse en público")
    js("document.querySelector('[data-eliminar=\"' + arguments[0] + '\"]').click()", pub[0]["id"])
    clic("dialog .btn--destructivo")
    notificacion("eliminado de la carta")
    js("const b=document.querySelector('#f-buscar'); b.value=''; b.dispatchEvent(new Event('input'));"
       "const o=document.querySelector('#f-origen'); o.value='prueba'; o.dispatchEvent(new Event('change'))")
    prueba = [e.text for e in driver.find_elements(By.CSS_SELECTOR, ".tabla tbody tr .celda-plato .fuerte")]
    comprobar(len([p for p in prueba if p in PLATOS_PRUEBA]) == 7, f"Platos de prueba en el panel: {prueba}")
    return "Plato sin precio guardado como «por confirmar», ocultado y eliminado; los 7 platos de prueba se identifican."


@caso("A07", "Funcional", "Cierre de sesión manual")
def a07():
    login(ruta="admin#reservas")
    clic("#cerrar-sesion")
    esperar(lambda d: en_acceso(), 10, "No volvió a la pantalla de acceso")
    esperar_alerta("Cerraste sesión")
    comprobar(sesion_guardada() is None, "La sesión sigue guardada")
    comprobar("#" not in driver.current_url, f"La URL conserva la sección: {driver.current_url}")
    ir("admin#reservas")
    time.sleep(1.5)
    comprobar(en_acceso(), "Tras cerrar sesión, /admin#reservas no debe abrir el panel")
    return "Sesión cerrada, almacenamiento limpio y /admin#reservas pide contraseña."


# =====================================================================
# PRUEBAS DE SEGURIDAD
# =====================================================================
@caso("S01", "Seguridad", "Acceso directo al panel sin autenticación",
      errores_esperados=[r"rest/v1/reservas.*(401|403)|(401|403).*rest/v1/reservas"])
def s01():
    ir("admin#reservas")
    visible("#clave")
    time.sleep(1)
    comprobar(en_acceso(), "El panel no debe mostrarse sin sesión")
    comprobar(js("return document.querySelector('#principal').innerHTML.trim()") == "", "El contenido del panel no debe cargarse")
    estado, datos = api("GET", "/rest/v1/reservas?select=cliente_nombre")
    comprobar(estado in (401, 403), f"Un anónimo no debe leer reservas: {estado} {datos}")
    return f"Se muestra el acceso; la API rechaza leer reservas como anónimo ({estado})."


@caso("S02", "Seguridad", "Usuario autenticado SIN permisos de administración")
def s02():
    generar_config("otro@konys.test")
    try:
        login(esperar_panel=False)
        esperar_alerta("no tiene permisos", 15)
        comprobar(en_acceso(), "El panel no debe abrirse")
        comprobar(sesion_guardada() is None, "La sesión del usuario sin permisos debe cerrarse")
    finally:
        generar_config()
    token = token_de("otro@konys.test")
    e1, d1 = api("PATCH", "/rest/v1/platos?nombre=eq.HAWAIANA", {"precio": 1}, token=token, cabeceras={"Prefer": "return=representation"})
    e2, d2 = api("GET", "/rest/v1/reservas?select=id", token=token)
    e3, _ = api("POST", "/rest/v1/categorias", {"id": "hack", "nombre": "Hack"}, token=token)
    _, haw = api("GET", "/rest/v1/platos?select=precio&nombre=eq.HAWAIANA")
    comprobar(d1 == [] and haw[0]["precio"] == 27900, f"Cambió un precio sin permiso: {e1} {d1} {haw}")
    comprobar(e2 == 200 and d2 == [], f"Leyó reservas sin permiso: {d2}")
    comprobar(e3 in (401, 403), f"Creó una categoría sin permiso: {e3}")
    return f"Acceso denegado en la interfaz; por API: actualizar precio → 0 filas, leer reservas → 0 filas, crear categoría → {e3}."


@caso("S03", "Seguridad", "Token manipulado",
      errores_esperados=[r"(401|403)"])
def s03():
    login()
    sesion = sesion_guardada()
    cab, carga, firma = sesion["access_token"].split(".")
    import base64
    datos = json.loads(base64.urlsafe_b64decode(carga + "=="))
    datos["sub"] = "22222222-2222-2222-2222-222222222222"
    falso = f"{cab}.{base64.urlsafe_b64encode(json.dumps(datos).encode()).decode().rstrip('=')}.{firma}"
    estado, _ = api("GET", "/rest/v1/reservas?select=id", token=falso)
    comprobar(estado == 401, f"La API debe rechazar un token manipulado (respondió {estado})")
    sesion["access_token"] = falso
    js(f"sessionStorage.setItem('{CLAVE_SESION}', arguments[0])", json.dumps(sesion))
    ir("admin#reservas")
    esperar(lambda d: en_acceso(), 15, "Con un token manipulado no debe abrirse el panel")
    return "La API responde 401 al token alterado y el panel vuelve a pedir contraseña."


@caso("S04", "Seguridad", "Token vencido", errores_esperados=[r"(400|401|403)"])
def s04():
    ir("admin")
    _, datos = api("GET", "/__pruebas/token-vencido")
    vencido = datos["access_token"]
    estado, _ = api("GET", "/rest/v1/reservas?select=id", token=vencido)
    comprobar(estado == 401, f"La API debe rechazar un token vencido (respondió {estado})")
    sesion = {"access_token": vencido, "refresh_token": "no-existe", "token_type": "bearer", "expires_in": 3600,
              "expires_at": int(time.time()) - 60, "user": {"id": "11111111-1111-1111-1111-111111111111", "email": "admin@konys.test"}}
    js(f"sessionStorage.setItem('{CLAVE_SESION}', arguments[0])", json.dumps(sesion))
    ir("admin#reservas")
    esperar(lambda d: en_acceso(), 15, "Con un token vencido no debe abrirse el panel")
    return "Token vencido: 401 en la API y el panel pide iniciar sesión."


@caso("S05", "Seguridad", "Reutilizar una sesión ya cerrada", errores_esperados=[r"(400|401|403)"])
def s05():
    login()
    copia = js(f"return sessionStorage.getItem('{CLAVE_SESION}')")
    clic("#cerrar-sesion")
    esperar(lambda d: en_acceso(), 10, "No cerró sesión")
    js(f"sessionStorage.setItem('{CLAVE_SESION}', arguments[0])", copia)
    ir("admin#reservas")
    esperar(lambda d: en_acceso(), 15, "Una sesión cerrada no debe reabrir el panel")
    estado, _ = api("GET", "/auth/v1/user", token=json.loads(copia)["access_token"])
    comprobar(estado == 403, f"Supabase Auth debe rechazar la sesión cerrada (respondió {estado})")
    return f"Restaurar la sesión copiada no reabre el panel; Auth responde {estado} (sesión revocada)."


@caso("S06", "Seguridad", "Tokens en la URL: se ignoran y se borran")
def s06():
    ir("admin?code=abc123#access_token=falso&refresh_token=falso&type=recovery")
    visible("#clave")
    url = driver.current_url
    comprobar(not re.search(r"access_token|refresh_token|code=", url), f"La URL conserva tokens: {url}")
    comprobar(en_acceso() and sesion_guardada() is None, "Un token en la URL no debe iniciar sesión")
    return f"URL limpiada a «{url.replace(URL_WEB, '')}» y no se inició sesión."


@caso("S07", "Seguridad", "Operaciones administrativas sin autorización (solicitudes reales)")
def s07():
    pruebas = {
        "leer reservas": api("GET", "/rest/v1/reservas?select=*")[0],
        "insertar reserva directa": api("POST", "/rest/v1/reservas", {"mesa_id": 1, "cliente_nombre": "Intruso", "num_personas": 2,
                                                                    "fecha": proximo_dia(3), "hora_inicio": "20:00", "hora_fin": "21:00"})[0],
        "cambiar precio": api("PATCH", "/rest/v1/platos?id=eq.1", {"precio": 1})[0],
        "desactivar mesa": api("PATCH", "/rest/v1/mesas?id=eq.1", {"activa": False})[0],
        "borrar horario": api("DELETE", "/rest/v1/horarios?id=eq.1")[0],
        "crear categoría": api("POST", "/rest/v1/categorias", {"id": "x", "nombre": "X"})[0],
        "leer administradores": api("GET", "/rest/v1/administradores?select=*")[0],
    }
    permitidas = {k: v for k, v in pruebas.items() if v not in (401, 403)}
    comprobar(not permitidas, f"Operaciones permitidas a un anónimo: {permitidas}")
    _, ocultos = api("GET", "/rest/v1/platos?select=nombre&origen=eq.prueba")
    comprobar(ocultos == [], f"Un anónimo ve platos de prueba: {ocultos}")
    return "Todas rechazadas: " + ", ".join(f"{k} → {v}" for k, v in pruebas.items()) + "."


@caso("S08", "Seguridad", "Protección frente a intentos repetidos de acceso",
      errores_esperados=[r"auth/v1/token.*400|400.*auth/v1/token|token\?grant_type=password - Failed to load resource"])
def s08():
    ir("admin")
    js("sessionStorage.clear()")
    ir("admin")
    for _ in range(5):
        escribir("#clave", "mala-clave")
        clic("#btn-ingresar")
        esperar(lambda d: d.find_element(By.ID, "btn-ingresar").get_attribute("aria-busy") is None, 10, "El intento no terminó")
    esperar_alerta("Demasiados intentos fallidos")
    comprobar(not driver.find_element(By.ID, "btn-ingresar").is_enabled(), "El botón debe quedar bloqueado")
    js("sessionStorage.clear()")
    return "Tras 5 contraseñas incorrectas el formulario se bloquea 60 s (Supabase Auth también limita en el servidor)."


# =====================================================================
# PRUEBAS DE INACTIVIDAD (tiempo corto solo para pruebas: 8 s)
# =====================================================================
@caso("I01", "Inactividad", "La actividad reinicia el contador y la inactividad cierra la sesión")
def i01():
    login(ruta="admin?inactividad=8#mesas")
    for _ in range(3):  # 15 s con actividad cada 5 s: la sesión debe seguir abierta
        time.sleep(5)
        ActionChains(driver).move_by_offset(1, 1).move_by_offset(-1, -1).perform()
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.SHIFT)
    comprobar(not en_acceso(), "Con actividad la sesión no debe cerrarse")
    inicio = time.time()
    esperar(lambda d: en_acceso(), 15, "La sesión no se cerró tras 8 s sin actividad")
    duracion = time.time() - inicio
    esperar_alerta("Tu sesión se cerró por inactividad")
    comprobar("8 segundos" in texto("#acceso-alerta"), texto("#acceso-alerta"))
    comprobar(sesion_guardada() is None, "La sesión sigue en el navegador")
    comprobar(js("return document.querySelector('#principal').innerHTML") == "", "El panel conserva contenido")
    ir("admin#reservas")
    time.sleep(1.5)
    comprobar(en_acceso(), "Tras expirar no debe poder volver al panel")
    return f"Con actividad siguió abierta 15 s; sin actividad se cerró a los {duracion:.1f} s con el mensaje de inactividad."


@caso("I02", "Inactividad", "Tras expirar no se pueden hacer operaciones y al volver a entrar el control se reinicia")
def i02():
    login(ruta="admin?inactividad=8#carta")
    visible("#agregar-plato")
    token = sesion_guardada()["access_token"]
    esperar(lambda d: en_acceso(), 15, "No expiró")
    comprobar(not driver.find_element(By.ID, "panel-admin").is_displayed(), "El panel sigue visible")
    estado, _ = api("GET", "/auth/v1/user", token=token)
    comprobar(estado == 403, f"La sesión expirada debe quedar revocada en Auth (respondió {estado})")
    login(ruta="admin?inactividad=8#carta")
    time.sleep(5)
    comprobar(not en_acceso(), "Tras volver a entrar, el contador debe empezar de cero")
    esperar(lambda d: en_acceso(), 10, "El nuevo contador no expiró")
    return "Tras expirar el panel se oculta y la sesión queda revocada (403); al reingresar el contador empieza de cero."


@caso("I03", "Inactividad", "El valor de producción es 5 minutos y el corto solo funciona en localhost")
def i03():
    ir("admin")
    visible("#clave")
    valores = driver.execute_async_script("""
      const fin = arguments[arguments.length - 1];
      import('/js/admin/inactividad.js').then((m) => fin({
        prod: m.TIEMPO_INACTIVIDAD_MS,
        sinParametro: m.tiempoInactividad(new URL('http://localhost/admin')),
        produccionConParametro: m.tiempoInactividad(new URL('https://konys.vercel.app/admin?inactividad=8')),
        local: m.tiempoInactividad(new URL('http://localhost/admin?inactividad=8')),
      }));""")
    comprobar(valores == {"prod": 300000, "sinParametro": 300000, "produccionConParametro": 300000, "local": 8000}, str(valores))
    return "Producción: 300 000 ms (5 min); ?inactividad=8 solo se acepta en localhost."


# =====================================================================
# RECORRIDO DE CONSOLA (todas las pantallas)
# =====================================================================
@caso("C01", "Consola", "Recorrido completo sin errores de consola ni de red")
def c01():
    pantallas = []
    for ruta, selector in [("", ".tarjeta-mesa"), ("reservar.html", ".opcion-mesa"), ("reservar.html?mesa=4", "[data-hora]"),
                           ("mi-reserva.html", "#form-consulta"), ("admin", "#clave")]:
        ir(ruta)
        visible(selector, 20)
        pantallas.append(ruta or "index")
    login()
    for seccion, selector in [("resumen", ".metricas"), ("mesas", "#agregar-mesa"), ("horarios", "#semana .semana__fila"),
                              ("reservas", "#f-fecha"), ("categorias", "#agregar-categoria"), ("carta", "#agregar-plato")]:
        driver.find_element(By.CSS_SELECTOR, f"#nav-admin a[data-seccion='{seccion}']").click()
        visible(selector, 15)
        pantallas.append(f"admin#{seccion}")
    driver.set_window_size(390, 844)
    ir("")
    visible(".tarjeta-mesa", 20)
    ancho = js("return [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    driver.set_window_size(1366, 900)
    comprobar(ancho[0] <= ancho[1], f"Desbordamiento horizontal en móvil: {ancho}")
    pantallas.append("index (móvil 390 px)")
    return "Sin errores en: " + ", ".join(pantallas) + "."


CONTEXTO = {}


# =====================================================================
# Ejecución e informe
# =====================================================================
def ejecutar(filtro):
    global driver
    RESULTADOS.mkdir(exist_ok=True)
    marca = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    carpeta = RESULTADOS / f"capturas_{marca}"
    carpeta.mkdir()
    visible_flag = "--visible" in sys.argv
    casos = [c for c in CASOS if not filtro or c["codigo"] in filtro]
    resultados = []
    with Entorno(visible=visible_flag) as entorno:
        driver = entorno.driver
        version = driver.capabilities.get("browserVersion")
        print(f"\n  Chrome {version} · {len(casos)} casos\n")
        for c in casos:
            leer_registros()  # descarta registros previos
            inicio = time.perf_counter()
            try:
                obtenido = c["funcion"]() or "Correcto."
                estado = "APROBADA"
            except AssertionError as e:
                estado, obtenido = "FALLIDA", str(e)
            except Exception as e:  # noqa: BLE001
                estado, obtenido = "FALLIDA", f"{type(e).__name__}: {str(e).splitlines()[0] if str(e) else ''}"
                traceback.print_exc()
            duracion = time.perf_counter() - inicio
            time.sleep(0.3)
            consola, red = leer_registros()
            err_consola, avisos, err_red, previstos = clasificar(consola, red, c["esperados"])
            if estado == "APROBADA" and (err_consola or err_red):
                estado = "FALLIDA"
                obtenido += " | Errores no previstos en consola/red."
            captura = carpeta / f"{c['codigo']}.png"
            try:
                driver.save_screenshot(str(captura))
            except Exception:  # noqa: BLE001
                captura = None
            cerrar_sesion_si_hay()
            resultados.append({**{k: c[k] for k in ("codigo", "grupo", "nombre")}, "estado": estado, "obtenido": obtenido,
                               "duracion": round(duracion, 1), "errores_consola": err_consola, "errores_red": err_red,
                               "avisos_consola": avisos, "previstos": previstos,
                               "captura": str(captura.relative_to(RAIZ)).replace("\\", "/") if captura else None})
            print(f"  [{c['codigo']}] {c['nombre'][:62]:.<64} {estado} ({duracion:.1f} s)")
            for e in err_consola + err_red:
                print(f"         ↳ {e}")
    (RESULTADOS / "ultimo.json").write_text(json.dumps({"fecha": marca, "chrome": version, "resultados": resultados},
                                                       ensure_ascii=False, indent=2), encoding="utf-8")
    escribir_informe(resultados, marca, version)
    aprobadas = sum(r["estado"] == "APROBADA" for r in resultados)
    print(f"\n  {aprobadas}/{len(resultados)} aprobadas · informe: docs/INFORME_PRUEBAS_SELENIUM.md\n")
    return 0 if aprobadas == len(resultados) else 1


def escribir_informe(resultados, marca, version):
    filas = []
    for r in resultados:
        notas = []
        if r["errores_consola"] or r["errores_red"]:
            notas.append("Errores: " + "; ".join(e.get("mensaje") or f"{e['estado']} {e['url']}" for e in r["errores_consola"] + r["errores_red"]))
        if r["previstos"]:
            notas.append(f"{len(r['previstos'])} respuesta(s) de error provocadas a propósito")
        obtenido = r["obtenido"].replace("|", "/").replace("\n", " ")
        filas.append(f"| {r['codigo']} | {r['grupo']} | {r['nombre']} | **{r['estado']}** | {obtenido} | "
                     f"{'; '.join(notas) or 'Sin errores'} | {r['duracion']} s |")
    aprobadas = sum(r["estado"] == "APROBADA" for r in resultados)
    bloque = "\n".join([
        f"Ejecución: {marca.replace('_', ' ')} · Chrome {version} · Selenium (Python) · "
        f"**{aprobadas}/{len(resultados)} aprobadas**.",
        "",
        "| Código | Grupo | Caso | Estado | Resultado obtenido | Consola / red | Duración |",
        "|---|---|---|---|---|---|---|",
        *filas,
    ])
    contenido = INFORME.read_text(encoding="utf-8") if INFORME.exists() else "<!-- RESULTADOS -->\n<!-- /RESULTADOS -->\n"
    contenido = re.sub(r"<!-- RESULTADOS -->.*<!-- /RESULTADOS -->", f"<!-- RESULTADOS -->\n{bloque}\n<!-- /RESULTADOS -->",
                       contenido, flags=re.S)
    INFORME.write_text(contenido, encoding="utf-8")


if __name__ == "__main__":
    filtro = [a for a in sys.argv[1:] if not a.startswith("--")]
    sys.exit(ejecutar(filtro))
