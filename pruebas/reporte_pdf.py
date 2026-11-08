"""
reporte_pdf.py
==============
Genera el reporte PDF de las pruebas automáticas de Konys Pizza (Selenium) con ReportLab.
Basado en el ejemplo del curso (github.com/cacarrascal/EjemploSelenium).

Contenido del reporte:
  1. Portada con el resultado general y los totales.
  2. Datos del entorno (navegador, versiones, duración).
  3. Tabla resumen con todas las pruebas.
  4. Detalle de cada prueba: qué se esperaba, qué se obtuvo y su captura.
"""

from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)


# ---------------------------------------------------------
# Colores (sistema visual de Konys Pizza)
# ---------------------------------------------------------
CAFE_OSCURO = colors.HexColor("#173F35")   # verde bosque (marca)
CAFE        = colors.HexColor("#1F5446")
DORADO      = colors.HexColor("#E9D56B")   # amarillo limón
BEIGE       = colors.HexColor("#F5E5C8")
CREMA       = colors.HexColor("#FFF5E6")   # crema vainilla
BEIGE_BORDE = colors.HexColor("#E7DCC8")
TEXTO       = colors.HexColor("#252824")   # carbón
GRIS        = colors.HexColor("#6E6A5E")
VERDE       = colors.HexColor("#14583A")
ROJO        = colors.HexColor("#A3302A")
GRIS_OMITIDA = colors.HexColor("#8a8a8a")

COLOR_ESTADO = {"APROBADA": VERDE, "FALLIDA": ROJO, "OMITIDA": GRIS_OMITIDA}

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

ANCHO_UTIL = letter[0] - 4 * cm  # ancho de la hoja menos los márgenes


# ---------------------------------------------------------
# Estilos de texto
# ---------------------------------------------------------
def _estilo(nombre, **opciones):
    base = {"fontName": "Helvetica", "fontSize": 9.5, "leading": 13, "textColor": TEXTO}
    base.update(opciones)
    return ParagraphStyle(nombre, **base)


TITULO     = _estilo("titulo", fontName="Helvetica-Bold", fontSize=24, leading=29, textColor=CAFE_OSCURO)
SUBTITULO  = _estilo("subtitulo", fontSize=12, leading=16, textColor=CAFE)
FECHA      = _estilo("fecha", fontSize=9.5, textColor=GRIS)
H2         = _estilo("h2", fontName="Helvetica-Bold", fontSize=14, leading=18,
                     textColor=CAFE_OSCURO, spaceBefore=16, spaceAfter=8)
H3         = _estilo("h3", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=CAFE_OSCURO)
NORMAL     = _estilo("normal")
CELDA      = _estilo("celda", fontSize=9, leading=11.5)
CELDA_NEG  = _estilo("celda_neg", fontName="Helvetica-Bold", fontSize=9, leading=11.5, textColor=CAFE)
ENCABEZADO = _estilo("encabezado", fontName="Helvetica-Bold", fontSize=9, leading=11.5, textColor=BEIGE)
NUMERO_KPI = _estilo("kpi", fontName="Helvetica-Bold", fontSize=26, leading=30, alignment=TA_CENTER)
TEXTO_KPI  = _estilo("kpi_texto", fontSize=9, leading=11, alignment=TA_CENTER, textColor=GRIS)
VEREDICTO  = _estilo("veredicto", fontName="Helvetica-Bold", fontSize=13, leading=17,
                     alignment=TA_CENTER, textColor=colors.white)


# ---------------------------------------------------------
# Funciones de apoyo
# ---------------------------------------------------------
def _p(texto, estilo=NORMAL):
    """Párrafo con el texto 'escapado' (para que <, > y & se vean como texto)."""
    return Paragraph(escape(str(texto)), estilo)


def _fecha_larga(momento):
    return (f"{DIAS[momento.weekday()]} {momento.day} de {MESES[momento.month - 1]} "
            f"de {momento.year}, {momento:%I:%M %p}".replace("AM", "a. m.").replace("PM", "p. m."))


