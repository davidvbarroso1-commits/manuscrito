/* fonts.js — biblioteca de tipos de letra (Google Fonts).
   Intenta traer el catálogo completo (cientos de fuentes) y, si no puede,
   usa una lista curada de respaldo. Categoriza en "manuscritas" e "imprenta". */
const FONTS = (() => {

  // respaldo curado (siempre funciona aunque falle la red)
  const HAND = ['Caveat','Dancing Script','Pacifico','Shadows Into Light','Indie Flower',
    'Patrick Hand','Kalam','Gloria Hallelujah','Architects Daughter','Homemade Apple',
    'Reenie Beanie','Nanum Pen Script','Satisfy','Sacramento','Great Vibes','Allura',
    'Tangerine','Cookie','Permanent Marker','Rock Salt','Covered By Your Grace','Coming Soon',
    'Gochi Hand','Schoolbell','Just Another Hand','Nothing You Could Do','Crafty Girls',
    'Walter Turncoat','Loved by the King','La Belle Aurore','Zeyada','Marck Script',
    'Yellowtail','Bad Script','Caveat Brush','Shadows Into Light Two','Handlee','Neucha',
    'Itim','Mansalva','Delius','Sriracha','Damion','Kristi','Dawning of a New Day',
    'Cedarville Cursive','Give You Glory','Over the Rainbow','Annie Use Your Telescope',
    'The Girl Next Door','Beth Ellen','Calligraffitti','Grand Hotel','Courgette','Lobster',
    'Amatic SC','Caveat'];
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
  function ensure(family){
    if (ready.has(family)) return Promise.resolve(true);
    return new Promise(res => {
      const href = 'https://fonts.googleapis.com/css2?family=' +
        encodeURIComponent(family).replace(/%20/g,'+') + '&display=swap';
      const link = document.createElement('link'); link.rel='stylesheet'; link.href=href;
      link.onload = () => {
        const done = ()=>{ ready.add(family); res(true); };
        if (document.fonts && document.fonts.load)
          document.fonts.load(`32px "${family}"`).then(done, done);
        else done();
      };
      link.onerror = () => res(false);
      document.head.appendChild(link);
    });
  }

  return { load, ensure };
})();
