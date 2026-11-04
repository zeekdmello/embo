import { useEffect, useState } from 'react';
import { formatMonth, shiftMonth } from '@shared/engine/calendar';
import { useDerived, useUI, type Page } from '../store/derived';
import { useStore } from '../store/store';
import { Modal, Toasts, runWithImpact } from './components/common';
import { Apple, Icon, Sparkle, Wordmark } from './components/brand';
import { CellDrawer, DayDrawer, GapDrawer } from './components/Drawers';
import { exportRosterCsv } from './export';
import { ChangesPage } from './pages/ChangesPage';
import { CoveragePage } from './pages/CoveragePage';
import { GuidePage } from './pages/GuidePage';
import { IssuesPage } from './pages/IssuesPage';
import { RosterPage } from './pages/RosterPage';
import { SetupPage } from './pages/SetupPage';

const PAGES: { id: Page; label: string; icon: string; title: string }[] = [
  { id: 'roster', label: 'Roster', icon: 'roster', title: 'A good month starts here.' },
  { id: 'coverage', label: 'Coverage', icon: 'coverage', title: 'Every brand, every day.' },
  { id: 'issues', label: 'Conflicts', icon: 'issues', title: 'What needs a little attention.' },
  { id: 'changes', label: 'Changes', icon: 'changes', title: 'Plans change. That’s fine.' },
  { id: 'setup', label: 'Setup', icon: 'setup', title: 'Your team, your rules.' },
  { id: 'guide', label: 'How it works', icon: 'guide', title: 'How Embo plans a month.' },
];

