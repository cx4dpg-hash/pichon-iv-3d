// Texturas procedurales pequeñas de la carga (lienzos 2D, sin assets nuevos): grano de la espuma y
// etiqueta impresa con los logos que ya usa la interfaz (assets/branding/, rutas relativas).

/**
 * Grano de telgopor: perlas de unos 1–2 mm con sombra en las uniones y brillo tenue en el centro,
 * sobre un blanco cálido con manchas suaves de baja frecuencia. Se repite sobre las piezas de espuma;
 * el borde es continuo (todo se dibuja también desplazado un tamaño de lienzo).
 */
export function foamCanvas(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = "#f6f4ee";
  g.fillRect(0, 0, size, size);
  let seed = 12345; // PRNG determinista: el aspecto no cambia entre cargas
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const wrap = (fn) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(dx, dy);
  };
  // Manchas suaves (suciedad / densidad despareja)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 30 + rnd() * 50;
    const tone = rnd() < 0.5 ? "140,136,124" : "255,255,255";
    const a = tone[0] === "1" ? 0.05 : 0.22;
    wrap((dx, dy) => {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grad.addColorStop(0, `rgba(${tone},${a})`);
      grad.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = grad;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }
  // Perlas: rejilla irregular de círculos con sombra en el borde y centro más claro
  const step = 5.2;
  for (let gy = -1; gy <= size / step + 1; gy++) {
    for (let gx = -1; gx <= size / step + 1; gx++) {
      const x = (gx + (gy % 2 ? 0.5 : 0) + (rnd() - 0.5) * 0.6) * step;
      const y = gy * step * 0.88 + (rnd() - 0.5) * 2;
      const r = step * (0.5 + rnd() * 0.2);
      wrap((dx, dy) => {
        const grad = g.createRadialGradient(x + dx - r * 0.2, y + dy - r * 0.2, r * 0.1, x + dx, y + dy, r);
        grad.addColorStop(0, `rgba(255,255,255,${0.35 + rnd() * 0.2})`);
        grad.addColorStop(0.7, "rgba(255,255,255,0)");
        grad.addColorStop(1, `rgba(120,116,104,${0.16 + rnd() * 0.14})`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
  // Huecos y marcas ocasionales
  for (let i = 0; i < 40; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    wrap((dx, dy) => {
      g.fillStyle = `rgba(110,106,96,${0.12 + rnd() * 0.18})`;
      g.beginPath();
      g.arc(x + dx, y + dy, 0.8 + rnd() * 1.4, 0, Math.PI * 2);
      g.fill();
    });
  }
  return canvas;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // sin logo se dibuja igual el resto de la etiqueta
    img.src = src;
  });
}

/**
 * Etiqueta (2:1) inspirada en la fotografía de referencia: escudo del Radio Club Uruguayo y cabeza de
 * ave de Pichón arriba, "Radio Club Uruguayo" en azul y leyenda en dos líneas. Sin teléfono: las
 * fotografías muestran etiquetas distintas y no se toma ninguno como dato.
 */
export async function labelCanvas() {
  const [shield, bird] = await Promise.all([loadImage("assets/branding/rcu-shield.png"), loadImage("assets/branding/pichon-iv-logo.png")]);
  const W = 640;
  const H = 320;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  const blue = "#1f58b8";
  g.fillStyle = "#f1f3f2";
  g.fillRect(0, 0, W, H);
    const contain = (img, x, y, w, h) => {
    const k = Math.min(w / img.width, h / img.height);
    g.drawImage(img, x + (w - img.width * k) / 2, y + (h - img.height * k) / 2, img.width * k, img.height * k);
  };
  if (shield) contain(shield, 150, 22, 130, 130);
  if (bird) contain(bird, 300, 32, 190, 112);
  g.fillStyle = blue;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "bold 50px Arial, Helvetica, sans-serif";
  g.fillText("Radio Club Uruguayo", W / 2, 188);
  g.font = "bold 25px Arial, Helvetica, sans-serif";
  g.fillText("UNA INICIATIVA CON INSPIRACIÓN EDUCACIONAL", W / 2, 240);
  g.fillText("POR FAVOR COMUNICARSE", W / 2, 278);
  // Papel pegado sobre espuma: el grano se transparenta, con leve gradiente de luz y un borde tenue
  const grain = foamCanvas(256);
  g.save();
  g.globalCompositeOperation = "multiply";
  g.globalAlpha = 0.45;
  g.drawImage(grain, 0, 0, 256, 256, 0, 0, W, H);
  g.restore();
  const shade = g.createLinearGradient(0, 0, W, H);
  shade.addColorStop(0, "rgba(255,255,255,0.12)");
  shade.addColorStop(1, "rgba(90,90,80,0.12)");
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(100,104,100,0.45)";
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);
  return canvas;
}
