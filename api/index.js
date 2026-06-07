// Vercel serverless wrapper around the Express app.
// Strips the `/api` prefix from incoming URLs so the Express routes
// (/health, /tts, /stt, /attest-call, …) keep matching unchanged.

import app from "../backend/src/server.js";

export default function handler(req, res) {
  if (req.url) {
    req.url = req.url.replace(/^\/api(\/|$)/, "/") || "/";
  }
  return app(req, res);
}

// Vercel needs to know not to pre-parse the body for the multipart STT route.
export const config = {
  api: {
    bodyParser: false,
  },
};
