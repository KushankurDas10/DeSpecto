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
        <div className="workspace-intro">
          <div className="workspace-heading">
            <h1>Every finding<br />has a source.</h1>
            <p>Check a repository or website, inspect the evidence, and turn the audit into a narrated walkthrough.</p>
            <form id="audit-form">
              <label htmlFor="target">Public GitHub or website URL</label>
              <div className="target-control">
                <input id="target" name="url" type="text" inputMode="url" maxLength={2048} placeholder="github.com/owner/repo or example.com" required autoComplete="url" spellCheck={false} />
                <button className="button primary" type="submit">Run audit</button>
              </div>
            </form>
          </div>
          <figure className="evidence-sample">
            <div className="sample-page">
              <div className="sample-file"><span>lit/lit</span><span>README.md</span></div>
              <pre><code><span className="sample-line">80</span>{"  Internal packages\n"}<span className="sample-line">81</span>{"  "}<mark>./packages/@lit-internal/scripts</mark></code></pre>
              <figcaption><span className="sample-pin" aria-hidden="true"></span><strong>Broken README link</strong><span>That path is missing from the audited commit.</span></figcaption>
            </div>
          </figure>
        </div>
        <section className="examples" aria-labelledby="examples-title">
          <h2 id="examples-title">Try an example</h2>
          <button className="example" type="button" aria-label="Audit example repository lit/lit" data-example="https://github.com/lit/lit">
            <span className="example-icon" aria-hidden="true">⌘</span><span><strong>lit/lit</strong><small>GitHub repository</small></span>
          </button>
          <button className="example" type="button" aria-label="Audit example website info.cern.ch" data-example="https://info.cern.ch/">
            <span className="example-icon" aria-hidden="true">▤</span><span><strong>info.cern.ch</strong><small>Public website</small></span>
          </button>
        </section>
        <section className="history" aria-labelledby="history-title">
          <div className="section-heading">
            <h2 id="history-title">Recent audits</h2>
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
