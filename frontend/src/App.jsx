import React, { useEffect, useState, useCallback, useRef } from "react";
import { api } from "./api.js";
import AgentCard from "./components/AgentCard.jsx";
import CallFeed from "./components/CallFeed.jsx";
import EscrowCard from "./components/EscrowCard.jsx";
import CallSession from "./components/CallSession.jsx";
import Aperture from "./components/Aperture.jsx";

const STORAGE_KEY = "vox.agentAddress";

function useToast() {
  const [msg, setMsg] = useState(null);
  const ref = useRef();
  const show = useCallback((m, ms = 5000) => {
    setMsg(m);
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => setMsg(null), ms);
  }, []);
  return [msg, show];
}

function short(s, head = 6, tail = 4) {
  if (!s) return "—";
  return s.length > head + tail + 1 ? s.slice(0, head) + "…" + s.slice(-tail) : s;
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [health, setHealth] = useState(null);
  const [agentAddress, setAgentAddress] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [agent, setAgent] = useState(null);
  const [feed, setFeed] = useState([]);
  const [escrow, setEscrow] = useState(null);
  const [callTx, setCallTx] = useState({});
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  const refresh = useCallback(async () => {
    try {
      const [c, h, recent] = await Promise.all([
        config ? Promise.resolve(config) : api.config(),
        api.health().catch(() => null),
        api.recentCalls(10).catch(() => ({ calls: [] })),
      ]);
      if (!config) setConfig(c);
      setHealth(h);
      setFeed(recent.calls || []);
      if (agentAddress) setAgent(await api.agent(agentAddress).catch(() => null));
      setEscrow(await api.escrowState().catch(() => null));
    } catch (e) {
      showToast(`Refresh failed: ${e.message}`);
    }
  }, [agentAddress, config, showToast]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  async function ensureAgent() {
    if (agentAddress) return agentAddress;
    showToast("Registering demo agent on AgentRegistry…");
    const r = await api.registerAgent({
      name: "Vox Demo · Ritviz",
      agentType: "COLLECTIONS",
      authorizedActions: "emi_reminder,payment_promise,call_log",
    });
    setAgentAddress(r.wallet);
    localStorage.setItem(STORAGE_KEY, r.wallet);
    showToast(`Agent registered · tx ${r.tx.hash.slice(0, 10)}…`);
    return r.wallet;
  }

  async function ensureEscrow() {
    const state = await api.escrowState().catch(() => null);
    if (state && Number(state.balance) >= 0.1) return;
    try {
      showToast("Funding escrow with 0.2 MON…");
      const r = await api.escrowDeposit("0.2");
      showToast(`Escrow funded · tx ${r.tx.hash.slice(0, 10)}…`);
    } catch (e) {
      showToast(`Escrow deposit failed: ${e.message}`);
    }
  }

  async function onCallEnd({ outcome, transcript, durationSec }) {
    try {
      setBusy(true);
      const addr = await ensureAgent();
      await ensureEscrow();
      showToast(`Call ended (${outcome}) · attesting onchain…`);
      const att = await api.attestCall({ agent: addr, transcript, outcome, duration: durationSec });
      setCallTx((m) => ({ ...m, [att.callId]: att.tx.hash }));
      showToast(`Attested #${att.callId} · tx ${att.tx.hash.slice(0, 10)}…`);
      try {
        const merchant = escrow?.merchant || (await api.escrowState()).merchant;
        const rel = await api.releaseCall({ callId: att.callId, merchant });
        showToast(`Payout released · tx ${rel.tx.hash.slice(0, 10)}…`);
      } catch (e) {
        showToast(`Release failed: ${e.message}`);
      }
      await refresh();
    } catch (e) {
      showToast(`Attestation failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const explorer = config?.explorer || "https://testnet.monadexplorer.com";
  const totalAttest = feed.length;
  const totalReleases = escrow?.releases?.length ?? 0;
  const blockNo = health?.block ?? "—";

  return (
    <div className="shell">
      {/* RAIL */}
      <aside className="rail">
        <div className="rail-brand">
          <Aperture size={28} />
          <span>AYN<span className="slash">/</span>AI</span>
        </div>

        <div className="rail-meta">
          <div className="row"><span>System</span><b>Vox/Protocol</b></div>
          <div className="row"><span>Network</span><b>Monad Testnet</b></div>
          <div className="row"><span>Chain</span><b>{config?.chainId ?? 10143}</b></div>
          <div className="row"><span>Block</span><b className="ok">#{blockNo}</b></div>
          <div className="row"><span>Voice</span><b>Sarvam · Shubh</b></div>
        </div>

        <nav>
          <h6>Console</h6>
          <a href="#identity"><span className="num">01</span>Identity</a>
          <a href="#escrow"><span className="num">02</span>Escrow</a>
          <a href="#call"><span className="num">03</span>Live call</a>
          <a href="#attestations"><span className="num">04</span>Attestations</a>
          <a href="#infra"><span className="num">05</span>Infra</a>
        </nav>

        <div className="rail-foot">
          <div>Signer · {short(health?.signer)}</div>
          <div>Operator · ayn/ai</div>
          <div style={{ color: "var(--fg-3)" }}>v0.1 · hackathon build</div>
        </div>
      </aside>

      {/* CONTENT */}
      <main className="content">
        {/* COVER */}
        <section className="cover">
          <div className="cover-meta">
            <span className="id">/00</span>
            <span className="tag">Cover</span>
            <span className="spacer" />
            <span className="mono">{new Date().toISOString().slice(0, 10)}</span>
          </div>
          <h1 className="cover-title">
            Proof of <em>call</em> for voice AI.
          </h1>
          <p className="cover-sub">
            Vox is identity, attestation, and escrow rails for financial voice agents — built so that
            every call to the 350M underbanked Indians has a verifiable, portable, dispute-ready
            record. Powered by Sarvam Bulbul + Saaras for natural Hinglish speech, settled on Monad.
          </p>

          <div className="cover-grid">
            <div className="tile">
              <span className="cap">Reputation</span>
              <div className={`num ${(agent?.reputation ?? 0) >= 0 ? "signal" : "solder"}`}>{agent?.reputation ?? 0}</div>
              <div className="foot">on-chain score</div>
            </div>
            <div className="tile">
              <span className="cap">Escrow</span>
              <div className="num solder">{escrow?.balance ? Number(escrow.balance).toFixed(3) : "0.000"}</div>
              <div className="foot">MON · merchant balance</div>
            </div>
            <div className="tile">
              <span className="cap">Attestations</span>
              <div className="num">{totalAttest}</div>
              <div className="foot">calls committed</div>
            </div>
            <div className="tile">
              <span className="cap">Releases</span>
              <div className="num">{totalReleases}</div>
              <div className="foot">auto-paid by escrow</div>
            </div>
          </div>
        </section>

        {/* IDENTITY + ESCROW */}
        <section className="section">
          <div className="section-head">
            <span className="id">/01</span>
            <span className="tag">Identity + Escrow</span>
            <span className="spacer" />
            <span className="right mono">read · onchain</span>
          </div>
          <h2 className="section-title">Who is calling, and who pays for it.</h2>
          <p className="section-sub">
            Every voice agent has an onchain identity on <span className="mono">AgentRegistry</span>.
            Merchants pre-fund <span className="mono">ReputationEscrow</span> in MON; payout per
            attested outcome is automatic and the agent's reputation moves accordingly.
          </p>

          <div className="row-grid-2">
            <AgentCard agent={agent} explorer={explorer} />
            <EscrowCard escrow={escrow} explorer={explorer} />
          </div>
        </section>

        {/* LIVE CALL + ATTESTATIONS */}
        <section className="section">
          <div className="section-head">
            <span className="id">/02</span>
            <span className="tag">Live call + Attestations</span>
            <span className="spacer" />
            <span className="right mono">write · onchain</span>
          </div>
          <h2 className="section-title">Conversation as a primitive.</h2>
          <p className="section-sub">
            The bot talks to you in Hinglish via Sarvam Bulbul v3 (voice: Shubh). Your replies are
            captured by the browser, transcribed by Saaras v3, and classified by an on-device state
            machine. The final outcome — <span className="mono">PAID / PROMISED / NO_ANSWER / DNC</span>
            — is committed to Monad with the keccak256-hashed transcript.
          </p>

          <div className="row-grid-2">
            <CallSession onCallEnd={onCallEnd} disabled={busy} />
            <CallFeed calls={feed} explorer={explorer} txByCallId={callTx} />
          </div>
        </section>

        {/* INFRA */}
        <section className="section" id="infra">
          <div className="section-head">
            <span className="id">/03</span>
            <span className="tag">Infra</span>
            <span className="spacer" />
            <span className="right mono">read-only</span>
          </div>
          <h2 className="section-title">The contracts under it all.</h2>
          <p className="section-sub">
            Three Solidity contracts deployed to Monad testnet. Every link below opens a
            Monad explorer view of the live contract.
          </p>

          <div className="row-grid-1-1">
            <div className="panel">
              <div className="panel-head">
                <div className="left"><span className="id">03.A</span>· Contracts</div>
                <div className="right mono">chain {config?.chainId ?? 10143}</div>
              </div>
              <div className="panel-body">
                <div className="kv">
                  <div className="k">Registry</div>
                  <div className="v">
                    {config?.contracts?.registry ? (
                      <a href={`${explorer}/address/${config.contracts.registry}`} target="_blank" rel="noreferrer" style={{ color: "var(--solder)" }}>
                        {short(config.contracts.registry)}
                      </a>
                    ) : "—"}
                  </div>
                  <div className="k">Attestations</div>
                  <div className="v">
                    {config?.contracts?.attestations ? (
                      <a href={`${explorer}/address/${config.contracts.attestations}`} target="_blank" rel="noreferrer" style={{ color: "var(--solder)" }}>
                        {short(config.contracts.attestations)}
                      </a>
                    ) : "—"}
                  </div>
                  <div className="k">Escrow</div>
                  <div className="v">
                    {config?.contracts?.escrow ? (
                      <a href={`${explorer}/address/${config.contracts.escrow}`} target="_blank" rel="noreferrer" style={{ color: "var(--solder)" }}>
                        {short(config.contracts.escrow)}
                      </a>
                    ) : "—"}
                  </div>
                  <div className="k">RPC</div>
                  <div className="v">{config?.rpc}</div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div className="left"><span className="id">03.B</span>· Voice</div>
                <div className="right mono">sarvam</div>
              </div>
              <div className="panel-body">
                <div className="kv">
                  <div className="k">TTS model</div>
                  <div className="v">bulbul:v3</div>
                  <div className="k">Voice</div>
                  <div className="v">shubh</div>
                  <div className="k">TTS lang</div>
                  <div className="v">hi-IN (Hinglish)</div>
                  <div className="k">STT model</div>
                  <div className="v">saaras:v3</div>
                  <div className="k">STT mode</div>
                  <div className="v">translate → en</div>
                  <div className="k">Brain</div>
                  <div className="v">on-device state machine</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
