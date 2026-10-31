// Servicio OData V4 que consumen las apps Fiori. Solo expone lo que cada rol necesita.
using { despacho as db } from '../db/schema';

@path: '/odata/v4/despacho'
@requires: 'authenticated-user'
service DespachoService {

  /** Pedidos con borrador (draft): el vendedor edita sin bloquear a nadie y guarda cuando termina */
  @odata.draft.enabled
  @restrict: [
    { grant: ['READ', 'CREATE', 'UPDATE', 'confirmar', 'anular'], to: 'Vendedor' },
    { grant: ['READ', 'despachar', 'entregar'], to: 'Almacen' },
    { grant: '*', to: 'Admin' }
  ]
  entity Pedidos as projection on db.Pedidos actions {
    @(Common.SideEffects: { TargetProperties: ['in/estado_code', 'in/estado', 'in/bloqueado'], TargetEntities: ['in/items'] })
    action confirmar() returns Pedidos;
    @(Common.SideEffects: { TargetProperties: ['in/estado_code', 'in/estado', 'in/bloqueado'] })
    action despachar() returns Pedidos;
    @(Common.SideEffects: { TargetProperties: ['in/estado_code', 'in/estado', 'in/bloqueado'] })
    action entregar()  returns Pedidos;
    @(Common.SideEffects: { TargetProperties: ['in/estado_code', 'in/estado', 'in/bloqueado', 'in/motivoAnulacion'] })
    action anular(motivo : String @mandatory @Common.Label: 'Motivo de la anulación') returns Pedidos;
  };

  entity PedidoItems as projection on db.PedidoItems;

  @odata.draft.enabled
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: '*', to: ['Admin', 'Vendedor'] }]
  entity Clientes as projection on db.Clientes;

  @odata.draft.enabled
  @restrict: [{ grant: 'READ', to: 'authenticated-user' }, { grant: '*', to: ['Admin', 'Almacen'] }]
  entity Productos as projection on db.Productos;

  @readonly entity Categorias    as projection on db.Categorias;
  @readonly entity EstadosPedido as projection on db.EstadosPedido;

  /** Resumen para el panel: cuánto se vendió y qué falta despachar */
  @readonly function resumen() returns {
    pedidosHoy        : Integer;
    porDespachar      : Integer;
    ventasMes         : Decimal(12, 2);
    productosBajoStock: Integer;
  };
}
