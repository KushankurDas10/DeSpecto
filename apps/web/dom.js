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
    const open = element("a", "evidence-full-link", "Open full screenshot");
    open.href = evidence.screenshot;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    const view = element("div", "evidence-scroll");
    view.tabIndex = 0;
    view.setAttribute("aria-label", "Scrollable screenshot");
    view.append(screenshot(evidence, `Audited ${evidence.view} page`));
    container.append(
      element("span", "evidence-label", evidence.view === "mobile" ? "Mobile screenshot" : "Desktop screenshot"),
      view,
      open,
    );
    if (evidence.box && evidence.height && evidence.box.y > 0) {
      view.querySelector("img").decode().then(() => {
        if (!view.isConnected) return;
        view.scrollTop = view.querySelector("img").clientHeight * (evidence.box.y / evidence.height) - view.clientHeight * .25;
      }).catch(() => {});
    }
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

export function showSceneEvidence(container, scene, options) {
  const { evidence, comparison } = scene;
  const visual = element("div", "scene-visual");
  container.append(visual);
  if (comparison?.kind === "screenshots") {
    visual.classList.add("scene-comparison");
    const shots = ["Before", "After"].map((label) => {
      const before = label === "Before";
      const panel = element("figure");
      panel.append(element("figcaption", "", label));
      visual.append(panel);
      const box = comparison.beforeBox ?? evidence.box;
      return camera(panel, {
        ...evidence, ...(before ? comparison.beforeSize : comparison.afterSize),
        screenshot: before ? comparison.before : comparison.after,
      }, before ? box : comparison.afterBox ?? null, before ? box : null, label);
    });
    return (time) => {
      shots[0](time);
      shots[1](time);
      visual.style.setProperty("--after-opacity", String(.42 + .58 * ease((time - .2) / .45)));
    };
  }
  if (comparison?.kind === "diff") {
    visual.append(element("pre", "patch", comparison.patch));
    return () => {};
  }
  if (evidence?.screenshot) {
    return camera(visual, evidence, evidence.box, evidence.box, "Page evidence");
  }
  if (evidence?.file) {
    showEvidence(visual, evidence, options);
    const code = visual.querySelector(".code-block");
    const pointer = element("span", "scene-cursor");
    pointer.setAttribute("aria-hidden", "true");
    visual.append(pointer);
    return (time) => {
      const amount = ease(time / .65);
      visual.classList.toggle("pointing", time > .12);
      pointer.style.left = `${72 - 63 * amount}%`;
      pointer.style.top = `${code.offsetTop + code.offsetHeight * (.85 - .5 * amount)}px`;
    };
  }
  visual.remove();
  return () => {};
}

function camera(container, evidence, focus, outline, label) {
  const { width, height, view } = evidence;
  const frame = element("div", `motion-frame ${view ?? ""}`);
  const image = element("img");
  image.src = evidence.screenshot;
  image.alt = label;
  const region = element("span", "motion-highlight");
  const pointer = element("span", "scene-cursor");
  region.setAttribute("aria-hidden", "true");
  pointer.setAttribute("aria-hidden", "true");
  frame.append(image, region, pointer);
  container.append(frame);

  return (time) => {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (!w || !h || !width || !height) return;
    const amount = ease(time / .65);
    const zoom = focus ? Math.min(1.65, Math.max(1, width / Math.max(focus.w * 1.25, width * .45))) : 1;
    const scale = w / width * (1 + (zoom - 1) * amount);
    const anchorX = focus ? focus.x + focus.w * .5 : width * .5;
    const anchorY = focus ? focus.y + Math.min(focus.h * .5, h / scale * .32) : 0;
    const x = Math.min(0, Math.max(w - width * scale, (w * .5 - anchorX * scale) * amount));
    const y = Math.min(0, Math.max(h - height * scale, (h * .45 - anchorY * scale) * amount));
    image.style.width = `${width * scale}px`;
    image.style.height = `${height * scale}px`;
    image.style.transform = `translate(${x}px, ${y}px)`;
    const active = outline && time > .12;
    region.hidden = !active;
    pointer.hidden = !active;
    if (active) {
      Object.assign(region.style, {
        left: `${x + outline.x * scale}px`, top: `${y + outline.y * scale}px`,
        width: `${outline.w * scale}px`, height: `${outline.h * scale}px`,
      });
      const cursorTravel = ease((time - .12) / .57);
      const tipX = Math.min(w - 16, Math.max(8, x + anchorX * scale));
      const tipY = Math.min(h - 22, Math.max(8, y + anchorY * scale));
      pointer.style.left = `${w * .16 * (1 - cursorTravel) + tipX * cursorTravel}px`;
      pointer.style.top = `${h * .78 * (1 - cursorTravel) + tipY * cursorTravel}px`;
    }
  };
}

function ease(value) {
  const fraction = Math.min(1, Math.max(0, value));
  return fraction * fraction * (3 - 2 * fraction);
}
