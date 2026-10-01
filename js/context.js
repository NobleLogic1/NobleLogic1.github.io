/**
 * Both sides of a thread the user chose to hand over.
 * Labels: Me / Them, or a name. Unlabeled lines alternate, starting with them.
 */

export function parseThread(raw) {
  const lines = String(raw || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const turns = [];
  let expectThem = true;
  for (const line of lines) {
    const labeled = line.match(/^(me|them|you|her|him|they|[A-Z][a-z]+)\s*[:\-]\s*(.+)$/);
    if (labeled) {
      const who = labeled[1].toLowerCase();
      const side = who === "me" ? "me" : "them";
      turns.push({ side, text: labeled[2].trim() });
      expectThem = side === "me";
      continue;
    }
    turns.push({ side: expectThem ? "them" : "me", text: line });
    expectThem = !expectThem;
  }
  const them = [...turns].reverse().find((turn) => turn.side === "them") || null;
  const mine = [...turns].reverse().find((turn) => turn.side === "me") || null;
  return { turns, them, mine };
}

export function withContext(line, style, thread) {
  if (!thread?.them) return line;
  const hook = shortHook(thread.them.text, style);
  if (!line) return hook;
  if (!hook) return line;
  const body = line.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/[.]+$/, "");
  if (body.toLowerCase().includes(hook.toLowerCase().slice(0, 8))) return line;
  return `${hook}. ${body}`;
}

function shortHook(theirs, style) {
  const lower = theirs.toLowerCase();
  const casual = style !== "professional" && style !== "direct";
  if (/\b(dinner|drinks|coffee|lunch)\b/.test(lower)) {
    if (style === "flirty") return "i'm down";
    if (style === "romantic") return "i'd like that";
    if (style === "direct") return "Yes";
    if (style === "professional") return "That works";
    return casual ? "dinner works" : "Dinner works";
  }
  if (/\b(free|tonight|friday|weekend)\b/.test(lower) && /\?/.test(theirs)) {
    if (style === "flirty") return "for you, yeah";
    if (style === "direct") return "Yes";
    return casual ? "i can do that" : "I can do that";
  }
  if (/\?\s*$/.test(theirs)) {
    if (style === "direct") return "Yes";
    if (style === "professional") return "Yes";
    return casual ? "yeah" : "Yes";
  }
  return "";
}
