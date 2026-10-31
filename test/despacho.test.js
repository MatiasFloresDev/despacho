// Pruebas de punta a punta contra el servicio OData real (base SQLite en memoria con los datos de ejemplo).
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const cds = require('@sap/cds');

const { GET, POST, PATCH, axios } = cds.test(__dirname + '/..');
const S = '/odata/v4/despacho';
const como = (usuario) => ({ auth: { username: usuario, password: usuario } });
const borrador = (id) => `${S}/Pedidos(ID=${id},IsActiveEntity=false)`;
const activo = (id) => `${S}/Pedidos(ID=${id},IsActiveEntity=true)`;

let cliente, arroz, aceite;

async function crearPedido(items, usuario = 'vendedor') {
  const { data: ped, status } = await POST(`${S}/Pedidos`, { cliente_ID: cliente.ID }, como(usuario));
  assert.equal(status, 201, JSON.stringify(ped));
  for (const [producto, cantidad] of items) {
    const r = await POST(`${borrador(ped.ID)}/items`, { producto_ID: producto.ID, cantidad }, como(usuario));
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  return ped;
}

describe('Despacho', () => {
  // Dentro del describe: corre después de que cds.test levantó el servidor
  before(async () => {
    axios.defaults.validateStatus = () => true;   // revisamos los códigos a mano
    const { data: c } = await GET(`${S}/Clientes?$top=1`, como('vendedor'));
    cliente = c.value[0];
    const { data: p } = await GET(`${S}/Productos?$filter=codigo eq 'ABA-001' or codigo eq 'ABA-003'`, como('vendedor'));
    arroz = p.value.find((x) => x.codigo === 'ABA-001');
    aceite = p.value.find((x) => x.codigo === 'ABA-003');
  });

  test('sin usuario no se puede entrar', async () => {
    const r = await GET(`${S}/Pedidos`);
    assert.equal(r.status, 401);
  });

  test('el semáforo de stock marca agotados y bajo mínimo', async () => {
    const { data } = await GET(`${S}/Productos?$select=codigo,stock,stockMinimo,criticidadStock`, como('almacen'));
    const porCodigo = Object.fromEntries(data.value.map((p) => [p.codigo, p.criticidadStock]));
    assert.equal(porCodigo['ABA-006'], 1);  // lentejas: 0 unidades
    assert.equal(porCodigo['ABA-003'], 2);  // aceite: 8 de mínimo 40
    assert.equal(porCodigo['ABA-001'], 3);  // arroz: 120
  });

  test('el borrador calcula precio, importe, subtotal, IGV y total', async () => {
    const ped = await crearPedido([[arroz, 2]]);
    assert.match(ped.numero, /^PV-\d{4}$/, 'tiene número correlativo');
    const { data: d } = await GET(`${borrador(ped.ID)}?$expand=items`, como('vendedor'));
    assert.equal(Number(d.items[0].precio), Number(arroz.precio));
    assert.equal(Number(d.subtotal), Number(arroz.precio) * 2);
    assert.equal(Number(d.igv), Math.round(Number(arroz.precio) * 2 * 0.18 * 100) / 100);
    // Cambiar la cantidad recalcula todo
    await PATCH(`${S}/PedidoItems(ID=${d.items[0].ID},IsActiveEntity=false)`, { cantidad: 5 }, como('vendedor'));
    const { data: d2 } = await GET(borrador(ped.ID), como('vendedor'));
    assert.equal(Number(d2.subtotal), Math.round(Number(arroz.precio) * 5 * 100) / 100);
  });

  test('flujo completo: guardar, confirmar (reserva stock), despachar y entregar', async () => {
    const ped = await crearPedido([[arroz, 3]]);
    let r = await POST(`${borrador(ped.ID)}/DespachoService.draftActivate`, {}, como('vendedor'));
    assert.equal(r.status, 201, JSON.stringify(r.data));

    const antes = (await GET(`${S}/Productos(ID=${arroz.ID})`, como('vendedor'))).data.stock;
    r = await POST(`${activo(ped.ID)}/DespachoService.confirmar`, {}, como('vendedor'));
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.estado_code, 'C');
    const despues = (await GET(`${S}/Productos(ID=${arroz.ID})`, como('vendedor'))).data.stock;
    assert.equal(despues, antes - 3);

    // El vendedor no despacha: eso es del almacén
    r = await POST(`${activo(ped.ID)}/DespachoService.despachar`, {}, como('vendedor'));
    assert.equal(r.status, 403);
    r = await POST(`${activo(ped.ID)}/DespachoService.despachar`, {}, como('almacen'));
    assert.equal(r.data.estado_code, 'D');
    r = await POST(`${activo(ped.ID)}/DespachoService.entregar`, {}, como('almacen'));
    assert.equal(r.data.estado_code, 'E');

    // Un pedido entregado ya no se edita ni se anula
    r = await POST(`${activo(ped.ID)}/DespachoService.draftEdit`, { PreserveChanges: true }, como('vendedor'));
    assert.equal(r.status, 409);
    r = await POST(`${activo(ped.ID)}/DespachoService.anular`, { motivo: 'prueba' }, como('vendedor'));
    assert.equal(r.status, 409);
  });

  test('no confirma si falta stock y no toca el stock de ningún producto', async () => {
    const ped = await crearPedido([[arroz, 1], [aceite, 500]]);
    await POST(`${borrador(ped.ID)}/DespachoService.draftActivate`, {}, como('vendedor'));
    const stockArroz = (await GET(`${S}/Productos(ID=${arroz.ID})`, como('vendedor'))).data.stock;
    const r = await POST(`${activo(ped.ID)}/DespachoService.confirmar`, {}, como('vendedor'));
    assert.equal(r.status, 409);
    assert.match(r.data.error.message, /No hay stock suficiente de "Aceite vegetal 1 L"/);
    assert.equal((await GET(`${S}/Productos(ID=${arroz.ID})`, como('vendedor'))).data.stock, stockArroz, 'la reserva del arroz se deshizo');
  });

  test('anular un pedido confirmado devuelve el stock', async () => {
    const ped = await crearPedido([[arroz, 4]]);
    await POST(`${borrador(ped.ID)}/DespachoService.draftActivate`, {}, como('vendedor'));
    const inicial = (await GET(`${S}/Productos(ID=${arroz.ID})`, como('vendedor'))).data.stock;
    await POST(`${activo(ped.ID)}/DespachoService.confirmar`, {}, como('vendedor'));
    const r = await POST(`${activo(ped.ID)}/DespachoService.anular`, { motivo: 'El cliente cerró la bodega hoy' }, como('vendedor'));
    assert.equal(r.data.estado_code, 'A');
    assert.equal(r.data.motivoAnulacion, 'El cliente cerró la bodega hoy');
    assert.equal((await GET(`${S}/Productos(ID=${arroz.ID})`, como('vendedor'))).data.stock, inicial);
  });

  test('no deja guardar un pedido sin productos', async () => {
    const { data: ped } = await POST(`${S}/Pedidos`, { cliente_ID: cliente.ID }, como('vendedor'));
    const r = await POST(`${borrador(ped.ID)}/DespachoService.draftActivate`, {}, como('vendedor'));
    assert.equal(r.status, 400);
  });

  test('el resumen del panel responde con números', async () => {
    const { data } = await GET(`${S}/resumen()`, como('admin'));
    assert.equal(typeof data.porDespachar, 'number');
    assert.ok(data.productosBajoStock >= 3);
  });
});
