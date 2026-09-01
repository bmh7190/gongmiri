import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageEntry = path.resolve(
  scriptDir,
  "../node_modules/react-data-grid/lib/index.js",
);
const patchMarker = "gongmiri: scroll only inside the data grid";
const previousPatchMarkers = [
  "gongmiri: preserve grid and ancestor scroll positions",
  "gongmiri: preserve ancestor scroll positions",
];
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
\tif (grid == null) {
\t\telement.scrollIntoView({
\t\t\tinline: "nearest",
\t\t\tblock: "nearest",
\t\t\tbehavior
\t\t});
\t\treturn;
\t}
\tconst gridRect = grid.getBoundingClientRect();
\tconst elementRect = element.getBoundingClientRect();
\tlet top = grid.scrollTop;
\tlet left = grid.scrollLeft;
\tif (elementRect.top < gridRect.top) top += elementRect.top - gridRect.top;
\telse if (elementRect.bottom > gridRect.bottom) top += elementRect.bottom - gridRect.bottom;
\tif (elementRect.left < gridRect.left) left += elementRect.left - gridRect.left;
\telse if (elementRect.right > gridRect.right) left += elementRect.right - gridRect.right;
\t// gongmiri: scroll only inside the data grid
\tif (top === grid.scrollTop && left === grid.scrollLeft) return;
\tgrid.scrollTo({ top, left, behavior });
}`;

const source = await readFile(packageEntry, "utf8");
if (source.includes(patchMarker)) {
  console.log("React Data Grid internal-only scroll patch is already applied.");
} else {
  let unpatchedSource = source;
  if (previousPatchMarkers.some((marker) => source.includes(marker))) {
    const patchedStart = source.indexOf("function scrollIntoView(element, behavior = \"instant\") {");
    const patchedEnd = source.indexOf("\n}\nfunction getRowToScroll", patchedStart) + 2;
    if (patchedStart < 0 || patchedEnd < 2) {
      throw new Error(
        "The existing React Data Grid scroll patch could not be migrated safely.",
      );
    }
    unpatchedSource = `${source.slice(0, patchedStart)}${original}${source.slice(patchedEnd)}`;
  }
  if (!unpatchedSource.includes(original)) {
    throw new Error(
      "React Data Grid scroll implementation changed; update the Gongmiri patch before building.",
    );
  }
  await writeFile(packageEntry, unpatchedSource.replace(original, replacement));
  console.log("Applied React Data Grid internal-only scroll patch.");
}
