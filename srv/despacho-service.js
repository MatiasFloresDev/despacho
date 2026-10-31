// Lógica de negocio de Despacho. En CAP los "handlers" se enganchan a eventos del servicio:
// before (validar), on (hacer el trabajo) y after (completar la respuesta).
const cds = require('@sap/cds');

const IGV = 0.18;
const redondear = (n) => Math.round(n * 100) / 100;

module.exports = class DespachoService extends cds.ApplicationService {
  init() {
    const { Pedidos, PedidoItems, Productos } = this.entities;
    const { Productos: ProductosDB, Pedidos: PedidosDB } = cds.entities('despacho');

    // ---------- Productos: semáforo de stock calculado al leer ----------
    this.after('READ', [Productos, Productos.drafts], (filas) => {
      for (const p of [].concat(filas ?? [])) {
        if (p.stock === undefined) continue;
        p.criticidadStock = p.stock <= 0 ? 1 : p.stock <= (p.stockMinimo ?? 10) ? 2 : 3;
      }
    });

    // ---------- Pedidos: solo los Nuevos se editan o borran ----------
    this.after('READ', [Pedidos, Pedidos.drafts], (filas) => {
      for (const p of [].concat(filas ?? [])) if (p.estado_code !== undefined) p.bloqueado = p.estado_code !== 'N';
    });
    this.before('EDIT', Pedidos, async (req) => {
      const p = await SELECT.one.from(PedidosDB, req.params[0]?.ID ?? req.params[0]).columns('numero', 'estado_code');
      if (p && p.estado_code !== 'N') req.reject(409, `El pedido ${p.numero} ya no está en estado Nuevo: no se puede editar.`);
    });
    this.before('DELETE', Pedidos, async (req) => {
      const p = await SELECT.one.from(PedidosDB, req.params[0]?.ID ?? req.params[0]).columns('numero', 'estado_code');
      if (p && !['N', 'A'].includes(p.estado_code)) req.reject(409, `El pedido ${p.numero} ya tiene stock reservado o salió del almacén: anúlalo en vez de borrarlo.`);
    });

    // ---------- Pedidos: número correlativo al crear el borrador ----------
    this.before('NEW', Pedidos.drafts, async (req) => {
      const usados = [...await SELECT.from(PedidosDB).columns('numero'), ...await SELECT.from(Pedidos.drafts).columns('numero')];
      const max = Math.max(1000, ...usados.map((p) => Number(String(p.numero ?? '').replace(/\D/g, '')) || 0));
      req.data.numero = `PV-${max + 1}`;
      req.data.estado_code = 'N';
    });

    // ---------- Ítems: al elegir producto o cantidad, se copia el precio y se recalcula el importe ----------
    const completarItem = async (item) => {
      if (item.producto_ID) {
        const prod = await SELECT.one.from(ProductosDB, item.producto_ID).columns('precio');
        if (prod) item.precio = prod.precio;
      }
      if (item.precio != null && item.cantidad != null) item.importe = redondear(item.precio * item.cantidad);
    };
    const recalcularBorrador = async (pedidoID) => {
      const items = await SELECT.from(PedidoItems.drafts).where({ pedido_ID: pedidoID }).columns('importe');
      const subtotal = redondear(items.reduce((s, i) => s + Number(i.importe ?? 0), 0));
      const igv = redondear(subtotal * IGV);
      await UPDATE(Pedidos.drafts, pedidoID).with({ subtotal, igv, total: redondear(subtotal + igv) });
    };
    this.after(['NEW', 'PATCH'], PedidoItems.drafts, async (_, req) => {
      const item = await SELECT.one.from(PedidoItems.drafts, req.data.ID ?? req.params.at(-1)?.ID ?? req.params.at(-1));
      if (!item) return;
      await completarItem(item);
      await UPDATE(PedidoItems.drafts, item.ID).with({ precio: item.precio, importe: item.importe });
      await recalcularBorrador(item.pedido_ID);
    });
    this.after('DISCARD', PedidoItems.drafts, async (_, req) => {
      const pedidoID = req.params[0]?.ID ?? req.params[0];
      if (pedidoID) await recalcularBorrador(pedidoID);
    });

    // ---------- Guardar: validaciones finales y totales con precios del catálogo ----------
    this.before(['CREATE', 'UPDATE'], Pedidos, async (req) => {
      const p = req.data;
      if (p.estado_code && p.estado_code !== 'N' && req.event === 'UPDATE') {
        const actual = await SELECT.one.from(PedidosDB, p.ID).columns('estado_code');
        if (actual && actual.estado_code !== 'N') return req.reject(409, 'Solo se pueden editar pedidos en estado Nuevo.');
      }
      if (!p.items) return;
      if (!p.items.length) return req.error(400, 'Agrega al menos un producto al pedido.', 'items');
      const vistos = new Set();
      for (const [i, item] of p.items.entries()) {
        if (!item.producto_ID) { req.error(400, 'Elige un producto.', `items[${i}]/producto_ID`); continue; }
        if (vistos.has(item.producto_ID)) req.error(400, 'Este producto ya está en el pedido: suma la cantidad en una sola línea.', `items[${i}]/producto_ID`);
        vistos.add(item.producto_ID);
        await completarItem(item);
      }
      const subtotal = redondear(p.items.reduce((s, i) => s + Number(i.importe ?? 0), 0));
      p.subtotal = subtotal; p.igv = redondear(subtotal * IGV); p.total = redondear(subtotal + p.igv); p.moneda = 'PEN';
    });

    // ---------- Acciones del flujo: Nuevo → Confirmado → Despachado → Entregado ----------
    const leerPedido = async (req) => {
      const ID = req.params[0]?.ID ?? req.params[0];
      const pedido = await SELECT.one.from(PedidosDB, ID).columns((p) => { p.ID, p.numero, p.estado_code, p.items((i) => { i.cantidad, i.producto_ID, i.producto((x) => { x.nombre, x.stock }) }) });
      if (!pedido) req.reject(404, 'No encontré ese pedido.');
      return pedido;
    };
    const cambiarEstado = async (req, desde, hacia, extra = {}) => {
      const pedido = await leerPedido(req);
      if (!desde.includes(pedido.estado_code)) {
        const nombres = { N: 'Nuevo', C: 'Confirmado', D: 'Despachado', E: 'Entregado', A: 'Anulado' };
        return req.reject(409, `El pedido ${pedido.numero} está ${nombres[pedido.estado_code]}: no se puede pasar a ${nombres[hacia]}.`);
      }
      await UPDATE(PedidosDB, pedido.ID).with({ estado_code: hacia, ...extra });
      return pedido;
    };

    this.on('confirmar', Pedidos, async (req) => {
      const pedido = await leerPedido(req);
      if (pedido.estado_code !== 'N') return req.reject(409, `El pedido ${pedido.numero} ya no está en estado Nuevo.`);
      // Reservar stock de todo el pedido o de nada (la acción corre en una transacción)
      for (const item of pedido.items) {
        const filas = await UPDATE(ProductosDB, item.producto_ID).with({ stock: { '-=': item.cantidad } }).where({ stock: { '>=': item.cantidad } });
        if (!filas) return req.reject(409, `No hay stock suficiente de "${item.producto.nombre}": quedan ${item.producto.stock} y el pedido pide ${item.cantidad}.`);
      }
      await UPDATE(PedidosDB, pedido.ID).with({ estado_code: 'C' });
      req.info(`Pedido ${pedido.numero} confirmado: el stock quedó reservado.`);
      return SELECT.one.from(Pedidos, pedido.ID);
    });

    this.on('despachar', Pedidos, async (req) => {
      const p = await cambiarEstado(req, ['C'], 'D');
      req.info(`Pedido ${p.numero} despachado.`);
      return SELECT.one.from(Pedidos, p.ID);
    });

    this.on('entregar', Pedidos, async (req) => {
      const p = await cambiarEstado(req, ['D'], 'E');
      req.info(`Pedido ${p.numero} entregado.`);
      return SELECT.one.from(Pedidos, p.ID);
    });

    this.on('anular', Pedidos, async (req) => {
      const pedido = await leerPedido(req);
      if (!['N', 'C'].includes(pedido.estado_code)) return req.reject(409, `El pedido ${pedido.numero} ya salió del almacén: no se puede anular.`);
      if (pedido.estado_code === 'C') {
        // Si ya estaba confirmado, el stock reservado vuelve al almacén
        for (const item of pedido.items) await UPDATE(ProductosDB, item.producto_ID).with({ stock: { '+=': item.cantidad } });
      }
      await UPDATE(PedidosDB, pedido.ID).with({ estado_code: 'A', motivoAnulacion: req.data.motivo });
      req.info(`Pedido ${pedido.numero} anulado.`);
      return SELECT.one.from(Pedidos, pedido.ID);
    });

    // ---------- Panel ----------
    this.on('resumen', async () => {
      const hoy = new Date().toISOString().slice(0, 10), mes = hoy.slice(0, 7);
      const [{ n: pedidosHoy }] = await SELECT`count(*) as n`.from(PedidosDB).where({ fecha: hoy });
      const [{ n: porDespachar }] = await SELECT`count(*) as n`.from(PedidosDB).where({ estado_code: 'C' });
      const [{ t: ventasMes }] = await SELECT`sum(total) as t`.from(PedidosDB).where`estado_code in ('C','D','E') and fecha like ${mes + '%'}`;
      const [{ n: productosBajoStock }] = await SELECT`count(*) as n`.from(ProductosDB).where`stock <= stockMinimo`;
      return { pedidosHoy, porDespachar, ventasMes: redondear(Number(ventasMes ?? 0)), productosBajoStock };
    });

    return super.init();
  }
};
