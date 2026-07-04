import * as XLSX from 'xlsx'

type CellValue = string | number | boolean | null | undefined

export function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: CellValue[][],
) {
  const data = [headers, ...rows].map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : cell)),
  )

  const worksheet = XLSX.utils.aoa_to_sheet(data)
  const workbook = XLSX.utils.book_new()

  const columnWidths = headers.map((header, index) => {
    const maxLength = Math.max(
      String(header).length,
      ...rows.map((row) => String(row[index] ?? '').length),
    )

    return { wch: Math.min(Math.max(maxLength + 2, 10), 32) }
  })

  worksheet['!cols'] = columnWidths

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))
  XLSX.writeFile(workbook, filename)
}

export function downloadWorkbookXlsx(
  filename: string,
  sheets: Array<{ sheetName: string; headers: string[]; rows: CellValue[][] }>,
) {
  const workbook = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows].map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? '' : cell)),
    )
    const worksheet = XLSX.utils.aoa_to_sheet(data)
    worksheet['!cols'] = sheet.headers.map((header, index) => {
      const maxLength = Math.max(
        String(header).length,
        ...sheet.rows.map((row) => String(row[index] ?? '').length),
      )
      return { wch: Math.min(Math.max(maxLength + 2, 10), 36) }
    })
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.sheetName.slice(0, 31))
  }

  XLSX.writeFile(workbook, filename)
}
