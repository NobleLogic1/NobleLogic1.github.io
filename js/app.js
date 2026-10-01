import { readLine, rewriteOnly, allStyles, STYLE_META } from "./engine.js";
import { parseThread, readMind } from "./context.js";

const draft = document.querySelector("#draft");
const threadBox = document.querySelector("#thread");
const form = document.querySelector("#composer");
const reading = document.querySelector("#reading");
const empty = document.querySelector("#empty");
const optionsEl = document.querySelector("#options");
const toneEl = document.querySelector("#tone");
const intentEl = document.querySelector("#intent");
const riskEl = document.querySelector("#risk");
const statusEl = document.querySelector("#status");
const contextStatus = document.querySelector("#context-status");

let current = "";
let selected = 0;
let timer = 0;

const styles = allStyles();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  run(draft.value);
});

draft.addEventListener("input", () => schedule());
threadBox.addEventListener("input", () => {
  rememberThread();
  schedule();
});

document.querySelector("#shot").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  contextStatus.textContent = "Reading the screenshot on this device…";
  try {
    const text = await readScreenshot(file);
    threadBox.value = text;
    rememberThread();
    run(draft.value);
  } catch {
    contextStatus.textContent = "Could not read that image. Paste the thread instead.";
  }
});

document.querySelectorAll("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => {
    draft.value = button.dataset.sample;
    run(draft.value);
    draft.focus();
  });
});

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => run(draft.value), 420);
}

function rememberThread() {
  const parsed = parseThread(threadBox.value);
  localStorage.setItem("eupheme-thread", threadBox.value);
  if (!parsed.turns.length) {
    contextStatus.textContent = "No thread yet. Suggestions will only use your line.";
    return;
  }
  const them = parsed.them ? parsed.them.text : "none";
  contextStatus.textContent = `${parsed.turns.length} lines. Last from them: ${them}`;
}

function run(raw) {
  current = raw;
  const result = readLine(raw, threadBox.value);
  if (result.empty) {
    reading.hidden = true;
    empty.hidden = false;
    statusEl.textContent = "";
    return;
  }
  empty.hidden = true;
  reading.hidden = false;
  const mind = readMind(result.thread, raw);
  document.querySelector("#their-want").textContent = mind.theirWant;
  document.querySelector("#your-want").textContent = mind.yourWant;
  document.querySelector("#outcome").textContent = mind.outcome;
  document.querySelector("#miss").textContent = mind.miss;
  selected = 0;
  paint(result.options, mind);
  statusEl.textContent = "Tap a line to copy it. Keys 1–3 work too.";
}

document.addEventListener("keydown", (event) => {
  if (!reading || reading.hidden) return;
  if (event.target === draft || event.target === threadBox) return;
  const index = Number(event.key) - 1;
  if (index >= 0 && index < 3) {
    const card = optionsEl.querySelectorAll(".option")[index];
    if (card) choose(card, true);
  }
});

function paint(options, mind) {
  optionsEl.replaceChildren();
  options.forEach((option, index) => {
    const card = document.createElement("article");
    card.className = "option" + (index === selected ? " is-selected" : "");
    card.dataset.index = String(index);
    card.dataset.text = option.text;
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", index === selected ? "true" : "false");

    const mark = document.createElement("span");
    mark.className = "index";
    mark.textContent = String(index + 1);

    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = option.label;
    const line = document.createElement("p");
    line.textContent = option.text;
    const note = document.createElement("small");
    note.textContent = option.note;
    body.append(title, line, note);

    const actions = document.createElement("div");
    actions.className = "option-actions";

    const select = document.createElement("select");
    select.className = "style-select";
    select.setAttribute("aria-label", `Style for option ${index + 1}`);
    styles.forEach((style) => {
      const item = document.createElement("option");
      item.value = style;
      item.textContent = STYLE_META[style].label;
      if (style === option.style) item.selected = true;
      select.append(item);
    });
    select.addEventListener("change", () => {
      const next = rewriteOnly(current, select.value, threadBox.value);
      card.dataset.text = next.text;
      title.textContent = next.label;
      line.textContent = next.text;
      note.textContent = next.note;
      choose(card, true);
    });
    select.addEventListener("click", (event) => event.stopPropagation());

    const use = document.createElement("button");
    use.type = "button";
    use.className = "btn";
    use.textContent = "Use this";
    use.addEventListener("click", (event) => {
      event.stopPropagation();
      choose(card, true);
    });

    actions.append(select, use);
    card.append(mark, body, actions);
    card.addEventListener("click", () => choose(card, true));
    optionsEl.append(card);
  });
}

async function choose(card, copy) {
  selected = Number(card.dataset.index);
  optionsEl.querySelectorAll(".option").forEach((item) => {
    const on = item === card;
    item.classList.toggle("is-selected", on);
    item.setAttribute("aria-selected", on ? "true" : "false");
  });
  if (!copy) return;
  const text = card.dataset.text;
  const copied = await copyText(text);
  if (copied && navigator.share) {
    statusEl.textContent = "Copied. Share sheet is available if you want Messages directly.";
    offerShare(text);
    return;
  }
  statusEl.textContent = copied
    ? "Copied. That line replaced the draft."
    : "Selected. Copy it if the clipboard is blocked.";
  draft.value = text;
}

function offerShare(text) {
  if (statusEl.querySelector("[data-share]")) return;
  const share = document.createElement("button");
  share.type = "button";
  share.className = "btn ghost";
  share.dataset.share = "1";
  share.textContent = "Share to Messages";
  share.style.marginLeft = "0.6rem";
  share.addEventListener("click", async () => {
    try {
      await navigator.share({ text });
      statusEl.textContent = "Shared. Send it from Messages when you’re ready.";
    } catch (error) {
      if (error && error.name === "AbortError") return;
      statusEl.textContent = "Share sheet unavailable. The line is still on your clipboard.";
    }
  });
  statusEl.append(document.createTextNode(" "));
  statusEl.append(share);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    document.body.append(helper);
    helper.select();
    const ok = document.execCommand("copy");
    helper.remove();
    return ok;
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

const savedThread = localStorage.getItem("eupheme-thread");
if (savedThread) threadBox.value = savedThread;
rememberThread();
run(draft.value);

async function readScreenshot(file) {
  if (!window.Tesseract) {
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
  }
  const result = await window.Tesseract.recognize(file, "eng");
  return result.data.text.trim();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

const params = new URLSearchParams(location.search);
const seeded = params.get("text");
if (seeded) {
  draft.value = seeded;
  run(seeded);
}
