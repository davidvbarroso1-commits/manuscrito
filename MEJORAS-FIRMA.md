# Manuscrito — estado del recorte de firmas

Documento para pasar a otra IA que quiera opinar sobre el algoritmo. Contiene
lo que se ha hecho, **cómo se mide**, y lo que sigue fallando con cifras.

**Arquitectura:** HTML + CSS + JavaScript puro, sin backend, sin paso de compilación.
Todo corre en el navegador. **No hay Python, ni servidor, ni sitio donde instalar
OpenCV** — los equivalentes (Otsu, componentes conectados, morfología, Sobel)
están escritos a mano en `js/generate.js`.

---

## Cómo se mide (esto es lo importante)

Hay un banco de pruebas en `pruebas/firmas.html` con **verdad conocida**. Cada
caso se pinta en **dos capas**:

1. La escena completa: papel, cuadrícula, rayas, texto impreso, sello, sombras
2. **La tinta de la firma sola** — la verdad

Con la verdad delante se puede medir lo que con una foto real es imposible:

- **Conserva** — qué porcentaje de la firma sobrevive al recorte
- **Limpieza** — qué porcentaje de lo conservado es firma y no fondo

**17 casos × 4 condiciones = 68 pruebas.** Las condiciones son degradaciones de
cámara: luz desigual, ruido de sensor **sembrado** (con `Math.random()` dos
corridas del mismo código diferían en ±1 punto y no se podía comparar nada),
desenfoque, compresión JPEG y perspectiva. Sin esas degradaciones los sintéticos
son irreales y **cualquier algoritmo los aprueba**.

La comparación es de **formas normalizadas**, no píxel a píxel: el extractor
recorta ajustado a la tinta y reescala los recortes pequeños, así que un mapeo
directo daba 27% en todos los casos por igual — incluido el trivial, que fue lo
que delató que el fallo estaba en la medición.

La verdad se toma en el **núcleo del trazo** (alpha > 110). Con alpha > 40
entraban los bordes suavizados, al 15% de opacidad, que ningún umbralizador
conserva ni debe conservar: penalizaba un 20% sin que faltara nada.

---

## Estado actual: media 80 / 81 sobre 68 pruebas

Ordenado de peor a mejor:

| Caso | Conserva | Limpieza |
|---|---|---|
| Firma IGUAL de tenue que la cuadrícula | **36** | **22** |
| Firma IGUAL de tenue que las rayas | **54** | **59** |
| Azul sobre formulario con recuadros | **73** | **72** |
| Verde + sello azul, cuaderno amarillo | **73** | 95 |
| Roja sobre texto impreso y rayas | **78** | **76** |
| Bolígrafo que se queda sin tinta | 78 | 79 |
| Azul claro casi del color del papel | 78 | 85 |
| Sello superpuesto a la firma | 80 | 93 |
| Roja de punta fina, lazos separados | 85 | 76 |
| Lápiz gris sobre cuadrícula gris | 87 | 89 |
| Reflejo de flash sobre el papel | 88 | 88 |
| Firma pequeña con mucho fondo | 89 | 85 |
| Papel arrugado con pliegues | 89 | 90 |
| Negra con sombra fuerte | 89 | 91 |
| Cuaderno sobre mesa oscura | 92 | 91 |
| Dos firmas: debe quedarse con una | 93 | 92 |
| Azul sobre papel blanco | 94 | 91 |

**Aviso al comparar cifras:** los 15 primeros casos daban media 85/86. Los dos
casos IGUAL de tenue se añadieron después, a propósito, como límite duro: son
firmas pintadas **exactamente con el mismo color y la misma opacidad** que la
cuadrícula o las rayas de la hoja. Bajan la media a 80/81 y ahí es donde está
el trabajo.

---

## El pipeline actual

```
FOTO
 ↓
inkClusters()      detecta la hoja, mide distancia al papel en luminancia Y
                   color, Otsu, quita la cuadrícula periódica, componentes
                   conectados, agrupa en manchas         → devuelve CAJAS
 ↓
Gemini (opcional)  devuelve box_2d de la firma / el sello
 ↓
refineBox()        ajusta el recuadro de la IA a los trazos reales
 ↓
extractTight()     Otsu local, separación por tono, quitar rejilla por grosor,
                   componentes, desmezcla del papel      → devuelve PÍXELES
 ↓
limpiaFirma()      controles manuales: cuentagotas, quitar negros, tolerancia
```

La IA **solo elige dónde**; todos los píxeles los resuelve el código local. Si
no hay clave de Gemini, el motor local funciona igual.

---

## El caso límite: firma del mismo tono que la hoja

Es el objetivo que se ha marcado: subir una firma **del mismo contraste e
intensidad** que el fondo cuadriculado y que la app sepa qué, cómo y hasta
dónde copiar. Por nivel de gris no hay nada que medir — son el mismo valor.

