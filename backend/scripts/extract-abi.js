#!/usr/bin/env node
// Pull ABI + bytecode out of forge build artifacts into /shared and /backend/abi
// + /frontend/src/abi so both apps can import them without depending on Foundry.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const outDir = path.join(root, "contracts", "out");

const targets = ["AgentRegistry", "CallAttestation", "ReputationEscrow"];

const writeTo = [
  path.join(root, "shared", "abi"),
  path.join(root, "backend", "abi"),
  path.join(root, "frontend", "src", "abi"),
];

writeTo.forEach((d) => fs.mkdirSync(d, { recursive: true }));

for (const name of targets) {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(outDir, `${name}.sol`, `${name}.json`), "utf8")
  );
  const slim = {
    contractName: name,
    abi: artifact.abi,
    bytecode: artifact.bytecode?.object,
  };
  for (const d of writeTo) {
    fs.writeFileSync(path.join(d, `${name}.json`), JSON.stringify(slim, null, 2));
  }
  console.log(`extracted ${name}`);
}
