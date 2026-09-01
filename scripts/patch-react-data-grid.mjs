import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageEntry = path.resolve(
  scriptDir,
  "../node_modules/react-data-grid/lib/index.js",
);
const patchMarker = "gongmiri: preserve grid and ancestor scroll positions";
const previousPatchMarker = "gongmiri: preserve ancestor scroll positions";
const original = `function scrollIntoView(element, behavior = "instant") {
\telement?.scrollIntoView({
\t\tinline: "nearest",
\t\tblock: "nearest",
\t\tbehavior
\t});
}`;
const replacement = `function scrollIntoView(element, behavior = "instant") {
\tif (element == null) return;
\tconst grid = element.closest('[role="grid"]');
\tconst preservedScrollPositions = [];
\tfor (let ancestor = grid; ancestor != null; ancestor = ancestor.parentElement) {
\t\tif (ancestor.scrollHeight > ancestor.clientHeight || ancestor.scrollWidth > ancestor.clientWidth) {
\t\t\tpreservedScrollPositions.push({
\t\t\t\telement: ancestor,
\t\t\t\tscrollTop: ancestor.scrollTop,
\t\t\t\tscrollLeft: ancestor.scrollLeft
\t\t\t});
\t\t}
\t}
\telement.scrollIntoView({
\t\tinline: "nearest",
\t\tblock: "nearest",
\t\tbehavior
\t});
\t// gongmiri: preserve grid and ancestor scroll positions
\tfor (const preserved of preservedScrollPositions) {
\t\tpreserved.element.scrollTop = preserved.scrollTop;
\t\tpreserved.element.scrollLeft = preserved.scrollLeft;
\t}
}`;

const source = await readFile(packageEntry, "utf8");
if (source.includes(patchMarker)) {
  console.log("React Data Grid scroll patch is already applied.");
} else {
  let unpatchedSource = source;
  if (source.includes(previousPatchMarker)) {
    const patchedStart = source.indexOf("function scrollIntoView(element, behavior = \"instant\") {");
    const patchedEnd = source.indexOf("\n}\nfunction getRowToScroll", patchedStart) + 2;
    unpatchedSource = `${source.slice(0, patchedStart)}${original}${source.slice(patchedEnd)}`;
  }
  if (!unpatchedSource.includes(original)) {
    throw new Error(
      "React Data Grid scroll implementation changed; update the Gongmiri patch before building.",
    );
  }
  await writeFile(packageEntry, unpatchedSource.replace(original, replacement));
  console.log("Applied React Data Grid grid and ancestor scroll preservation patch.");
}
