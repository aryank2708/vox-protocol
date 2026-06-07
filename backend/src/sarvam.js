// Thin proxy around Sarvam Bulbul v3 (TTS) and Saaras v3 (STT).
// Keeps the API key server-side.

const BASE = "https://api.sarvam.ai";

function headers(env, extra = {}) {
  return {
    "api-subscription-key": env.SARVAM_API_KEY,
    ...extra,
  };
}

export async function sarvamTTS(env, { text, speaker, language, model, codec = "mp3" }) {
  if (!env.SARVAM_API_KEY) throw new Error("SARVAM_API_KEY not configured");
  const body = {
    text,
    target_language_code: language || env.SARVAM_TTS_LANG || "en-IN",
    speaker: speaker || env.SARVAM_TTS_SPEAKER || "shubh",
    model: model || env.SARVAM_TTS_MODEL || "bulbul:v3",
    output_audio_codec: codec,
  };
  const r = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: headers(env, { "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.error?.message || `sarvam TTS ${r.status}`);
  }
  // Response shape: { request_id, audios: [base64String] }
  const audio = (data.audios || [])[0];
  if (!audio) throw new Error("sarvam TTS returned no audio");
  return {
    audio_base64: audio,
    mime: codec === "mp3" ? "audio/mpeg" : codec === "wav" ? "audio/wav" : "audio/opus",
    request_id: data.request_id,
  };
}

export async function sarvamSTT(env, { fileBuffer, filename = "audio.webm", language, model, mode = "transcribe" }) {
  if (!env.SARVAM_API_KEY) throw new Error("SARVAM_API_KEY not configured");
  const form = new FormData();
  // Blob from a Buffer for undici/fetch
  form.append("file", new Blob([fileBuffer]), filename);
  form.append("model", model || env.SARVAM_STT_MODEL || "saaras:v3");
  form.append("mode", mode);
  form.append("language_code", language || env.SARVAM_STT_LANG || "en-IN");

  const r = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: headers(env), // do NOT set content-type; FormData sets boundary
    body: form,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.error?.message || `sarvam STT ${r.status}`);
  }
  // Response: { request_id, transcript, language_code }
  return {
    transcript: data.transcript || "",
    language_code: data.language_code,
    request_id: data.request_id,
  };
}
