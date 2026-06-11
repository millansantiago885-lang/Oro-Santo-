// ============================================================
//  ORO SANTO — Servidor Backend
//  Ejecutar: node server.js
//  Puerto: 3000
// ============================================================

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT    = 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUB_DIR = path.join(__dirname, 'public');

// ── Contraseña admin (cámbiala aquí) ──────────────────────
const ADMIN_PASS = 'admin123';

// ── Leer/escribir base de datos ────────────────────────────
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { config:{name:'ORO SANTO',wa:'',msg:'',banner:''}, categories:[], products:[] }; }
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ── MIME types ─────────────────────────────────────────────
const MIME = {
  '.html':'text/html; charset=utf-8',
  '.js'  :'application/javascript',
  '.css' :'text/css',
  '.json':'application/json',
  '.png' :'image/png',
  '.jpg' :'image/jpeg',
  '.ico' :'image/x-icon',
  '.svg' :'image/svg+xml'
};

// ── Helpers HTTP ───────────────────────────────────────────
function json(res, data, status=200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

// ── Servir archivos estáticos ──────────────────────────────
function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type':mime});
    res.end(data);
  });
}

// ── Servidor ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type,Authorization'
    });
    res.end(); return;
  }

  // ── API ────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {

    // LOGIN
    if (pathname === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.pass === ADMIN_PASS) {
        json(res, { ok: true, token: Buffer.from(ADMIN_PASS).toString('base64') });
      } else {
        json(res, { ok: false, msg: 'Contraseña incorrecta' }, 401);
      }
      return;
    }

    // Verificar token en endpoints protegidos
    const token  = (req.headers['authorization'] || '').replace('Bearer ','');
    const isAuth = token === Buffer.from(ADMIN_PASS).toString('base64');

    // GET /api/catalog  — público, la web lo usa
    if (pathname === '/api/catalog' && req.method === 'GET') {
      const db = readDB();
      json(res, { config: db.config, categories: db.categories, products: db.products });
      return;
    }

    // ── Rutas protegidas ──────────────────────────────────
    if (!isAuth) { json(res, { ok:false, msg:'No autorizado' }, 401); return; }

    // GET /api/products
    if (pathname === '/api/products' && req.method === 'GET') {
      const db = readDB();
      json(res, db.products);
      return;
    }

    // POST /api/products — crear producto
    if (pathname === '/api/products' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.name || !body.price || !body.cat) {
        json(res, { ok:false, msg:'Nombre, precio y categoría son obligatorios' }, 400); return;
      }
      const db = readDB();
      const product = {
        id       : Date.now().toString(),
        name     : body.name.trim(),
        cat      : body.cat,
        ref      : body.ref  || '',
        price    : parseFloat(body.price),
        oldPrice : body.oldPrice ? parseFloat(body.oldPrice) : null,
        desc     : body.desc  || null,
        badge    : body.badge || null,
        img      : body.img   || null,
        createdAt: new Date().toISOString()
      };
      db.products.unshift(product);
      writeDB(db);
      json(res, { ok:true, product });
      return;
    }

    // PUT /api/products/:id — editar producto
    const editMatch = pathname.match(/^\/api\/products\/(.+)$/);
    if (editMatch && req.method === 'PUT') {
      const id   = editMatch[1];
      const body = await readBody(req);
      const db   = readDB();
      const idx  = db.products.findIndex(p => p.id === id);
      if (idx < 0) { json(res, { ok:false, msg:'Producto no encontrado' }, 404); return; }
      const p = db.products[idx];
      db.products[idx] = {
        ...p,
        name     : body.name     !== undefined ? body.name.trim()            : p.name,
        cat      : body.cat      !== undefined ? body.cat                    : p.cat,
        ref      : body.ref      !== undefined ? body.ref                    : p.ref,
        price    : body.price    !== undefined ? parseFloat(body.price)      : p.price,
        oldPrice : body.oldPrice !== undefined ? (body.oldPrice ? parseFloat(body.oldPrice) : null) : p.oldPrice,
        desc     : body.desc     !== undefined ? body.desc                   : p.desc,
        badge    : body.badge    !== undefined ? body.badge                  : p.badge,
        img      : body.img      !== undefined ? body.img                    : p.img,
        updatedAt: new Date().toISOString()
      };
      writeDB(db);
      json(res, { ok:true, product: db.products[idx] });
      return;
    }

    // DELETE /api/products/:id
    if (editMatch && req.method === 'DELETE') {
      const id = editMatch[1];
      const db = readDB();
      const before = db.products.length;
      db.products = db.products.filter(p => p.id !== id);
      if (db.products.length === before) { json(res, { ok:false, msg:'No encontrado' }, 404); return; }
      writeDB(db);
      json(res, { ok:true });
      return;
    }

    // GET /api/categories
    if (pathname === '/api/categories' && req.method === 'GET') {
      const db = readDB();
      json(res, db.categories);
      return;
    }

    // POST /api/categories
    if (pathname === '/api/categories' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.name) { json(res, { ok:false, msg:'Nombre requerido' }, 400); return; }
      const db = readDB();
      if (db.categories.includes(body.name)) { json(res, { ok:false, msg:'Ya existe' }, 409); return; }
      db.categories.push(body.name.trim());
      writeDB(db);
      json(res, { ok:true, categories: db.categories });
      return;
    }

    // DELETE /api/categories/:name
    const catMatch = pathname.match(/^\/api\/categories\/(.+)$/);
    if (catMatch && req.method === 'DELETE') {
      const name = decodeURIComponent(catMatch[1]);
      const db   = readDB();
      db.categories = db.categories.filter(c => c !== name);
      db.products.forEach(p => { if (p.cat === name) p.cat = 'Sin categoría'; });
      if (!db.categories.includes('Sin categoría') && db.products.some(p => p.cat === 'Sin categoría'))
        db.categories.push('Sin categoría');
      writeDB(db);
      json(res, { ok:true, categories: db.categories });
      return;
    }

    // PUT /api/config
    if (pathname === '/api/config' && req.method === 'PUT') {
      const body = await readBody(req);
      const db   = readDB();
      db.config = { ...db.config, ...body };
      writeDB(db);
      json(res, { ok:true, config: db.config });
      return;
    }

    json(res, { ok:false, msg:'Ruta no encontrada' }, 404);
    return;
  }

  // ── Archivos estáticos ─────────────────────────────────
  let filePath = path.join(PUB_DIR, pathname === '/' ? 'index.html' : pathname);
  // Seguridad: no salir del directorio público
  if (!filePath.startsWith(PUB_DIR)) { res.writeHead(403); res.end(); return; }
  // Si no tiene extensión → intentar .html
  if (!path.extname(filePath)) filePath += '.html';
  serveStatic(res, filePath);
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   ORO SANTO — Servidor corriendo         ║
║   Web pública:  http://localhost:${PORT}    ║
║   Admin:        http://localhost:${PORT}/admin ║
║   Contraseña:   ${ADMIN_PASS}                  ║
╚══════════════════════════════════════════╝
  `);
});
