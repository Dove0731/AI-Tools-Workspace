# 部门负责人每周经营复盘表模板复刻合同

## Reference

- Retained reference: `E:\新AI工具人\98_AI输出暂存区\模板创建\2026-07-20_部门负责人每周经营复盘表\reference.docx`
- Source snapshot SHA-256: `DCA14DD75052C5EE3C64CCBC3916B1494F1DA22509B02FC5755207C990A9F97D`
- Source size: 42,880 bytes
- Page count: 5（由 Microsoft Word 只读导出 PDF 后确认）
- Section count: 1
- Reference render: `word-render/page-1.png` 至 `word-render/page-5.png`
- Structural evidence: `template-style-evidence.json`、`reference-structure.json`
- Render fallback: bundled `render_docx.py` could not find LibreOffice; Word read-only PDF export plus Poppler rasterization was used for five-page visual inspection.

## Page system

- Page size: US Letter, 8.5 × 11.0 inches, portrait.
- Margins: top/bottom/left/right all 1.0 inch.
- Header distance: 0.4917 inch; footer distance: 0.4917 inch.
- One section, NEW_PAGE start type; no different first page or odd/even page variation.
- Header is visually blank. Footer contains right-aligned `企业经营闭环工具` on every page.

## Typography and color

- Primary font: Microsoft YaHei throughout.
- Title: 18 pt, bold, centered, 8 pt before, 4 pt after, 1.15 line spacing.
- Subtitle: 10.5 pt, centered, 4 pt after, 1.15 line spacing.
- Section labels: 12 pt, bold, 18 pt before, 4 pt after, 1.15 line spacing.
- Main table/body copy is primarily 9.5 pt; metadata and narrative text use 10.5 pt where present.
- Table header fill: `E8EEF5`; normal cell fill: `FFFFFF`.
- Callout fill: `FFF7E6`; callout border/accent: `E0B15A`.
- Standard borders/text secondary line color observed: `A6A6A6`.

## Tables and grids

The reference has 10 tables. Preserve their order, merged cells, border/fill rules, cell padding, wrapping, and vertical alignment.

1. Metadata table: 6×2, grid 1800/7560 twips.
2. Usage-position callout: 1×1, grid 9360 twips, pale yellow fill.
3. Operating judgment: 5×4, grid 1800/4680/1200/1680 twips.
4. Problem radar, first pattern: 6×4, grid 1800/3600/1200/2760 twips.
5. Problem radar continuation: 6×4, grid 1800/3600/1200/2760 twips.
6. Team and role observation: 6×4, grid 1800/3360/2160/2040 twips.
7. Mechanism and AI application: 4×4, grid 1800/2520/2520/2520 twips.
8. Closure promotion: 4×5, grid 900/2880/1440/2880/1260 twips.
9. Bottom three questions: 4×2, grid 4200/5160 twips.
10. Submission self-check callout: 1×1, grid 9360 twips, pale yellow fill.

## Ordered content flow

1. Title and subtitle.
2. Reporter/audience/period/frequency/core-goal metadata.
3. Usage-position callout.
4. Filling rules.
5. Operating judgment.
6. Problem radar.
7. Team and role observation.
8. Mechanism accumulation and AI use.
9. Closure promotion.
10. Next-week top three priorities.
11. Bottom three questions.
12. Submission self-check callout.

## Slot map

- Metadata table: reporter, reporting line, reporting period. Frequency and core goal remain template guidance unless explicitly changed.
- Operating judgment: replace only the weekly-entry, traffic-light and management-intervention cells.
- Problem radar: replace weekly findings, judgment, owner, deadline and action fields; keep dimension prompts intact.
- Team observation: replace evidence, judgment and coaching/adjustment actions; keep role labels intact.
- Mechanism/AI: replace names, versions, fields, users, use scenarios and review results; keep category prompts intact.
- Closure promotion: replace prior-week items, results, incomplete reasons and next-week processing fields.
- Next-week priorities: replace P1/P2/P3 item, owner, deliverable/checkpoint and completion time.
- Bottom questions: replace only the weekly-answer column.
- Callouts, title, subtitle, section labels, footer, guidance text and category labels are preserve-only unless the user explicitly requests a change.

Stable locators are the table index and row/column position in `word/document.xml`, plus the fixed section-label paragraph sequence. No content controls, fields, drawings, footnotes or endnotes exist.

## Package preservation

- Package contains 19 parts; full path/size/SHA-256 inventory is recorded in `reference-structure.json`.
- Preserve-only parts include `customXml/*`, styles, stylesWithEffects, numbering, theme, fontTable, settings, webSettings, header, footer, document relationships, package relationships, properties and thumbnail.
- Only the intended text nodes in `word/document.xml` may change when producing a filled weekly report. All other parts and relationships must remain present and unchanged unless a user explicitly requests a visual change.

## Fidelity gates

- The retained reference must continue to match the recorded SHA-256.
- New reports must remain recognizably identical in page system, typography, table geometry, fills, borders, footer and ordered section structure.
- All pages must be rendered and inspected; no clipping, overlap, broken merged cells, unexpected pagination or changed recurring footer is allowed.
- Empty optional slots may stay blank. Never invent weekly facts, data, owners, deadlines or results to fill space.
