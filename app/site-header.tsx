export function SiteHeader() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="/" aria-label="DeSpecto home">
          <img className="brand-mark" src="/inspector.svg" width={50} height={40} alt="" />
          <span>DeSpecto</span>
        </a>
        <a className="source-link" href="https://github.com/KushankurDas10/DeSpecto" target="_blank" rel="noopener noreferrer">
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </div>
    </header>
  );
}
