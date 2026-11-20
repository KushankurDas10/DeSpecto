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
        <div className="inspection-desk">
          <div className="workspace-intro">
            <div className="workspace-heading">
              <h1>Take a closer<br /> look.</h1>
              <p>Inspect a website or GitHub repository. See the evidence, explore a fix, and play the walkthrough.</p>
            </div>
            <div className="inspection-board" aria-hidden="true">
              <img className="hero-inspector" src="/inspector.svg" alt="" width={330} height={260} />
              <i className="field-spark" /><i className="field-spark" />
            </div>
          </div>
            <form id="audit-form">
              <label htmlFor="target">Public GitHub or website URL</label>
              <div className="target-control">
                <input id="target" name="url" type="text" inputMode="url" maxLength={2048} placeholder="github.com/owner/repo or example.com" required autoComplete="url" spellCheck={false} />
                <button className="button primary" type="submit">Start inspection</button>
              </div>
            </form>
        </div>
        <section className="examples" aria-labelledby="examples-title">
          <h2 id="examples-title">Explore an audit</h2>
          <a className="example sample-example" href="/sample">
            <span className="example-icon" aria-hidden="true">▷</span><span><strong>Watch sample audit</strong><small>Recorded walkthrough</small></span>
          </a>
          <button className="example" type="button" data-example="https://github.com/lit/lit">
            <span className="example-icon" aria-hidden="true">{'{}'}</span><span><strong>Inspect lit/lit</strong><small>GitHub repository</small></span>
          </button>
          <button className="example" type="button" data-example="https://info.cern.ch/">
            <span className="example-icon" aria-hidden="true">▤</span><span><strong>Inspect info.cern.ch</strong><small>Live website</small></span>
          </button>
        </section>
        <section className="history" aria-labelledby="history-title">
          <div className="section-heading">
            <h2 id="history-title">Audit history</h2>
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
