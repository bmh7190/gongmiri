import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import shpwrite from "@mapbox/shp-write";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const distDir = path.join(projectDir, "dist");
const temporaryDir = await mkdtemp(path.join(tmpdir(), "gongmiri-column-resize-"));
const fixturePath = path.join(temporaryDir, "column-resize-fixture.zip");
const useActionPopup = process.argv.includes("--popup");
const useShortTable = process.argv.includes("--short-table");

const delay = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const findPlaywrightChromium = () => {
  const root = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (!existsSync(root)) return null;
  const versions = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const version of versions) {
    const executable = path.join(root, version, "chrome-win64/chrome.exe");
    if (existsSync(executable)) return executable;
  }
  return null;
};

const findChromeExecutable = () => {
  const playwrightChromium = process.platform === "win32" ? findPlaywrightChromium() : null;
  const candidates = process.platform === "win32"
    ? [
        playwrightChromium,
        path.join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Microsoft/Edge/Application/msedge.exe"),
        path.join(process.env.PROGRAMFILES ?? "", "Microsoft/Edge/Application/msedge.exe"),
      ]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
        ];
  const executable = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!executable) throw new Error("Google Chrome executable was not found.");
  return executable;
};

const createResizeFixture = async () => {
  const properties = (index) => Object.fromEntries([
    ["name", `Feature ${String(index + 1).padStart(3, "0")}`],
    ["group", `Group ${index % 8}`],
    ["score", index * 3],
    ["long_text", `${index}-${"W".repeat(320 + index * 3)}`],
    ...Array.from({ length: 9 }, (_, columnIndex) => [
      `column_${String(columnIndex + 1).padStart(2, "0")}`,
      `Value ${index}-${columnIndex}`,
    ]),
  ]);
  const collection = {
    type: "FeatureCollection",
    features: Array.from({ length: useShortTable ? 6 : 44 }, (_, index) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [126.8 + (index % 30) * 0.01, 37.3 + Math.floor(index / 30) * 0.01],
      },
      properties: properties(index),
    })),
  };
  const zip = await shpwrite.zip(collection, { outputType: "uint8array" });
  await writeFile(fixturePath, Buffer.from(zip));
};

const getUnpackedExtensionId = (extensionPath) => {
  const digest = createHash("sha256")
    .update(Buffer.from(extensionPath, process.platform === "win32" ? "utf16le" : "utf8"))
    .digest()
    .subarray(0, 16);
  return [...digest]
    .flatMap((byte) => [byte >> 4, byte & 15])
    .map((value) => String.fromCharCode(97 + value))
    .join("");
};

const waitForDebuggerUrl = (chromeProcess) => new Promise((resolve, reject) => {
  let output = "";
  const timeout = setTimeout(() => {
    reject(new Error(`Chrome DevTools endpoint timed out.\n${output}`));
  }, 15_000);
  chromeProcess.stderr.setEncoding("utf8");
  chromeProcess.stderr.on("data", (chunk) => {
    output += chunk;
    const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (!match) return;
    clearTimeout(timeout);
    resolve(match[1]);
  });
  chromeProcess.once("exit", (code) => {
    clearTimeout(timeout);
    reject(new Error(`Chrome exited before DevTools started (code ${code}).\n${output}`));
  });
});

