import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
]);

const findChromeExecutable = () => {
  const candidates = process.platform === "win32"
    ? [
        path.join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
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

const startStaticServer = async () => {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = requestUrl.pathname === "/"
        ? "/extension/viewer.html"
        : decodeURIComponent(requestUrl.pathname);
      const filePath = path.resolve(distDir, `.${pathname}`);
      if (filePath !== distDir && !filePath.startsWith(`${distDir}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": mimeTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Static server did not expose a port.");
  return { server, port: address.port };
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
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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
    button: buttons > 0 || type === "mouseReleased" ? "left" : "none",
    buttons,
    clickCount,
  },
);

let chromeProcess;
let staticServer;
let cdp;

try {
  assert.ok(existsSync(path.join(distDir, "extension/viewer.html")), "Run npm run build first.");
  await createResizeFixture();
  const serverResult = await startStaticServer();
  staticServer = serverResult.server;
  const viewerUrl = `http://127.0.0.1:${serverResult.port}/extension/viewer.html`;
  chromeProcess = spawn(findChromeExecutable(), [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-allow-origins=*",
    "--remote-debugging-port=0",
    "--window-size=800,600",
    `--user-data-dir=${path.join(temporaryDir, "chrome-profile")}`,
    "about:blank",
  ], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  const browserWebSocketUrl = await waitForDebuggerUrl(chromeProcess);
  const debuggerPort = Number(new URL(browserWebSocketUrl).port);
  const targetResponse = await fetch(
    `http://127.0.0.1:${debuggerPort}/json/new?${encodeURIComponent(viewerUrl)}`,
    { method: "PUT" },
  );
  assert.equal(targetResponse.ok, true, "Chrome page target could not be created.");
  const target = await targetResponse.json();
  cdp = await connectCdp(target.webSocketDebuggerUrl);
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
  await delay(50);
  const parseStarted = await cdp.evaluate(
    "Boolean(document.querySelector('.react-progress, .react-summary'))",
  );
  if (!parseStarted) {
    await cdp.evaluate(`(() => {
      const input = document.querySelector('input[type="file"]');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }
  await waitFor(
    () => cdp.evaluate("Boolean(document.querySelector('.react-table__resizer'))"),
    "Attribute table render",
  );

  const initial = await cdp.evaluate(`(async () => {
    const tableTab = document.querySelector('#result-tab-table');
    tableTab?.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const app = document.querySelector('.react-app');
    const viewport = document.querySelector('.react-table__viewport');
    app.scrollTop += viewport.getBoundingClientRect().top - 80;
    viewport.scrollTop = 1200;
    const handles = [...document.querySelectorAll('.react-table__resizer')];
    const handle = handles[Math.min(4, handles.length - 1)];
    if (!handle) throw new Error('Resize handle was not found.');
    const viewportRect = viewport.getBoundingClientRect();
    const headerRect = handle.closest('[role="columnheader"]').getBoundingClientRect();
    const handleContentRight = headerRect.right - viewportRect.left + viewport.scrollLeft;
    viewport.scrollLeft = Math.max(1, handleContentRight - 320);
    await new Promise(requestAnimationFrame);
    const rect = handle.getBoundingClientRect();
    const header = handle.closest('[role="columnheader"]');
    return {
      target: handle.dataset.columnId,
      tagName: handle.tagName,
      role: handle.getAttribute('role'),
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      width: header.getBoundingClientRect().width,
      appTop: app.scrollTop,
      appHeight: app.scrollHeight,
      viewportTop: viewport.scrollTop,
      viewportLeft: viewport.scrollLeft,
    };
  })()`);

  assert.equal(initial.tagName, "SPAN");
  assert.equal(initial.role, "separator");
  assert.ok(initial.appTop > 0, "Outer viewer did not reach a nested scroll position.");
  assert.ok(initial.viewportTop > 0, "Table did not reach a vertical scroll position.");
  assert.ok(initial.viewportLeft > 0, "Table did not reach a horizontal scroll position.");

  const readState = () => cdp.evaluate(`(() => {
    const app = document.querySelector('.react-app');
    const viewport = document.querySelector('.react-table__viewport');
    const handle = document.querySelector('.react-table__resizer[data-column-id="${initial.target}"]');
    return {
      width: handle.closest('[role="columnheader"]').getBoundingClientRect().width,
      appTop: app.scrollTop,
      appHeight: app.scrollHeight,
      viewportTop: viewport.scrollTop,
      viewportLeft: viewport.scrollLeft,
      resizing: viewport.getAttribute('data-resizing'),
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

  await dispatchMouse(cdp, "mousePressed", initial.x, initial.y, 1, 1);
  const pressed = await readState();
  assert.equal(pressed.resizing, initial.target, "Pointer down did not start the resize session.");
  assertScrollPosition(pressed, "pointer down");
  await dispatchMouse(cdp, "mouseReleased", initial.x, initial.y, 0, 1);
  await delay(50);
  const clicked = await readState();
  assert.equal(clicked.width, initial.width, "A click without movement changed the column width.");
  assert.equal(clicked.activeRole, "BODY", "Resize handle captured native focus.");
  assertScrollPosition(clicked, "click without movement");

  await dispatchMouse(cdp, "mousePressed", initial.x, initial.y, 1, 1);
  const dragStates = [{ stage: "pressed", ...(await readState()) }];
  for (const deltaX of [30, 60, 90]) {
    await dispatchMouse(cdp, "mouseMoved", initial.x + deltaX, initial.y, 1);
    await delay(25);
    dragStates.push({ stage: `moved-${deltaX}`, ...(await readState()) });
  }
  await dispatchMouse(cdp, "mouseReleased", initial.x + 90, initial.y, 0, 1);
  await delay(50);
  const resized = await readState();
  dragStates.push({ stage: "released", ...resized });
  console.log(JSON.stringify({ dragStates }, null, 2));
  assert.ok(
    resized.width >= initial.width + 89,
    `Pointer-captured drag did not resize the column (${initial.width} -> ${resized.width}).`,
  );
  assert.equal(resized.resizing, null, "Resize session did not finish cleanly.");
  assertScrollPosition(resized, "pointer-captured drag");

  console.log(JSON.stringify({ initial, hovered, clicked, resized }, null, 2));
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
  if (staticServer) {
    await new Promise((resolve) => staticServer.close(resolve));
  }
  await rm(temporaryDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 150,
  });
}
