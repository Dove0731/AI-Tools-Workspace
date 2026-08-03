import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/Administrator/Desktop/正彩测试版面膜（测试）.xlsx";
const outputDir = "E:/新AI工具人/outputs/kingdee_code_trial_20260728";

const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheetInspect = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 10000,
});
await fs.writeFile(
  path.join(outputDir, "sheet_inspect.ndjson"),
  sheetInspect.ndjson,
  "utf8",
);

const sheetRecords = sheetInspect.ndjson
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((record) => record.kind === "sheet" || record.name);

const uniqueNames = [];
for (const record of sheetRecords) {
  const name = record.name ?? record.sheetName;
  if (name && !uniqueNames.includes(name)) uniqueNames.push(name);
}

const summaries = [];
for (const sheetName of uniqueNames) {
  const region = await workbook.inspect({
    kind: "region,formula,computedStyle,drawing",
    sheetId: sheetName,
    range: "A1:AZ200",
    maxChars: 30000,
    tableMaxRows: 200,
    tableMaxCols: 52,
    tableMaxCellChars: 200,
    options: { maxResults: 500 },
  });
  await fs.writeFile(
    path.join(outputDir, `inspect_${sheetName.replace(/[<>:"/\\|?*]/g, "_")}.ndjson`),
    region.ndjson,
    "utf8",
  );
  console.log(`RENDER_START ${sheetName}`);
  const preview = await workbook.render({
    sheetName,
    range: "A1:K37",
    scale: 1.5,
    format: "png",
  });
  const previewPath = path.join(
    outputDir,
    `preview_${sheetName.replace(/[<>:"/\\|?*]/g, "_")}.png`,
  );
  await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
  console.log(`RENDER_DONE ${previewPath}`);
  summaries.push({ sheetName, previewPath });
}

console.log(JSON.stringify({ sourcePath, sheets: uniqueNames, summaries }, null, 2));
