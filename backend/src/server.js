import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { ethers } from "ethers";
import {
  buildChain,
  outcomeToEnum,
  outcomeFromEnum,
  agentTypeToEnum,
  agentTypeFromEnum,
} from "./chain.js";
import { sarvamTTS, sarvamSTT } from "./sarvam.js";

const env = process.env;
const chain = buildChain(env);

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "2mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const explorerTx = (hash) => `${chain.explorer}/tx/${hash}`;
const explorerAddr = (a) => `${chain.explorer}/address/${a}`;

app.get("/health", async (_req, res) => {
  const block = await chain.provider.getBlockNumber().catch(() => null);
  res.json({
    ok: true,
    chainId: Number(env.CHAIN_ID),
    block,
    signer: await chain.signer.getAddress(),
    contracts: {
      registry: env.AGENT_REGISTRY_ADDRESS || null,
      attestations: env.CALL_ATTESTATION_ADDRESS || null,
      escrow: env.REPUTATION_ESCROW_ADDRESS || null,
    },
  });
});

app.get("/config", (_req, res) => {
  res.json({
    chainId: Number(env.CHAIN_ID),
    rpc: env.MONAD_RPC_URL,
    explorer: env.EXPLORER_URL,
    contracts: {
      registry: env.AGENT_REGISTRY_ADDRESS,
      attestations: env.CALL_ATTESTATION_ADDRESS,
      escrow: env.REPUTATION_ESCROW_ADDRESS,
    },
  });
});

