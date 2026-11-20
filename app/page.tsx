import { SiteHeader } from "./site-header.tsx";
import { headers } from "next/headers";
import { ClientWorkspace } from "./workspace.tsx";

export default async function Page() {
  await headers();
  return (
    <ClientWorkspace>

    <SiteHeader />
    <main className="workspace">
      <section id="home">
        <div className="workspace-intro">
          <div className="workspace-heading">
            <h1>Take a closer<br />look.</h1>
            <p>Audit a website or GitHub repository. See exactly where an issue shows up, then watch the narrated walkthrough.</p>
            <form id="audit-form">
              <label htmlFor="target">Public GitHub or website URL</label>
              <div className="target-control">
                <input id="target" name="url" type="text" inputMode="url" maxLength={2048} placeholder="github.com/owner/repo or example.com" required autoComplete="url" spellCheck={false} />
                <button className="button primary" type="submit">Run audit</button>
              </div>
            </form>
          </div>
          <div className="inspection-board" aria-hidden="true">
            <div className="specimen-sheet">
              <div className="specimen-tab">README.md</div>
              <div className="specimen-code"><b>81</b> <s>./packages/scripts</s></div>
              <div className="specimen-code"><b>82</b> <i /></div>
            </div>
            <img className="hero-inspector" src="/inspector.svg" alt="" width={330} height={260} />
            <img className="folder-sticker" src="/case-folder.svg" alt="" width={74} height={74} />
          </div>
        </div>
        <section className="examples" aria-labelledby="examples-title">
          <a className="button" href="/sample">Watch sample audit</a>
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

    </ClientWorkspace>
  );
}