Lo único que las distingue son dos cosas:

1. **La hoja es periódica y la firma no.** Las rayas están a distancia regular
   y cruzan la hoja entera.
2. **Donde la firma cruza una raya hay dos capas de tinta.** Por composición
   alfa, `1-(1-a)²`: con a=0,85 la raya sola queda en 0,85 y el cruce en 0,978.
   Ese salto es el único dato real que separa una cosa de la otra.

De ahí salieron dos filtros. Uno funciona y el otro no, y la diferencia
entre ellos es **dónde** se aplica, no cómo está escrito:

**En `inkClusters` (localizar) — funciona.** Se buscan ejes que crucen más del
55% de la hoja y estén a distancia regular, y se borran de la máscara. Cortar
la firma aquí no importa: esta función solo devuelve **cajas**, y los trozos se
vuelven a unir en el agrupador por cajas dilatadas, porque el corte mide 3 px y
el hueco tolerado es mayor. Medido: media 79/80 → **80/81**, el caso de la
cuadrícula 30/19 → **36/22**, el de las rayas 51/47 → **54/59**, y los otros 15
casos salieron **idénticos dígito a dígito**.

**En `extractTight` (copiar los píxeles) — no funciona.** Se probaron tres
versiones, cada vez más finas, y ninguna movió la media:

| Versión | Caso cuadrícula | Media |
|---|---|---|
| Nivel = mediana de la raya entera | 36/22 → 32/25 | 80/81 |
| + nivel propio de los cruces de rejilla | 32/25 | 80/81 |
| + mediana móvil, ventana 24 px | 32/25 → 31/27 | 80/81 |

Cambian dos o tres puntos de un solo caso y no mueven nada más. Es ruido, no
una mejora, y costaba 70 líneas: revertido.

**Lo que sí reveló esa medición** es que el cuello de botella no está ahí. En
ese caso *conserva* se queda en 36: se pierde el 64% de la firma, y eso no es
suciedad que sobra, es trazo que no llega. La salida mide 221×155 sobre un
recorte de 386×212 con 11 componentes, así que el sospechoso es el `keep` de
`extractTight`, que conserva el componente mayor y lo que cae a `diag*0,25` de
él: con la firma partida en trozos, los lejanos se caen.

Se intentó arreglar haciendo **crecer** la caja (cierre transitivo: cada vuelta
admite lo que esté cerca de lo ya admitido). Empeoró: media 80/81 → **79/80**, y
justo el caso que quería arreglar cayó a **24/15**, más el de sello 73/95 →
70/86. Al crecer la caja crece el radio, y el radio mayor alcanza el fondo: una
vez entra el primer trozo de sombra, la cadena no para.

---

## Hallazgos que costaron encontrar

Cada uno se descubrió midiendo, no razonando:

**1. Coordenadas transpuestas.** Gemini devuelve `box_2d = [ymin, xmin, ymax, xmax]`
— la Y primero. Se leía como `[x0,y0,x1,y1]`. Recortaba el teclado.

**2. Otsu se adapta al contenido del recorte.** En un recorte con poca firma y
mucha hoja, el umbral sube y la cuadrícula pasa por tinta. Medido: zona de
cuadrícula → papel 136 / umbral 121 (15 de diferencia); zona con firma → papel
141 / umbral 90 (51). Se añadió un contraste mínimo absoluto contra el papel.

**3. Componentes que atraviesan la hoja.** Dos manchas gigantes (`x0-690`,
`x0-720`) de fondo y sombra se tragaban la firma al fusionarse. Se descartan
los que cruzan más del 80% de la hoja.

**4. Lo impreso suele ser MÁS negro que el bolígrafo**, así que separarlos por
oscuridad es imposible. Lo que sí los separa es el **color**. Pero no basta con
que haya píxeles con color: el ruido JPEG sobre grafito da 39,8% de píxeles con
color y saturación media 48, indistinguible de un bolígrafo. Lo que separa es
la **concentración del tono**: pico de un solo bin = 0,955 con bolígrafo rojo
frente a 0,414 con lápiz. Mirar el pico con sus vecinos no valía (0,82 vs 1,00).

**5. El color se pierde por la mezcla con el papel.** Un trazo fino es
semitransparente: `observado = a·tinta + (1−a)·papel`. Se despeja
`tinta = (observado − (1−a)·papel) / a` — la inversa de la composición alfa —
y se recupera el color que tendría sobre papel blanco. Verificado: verde 2066,
azul 2835, **neutro 0**.

**6. El filtro de cuadrícula destrozaba los trazos finos.** Elimina lo fino por
grosor, y un bolígrafo de punta fina fotografiado de lejos es igual de fino que
una raya. La guarda exigía que solo el **5%** del trazo sobreviviera a la
erosión; subida al **35%**.

