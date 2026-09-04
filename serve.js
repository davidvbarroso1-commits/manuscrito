/* Servidor estático mínimo para previsualizar Manuscrito. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = 5178;
const TYPES = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  const nets = os.networkInterfaces(); const ips = [];
  for (const n in nets) for (const a of nets[n]) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  console.log('\n  ✍️  Manuscrito está corriendo\n');
  console.log('   En esta PC:   http://localhost:' + PORT);
  ips.forEach(ip => console.log('   En el celu:   http://' + ip + ':' + PORT + '   (mismo Wi-Fi)'));
  console.log('\n  Deja esta ventana abierta mientras lo uses. Ciérrala para apagar el servidor.\n');
});
