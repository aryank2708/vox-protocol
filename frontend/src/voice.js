// Browser voice helpers: mic recording + audio playback.
// STT/TTS themselves are done server-side via /api/stt and /api/tts.

const base = "/api";

export async function ttsSpeak(text) {
  const r = await fetch(`${base}/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `TTS ${r.status}`);
  return playBase64Audio(data.audio_base64, data.mime || "audio/mpeg");
}

export function playBase64Audio(b64, mime = "audio/mpeg") {
  return new Promise((resolve, reject) => {
    const audio = new Audio(`data:${mime};base64,${b64}`);
    audio.onended = () => resolve();
    audio.onerror = (e) => reject(new Error("audio playback failed"));
    audio.play().catch(reject);
  });
}

// Records from the mic until stop() is called, returns the resulting Blob.
export async function startRecorder() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // Pick the first mime type the browser supports.
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  const mime = candidates.find((c) => window.MediaRecorder?.isTypeSupported?.(c)) || "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };

  const stopped = new Promise((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mime || "audio/webm" });
      resolve(blob);
    };
  });

  rec.start(250);
  return {
    stop: () => { if (rec.state !== "inactive") rec.stop(); return stopped; },
    state: () => rec.state,
  };
}

export async function sttTranscribe(blob, { language = "en-IN" } = {}) {
  const form = new FormData();
  const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
  form.append("file", blob, `utterance.${ext}`);
  form.append("language", language);
  const r = await fetch(`${base}/stt`, { method: "POST", body: form });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `STT ${r.status}`);
  return data.transcript || "";
}