def _duracion(segundos):
    minutos, segundos = divmod(int(round(segundos)), 60)
    return f"{minutos} min {segundos} s" if minutos else f"{segundos} s"


def _estado(estado, tamano=9):
    color = COLOR_ESTADO[estado].hexval().replace("0x", "#")
    return Paragraph(f'<font color="{color}"><b>{estado}</b></font>',
                     _estilo("estado", fontSize=tamano, leading=tamano + 3))


def _imagen(ruta, ancho_max, alto_max):
    """Imagen reducida para que quepa en el espacio indicado sin deformarse."""
    ancho, alto = ImageReader(ruta).getSize()
    escala = min(ancho_max / ancho, alto_max / alto)
    imagen = Image(ruta, width=ancho * escala, height=alto * escala)
    imagen.hAlign = "CENTER"
    return imagen


def _decorar_pagina(canvas, doc):
    """Franja superior y pie de página que se dibujan en todas las hojas."""
    ancho, alto = letter
    canvas.saveState()
    canvas.setFillColor(CAFE_OSCURO)
    canvas.rect(0, alto - 1.2 * cm, ancho, 1.2 * cm, fill=1, stroke=0)
    canvas.setFillColor(DORADO)
    canvas.rect(0, alto - 1.35 * cm, ancho, 0.15 * cm, fill=1, stroke=0)

    canvas.setFillColor(BEIGE)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(2 * cm, alto - 0.75 * cm, "KONYS PIZZA · SISTEMA DE RESERVAS")
    canvas.setFont("Helvetica", 9)
    canvas.drawRightString(ancho - 2 * cm, alto - 0.75 * cm, "Reporte de pruebas automatizadas")

    canvas.setStrokeColor(BEIGE_BORDE)
    canvas.line(2 * cm, 1.6 * cm, ancho - 2 * cm, 1.6 * cm)
    canvas.setFillColor(GRIS)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(2 * cm, 1.1 * cm, doc.texto_pie)
    canvas.drawRightString(ancho - 2 * cm, 1.1 * cm, f"Página {doc.page}")
    canvas.restoreState()


