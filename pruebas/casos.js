/* Banco de casos de firma con VERDAD CONOCIDA.
   Cada caso se pinta en dos capas: la tinta de la firma sola (la verdad) y la
   escena completa (papel, cuadricula, texto impreso, sello, sombras). Asi se
   mide exactamente cuanta firma se conserva y cuanto fondo se cuela, que es
   justo lo que no se puede saber con una foto real.

   Los casos salen de fallos REALES observados, no de imaginacion: trazo fino
   que el filtro de cuadricula partia, lazos separados que el agrupador no unia,
   firma dentro de una casilla impresa, sombra fuerte junto al trazo.          */
const CASOS = (() => {
  const rnd = (s) => { let t = s >>> 0;
    return () => { t = (t + 0x6D2B79F5) | 0; let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };

  /* Firma de trazo continuo. 'sueltos' separa los bucles para reproducir las
     firmas de lazos amplios que el agrupador partia en varias manchas.        */
  function garabato(cx, x0, y0, w, h, color, grosor, semilla, sueltos) {
    const R = rnd(semilla);
    cx.strokeStyle = color; cx.lineWidth = grosor; cx.lineCap = 'round'; cx.lineJoin = 'round';
    const trazos = sueltos ? 4 : 3;
    for (let t = 0; t < trazos; t++) {
      cx.beginPath();
      const sep = sueltos ? (t / trazos) * w * 0.5 : 0;
      let x = x0 + sep + w * (0.05 + 0.15 * R()), y = y0 + h * (0.7 + 0.2 * R());
      cx.moveTo(x, y);
      for (let i = 0; i < 4; i++) {
        const cx1 = x0 + sep + w * 0.5 * R(), cy1 = y0 + h * R();
        const cx2 = x0 + sep + w * 0.5 * R(), cy2 = y0 + h * R();
        const nx = x0 + sep + w * (0.1 + 0.4 * R()), ny = y0 + h * (0.15 + 0.7 * R());
        cx.bezierCurveTo(cx1, cy1, cx2, cy2, nx, ny); x = nx; y = ny;
      }
      cx.stroke();
    }
    if (!sueltos) {                                   // la rubrica de debajo
      cx.beginPath(); cx.moveTo(x0 + w * 0.05, y0 + h * 0.88);
      cx.bezierCurveTo(x0 + w * 0.4, y0 + h * 0.7, x0 + w * 0.7, y0 + h * 1.0, x0 + w * 0.95, y0 + h * 0.78);
      cx.stroke();
    }
  }

  function sello(cx, x, y, w, h, color) {
    cx.save(); cx.translate(x, y); cx.rotate(-0.12);
    cx.strokeStyle = color; cx.fillStyle = color;
    cx.lineWidth = Math.max(2, h * 0.05);
    cx.font = 'bold ' + Math.round(h * 0.30) + 'px sans-serif';
    cx.fillText('PSICOLOGA', w * 0.22, h * 0.55);
    cx.font = 'italic ' + Math.round(h * 0.20) + 'px serif';
    cx.fillText('Mgs. Ingrid Camacho V.', w * 0.10, h * 0.24);
    cx.beginPath(); cx.moveTo(w * 0.18, h * 0.72); cx.lineTo(w * 0.95, h * 0.62); cx.stroke();
    cx.restore();
  }

  function cuadricula(cx, W, H, paso, color) {
    cx.strokeStyle = color; cx.lineWidth = 1;
    for (let x = 0; x < W; x += paso) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
    for (let y = 0; y < H; y += paso) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
  }
  function rayas(cx, W, H, paso, color) {
    cx.strokeStyle = color; cx.lineWidth = 1;
    for (let y = paso; y < H; y += paso) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
  }
  function impreso(cx, W, H, color) {
    cx.fillStyle = color; cx.font = 'bold 21px sans-serif';
    cx.fillText('prohibidos de acuerdo a los', 14, 40);
    cx.fillText('Codigo Aeronautico Boliviano', 14, H - 26);
  }

  const DEFS = [
    // ── los seis originales ──────────────────────────────────────────────
    { id: 'azul-limpia', nombre: 'Azul sobre papel blanco', dificil: false,
      pinta(e, t, W, H) {
        e.fillStyle = '#fbfbf8'; e.fillRect(0, 0, W, H);
        garabato(e, W * .15, H * .2, W * .7, H * .55, '#1f3f8a', 5, 11);
        garabato(t, W * .15, H * .2, W * .7, H * .55, '#1f3f8a', 5, 11);
      } },
    { id: 'verde-sello', nombre: 'Verde + sello azul, cuaderno amarillo', dificil: false,
      pinta(e, t, W, H) {
        e.fillStyle = '#efe9b8'; e.fillRect(0, 0, W, H);
        cuadricula(e, W, H, 26, '#cfc98f');
        garabato(e, W * .10, H * .05, W * .55, H * .5, 'rgba(24,110,58,0.92)', 5, 22);
        garabato(t, W * .10, H * .05, W * .55, H * .5, 'rgba(24,110,58,0.92)', 5, 22);
        sello(e, W * .30, H * .48, W * .62, H * .38, 'rgba(22,38,110,0.95)');
        sello(t, W * .30, H * .48, W * .62, H * .38, 'rgba(22,38,110,0.95)');
      } },
    { id: 'roja-impreso', nombre: 'Roja sobre texto impreso y rayas', dificil: false,
      pinta(e, t, W, H) {
        e.fillStyle = '#f4f2ea'; e.fillRect(0, 0, W, H);
        rayas(e, W, H, 30, '#b9bec9'); impreso(e, W, H, '#111318');
        e.strokeStyle = '#111318'; e.lineWidth = 2; e.strokeRect(W * .55, 12, W * .4, H * .3);
        garabato(e, W * .12, H * .25, W * .7, H * .5, 'rgba(150,32,40,0.9)', 4, 33);
        garabato(t, W * .12, H * .25, W * .7, H * .5, 'rgba(150,32,40,0.9)', 4, 33);
      } },
    { id: 'lapiz-cuadricula', nombre: 'Lapiz gris sobre cuadricula gris', dificil: false,
      pinta(e, t, W, H) {
        e.fillStyle = '#fcfcfa'; e.fillRect(0, 0, W, H);
        cuadricula(e, W, H, 24, '#d3d7dc');
        garabato(e, W * .12, H * .18, W * .72, H * .6, 'rgba(60,62,68,0.88)', 4, 44);
        garabato(t, W * .12, H * .18, W * .72, H * .6, 'rgba(60,62,68,0.88)', 4, 44);
      } },
    { id: 'negra-sombra', nombre: 'Negra con sombra fuerte', dificil: false,
      pinta(e, t, W, H) {
        e.fillStyle = '#f7f6f2'; e.fillRect(0, 0, W, H);
        const g = e.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(0.55, 'rgba(0,0,0,0)');
        e.fillStyle = g; e.fillRect(0, 0, W, H);
        garabato(e, W * .18, H * .2, W * .66, H * .55, 'rgba(18,18,22,0.9)', 5, 55);
        garabato(t, W * .18, H * .2, W * .66, H * .55, 'rgba(18,18,22,0.9)', 5, 55);
      } },
    { id: 'azul-formulario', nombre: 'Azul sobre formulario con recuadros', dificil: true,
      pinta(e, t, W, H) {
        e.fillStyle = '#fbfaf6'; e.fillRect(0, 0, W, H);
        e.strokeStyle = '#2a3f7a'; e.lineWidth = 2;
        e.strokeRect(10, 10, W - 20, H * .42); e.strokeRect(10, H * .5, W - 20, H * .44);
        e.fillStyle = '#20242c'; e.font = 'bold 18px sans-serif';
        e.fillText('NOMBRE:', 22, 38); e.fillText('FIRMA:', 22, H * .58);
        garabato(e, W * .2, H * .55, W * .6, H * .36, 'rgba(30,52,140,0.92)', 4, 66);
        garabato(t, W * .2, H * .55, W * .6, H * .36, 'rgba(30,52,140,0.92)', 4, 66);
      } },

    // ── los dificiles, sacados de fallos reales ──────────────────────────
    { id: 'roja-fina-lazos', nombre: 'Roja de punta fina, lazos separados', dificil: true,
      pinta(e, t, W, H) {                    // el caso exacto del usuario
        e.fillStyle = '#f6f4ee'; e.fillRect(0, 0, W, H);
        rayas(e, W, H, 34, '#c4cad4'); impreso(e, W, H, '#15171c');
        garabato(e, W * .08, H * .12, W * .84, H * .76, 'rgba(178,30,38,0.88)', 2, 77, true);
        garabato(t, W * .08, H * .12, W * .84, H * .76, 'rgba(178,30,38,0.88)', 2, 77, true);
      } },
    { id: 'bajo-contraste', nombre: 'Azul claro casi del color del papel', dificil: true,
      pinta(e, t, W, H) {
        e.fillStyle = '#e8eaf0'; e.fillRect(0, 0, W, H);
        garabato(e, W * .15, H * .2, W * .7, H * .55, 'rgba(120,138,180,0.75)', 4, 88);
        garabato(t, W * .15, H * .2, W * .7, H * .55, 'rgba(120,138,180,0.75)', 4, 88);
      } },
    { id: 'firma-pequena', nombre: 'Firma pequena con mucho fondo', dificil: true,
      pinta(e, t, W, H) {
        e.fillStyle = '#fbfaf7'; e.fillRect(0, 0, W, H);
        cuadricula(e, W, H, 22, '#dfe2e7');
        e.fillStyle = '#1b1d22'; e.font = 'bold 16px sans-serif';
        e.fillText('Tema:', 16, 26); e.fillText('Fecha:', 16, 48); e.fillText('N.:', W - 70, 26);
        garabato(e, W * .55, H * .62, W * .3, H * .22, 'rgba(28,44,120,0.9)', 3, 99);
        garabato(t, W * .55, H * .62, W * .3, H * .22, 'rgba(28,44,120,0.9)', 3, 99);
      } },
    { id: 'sello-encima', nombre: 'Sello superpuesto a la firma', dificil: true,
      pinta(e, t, W, H) {
        e.fillStyle = '#f7f5ec'; e.fillRect(0, 0, W, H);
        cuadricula(e, W, H, 25, '#dcd8bf');
        garabato(e, W * .12, H * .18, W * .62, H * .5, 'rgba(20,90,52,0.9)', 4, 111);
        garabato(t, W * .12, H * .18, W * .62, H * .5, 'rgba(20,90,52,0.9)', 4, 111);
        sello(e, W * .18, H * .30, W * .68, H * .40, 'rgba(28,40,120,0.85)');
        sello(t, W * .18, H * .30, W * .68, H * .40, 'rgba(28,40,120,0.85)');
      } },
    { id: 'brillo-flash', nombre: 'Reflejo de flash sobre el papel', dificil: true,
      pinta(e, t, W, H) {
        e.fillStyle = '#f9f8f4'; e.fillRect(0, 0, W, H);
        rayas(e, W, H, 28, '#ccd1da');
        garabato(e, W * .14, H * .2, W * .7, H * .55, 'rgba(26,44,130,0.9)', 4, 122);
        garabato(t, W * .14, H * .2, W * .7, H * .55, 'rgba(26,44,130,0.9)', 4, 122);
        const g = e.createRadialGradient(W * .68, H * .34, 6, W * .68, H * .34, Math.min(W, H) * .40);
        g.addColorStop(0, 'rgba(255,255,255,0.96)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        e.fillStyle = g; e.fillRect(0, 0, W, H);          // el flash borra parte del trazo
      } },
    { id: 'fondo-oscuro', nombre: 'Cuaderno sobre mesa oscura', dificil: true,
      pinta(e, t, W, H) {
        e.fillStyle = '#17181c'; e.fillRect(0, 0, W, H);   // la mesa
        e.fillStyle = '#f8f7f2'; e.fillRect(W * .12, H * .10, W * .76, H * .74);  // la hoja
        e.strokeStyle = '#d6dae1'; e.lineWidth = 1;
        for (let y = H * .16; y < H * .84; y += 26) { e.beginPath(); e.moveTo(W * .12, y); e.lineTo(W * .88, y); e.stroke(); }
        garabato(e, W * .2, H * .26, W * .58, H * .44, 'rgba(24,38,120,0.9)', 4, 133);
        garabato(t, W * .2, H * .26, W * .58, H * .44, 'rgba(24,38,120,0.9)', 4, 133);
      } },
    { id: 'dos-firmas', nombre: 'Dos firmas: debe quedarse con una', dificil: true,
      pinta(e, t, W, H) {
        e.fillStyle = '#fbfaf6'; e.fillRect(0, 0, W, H);
        rayas(e, W, H, 30, '#ccd2db');
        garabato(e, W * .08, H * .08, W * .40, H * .34, 'rgba(30,48,130,0.9)', 4, 144);
        // la verdad es SOLO la principal, la grande de abajo
        garabato(e, W * .16, H * .48, W * .70, H * .44, 'rgba(30,48,130,0.9)', 5, 155);
        garabato(t, W * .16, H * .48, W * .70, H * .44, 'rgba(30,48,130,0.9)', 5, 155);
      } },
    { id: 'papel-arrugado', nombre: 'Papel arrugado con pliegues', dificil: true,
      pinta(e, t, W, H) {
        e.fillStyle = '#f8f6f0'; e.fillRect(0, 0, W, H);
        const R = rnd(166);                              // pliegues como bandas de sombra
        for (let i = 0; i < 7; i++) {
          const x = R() * W, an = 18 + R() * 46;
          const g = e.createLinearGradient(x, 0, x + an, H);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.20)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          e.fillStyle = g; e.fillRect(x, 0, an, H);
        }
        garabato(e, W * .14, H * .22, W * .7, H * .54, 'rgba(22,30,110,0.9)', 4, 177);
        garabato(t, W * .14, H * .22, W * .7, H * .54, 'rgba(22,30,110,0.9)', 4, 177);
      } },
    { id: 'invisible-cuadricula', nombre: 'Firma IGUAL de tenue que la cuadricula', dificil: true,
      pinta(e, t, W, H) {
        /* El caso limite: misma intensidad y mismo color que la cuadricula.
           Ni la oscuridad ni el tono los separan. Lo unico que queda es que
           la cuadricula es PERIODICA y recta, y la firma no.               */
        e.fillStyle = '#fcfcfa'; e.fillRect(0, 0, W, H);
        cuadricula(e, W, H, 24, 'rgba(126,140,164,0.85)');
        garabato(e, W * .14, H * .2, W * .7, H * .56, 'rgba(126,140,164,0.85)', 2, 211);
        garabato(t, W * .14, H * .2, W * .7, H * .56, 'rgba(126,140,164,0.85)', 2, 211);
      } },
    { id: 'invisible-rayas', nombre: 'Firma IGUAL de tenue que las rayas', dificil: true,
      pinta(e, t, W, H) {
        e.fillStyle = '#fbfbf7'; e.fillRect(0, 0, W, H);
        rayas(e, W, H, 30, 'rgba(118,134,158,0.8)');
        garabato(e, W * .12, H * .18, W * .74, H * .6, 'rgba(118,134,158,0.8)', 3, 222);
        garabato(t, W * .12, H * .18, W * .74, H * .6, 'rgba(118,134,158,0.8)', 3, 222);
      } },
    { id: 'boli-gastado', nombre: 'Boligrafo que se queda sin tinta', dificil: true,
      pinta(e, t, W, H) {
        e.fillStyle = '#fcfbf7'; e.fillRect(0, 0, W, H);
        cuadricula(e, W, H, 24, '#dde0e6');
        garabato(e, W * .14, H * .2, W * .7, H * .56, 'rgba(30,40,120,0.9)', 4, 188);
        garabato(t, W * .14, H * .2, W * .7, H * .56, 'rgba(30,40,120,0.9)', 4, 188);
        // huecos de tinta seca: se abren en LAS DOS capas, es parte de la firma
        const R = rnd(199);
        for (const cx2 of [e, t]) {
          cx2.save(); cx2.globalCompositeOperation = 'destination-out';
          const R2 = rnd(199);
          for (let i = 0; i < 40; i++) {
            const r = 3 + R2() * 7;
            cx2.beginPath(); cx2.ellipse(R2() * W, R2() * H, r, r * 0.7, R2() * 3, 0, 7); cx2.fill();
          }
          cx2.restore();
        }
      } }
  ];

  /* Degradaciones de camara. SIN esto los sinteticos son irreales y cualquier
     algoritmo los aprueba: el ruido de compresion sobre gris fue justo lo que
     tumbo un ajuste anterior (39,8% de pixeles "con color" en una foto a
     lapiz, indistinguible de un boligrafo por esa cifra).                    */
  async function degrada(canvas, opt) {
    const W = canvas.width, H = canvas.height;
    const cx = canvas.getContext('2d', { willReadFrequently: true });
    if (opt.perspectiva) {                    // foto tomada de lado, en franjas
      const src = document.createElement('canvas'); src.width = W; src.height = H;
      src.getContext('2d').drawImage(canvas, 0, 0);
      cx.clearRect(0, 0, W, H); cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
      const n = 60;
      for (let i = 0; i < n; i++) {
        const y = i * H / n, k = 1 - opt.perspectiva * (i / n);
        const an = W * k, dx = (W - an) / 2;
        cx.drawImage(src, 0, y, W, H / n, dx, y, an, H / n + 1);
      }
    }
    if (opt.luzDesigual) {
      const g = cx.createRadialGradient(W * 0.35, H * 0.3, Math.min(W, H) * 0.1,
                                        W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
      g.addColorStop(0, 'rgba(255,255,255,0.20)'); g.addColorStop(1, 'rgba(0,0,0,0.30)');
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    }
    if (opt.ruido) {
      /* Ruido SEMBRADO, no aleatorio: con Math.random cada ejecucion daba
         cifras distintas y se acababan comparando diferencias de un punto que
         eran ruido del propio banco, no del algoritmo. */
      const R = rnd(opt.semilla || 4242);
      const im = cx.getImageData(0, 0, W, H), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (R() - 0.5) * opt.ruido;
        d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 1.1;
      }
      cx.putImageData(im, 0, 0);
    }
    if (opt.desenfoque) { cx.filter = 'blur(' + opt.desenfoque + 'px)'; cx.drawImage(canvas, 0, 0); cx.filter = 'none'; }
    if (opt.jpeg) {
      const url = canvas.toDataURL('image/jpeg', opt.jpeg);
      const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
      cx.clearRect(0, 0, W, H); cx.drawImage(img, 0, 0);
    }
    return canvas;
  }

  async function construye(def, deg, W, H) {
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const escena = mk(), tinta = mk();
    const e = escena.getContext('2d', { willReadFrequently: true });
    const t = tinta.getContext('2d', { willReadFrequently: true });
    def.pinta(e, t, W, H);
    if (deg) await degrada(escena, deg);      // la verdad NO se degrada
    return { escena, tinta };
  }

  const DEGRADACIONES = [
    { id: 'nitida', nombre: 'nitida', opt: null },
    { id: 'foto', nombre: 'foto de movil', opt: { luzDesigual: true, ruido: 14, jpeg: 0.72 } },
    { id: 'mala', nombre: 'foto mala', opt: { luzDesigual: true, ruido: 26, desenfoque: 0.6, jpeg: 0.55 } },
    { id: 'angulo', nombre: 'de lado', opt: { perspectiva: 0.28, luzDesigual: true, ruido: 16, jpeg: 0.68 } }
  ];

  return { DEFS, DEGRADACIONES, construye, degrada };
})();