// POST /register-agent
// body: { wallet?, name, agentType, authorizedActions }
// If wallet omitted, a new ephemeral wallet is generated and returned.
app.post("/register-agent", async (req, res) => {
  try {
    if (!chain.registry) throw new Error("AGENT_REGISTRY_ADDRESS not configured");
    const { name, agentType = "COLLECTIONS", authorizedActions = "" } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "name required" });

    let wallet = req.body?.wallet;
    let ephemeral = null;
    if (!wallet) {
      const w = ethers.Wallet.createRandom();
      wallet = w.address;
      ephemeral = { address: w.address, privateKey: w.privateKey };
    }

    const tx = await chain.registry.registerAgent(
      wallet,
      name,
      agentTypeToEnum(agentType),
      authorizedActions
    );
    const receipt = await tx.wait();

    res.json({
      ok: true,
      wallet,
      ephemeral,
      tx: { hash: tx.hash, explorer: explorerTx(tx.hash), blockNumber: receipt?.blockNumber },
    });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

// POST /attest-call
// body: { agent, transcriptHash?, transcript?, outcome, duration }
app.post("/attest-call", async (req, res) => {
  try {
    if (!chain.attestations) throw new Error("CALL_ATTESTATION_ADDRESS not configured");
    const { agent, outcome, duration } = req.body ?? {};
    if (!agent) return res.status(400).json({ error: "agent required" });
    if (outcome == null) return res.status(400).json({ error: "outcome required" });

    let transcriptHash = req.body?.transcriptHash;
    if (!transcriptHash) {
      const transcript = req.body?.transcript ?? "";
      transcriptHash = ethers.keccak256(ethers.toUtf8Bytes(transcript));
    }

    const tx = await chain.attestations.attestCall(
      agent,
      transcriptHash,
      outcomeToEnum(outcome),
      Math.max(0, Math.floor(Number(duration ?? 0)))
    );
    const receipt = await tx.wait();

    let callId = null;
    for (const log of receipt?.logs ?? []) {
      try {
        const parsed = chain.attestations.interface.parseLog(log);
        if (parsed?.name === "CallAttested") {
          callId = Number(parsed.args.id);
          break;
        }
      } catch {}
    }

    res.json({
      ok: true,
      callId,
      transcriptHash,
      tx: { hash: tx.hash, explorer: explorerTx(tx.hash), blockNumber: receipt?.blockNumber },
    });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

// POST /release-call  body: { callId, merchant }
app.post("/release-call", async (req, res) => {
  try {
    if (!chain.escrow) throw new Error("REPUTATION_ESCROW_ADDRESS not configured");
    const { callId, merchant } = req.body ?? {};
    if (callId == null || !merchant) {
      return res.status(400).json({ error: "callId and merchant required" });
    }
    const tx = await chain.escrow.releaseForCall(callId, merchant);
    const receipt = await tx.wait();
    res.json({ ok: true, tx: { hash: tx.hash, explorer: explorerTx(tx.hash), blockNumber: receipt?.blockNumber } });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

// POST /escrow/deposit  body: { amount }  (amount in MON, ether-string)
app.post("/escrow/deposit", async (req, res) => {
  try {
    if (!chain.escrow) throw new Error("REPUTATION_ESCROW_ADDRESS not configured");
    const { amount = "0.1" } = req.body ?? {};
    const value = ethers.parseEther(String(amount));
    const tx = await chain.escrow.deposit({ value });
    const receipt = await tx.wait();
    res.json({ ok: true, tx: { hash: tx.hash, explorer: explorerTx(tx.hash), blockNumber: receipt?.blockNumber } });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

// GET /agent/:address — profile + reputation + recent calls
app.get("/agent/:address", async (req, res) => {
  try {
    if (!chain.registry || !chain.attestations || !chain.escrow) {
      throw new Error("contracts not configured");
    }
    const address = ethers.getAddress(req.params.address);
    const a = await chain.registry.getAgent(address);
    if (a.wallet === ethers.ZeroAddress) return res.status(404).json({ error: "agent not registered" });

    const [reputation, totalReleased, callCount] = await Promise.all([
      chain.escrow.reputation(address),
      chain.escrow.totalReleased(address),
      chain.attestations.getAgentCallCount(address),
    ]);

    const recent = await chain.attestations.recentCallsForAgent(address, 10);

    res.json({
      address,
      profile: {
        name: a.name,
        agentType: agentTypeFromEnum(a.agentType),
        authorizedActions: a.authorizedActions,
        operator: a.operator,
        registeredAt: Number(a.registeredAt),
        active: a.active,
        explorer: explorerAddr(address),
      },
      reputation: Number(reputation),
      totalReleasedWei: totalReleased.toString(),
      totalReleased: ethers.formatEther(totalReleased),
      callCount: Number(callCount),
      recentCalls: recent.map((c) => ({
        id: Number(c.id),
        transcriptHash: c.transcriptHash,
        outcome: outcomeFromEnum(c.outcome),
        timestamp: Number(c.timestamp),
        duration: Number(c.duration),
        attester: c.attester,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

// GET /calls/recent?limit=10  — feed across all agents
app.get("/calls/recent", async (req, res) => {
  try {
    if (!chain.attestations) throw new Error("CALL_ATTESTATION_ADDRESS not configured");
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
    const calls = await chain.attestations.recentCalls(limit);
    res.json({
      calls: calls.map((c) => ({
        id: Number(c.id),
        agent: c.agent,
        transcriptHash: c.transcriptHash,
        outcome: outcomeFromEnum(c.outcome),
        timestamp: Number(c.timestamp),
        duration: Number(c.duration),
        attester: c.attester,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

// GET /escrow/state?merchant=0x..
app.get("/escrow/state", async (req, res) => {
  try {
    if (!chain.escrow) throw new Error("REPUTATION_ESCROW_ADDRESS not configured");
    const merchant = req.query.merchant
      ? ethers.getAddress(String(req.query.merchant))
      : await chain.signer.getAddress();
    const [balance, total] = await Promise.all([
      chain.escrow.merchantBalance(merchant),
      chain.escrow.totalReleases(),
    ]);
    const releases = await chain.escrow.recentReleases(Math.min(20, Number(total)));
    res.json({
      merchant,
      balanceWei: balance.toString(),
      balance: ethers.formatEther(balance),
      releases: releases.map((r) => ({
        callId: Number(r.callId),
        agent: r.agent,
        operator: r.operator,
        merchant: r.merchant,
        amount: ethers.formatEther(r.amount),
        outcome: outcomeFromEnum(r.outcome),
        timestamp: Number(r.timestamp),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.shortMessage || e.message });
  }
});

// ---------- Sarvam voice ----------

// POST /tts  body: { text, speaker?, language?, codec? }
app.post("/tts", async (req, res) => {
  try {
    const { text } = req.body ?? {};
    if (!text || typeof text !== "string") return res.status(400).json({ error: "text required" });
    const out = await sarvamTTS(env, {
      text,
      speaker: req.body?.speaker,
      language: req.body?.language,
      model: req.body?.model,
      codec: req.body?.codec,
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /stt   multipart: file=<audio blob>;  optional fields: language, mode
app.post("/stt", upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: "file required" });
    const out = await sarvamSTT(env, {
      fileBuffer: req.file.buffer,
      filename: req.file.originalname || "audio.webm",
      language: req.body?.language,
      mode: req.body?.mode || env.SARVAM_STT_MODE || "translate",
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Local dev: start an HTTP server only when run directly (not when imported
// by the Vercel serverless handler in /api/index.js).
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/server.js") ||
  process.argv[1]?.endsWith("\\server.js");

if (isDirectRun) {
  const port = Number(env.PORT || 8787);
  app.listen(port, () => {
    console.log(`vox-backend listening on :${port}`);
  });
}

export default app;
