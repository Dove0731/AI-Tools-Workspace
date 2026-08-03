import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = fileURLToPath(new URL(".", import.meta.url));
const source = JSON.parse(
  await fs.readFile(`${outputDir}/registry_records.json`, "utf8"),
);
const occurrences = source.occurrences;

const dateValue = (text) => new Date(`${text}T00:00:00`);
const compositeKey = (r) =>
  [r.product_name, r.registration_number, r.registrant_company, r.filing_date].join("\u0000");

const registrationVariants = new Map();
for (const row of occurrences) {
  const variants = registrationVariants.get(row.registration_number) ?? new Set();
  variants.add(compositeKey(row));
  registrationVariants.set(row.registration_number, variants);
}
const conflictingNumbers = new Set(
  [...registrationVariants.entries()]
    .filter(([, variants]) => variants.size > 1)
    .map(([number]) => number),
);

const grouped = new Map();
for (const row of occurrences) {
  const key = compositeKey(row);
  if (!grouped.has(key)) {
    grouped.set(key, {
      ...row,
      occurrence_count: 0,
      source_locations: [],
    });
  }
  const item = grouped.get(key);
  item.occurrence_count += 1;
  item.source_locations.push(`图${row.source_index}-区块${row.card_index}`);
}
const uniqueRows = [...grouped.values()];

function reviewFlag(row) {
  const flags = [];
  const baseStatus = row.recognition_note.includes("人工复核")
    ? "已人工复核"
    : "OCR识别";
  if (conflictingNumbers.has(row.registration_number)) {
    flags.push("同一备案编号对应多条不同记录，待复核");
  }
  if (
    row.registrant_company === "待确认" ||
    row.registrant_company.endsWith("有限公")
  ) {
    flags.push("备案人企业疑似截断，待复核");
  }
  if (row.filing_date === "待确认") {
    flags.push("备案时间待确认");
  }
  return flags.length ? `${baseStatus}；${flags.join("；")}` : baseStatus;
}

const workbook = Workbook.create();
const detail = workbook.worksheets.add("图片明细");
const summary = workbook.worksheets.add("去重汇总");
const stats = workbook.worksheets.add("统计说明");

