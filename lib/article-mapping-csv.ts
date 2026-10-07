/**
 * Parser pequeno para o arquivo exportado pela própria Central.
 * Ele aceita aspas no padrão CSV e as aspas escapadas pelo JSON.stringify,
 * usado pelo exportador atual, inclusive quando a legislação contém quebras.
 */
export function parseArticleMappingCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const source = content.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\" && quoted && source[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (character === '"' && quoted && source[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { row.push(value); value = ""; continue; }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value); rows.push(row); row = []; value = "";
      continue;
    }
    value += character;
  }
  if (quoted) throw new Error("CSV inválido: há um campo entre aspas sem fechamento.");
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

export function parseArticleMappingCsvObjects(content: string): Record<string, string>[] {
  const [header, ...data] = parseArticleMappingCsv(content);
  if (!header?.length || !header.includes("slug") || !header.includes("ordem")) throw new Error("CSV inválido: as colunas slug e ordem são obrigatórias.");
  return data.filter((row) => row.some((value) => value.trim())).map((row) => Object.fromEntries(header.map((key, index) => [key.trim(), row[index] ?? ""])));
}
