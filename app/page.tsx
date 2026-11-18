import { headers } from "next/headers";
import { ClientWorkspace } from "./workspace.tsx";

export default async function Page() {
  await headers();
  return (
    <>

    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="/" aria-label="DeSpecto home">
          <img className="brand-mark" src="/favicon.ico" width={32} height={32} alt="" />
          <span>DeSpecto</span>
        </a>
        <a className="source-link" href="https://github.com/KushankurDas10/DeSpecto" target="_blank" rel="noopener noreferrer">
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </div>
    </header>
    <main className="workspace">
      <section id="home">
        <header className="workspace-heading">
          <h1>Audit a project<span>.</span></h1>
          <p>Verify README claims or check a website across screen sizes. Review the exact lines and screenshots behind each finding.</p>
        </header>
        <div className="intake">
          <div className="audit-entry">
            <form id="audit-form">
              <label htmlFor="target">Public GitHub or website URL</label>
              <div className="target-control">
                <input id="target" name="url" type="text" inputMode="url" maxLength={2048} placeholder="https://github.com/owner/repo" required autoComplete="url" spellCheck={false} />
                <button className="button primary" type="submit">Run audit <span aria-hidden="true">↗</span></button>
              </div>
            </form>
            <p className="input-help">GitHub audits require a public repository. Website audits require a publicly reachable page.</p>
          </div>
          <section className="examples" aria-labelledby="examples-title">
            <h2 id="examples-title">Try an example</h2>
            <button className="example" type="button" aria-label="Audit example repository lit/lit" data-example="https://github.com/lit/lit">
              <span><strong>lit/lit</strong><small>GitHub repository</small></span><span aria-hidden="true">↗</span>
            </button>
            <button className="example" type="button" aria-label="Audit example website info.cern.ch" data-example="https://info.cern.ch/">
              <span><strong>info.cern.ch</strong><small>Public website</small></span><span aria-hidden="true">↗</span>
            </button>
          </section>
        </div>
        <section className="history" aria-labelledby="history-title">
          <div className="section-heading">
            <h2 id="history-title">Recent audits</h2>
            <span>Saved in this browser</span>
          </div>
          <div id="history-list" className="history-list"></div>
        </section>
      </section>
      <section id="active" hidden></section>
      <section id="report" hidden></section>
    </main>

      <ClientWorkspace />
    </>
  );
}
