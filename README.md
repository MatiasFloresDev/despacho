# Despacho · pedidos y stock para distribuidoras con SAP CAP y SAP Fiori

Sistema de pedidos para una distribuidora que abastece bodegas y minimarkets de Lima. El vendedor toma el pedido, el sistema calcula precios e IGV, **reserva el stock al confirmar** y el almacén lo despacha. Está construido con las herramientas que usan las empresas con SAP: **SAP Cloud Application Programming Model (CAP)**, **OData V4** y **SAP Fiori Elements**.

**Demo en línea:** https://despacho-snowy.vercel.app (usuarios `vendedor`, `almacen` o `admin`; la contraseña es igual al usuario)

| Rol | Qué puede hacer |
|---|---|
| `vendedor` | Crear y editar pedidos, confirmarlos (reserva stock) y anularlos |
| `almacen` | Despachar, marcar entregado y mantener el stock |
| `admin` | Todo |

## Cómo funciona SAP CAP (en 1 minuto)

En CAP no escribes tablas, endpoints ni pantallas a mano. Describes tu negocio y CAP genera el resto:

```
db/schema.cds          →  QUÉ datos hay (entidades y relaciones)          → CAP crea las tablas
srv/*.cds              →  QUÉ se expone y a quién (servicio + roles)      → CAP crea la API OData V4
srv/*.js               →  CÓMO se comporta (validaciones, cálculos, acciones)
app/*/annotations.cds  →  QUÉ se muestra (columnas, filtros, botones)     → Fiori Elements arma las pantallas
```

1. **Modelo (CDS).** `db/schema.cds` define `Clientes`, `Productos`, `Pedidos` y `PedidoItems`. Un pedido *compone* sus líneas (`Composition of many`): si se borra el pedido, se borran sus líneas. Los estados (`Nuevo`, `Confirmado`, `Despachado`, `Entregado`, `Anulado`) son una lista de códigos con su color.
2. **Servicio (OData V4).** `srv/despacho-service.cds` expone las entidades y cuatro **acciones de negocio**: `confirmar`, `despachar`, `entregar` y `anular(motivo)`. Los permisos se declaran con `@restrict`: por ejemplo, el vendedor no puede despachar.
3. **Lógica (handlers).** `srv/despacho-service.js` se engancha a eventos del servicio:
   - al crear un borrador, le da un número correlativo (`PV-1019`);
   - al elegir producto o cantidad, copia el precio del catálogo y recalcula importe, subtotal, IGV (18 %) y total;
   - `confirmar` reserva el stock **de todo el pedido o de nada**: si un producto no alcanza, la transacción se deshace y nada cambia;
   - `anular` un pedido confirmado devuelve el stock al almacén;
   - solo los pedidos *Nuevos* se editan o borran.
4. **Borradores (draft).** Con `@odata.draft.enabled`, el vendedor edita un borrador sin afectar el pedido real ni bloquear a nadie, y lo activa al guardar. Es el comportamiento estándar de las apps Fiori de S/4HANA.
5. **Pantallas (Fiori Elements).** No hay HTML de pantallas: las anotaciones (`UI.LineItem`, `UI.Facets`, `UI.DataPoint`, `Common.ValueList`…) dicen qué columnas, filtros, secciones y botones mostrar, y SAPUI5 arma la lista con filtros y la página de detalle. Los botones se activan solo en el estado correcto (`Core.OperationAvailable`) y el stock se pinta con semáforo (`Criticality`).
6. **Launchpad.** `app/launchpad.html` muestra las tres apps (Pedidos, Stock y Clientes) como mosaicos, igual que el SAP Fiori launchpad.

## Estructura

```
db/
  schema.cds              modelo de datos
  data/*.csv              datos de ejemplo: 18 productos, 8 bodegas, 18 pedidos
srv/
  despacho-service.cds    servicio OData, acciones y roles
  despacho-service.js     lógica de negocio
app/
  index.html              portada de la demo
  launchpad.html          SAP Fiori launchpad (sandbox)
  pedidos/ stock/ clientes/   apps Fiori Elements (manifest.json)
  pedidos/annotations.cds     anotaciones de la app de pedidos
  maestros/annotations.cds    anotaciones de stock y clientes
test/despacho.test.js     pruebas de punta a punta con cds.test
api/index.js              el mismo servidor CAP como función de Vercel (demo en línea)
```

## Probar en local

```bash
npm install
npm run dev          # cds watch: http://localhost:4004 (recarga al guardar)
npm test             # 8 pruebas contra el servicio OData real
```

Abre http://localhost:4004/launchpad.html y entra con `vendedor` / `vendedor`. La base es SQLite en memoria: cada arranque vuelve a los datos de ejemplo.

## Pruebas

`test/despacho.test.js` levanta el servidor con `cds.test` y prueba por HTTP:
- sin usuario no entra (401) y el vendedor no puede despachar (403);
- semáforo de stock: agotado, bajo el mínimo y suficiente;
- el borrador calcula precio, importe, subtotal, IGV y total, y recalcula al cambiar la cantidad;
- flujo completo Nuevo → Confirmado → Despachado → Entregado, con reserva de stock;
- si falta stock de un producto, no se reserva nada;
- anular un confirmado devuelve el stock;
- no se guarda un pedido sin productos ni se edita uno ya entregado.

## Publicación

- **Demo:** Vercel (`api/index.js` levanta CAP dentro de una función). Con la variable `POSTGRES_URL` (por ejemplo, Neon) todas las instancias comparten la misma base de datos; sin ella usa SQLite en memoria por instancia.
- **SAP BTP (el camino oficial):** `cds add mta xsuaa hana` y `mbt build && cf deploy` en una cuenta de prueba de SAP BTP. Cambia la base por SAP HANA Cloud y los usuarios de prueba por roles de XSUAA.

## Qué demuestra este proyecto

Modelado de datos en CDS, servicios OData V4, acciones de negocio con transacciones, borradores, autorizaciones por rol, SAP Fiori Elements guiado por anotaciones y pruebas automáticas: lo que se pide para un puesto junior de desarrollo en SAP BTP.
