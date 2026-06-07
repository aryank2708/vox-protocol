import { ethers } from "ethers";
import { createRequire } from "node:module";

// Works in both ESM and CJS-compiled (Vercel) environments.
const require = createRequire(import.meta.url);
const registryAbi = require("../abi/AgentRegistry.json");
const attestationAbi = require("../abi/CallAttestation.json");
const escrowAbi = require("../abi/ReputationEscrow.json");

export function buildChain(env) {
  const provider = new ethers.JsonRpcProvider(env.MONAD_RPC_URL, {
    chainId: Number(env.CHAIN_ID),
    name: "monad-testnet",
  });

  if (!env.PRIVATE_KEY || !env.PRIVATE_KEY.startsWith("0x")) {
    throw new Error("PRIVATE_KEY missing or malformed in .env");
  }
  const signer = new ethers.Wallet(env.PRIVATE_KEY, provider);

  const registry = env.AGENT_REGISTRY_ADDRESS
    ? new ethers.Contract(env.AGENT_REGISTRY_ADDRESS, registryAbi.abi, signer)
    : null;
  const attestations = env.CALL_ATTESTATION_ADDRESS
    ? new ethers.Contract(env.CALL_ATTESTATION_ADDRESS, attestationAbi.abi, signer)
    : null;
  const escrow = env.REPUTATION_ESCROW_ADDRESS
    ? new ethers.Contract(env.REPUTATION_ESCROW_ADDRESS, escrowAbi.abi, signer)
    : null;

  return {
    provider,
    signer,
    registry,
    attestations,
    escrow,
    abis: { registryAbi, attestationAbi, escrowAbi },
    explorer: env.EXPLORER_URL,
  };
}

export const OUTCOMES = ["PAID", "PROMISED", "NO_ANSWER", "DNC"];

export function outcomeToEnum(o) {
  const i = OUTCOMES.indexOf(o);
  if (i < 0) throw new Error(`Unknown outcome ${o}`);
  return i;
}

export function outcomeFromEnum(i) {
  return OUTCOMES[Number(i)] ?? "UNKNOWN";
}

const AGENT_TYPES = ["COLLECTIONS", "ONBOARDING", "REMINDER", "SUPPORT", "OTHER"];
export function agentTypeToEnum(t) {
  const i = AGENT_TYPES.indexOf(t);
  return i < 0 ? AGENT_TYPES.indexOf("OTHER") : i;
}
export function agentTypeFromEnum(i) {
  return AGENT_TYPES[Number(i)] ?? "OTHER";
}
