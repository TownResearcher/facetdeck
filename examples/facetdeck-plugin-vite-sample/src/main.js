const app = document.querySelector("#app");

app.innerHTML = `
  <div class="panel">
    <h3 style="margin:0;">Sample: Read + Generate + Insert</h3>
    <p style="margin:8px 0 0;color:#475569;font-size:13px;">Reads current slide HTML, generates an image, and inserts it on slide.</p>
    <div class="row">
      <input id="prompt" value="A minimal orange abstract shape" />
      <button id="run">Run</button>
    </div>
    <pre id="out">Ready.</pre>
  </div>
`;

const out = document.querySelector("#out");
const setOut = (msg) => {
  out.textContent = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
};

const mapPluginError = (err) => {
  const raw = err instanceof Error ? err.message : String(err || "Unknown error");
  const text = raw.toLowerCase();
  if (text.includes("capability") || text.includes("not granted")) {
    return "Permission missing. Ask user to re-install plugin and grant required capabilities.";
  }
  if (text.includes("rate limit")) return "Rate limited. Retry later.";
  if (text.includes("credits") || text.includes("insufficient")) return "Managed credits exhausted.";
  if (text.includes("quota") || text.includes("storage")) return "Cloud quota exceeded.";
  return raw;
};

document.querySelector("#run").addEventListener("click", async () => {
  const api = window.FacetDeck?.api;
  if (!api) {
    setOut("window.FacetDeck.api not found. Run inside FacetDeck plugin host.");
    return;
  }

  try {
    const prompt = document.querySelector("#prompt").value.trim();
    const slide = await api.editor.getActiveSlideHtml();
    const image = await api.ai.image.generate({ prompt });
    const inserted = await api.resources.addImageToSlide({
      dataUrl: image.imageUrl,
      x: 120,
      y: 120,
      w: 360,
      h: 220,
      createElement: true,
      name: "sample-generated-image",
    });

    setOut({
      slideId: slide.slideId,
      htmlLength: String(slide.html || "").length,
      inserted,
    });
  } catch (err) {
    setOut({ error: mapPluginError(err) });
    await window.FacetDeck.api.ui.toast({ message: mapPluginError(err), type: "error" });
  }
});
