/* libs.js — carga perezosa de librerías externas desde CDN.
   Solo se descargan la primera vez que se necesitan (subir PDF, docx, OCR, exportar PDF). */
const LIBS = (() => {
  const loaded = {};

  function loadScript(src){
    return new Promise((res, rej) => {
      if (loaded[src]) return res();
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => { loaded[src] = true; res(); };
      s.onerror = () => rej(new Error('No se pudo cargar: ' + src));
      document.head.appendChild(s);
    });
  }

  async function pdfjs(){
    if (window.pdfjsLib) return window.pdfjsLib;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs').catch(async()=>{
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    });
    if (window.pdfjsLib){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    return window.pdfjsLib;
  }

  async function mammoth(){
    if (window.mammoth) return window.mammoth;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
    return window.mammoth;
  }

  async function tesseract(){
    if (window.Tesseract) return window.Tesseract;
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    return window.Tesseract;
  }

  async function jspdf(){
    if (window.jspdf) return window.jspdf;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    return window.jspdf;
  }

  return { pdfjs, mammoth, tesseract, jspdf };
})();