# ---------------------------------------------------------
# Secciones del reporte
# ---------------------------------------------------------
def _portada(resultados, info):
    total = len(resultados)
    aprobadas = sum(r["estado"] == "APROBADA" for r in resultados)
    fallidas = sum(r["estado"] == "FALLIDA" for r in resultados)
    omitidas = sum(r["estado"] == "OMITIDA" for r in resultados)
    ejecutadas = aprobadas + fallidas
    porcentaje = (aprobadas / ejecutadas * 100) if ejecutadas else 0
    duracion = (info["fin"] - info["inicio"]).total_seconds()

    elementos = [
        _p("Reporte de pruebas automatizadas", TITULO),
        Spacer(1, 4),
        _p("Konys Pizza · Sistema de reservas (sitio público y panel de administración)", SUBTITULO),
        Spacer(1, 4),
        _p(f"Ejecutado el {_fecha_larga(info['inicio'])} · Duración total: {_duracion(duracion)}", FECHA),
        Spacer(1, 16),
    ]

    # Resultado general (franja verde o roja)
    incompleto = total < info["total_registradas"]
    if fallidas == 0 and not incompleto:
        texto, color = "RESULTADO GENERAL: TODAS LAS PRUEBAS EJECUTADAS FUERON APROBADAS", VERDE
    elif fallidas:
        texto, color = f"RESULTADO GENERAL: {fallidas} PRUEBA(S) FALLIDA(S)", ROJO
    else:
        texto, color = "RESULTADO GENERAL: EJECUCIÓN INCOMPLETA (SE CERRÓ EL NAVEGADOR)", ROJO
    veredicto = Table([[_p(texto, VEREDICTO)]], colWidths=[ANCHO_UTIL])
    veredicto.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    elementos += [veredicto, Spacer(1, 12)]

    # Tarjetas con los totales
    def tarjeta(numero, texto, color):
        estilo_numero = ParagraphStyle("n", parent=NUMERO_KPI, textColor=color)
        return [Paragraph(str(numero), estilo_numero), _p(texto, TEXTO_KPI)]

    tarjetas = Table([[
        tarjeta(total, "Pruebas ejecutadas", CAFE_OSCURO),
        tarjeta(aprobadas, "Aprobadas", VERDE),
        tarjeta(fallidas, "Fallidas", ROJO),
        tarjeta(omitidas, "Omitidas", GRIS_OMITIDA),
        tarjeta(f"{porcentaje:.0f}%", "Éxito (sin omitidas)", CAFE),
    ]], colWidths=[ANCHO_UTIL / 5] * 5)
    tarjetas.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CREMA),
        ("BOX", (0, 0), (-1, -1), 0.8, BEIGE_BORDE),
        ("INNERGRID", (0, 0), (-1, -1), 0.8, BEIGE_BORDE),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elementos += [tarjetas, Spacer(1, 8)]

    # Barra de proporciones (verde / rojo / gris)
    partes = [(n, c) for n, c in [(aprobadas, VERDE), (fallidas, ROJO), (omitidas, GRIS_OMITIDA)] if n]
    if partes:
        barra = Table([[""] * len(partes)], colWidths=[ANCHO_UTIL * n / total for n, _ in partes],
                      rowHeights=[0.35 * cm])
        barra.setStyle(TableStyle([("BACKGROUND", (i, 0), (i, 0), c) for i, (_, c) in enumerate(partes)]))
        elementos += [barra]

    # Pruebas que fallaron (si hay)
    falladas = [r for r in resultados if r["estado"] == "FALLIDA"]
    if falladas:
        elementos += [_p("Pruebas que fallaron", H2)]
        filas = [[_p(f"{r['numero']}. {r['nombre']}", CELDA_NEG), _p(r["obtenido"], CELDA)] for r in falladas]
        tabla = Table(filas, colWidths=[5.5 * cm, ANCHO_UTIL - 5.5 * cm])
        tabla.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fdf0ee")),
            ("LINEBEFORE", (0, 0), (0, -1), 3, ROJO),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -2), 0.5, BEIGE_BORDE),
        ]))
        elementos += [tabla]

    # Entorno de ejecución
    elementos += [_p("Entorno de ejecución", H2)]
    filas = [
        ["Navegador", info["navegador"]],
        ["Selenium", info["selenium"]],
        ["Python", info["python"]],
        ["Sistema operativo", info["sistema"]],
        ["Sitio probado", info["url"] + "  (servidor local temporal)"],
        ["Base de datos", info["base"]],
        ["Modo", info["modo"]],
        ["Inicio / fin", f"{info['inicio']:%d/%m/%Y %H:%M:%S}  —  {info['fin']:%H:%M:%S}"],
    ]
    tabla = Table([[_p(a, CELDA_NEG), _p(b, CELDA)] for a, b in filas],
                  colWidths=[4 * cm, ANCHO_UTIL - 4 * cm])
    tabla.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, CREMA]),
        ("BOX", (0, 0), (-1, -1), 0.5, BEIGE_BORDE),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, BEIGE_BORDE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elementos += [tabla]

    # Explicación del método
    elementos += [
        _p("Cómo se hicieron las pruebas", H2),
        _p("Las pruebas se ejecutaron con Selenium WebDriver, que controla el navegador como lo "
           "haría una persona: hace clic, escribe en los campos y lee los mensajes que aparecen en "
           "pantalla. Las páginas cargan sus datos desde Supabase, así que cada prueba espera "
           "elementos concretos (tarjetas de mesas, botones de hora, platos) con WebDriverWait. "
           "Además de lo que se ve en pantalla, se comprueba el resultado real en la base de datos "
           "y, después de cada prueba, la consola del navegador: cualquier error (SEVERE) o "
           "advertencia (WARNING) no prevista hace fallar la prueba. Las pruebas de validación no "
           "guardan nada; las que crean datos usan el nombre «PRUEBA SELENIUM» y los eliminan al "
           "terminar, aunque la prueba falle. Al final de cada prueba se tomó una captura."),
    ]
    return elementos


