/**
 * Eupheme — on-device tone reading and register rewrite.
 * No network. Meaning stays; framing changes.
 */

const FILLERS = /\b(um+|uh+|like|literally|just|kinda|kind of|sorta|sort of|lol|lmao|haha|hah|omg|idk)\b/gi;

const STYLE_META = {
  flirty: {
    label: "Flirty",
    note: "Same compliment, a little more charge.",
  },
  romantic: {
    label: "Romantic",
    note: "Slower, and specific to the feeling.",
  },
  friendly: {
    label: "Friendly",
    note: "Easy to receive. No pressure.",
  },
  professional: {
    label: "Professional",
    note: "Clear, courteous, no slang.",
  },
  direct: {
    label: "Direct",
    note: "The ask, without the padding.",
  },
  warm: {
    label: "Warm",
    note: "Same facts, with care in the frame.",
  },
  playful: {
    label: "Playful",
    note: "Light, without flipping the point.",
  },
  soft: {
    label: "Soft",
    note: "Gentler verbs. Nothing new invented.",
  },
};

const APPEARANCE = {
  pretty: ["pretty", "beautiful", "pretty"],
  beautiful: ["beautiful", "beautiful", "beautiful"],
  cute: ["cute", "cute", "cute"],
  hot: ["good", "gorgeous", "hot"],
  handsome: ["handsome", "handsome", "sharp"],
  gorgeous: ["gorgeous", "gorgeous", "gorgeous"],
  sexy: ["good", "gorgeous", "hot"],
  good: ["good", "great", "good"],
  great: ["great", "great", "great"],
  nice: ["nice", "lovely", "nice"],
  fine: ["good", "good", "good"],
  lovely: ["lovely", "beautiful", "lovely"],
  adorable: ["cute", "sweet", "cute"],
  stunning: ["stunning", "stunning", "stunning"],
};

import { parseThread, withContext } from "./context.js";

export function readLine(raw, contextRaw) {
  const thread = parseThread(contextRaw);
  const text = normalize(raw);
  const source = text || thread.them?.text || "";
  if (!source) {
    return { empty: true, analysis: null, options: [], thread };
  }
  const analysis = analyze(text || source);
  if (!text && thread.them) analysis.intent = "Reply";
  const styles = pickStyles(analysis);
  const options = styles.map((style) => ({
    style,
    label: STYLE_META[style].label,
    note: thread.them ? `Answers ${thread.them.text}` : STYLE_META[style].note,
    text: voice(withContext(text ? rewrite(text, style, analysis) : "", style, thread), style),
  }));
  return { empty: false, analysis, options, thread };
}

export function rewriteOnly(raw, style, contextRaw) {
  const thread = parseThread(contextRaw);
  const text = normalize(raw);
  const analysis = analyze(text || thread.them?.text || "");
  return {
    style,
    label: STYLE_META[style]?.label || style,
    note: STYLE_META[style]?.note || "",
    text: voice(withContext(text ? rewrite(text, style, analysis) : "", style, thread), style),
  };
}

export function allStyles() {
  return Object.keys(STYLE_META);
}

export { STYLE_META };