**7. Una firma es UN objeto aunque sus lazos no se toquen.** Con trazo fino y
bucles amplios el agrupador la parte: en una firma real se encontraron 8 manchas
y se recortaba una de 155×220 sobre una foto de 466×772.

**8. El papel no vale lo mismo en toda la foto.** Con viñeteado, sombra de la
mano o flash, las esquinas quedan por debajo del nivel global de papel y pasan
por tinta. Medido en el caso azul claro: nítida acertaba la firma exacta
(`x94-426 y94-241` frente a la verdad `x94-425 y94-240`) y con luz desigual la
mancha se iba a la esquina equivocada o abarcaba la imagen entera. Se estima
el papel por bloques (percentil 85), se suaviza la rejilla y se interpola.
Barrido del percentil de 0,65 a 0,92: prácticamente plano.

**9. Absorber fragmentos ≠ absorber firmas.** Dos firmas del mismo bolígrafo
comparten relleno y halo, así que cumplían todas las condiciones de absorción
y se fusionaban. Un fragmento es menor y puntúa menos que el cuerpo principal;
una segunda firma, no.

**10. El sitio donde se aplica un filtro decide si ayuda o destroza.** El mismo
filtro de cuadrícula: dentro de `extractTight` hundió la media de 79/80 a
**31/23**; dentro de `inkClusters` la subió a 80/81 sin tocar ningún otro caso.
Es el mismo código; lo que cambia es qué se rompe cuando se equivoca.

---

## Intentos que se REVIRTIERON por medir peor

Están anotados en el código para no repetirlos:

**Quitar la cuadrícula dentro de `extractTight` borrando la línea entera.**
Media 79/80 → **31/23**: corta la firma en cada cruce. Se intentó conservar los
cruces (no borrar donde hay tinta a ambos lados) y no mejoró — un trazo casi
paralelo a la raya no cumple esa condición.

**Restar la cuadrícula por nivel dentro de `extractTight`** (tres versiones, ver
arriba). Media clavada en 80/81 en las tres: ruido.

**Hacer crecer la caja de `keep` por cierre transitivo.** Media 80/81 → 79/80;
el caso de la cuadrícula 31/27 → **24/15**. Si se reintenta, el paso tiene que
ser de radio FIJO y exigir además que el trozo sea de la misma clase de tinta,
como ya se hace al absorber manchas en `inkClusters`.

**Borrar las rectas impresas antes de agrupar.** Una firma que toca el borde de
su casilla se funde con él y el filtro la descarta entera. Barrido de K=0,22 a
0,50: o no se activa (≥0,34) o hunde la media de 0,897/0,936 a 0,845/0,887.
Borrar el *centro* de una línea deja sus extremos, y esos fragmentos ya pasan
los filtros como si fueran tinta. **Queda como rescate**, solo cuando no
aparece ningún componente.

**Definir la hoja como la unión de las islas de papel.** Los bordes impresos
parten el papel y la hoja salía de 498×141 sobre 520×340. En el banco
funcionaba: el formulario subía de 38/50 a 97/90. **Pero en las fotos reales del
usuario era un desastre**: con fondo oscuro el recorte pasaba de 245×197 al 82%
de transparencia a 720×875 al 29% — media foto pegada.

**Aflojar el umbral cuando el contraste es flojo.** El caso azul claro casi del
color del papel empeora de 86/71 a **71/42**: aflojar arrastra papel.

**Absorber manchas cercanas solo por distancia.** Una sombra junto a la firma se
absorbía: negra con sombra caía de 93/97 a **19/39**. Hizo falta exigir que sea
la misma clase de tinta (relleno y halo parecidos).

---

## Preguntas abiertas donde vendría bien otra opinión

1. **El caso límite (firma del mismo tono que la hoja).** La localización ya
   funciona por periodicidad. Lo que falla es la extracción: donde el trazo va
   casi **paralelo** a una raya no hay forma local de separarlos. ¿Se puede
   decidir por continuidad y curvatura del trazo — seguirlo y ver si sale de la
   raya — en vez de píxel a píxel?

2. **¿Cómo elegir la firma principal cuando hay varias?** Tamaño, posición,
   grosor de trazo, cercanía a la palabra FIRMA…

3. **¿Cómo separar una firma de la casilla impresa que toca**, sin que borrar la
   línea deje fragmentos que luego se cuelan? (73/72 y no sube.)

4. **¿Merece la pena un umbral adaptativo por regiones** (tipo Sauvola /
   Niblack) en vez de un Otsu global sobre el recorte?

5. **El caso de bajo contraste**: aflojar el umbral mete papel. ¿Otra vía?

---

*Cualquier propuesta se puede validar en minutos: abrir `pruebas/firmas.html`,
pulsar Ejecutar el banco, y comparar contra la media 80/81 sobre 68 pruebas.
Si una idea no mejora ahí, no mejora.*
