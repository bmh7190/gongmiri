import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const projectRoot = process.cwd();
const distRoot = join(projectRoot, "dist");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function assertFile(path, label) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`${label} 파일이 없습니다: ${relative(projectRoot, path)}`);
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat();
}

const [packageJson, sourceManifest, builtManifest] = await Promise.all([
  readJson(join(projectRoot, "package.json")),
  readJson(join(projectRoot, "extension", "manifest.json")),
  readJson(join(distRoot, "manifest.json")),
]);

if (packageJson.version !== sourceManifest.version || sourceManifest.version !== builtManifest.version) {
  throw new Error("package.json, 소스 매니페스트, 빌드 매니페스트의 버전이 일치하지 않습니다.");
}

if (builtManifest.manifest_version !== 3) {
  throw new Error("빌드 산출물이 Manifest V3가 아닙니다.");
}

if (builtManifest.action?.default_popup !== "extension/viewer.html") {
  throw new Error("확장 아이콘에서 React 뷰어 팝업을 열도록 설정되지 않았습니다.");
}

if (builtManifest.permissions?.includes("downloads")) {
  throw new Error("downloads 권한은 필수 권한이 아니라 선택 권한이어야 합니다.");
}

if (!builtManifest.optional_permissions?.includes("downloads")) {
  throw new Error("ZIP 감지용 downloads 선택 권한이 없습니다.");
}

const requiredPaths = [
  [builtManifest.background?.service_worker, "서비스 워커"],
  [builtManifest.action.default_popup, "React 뷰어 팝업"],
  ...Object.entries(builtManifest.icons ?? {}).map(([size, path]) => [path, `${size}px 아이콘`]),
];

for (const [path, label] of requiredPaths) {
  if (!path) {
    throw new Error(`${label} 경로가 매니페스트에 없습니다.`);
  }
  await assertFile(join(distRoot, path), label);
}

const messageKeys = [...JSON.stringify(builtManifest).matchAll(/__MSG_([^_]+)__/g)]
  .map((match) => match[1]);

for (const locale of ["ko", "en"]) {
  const messages = await readJson(join(distRoot, "_locales", locale, "messages.json"));
  for (const key of messageKeys) {
    if (typeof messages[key]?.message !== "string" || messages[key].message.length === 0) {
      throw new Error(`${locale} 로케일에 ${key} 메시지가 없습니다.`);
    }
  }
}

const viewerHtml = await readFile(join(distRoot, "extension", "viewer.html"), "utf8");
const viewerEntry = viewerHtml.match(/src="\/?([^"]+\.js)"/)?.[1];
if (!viewerEntry) {
  throw new Error("빌드된 viewer.html에서 JavaScript 진입점을 찾지 못했습니다.");
}
await assertFile(join(distRoot, viewerEntry), "뷰어 JavaScript 진입점");

const builtFiles = await listFiles(distRoot);
const sourceMaps = builtFiles.filter((path) => path.endsWith(".map"));
const sourceMapContents = await Promise.all(sourceMaps.map((path) => readFile(path, "utf8")));
const combinedSourceMaps = sourceMapContents.join("\n");

if (!combinedSourceMaps.includes("src/react/main.tsx")) {
  throw new Error("React 진입점이 프로덕션 소스맵에 포함되지 않았습니다.");
}

if (/node_modules\/(?:@vue|vue|vue-i18n)\//.test(combinedSourceMaps)) {
  throw new Error("프로덕션 번들에 Vue 런타임이 포함되었습니다.");
}

console.log(`Extension smoke check passed (v${builtManifest.version}, ${builtFiles.length} files).`);
