// Deterministic Hinglish brain for Ritviz — a financial-collections voice agent.
//
// Architecture:
//   1) classify(text) — scored intent classifier; multiple signals add weight,
//      highest score wins. Replaces the brittle "first regex hits" approach.
//   2) createBrain() — state machine that drives Ritviz's utterances + outcome.
//
// Customer audio → Saaras v3 mode=translate → English text → classify() → state.
//
// Outcomes: PAID | PROMISED | NO_ANSWER | DNC

export const OUTCOMES = { PAID: "PAID", PROMISED: "PROMISED", NO_ANSWER: "NO_ANSWER", DNC: "DNC" };
export const INTENTS = ["DNC", "PAID", "PROMISE", "AFFIRM", "DENY", "TIME_REQUEST", "DISPUTE"];

// -------------------- SIGNALS --------------------
// Each signal: [regex, weight]. Weights are tuned so a single strong signal
// beats a weak one, and accumulating signals beats noisy single-keyword hits
// (e.g. a leading "No," shouldn't trump a clear "I will pay within 3 days").

const SIGNALS = {
  DNC: [
    [/\bdo\s+not\s+call\b/i, 10],
    [/\bdon'?t\s+call\b/i, 10],
    [/\bstop\s+calling\b/i, 10],
    [/\bnever\s+call\b/i, 9],
    [/\bremove\s+(?:me|my\s+(?:number|contact|details))\b/i, 9],
    [/\bdelete\s+my\s+(?:number|contact|details)\b/i, 9],
    [/\bblock\s+(?:me|my\s+number)\b/i, 8],
    [/\bleave\s+me\s+alone\b/i, 8],
    [/\bharass(?:ment|ing|ed)?\b/i, 7],
    [/\b(?:i\s+am\s+)?not\s+interested\b/i, 6],
    [/\b(?:please\s+)?stop\b/i, 3],
  ],

  PAID: [
    [/\balready\s+paid\b/i, 9],
    [/\bi\s+have\s+(?:already\s+)?paid\b/i, 9],
    [/\bi'?ve\s+(?:already\s+)?paid\b/i, 9],
    [/\bi\s+paid\b/i, 7],
    [/\bmade\s+(?:the\s+)?payment\s+(?:already|yesterday|today|just\s+now|earlier)\b/i, 8],
    [/\bpayment\s+(?:is\s+)?(?:done|made|completed)\b/i, 8],
    [/\b(?:settled|cleared)\s+(?:the\s+)?(?:emi|payment|amount|dues)\b/i, 8],
    [/\b(?:transferred|deposited)\s+(?:the\s+)?(?:amount|money|emi|payment)\b/i, 7],
    [/\b(?:transferred|deposited|paid)\s+(?:yesterday|today|just\s+now)\b/i, 7],
    [/\bdone\s+already\b/i, 5],
    [/\bemi\s+(?:is\s+)?(?:paid|done|cleared|settled)\b/i, 8],
  ],

  PROMISE: [
    // ----- Future payment verb (strong) -----
    [/\bi'?ll\s+(?:pay|make|do|send|transfer|deposit|clear)\b/i, 6],
    [/\bi\s+will\s+(?:pay|make|do|send|transfer|deposit|clear)\b/i, 6],
    [/\bgoing\s+to\s+(?:pay|make|send|transfer|deposit|clear)\b/i, 5],
    [/\bgonna\s+(?:pay|make|send|transfer|deposit|clear)\b/i, 5],
    [/\bplan\s+to\s+(?:pay|make|send|transfer|deposit|clear)\b/i, 4],
    [/\b(?:will|i'?ll)\s+make\s+(?:the\s+)?payment\b/i, 6],
    [/\bmake\s+(?:the\s+)?payment\b/i, 4],
    [/\blet\s+me\s+pay\b/i, 4],
    [/\bi\s+(?:can|could)\s+pay\b/i, 4],
    [/\bpromise\b/i, 4],
    [/\bcommit(?:ment)?\b/i, 3],

    // ----- Time references (additive — only confirm intent when paired with a verb) -----
    [/\b(?:by|on|within|in|before|until)\s+(?:tomorrow|tonight|day\s+after|next\s+week|this\s+week|this\s+month|end\s+of\s+(?:the\s+)?week|end\s+of\s+(?:the\s+)?month)\b/i, 3],
    [/\b(?:by|on|within|in|before|until)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, 3],
    [/\b(?:by|on|before|until)\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\b/i, 3],
    [/\bwithin\s+(?:the\s+next\s+)?\d+\s+(?:days?|hours?|weeks?)\b/i, 4],
    [/\bin\s+(?:the\s+)?(?:next\s+|a\s+couple\s+of\s+|a\s+few\s+|few\s+)?\d+\s+(?:days?|hours?|weeks?)\b/i, 4],
    [/\bnext\s+\d+\s+days?\b/i, 4],
    [/\b(?:after|once|when|as\s+soon\s+as)\s+(?:my\s+)?salary\b/i, 5],
    [/\bsalary\s+(?:will\s+come|comes|credit|arrives|gets\s+credited)\b/i, 4],
    [/\b(?:after|once|when)\s+(?:i\s+get|i\s+receive)\b/i, 3],
    [/\bas\s+soon\s+as\s+(?:possible|i\s+can|it\s+arrives|it\s+comes)\b/i, 3],
    [/\b(?:tomorrow|tonight|day\s+after)\b/i, 2],
    [/\bnext\s+week\b/i, 2],
    [/\bthis\s+(?:week|month)\b/i, 2],
    [/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, 2],
    [/\b\d{1,2}(?:st|nd|rd|th)\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i, 4],
  ],

  AFFIRM: [
    [/\b(?:that'?s\s+me|this\s+is\s+(?:he|she|rajesh|him|her))\b/i, 5],
    [/\bspeaking\b/i, 4],
    [/\b(?:yes|yeah|yep|yup)\b/i, 3],
    [/\b(?:haan|han|ji|ji\s+haan|ji\s+bilkul|bilkul)\b/i, 3],
    [/\bcorrect\b/i, 2],
    [/\babsolutely\b/i, 2],
    [/\bsure\b/i, 1],
  ],

  DENY: [
    [/\bwrong\s+(?:number|person)\b/i, 7],
    [/\b(?:i\s+am\s+)?not\s+rajesh\b/i, 7],
    [/\bnot\s+(?:me|him|her|the\s+right\s+person)\b/i, 5],
    [/\bdifferent\s+person\b/i, 5],
    [/^\s*(?:no|nope|nahi|nahin)\b/i, 2],
    [/\bnahi\b/i, 1],
  ],

  TIME_REQUEST: [
    [/\bhow\s+much\s+time\b/i, 8],
    [/\bgive\s+me\s+(?:some\s+|a\s+little\s+)?time\b/i, 7],
    [/\bneed\s+(?:some\s+|a\s+little\s+)?time\b/i, 7],
    [/\bneed\s+(?:a\s+few\s+more\s+|few\s+more\s+|some\s+more\s+|a\s+couple\s+(?:more\s+)?)days?\b/i, 7],
    [/\b(?:can\s+i\s+get|may\s+i\s+have)\s+(?:some\s+)?(?:time|days?|extension)\b/i, 7],
    [/\bextension\b/i, 6],
    [/\bgrace\s+period\b/i, 6],
    [/\b(?:thoda|kuch)\s+(?:time|din|days?)\b/i, 5],
  ],

  DISPUTE: [
    [/\bdispute\b/i, 7],
    [/\bnot\s+(?:my|the\s+correct)\s+(?:emi|amount|loan|account)\b/i, 7],
    [/\bwrong\s+(?:amount|emi|loan)\b/i, 6],
    [/\bi\s+don'?t\s+(?:have|owe)\s+(?:any\s+)?(?:loan|emi)\b/i, 7],
    [/\bnever\s+(?:took|applied\s+for)\s+(?:a\s+)?loan\b/i, 8],
  ],
};

function scoreIntent(text, signals) {
  let score = 0;
  const matched = [];
  for (const [re, weight] of signals) {
    if (re.test(text)) {
      score += weight;
      matched.push({ re: re.source, weight });
    }
  }
  return { score, matched };
}

const PRIORITY = ["DNC", "DISPUTE", "PAID", "PROMISE", "TIME_REQUEST", "AFFIRM", "DENY"];

export function classify(text) {
  if (!text || !text.trim()) return { intent: "EMPTY", score: 0, breakdown: {} };
  const t = text.trim();
  const breakdown = {};
  for (const intent of PRIORITY) {
    breakdown[intent] = scoreIntent(t, SIGNALS[intent]);
  }
  // Highest score wins; ties broken by PRIORITY order
  let winner = "UNCLEAR";
  let topScore = 0;
  for (const intent of PRIORITY) {
    const s = breakdown[intent].score;
    if (s > topScore) { topScore = s; winner = intent; }
  }
  return { intent: winner, score: topScore, breakdown };
}

// -------------------- STATE MACHINE --------------------

const STATES = {
  GREET: "GREET",
  AWAIT_CONFIRM: "AWAIT_CONFIRM",
  RETRY_CONFIRM: "RETRY_CONFIRM",
  AWAIT_REPLY: "AWAIT_REPLY",
  AWAIT_TIME: "AWAIT_TIME",      // user asked for time / extension
  AWAIT_FOLLOWUP: "AWAIT_FOLLOWUP",
  AWAIT_DISPUTE: "AWAIT_DISPUTE",
  WRAPUP: "WRAPUP",
};

export function createBrain({ customerName = "राजेश जी", amountInr = 4250, dueDay = "5 तारीख" } = {}) {
  const history = [];
  let state = STATES.GREET;
  let turn = 0;
  let outcome = null;
  let emptyStreak = 0;     // count of back-to-back silent replies
  let lastIntent = null;

  function push(who, text) {
    if (text && text.trim()) history.push({ who, text: text.trim() });
  }

  function nextTurn(userText) {
    if (userText !== undefined) push("customer", userText);
    const cls = userText !== undefined ? classify(userText) : null;
    const intent = cls?.intent ?? null;
    lastIntent = intent;
    if (intent === "EMPTY") emptyStreak += 1;
    else if (intent !== null) emptyStreak = 0;

    let say = "";
    let done = false;

    switch (state) {
      case STATES.GREET: {
        say = `नमस्ते, क्या मेरी बात ${customerName} से हो रही है? मैं Ritviz बोल रहा हूँ Vox Credit से।`;
        state = STATES.AWAIT_CONFIRM;
        break;
      }

      case STATES.AWAIT_CONFIRM: {
        if (intent === "DNC")        { ({ say, done } = finishDNC()); }
        else if (intent === "DISPUTE") {
          say = "Oh, मुझे लगता है कुछ confusion है sir. क्या आप confirm कर सकते हैं कि आपके नाम पे कोई active loan है हमारे साथ?";
          state = STATES.AWAIT_DISPUTE;
        }
        else if (intent === "DENY")  {
          say = "Oh sorry sir, शायद number mismatch हो गया। क्या यह EMI account का correct number है? या कोई और person available है?";
          state = STATES.RETRY_CONFIRM;
        }
        else {
          // AFFIRM, PAID-on-greeting, PROMISE-on-greeting, UNCLEAR — proceed to pitch
          if (intent === "PAID")       { ({ say, done } = finishPAID()); }
          else if (intent === "PROMISE") { ({ say, done } = finishPROMISED()); }
          else {
            say = `Thank you sir. Actually मैं आपकी EMI के बारे में call कर रहा हूँ — ₹${amountInr} का amount जो ${dueDay} को due था, वो अभी तक pending है। आप कब तक payment कर पाएंगे?`;
            state = STATES.AWAIT_REPLY;
          }
        }
        break;
      }

      case STATES.RETRY_CONFIRM: {
        if (intent === "DNC")       { ({ say, done } = finishDNC()); }
        else if (intent === "DENY" || intent === "EMPTY") {
          outcome = OUTCOMES.NO_ANSWER;
          say = "No problem sir, हम बाद में try करेंगे. Thank you for your time.";
          done = true; state = STATES.WRAPUP;
        }
        else if (intent === "PAID")    { ({ say, done } = finishPAID()); }
        else if (intent === "PROMISE") { ({ say, done } = finishPROMISED()); }
        else {
          say = `Thank you sir. Pending EMI ₹${amountInr} है, due date ${dueDay} थी। कब तक pay कर देंगे?`;
          state = STATES.AWAIT_REPLY;
        }
        break;
      }

      case STATES.AWAIT_REPLY: {
        if (intent === "PAID")        { ({ say, done } = finishPAID()); }
        else if (intent === "DNC")    { ({ say, done } = finishDNC()); }
        else if (intent === "PROMISE") { ({ say, done } = finishPROMISED()); }
        else if (intent === "TIME_REQUEST") {
          say = "बिल्कुल sir, हम आपको 3 din का grace period दे सकते हैं — no extra charge. कोई specific date confirm कर सकते हैं जिस दिन तक pay हो जाएगा?";
          state = STATES.AWAIT_TIME;
        }
        else if (intent === "DISPUTE") {
          say = "समझ गया sir. क्या आप confirm कर सकते हैं कि आपके नाम पे ये EMI nahi है? मैं verify करवा लेता हूँ team से.";
          state = STATES.AWAIT_DISPUTE;
        }
        else if (intent === "EMPTY") {
          say = "Hello? Sir, क्या आप line पे हैं? बस एक minute चाहिए payment date confirm करने के लिए।";
          state = STATES.AWAIT_FOLLOWUP;
        }
        else {
          // UNCLEAR / AFFIRM / DENY without strong signal → push for specific date
          say = "मैं समझ सकता हूँ sir. Actually हमारे पास 3 din का grace period है, no extra charge. आप कोई specific date confirm कर सकते हैं?";
          state = STATES.AWAIT_FOLLOWUP;
        }
        break;
      }

      case STATES.AWAIT_TIME: {
        if (intent === "PROMISE" || intent === "AFFIRM") { ({ say, done } = finishPROMISED()); }
        else if (intent === "PAID")   { ({ say, done } = finishPAID()); }
        else if (intent === "DNC")    { ({ say, done } = finishDNC()); }
        else if (intent === "EMPTY" && emptyStreak >= 2) {
          outcome = OUTCOMES.NO_ANSWER; done = true; state = STATES.WRAPUP;
          say = "Sir, मैं call disconnect कर रहा हूँ. हम बाद में दोबारा try करेंगे.";
        }
        else {
          outcome = OUTCOMES.NO_ANSWER; done = true; state = STATES.WRAPUP;
          say = "No problem sir, हम कुछ दिन बाद फिर से try करेंगे. Thank you.";
        }
        break;
      }

      case STATES.AWAIT_FOLLOWUP: {
        if (intent === "PAID")        { ({ say, done } = finishPAID()); }
        else if (intent === "PROMISE") { ({ say, done } = finishPROMISED()); }
        else if (intent === "DNC")    { ({ say, done } = finishDNC()); }
        else if (intent === "AFFIRM") { ({ say, done } = finishPROMISED()); }
        else {
          outcome = OUTCOMES.NO_ANSWER; done = true; state = STATES.WRAPUP;
          say = "No problem sir, हम कुछ दिन बाद फिर से try करेंगे. Thank you.";
        }
        break;
      }

      case STATES.AWAIT_DISPUTE: {
        if (intent === "DNC")     { ({ say, done } = finishDNC()); }
        else if (intent === "PAID")  { ({ say, done } = finishPAID()); }
        else if (intent === "PROMISE") { ({ say, done } = finishPROMISED()); }
        else {
          outcome = OUTCOMES.NO_ANSWER; done = true; state = STATES.WRAPUP;
          say = "ठीक है sir, मैं dispute as escalate कर देता हूँ. हमारी team अगले 24 hours में आपको call करेगी. Thank you.";
        }
        break;
      }

      default:
        done = true;
    }

    turn += 1;
    push("agent", say);
    return { say, done, outcome, intent, history: history.slice(), state };
  }

  // -------- terminal helpers --------
  function finishDNC() {
    outcome = OUTCOMES.DNC;
    state = STATES.WRAPUP;
    return { done: true, say: "ठीक है sir, मैं आपका number do-not-call list में डाल देता हूँ. आगे से हमारी तरफ़ से कोई call नहीं आएगी. Sorry for the disturbance." };
  }
  function finishPAID() {
    outcome = OUTCOMES.PAID;
    state = STATES.WRAPUP;
    return { done: true, say: "बहुत बढ़िया sir! मैं team से verify करवा लेता हूँ और records update कर देंगे. Thank you for your prompt payment." };
  }
  function finishPROMISED() {
    outcome = OUTCOMES.PROMISED;
    state = STATES.WRAPUP;
    return { done: true, say: "Perfect sir, मैं आपका payment commitment note कर रहा हूँ. SMS confirmation आ जाएगा. और ये पूरी conversation Monad blockchain पे attest हो गई है — fully transparent record. Thank you so much." };
  }

  function fullTranscript() {
    return history.map((h) => `${h.who === "agent" ? "Ritviz" : "Customer"}: ${h.text}`).join("\n");
  }

  function state_() { return { state, turn, outcome, history: history.slice(), lastIntent }; }

  return { nextTurn, fullTranscript, state: state_ };
}
