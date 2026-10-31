// Anotaciones de las apps de Stock (productos) y Clientes.
using DespachoService as srv from '../../srv/despacho-service';

annotate srv.Productos with {
  codigo      @title: 'Código';
  nombre      @title: 'Producto';
  categoria   @title: 'Categoría' @Common: { Text: categoria.name, TextArrangement: #TextOnly, ValueListWithFixedValues: true };
  unidad      @title: 'Unidad';
  precio      @title: 'Precio (S/)';
  stock       @title: 'Stock';
  stockMinimo @title: 'Stock mínimo';
}

annotate srv.Productos with @(
  UI.HeaderInfo: { TypeName: 'Producto', TypeNamePlural: 'Productos', Title: { Value: nombre }, Description: { Value: codigo } },
  UI.SelectionFields: [ categoria_code, nombre ],
  UI.LineItem: [
    { Value: codigo }, { Value: nombre, ![@UI.Importance]: #High }, { Value: categoria_code },
    { Value: precio },
    { Value: stock, Criticality: criticidadStock, ![@UI.Importance]: #High },
    { Value: stockMinimo }
  ],
  UI.PresentationVariant: { SortOrder: [{ Property: stock }], Visualizations: ['@UI.LineItem'] },
  UI.DataPoint #Stock: { Value: stock, Title: 'Stock', Criticality: criticidadStock },
  UI.HeaderFacets: [{ $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Stock' }],
  UI.FieldGroup #General: { Data: [ { Value: codigo }, { Value: nombre }, { Value: categoria_code }, { Value: unidad }, { Value: precio } ] },
  UI.FieldGroup #Inventario: { Data: [ { Value: stock, Criticality: criticidadStock }, { Value: stockMinimo } ] },
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Datos generales', Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', Label: 'Inventario', Target: '@UI.FieldGroup#Inventario' }
  ]
);

annotate srv.Categorias with { code @Common.Text: name @Common.TextArrangement: #TextOnly; }

annotate srv.Clientes with {
  nombre   @title: 'Cliente';
  ruc      @title: 'RUC';
  distrito @title: 'Distrito';
  telefono @title: 'Teléfono';
  linea    @title: 'Línea de crédito (S/)';
}

annotate srv.Clientes with @(
  UI.HeaderInfo: { TypeName: 'Cliente', TypeNamePlural: 'Clientes', Title: { Value: nombre }, Description: { Value: distrito } },
  UI.SelectionFields: [ distrito, nombre ],
  UI.LineItem: [ { Value: nombre }, { Value: ruc }, { Value: distrito }, { Value: telefono }, { Value: linea } ],
  UI.FieldGroup #Datos: { Data: [ { Value: nombre }, { Value: ruc }, { Value: distrito }, { Value: telefono }, { Value: linea } ] },
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Datos del cliente', Target: '@UI.FieldGroup#Datos' },
    { $Type: 'UI.ReferenceFacet', Label: 'Pedidos', Target: 'pedidos/@UI.LineItem' }
  ]
);

// El ID interno (UUID) nunca se muestra: Fiori enseña el nombre y permite escribirlo para buscar
annotate srv.Clientes with {
  ID @UI.Hidden @Common.Text: nombre @Common.TextArrangement: #TextOnly;
} ;
annotate srv.Productos with {
  ID @UI.Hidden @Common.Text: nombre @Common.TextArrangement: #TextOnly;
};
annotate srv.Clientes with @cds.search: { nombre, ruc, distrito };
annotate srv.Productos with @cds.search: { nombre, codigo };
