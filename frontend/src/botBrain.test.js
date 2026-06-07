// Run with:  node --test frontend/src/botBrain.test.js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classify, createBrain, OUTCOMES } from "./botBrain.js";

describe("classifier · PAID", () => {
  for (const phrase of [
    "I already paid",
    "I have already paid the EMI",
    "I've paid",
    "payment is done",
    "payment is completed",
    "I paid yesterday",
    "transferred yesterday",
    "EMI is cleared",
    "EMI is settled",
    "made the payment just now",
  ]) {
    test(`"${phrase}" → PAID`, () => {
      assert.equal(classify(phrase).intent, "PAID");
    });
  }
});

describe("classifier · PROMISE", () => {
  for (const phrase of [
    "I will pay tomorrow",
    "I'll pay by Friday",
    "I will make the payment within 3 days",          // the originally broken case
    "I'll pay in next 3 days",
    "I will pay in the next 3 days",
    "I'll pay it within a week",
    "I'll transfer the amount tomorrow",
    "I will deposit it by the 10th",
    "I'll clear it by Monday",
    "going to pay by tonight",
    "I'm gonna pay tomorrow",
    "I'll pay after salary",
    "I will pay once my salary comes",
    "as soon as my salary arrives I'll pay",
    "I promise to pay by 15th",
    "let me pay it tomorrow",
    "I can pay by Friday",
    "I'll pay it by end of the week",
    "I'll pay by end of the month",
  ]) {
    test(`"${phrase}" → PROMISE`, () => {
      assert.equal(classify(phrase).intent, "PROMISE");
    });
  }
});

describe("classifier · PROMISE wins when DENY is also present", () => {
  for (const phrase of [
    "No, I will pay within 3 days",
    "No but I'll pay tomorrow",
    "Nahi but I'll transfer by Friday",
  ]) {
    test(`"${phrase}" → PROMISE`, () => {
      assert.equal(classify(phrase).intent, "PROMISE");
    });
  }
});

describe("classifier · DNC", () => {
  for (const phrase of [
    "stop calling me",
    "please stop calling",
    "don't call me again",
    "do not call this number",
    "remove my number",
    "delete my contact",
    "leave me alone",
    "this is harassment",
    "I am not interested",
    "block me",
  ]) {
    test(`"${phrase}" → DNC`, () => {
      assert.equal(classify(phrase).intent, "DNC");
    });
  }
});

describe("classifier · AFFIRM (name confirmation)", () => {
  for (const phrase of [
    "yes speaking",
    "yes that's me",
    "haan ji",
    "ji haan",
    "speaking, yes",
    "yes this is Rajesh",
  ]) {
    test(`"${phrase}" → AFFIRM`, () => {
      assert.equal(classify(phrase).intent, "AFFIRM");
    });
  }
});

describe("classifier · DENY", () => {
  for (const phrase of [
    "wrong number",
    "not me sir",
    "no, this is different person",
    "I am not Rajesh",
  ]) {
    test(`"${phrase}" → DENY`, () => {
      assert.equal(classify(phrase).intent, "DENY");
    });
  }
});

describe("classifier · TIME_REQUEST", () => {
  for (const phrase of [
    "give me some time",
    "I need some time",
    "can I get an extension",
    "please give me a grace period",
    "I need a few more days",
  ]) {
    test(`"${phrase}" → TIME_REQUEST`, () => {
      assert.equal(classify(phrase).intent, "TIME_REQUEST");
    });
  }
});

describe("classifier · DISPUTE", () => {
  for (const phrase of [
    "I never took a loan from you",
    "this is not my EMI",
    "wrong amount",
    "I don't have any loan with your company",
    "this is a dispute",
  ]) {
    test(`"${phrase}" → DISPUTE`, () => {
      assert.equal(classify(phrase).intent, "DISPUTE");
    });
  }
});

describe("classifier · UNCLEAR / EMPTY", () => {
  test("empty string → EMPTY", () => assert.equal(classify("").intent, "EMPTY"));
  test("whitespace → EMPTY", () => assert.equal(classify("   ").intent, "EMPTY"));
  test("noise → UNCLEAR", () => assert.equal(classify("umm what").intent, "UNCLEAR"));
  test("greeting noise → UNCLEAR", () => assert.equal(classify("hello hello").intent, "UNCLEAR"));
});

// -------- state machine --------

