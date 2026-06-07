import React from "react";

function short(s) {
  if (!s) return "—";
  return s.slice(0, 6) + "…" + s.slice(-4);
}

export default function EscrowCard({ escrow, explorer }) {
  return (
    <div className="panel" id="escrow">
      <div className="panel-head">
        <div className="left"><span className="id">02</span>· Escrow</div>
        <div className="right mono">{escrow?.releases?.length ?? 0} releases</div>
      </div>
      <div className="panel-body">
        {!escrow ? (
          <p className="fg3" style={{ margin: 0, fontFamily: "'Funnel Sans', sans-serif" }}>Escrow state unavailable.</p>
        ) : (
          <>
            <div className="metric">
              <div className="num solder">{Number(escrow.balance).toFixed(4)}</div>
              <div className="label">MON · merchant balance</div>
            </div>
            <div className="kv" style={{ marginTop: 4 }}>
              <div className="k">Merchant</div>
              <div className="v">{short(escrow.merchant)}</div>
              <div className="k">Releases</div>
              <div className="v">{escrow.releases?.length || 0}</div>
            </div>
            <hr className="hr" />
            <div className="section-head" style={{ marginBottom: 8 }}>
              <span className="id">02.A</span>
              <span className="tag">Release history</span>
              <span className="spacer" />
            </div>
            {(escrow.releases?.length || 0) === 0 ? (
              <p className="fg3" style={{ margin: 0, fontFamily: "'Funnel Sans', sans-serif" }}>No payouts released yet.</p>
            ) : (
              <div className="feed" style={{ maxHeight: 220 }}>
                {escrow.releases.map((r) => (
                  <div className="feed-item" key={`${r.callId}-${r.timestamp}`}>
                    <div className="meta">
                      <div className="top">
                        <span className="id">#{r.callId}</span> → {short(r.operator)}
                      </div>
                      <div className="bot">{Number(r.amount).toFixed(4)} MON</div>
                    </div>
                    <span className={`badge ${r.outcome}`}>{r.outcome.replace("_", " ")}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
