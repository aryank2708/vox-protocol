import React from "react";

function short(s, head = 6, tail = 4) {
  if (!s) return "—";
  return s.length > head + tail + 1 ? s.slice(0, head) + "…" + s.slice(-tail) : s;
}

function timeAgo(ts) {
  const d = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function CallFeed({ calls = [], explorer, txByCallId = {} }) {
  return (
    <div className="panel" id="attestations">
      <div className="panel-head">
        <div className="left">
          <span className="id">04</span>· Attestations
          <span className="pulse" style={{ marginLeft: 8 }} />
        </div>
        <div className="right mono">last {calls.length}</div>
      </div>
      <div className="panel-body">
        {calls.length === 0 ? (
          <p className="fg3" style={{ margin: 0, fontFamily: "'Funnel Sans', sans-serif" }}>
            No calls attested yet. Run one below — it gets hashed and committed to
            <span className="mono"> CallAttestation</span> on Monad.
          </p>
        ) : (
          <div className="feed">
            {calls.map((c) => {
              const tx = txByCallId[c.id];
              return (
                <div className="feed-item" key={c.id}>
                  <div className="meta">
                    <div className="top">
                      <span className="id">#{c.id}</span> · agent {short(c.agent)} · {c.duration}s
                    </div>
                    <div className="bot">
                      {timeAgo(c.timestamp)} · hash {short(c.transcriptHash, 8, 6)}
                      {tx && (
                        <>
                          {" · "}
                          <a href={`${explorer}/tx/${tx}`} target="_blank" rel="noreferrer" style={{ color: "var(--solder)" }}>tx</a>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`badge ${c.outcome}`}>{c.outcome.replace("_", " ")}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
