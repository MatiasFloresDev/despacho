// Anotaciones de UI: describen QUÉ mostrar; Fiori Elements arma las pantallas solo.
using DespachoService as srv from '../../srv/despacho-service';

annotate srv.Pedidos with {
  numero   @title: 'N.º de pedido';
  cliente  @title: 'Cliente' @Common: {
    Text: cliente.nombre, TextArrangement: #TextOnly,
    ValueList: { CollectionPath: 'Clientes', Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: cliente_ID, ValueListProperty: 'ID' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'nombre' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'distrito' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'ruc' }
    ]},
    ValueListWithFixedValues: false
  };
  fecha    @title: 'Fecha';
  entrega  @title: 'Entrega';
  estado   @title: 'Estado' @Common: { Text: estado.name, TextArrangement: #TextOnly, ValueListWithFixedValues: true };
  subtotal @title: 'Subtotal' @Measures.ISOCurrency: moneda;
  igv      @title: 'IGV (18 %)' @Measures.ISOCurrency: moneda;
  total    @title: 'Total' @Measures.ISOCurrency: moneda;
  moneda   @title: 'Moneda';
  notas    @title: 'Notas' @UI.MultiLineText;
  motivoAnulacion @title: 'Motivo de anulación';
}

// Cada botón se activa solo en el estado que corresponde (y nunca mientras el pedido es un borrador)
annotate srv.Pedidos with actions {
  confirmar @(Core.OperationAvailable: { $edmJson: { $And: [{ $Path: 'in/IsActiveEntity' }, { $Eq: [{ $Path: 'in/estado_code' }, 'N'] }] } });
  despachar @(Core.OperationAvailable: { $edmJson: { $And: [{ $Path: 'in/IsActiveEntity' }, { $Eq: [{ $Path: 'in/estado_code' }, 'C'] }] } });
  entregar  @(Core.OperationAvailable: { $edmJson: { $And: [{ $Path: 'in/IsActiveEntity' }, { $Eq: [{ $Path: 'in/estado_code' }, 'D'] }] } });
  anular    @(Core.OperationAvailable: { $edmJson: { $And: [{ $Path: 'in/IsActiveEntity' }, { $Or: [
    { $Eq: [{ $Path: 'in/estado_code' }, 'N'] }, { $Eq: [{ $Path: 'in/estado_code' }, 'C'] } ] }] } });
};

// Solo los pedidos Nuevos se editan o borran: en los demás, Fiori esconde esos botones
annotate srv.Pedidos with @(UI.UpdateHidden: bloqueado, UI.DeleteHidden: bloqueado);

annotate srv.Pedidos with @(
  UI.HeaderInfo: {
    TypeName: 'Pedido', TypeNamePlural: 'Pedidos',
    Title: { Value: numero }, Description: { Value: cliente.nombre }
  },
  UI.SelectionFields: [ estado_code, cliente_ID, fecha ],
  UI.LineItem: [
    { Value: numero, ![@UI.Importance]: #High },
    { Value: cliente_ID, ![@UI.Importance]: #High },
    { Value: fecha },
    { Value: entrega },
    { Value: estado_code, Criticality: estado.criticidad, CriticalityRepresentation: #WithoutIcon, ![@UI.Importance]: #High },
    { Value: total, ![@UI.Importance]: #High },
    { $Type: 'UI.DataFieldForAction', Action: 'DespachoService.confirmar', Label: 'Confirmar' },
    { $Type: 'UI.DataFieldForAction', Action: 'DespachoService.despachar', Label: 'Despachar' },
    { $Type: 'UI.DataFieldForAction', Action: 'DespachoService.entregar', Label: 'Marcar entregado' }
  ],
  UI.PresentationVariant: { SortOrder: [{ Property: numero, Descending: true }], Visualizations: ['@UI.LineItem'] },
  UI.DataPoint #Total:  { Value: total, Title: 'Total' },
  UI.DataPoint #Estado: { Value: estado_code, Title: 'Estado', Criticality: estado.criticidad },
  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Estado' },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Total' }
  ],
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'DespachoService.confirmar', Label: 'Confirmar y reservar stock' },
    { $Type: 'UI.DataFieldForAction', Action: 'DespachoService.despachar', Label: 'Despachar' },
    { $Type: 'UI.DataFieldForAction', Action: 'DespachoService.entregar', Label: 'Marcar entregado' },
    { $Type: 'UI.DataFieldForAction', Action: 'DespachoService.anular', Label: 'Anular' }
  ],
  UI.FieldGroup #Datos: { Data: [
    { Value: cliente_ID }, { Value: fecha }, { Value: entrega }, { Value: notas }, { Value: motivoAnulacion }
  ]},
  UI.FieldGroup #Totales: { Data: [ { Value: subtotal }, { Value: igv }, { Value: total } ] },
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'Datos', Label: 'Datos del pedido', Target: '@UI.FieldGroup#Datos' },
    { $Type: 'UI.ReferenceFacet', ID: 'Productos', Label: 'Productos', Target: 'items/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Totales', Label: 'Totales', Target: '@UI.FieldGroup#Totales' }
  ],
  // Al cambiar cantidades o productos, Fiori vuelve a leer los totales del pedido
  Common.SideEffects #Items: { SourceEntities: ['items'], TargetProperties: ['subtotal', 'igv', 'total'] }
);

annotate srv.PedidoItems with {
  producto @title: 'Producto' @Common: {
    Text: producto.nombre, TextArrangement: #TextOnly,
    ValueList: { CollectionPath: 'Productos', Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: producto_ID, ValueListProperty: 'ID' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'nombre' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'codigo' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'stock' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'precio' }
    ]}
  };
  cantidad @title: 'Cantidad';
  precio   @title: 'Precio unitario';
  importe  @title: 'Importe';
}

annotate srv.PedidoItems with @(
  UI.HeaderInfo: { TypeName: 'Producto', TypeNamePlural: 'Productos', Title: { Value: producto.nombre } },
  UI.LineItem: [
    { Value: producto_ID }, { Value: cantidad }, { Value: precio }, { Value: importe }
  ],
  Common.SideEffects #Linea: { SourceProperties: ['producto_ID', 'cantidad'], TargetProperties: ['precio', 'importe'] }
);

annotate srv.EstadosPedido with {
  code @Common.Text: name @Common.TextArrangement: #TextOnly;
}
