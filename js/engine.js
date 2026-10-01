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
  pretty: ["striking", "lovely", "easy to look at"],
  beautiful: ["beautiful", "quietly stunning", "hard to look away from"],
  cute: ["cute", "endearing", "unfairly cute"],
  hot: ["striking", "hard to ignore", "very easy on the eyes"],
  handsome: ["handsome", "well put together", "sharp"],
  gorgeous: ["gorgeous", "stunning", "impossible to miss"],
  sexy: ["magnetic", "striking", "hard not to notice"],
  good: ["good", "great", "easy on the eyes"],
  great: ["great", "wonderful", "hard to ignore"],
  nice: ["nice", "lovely", "easy to like"],
  fine: ["fine", "good", "worth a second look"],
  lovely: ["lovely", "beautiful", "genuinely lovely"],
  adorable: ["adorable", "sweet", "ridiculously cute"],
  stunning: ["stunning", "breathtaking", "impossible to miss"],
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
    text: finish(withContext(text ? rewrite(text, style, analysis) : "", style, thread)),
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
    text: finish(withContext(text ? rewrite(text, style, analysis) : "", style, thread)),
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
  if (style === "flirty") return `You are unfairly ${pack[2]}.`;
  if (style === "romantic") return `There is something quietly ${pack[1]} about you.`;
  if (style === "friendly") return `You look really ${pack[0]} — thought you should hear it.`;
  if (style === "playful") return `Not to make it a whole thing, but you are ${pack[0]}.`;
  if (style === "warm") return `I mean this plainly: you are ${pack[0]}.`;
  if (style === "direct") return `You are ${pack[0]}.`;
  if (style === "soft") return `I keep noticing how ${pack[0]} you are.`;
  if (style === "professional") return `You present very well.`;
  return `You are ${pack[0]}.`;
}

function rewriteYouLook(text, style) {
  const m = text.match(/^you look (?:so |really |very )?([a-z][a-z-]{1,24})(?: today| tonight| right now)?[.!]*$/i);
  if (!m) return null;
  const adj = m[1].trim().toLowerCase();
  const word = adj.split(" ")[0];
  const pack = APPEARANCE[word] || [adj, adj, adj];
  if (style === "flirty") return `You look unfairly ${pack[2]} right now.`;
  if (style === "romantic") return `You look ${pack[1]} — the kind that stays with me.`;
  if (style === "friendly") return `You look really ${pack[0]} today.`;
  if (style === "direct") return `You look ${pack[0]}.`;
  if (style === "warm") return `You look ${pack[0]}. I wanted you to know.`;
  if (style === "playful") return `You look ${pack[0]}, and I am choosing to say so.`;
  if (style === "professional") return `You look well put together.`;
  return `You look ${pack[0]}.`;
}

function rewriteLoveLike(text, style) {
  const love = /^i (?:really |kinda |kind of )?love you[.!]*$/i.test(text);
  const like = /^i (?:really |kinda |kind of )?(?:like|am into) you[.!]*$/i.test(text);
  if (!love && !like) return null;
  if (love) {
    if (style === "romantic") return "I love you. That has not changed.";
    if (style === "flirty") return "Still completely in love with you, for the record.";
    if (style === "friendly") return "I love you — just wanted that said out loud.";
    if (style === "direct") return "I love you.";
    if (style === "warm") return "I love you, and I am glad you are in my life.";
    if (style === "soft") return "I love you. I hope that lands gently.";
    return "I love you.";
  }
  if (style === "flirty") return "I like you. More than a casual text usually admits.";
  if (style === "romantic") return "I like you — in the way that makes ordinary days better.";
  if (style === "friendly") return "I like you. Thought it was worth saying plainly.";
  if (style === "direct") return "I like you.";
  if (style === "soft") return "I like you, and I wanted you to hear it without pressure.";
  if (style === "warm") return "I like you. Spending time with you matters to me.";
  return "I like you.";
}

function rewriteMiss(text, style) {
  if (!/^i (?:really |kinda )?miss you[.!]*$/i.test(text)) return null;
  if (style === "romantic") return "I miss you. The day feels thinner without you in it.";
  if (style === "flirty") return "I miss you — specifically, and a little impatiently.";
  if (style === "friendly") return "I miss you. Hope your day is treating you well.";
  if (style === "direct") return "I miss you.";
  if (style === "warm") return "I miss you. Thinking of you.";
  if (style === "soft") return "I miss you. No agenda, just that.";
  return "I miss you.";
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
  if (style === "soft") {
    return about
      ? `I’m sorry ${about}. I should have handled that better.`
      : "I’m sorry. I should have said something sooner.";
  }
  if (style === "direct") return about ? `Sorry ${about}.` : "I’m sorry.";
  if (style === "warm") {
    return about
      ? `I’m sorry ${about}. I wanted to say it plainly.`
      : "I’m sorry. I wanted to say it plainly.";
  }
  if (style === "professional") {
    if (!about) return "Apologies for the delay.";
    if (/^i\b/i.test(about)) return `Apologies — ${about}. I’ll follow up.`;
    return `Apologies ${about.startsWith("about") ? about : `for ${about}`}. I’ll follow up.`;
  }
  if (style === "friendly") return about ? `Sorry ${about} — that one’s on me.` : "Sorry. That one’s on me.";
  if (style === "playful") return about ? `That was on me: ${about}.` : "That one was on me.";
  return about ? `I’m sorry ${about}.` : "I’m sorry.";
}