function normalize(raw) {
  return String(raw || "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function analyze(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const signals = [];

  const has = (re) => re.test(lower);

  if (has(/\b(pretty|beautiful|cute|hot|handsome|gorgeous|stunning|sexy|lovely|adorable)\b/) || has(/\byou (look|are|'re)\b/)) {
    signals.push("appearance");
  }
  if (has(/\b(miss you|love you|into you|like you|thinking of you|crazy about)\b/)) signals.push("affection");
  if (has(/\b(sorry|apologize|my bad|forgive)\b/)) signals.push("apology");
  if (has(/\b(thanks|thank you|appreciate)\b/)) signals.push("gratitude");
  if (has(/\b(can you|could you|would you|please|need you to|send me|mind )\b/)) signals.push("request");
  if (has(/\b(dinner|drinks|coffee|hang|come over|wanna|want to)\b/) || has(/\bfree (?:tonight|friday|saturday|sunday|this)\b/)) {
    signals.push("invite");
  }
  if (has(/\b(annoyed|upset|bothered|hurt|unfair|frustrated|angry|mad)\b/)) signals.push("conflict");
  if (has(/\b(late|on my way|omw|eta|running behind|be there)\b/)) signals.push("logistics");
  if (has(/\b(deck|meeting|deadline|invoice|report|email|slack|client|schedule)\b/)) signals.push("work");

  const question = /\?\s*$/.test(text) || /^(who|what|when|where|why|how|do|does|did|are|is|can|could|would)\b/i.test(text);
  const short = words.length <= 4;
  const exclaim = /!/.test(text);
  const slang = has(/\b(u|ur|gonna|wanna|lol|lmao|idk|asap|rn)\b/);
  const hedge = has(/\b(maybe|perhaps|sort of|kind of|a bit|a little|i think|i guess)\b/);

  let intent = "Statement";
  if (signals.includes("apology")) intent = "Apology";
  else if (signals.includes("gratitude")) intent = "Gratitude";
  else if (signals.includes("conflict")) intent = "Repair";
  else if (signals.includes("request") || signals.includes("work")) intent = "Request";
  else if (signals.includes("invite")) intent = "Invitation";
  else if (signals.includes("affection")) intent = "Affection";
  else if (signals.includes("appearance")) intent = "Compliment";
  else if (signals.includes("logistics")) intent = "Logistics";
  else if (question) intent = "Question";
  else if (has(/\b(i feel|i'm|i am|feeling)\b/)) intent = "Check-in";

  let tone = "Plain";
  if (signals.includes("appearance") || signals.includes("affection")) tone = short ? "Blunt-warm" : "Warm";
  else if (signals.includes("apology") || signals.includes("conflict")) tone = hedge ? "Careful" : "Exposed";
  else if (signals.includes("work") || signals.includes("request")) tone = slang ? "Casual ask" : "Functional";
  else if (signals.includes("invite")) tone = exclaim ? "Eager" : "Casual";
  else if (question) tone = "Curious";
  else if (short && !hedge) tone = "Blunt";
  else if (hedge) tone = "Hedged";

  const risks = [];
  if (intent === "Compliment" && short) risks.push("Short compliments can land as throwaway.");
  if (intent === "Request" && !has(/\b(please|could|would|mind)\b/)) risks.push("Reads like an order, not an ask.");
  if (intent === "Apology" && words.length < 5) risks.push("Thin apologies can feel like a dodge.");
  if (intent === "Repair" && !hedge) risks.push("The heat is clear; the ask is not.");
  if (intent === "Invitation" && !question && !has(/\b(want|free|down|join)\b/)) risks.push("The plan is hinted, not offered.");
  if (slang && signals.includes("work")) risks.push("Slang will fight a work thread.");
  if (!risks.length) risks.push("Meaning is clear. The register is the only lever.");

  return {
    tone,
    intent,
    signals,
    risks: risks.slice(0, 2),
    question,
    words: words.length,
    preview: text,
  };
}

function pickStyles(analysis) {
  const { intent, signals } = analysis;
  if (intent === "Compliment" || intent === "Affection") return ["flirty", "romantic", "friendly"];
  if (intent === "Request" || signals.includes("work")) return ["professional", "direct", "warm"];
  if (intent === "Apology" || intent === "Repair") return ["soft", "direct", "warm"];
  if (intent === "Invitation") return ["playful", "warm", "direct"];
  if (intent === "Gratitude") return ["warm", "professional", "friendly"];
  if (intent === "Logistics") return ["direct", "friendly", "professional"];
  if (intent === "Question") return ["friendly", "direct", "warm"];
  return ["friendly", "warm", "direct"];
}

function rewrite(text, style, analysis) {
  const core = stripFillers(text);
  const handlers = [
    rewriteYouAre,
    rewriteYouLook,
    rewriteLoveLike,
    rewriteMiss,
    rewriteApology,
    rewriteThanks,
    rewriteRequest,
    rewriteInvite,
    rewriteLate,
    rewriteConflict,
    rewriteQuestion,
  ];
  for (const handler of handlers) {
    const next = handler(core, style, analysis);
    if (next) return next;
  }
  return general(core, style, analysis);
}

function stripFillers(text) {
  return text
    .replace(FILLERS, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([?.!,])/g, "$1")
    .trim();
}

function rewriteYouAre(text, style) {
  const m = text.match(/^(?:hey[, ]+)?you(?:'re| are) (?:so |really |very |super |kinda |kind of )?([a-z][a-z\s-]{1,32}?)(?:[.!]*)$/i);
  if (!m) return null;
  const adj = m[1].trim().toLowerCase();
  const word = adj.split(" ")[0];
  const pack = APPEARANCE[word] || [adj, adj, adj];
  if (style === "flirty") return `you're ${pack[2]}`;
  if (style === "romantic") return `you're really ${pack[1]}`;
  if (style === "friendly") return `you look ${pack[0]}, btw`;
  if (style === "playful") return `okay but you're ${pack[0]}`;
  if (style === "warm") return `you're ${pack[0]}. just saying`;
  if (style === "direct") return `You're ${pack[0]}.`;
  if (style === "soft") return `you're really ${pack[0]}`;
  if (style === "professional") return `You look great.`;
  return `you're ${pack[0]}`;
}

function rewriteYouLook(text, style) {
  const m = text.match(/^you look (?:so |really |very )?([a-z][a-z-]{1,24})(?: today| tonight| right now)?[.!]*$/i);
  if (!m) return null;
  const adj = m[1].trim().toLowerCase();
  const word = adj.split(" ")[0];
  const pack = APPEARANCE[word] || [adj, adj, adj];
  if (style === "flirty") return `you look ${pack[2]} right now`;
  if (style === "romantic") return `you look really ${pack[1]}`;
  if (style === "friendly") return `you look ${pack[0]} today`;
  if (style === "direct") return `You look ${pack[0]}.`;
  if (style === "warm") return `you look ${pack[0]}`;
  if (style === "playful") return `you look ${pack[0]}, just saying`;
  if (style === "professional") return `You look great.`;
  return `you look ${pack[0]}`;
}

function rewriteLoveLike(text, style) {
  const love = /^i (?:really |kinda |kind of )?love you[.!]*$/i.test(text);
  const like = /^i (?:really |kinda |kind of )?(?:like|am into) you[.!]*$/i.test(text);
  if (!love && !like) return null;
  if (love) {
    if (style === "romantic") return "i love you";
    if (style === "flirty") return "i love you, obviously";
    if (style === "friendly") return "love you";
    if (style === "direct") return "I love you.";
    if (style === "warm") return "i love you";
    if (style === "soft") return "i love you";
    return "i love you";
  }
  if (style === "flirty") return "i like you";
  if (style === "romantic") return "i really like you";
  if (style === "friendly") return "i like you";
  if (style === "direct") return "I like you.";
  if (style === "soft") return "i like you, no pressure";
  if (style === "warm") return "i like you";
  return "i like you";
}

function rewriteMiss(text, style) {
  if (!/^i (?:really |kinda )?miss you[.!]*$/i.test(text)) return null;
  if (style === "romantic") return "i miss you";
  if (style === "flirty") return "miss you";
  if (style === "friendly") return "miss you";
  if (style === "direct") return "I miss you.";
  if (style === "warm") return "miss you";
  if (style === "soft") return "i miss you";
  return "i miss you";
}

function rewriteApology(text, style) {
  if (!/^(?:i'm |i am |im )?sorry\b/i.test(text) && !/^my bad\b/i.test(text)) return null;
  let rest = text
    .replace(/^(?:i'm |i am |im )?sorry(?:\s+about|\s+for|\s+that)?\s*/i, "")
    .replace(/^my bad[, ]*/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  const clause = rest ? lowerFirst(rest) : "";
  const about = clause && !/^(i |we |that |the |last |being |going )/i.test(clause)
    ? `about ${clause}`
    : clause;
  if (style === "soft") return about ? `sorry ${about}` : "sorry i went quiet";
  if (style === "direct") return about ? `Sorry ${about}.` : "I'm sorry.";
  if (style === "warm") return about ? `sorry ${about}` : "sorry";
  if (style === "professional") return about ? `Sorry ${about}. I'll follow up.` : "Sorry for the delay.";
  if (style === "friendly") return about ? `sorry ${about}` : "my bad";
  if (style === "playful") return about ? `that was on me` : "my bad";
  return about ? `sorry ${about}` : "sorry";
}

function rewriteThanks(text, style) {
  const m = text.match(/^(?:thanks|thank you|thx)(?: so much| a lot)?(?: for)?\s*(.*)$/i);
  if (!m) return null;
  const rest = m[1].replace(/[.!]+$/, "").trim();
  const thing = rest ? ` for ${lowerFirst(rest)}` : "";
  if (style === "warm") return rest ? `thanks${thing}` : "thank you";
  if (style === "professional") return rest ? `Thank you${thing}.` : "Thank you.";
  if (style === "friendly") return rest ? `thanks${thing}` : "thanks";
  if (style === "direct") return rest ? `Thanks${thing}.` : "Thank you.";
  if (style === "flirty") return rest ? `thanks${thing}` : "thank you";
  if (style === "romantic") return rest ? `thank you${thing}` : "thank you";
  return `thanks${thing}`;
}

function rewriteRequest(text, style) {
  const m = text.match(/^(?:hey[, ]+)?(?:can you|could you|would you|please|pls)\s+(.+?)(?:\?)?$/i);
  if (!m) return null;
  let ask = m[1].replace(/[.!]+$/, "").trim();
  ask = ask.replace(/\b(u)\b/gi, "you").replace(/\b(asap)\b/gi, "as soon as you can");
  if (style === "professional") return `Could you ${ask}?`;
  if (style === "direct") return `Please ${ask}.`;
  if (style === "warm") return `can you ${ask} when you get a sec?`;
  if (style === "friendly") return `can you ${ask}?`;
  if (style === "soft") return `could you ${ask}?`;
  if (style === "playful") return `tiny ask, can you ${ask}?`;
  return `can you ${ask}?`;
}

function rewriteInvite(text, style) {
  const dinner = text.match(/^(?:want to |wanna |you down to |)?(?:grab |get |do )?(dinner|drinks|coffee|lunch|breakfast)(?: (?:on |this )?(friday|saturday|sunday|tonight|tomorrow|this weekend))?(\?)?$/i);
  if (dinner) {
    const what = dinner[1].toLowerCase();
    const when = dinner[2] ? ` ${dinner[2]}` : "";
    if (style === "playful") return `${what}${when}?`;
    if (style === "warm") return `want to get ${what}${when}?`;
    if (style === "direct") return `${cap(what)}${when}?`;
    if (style === "flirty") return `${what}${when}? i'm hoping you say yes`;
    if (style === "romantic") return `want to do ${what}${when}?`;
    if (style === "friendly") return `want to grab ${what}${when}?`;
    if (style === "professional") return `Are you free for ${what}${when}?`;
    return `want to get ${what}${when}?`;
  }
  const hang = text.match(/^(?:want to|wanna|you want to|do you want to)\s+(.+?)(\?)?$/i);
  if (!hang) return null;
  const plan = hang[1].replace(/[.!]+$/, "").trim();
  if (style === "playful") return `want to ${plan}?`;
  if (style === "warm") return `want to ${plan}?`;
  if (style === "direct") return `Want to ${plan}?`;
  if (style === "flirty") return `want to ${plan}?`;
  if (style === "friendly") return `want to ${plan}? no pressure`;
  if (style === "romantic") return `want to ${plan}?`;
  return `want to ${plan}?`;
}

function rewriteLate(text, style) {
  if (!/\b(running late|gonna be late|going to be late|on my way|omw|be there soon|eta)\b/i.test(text)) return null;
  const mins = text.match(/(\d+)\s*(min|mins|minutes)/i);
  const extra = mins ? ` About ${mins[1]} minutes.` : "";
  if (style === "direct") return `Running late.${extra}`.trim();
  if (style === "professional") return `Running a few minutes late.${extra}`.trim();
  if (style === "friendly") return `running late, on my way`;
  if (style === "warm") return `sorry, running late. on my way`;
  if (style === "soft") return `sorry, running late`;
  return `running late`;
}

function rewriteConflict(text, style) {
  if (!/\b(annoyed|upset|bothered|hurt|unfair|frustrated|angry)\b/i.test(text)) return null;
  const core = text.replace(/[.!]+$/, "");
  if (style === "soft") return `I want to say this carefully: ${lowerFirst(core)}.`;
  if (style === "direct") return `${cap(core)}.`;
  if (style === "warm") return `${cap(core)}. I’d rather say it than let it sit.`;
  if (style === "professional") return `I want to flag this: ${lowerFirst(core)}.`;
  if (style === "friendly") return `Honest version: ${lowerFirst(core)}.`;
  return cap(core) + ".";
}

function rewriteQuestion(text, style, analysis) {
  if (!analysis.question) return null;
  const q = text.endsWith("?") ? text : `${text.replace(/[.!]+$/, "")}?`;
  if (style === "direct") return q.charAt(0).toUpperCase() + q.slice(1);
  if (style === "friendly") return q.charAt(0).toUpperCase() + q.slice(1);
  if (style === "warm") return q;
  if (style === "professional") return polish(q);
  if (style === "soft") return q;
  if (style === "playful") return q;
  return q;
}

function general(text, style) {
  const base = polish(text).replace(/[.?!]+$/, "");
  if (style === "direct" || style === "professional") return ensureEnd(base);
  return base;
}

function polish(text) {
  return text
    .replace(/\bu\b/gi, "you")
    .replace(/\bur\b/gi, "your")
    .replace(/\bgonna\b/gi, "going to")
    .replace(/\bwanna\b/gi, "want to")
    .replace(/\basap\b/gi, "as soon as you can")
    .replace(/\brn\b/gi, "right now")
    .replace(/\bidk\b/gi, "I don’t know")
    .replace(/\s+/g, " ")
    .trim();
}

function voice(text, style) {
  let out = polish(String(text || "")).replace(/\s+/g, " ").trim();
  if (!out) return out;
  const casual = !["professional", "direct"].includes(style);
  out = out.replace(/\bi\b/g, casual ? "i" : "I");
  if (!casual) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
    if (!/[.!?]$/.test(out)) out += ".";
  } else {
    out = out.charAt(0).toLowerCase() + out.slice(1);
    out = out.replace(/[.]+$/, "");
  }
  return out.replace(/\?\./g, "?").replace(/!\./g, "!").replace(/\.\./g, ".");
}

function ensureEnd(text) {
  const t = text.trim();
  if (/[.!?]$/.test(t)) return t;
  return `${t}.`;
}

function lowerFirst(text) {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function cap(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