function setTitle(sheet, title, subtitle, lastColumn) {
  sheet.showGridLines = false;
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A1:${lastColumn}1`).format = {
    fill: "#1565C0",
    font: { bold: true, color: "#FFFFFF", size: 16, name: "Microsoft YaHei" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    rowHeight: 34,
  };
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange(`A2:${lastColumn}2`).format = {
    fill: "#FFF8E1",
    font: { color: "#6D4C41", italic: true, size: 10, name: "Microsoft YaHei" },
    wrapText: true,
    verticalAlignment: "center",
    rowHeight: 32,
  };
}

function styleTable(sheet, endRow, endColumn, tableName) {
  sheet.getRange(`A4:${endColumn}${endRow}`).format = {
    font: { name: "Microsoft YaHei", size: 10 },
    verticalAlignment: "center",
  };
  sheet.getRange(`A4:${endColumn}4`).format = {
    fill: "#1E88E5",
    font: { bold: true, color: "#FFFFFF", name: "Microsoft YaHei", size: 10 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    rowHeight: 27,
  };
  sheet.getRange(`A5:${endColumn}${endRow}`).format.borders = {
    insideHorizontal: { style: "thin", color: "#E0E0E0" },
    bottom: { style: "thin", color: "#CFD8DC" },
  };
  sheet.getRange(`A5:${endColumn}${endRow}`).format.rowHeight = 34;
  sheet.tables.add(`A4:${endColumn}${endRow}`, true, tableName).style =
    "TableStyleMedium2";
  sheet.freezePanes.freezeRows(4);
}

setTitle(
  detail,
  "化妆品备案记录（30张图片整合明细）",
  "按截图出现顺序保留全部记录。备案编号为文本、备案时间为可筛选日期；“待复核”用于标记同编号冲突或疑似截断字段。",
  "H",
);
detail.getRange("A4:H4").values = [[
  "序号",
  "产品名称",
  "备案编号",
  "备案人企业",
  "备案时间",
  "来源图序",
  "区块",
  "复核标记",
]];
detail.getRange(`A5:H${occurrences.length + 4}`).values = occurrences.map((r, i) => [
  i + 1,
  r.product_name,
  r.registration_number,
  r.registrant_company,
  dateValue(r.filing_date),
  r.source_index,
  r.card_index,
  reviewFlag(r),
]);
const detailEnd = occurrences.length + 4;
styleTable(detail, detailEnd, "H", "RegistryImageDetail");
detail.getRange(`E5:E${detailEnd}`).format.numberFormat = "yyyy-mm-dd";
detail.getRange(`A5:A${detailEnd}`).format.horizontalAlignment = "center";
detail.getRange(`E5:G${detailEnd}`).format.horizontalAlignment = "center";
detail.getRange(`B5:D${detailEnd}`).format.wrapText = true;
detail.getRange(`H5:H${detailEnd}`).format.wrapText = true;
detail.getRange("A:A").format.columnWidth = 9;
detail.getRange("B:B").format.columnWidth = 47;
detail.getRange("C:C").format.columnWidth = 30;
detail.getRange("D:D").format.columnWidth = 34;
detail.getRange("E:E").format.columnWidth = 14;
detail.getRange("F:G").format.columnWidth = 11;
detail.getRange("H:H").format.columnWidth = 36;

setTitle(
  summary,
  "化妆品备案记录（完全一致去重汇总）",
  "按“产品名称 + 备案编号 + 备案人企业 + 备案时间”完全一致去重；同一备案编号存在不同字段时不强行合并，并标记为待复核。",
  "H",
);
summary.getRange("A4:H4").values = [[
  "序号",
  "产品名称",
  "备案编号",
  "备案人企业",
  "备案时间",
  "出现次数",
  "来源位置",
  "复核标记",
]];
summary.getRange(`A5:H${uniqueRows.length + 4}`).values = uniqueRows.map((r, i) => [
  i + 1,
  r.product_name,
  r.registration_number,
  r.registrant_company,
  dateValue(r.filing_date),
  r.occurrence_count,
  r.source_locations.join("、"),
  reviewFlag(r),
]);
const summaryEnd = uniqueRows.length + 4;
styleTable(summary, summaryEnd, "H", "RegistryDeduplicated");
summary.getRange(`E5:E${summaryEnd}`).format.numberFormat = "yyyy-mm-dd";
summary.getRange(`A5:A${summaryEnd}`).format.horizontalAlignment = "center";
summary.getRange(`E5:F${summaryEnd}`).format.horizontalAlignment = "center";
summary.getRange(`B5:D${summaryEnd}`).format.wrapText = true;
summary.getRange(`G5:H${summaryEnd}`).format.wrapText = true;
summary.getRange("A:A").format.columnWidth = 9;
summary.getRange("B:B").format.columnWidth = 47;
summary.getRange("C:C").format.columnWidth = 30;
summary.getRange("D:D").format.columnWidth = 34;
summary.getRange("E:E").format.columnWidth = 14;
summary.getRange("F:F").format.columnWidth = 12;
summary.getRange("G:G").format.columnWidth = 35;
summary.getRange("H:H").format.columnWidth = 36;

setTitle(
  stats,
  "提取统计与使用说明",
  "统计来自30张用户截图。OCR提取后已对低置信备案编号逐条目视修正；仍建议在正式使用前复核“待复核”行。",
  "D",
);
stats.getRange("A4:B11").values = [
  ["统计项目", "结果"],
  ["来源图片数", 30],
  ["候选记录区块", source.summary.candidate_cards],
  ["提取明细行数", occurrences.length],
  ["完全一致去重后", uniqueRows.length],
  ["完全一致重复行", 0],
  ["存在字段冲突的备案编号", conflictingNumbers.size],
  ["人工复核说明", "低置信备案编号已目视修正；编号冲突行保留原截图识别结果并标记待复核"],
];
stats.getRange("B9").formulas = [["=B7-B8"]];
stats.getRange("A13:B13").values = [["备案时间", "明细数量"]];
const dateCounts = Object.entries(
  occurrences.reduce((acc, r) => {
    acc[r.filing_date] = (acc[r.filing_date] ?? 0) + 1;
    return acc;
  }, {}),
).sort(([a], [b]) => a.localeCompare(b));
stats.getRange(`A14:B${13 + dateCounts.length}`).values = dateCounts.map(([date, count]) => [
  dateValue(date),
  count,
]);
stats.getRange(`A14:A${13 + dateCounts.length}`).format.numberFormat = "yyyy-mm-dd";
stats.getRange("A4:B4").format = {
  fill: "#1E88E5",
  font: { bold: true, color: "#FFFFFF", name: "Microsoft YaHei" },
  horizontalAlignment: "center",
};
stats.getRange("A13:B13").format = {
  fill: "#1E88E5",
  font: { bold: true, color: "#FFFFFF", name: "Microsoft YaHei" },
  horizontalAlignment: "center",
};
stats.getRange("A4:B11").format.borders = {
  insideHorizontal: { style: "thin", color: "#E0E0E0" },
  insideVertical: { style: "thin", color: "#E0E0E0" },
  outside: { style: "thin", color: "#90A4AE" },
};
stats.getRange(`A13:B${13 + dateCounts.length}`).format.borders = {
  insideHorizontal: { style: "thin", color: "#E0E0E0" },
  insideVertical: { style: "thin", color: "#E0E0E0" },
  outside: { style: "thin", color: "#90A4AE" },
};
stats.getRange("A:A").format.columnWidth = 31;
stats.getRange("B:B").format.columnWidth = 80;
stats.getRange("A4:B30").format = {
  font: { name: "Microsoft YaHei", size: 10 },
  verticalAlignment: "center",
  wrapText: true,
};
stats.getRange("A5:A30").format.font = { bold: true, name: "Microsoft YaHei", size: 10 };
stats.getRange("A4:B30").format.rowHeight = 25;
stats.getRange("A11:B11").format.rowHeight = 48;
stats.freezePanes.freezeRows(4);

const detailCheck = await workbook.inspect({
  kind: "table",
  range: "图片明细!A1:H14",
  include: "values,formulas",
  tableMaxRows: 14,
  tableMaxCols: 8,
});
console.log(detailCheck.ndjson);
const statsCheck = await workbook.inspect({
  kind: "table",
  range: "统计说明!A1:B30",
  include: "values,formulas",
  tableMaxRows: 30,
  tableMaxCols: 2,
});
console.log(statsCheck.ndjson);
const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errorScan.ndjson);

const outPath = `${outputDir}/化妆品备案记录_30张图片汇总.xlsx`;
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outPath);
console.log(JSON.stringify({
  exported: outPath,
  sourceRows: occurrences.length,
  exactUniqueRows: uniqueRows.length,
  conflictingNumbers: conflictingNumbers.size,
}));