const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export default function App() {
  const { month, roster, summary, ctx } = useDerived();
  const page = useUI((s) => s.page);
  const go = useUI((s) => s.go);
  const toast = useUI((s) => s.toast);
  const { setMonth, generate, repair, publish, backToDraft, load, status, loadError, saveState, saveError } = useStore();
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = PAGES.find((p) => p.id === page)!;

  useEffect(() => {
    void load();
  }, [load]);

  const doGenerate = async () => {
    setBusy(true);
    try {
      if (roster) return await runWithImpact('Regenerated', generate);
      await generate();
      toast(`Roster for ${formatMonth(month)} is ready — take a look at what needs you.`, 'ok');
    } catch (e) {
      toast(`Generate failed: ${(e as Error).message}`, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const doRepair = async () => {
    setBusy(true);
    let n = -1;
    await runWithImpact('Repair', async () => (n = (await repair()).length));
    if (n === 0) toast('Repair: nothing needed changing');
    setBusy(false);
  };

  if (status !== 'ready') {
    return (
      <div className="boot">
        <Wordmark size={46} />
        {status === 'loading' ? (
          <p className="muted">Loading your team, brands and rosters…</p>
        ) : (
          <>
            <h2>Can’t reach the Embo server</h2>
            <p className="muted" style={{ maxWidth: 460 }}>{loadError}</p>
            <p className="muted small" style={{ maxWidth: 460 }}>
              Check that the API is running and that MONGODB_URI points to a reachable database.
            </p>
            <button className="btn primary" onClick={() => void load()}>Try again</button>
          </>
        )}
      </div>
    );
  }

  const navItems = PAGES.map((p) => (
    <button key={p.id} className={`nav-item ${page === p.id ? 'active' : ''}`} onClick={() => go(p.id)}>
      <Icon name={p.icon} />
      {p.label}
      {p.id === 'issues' && summary.hard > 0 ? <span className="badge">{summary.hard}</span> : page === p.id ? <span className="dot" /> : null}
    </button>
  ));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Wordmark size={34} />
          <span className="tagline">System management</span>
        </div>
        <nav className="nav">
          <div className="eyebrow">Your operations desk</div>
          {navItems}
        </nav>
        <div className="sidebar-foot">
          <Apple size={58} />
          <b>Covered, and rested.</b>
          <span>Every brand served. Every person gets their day off.</span>
        </div>
      </aside>

      <div className="main">
        <div className="mobile-nav">
          <Wordmark size={24} />
          {navItems}
        </div>

        <header className="topbar">
          <div className="greet">
            <div className="eyebrow">{today}</div>
            <h1>{current.title}</h1>
          </div>
          <div className="spacer" />
          <span className={`save-state ${saveState}`} title={saveError}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved — retrying' : 'All changes saved'}
          </span>
          <button className="btn primary" disabled={busy} onClick={doGenerate} title="Build the roster from the rules; locked manual edits are kept">
            <Icon name={roster ? 'refresh' : 'plus'} size={16} />
            {roster ? 'Regenerate' : 'Generate roster'}
          </button>
        </header>

        <div className="toolbar">
          <div className="month-nav">
            <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><Icon name="chevL" size={16} /></button>
            <div className="label">{formatMonth(month)}</div>
            <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><Icon name="chevR" size={16} /></button>
          </div>
          {roster && (
            <>
              <span className={`pill ${roster.status === 'PUBLISHED' ? 'published' : 'draft'}`}>
                {roster.status === 'PUBLISHED' ? 'Published' : 'Draft'} · v{roster.version}
              </span>
              <span className={`pill ${summary.hard ? 'hard' : 'ok'}`}>{summary.hard} hard</span>
              <span className="pill soft">{summary.soft} soft</span>
              {summary.info > 0 && <span className="pill info">{summary.info} info</span>}
              <div className="spacer" />
              <button className="btn" disabled={busy} onClick={doRepair} title="Apply leave changes, fill gaps with backups, move offs — without rebuilding">
                <Icon name="wrench" size={15} /> Repair
              </button>
              {roster.status === 'DRAFT' ? (
                <button className="btn dark" onClick={() => (setAck(false), setConfirmPublish(true))}>
                  Publish <Icon name="arrow" size={15} />
                </button>
              ) : (
                <button className="btn" onClick={backToDraft}>Edit (back to draft)</button>
              )}
              <button className="btn" onClick={() => exportRosterCsv(ctx, roster)}><Icon name="download" size={15} /> CSV</button>
            </>
          )}
        </div>

        {!roster && page !== 'setup' && page !== 'guide' ? (
          <div className="page">
            <div className="card empty">
              <Apple size={86} />
              <h2>Make room for a good month.</h2>
              <p className="muted" style={{ maxWidth: 560, margin: '0 auto 22px', lineHeight: 1.55 }}>
                Embo reads every brand's operating calendar, minimum staffing, assignments, holidays, approved leave and comp-offs,
                then places weekly offs so coverage holds. Anything it can't satisfy is flagged — never hidden.
              </p>
              <button className="btn primary" disabled={busy} onClick={doGenerate}>
                Generate roster for {formatMonth(month)} <Icon name="arrow" size={15} />
              </button>
              <div className="script" style={{ marginTop: 16, fontSize: 18 }}>one month at a time</div>
            </div>
          </div>
        ) : (
          <main className="page">
            {page === 'roster' && <RosterPage />}
            {page === 'coverage' && <CoveragePage />}
            {page === 'issues' && <IssuesPage />}
            {page === 'changes' && <ChangesPage key={month} />}
            {page === 'setup' && <SetupPage />}
            {page === 'guide' && <GuidePage />}
          </main>
        )}
      </div>

      <CellDrawer />
      <DayDrawer />
      <GapDrawer />
      <Toasts />

      {confirmPublish && roster && (
        <Modal onClose={() => setConfirmPublish(false)}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="eyebrow">Ready to share</div>
            <Sparkle size={22} />
          </div>
          <h2>Publish {formatMonth(month)} (v{roster.version})?</h2>
          {summary.hard > 0 ? (
            <>
              <div className="banner bad">
                {summary.hard} hard issue{summary.hard > 1 ? 's' : ''} still open (coverage gaps or rule breaches). Publishing
                with open issues is a manager decision and is recorded in the change log.
              </div>
              <label className="row">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                I've reviewed the open issues and accept them for this version
              </label>
            </>
          ) : (
            <div className="banner">All mandatory coverage and rules are satisfied.</div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setConfirmPublish(false)}>Cancel</button>
            {summary.hard > 0 && <button className="btn" onClick={() => (setConfirmPublish(false), go('issues'))}>Review conflicts</button>}
            <button
              className="btn primary"
              disabled={summary.hard > 0 && !ack}
              onClick={() => {
                publish();
                setConfirmPublish(false);
                toast(`Published v${roster.version}${summary.hard ? ` with ${summary.hard} acknowledged issue(s)` : ''}`, 'ok');
              }}
            >
              Publish <Icon name="arrow" size={15} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
