const base = "/api";

async function json(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
}

export const api = {
  config: () => json("GET", "/config"),
  health: () => json("GET", "/health"),
  registerAgent: (b) => json("POST", "/register-agent", b),
  attestCall: (b) => json("POST", "/attest-call", b),
  releaseCall: (b) => json("POST", "/release-call", b),
  agent: (addr) => json("GET", `/agent/${addr}`),
  recentCalls: (limit = 10) => json("GET", `/calls/recent?limit=${limit}`),
  escrowState: (merchant) =>
    json("GET", `/escrow/state${merchant ? `?merchant=${merchant}` : ""}`),
  escrowDeposit: (amount) => json("POST", "/escrow/deposit", { amount }),
};
