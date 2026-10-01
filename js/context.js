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

export function readMind(thread, draft) {
  const theirs = (thread?.them?.text || "").trim();
  const mine = (thread?.mine?.text || "").trim();
  const line = (draft || "").trim();
  const blob = `${theirs} ${mine} ${line}`.toLowerCase();
  const asking = /\?/.test(theirs);
  const plan = /\b(dinner|drinks|coffee|lunch|friday|tonight|weekend|hang)\b/.test(blob);
  const compliment = /\b(pretty|cute|hot|beautiful|gorgeous|handsome)\b/.test(line.toLowerCase());
  const apology = /\b(sorry|quiet|my bad)\b/.test(blob);
  const work = /\b(deck|meeting|deadline|send)\b/.test(blob);

  if (plan && compliment) {
    return {
      theirWant: "A yes or a no on dinner. Not the job of settling you.",
      yourWant: "To want Friday and still be fine if he answers slowly.",
      outcome: "Say the warm yes. Keep the feeling on your side of the send.",
      miss: "If you still want asks him to regulate you. That is his boundary.",
    };
  }
  if (plan && asking) {
    return {
      theirWant: "A clear yes or no. The question is the whole point.",
      yourWant: mine ? "You already softened it. They are still waiting on the plan." : "To answer without overexplaining.",
      outcome: "Close the loop on the invite.",
      miss: "Another vague line keeps them doing the work.",
    };
  }
  if (apology) {
    return {
      theirWant: "Repair. They want to know the gap was not indifference.",
      yourWant: "To own it without a speech.",
      outcome: "A short sorry that names the thing, then stop.",
      miss: "A long explanation asks them to comfort you.",
    };
  }
  if (work) {
    return {
      theirWant: "The thing, by the time you named.",
      yourWant: "To ask without sounding like an order.",
      outcome: "One clear ask. No extra scene.",
      miss: "Warmth with no deadline still leaves the work floating.",
    };
  }
  if (theirs) {
    return {
      theirWant: asking ? "An answer to what they just asked." : "A response to the last thing they actually said.",
      yourWant: line ? "To say your line without talking past them." : "To reply to them, not to the silence.",
      outcome: "Answer their last line, then add only what you meant.",
      miss: "A line that ignores theirs makes the thread feel one-sided.",
    };
  }
  return {
    theirWant: "No other side yet. This read is only your line.",
    yourWant: line ? "To send the meaning in a voice you will actually use." : "Nothing drafted.",
    outcome: "Keep the meaning. Change only the register.",
    miss: "A polished line that adds facts you did not mean.",
  };
}

export function withContext(line, style, thread) {
  if (!thread?.them) return line;
  const hook = shortHook(thread.them.text, style);
  if (!line) return hook;
  if (!hook) return line;
  if (/^(you('re| are| look)|you're)\b/i.test(line)) return hook;
  const body = line.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/[.]+$/, "");
  if (body.toLowerCase().includes(hook.toLowerCase().slice(0, 8))) return line;
  return `${hook}. ${body}`;
}

export function shapeLine(line, style, thread) {
  let out = String(line || "").replace(/\s+/g, " ").trim();
  if (!out) return out;
  out = out
    .replace(/\b(u|ur|lol|lmao|idk|rn|btw)\b/gi, "")
    .replace(/\s+([,])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/, which is\b.*/i, "")
    .replace(/\s+—\s+.*/g, "")
    .trim();
  const theirs = thread?.them?.text || "";
  const theirWords = theirs.split(/\s+/).filter(Boolean).length || 6;
  const cap = Math.max(theirWords + 5, 7);
  const words = out.split(" ").filter(Boolean);
  if (!["professional", "direct"].includes(style) && words.length > cap) {
    out = words.slice(0, cap).join(" ");
  }
  return out;
}

export function moveFor(style) {
  if (style === "flirty") return "Yes, then one picture he could say";
  if (style === "romantic") return "On his mind, then stop";
  if (style === "friendly") return "The plan, and one quiet detail";
  if (style === "playful") return "Dry, then stop";
  if (style === "professional" || style === "direct") return "The plan, nothing extra";
  return "Short enough that he can answer";
}

function shortHook(theirs, style) {
  const lower = theirs.toLowerCase();
  const casual = style !== "professional" && style !== "direct";
  if (/\b(dinner|drinks|coffee|lunch)\b/.test(lower)) {
    if (style === "flirty") return "friday works. i'm already picturing it";
    if (style === "romantic") return "friday. you've been on my mind";
    if (style === "direct") return "Friday works.";
    if (style === "professional") return "Friday works.";
    return casual ? "i can do friday. somewhere quiet" : "Friday works.";
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