class CdpConnection {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.nextId = 1;
    this.pending = new Map();
    webSocket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    const rejectPending = (reason) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(reason);
      }
      this.pending.clear();
    };
    webSocket.addEventListener("close", (event) => {
      rejectPending(new Error(`Chrome DevTools connection closed (${event.code}: ${event.reason || "no reason"}).`));
    });
    webSocket.addEventListener("error", () => {
      rejectPending(new Error("Chrome DevTools connection failed."));
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome DevTools command timed out: ${method}`));
      }, 15_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.webSocket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? "Browser evaluation failed.");
    }
    return response.result.value;
  }
}

const connectCdp = async (webSocketUrl) => {
  const webSocket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    webSocket.addEventListener("open", resolve, { once: true });
    webSocket.addEventListener("error", reject, { once: true });
  });
  return new CdpConnection(webSocket);
};

const waitFor = async (check, label, timeout = 15_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`${label} timed out.`);
};

const dispatchMouse = (cdp, type, x, y, buttons, clickCount = 0) => cdp.send(
  "Input.dispatchMouseEvent",
  {
    type,
    x,
    y,
    button: type === "mousePressed" || type === "mouseReleased" ? "left" : "none",
    buttons,
    clickCount,
    pointerType: "mouse",
  },
);

const dispatchWheel = (cdp, x, y, deltaX, deltaY) => cdp.send(
  "Input.dispatchMouseEvent",
  {
    type: "mouseWheel",
    x,
    y,
    deltaX,
    deltaY,
    pointerType: "mouse",
  },
);

let chromeProcess;
let cdp;

try {
  assert.ok(existsSync(path.join(distDir, "extension/viewer.html")), "Run npm run build first.");
  await createResizeFixture();
  const extensionId = getUnpackedExtensionId(distDir);
  const viewerUrl = `chrome-extension://${extensionId}/extension/viewer.html`;
  chromeProcess = spawn(findChromeExecutable(), [
    "--headless=new",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-allow-origins=*",
    "--remote-debugging-port=0",
    "--window-size=800,600",
    "--window-position=-32000,-32000",
    `--disable-extensions-except=${distDir}`,
    `--load-extension=${distDir}`,
    `--user-data-dir=${path.join(temporaryDir, "chrome-profile")}`,
    viewerUrl,
  ], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  const browserWebSocketUrl = await waitForDebuggerUrl(chromeProcess);
  const debuggerPort = Number(new URL(browserWebSocketUrl).port);
  await delay(1_000);
  let pageTarget;
  await waitFor(
    async () => {
      const targetsResponse = await fetch(`http://127.0.0.1:${debuggerPort}/json/list`);
      const targets = await targetsResponse.json();
      pageTarget = targets.find(({ url }) => url === viewerUrl);
      return Boolean(pageTarget?.webSocketDebuggerUrl);
    },
    "Extension viewer target",
  );
  cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: viewerUrl });
  await waitFor(
    () => cdp.evaluate(
      `location.href === ${JSON.stringify(viewerUrl)}
        && document.readyState === 'complete'
        && Boolean(document.querySelector('input[type="file"]'))`,
    ),
    "Viewer page load",
  );

  if (useActionPopup) {
    const existingTargetId = pageTarget.id;
    const openPopupResult = await cdp.evaluate(`chrome.action.openPopup()
      .then(() => ({ ok: true }))
      .catch((error) => ({ ok: false, message: error?.message ?? String(error) }))`);
    assert.equal(
      openPopupResult.ok,
      true,
      `Chrome action popup could not be opened: ${openPopupResult.message ?? "unknown error"}`,
    );
    let popupTarget;
    await waitFor(
      async () => {
        const targetsResponse = await fetch(`http://127.0.0.1:${debuggerPort}/json/list`);
        const targets = await targetsResponse.json();
        popupTarget = targets.find(({ id, type, url }) => (
          id !== existingTargetId && type === "page" && url === viewerUrl
        ));
        return Boolean(popupTarget?.webSocketDebuggerUrl);
      },
      "Extension action popup target",
    );
    cdp = await connectCdp(popupTarget.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Page.enable");
    await waitFor(
      () => cdp.evaluate(
        `document.readyState === 'complete'
          && Boolean(document.querySelector('input[type="file"]'))`,
      ),
      "Action popup page load",
    );
  }

  const documentResult = await cdp.send("DOM.getDocument", { depth: 1 });
  const inputResult = await cdp.send("DOM.querySelector", {
    nodeId: documentResult.root.nodeId,
    selector: 'input[type="file"]',
  });
  assert.ok(inputResult.nodeId, "Viewer file input was not found.");
  await cdp.send("DOM.setFileInputFiles", {
    nodeId: inputResult.nodeId,
    files: [fixturePath],
  });
  await waitFor(
    () => cdp.evaluate("Boolean(document.querySelector('.react-table__grid'))"),
    "Attribute table render",
  );

  await cdp.evaluate("document.querySelector('#result-tab-table')?.click()");
  await delay(400);
  const initial = await cdp.evaluate(`(async () => {
    const app = document.querySelector('.react-app') || document.scrollingElement;
    const viewport = document.querySelector('.react-table__grid');
    if (!app || !viewport) {
      throw new Error('Viewer scroll containers were not found: ' + JSON.stringify({
        href: location.href,
        bodyClass: document.body.className,
        mainClasses: [...document.querySelectorAll('main')].map((element) => element.className),
      }));
    }
    app.scrollTop += viewport.getBoundingClientRect().top - 80;
    viewport.scrollTop = 400;
    viewport.scrollLeft = 275;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const viewportRect = viewport.getBoundingClientRect();
    const visibleHeaders = [...document.querySelectorAll('[role="columnheader"]')].filter((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      return candidateRect.left >= viewportRect.left && candidateRect.right <= viewportRect.right;
    });
    const header = visibleHeaders[Math.min(2, visibleHeaders.length - 1)];
    if (!header) throw new Error('Visible column header was not found.');
    const headerRect = header.getBoundingClientRect();
    const visibleCell = [...document.querySelectorAll('[role="gridcell"]')].find((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      return candidateRect.top >= viewportRect.top + 36
        && candidateRect.bottom <= viewportRect.bottom
        && candidateRect.left >= viewportRect.left
        && candidateRect.right <= viewportRect.right;
    });
    if (!visibleCell) throw new Error('Visible grid cell was not found.');
    const cellRect = visibleCell.getBoundingClientRect();
    return {
      target: header.textContent.trim(),
      resizeHandleCount: document.querySelectorAll('.react-table__resize-handle, .rdg-resize-handle').length,
      boundaryX: headerRect.right - 1,
      boundaryY: headerRect.y + headerRect.height / 2,
      viewportX: viewportRect.x + viewportRect.width / 2,
      viewportY: viewportRect.y + viewportRect.height / 2,
      headerX: headerRect.x + Math.min(headerRect.width / 2, headerRect.width - 16),
      headerY: headerRect.y + headerRect.height / 2,
      cellX: cellRect.x + cellRect.width / 2,
      cellY: cellRect.y + cellRect.height / 2,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: window.visualViewport?.width ?? window.innerWidth,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
      rootWidth: document.documentElement.scrollWidth,
      rootHeight: document.documentElement.scrollHeight,
      rootTop: document.scrollingElement?.scrollTop ?? 0,
      appTop: app.scrollTop,
      appHeight: app.scrollHeight,
      visibleResultPanels: [...document.querySelectorAll('.react-result-panel')]
        .filter((panel) => getComputedStyle(panel).display !== 'none').length,
      viewportTop: viewport.scrollTop,
      viewportLeft: viewport.scrollLeft,
    };
  })()`);

  assert.equal(initial.resizeHandleCount, 0, "Column resize handles should not be rendered.");
  assert.equal(initial.visibleResultPanels, 3, "The all-in-one result layout changed.");
  assert.ok(initial.appTop > 0, "Outer viewer did not reach a nested scroll position.");
  if (useShortTable) {
    assert.equal(initial.viewportTop, 0, "Short table unexpectedly became vertically scrollable.");
  } else {
    assert.ok(initial.viewportTop > 0, "Table did not reach a vertical scroll position.");
  }
  assert.ok(initial.viewportLeft > 0, "Table did not reach a horizontal scroll position.");

  const readState = () => cdp.evaluate(`(() => {
    const app = document.querySelector('.react-app') || document.scrollingElement;
    const viewport = document.querySelector('.react-table__grid');
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: window.visualViewport?.width ?? window.innerWidth,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
      rootWidth: document.documentElement.scrollWidth,
      rootHeight: document.documentElement.scrollHeight,
      rootTop: document.scrollingElement?.scrollTop ?? 0,
      appTop: app.scrollTop,
      appHeight: app.scrollHeight,
      viewportTop: viewport.scrollTop,
      viewportLeft: viewport.scrollLeft,
      activeRole: document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName,
    };
  })()`);
  const assertPopupGeometry = (actual, stage) => {
    assert.equal(actual.innerWidth, initial.innerWidth, `${stage}: popup width changed.`);
    assert.equal(actual.innerHeight, initial.innerHeight, `${stage}: popup height changed.`);
    assert.equal(actual.visualWidth, initial.visualWidth, `${stage}: visual viewport width changed.`);
    assert.equal(actual.visualHeight, initial.visualHeight, `${stage}: visual viewport height changed.`);
    assert.equal(actual.rootWidth, initial.rootWidth, `${stage}: root layout width changed.`);
    assert.equal(actual.rootHeight, initial.rootHeight, `${stage}: root layout height changed.`);
    assert.equal(actual.rootTop, initial.rootTop, `${stage}: root document scroll moved.`);
    assert.equal(actual.appHeight, initial.appHeight, `${stage}: outer layout height changed.`);
  };
  const assertScrollPosition = (actual, stage) => {
    assertPopupGeometry(actual, stage);
    assert.equal(actual.appTop, initial.appTop, `${stage}: outer scroll moved.`);
    assert.equal(actual.viewportTop, initial.viewportTop, `${stage}: vertical table scroll moved.`);
    assert.equal(actual.viewportLeft, initial.viewportLeft, `${stage}: horizontal table scroll moved.`);
  };

  const trackpadStates = [];
  for (let index = 0; index < 12; index += 1) {
    await dispatchWheel(cdp, initial.viewportX, initial.viewportY, 0, 24);
    await delay(16);
    trackpadStates.push({ stage: `wheel-${index + 1}`, ...(await readState()) });
  }
  for (const state of trackpadStates) {
    assertPopupGeometry(state, state.stage);
    assert.equal(state.appTop, initial.appTop, `${state.stage}: outer scroll moved during table scrolling.`);
  }
  if (useShortTable) {
    assert.equal(
      trackpadStates.at(-1).viewportTop,
      initial.viewportTop,
      "Short table unexpectedly scrolled vertically.",
    );
  } else {
    assert.ok(
      trackpadStates.at(-1).viewportTop > initial.viewportTop,
      "Trackpad-like wheel input did not scroll the data grid.",
    );
  }
  const boundaryStates = [];
  await cdp.evaluate(`(() => {
    const app = document.querySelector('.react-app') || document.scrollingElement;
    const viewport = document.querySelector('.react-table__grid');
    app.scrollTop = ${initial.appTop};
    viewport.scrollTop = 0;
  })()`);
  await dispatchWheel(cdp, initial.viewportX, initial.viewportY, 0, -240);
  await delay(50);
  boundaryStates.push({ stage: "top-overscroll", ...(await readState()) });
  assertPopupGeometry(boundaryStates[0], "top-overscroll");
  assert.equal(boundaryStates[0].appTop, initial.appTop, "Top overscroll moved the outer viewer.");
  assert.equal(boundaryStates[0].viewportTop, 0, "Top overscroll moved the grid past its boundary.");
  await cdp.evaluate(`(() => {
    const app = document.querySelector('.react-app') || document.scrollingElement;
    const viewport = document.querySelector('.react-table__grid');
    app.scrollTop = ${initial.appTop};
    viewport.scrollTop = viewport.scrollHeight;
  })()`);
  const bottomBefore = await readState();
  await dispatchWheel(cdp, initial.viewportX, initial.viewportY, 0, 240);
  await delay(50);
  boundaryStates.push({ stage: "bottom-overscroll", ...(await readState()) });
  assertPopupGeometry(boundaryStates[1], "bottom-overscroll");
  assert.equal(boundaryStates[1].appTop, initial.appTop, "Bottom overscroll moved the outer viewer.");
  assert.equal(
    boundaryStates[1].viewportTop,
    bottomBefore.viewportTop,
    "Bottom overscroll moved the grid past its boundary.",
  );
  await cdp.evaluate(`(async () => {
    const app = document.querySelector('.react-app') || document.scrollingElement;
    const viewport = document.querySelector('.react-table__grid');
    app.scrollTop = ${initial.appTop};
    viewport.scrollTop = ${initial.viewportTop};
    await new Promise(requestAnimationFrame);
  })()`);

  await cdp.evaluate(`(() => {
    const nativeScrollIntoView = Element.prototype.scrollIntoView;
    window.__gongmiriScrollIntoViewCalls = [];
    Element.prototype.scrollIntoView = function (...args) {
      const app = document.querySelector('.react-app') || document.scrollingElement;
      const viewport = document.querySelector('.react-table__grid');
      const before = { appTop: app.scrollTop, viewportTop: viewport.scrollTop };
      nativeScrollIntoView.apply(this, args);
      window.__gongmiriScrollIntoViewCalls.push({
        role: this.getAttribute?.('role') ?? this.tagName,
        before,
        afterNativeCall: { appTop: app.scrollTop, viewportTop: viewport.scrollTop },
      });
    };
  })()`);
  const interactionStates = [];
  for (let index = 0; index < 2; index += 1) {
    await dispatchMouse(cdp, "mouseMoved", initial.headerX, initial.headerY, 0);
    await dispatchMouse(cdp, "mousePressed", initial.headerX, initial.headerY, 1, 1);
    await dispatchMouse(cdp, "mouseReleased", initial.headerX, initial.headerY, 0, 1);
    await delay(50);
  }
  await delay(100);
  interactionStates.push({ stage: "sort-column", ...(await readState()) });
  await cdp.evaluate(`(() => {
    const app = document.querySelector('.react-app') || document.scrollingElement;
    const viewport = document.querySelector('.react-table__grid');
    app.scrollTop = ${initial.appTop};
    viewport.scrollTop = ${initial.viewportTop};
  })()`);
  for (let index = 0; index < 2; index += 1) {
    await dispatchMouse(cdp, "mouseMoved", initial.cellX, initial.cellY, 0);
    await dispatchMouse(cdp, "mousePressed", initial.cellX, initial.cellY, 1, 1);
    await dispatchMouse(cdp, "mouseReleased", initial.cellX, initial.cellY, 0, 1);
    await delay(50);
  }
  await delay(100);
  interactionStates.push({ stage: "select-cell", ...(await readState()) });
  const scrollIntoViewCalls = await cdp.evaluate("window.__gongmiriScrollIntoViewCalls");
  assert.equal(
    scrollIntoViewCalls.length,
    0,
    "Grid interactions escaped to the document-level scrollIntoView API.",
  );
  for (const state of interactionStates) {
    assertScrollPosition(state, state.stage);
  }
  console.log(JSON.stringify({ interactionStates, scrollIntoViewCalls }, null, 2));

  await dispatchMouse(cdp, "mouseMoved", initial.boundaryX, initial.boundaryY, 0);
  const hovered = await readState();
  assertScrollPosition(hovered, "column boundary hover");

  console.log(JSON.stringify({
    environment: {
      extensionId,
      protocol: new URL(viewerUrl).protocol,
      surface: useActionPopup ? "action-popup" : "extension-tab",
      rowScenario: useShortTable ? "short-table" : "scrollable-table",
      viewType: await cdp.evaluate(`chrome.extension.getViews({ type: "popup" }).includes(window)
        ? "popup"
        : "tab"`),
    },
    initial,
    trackpadStates,
    boundaryStates,
    interactionStates,
    scrollIntoViewCalls,
    hovered,
  }, null, 2));
  console.log("Popup table scroll regression check passed.");
} finally {
  cdp?.webSocket?.close();
  if (chromeProcess && chromeProcess.exitCode === null) {
    const chromeExited = new Promise((resolve) => {
      chromeProcess.once("exit", resolve);
    });
    chromeProcess.kill();
    await Promise.race([chromeExited, delay(2_000)]);
  }
  await rm(temporaryDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 150,
  });
}
