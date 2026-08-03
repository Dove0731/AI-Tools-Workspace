import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = fileURLToPath(new URL(".", import.meta.url));
const date = new Date("2026-07-20T00:00:00");

const rows = [
  ["甄丽秀ZHENLIXIU芦荟鲜活深层补水保湿精萃霜", "粤G妆网备字2026223517", "广东碧素堂生物科技有限公司", date],
  ["INIA Nourishing Body Oil", "国妆网备出字（粤）2026037646", "广州泓美化妆品有限公司", date],
  ["形象美敏肌舒缓氨基酸洁面乳", "粤G妆网备字2026158969", "兴富生物科技（广东）有限公司", date],
  ["Olyshe石榴果酸磨砂膏", "粤G妆网备字2026209504", "深圳市汇尔能电子商务有限公司", date],
  ["LBM00052 PROFUSION COSMETICS HARD AT WORK NOURISHING LIP & CHEEK BALM", "国妆网备出字（浙）2026006704", "宁波金蒂化妆品有限公司", date],
  ["KARA Duo 滋润唇彩 virtual", "国妆网备出字（粤）2026037803", "广州佰丽化妆品有限公司", date],
  ["KARA Duo 珠光唇彩 champagne kiss", "国妆网备出字（粤）2026037792", "广州佰丽化妆品有限公司", date],
  ["Plouise A Helping Hand Cream-Fairytale Flavours", "国妆网备出字（粤）2026037503", "广东芭薇生物科技股份有限公司", date],
  ["AUREUM CREST", "国妆网备出字（浙）2026005917", "义乌市金芭蒂化妆品有限公司", date],
  ["CARLOTTA FOR LOVED ONE ZAFARAN AL OUD 6PCS SET 奕香法哈尔沉香6件套", "国妆网备出字（粤）2026037593", "广州卓芬化妆品有限公司", date],
  ["DOPI琉色不沾杯唇釉02#漫野红棕", "粤G妆网备字2026203894", "艺后化妆品（广东）有限公司", date],
  ["JMCY 3D SHAPING EYEBROW PENCIL E03", "国妆网备出字（浙）2026006696", "浙江可儿化妆品有限公司", date],
  ["MENGCHENGMOONLANART彩绘胶3", "粤G妆网备字2026213244", "清远市莱尔维生物科技有限公司", date],
  ["428A小蝴蝶粉盒", "国妆网备出字（粤）2026037409", "汕头市澄海区腾菲玩具厂", date],
  ["T-ZONE SALICYLIC ACID 6 NOSE STRIPS 白色水杨酸 鼻贴-6片装", "国妆网备出字（粤）2026037581", "广州诗妃生物科技有限公司", date],
  ["MST00259 PROFUSION COSMETICS CLEAN SWEEP SETTING SPRAY & SETTING POWDER SET", "国妆网备出字（浙）2026006702", "宁波金蒂化妆品有限公司", date],
  ["PERFECT DIARY TRI-COLOR QUICK-DRAW EYESHADOW STICK 04", "国妆网备出字（粤）2026037441", "逸仙生物科技（广州）有限公司", date],
  ["EYE CREAM ETERNITE 水解海绵眼霜系列（胶原蛋白+PDRN+积雪草）", "国妆网备出字（粤）2026037470", "广东诗妃化妆品有限公司", date],
  ["Bily Bear甜心小熊云朵唇霜06#", "粤G妆网备字2026196023", "汕头市铭汇生物科技有限公司", date],
  ["FACE CREAM ETERNITE 1268 修复霜 55ml", "国妆网备出字（粤）2026037458", "广东诗妃化妆品有限公司", date],
  ["奢莉卡芦荟水润舒颜面膜", "粤G妆网备字2026219727", "兴富生物科技（广东）有限公司", date],
  ["SERUM ETERNITE 水解海绵精华液两件套 50ml（胶原蛋白+PDRN）", "国妆网备出字（粤）2026037681", "广东诗妃化妆品有限公司", date],
  ["细植堂止痒去屑洗发露", "粤G妆网备字2026208530", "广东乐肤药妆生物科技有限公司", date],
  ["maiwell gel polish", "国妆网备出字（粤）2026037435", "广东柏芝翊新材料科技有限公司", date],
  ["LINES MOOTHER", "国妆网备出字（粤）2026037466", "广州市白云区优致化妆品厂", date],
  ["MAISON JUNE FACIAL WASH", "国妆网备出字（粤）2026037626", "广州臻颜化妆品有限公司", date],
  ["Bily Bear甜心小熊云朵唇霜02#", "粤G妆网备字2026196019", "汕头市铭汇生物科技有限公司", date],
  ["KARA Duo 珠光唇彩 timeless", "国妆网备出字（粤）2026037788", "广州佰丽化妆品有限公司", date],
  ["卡送娅尔御肤草本面膜", "湘G妆网备字2026001756", "长沙欣雨生物科技有限公司", date],
  ["UWHITE白松露抗皱紧致舒缓悬油次抛精华液", "粤G妆网备字2026225097", "广东小也生物科技有限公司", date],
  ["SADOER Graceful Mademoiselle Bloom Golden Perfume", "国妆网备出字（湘）2026000433", "湖南丽人生物科技有限公司", date],
  ["Bily Bear甜心小熊云朵唇霜03#", "粤G妆网备字2026196020", "汕头市铭汇生物科技有限公司", date],
  ["KARA Duo 旋转润唇膏 nectarine", "国妆网备出字（粤）2026037783", "广州佰丽化妆品有限公司", date],
  ["12-13g*4片 GONIM COLLAGEN PEPTIDE | PDRN HYDROGEL EYE MASK 紫变透E型眼膜", "国妆网备出字（粤）2026037585", "广东智妍生物科技有限公司", date],
  ["KARA Duo 定妆粉 white", "国妆网备出字（粤）2026037775", "广州佰丽化妆品有限公司", date],
  ["428-1F大圆三格粉盒", "国妆网备出字（粤）2026037418", "汕头市澄海区腾菲玩具厂", date],
  ["SKINNITY 7 serum 7天精华液", "国妆网备出字（粤）2026037651", "姆米又国际控股集团化妆品有限公司", date],
  ["KARA Duo 双色口红膏 wild orchid", "国妆网备出字（粤）2026037785", "广州佰丽化妆品有限公司", date],
  ["SF GLORÉ REAL DEEP MASK", "国妆网备出字（粤）2026037669", "广东碧婷化妆品有限公司", date],
  ["MAKEUP PRIMER", "国妆网备出字（粤）2026037464", "广州市白云区优致化妆品厂", date],
  ["MENGCHENGMOONLANART多功能建构封层胶", "粤G妆网备字2026213240", "清远市莱尔维生物科技有限公司", date],
  ["Carvie VITA-BOOST SERUM亮肤精华液", "国妆网备出字（粤）2026037652", "姆米又国际控股集团化妆品有限公司", date],
  ["蒂洛薇琥珀流光唇釉奶杏乌龙", "沪G妆网备字2026010654", "复皙药业（上海）有限公司", date],
  ["MIRAGE LAYON镀晶封层胶", "浙G妆网备字2026011344", "台州妍研化妆品有限公司", date],
  ["BUBBLY KIDS FOAM HAND WASH 300ML - BLUEBERRY蓝莓香儿童洗手液", "国妆网备出字（粤）2026037729", "广东诗妃化妆品有限公司", date],
  ["Plouise PYP Lip Conditioner SPF Formula-Plump Me Passionfruit", "国妆网备出字（粤）2026037553", "广东芭薇生物科技股份有限公司", date],
  ["BANANA Conceal Eye Cream", "国妆网备出字（粤）2026037467", "广州市白云区优致化妆品厂", date],
  ["KARA Duo 珠光唇彩 situationship", "国妆网备出字（粤）2026037791", "广州佰丽化妆品有限公司", date],
  ["Plouise PYP Lip Conditioner SPF Formula-Plump Me Passionfruit", "国妆网备出字（粤）2026037553", "广东芭薇生物科技股份有限公司", date],
  ["BANANA Conceal Eye Cream", "国妆网备出字（粤）2026037467", "广州市白云区优致化妆品厂", date],
  ["KARA Duo 珠光唇彩 situationship", "国妆网备出字（粤）2026037791", "广州佰丽化妆品有限公司", date],
  ["DOPI琉色不沾杯唇釉06#素影茶棕", "粤G妆网备字2026203891", "艺后化妆品（广东）有限公司", date],
  ["428-1A小蝴蝶粉盒", "国妆网备出字（粤）2026037413", "汕头市澄海区腾菲玩具厂", date],
  ["MaiDoll森氧植本玻尿酸保湿精华露", "粤G妆网备字2026169272", "潮州市新妍生物科技有限公司", date],
  ["Bily Bear甜心小熊云朵唇霜01#", "粤G妆网备字2026196018", "汕头市铭汇生物科技有限公司", date],
  ["Moonlight Market Collection Edition", "国妆网备出字（粤）2026037658", "汕头市雅漫芬生物科技有限公司", date],
  ["INIA PDRA&Collagen Capsule Cream", "国妆网备出字（粤）2026037645", "广州泓美化妆品有限公司", date],
  ["12-13g*4片 GONIM COLLAGEN PEPTIDE | PDRN HYDROGEL EYE MASK 粉变透E型眼膜", "国妆网备出字（粤）2026037578", "广东智妍生物科技有限公司", date],
  ["御兰润舒润养护膏", "粤G妆网备字2026232216", "中养科技（广东）有限公司", date],
  ["sence FACE SHEET MASK", "国妆网备出字（粤）2026037455", "美丽链接（广东）生物科技有限公司", date],
  ["KARA Duo 定妆粉 deep", "国妆网备出字（粤）2026037777", "广州佰丽化妆品有限公司", date],
];

