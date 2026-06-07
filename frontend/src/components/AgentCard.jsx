import React from "react";

function short(addr) {
  if (!addr) return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function AgentCard({ agent, explorer }) {
  if (!agent) {
    return (
      <div className="panel" id="identity">
        <div className="panel-head">
          <div className="left"><span className="id">01</span>· Identity</div>
          <div className="right mono">unregistered</div>
        </div>
        <div className="panel-body">
          <p className="fg3" style={{ margin: 0, fontFamily: "'Funnel Sans', sans-serif" }}>
            No voice agent registered yet. Hit <b style={{ color: "var(--fg)" }}>start call</b> below to
            spin up a demo agent on <span className="mono">AgentRegistry</span>.
          </p>
        </div>
      </div>
    );
  }
  const wallet = agent.address;
  return (
    <div className="panel" id="identity">
      <div className="panel-head">
        <div className="left"><span className="id">01</span>· Identity</div>
        <div className="right mono">{agent.profile.active ? "active" : "inactive"}</div>
      </div>
      <div className="panel-body">
        <div className="kv">
          <div className="k">Name</div>
          <div className="v" style={{ fontFamily: "'Funnel Sans', sans-serif", fontSize: 14 }}>{agent.profile.name}</div>
          <div className="k">Type</div>
          <div className="v">{agent.profile.agentType}</div>
          <div className="k">Wallet</div>
          <div className="v">
            {short(wallet)}{" "}
            <a href={`${explorer}/address/${wallet}`} target="_blank" rel="noreferrer" style={{ color: "var(--solder)" }}>view</a>
          </div>
          <div className="k">Operator</div>
          <div className="v">{short(agent.profile.operator)}</div>
          <div className="k">Authorized</div>
          <div className="v" style={{ fontSize: 12 }}>{agent.profile.authorizedActions || "—"}</div>
          <div className="k">Calls</div>
          <div className="v">{agent.callCount}</div>
        </div>
        <hr className="hr" />
        <div className="metric">
          <div className={`num ${agent.reputation >= 0 ? "signal" : ""}`}>{agent.reputation}</div>
          <div className="label">reputation</div>
        </div>
      </div>
    </div>
  );
}
