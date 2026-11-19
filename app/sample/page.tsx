import report from "./report.json";

export default function SampleAudit() {
  return (
    <main className="workspace sample-report">
      <a href="/">Back to audit workspace</a>
      <header>
        <p className="eyebrow">Sample website audit</p>
        <h1>{report.target.label}</h1>
        <p>A recorded audit of CERN’s first website, with the mobile finding and its verified fix.</p>
      </header>
      <video controls playsInline preload="metadata" aria-label="Narrated sample audit" poster="/sample/desktop.jpg">
        <source src="/sample/walkthrough.mp4" type="video/mp4" />
        <track kind="captions" src="/sample/captions.vtt" srcLang="en" label="English" />
      </video>
      <a className="button" href="/sample/walkthrough.mp4" download>Download sample MP4</a>
      <section className="card detail">
        <h2>{report.title}</h2>
        <p className="detail-copy">{report.explanation}</p>
        <div className="comparison">
          {(["before", "after"] as const).map(view => (
            <figure key={view}><figcaption>{view === "before" ? "Original mobile capture" : "With the viewport fix"}</figcaption>
              <a href={"/sample/" + view + ".jpg"}><img src={"/sample/" + view + ".jpg"} alt={view === "before" ? "Desktop layout scaled down on a phone" : "Page sized to the mobile screen"} /></a>
            </figure>
          ))}
        </div>
        <p className="fix-summary"><strong>{report.verified ? "Recheck passed. " : ""}</strong>{report.summary}</p>
      </section>
    </main>
  );
}
