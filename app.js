import { createServer } from 'node:http';
import { URL } from 'node:url';

const PORT = process.env.PORT || 3000;
const IGV_RATE = 0.18;

export class BillingService {
  static #calcularDesglose(total) {
    const subtotal = Number((total / (1 + IGV_RATE)).toFixed(2));
    const igv = Number((total - subtotal).toFixed(2));
    return { subtotal, igv, total: Number(total.toFixed(2)) };
  }

  static procesarVenta(tipo, monto) {
    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      throw new Error('El monto debe ser un número mayor a 0.');
    }

    const tipoNorm = String(tipo).toUpperCase();
    const { subtotal, igv, total } = this.#calcularDesglose(montoNum);

    if (tipoNorm === 'BOLETA') {
      return {
        exito: true,
        comprobante: 'BOLETA',
        montoTotal: total.toFixed(2),
        fecha: new Date().toISOString()
      };
    }

    if (tipoNorm === 'FACTURA') {
      return {
        exito: true,
        comprobante: 'FACTURA',
        subtotal: subtotal.toFixed(2),
        igv: igv.toFixed(2),
        montoTotal: total.toFixed(2),
        fecha: new Date().toISOString()
      };
    }

    throw new Error(`Tipo de comprobante no válido: '${tipo}'. Use BOLETA o FACTURA.`);
  }
}

function imprimirTicketCLI(data) {
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const cyan = '\x1b[36m';
  const green = '\x1b[32m';
  const yellow = '\x1b[33m';
  const dim = '\x1b[2m';

  const fechaLocal = new Date(data.fecha).toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  });

  console.log(`\n${cyan}${bold}==========================================${reset}`);
  console.log(`         ${bold}TICKET DE COMPROBANTE${reset}`);
  console.log(`${cyan}==========================================${reset}`);
  console.log(`${dim}Tipo:${reset}         ${yellow}${bold}${data.comprobante}${reset}`);
  console.log(`${dim}Fecha:${reset}        ${fechaLocal}`);
  console.log(`${cyan}------------------------------------------${reset}`);

  if (data.comprobante === 'FACTURA') {
    console.log(`Subtotal:     S/ ${data.subtotal.padStart(8)}`);
    console.log(`IGV (18%):    S/ ${data.igv.padStart(8)}`);
    console.log(`${cyan}------------------------------------------${reset}`);
  }

  console.log(`${bold}MONTO TOTAL:  ${green}S/ ${data.montoTotal.padStart(8)}${reset}`);
  console.log(`${cyan}==========================================${reset}\n`);
}

function ejecutarCLI() {
  const args = process.argv.slice(2);
  const tipoArg = args.find(a => a.startsWith('--tipo='))?.split('=')[1];
  const montoArg = args.find(a => a.startsWith('--monto='))?.split('=')[1];

  if (!tipoArg || !montoArg) return false;

  try {
    const resultado = BillingService.procesarVenta(tipoArg, montoArg);
    imprimirTicketCLI(resultado);
    process.exit(0);
  } catch (error) {
    console.error(`\n\x1b[31m[ERROR CLI]: ${error.message}\x1b[0m\n`);
    process.exit(1);
  }
}

function iniciarServidor() {
  const server = createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const tipo = parsedUrl.searchParams.get('tipo');
    const monto = parsedUrl.searchParams.get('monto');

    if (pathname === '/api/emitir' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        const resultado = BillingService.procesarVenta(tipo, monto);
        res.writeHead(200);
        return res.end(JSON.stringify(resultado, null, 2));
      } catch (error) {
        res.writeHead(400);
        return res.end(JSON.stringify({ exito: false, error: error.message }));
      }
    }

    if (pathname === '/ticket' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      try {
        const data = BillingService.procesarVenta(tipo, monto);
        const fechaLocal = new Date(data.fecha).toLocaleString('es-PE', {
          dateStyle: 'medium',
          timeStyle: 'medium'
        });

        const html = `
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ticket - ${data.comprobante}</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
              .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 28px; width: 340px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
              h2 { text-align: center; margin: 0 0 16px 0; color: #38bdf8; font-size: 1.4rem; letter-spacing: 1px; border-bottom: 2px dashed #334155; padding-bottom: 12px; }
              .row { display: flex; justify-content: space-between; margin: 10px 0; font-size: 0.95rem; }
              .label { color: #94a3b8; }
              .val { font-weight: 600; }
              hr { border: 0; border-top: 1px dashed #334155; margin: 14px 0; }
              .total-row { color: #4ade80; font-size: 1.25rem; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>COMPROBANTE</h2>
              <div class="row"><span class="label">Tipo:</span><span class="val">${data.comprobante}</span></div>
              <div class="row"><span class="label">Fecha:</span><span class="val" style="font-size: 0.85rem;">${fechaLocal}</span></div>
              <hr>
              ${data.comprobante === 'FACTURA' ? `
                <div class="row"><span class="label">Subtotal:</span><span class="val">S/ ${data.subtotal}</span></div>
                <div class="row"><span class="label">IGV (18%):</span><span class="val">S/ ${data.igv}</span></div>
                <hr>
              ` : ''}
              <div class="row total-row"><span>TOTAL:</span><span>S/ ${data.montoTotal}</span></div>
            </div>
          </body>
          </html>
        `;

        res.writeHead(200);
        return res.end(html);
      } catch (error) {
        res.writeHead(400);
        return res.end(`<h2 style="color: #ef4444; font-family: sans-serif; text-align: center; margin-top: 40px;">Error: ${error.message}</h2>`);
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ exito: false, error: 'Ruta no encontrada. Usa /ticket o /api/emitir' }));
  });

  server.listen(PORT, () => {
    console.log(`\n Servidor activo en http://localhost:${PORT}`);
    console.log(` Ticket Web: http://localhost:${PORT}/ticket?tipo=factura&monto=300`);
    console.log(` API REST:   http://localhost:${PORT}/api/emitir?tipo=factura&monto=300\n`);
  });
}

if (!ejecutarCLI()) {
  iniciarServidor();
}
