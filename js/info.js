// Ventana de información (ⓘ): metodología, fuentes de datos y limitaciones. Todo el contenido sale
// de data/metadata.json (única fuente de procedencia; docs/SOURCES.md se genera de él). Solo
// muestra/oculta una capa: no toca la reproducción, la cámara ni ningún dato. Se pide el JSON al
// abrir por primera vez y todo el texto se inserta con textContent.

const $ = (id) => document.getElementById(id);

const CONFIDENCE = { high: "alta", medium: "media", low: "baja", unknown: "desconocida", low_to_medium: "baja a media" };

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function urlList(source) {
  const urls = Array.isArray(source.url) ? source.url : source.url ? [source.url] : [];
  return urls.filter((u) => typeof u === "string" && u.startsWith("https://"));
}

function renderSource(source) {
  const box = el("div", undefined, "src");
  box.appendChild(el("b", source.name));
  const confidence = CONFIDENCE[source.generalConfidence] ?? source.generalConfidence ?? "—";
  box.appendChild(el("span", ` · ${source.type.replaceAll("_", " ")} · confianza ${confidence}`, "meta"));
  if (source.provides?.length) box.appendChild(el("div", `Sustenta: ${source.provides.join("; ")}.`));
  const files = Array.isArray(source.file) ? source.file : source.file ? [source.file] : [];
  if (files.length) {
    const line = el("div", "Archivo: ");
    files.forEach((f, i) => {
      if (i) line.appendChild(document.createTextNode(", "));
      line.appendChild(el("code", f));
    });
    if (source.versioned === false) line.appendChild(document.createTextNode(" (no versionado)"));
    box.appendChild(line);
  }
  const urls = urlList(source);
  if (urls.length) {
    const line = el("div", "Enlace: ");
    urls.forEach((u, i) => {
      if (i) line.appendChild(document.createTextNode(" · "));
      const a = el("a", u);
      a.href = u;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      line.appendChild(a);
    });
    box.appendChild(line);
  }
  if (source.notes) box.appendChild(el("div", source.notes, "meta"));
  return box;
}

/** Contenido de cada pestaña a partir de metadata.json. */
export function buildSections(meta) {
  const byId = new Map(meta.sources.map((s) => [s.id, s]));
  return {
    methodology() {
      const frag = document.createDocumentFragment();
      for (const item of meta.methodology) {
        frag.appendChild(el("h3", item.title));
        frag.appendChild(el("p", item.text));
      }
      return frag;
    },
    sources() {
      const frag = document.createDocumentFragment();
      for (const group of meta.groups) {
        frag.appendChild(el("h3", group.title));
        const ul = el("ul");
        for (const point of group.points) ul.appendChild(el("li", point));
        frag.appendChild(ul);
        for (const id of group.sourceIds) {
          const source = byId.get(id);
          if (source) frag.appendChild(renderSource(source));
        }
      }
      return frag;
    },
    limitations() {
      const frag = document.createDocumentFragment();
      const ul = el("ul");
      for (const text of meta.limitations) ul.appendChild(el("li", text));
      frag.appendChild(ul);
      return frag;
    },
  };
}

export function initInfo() {
  const modal = $("infoModal");
  const body = $("infoBody");
  const open = $("btnInfo");
  const tabs = [...modal.querySelectorAll("[data-tab]")];
  let sections = null;
  let current = "methodology";
  let opener = null;

  function show(tab) {
    current = tab;
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.tab === tab));
    if (!sections) return;
    body.replaceChildren(sections[tab]());
    body.scrollTop = 0;
  }

  async function load() {
    if (sections) return;
    try {
      const response = await fetch("data/metadata.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      sections = buildSections(await response.json());
    } catch (error) {
      body.textContent = `No se pudo cargar la información (data/metadata.json): ${error.message}`;
    }
  }

  async function openModal() {
    opener = document.activeElement;
    modal.hidden = false;
    $("btnInfoClose").focus();
    await load();
    show(current);
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    if (opener && typeof opener.focus === "function") opener.focus();
  }

  open.addEventListener("click", openModal);
  $("btnInfoClose").addEventListener("click", closeModal);
  modal.addEventListener("pointerdown", (event) => {
    if (event.target === modal) closeModal(); // clic fuera de la tarjeta
  });
  for (const t of tabs) t.addEventListener("click", () => show(t.dataset.tab));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      event.preventDefault();
      closeModal();
    }
  });

  return {
    open: openModal,
    close: closeModal,
    get isOpen() {
      return !modal.hidden;
    },
  };
}
