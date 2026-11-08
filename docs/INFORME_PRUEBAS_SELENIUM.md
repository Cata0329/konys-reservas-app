# Informe de pruebas Selenium

## 1. Punto de partida

`pruebas/pruebas_formulario.py`, `pruebas/reporte_pdf.py` y `ejecutar_pruebas.bat` llegaron como **copia exacta del
ejemplo del profesor** ([cacarrascal/EjemploSelenium](https://github.com/cacarrascal/EjemploSelenium)), escrito para otra
aplicación («Restaurante El Fogón Dorado», con ids como `identificacion` o `formReserva`). Por eso el primer reporte salió
con todas las pruebas fallidas. Se usaron como **plantilla** y se reescribieron para Konys conservando su estructura y su
experiencia: servidor local propio, Chrome con Edge de respaldo, opciones `--rapido` / `--oculto` / `--no-abrir`, cartel
«Prueba N de M», captura por prueba, estados APROBADA / FALLIDA / OMITIDA y reporte PDF con portada, tabla resumen y
detalle (esperado / obtenido / consola / captura). Se borraron los reportes viejos del Fogón Dorado.

## 2. Cómo se ejecutan

```
py pruebas\pruebas_formulario.py --rapido --oculto     (o ejecutar_pruebas.bat)
```

| Variable / opción | Para qué |
|---|---|
| `.env` presente (o `--real`) | Prueba contra el **Supabase real** del proyecto. |
| `--local` (o sin `.env`) | Usa una copia local con las mismas migraciones (`tests/soporte/supabase-local.mjs`); no toca la base real. |
| `ADMIN_EMAIL_PRUEBAS`, `ADMIN_PASSWORD_PRUEBAS` | Credenciales del panel para las pruebas de administración y para **limpiar** los datos de prueba. Solo variables de entorno: nunca en el código. Sin ellas, esas pruebas salen **OMITIDAS**. En modo local se generan solas (contraseña aleatoria por ejecución). |

Reglas para no dejar basura en la base real:

- Las pruebas de validación **no guardan**: además de revisar el mensaje, comprueban que el navegador no hizo la
  petición `rpc/crear_reserva`.
- Las que crean datos usan el nombre **«PRUEBA SELENIUM»**, fechas a ~45 días y los eliminan en un bloque `finally`
  (aunque la prueba falle) y otra vez al terminar la ejecución. El plato de prueba se crea **oculto** y nunca se ve en la carta pública.
- Las pruebas que crean datos necesitan las credenciales del panel (para poder borrarlos); sin ellas se omiten.

## 3. Qué se prueba

| Grupo | Casos |
|---|---|
| 1. Carga de páginas | Título, estilos, contenido de Supabase y página activa del menú en index, mesas, carta, contacto, reservar y admin |
| 2. Navegación | Menú entre páginas separadas; la consulta rápida del inicio abre Mesas con los datos elegidos |
| 3. Mesas | Mesas activas con zona, capacidad y estado; filtros de zona y personas |
| 4. Reserva | Flujo completo mesa → fecha → hora → datos → confirmación, verificado en Supabase |
| 5. Validaciones | Nombre vacío, personas = 0, más personas que la capacidad, contacto inválido, sin hora |
| 6. Disponibilidad | Horario ocupado tachado; doble reserva simultánea (una sola queda guardada) |
| 7. Carta | Categorías reales, solo platos reales y disponibles, buscador, fotos con `loading="lazy"` |
| 8. Administración | Login incorrecto y correcto, acceso directo sin sesión, crear y activar/desactivar mesa, filtros de reservas, gestión de la carta, cerrar sesión (y «Atrás») |
| 9. Seguridad | Inactividad con valor corto (aviso + cierre), valor de producción 300000, JWT ausente en la URL, XSS, usuario sin permisos, cierre entre pestañas |
| 10. Responsive | 375 px sin desplazamiento horizontal en todas las páginas |
| 11. Consola | Recorrido completo sin errores ni advertencias (y cada prueba revisa su propia consola) |

**Consola:** el navegador se abre con `goog:loggingPrefs`; después de cada prueba se leen `driver.get_log('browser')` y
los registros de red. Un mensaje `SEVERE` o `WARNING`, o una respuesta HTTP ≥ 400, que la prueba no haya provocado a
propósito la hace **fallar**. Las pocas pruebas que provocan un rechazo del servidor (contraseña incorrecta, doble
reserva) declaran exactamente qué petición esperan que falle.

## 4. Correcciones que salieron de las pruebas

| Ejecución | Resultado | Hallazgo | Corrección |
|---|---|---|---|
| 1 | 34/37 | La notificación flotante del panel tapaba los interruptores de la tabla durante 4 s (clic interceptado). | **App:** las notificaciones ya no capturan clics (`pointer-events: none`). |
| 1 | | La prueba exigía el fondo crema también en el panel (que usa otro fondo por diseño); la alerta de «doble reserva» se leía mientras se repintaba. | Ajustes de la prueba (criterio por fuente cargada; lectura con JavaScript). |
| 2 | **37/37** | — | — |

## 5. Resultado de la última ejecución (base local)

Ejecución del 7 de noviembre de 2026 · Chrome 156 · Selenium 4.52 · Python 3.14 · modo `--rapido --oculto`.
**37 aprobadas, 0 fallidas, 0 omitidas.** Reporte: `pruebas/reportes/reporte_pruebas_2026-11-07_22-09-02.pdf`.
Capturas destacadas en `docs/evidencias/selenium/`.

**Pendiente:** ejecutar la misma suite contra el Supabase real (`.env` + `ADMIN_EMAIL_PRUEBAS` y
`ADMIN_PASSWORD_PRUEBAS`) después de que Tatis aplique `docs/CAMBIOS_SUPABASE.md`. Antes de eso, «Categorías reales» y
«Solo platos reales» fallarán a propósito, porque la base real aún tiene la carta inventada.

| N.º | Grupo | Prueba | Estado | Resultado obtenido | Consola | Tiempo |
|---|---|---|---|---|---|---|
| 1 | 1. Carga de páginas | Carga de index.html | **APROBADA** | Título «Konys Pizza · Reserva tu mesa en Bucaramanga», estilos aplicados y contenido cargado. | Sin errores ni advertencias. | 2.5 s |
| 2 | 1. Carga de páginas | Carga de mesas.html | **APROBADA** | Título «Mesas · Konys Pizza», estilos aplicados y contenido cargado. | Sin errores ni advertencias. | 1.2 s |
| 3 | 1. Carga de páginas | Carga de carta.html | **APROBADA** | Título «Carta · Konys Pizza», estilos aplicados y contenido cargado. | Sin errores ni advertencias. | 1.5 s |
| 4 | 1. Carga de páginas | Carga de contacto.html | **APROBADA** | Título «Contacto · Konys Pizza», estilos aplicados y contenido cargado. | Sin errores ni advertencias. | 1.2 s |
| 5 | 1. Carga de páginas | Carga de reservar.html | **APROBADA** | Título «Reserva tu mesa · Konys Pizza», estilos aplicados y contenido cargado. | Sin errores ni advertencias. | 1.7 s |
| 6 | 1. Carga de páginas | Carga de admin.html | **APROBADA** | Título «Acceso · Panel Konys Pizza», estilos aplicados y contenido cargado. | Sin errores ni advertencias. | 0.7 s |
| 7 | 2. Navegación | Menú principal entre páginas separadas | **APROBADA** | Recorrido Mesas → Carta → Contacto → Inicio → Reservar con la página activa marcada. | Sin errores ni advertencias. | 3.2 s |
| 8 | 2. Navegación | La consulta rápida del inicio lleva a Mesas | **APROBADA** | Mesas para 2026-11-27 y 4 personas: 6 mesas, todas con capacidad ≥ 4. | Sin errores ni advertencias. | 2.1 s |
| 9 | 3. Mesas | Mesas visibles con zona, capacidad y estado | **APROBADA** | 8 mesas activas, todas con zona, capacidad y estado. | Sin errores ni advertencias. | 1.5 s |
| 10 | 3. Mesas | Filtros por zona y por número de personas | **APROBADA** | Terraza: solo terraza. 6 personas: capacidades [6, 6]. | Sin errores ni advertencias. | 1.9 s |
| 11 | 4. Reserva | Flujo completo: mesa → fecha → hora → datos → confirmación | **APROBADA** | Reserva 242F92E7: Mesa 1, 23/12/2026 8:00 p. m., 2 personas (eliminada al terminar). | Sin errores ni advertencias. | 4.1 s |
| 12 | 5. Validaciones | Nombre vacío | **APROBADA** | Error visible, campo marcado y sin petición de guardado. | Sin errores ni advertencias. | 1.9 s |
| 13 | 5. Validaciones | Personas = 0 | **APROBADA** | La interfaz no baja de 1 y el servidor rechaza 0 personas (PERSONAS_INVALIDAS); nada guardado. | Sin errores ni advertencias. | 2.1 s |
| 14 | 5. Validaciones | Más personas que la capacidad de la mesa | **APROBADA** | Mesa 1 (hasta 2): bloqueado en la página y rechazado por el servidor. | Sin errores ni advertencias. | 2.6 s |
| 15 | 5. Validaciones | Contacto inválido | **APROBADA** | Error del teléfono visible y sin petición de guardado. | Sin errores ni advertencias. | 2.6 s |
| 16 | 5. Validaciones | Sin elegir hora | **APROBADA** | Botón desactivado sin hora y habilitado al elegir una. | Sin errores ni advertencias. | 1.4 s |
| 17 | 6. Disponibilidad | Un horario ocupado aparece tachado | **APROBADA** | 8:30, 9:00 y 9:30 p. m. tachadas; 8:00 y 10:00 p. m. libres. | Sin errores ni advertencias. | 1.2 s |
| 18 | 6. Disponibilidad | Doble reserva: dos clientes a la vez | **APROBADA** | El segundo cliente vio «Alguien acaba de reservar»; una sola reserva en la base. | Sin errores no previstos (1 mensaje(s) de error provocados a propósito por la prueba: respuesta de rechazo del servidor). | 2.5 s |
| 19 | 7. Carta | Categorías reales de la carta | **APROBADA** | 15 pestañas: Recomendados, Entradas, Menú Infantil, Pizzas, Desgranados, Papas Ikónicas, Lasaña, Granizados, Sodas, Bebidas Frías, Cerveza, Cocteles, Postres, Menú Almuerzos, Congelados. | Sin errores ni advertencias. | 2.1 s |
| 20 | 7. Carta | Solo platos reales y disponibles | **APROBADA** | 67 platos visibles, todos oficiales; ningún plato oculto ni inventado. | Sin errores ni advertencias. | 1.9 s |
| 21 | 7. Carta | Buscador de la carta | **APROBADA** | «limonada» → Limonada de Panela, Limonada de Coco. | Sin errores ni advertencias. | 1.6 s |
| 22 | 7. Carta | Las fotos de los platos cargan | **APROBADA** | 65 fotos cargadas, 0 rotas. | Sin errores ni advertencias. | 16.5 s |
| 23 | 8. Administración | Inicio de sesión incorrecto | **APROBADA** | Mensaje de error visible y panel cerrado. | Sin errores no previstos (1 mensaje(s) de error provocados a propósito por la prueba: respuesta de rechazo del servidor). | 1.5 s |
| 24 | 8. Administración | Inicio de sesión correcto | **APROBADA** | Panel abierto; token solo en sessionStorage. | Sin errores ni advertencias. | 1.3 s |
| 25 | 8. Administración | Acceso directo al panel sin sesión | **APROBADA** | Se muestra el acceso; la API rechaza leer reservas sin sesión (403). | Sin errores ni advertencias. | 1.6 s |
| 26 | 8. Administración | Crear mesa y activarla/desactivarla | **APROBADA** | Mesa creada (visible), desactivada (oculta) y reactivada; eliminada al terminar. | Sin errores ni advertencias. | 3.1 s |
| 27 | 8. Administración | Filtros de reservas | **APROBADA** | Sin reservas canceladas: se muestra el estado vacío. | Sin errores ni advertencias. | 2.2 s |
| 28 | 8. Administración | Gestión de la carta: crear, editar y eliminar un plato | **APROBADA** | Plato creado oculto (invisible al público), precio editado de $10.000 a $12.000; eliminado al terminar. | Sin errores ni advertencias. | 4.9 s |
| 29 | 8. Administración | Cerrar sesión (y el botón Atrás no muestra el panel) | **APROBADA** | Acceso visible, sesión borrada y «Atrás» no reabre el panel. | Sin errores ni advertencias. | 4.1 s |
| 30 | 9. Seguridad | Cierre por inactividad (valor corto solo en localhost) | **APROBADA** | Aviso y «Seguir conectado» funcionan; sin actividad se cerró a los 10.1 s. | Sin errores ni advertencias. | 19.9 s |
| 31 | 9. Seguridad | Valor de producción del cierre por inactividad | **APROBADA** | Producción 300 000 ms; en Vercel se ignora ?inactividad; en localhost 10 000 ms. | Sin errores ni advertencias. | 0.6 s |
| 32 | 9. Seguridad | El token (JWT) nunca aparece en la URL | **APROBADA** | Token falso borrado y sin sesión; navegando el panel la URL nunca contiene el JWT. | Sin errores ni advertencias. | 3.5 s |
| 33 | 9. Seguridad | Texto con HTML se muestra como texto (XSS) | **APROBADA** | El nombre con HTML se mostró como texto, sin imagen ni alerta. | Sin errores ni advertencias. | 2.0 s |
| 34 | 9. Seguridad | Usuario autenticado sin permisos de administración | **APROBADA** | Acceso denegado y la API no modificó ningún precio (0 filas). | Sin errores ni advertencias. | 1.2 s |
| 35 | 9. Seguridad | Cerrar sesión en una pestaña cierra las demás | **APROBADA** | Al cerrar sesión en una pestaña, la otra volvió al acceso. | Sin errores ni advertencias. | 4.2 s |
| 36 | 10. Responsive | Diseño adaptable en celular (375 px) | **APROBADA** | Sin desbordamiento en: index.html, mesas.html, carta.html, contacto.html, reservar.html, admin.html. | Sin errores ni advertencias. | 5.5 s |
| 37 | 11. Consola | Recorrido completo sin errores ni advertencias en consola | **APROBADA** | Sin errores ni advertencias en: index.html, mesas.html, carta.html, contacto.html, reservar.html, mi-reserva.html, admin.html, admin#resumen, admin#mesas, admin#horarios, admin#reservas, admin#categorias, admin#carta. | Sin errores ni advertencias. | 14.0 s |
