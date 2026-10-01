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
  const theirs = thread.them.text.replace(/[.?!]+$/, "");
  const asking = /\?$/.test(thread.them.text)
    || /^(do|are|can|want|free|what|when|where)\b/i.test(theirs)
    || /\b(dinner|drinks|coffee|free|tonight|friday)\b/i.test(theirs);
  const answer = answerTo(theirs, style);
  if (!line) return answer;
  if (asking) return `${answer.replace(/[.]+$/, "")}. ${line}`;
  if (style === "professional" || style === "direct") return line;
  return `${line.replace(/[.]+$/, "")} — about “${theirs}.”`;
}

function answerTo(theirs, style) {
  const lower = theirs.toLowerCase();
  if (/\b(dinner|drinks|coffee|lunch)\b/.test(lower)) {
    if (style === "flirty") return "I'm in. Been hoping you'd ask.";
    if (style === "romantic") return "I'd like that. Unhurried, if we can.";
    if (style === "direct") return "Yes.";
    if (style === "professional") return "Yes, that works.";
    return "That sounds good.";
  }
  if (/\b(free|tonight|friday|weekend|hang)\b/.test(lower)) {
    if (style === "flirty") return "For you, yes.";
    if (style === "direct") return "I'm free.";
    return "I can do that.";
  }
  if (lower.includes("?")) {
    if (style === "soft") return "Honest answer: yes.";
    if (style === "direct") return "Yes.";
    return "Yes — wanted you to hear it in this voice.";
  }
  if (style === "warm") return "I heard that.";
  if (style === "direct") return "Noted.";
  return "I caught that.";
}