describe("state machine · happy path: greet → confirm → promise → wrapup", () => {
  const b = createBrain();
  test("greeting emitted", () => {
    const t = b.nextTurn();
    assert.match(t.say, /Vox Credit/);
    assert.equal(t.done, false);
  });
  test("name confirmation → pitch", () => {
    const t = b.nextTurn("yes speaking");
    assert.match(t.say, /EMI/);
    assert.equal(t.done, false);
  });
  test("promise within 3 days → PROMISED wrap", () => {
    const t = b.nextTurn("I will pay within 3 days");
    assert.equal(t.outcome, OUTCOMES.PROMISED);
    assert.equal(t.done, true);
  });
});

describe("state machine · the originally broken case", () => {
  // Reproduce the exact transcript that misclassified earlier
  const b = createBrain();
  b.nextTurn();
  b.nextTurn("yes I am Rajesh");
  test('"I will make the payment within 3 days" → PROMISED', () => {
    const t = b.nextTurn("I will make the payment within 3 days");
    assert.equal(t.outcome, OUTCOMES.PROMISED);
  });
});

describe("state machine · PAID short-circuit", () => {
  const b = createBrain();
  b.nextTurn();
  b.nextTurn("speaking");
  test("already paid → PAID wrap", () => {
    const t = b.nextTurn("I already paid yesterday");
    assert.equal(t.outcome, OUTCOMES.PAID);
    assert.equal(t.done, true);
  });
});

describe("state machine · DNC short-circuit on greeting", () => {
  const b = createBrain();
  b.nextTurn();
  test("stop calling on greeting → DNC immediately", () => {
    const t = b.nextTurn("stop calling me");
    assert.equal(t.outcome, OUTCOMES.DNC);
    assert.equal(t.done, true);
  });
});

describe("state machine · silent customer → NO_ANSWER", () => {
  const b = createBrain();
  b.nextTurn();
  b.nextTurn("yes");      // confirm name
  b.nextTurn("");         // silence on pitch → followup
  test("second silence → NO_ANSWER", () => {
    const t = b.nextTurn("");
    assert.equal(t.outcome, OUTCOMES.NO_ANSWER);
    assert.equal(t.done, true);
  });
});

describe("state machine · wrong number twice → NO_ANSWER", () => {
  const b = createBrain();
  b.nextTurn();
  b.nextTurn("wrong number");
  test("second denial → NO_ANSWER", () => {
    const t = b.nextTurn("still not me");
    assert.equal(t.outcome, OUTCOMES.NO_ANSWER);
  });
});

describe("state machine · two-turn hedge then commit", () => {
  const b = createBrain();
  b.nextTurn();
  b.nextTurn("yes");
  test("hedged first reply → followup, not wrapped", () => {
    const t = b.nextTurn("umm let me think");
    assert.equal(t.done, false);
  });
  test("second reply commits → PROMISED", () => {
    const t = b.nextTurn("I will pay by Friday");
    assert.equal(t.outcome, OUTCOMES.PROMISED);
  });
});

describe("state machine · TIME_REQUEST then commit", () => {
  const b = createBrain();
  b.nextTurn();
  b.nextTurn("yes");
  test('"give me some time" → AWAIT_TIME (not wrap)', () => {
    const t = b.nextTurn("please give me some time");
    assert.equal(t.done, false);
    assert.match(t.say, /grace period/i);
  });
  test('"yes by Friday" → PROMISED', () => {
    const t = b.nextTurn("yes by Friday");
    assert.equal(t.outcome, OUTCOMES.PROMISED);
  });
});

describe("state machine · DISPUTE path", () => {
  const b = createBrain();
  b.nextTurn();
  b.nextTurn("yes");
  test('"I never took a loan" → AWAIT_DISPUTE', () => {
    const t = b.nextTurn("I never took a loan from you");
    assert.equal(t.done, false);
    assert.match(t.say, /verify/i);
  });
});

describe("classifier · score breakdown is exposed", () => {
  test("returns scored breakdown for debugging", () => {
    const c = classify("No, I will pay within 3 days");
    assert.equal(c.intent, "PROMISE");
    assert.ok(c.breakdown.PROMISE.score >= 5, "PROMISE score should be strong");
    assert.ok(c.breakdown.DENY.score >= 1, "DENY should still register but lose");
    assert.ok(c.breakdown.PROMISE.score > c.breakdown.DENY.score);
  });
});
