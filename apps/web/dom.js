export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(text, className, click) {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", click);
  return node;
}

export async function request(url, options) {
  const response = await fetch(url, options);
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(value?.error || `The server returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  if (!value) throw new Error("The server returned an unexpected response.");
  return value;
}

export function screenshot({ screenshot, view, box, width, height }, alt) {
  const frame = element("div", `shot ${view ?? ""}`);
  const image = element("img");
  image.src = screenshot;
  image.alt = alt;
  if (width && height) {
    image.width = width;
    image.height = height;
  }
  frame.append(image);
  if (box && width && height) {
    const annotation = element("span", "annotation");
    annotation.setAttribute("aria-hidden", "true");
    Object.assign(annotation.style, {
      left: `${box.x * 100 / width}%`, top: `${box.y * 100 / height}%`,
      width: `${box.w * 100 / width}%`, height: `${box.h * 100 / height}%`,
    });
    frame.append(annotation);
  }
  return frame;
}

export function showEvidence(container, evidence, { repository, revision } = {}) {
  if (evidence.screenshot) {
    container.append(
      element("span", "evidence-label", evidence.view === "mobile" ? "Mobile screenshot" : "Desktop screenshot"),
      screenshot(evidence, `Audited ${evidence.view} viewport`),
    );
  } else if (evidence.file) {
    const [start, end] = evidence.lines;
    const label = `${evidence.file} · ${start === end ? `line ${start}` : `lines ${start}–${end}`}`;
    const location = element(repository && revision ? "a" : "span", "evidence-label", label);
    if (location.tagName === "A") {
      const file = evidence.file.split("/").map(encodeURIComponent).join("/");
      location.href = `${repository}/blob/${revision}/${file}#L${start}${start === end ? "" : `-L${end}`}`;
      location.target = "_blank";
      location.rel = "noopener noreferrer";
    }
    const code = element("pre", "code-block");
    code.tabIndex = 0;
    for (const [index, text] of (evidence.excerpt ?? "").split("\n").entries()) {
      const row = element("span", "code-line");
      row.append(element("span", "", String(start + index)), element("code", "", text));
      code.append(row);
    }
    container.append(location, code);
  }
}