function rewriteThanks(text, style) {
  const m = text.match(/^(?:thanks|thank you|thx)(?: so much| a lot)?(?: for)?\s*(.*)$/i);
  if (!m) return null;
  const rest = m[1].replace(/[.!]+$/, "").trim();
  const thing = rest ? ` for ${lowerFirst(rest)}` : "";
  if (style === "warm") return rest ? `Thank you${thing}. It meant something.` : "Thank you. I don’t take it lightly.";
  if (style === "professional") return rest ? `Thank you${thing}.` : "Thank you.";
  if (style === "friendly") return rest ? `Thanks${thing} — really.` : "Thanks. I appreciate it.";
  if (style === "direct") return rest ? `Thanks${thing}.` : "Thank you.";
  if (style === "flirty") return rest ? `Thank you${thing}. You make it look easy.` : "Thank you. Noted, and liked.";
  if (style === "romantic") return rest ? `Thank you${thing}. I felt looked after.` : "Thank you. I felt it.";
  return `Thank you${thing}.`;
}

function rewriteRequest(text, style) {
  const m = text.match(/^(?:hey[, ]+)?(?:can you|could you|would you|please|pls)\s+(.+?)(?:\?)?$/i);
  if (!m) return null;
  let ask = m[1].replace(/[.!]+$/, "").trim();
  ask = ask.replace(/\b(u)\b/gi, "you").replace(/\b(asap)\b/gi, "as soon as you can");
  if (style === "professional") return `Could you ${ask}?`;
  if (style === "direct") return `Please ${ask}.`;
  if (style === "warm") return `When you can, would you ${ask}? I’d appreciate it.`;
  if (style === "friendly") return `Hey — could you ${ask}?`;
  if (style === "soft") return `Would you be willing to ${ask}?`;
  if (style === "playful") return `Tiny ask: could you ${ask}?`;
  return `Could you ${ask}?`;
}

function rewriteInvite(text, style) {
  const dinner = text.match(/^(?:want to |wanna |you down to |)?(?:grab |get |do )?(dinner|drinks|coffee|lunch|breakfast)(?: (?:on |this )?(friday|saturday|sunday|tonight|tomorrow|this weekend))?(\?)?$/i);
  if (dinner) {
    const what = dinner[1].toLowerCase();
    const when = dinner[2] ? ` ${dinner[2]}` : "";
    if (style === "playful") return `Counteroffer: ${what}${when}. You in?`;
    if (style === "warm") return `I’d like to get ${what}${when}, if you’re free.`;
    if (style === "direct") return `${cap(what)}${when}?`;
    if (style === "flirty") return `${cap(what)}${when}. I’m hoping you say yes.`;
    if (style === "romantic") return `I’d like ${what}${when} with you — unhurried, if we can.`;
    if (style === "friendly") return `Want to grab ${what}${when}?`;
    if (style === "professional") return `Are you free for ${what}${when}?`;
    return `Want to get ${what}${when}?`;
  }
  const hang = text.match(/^(?:want to|wanna|you want to|do you want to)\s+(.+?)(\?)?$/i);
  if (!hang) return null;
  const plan = hang[1].replace(/[.!]+$/, "").trim();
  if (style === "playful") return `Wild idea: ${plan}. You in?`;
  if (style === "warm") return `I’d like to ${plan}, if that sounds good.`;
  if (style === "direct") return `Want to ${plan}?`;
  if (style === "flirty") return `Want to ${plan}? I’d like that more than I’m playing it.`;
  if (style === "friendly") return `Want to ${plan}? No pressure either way.`;
  if (style === "romantic") return `I’d like to ${plan} with you.`;
  return `Want to ${plan}?`;
}

function rewriteLate(text, style) {
  if (!/\b(running late|gonna be late|going to be late|on my way|omw|be there soon|eta)\b/i.test(text)) return null;
  const mins = text.match(/(\d+)\s*(min|mins|minutes)/i);
  const extra = mins ? ` About ${mins[1]} minutes.` : "";
  if (style === "direct") return `Running late.${extra}`.trim();
  if (style === "professional") return `I’m running behind and will be there shortly.${extra}`.trim();
  if (style === "friendly") return `Running a few minutes late — on my way.${extra}`.trim();
  if (style === "warm") return `Sorry, running late. I’m on my way.${extra}`.trim();
  if (style === "soft") return `I’m behind, and I’m sorry to keep you.${extra}`.trim();
  return `Running late.${extra}`.trim();
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
  if (style === "warm") return `${q.charAt(0).toUpperCase() + q.slice(1)} Asking because it matters.`;
  if (style === "professional") return polish(q);
  if (style === "soft") return `If you’re open to it — ${lowerFirst(q)}`;
  if (style === "playful") return q;
  return q;
}

function general(text, style) {
  const polished = polish(text);
  const base = polished.replace(/[.?!]+$/, "");
  if (style === "direct") return ensureEnd(base);
  if (style === "professional") return ensureEnd(polished.replace(/[.?!]+$/, ""));
  if (style === "friendly") return ensureEnd(base);
  if (style === "warm") return `${ensureEnd(base)} I mean that.`;
  if (style === "soft") return `I want to put this gently: ${lowerFirst(ensureEnd(base))}`;
  if (style === "flirty") return `${ensureEnd(base)} Saying it on purpose.`;
  if (style === "romantic") return `${ensureEnd(base)} It has been on my mind.`;
  if (style === "playful") return `${ensureEnd(base)} There. Said it.`;
  return ensureEnd(base);
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

function finish(text) {
  let out = polish(text).replace(/\s+/g, " ").trim();
  out = out.replace(/\bi\b/g, "I");
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (!/[.!?]$/.test(out)) out += ".";
  out = out.replace(/\?\./g, "?").replace(/!\./g, "!").replace(/\.\./g, ".");
  return out;
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
