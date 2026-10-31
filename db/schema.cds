// Modelo de datos de Despacho (CDS: el lenguaje con el que SAP CAP describe tablas y relaciones).
// De aquí CAP genera las tablas de la base de datos, el servicio OData y la base de las pantallas Fiori.
namespace despacho;

using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';

/** Bodegas y minimarkets que le compran a la distribuidora */
entity Clientes : cuid, managed {
  nombre   : String(80)  @mandatory;
  ruc      : String(11)  @assert.format: '^(10|20)\d{9}$';
  distrito : String(40);
  telefono : String(15);
  linea    : Decimal(10, 2) default 0;   // línea de crédito en soles
  pedidos  : Association to many Pedidos on pedidos.cliente = $self;
}

entity Categorias : CodeList {
  key code : String(10);
}

entity Productos : cuid, managed {
  codigo      : String(12) @mandatory;
  nombre      : String(80) @mandatory;
  categoria   : Association to Categorias;
  unidad      : String(12) default 'unidad';
  precio      : Decimal(10, 2) @mandatory;
  stock       : Integer default 0;
  stockMinimo : Integer default 10;
  // Semáforo de stock para Fiori: 1 rojo (agotado), 2 ámbar (bajo el mínimo), 3 verde
  virtual criticidadStock : Integer;
}

/** Estados del pedido: Nuevo → Confirmado → Despachado → Entregado; o Anulado */
entity EstadosPedido : CodeList {
  key code   : String(1);
      criticidad : Integer;   // color en Fiori: 0 neutro, 1 rojo, 2 ámbar, 3 verde
}

entity Pedidos : cuid, managed {
  numero   : String(10) @readonly;   // correlativo estilo SAP: PV-1001, PV-1002…
  cliente  : Association to Clientes @mandatory;
  fecha    : Date default $now;
  entrega  : Date;
  estado   : Association to EstadosPedido default 'N' @readonly;
  items    : Composition of many PedidoItems on items.pedido = $self;
  subtotal : Decimal(12, 2) default 0 @readonly;
  igv      : Decimal(12, 2) default 0 @readonly;
  total    : Decimal(12, 2) default 0 @readonly;
  moneda   : String(3) default 'PEN' @readonly;
  notas    : String(500);
  motivoAnulacion : String(200) @readonly;
  virtual bloqueado : Boolean;   // true si ya no está en estado Nuevo
}

entity PedidoItems : cuid {
  pedido   : Association to Pedidos;
  producto : Association to Productos @mandatory;
  cantidad : Integer default 1 @assert.range: [1, 9999];
  precio   : Decimal(10, 2) @readonly;   // se copia del producto al guardar: el precio no se escribe a mano
  importe  : Decimal(12, 2) @readonly;
}
