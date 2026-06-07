import React, { useEffect, useRef, useState } from "react";
import { createBrain } from "../botBrain.js";
import { ttsSpeak, startRecorder, sttTranscribe } from "../voice.js";

const PHASE = {
  IDLE: "idle",
  CONNECTING: "connecting",
  SPEAKING: "speaking",
  LISTENING: "listening",
  THINKING: "thinking",
  ENDED: "ended",
  ERROR: "error",
};

const PHASE_LABEL = {
  [PHASE.IDLE]: "idle",
  [PHASE.CONNECTING]: "connecting",
  [PHASE.SPEAKING]: "agent · speaking",
  [PHASE.LISTENING]: "customer · listening",
  [PHASE.THINKING]: "saaras · transcribing",
  [PHASE.ENDED]: "ended",
  [PHASE.ERROR]: "error",
};

// Max time the mic stays open per turn. If the user doesn't hit "Done speaking"
// within this window, we discard the recording (no Sarvam STT call) and wrap
// the call as NO_ANSWER. Keeps idle browser tabs from burning credits.
const LISTEN_TIMEOUT_SEC = 15;

export default function CallSession({ onCallEnd, disabled }) {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [transcript, setTranscript] = useState([]);
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [listenRemaining, setListenRemaining] = useState(LISTEN_TIMEOUT_SEC);

  const brainRef = useRef(null);
  const recRef = useRef(null);
  const startedAt = useRef(null);
  const elapsedTimer = useRef(null);
  const cancelledRef = useRef(false);
  const listenTimerRef = useRef(null);     // setInterval that ticks listenRemaining
  const listenDeadlineRef = useRef(null);  // setTimeout that fires at 15s

  function clearListenTimers() {
    if (listenTimerRef.current) { clearInterval(listenTimerRef.current); listenTimerRef.current = null; }
    if (listenDeadlineRef.current) { clearTimeout(listenDeadlineRef.current); listenDeadlineRef.current = null; }
  }

  useEffect(() => () => {
    cancelledRef.current = true;
    if (recRef.current) recRef.current.stop().catch(() => {});
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    clearListenTimers();
  }, []);

  function tickElapsed() {
    if (!startedAt.current) return;
    setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
  }

  async function speakAndAppend(text) {
    setTranscript((t) => [...t, { who: "agent", text }]);
    setPhase(PHASE.SPEAKING);
    await ttsSpeak(text);
  }

  async function listenOnce() {
    setPhase(PHASE.LISTENING);
    setListenRemaining(LISTEN_TIMEOUT_SEC);
    const rec = await startRecorder();
    recRef.current = rec;

    // Hard timeout: discard recording, no STT call, wrap as NO_ANSWER.
    clearListenTimers();
    const startedAtTimer = Date.now();
    listenTimerRef.current = setInterval(() => {
      const left = Math.max(0, LISTEN_TIMEOUT_SEC - Math.floor((Date.now() - startedAtTimer) / 1000));
      setListenRemaining(left);
    }, 250);
    listenDeadlineRef.current = setTimeout(() => {
      handleListenTimeout();
    }, LISTEN_TIMEOUT_SEC * 1000);

    return { stop: rec.stop };
  }

  // No user input within the listen window. Stop the mic, throw away the audio,
  // skip Sarvam STT, and finish the call as NO_ANSWER.
  async function handleListenTimeout() {
    clearListenTimers();
    if (!recRef.current || cancelledRef.current) return;
    try { await recRef.current.stop(); } catch {}
    recRef.current = null;
    setTranscript((t) => [...t, { who: "customer", text: "(no response — 15s timeout)" }]);
    setPhase(PHASE.SPEAKING);
    const closing = "Sir, मैं call disconnect कर रहा हूँ. हम बाद में दोबारा try करेंगे. Thank you.";
    setTranscript((t) => [...t, { who: "agent", text: closing }]);
    try { await ttsSpeak(closing); } catch {}
    finishCall("NO_ANSWER");
  }

  async function handleStop() {
    if (!recRef.current) return;
    clearListenTimers();
    setPhase(PHASE.THINKING);
    const blob = await recRef.current.stop();
    recRef.current = null;
    let text = "";
    try {
      text = (await sttTranscribe(blob)).trim();
    } catch (e) {
      text = "";
    }
    if (text) setTranscript((t) => [...t, { who: "customer", text }]);
    if (cancelledRef.current) return;
    const turn = brainRef.current.nextTurn(text);
    await speakAndAppend(turn.say);
    if (turn.done) {
      finishCall(turn.outcome);
    } else {
      await listenOnce();
    }
  }

  async function finishCall(detected) {
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    clearListenTimers();
    const fullSeconds = Math.max(1, Math.floor((Date.now() - startedAt.current) / 1000));
    const finalOutcome = detected || "NO_ANSWER";
    setOutcome(finalOutcome);
    setPhase(PHASE.ENDED);
    const fullText = brainRef.current.fullTranscript();
    onCallEnd?.({ outcome: finalOutcome, transcript: fullText, durationSec: fullSeconds });
  }

  async function startCall() {
    setError(null);
    setTranscript([]);
    setOutcome(null);
    cancelledRef.current = false;
    setPhase(PHASE.CONNECTING);
    try {
      brainRef.current = createBrain();
      startedAt.current = Date.now();
      setElapsed(0);
      elapsedTimer.current = setInterval(tickElapsed, 500);
      const turn = brainRef.current.nextTurn();
      await speakAndAppend(turn.say);
      if (turn.done) { finishCall(turn.outcome); return; }
      await listenOnce();
    } catch (e) {
      setError(e.message);
      setPhase(PHASE.ERROR);
    }
  }

  function endCallManually() {
    cancelledRef.current = true;
    clearListenTimers();
    if (recRef.current) recRef.current.stop().catch(() => {});
    const detected = brainRef.current?.state()?.outcome || "NO_ANSWER";
    finishCall(detected);
  }

  const active = phase !== PHASE.IDLE && phase !== PHASE.ENDED && phase !== PHASE.ERROR;
  const isLive = phase === PHASE.LISTENING || phase === PHASE.SPEAKING || phase === PHASE.THINKING;

  return (
    <div className="panel" id="call">
      <div className="panel-head">
        <div className="left">
          <span className="id">03</span>· Live call
          {isLive && <span className={`pulse ${phase === PHASE.SPEAKING ? "solder" : ""}`} style={{ marginLeft: 8 }} />}
        </div>
        <div className="right">
          <span className="mono">vox credit · EMI followup · hi-IN · shubh</span>
        </div>
      </div>
      <div className="panel-body">
        <div className="phase-strip">
          <div className="left">
            <span style={{ color: "var(--solder)" }}>STATE</span>
            <span>{PHASE_LABEL[phase]}{error ? ` — ${error}` : ""}</span>
            {phase === PHASE.LISTENING && (
              <span
                className="clock"
                style={{ color: listenRemaining <= 5 ? "var(--solder)" : "var(--fg-3)", marginLeft: 8 }}
              >
                · auto-end in {listenRemaining}s
              </span>
            )}
          </div>
          <div className="row">
            <span className="clock">{active ? `${elapsed}s` : phase === PHASE.ENDED ? `${elapsed}s · ${outcome}` : "—"}</span>
            {phase === PHASE.LISTENING && (
              <button className="btn ghost" onClick={handleStop}>Done speaking</button>
            )}
            {phase === PHASE.IDLE || phase === PHASE.ENDED || phase === PHASE.ERROR ? (
              <button className="btn" onClick={startCall} disabled={disabled}>
                {phase === PHASE.ENDED ? "New call" : "Start call"}
              </button>
            ) : (
              <button className="btn ghost" onClick={endCallManually}>End call</button>
            )}
          </div>
        </div>

        <div className="transcript">
          {transcript.length === 0 && phase === PHASE.IDLE && (
            <div className="empty">
              Press <b style={{ color: "var(--fg)" }}>Start call</b>. Ritviz (Bulbul v3, voice: Shubh) speaks
              first in Hinglish. Reply naturally — Hindi, English, or Hinglish — Saaras v3 translates each
              utterance to English so the on-device classifier can pick the right outcome. The transcript
              gets keccak256-hashed and committed to{" "}
              <span className="mono" style={{ color: "var(--fg)" }}>CallAttestation</span> on Monad.
            </div>
          )}
          {transcript.map((l, i) => (
            <div className="line" key={i}>
              <span className={`who ${l.who}`}>{l.who === "agent" ? "Ritviz" : "You"}</span>
              <span className="body">{l.text}</span>
            </div>
          ))}
          {phase === PHASE.ENDED && outcome && (
            <div style={{ marginTop: 12 }}>
              <span className={`badge ${outcome}`}>{outcome.replace("_", " ")}</span>{" "}
              <span className="empty" style={{ marginLeft: 8 }}>attesting on monad…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