const keyOf = (r) => `${r[0]}\u0000${r[1]}\u0000${r[2]}\u0000${r[3].toISOString()}`;
const uniqueRows = [...new Map(rows.map((r) => [keyOf(r), r])).values()];

const workbook = Workbook.create();
const detail = workbook.worksheets.add("备案明细");
const unique = workbook.worksheets.add("去重汇总");

function styleSheet(sheet, data, title, note, tableName) {
  const endRow = 5 + data.length;
  sheet.showGridLines = false;
  sheet.mergeCells("A1:E1");
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1:E1").format = {
    fill: "#1565C0",
    font: { bold: true, color: "#FFFFFF", size: 16 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    rowHeight: 32,
  };
  sheet.getRange("A2:E2").values = [[
    "本表记录数", data.length,
    "唯一备案记录数", uniqueRows.length,
    data.length === rows.length ? "含3条重复记录" : "已去重",
  ]];
  sheet.getRange("A2:E2").format = {
    fill: "#E3F2FD",
    font: { bold: true, color: "#174A75" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    rowHeight: 25,
  };
  sheet.mergeCells("A3:E3");
  sheet.getRange("A3").values = [[note]];
  sheet.getRange("A3:E3").format = {
    fill: "#FFF8E1",
    font: { color: "#6D4C41", italic: true },
    wrapText: true,
    verticalAlignment: "center",
    rowHeight: 28,
  };
  sheet.getRange("A5:E5").values = [["序号", "产品名称", "备案编号", "备案人企业", "备案时间"]];
  const matrix = data.map((r, i) => [i + 1, ...r]);
  sheet.getRange(`A6:E${endRow}`).values = matrix;
  sheet.getRange(`A5:E${endRow}`).format = {
    font: { name: "Microsoft YaHei", size: 10 },
    verticalAlignment: "center",
  };
  sheet.getRange("A5:E5").format = {
    fill: "#1E88E5",
    font: { bold: true, color: "#FFFFFF", name: "Microsoft YaHei", size: 10 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    rowHeight: 26,
    borders: { preset: "outside", style: "thin", color: "#1565C0" },
  };
  sheet.getRange(`A6:A${endRow}`).format.horizontalAlignment = "center";
  sheet.getRange(`C6:C${endRow}`).format.horizontalAlignment = "left";
  sheet.getRange(`E6:E${endRow}`).format.horizontalAlignment = "center";
  sheet.getRange(`E6:E${endRow}`).format.numberFormat = "yyyy-mm-dd";
  sheet.getRange(`B6:D${endRow}`).format.wrapText = true;
  sheet.getRange(`A6:E${endRow}`).format.borders = {
    insideHorizontal: { style: "thin", color: "#E0E0E0" },
    bottom: { style: "thin", color: "#90A4AE" },
  };
  sheet.getRange(`A6:E${endRow}`).format.rowHeight = 34;
  sheet.getRange("A:A").format.columnWidth = 13;
  sheet.getRange("B:B").format.columnWidth = 52;
  sheet.getRange("C:C").format.columnWidth = 31;
  sheet.getRange("D:D").format.columnWidth = 34;
  sheet.getRange("E:E").format.columnWidth = 15;
  sheet.freezePanes.freezeRows(5);
  const table = sheet.tables.add(`A5:E${endRow}`, true, tableName);
  table.style = "TableStyleMedium2";
  table.showBandedRows = true;
  table.showFilterButton = true;
  return endRow;
}

const detailEnd = styleSheet(
  detail,
  rows,
  "国产普通化妆品备案记录（图片整理）",
  "数据来源：用户提供截图。按截图出现顺序保留全部记录；黄色备案编号表示截图中出现重复记录。",
  "RegistryDetailTable",
);
detail.getRange("C51:C56").format = {
  fill: "#FFF2CC",
  font: { color: "#9C5700" },
};

styleSheet(
  unique,
  uniqueRows,
  "国产普通化妆品备案记录（去重汇总）",
  "按“产品名称 + 备案编号 + 备案人企业 + 备案时间”完全一致去重，共去除3条重复记录。",
  "RegistryUniqueTable",
);

const detailInspect = await workbook.inspect({
  kind: "table",
  range: `备案明细!A1:E${Math.min(detailEnd, 18)}`,
  include: "values,formulas",
  tableMaxRows: 18,
  tableMaxCols: 5,
});
console.log(detailInspect.ndjson);

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errorScan.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/国产普通化妆品备案记录_图片整理.xlsx`);
console.log(JSON.stringify({ exported: true, sourceRows: rows.length, uniqueRows: uniqueRows.length }));

for (const sheetName of ["备案明细", "去重汇总"]) {
  console.log(`rendering:${sheetName}`);
  const preview = await workbook.render({
    sheetName,
    range: sheetName === "备案明细" ? "A1:E18" : "A1:E18",
    scale: 1.2,
    format: "png",
  });
  await fs.writeFile(`${outputDir}/${sheetName}_preview.png`, new Uint8Array(await preview.arrayBuffer()));
  console.log(`rendered:${sheetName}`);
}
