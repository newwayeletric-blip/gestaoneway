// Leitura de planilha CSV salva pelo Excel brasileiro: separador ";" (ou ","),
// campos entre aspas com quebra de linha, e o arquivo em UTF-8 (com ou sem
// BOM) ou em Windows-1252, que é como o Excel salva "CSV (separado por
// vírgulas)" no Windows.

export function decodeCsvFile(buffer: ArrayBuffer): string {
  try {
    // TextDecoder já descarta o BOM do UTF-8 (ignoreBOM é false por padrão).
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

export function parseCsv(text: string): Record<string, string>[] {
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  const sep =
    (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...data] = rows.filter((r) => r.some((c) => c.trim()))
  if (!header) return []
  const keys = header.map((h) => h.trim().toLowerCase())
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])))
}
