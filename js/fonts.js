/* fonts.js — biblioteca de tipos de letra (Google Fonts).
   Intenta traer el catálogo completo (cientos de fuentes) y, si no puede,
   usa una lista curada de respaldo. Categoriza en "manuscritas" e "imprenta". */
const FONTS = (() => {

  // respaldo curado + ORDEN DE PRIORIDAD.
  // Enfocado en letra MANUSCRITA REALISTA / DESPROLIJA ("fea") de cuaderno,
  // NO en caligrafía elegante. Las primeras salen arriba por defecto.
  const HAND = [
    // --- cursivas conectadas y desprolijas (más parecidas a una letra real de cuaderno) ---
    'Homemade Apple','Cedarville Cursive','Dawning of a New Day','La Belle Aurore',
    'Reenie Beanie','Give You Glory','Beth Ellen','Nothing You Could Do',
    'Waiting for the Sunrise','Zeyada','Bad Script',
    // --- imprenta a mano / desprolijas ---
    'Shadows Into Light','Gloria Hallelujah','Just Another Hand','Walter Turncoat',
    'Coming Soon','Schoolbell','Gochi Hand','Crafty Girls','Covered By Your Grace',
    'Annie Use Your Telescope','The Girl Next Door','Sue Ellen Francisco',
    'Swanky and Moo Moo','East Sea Dokdo','Gamja Flower','Gaegu','Sunshiney','Stalemate',
    'Short Stack','Chilanka','Mansalva','Neucha','Patrick Hand','Indie Flower',
    'Architects Daughter','Kalam','Shadows Into Light Two','Rock Salt','Permanent Marker',
    'Sriracha','Delius','Itim','Handlee','Caveat','Nanum Pen Script','Over the Rainbow','Calligraffitti',
    // --- elegantes al final (por si alguien las quiere) ---
    'Dancing Script','Pacifico','Satisfy','Cookie','Courgette','Grand Hotel','Lobster',
    'Great Vibes','Allura','Tangerine','Sacramento','Yellowtail','Damion','Marck Script','Amatic SC'];
  const PRINT = ['Roboto','Open Sans','Lato','Montserrat','Merriweather','Playfair Display',
    'Lora','Source Sans 3','Noto Sans','Noto Serif','Raleway','Oswald','PT Sans','PT Serif',
    'Nunito','Nunito Sans','Poppins','Inter','Work Sans','Rubik','Mulish','Karla','Bitter',
    'Crimson Text','EB Garamond','Libre Baskerville','Cormorant','Arvo','Domine','Spectral',
    'Zilla Slab','IBM Plex Sans','IBM Plex Serif','IBM Plex Mono','Roboto Mono','Source Code Pro',
    'Fira Sans','Cabin','Quicksand','Josefin Sans','Manrope','DM Sans','DM Serif Display',
    'Abril Fatface','Bebas Neue','Anton','Teko','Comfortaa','Roboto Slab','Vollkorn'];

  let hand = null, print = null, full = false;

  async function load(){
    if (hand) return { hand, print, full };
    try{
      // Fontsource lista ~2000 fuentes con CORS; se cargan vía Google Fonts por nombre.
      const r = await fetch('https://api.fontsource.org/v1/fonts');
      const j = await r.json();
      if (Array.isArray(j) && j.length){
        hand = []; print = [];
        for (const f of j){
          if (!f.family) continue;
          if (f.category === 'handwriting') hand.push(f.family);
          else print.push(f.family);
        }
        full = true; sortNice(); return { hand, print, full };
      }
      throw new Error('vacío');
    }catch(e){
      hand = HAND.slice(); print = PRINT.slice(); full = false;
      return { hand, print, full };
    }
  }
  // pone las más bonitas/comunes primero, luego alfabético
  function sortNice(){
    const pref = (arr, top) => {
      const set = new Set(top);
      const a = top.filter(x=>arr.includes(x));
      const b = arr.filter(x=>!set.has(x)).sort((m,n)=>m.localeCompare(n));
      return a.concat(b);
    };
    hand = pref(hand, HAND);
    print = pref(print, PRINT);
  }

  // carga el archivo de la fuente y espera a que esté lista para dibujar
  const ready = new Set();
  const pending = new Map();          // dedupe: una sola carga por familia
  function ensure(family){
    if (ready.has(family)) return Promise.resolve(true);
    if (pending.has(family)) return pending.get(family);
    const p = new Promise(res => {
      const href = 'https://fonts.googleapis.com/css2?family=' +
        encodeURIComponent(family).replace(/%20/g,'+') + '&display=swap';
      const link = document.createElement('link'); link.rel='stylesheet'; link.href=href;
      link.onload = () => {
        const done = ()=>{ ready.add(family); pending.delete(family); res(true); };
        if (document.fonts && document.fonts.load)
          document.fonts.load(`32px "${family}"`).then(done, done);
        else done();
      };
      link.onerror = () => { pending.delete(family); res(false); };
      document.head.appendChild(link);
    });
    pending.set(family, p);
    return p;
  }

  return { load, ensure };
})();