def _tabla_resumen(resultados):
    filas = [[_p("N.º", ENCABEZADO), _p("Grupo", ENCABEZADO), _p("Prueba", ENCABEZADO),
              _p("Resultado", ENCABEZADO), _p("Tiempo", ENCABEZADO)]]
    for r in resultados:
        filas.append([_p(r["numero"], CELDA), _p(r.get("grupo", ""), CELDA), _p(r["nombre"], CELDA),
                      _estado(r["estado"]), _p(f"{r['duracion']:.1f} s", CELDA)])

    tabla = Table(filas, colWidths=[1.1 * cm, 3.2 * cm, ANCHO_UTIL - 9.3 * cm, 3 * cm, 2 * cm], repeatRows=1)
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), CAFE_OSCURO),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREMA]),
        ("BOX", (0, 0), (-1, -1), 0.5, BEIGE_BORDE),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, BEIGE_BORDE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return [_p("Resumen de pruebas", H2),
            _p("El tiempo de cada prueba incluye las pausas que se hacen para poder verla en el navegador.",
               _estilo("nota", fontSize=8, textColor=GRIS)),
            Spacer(1, 6),
            tabla]


def _detalle(resultados):
    elementos = [_p("Detalle de cada prueba", H2)]
    for r in resultados:
        cabecera = Table([[_p(f"{r['numero']}. {r['nombre']}", H3), _estado(r["estado"], 10)]],
                         colWidths=[ANCHO_UTIL - 3 * cm, 3 * cm])
        cabecera.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BEIGE),
            ("LINEBEFORE", (0, 0), (0, 0), 4, COLOR_ESTADO[r["estado"]]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))

        datos = Table([
            [_p("Esperado", CELDA_NEG), _p(r["esperado"], CELDA)],
            [_p("Obtenido", CELDA_NEG), _p(r["obtenido"], CELDA)],
            [_p("Consola", CELDA_NEG), _p(r.get("consola", "Sin errores ni advertencias."), CELDA)],
            [_p("Tiempo", CELDA_NEG), _p(f"{r['duracion']:.1f} s", CELDA)],
        ], colWidths=[2.4 * cm, ANCHO_UTIL - 2.4 * cm])
        datos.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -2), 0.4, BEIGE_BORDE),
        ]))

        bloque = [cabecera, datos, Spacer(1, 6)]
        if r["captura"]:
            bloque.append(_imagen(r["captura"], ANCHO_UTIL, 7 * cm))
        bloque.append(Spacer(1, 14))
        elementos.append(KeepTogether(bloque))  # que la prueba no quede partida entre hojas
    return elementos


# ---------------------------------------------------------
# Función principal
# ---------------------------------------------------------
def generar_reporte(ruta_pdf, resultados, info):
    """Crea el PDF en ruta_pdf y devuelve la ruta."""
    documento = SimpleDocTemplate(
        str(ruta_pdf), pagesize=letter,
        leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
        title="Reporte de pruebas automatizadas - Konys Pizza",
        author="Pruebas automáticas con Selenium",
    )
    documento.texto_pie = f"Generado el {info['fin']:%d/%m/%Y a las %H:%M}"

    contenido = []
    contenido += _portada(resultados, info)
    contenido += [PageBreak()]
    contenido += _tabla_resumen(resultados)
    contenido += [PageBreak()]
    contenido += _detalle(resultados)

    documento.build(contenido, onFirstPage=_decorar_pagina, onLaterPages=_decorar_pagina)
    return ruta_pdf
