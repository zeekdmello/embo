export function GuidePage() {
  return (
    <div className="col page-narrow" style={{ gap: 14 }}>
      <div className="card card-pad col" style={{ gap: 10 }}>
        <h2>How Embo works</h2>
        <p className="muted" style={{ margin: 0 }}>
          The unit of coverage is a <b>brand-process</b> (e.g. “Lumen Skincare · CS”). Each has its own operating calendar,
          minimum staff (optionally per weekday) and shift. People are <b>owners</b> (primary) or trained <b>backups</b>. A brand's
          calendar is separate from each person's schedule: the roster decides who works, the rules decide what must be covered.
        </p>
      </div>
      <div className="grid2">
        <div className="card card-pad col">
          <div className="section-title">1 · Generate</div>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Lock in fixed facts: approved leave, comp-offs, locked manual edits.</li>
            <li>Public holidays: everyone off, then the minimum number of owners are pulled back for brands that run 365 days (they earn a comp-off).</li>
            <li>Leave gaps are filled with trained backups (fairest, least-loaded first).</li>
            <li>Weekly offs, week by week, most-constrained people first. Each candidate day is scored: <i>unfillable gap ≫ too many days in a row ≫ needs a backup ≫ preference / fairness</i>.</li>
            <li>If no day works, the off is <b>not</b> forced in — the conflict is reported.</li>
          </ol>
        </div>
        <div className="card card-pad col">
          <div className="section-title">2 · Validate (always on)</div>
          <div className="small" style={{ lineHeight: 1.6 }}>
            An independent validator re-checks the roster after every action. <b>Hard</b>: coverage gaps, unassigned processes,
            working during approved leave, shift clashes, overload, untrained cover, missing weekly off, too many consecutive days,
            negative comp-off balance. <b>Soft</b>: preferred off day missed, no weekend off, cross-trained cover, backup overuse.
            <b> Info</b>: pending leave, one absence hitting several brands.
          </div>
        </div>
        <div className="card card-pad col">
          <div className="section-title">3 · Edit & fix</div>
          <div className="small" style={{ lineHeight: 1.6 }}>
            Click any cell to change status or add a cover — the cell gets locked and you instantly see whether hard issues went
            up or down. On a red coverage cell, “Suggest fixes” simulates every option (backup cover, cross-trained cover,
            moving someone's weekly off within the week, calling someone in from a holiday) and shows the before → after count.
          </div>
        </div>
        <div className="card card-pad col">
          <div className="section-title">4 · Handle changes</div>
          <div className="small" style={{ lineHeight: 1.6 }}>
            <b>Changes</b> previews an absence (sole owner vs. shared brand), then applies it with <b>Repair</b>, which only touches what
            broke. <b>Re-plan from date</b> rebuilds the rest of the month. After publishing, every changed cell is listed as a
            notification and logged.
          </div>
        </div>
      </div>
    </div>
  );
}
