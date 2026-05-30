---
name: Styled XLSX exports
description: Which library to use for browser-side Excel exports that need formatting
---

For client-side .xlsx exports that need any cell styling (bold/coloured headers,
fills, borders, number formats), use **exceljs**, not the `xlsx` (SheetJS) package.

**Why:** The SheetJS *community* build silently ignores cell `s`/style properties
when writing a workbook — styling is a paid Pro feature. `xlsx` is present in
artifacts/koapos/package.json but unused; do not reach for it when formatting matters.

**How to apply:** Import exceljs dynamically (`(await import("exceljs")).default`)
so its large (~270KB gzip) bundle is code-split and only loads on the export click.
Build the workbook, `await wb.xlsx.writeBuffer()`, wrap in a Blob with mime
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, and trigger a
download. Multiple tabs = multiple `wb.addWorksheet(name)`. Style a header row via
`row.eachCell(c => { c.font = {bold:true,...}; c.fill = {...}; })`.
