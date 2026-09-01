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
    ...Array.from({ length: 9 }, (_, columnIndex) => [
      `column_${String(columnIndex + 1).padStart(2, "0")}`,
      `Value ${index}-${columnIndex}`,
    ]),
  ]);
  const collection = {
    type: "FeatureCollection",
    features: Array.from({ length: 300 }, (_, index) => ({
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

const dispatchTouch = (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1, radiusX: 1, radiusY: 1 }],
});

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
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await cdp.send("Page.navigate", { url: viewerUrl });
  await waitFor(
    () => cdp.evaluate(
      `location.href === ${JSON.stringify(viewerUrl)}
        && document.readyState === 'complete'
        && Boolean(document.querySelector('input[type="file"]'))`,
    ),
    "Viewer page load",
  );

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
    () => cdp.evaluate("Boolean(document.querySelector('.rdg-resize-handle'))"),
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
    viewport.scrollTop = 1200;
    viewport.scrollLeft = 275;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const handles = [...document.querySelectorAll('.rdg-resize-handle')];
    const viewportRect = viewport.getBoundingClientRect();
    const visibleHandles = handles.filter((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      return candidateRect.left >= viewportRect.left && candidateRect.right <= viewportRect.right;
    });
    const handle = visibleHandles[Math.min(2, visibleHandles.length - 1)];
    if (!handle) throw new Error('Resize handle was not found.');
    const handleIndex = handles.indexOf(handle);
    const rect = handle.getBoundingClientRect();
    const header = handle.closest('[role="columnheader"]');
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      target: header.textContent.trim(),
      handleIndex,
      tagName: handle.tagName,
      ariaHidden: handle.getAttribute('aria-hidden'),
      hitClass: hit?.className ?? null,
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      width: header.getBoundingClientRect().width,
      appTop: app.scrollTop,
      appHeight: app.scrollHeight,
      viewportTop: viewport.scrollTop,
      viewportLeft: viewport.scrollLeft,
    };
  })()`);

  assert.equal(initial.tagName, "DIV");
  assert.equal(initial.ariaHidden, "true");
  assert.match(initial.hitClass, /rdg-resize-handle/);
  assert.ok(initial.appTop > 0, "Outer viewer did not reach a nested scroll position.");
  assert.ok(initial.viewportTop > 0, "Table did not reach a vertical scroll position.");
  assert.ok(initial.viewportLeft > 0, "Table did not reach a horizontal scroll position.");

  const readState = () => cdp.evaluate(`(() => {
    const app = document.querySelector('.react-app') || document.scrollingElement;
    const viewport = document.querySelector('.react-table__grid');
    const handle = [...document.querySelectorAll('.rdg-resize-handle')][${initial.handleIndex}];
    return {
      width: handle.closest('[role="columnheader"]').getBoundingClientRect().width,
      appTop: app.scrollTop,
      appHeight: app.scrollHeight,
      viewportTop: viewport.scrollTop,
      viewportLeft: viewport.scrollLeft,
      activeRole: document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName,
    };
  })()`);
  const assertScrollPosition = (actual, stage) => {
    assert.equal(actual.appHeight, initial.appHeight, `${stage}: outer layout height changed.`);
    assert.equal(actual.appTop, initial.appTop, `${stage}: outer scroll moved.`);
    assert.equal(actual.viewportTop, initial.viewportTop, `${stage}: vertical table scroll moved.`);
    assert.equal(actual.viewportLeft, initial.viewportLeft, `${stage}: horizontal table scroll moved.`);
  };

  await dispatchMouse(cdp, "mouseMoved", initial.x, initial.y, 0);
  const hovered = await readState();
  assertScrollPosition(hovered, "hover");

  await dispatchTouch(cdp, "touchStart", initial.x, initial.y);
  const pressed = await readState();
  assertScrollPosition(pressed, "pointer down");
  await dispatchTouch(cdp, "touchEnd", initial.x, initial.y);
  await delay(50);
  const clicked = await readState();
  assert.equal(clicked.width, initial.width, "A click without movement changed the column width.");
  assertScrollPosition(clicked, "click without movement");

  await dispatchTouch(cdp, "touchStart", initial.x, initial.y);
  const dragStates = [{ stage: "pressed", ...(await readState()) }];
  for (const deltaX of [30, 60, 90]) {
    await dispatchTouch(cdp, "touchMove", initial.x + deltaX, initial.y);
    await delay(25);
    dragStates.push({ stage: `moved-${deltaX}`, ...(await readState()) });
  }
  await dispatchTouch(cdp, "touchEnd", initial.x + 90, initial.y);
  await delay(50);
  const resized = await readState();
  dragStates.push({ stage: "released", ...resized });
  console.log(JSON.stringify({ dragStates }, null, 2));
  assert.ok(
    resized.width >= initial.width + 89,
    `Data grid drag did not resize the column (${initial.width} -> ${resized.width}).`,
  );
  assertScrollPosition(resized, "data grid drag");

  console.log(JSON.stringify({
    environment: {
      extensionId,
      protocol: new URL(viewerUrl).protocol,
    },
    initial,
    hovered,
    clicked,
    resized,
  }, null, 2));
  console.log("Column resize browser regression check passed.");
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
