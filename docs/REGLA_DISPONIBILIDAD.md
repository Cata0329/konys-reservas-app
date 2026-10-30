# Regla de disponibilidad y prevención de reservas duplicadas

Este documento resume cómo evita el sistema que una mesa se reserve dos veces.
Sirve como guion para la sustentación.

## 1. La regla, en una frase

> Una mesa no puede tener dos reservas **no canceladas** cuyos intervalos
> `[hora_inicio, hora_fin)` se crucen el mismo día. Lo garantiza PostgreSQL,
> no el navegador.

## 2. Cómo se generan los horarios

- Cada día de la semana tiene 0, 1 o 2 **jornadas** (`almuerzo`, `noche`) en la tabla `horarios`,
  con hora de inicio, hora de fin y **duración de la reserva** (por defecto 60 minutos).
- Las horas de inicio se ofrecen **cada 30 minutos** desde el inicio de la jornada.
- Una hora solo se ofrece si la reserva completa **cabe** dentro de la jornada:
  `inicio + duración <= fin`.
  Ejemplo: almuerzo 12:30–2:30 → se ofrecen 12:30, 1:00 y 1:30 (la de 1:30 termina justo a las 2:30).
- Como las reservas duran 60 min y empiezan cada 30, una reserva a las 7:00 bloquea 6:30, 7:00 y 7:30
  (se cruzan con ella), pero **no** 6:00 ni 8:00 (son contiguas).

## 3. Qué bloquea un horario

| Estado de la reserva | ¿Bloquea la mesa? | Motivo |
|---|---|---|
| `confirmada` | Sí | El cliente va a venir. |
| `completada` | Sí | Ya ocurrió; se conserva como historial (no se puede "reutilizar" el pasado). |
| `cancelada`  | **No** | Libera el horario para otro cliente. |

Además, no se puede reservar:

- una mesa **inactiva** (`mesas.activa = false`);
- para **más personas** que la capacidad de la mesa;
- fuera de las jornadas **activas** del día, ni desalineado de la cuadrícula de 30 min;
- en el **pasado** (hora de Bogotá) ni a más de **60 días**.

## 4. Las tres capas de protección

1. **Navegador (`js/disponibilidad.js`)**: calcula y pinta horarios libres/ocupados para que el
   cliente elija bien. Es solo orientativo: dos personas pueden ver la misma hora libre a la vez.
2. **Función `crear_reserva()` (SQL, `security definer`)**: es la *única* puerta por la que el
   público puede crear reservas. Valida nombre, mesa activa, capacidad, fecha, jornada y cuadrícula,
   y calcula `hora_fin` con la duración configurada (el cliente no puede inventarla).
3. **Restricción de exclusión en la tabla `reservas`** (la garantía final):

   ```sql
   constraint reservas_sin_solapamiento exclude using gist (
     mesa_id with =,
     tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') with &&
   ) where (estado <> 'cancelada')
   ```

   PostgreSQL revisa esta regla **dentro de la misma transacción del INSERT/UPDATE**. Si dos
   clientes confirman la misma franja al mismo tiempo, el índice GiST serializa ambas inserciones:
   una se guarda y la otra recibe el error `exclusion_violation`, que la función traduce a
   `HORARIO_OCUPADO`. El sitio entonces muestra "Alguien acaba de reservar…" y vuelve al paso de
   horarios conservando el nombre y el número de personas.

   La regla también aplica al panel: si el administrador intenta reactivar una reserva cancelada
   cuyo horario ya tomó otra persona, la base de datos lo impide.

La capacidad se valida además con el trigger `reservas_validar_capacidad`, así que tampoco se puede
saltar editando una reserva desde el panel.

## 5. Por qué no basta con "consultar y luego insertar" desde JavaScript

Entre la consulta (`¿está libre?`) y la inserción pasan milisegundos en los que otro cliente puede
insertar primero (*condición de carrera*). Solo una regla evaluada por la base de datos en el
momento de escribir elimina esa ventana.

## 6. Dónde se prueba

- `tests/sql/esquema.test.mjs`: ejecuta la migración real en PostgreSQL embebido (PGlite) y
  comprueba solapamientos, cancelaciones, capacidad, mesas inactivas, turnos, fechas y RLS.
- `tests/logica.test.mjs`: comprueba el cálculo de horarios del navegador.
