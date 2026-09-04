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

  // 30 fuentes elegidas por parecido a la letra del usuario (cursiva fina,
  // semi-conectada, desprolija, tipo apunte de cuaderno a lápiz)
  const SIMILAR = [
    // ★ las 16 elegidas por el usuario (su mezcla predeterminada) van primero
    'Homemade Apple','League Script','Dawning of a New Day','Zeyada','Stalemate',
    'Island Moments','Send Flowers','Passions Conflict','Babylonica','Sassy Frass',
    'Hurricane','Whisper','Qwitcher Grypen','Fuggles','Petemoss','Beth Ellen',
    // resto de cursivas desprolijas
    'Cedarville Cursive','La Belle Aurore','Nothing You Could Do','Waiting for the Sunrise',
    'Give You Glory','Reenie Beanie','Sue Ellen Francisco','Loved by the King','Over the Rainbow',
    'Just Me Again Down Here','Annie Use Your Telescope','The Girl Next Door','Shadows Into Light',
    'Shadows Into Light Two','Ruthie','Meddon','Kristi','Vibur','Caveat','Caveat Brush',
    'Bad Script','Neucha','Mansalva','Sedgwick Ave','Square Peg','Water Brush','Splash',
    'Smooch','Mea Culpa','Kolker Brush','Ruge Boogie','Oooh Baby','Moon Dance','Caramel',
    'Cherish','Grechen Fuemen','Neonderthaw','Estonia','Vujahday Script','Tapestry','Updock',
    'Twinkle Star','Praise','Love Light','Ole','Are You Serious',
    // tercera tanda: más cursivas finas parecidas a las 16 elegidas
    'Ms Madi','My Soul','Lovers Quarrel','Dr Sugiyama','Miss Fajardose','Mr Bedfort',
    'Mrs Sheppards','Monsieur La Doulaise','Jim Nightshade','Meie Script','Redressed',
    'Aguafina Script','Felipa','Bilbo','Bilbo Swash Caps','Euphoria Script','Engagement',
    'Devonshire','Condiment'];

  // mezcla predeterminada del usuario (sus 16 elegidas)
  const DEFAULT_MIX = ['League Script','Dawning of a New Day','Zeyada','Stalemate',
    'Island Moments','Send Flowers','Passions Conflict','Babylonica','Sassy Frass',
    'Hurricane','Whisper','Qwitcher Grypen','Fuggles','Petemoss','Homemade Apple','Beth Ellen'];

  let hand = null, print = null, display = null, full = false;

  async function load(){
    if (hand) return { hand, print, display, full };
    try{
      // Fontsource lista ~2000 fuentes con CORS; se cargan vía Google Fonts por nombre.
      const r = await fetch('https://api.fontsource.org/v1/fonts');
      const j = await r.json();
      if (Array.isArray(j) && j.length){
        /* 'imprenta' NO puede ser "todo lo que no es manuscrito": ahi caen las
           decorativas (Bungee, Creepster...) y no son letra de imprenta. Se
           separan de verdad por categoria.                                   */
        hand = []; print = []; display = [];
        for (const f of j){
          if (!f.family) continue;
          const c = f.category;
          if (c === 'handwriting') hand.push(f.family);
          else if (c === 'serif' || c === 'sans-serif' || c === 'monospace') print.push(f.family);
          else display.push(f.family);            // display y demas
        }
        full = true; sortNice(); return { hand, print, display, full };
      }
      throw new Error('vacío');
    }catch(e){
      hand = HAND.slice(); print = PRINT.slice(); display = []; full = false;
      return { hand, print, display, full };
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

  /* ── METRICA REAL DE CADA LETRA ──────────────────────────────────────────
     Dos fuentes al mismo tamaño en px NO miden lo mismo. Medido sobre las 16
     de la mezcla por defecto: la altura de las minusculas va de 23px
     (Passions Conflict) a 81px (Homemade Apple) con font-size 100 — un factor
     3,5. Por eso al mezclar por letra las letras saltaban de tamaño y no
     parecian de la misma mano. Aqui se mide cada fuente una vez y se guarda,
     para escalarlas todas a la MISMA altura de minuscula.                   */
  /* Cargar las fuentes de una en una dejaba la lista a medias: solo se veian
     las primeras y el resto salia con la letra por defecto. Google combina
     varias familias en una sola peticion, asi que se piden por tandas.      */
  async function ensureVarias(familias, porTanda){
    const faltan=[...new Set(familias)].filter(f=>f && !ready.has(f) && !pending.has(f));
    const n=porTanda||18;
    for(let i=0;i<faltan.length;i+=n){
      const tanda=faltan.slice(i,i+n);
      const href='https://fonts.googleapis.com/css2?'+
        tanda.map(f=>'family='+encodeURIComponent(f).replace(/%20/g,'+')).join('&')+'&display=swap';
      await new Promise(res=>{
        const link=document.createElement('link'); link.rel='stylesheet'; link.href=href;
        const fin=()=>{ for(const f of tanda) ready.add(f); res(); };
        link.onload=()=>{
          if(document.fonts&&document.fonts.load)
            Promise.all(tanda.map(f=>document.fonts.load('32px "'+f+'"').catch(()=>{}))).then(fin,fin);
          else fin();
        };
        link.onerror=()=>res();
        document.head.appendChild(link);
      });
    }
    return true;
  }
  const MET_KEY='manuscrito_fontmet_v2';
  const XH_OBJETIVO=44;        // altura de minuscula deseada midiendo a 100px
  const DEN_OBJETIVO=0.245;    // densidad de trazo tipica de un boligrafo
  let MET={}; try{ MET=JSON.parse(localStorage.getItem(MET_KEY)||'{}'); }catch(e){ MET={}; }
  let guardarPdte=null;
  function guardaMet(){ clearTimeout(guardarPdte);
    guardarPdte=setTimeout(()=>{ try{ localStorage.setItem(MET_KEY, JSON.stringify(MET)); }catch(e){} }, 400); }

  let lienzo=null;
  function medir(fam){
    if(!lienzo){ lienzo=document.createElement('canvas'); lienzo.width=420; lienzo.height=220; }
    const W=lienzo.width, H=lienzo.height;
    const x=lienzo.getContext('2d',{willReadFrequently:true});
    x.fillStyle='#fff'; x.fillRect(0,0,W,H);
    x.fillStyle='#000'; x.textBaseline='alphabetic';
    x.font='100px "'+fam+'", cursive';
    x.fillText('nxouea',12,168);          // solo letras sin astas ni colas
    const d=x.getImageData(0,0,W,H).data;
    let top=H, bot=0, minX=W, maxX=0, tinta=0;
    for(let y=0;y<H;y++) for(let px=0;px<W;px++){
      if(d[(y*W+px)*4]<150){ tinta++;
        if(y<top)top=y; if(y>bot)bot=y; if(px<minX)minX=px; if(px>maxX)maxX=px; } }
    if(tinta<20) return {xh:XH_OBJETIVO, an:180, den:DEN_OBJETIVO};
    const xh=Math.max(4,bot-top), an=Math.max(4,maxX-minX);
    return {xh, an, den:tinta/(xh*an)};
  }
  async function metrica(fam){
    if(MET[fam]) return MET[fam];
    await ensure(fam);
    await new Promise(r=>setTimeout(r,0));      // deja al navegador aplicar la fuente
    const m=medir(fam);
    MET[fam]=m; guardaMet();
    return m;
  }
  // factor por el que hay que multiplicar el tamaño para igualar la altura
  function escala(fam){
    const m=MET[fam]; if(!m) return 1;
    return Math.max(0.55, Math.min(2.6, XH_OBJETIVO/m.xh));
  }
  // cuanto hay que engordar el trazo de una fuente fina para que iguale al resto
  function engorde(fam){
    const m=MET[fam]; if(!m) return 0;
    return Math.max(0, Math.min(1.2, (DEN_OBJETIVO-m.den)/DEN_OBJETIVO*1.6));
  }
  async function prepara(fams){                 // mide todas antes de dibujar
    for(const f of fams){ try{ await metrica(f); }catch(e){} }
  }

  /* Grupos por PARECIDO REAL. Mezclar dentro de un grupo se ve natural;
     mezclar caligrafia formal con rotulador, no.                            */
  const GRUPOS={
    cuaderno:{ nombre:'Cursiva de cuaderno', fams:[
      'Caveat','Bad Script','Nothing You Could Do','La Belle Aurore','Cedarville Cursive',
      'Shadows Into Light','Shadows Into Light Two','Kristi','Dawning of a New Day',
      'Give You Glory','Waiting for the Sunrise','Zeyada','Mansalva','Neucha']},
    imprenta:{ nombre:'Letra de imprenta a mano', fams:[
      'Homemade Apple','Reenie Beanie','Just Me Again Down Here','The Girl Next Door',
      'Annie Use Your Telescope','Sue Ellen Francisco','Loved by the King','Over the Rainbow',
      'Beth Ellen','Coming Soon','Gloria Hallelujah']},
    formal:{ nombre:'Caligrafía formal', fams:[
      'League Script','Petemoss','Qwitcher Grypen','Island Moments','Babylonica',
      'Passions Conflict','Stalemate','Hurricane','Whisper','Fuggles','Sassy Frass']},
    rotulador:{ nombre:'Rotulador y pincel', fams:[
      'Caveat Brush','Water Brush','Splash','Kolker Brush','Sedgwick Ave','Vibur',
      'Send Flowers','Meddon','Square Peg']}
  };
  return { load, ensure, ensureVarias, SIMILAR, DEFAULT_MIX, metrica, escala, engorde, prepara, GRUPOS, medir,
           get display(){ return display||[]; } };
})();
