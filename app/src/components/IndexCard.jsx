/* ==========================================================================
   IndexCard.jsx — One tile for the Indices landing grid.
   Modeled on CareFi's DEX Landing Page tiles:
     icon + name/venue · description · 3 bullets · metric+risk row · footer link
   Registers window.App.IndexCard.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;

  function IndexCard({ index, onOpen }) {
    const accent = index.accent === 'pink' ? 'pink' : 'accent';

    const handleOpen = (e) => {
      e.stopPropagation();
      onOpen && onOpen(index);
    };

    return (
      <article
        className="index-card"
        onClick={() => onOpen && onOpen(index)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(index); }
        }}
        aria-label={`${index.name} — ${index.venue}`}
      >
        <header className="index-card-head">
          <div className={cn('index-card-icon', accent)}>
            <Icon name={index.icon} size={18} strokeWidth={1.9} />
          </div>
          <div className="index-card-head-text">
            <div className="index-card-name">{index.name}</div>
            <div className="index-card-venue">{index.venue}</div>
          </div>
          <Badge variant={index.status.variant} dot>{index.status.label}</Badge>
        </header>

        <p className="index-card-desc">{index.description}</p>

        <ul className="index-card-bullets">
          {index.bullets.map((b, i) => (
            <li key={i} className="index-card-bullet">
              <span className={cn('index-card-bullet-mark', accent)}>
                <Icon name="check" size={9} strokeWidth={2.6} />
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="index-card-metric-row">
          <div className={cn('index-card-metric', accent)}>
            <div className="index-card-metric-value">{index.metric.value}</div>
            <div className="index-card-metric-label">{index.metric.label}</div>
            <div className="index-card-metric-sub">{index.metric.sub}</div>
          </div>
          <div className="index-card-risk">
            <div className="index-card-risk-label">Risk Tier</div>
            <Badge variant={index.risk.variant}>{index.risk.label}</Badge>
          </div>
        </div>

        <footer className="index-card-footer">
          <span className="index-card-feed">
            <span className={cn('feed-dot', `feed-${index.feed.variant}`)} />
            {index.feed.label}
          </span>
          <button type="button" className="index-card-link" onClick={handleOpen}>
            View Details <Icon name="arrow-right" size={12} />
          </button>
        </footer>
      </article>
    );
  }

  window.App = window.App || {};
  window.App.IndexCard = IndexCard;
})();
