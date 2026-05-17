/* ==========================================================================
   NotesPanel.jsx — "Notes" tab body for the index detail page.
   Renders three blocks (each only when its data is present):
     • Live data note    — Phase II live-feed instructions
     • Phase II checklist — bullet list of integration milestones
     • Audience disclaimer — "CareFi view" / "Kalshi-facing summary" / etc.
   Registers window.App.NotesPanel.
   ========================================================================== */
(() => {
  'use strict';
  const { Icon, Badge } = window.App;

  function NotesPanel({ index }) {
    const notes = index?.detail?.notes;
    if (!notes) {
      return (
        <div className="card">
          <div className="placeholder">
            <div className="placeholder-icon"><Icon name="info" size={26} /></div>
            <div className="placeholder-title">No additional notes</div>
            <div className="placeholder-text">No audience disclaimer or Phase II content for this index yet.</div>
          </div>
        </div>
      );
    }

    return (
      <div className="notes-panel">
        {(notes.liveDataNote || notes.phase2) && (
          <div className="notes-grid-2">
            {notes.liveDataNote && (
              <div className="card">
                <header className="card-header">
                  <div>
                    <div className="card-title">Live Feed Notes</div>
                    <div className="card-subtitle">How the live integration is wired and how to enable it.</div>
                  </div>
                </header>
                <div className="card-body">
                  <p className="notes-prose">{notes.liveDataNote}</p>
                </div>
              </div>
            )}
            {notes.phase2 && (
              <div className="card">
                <header className="card-header">
                  <div>
                    <div className="card-title">{notes.phase2.title}</div>
                    <div className="card-subtitle">Integration milestones and rollout status.</div>
                  </div>
                </header>
                <div className="card-body">
                  <ul className="notes-checklist">
                    {notes.phase2.items.map((it, i) => (
                      <li key={i} className={`notes-checklist-item icon-${it.icon}`}>
                        <span className="notes-checklist-mark">
                          <Icon name={it.icon} size={12} />
                        </span>
                        <div>
                          <div className="notes-checklist-title">{it.title}</div>
                          <div className="notes-checklist-body">{it.body}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="card notes-disclaimer">
          <header className="card-header">
            <div>
              <div className="card-title">{notes.audience}</div>
              <div className="card-subtitle">Audience and disclaimers for this index.</div>
            </div>
            <Badge variant="default">disclaimer</Badge>
          </header>
          <div className="card-body">
            <p className="notes-prose"><strong>{notes.audience}</strong> — {notes.disclaimer}</p>
          </div>
        </div>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.NotesPanel = NotesPanel;
})();
