import type { CategoriaLegislacao, Legislacao, SimNao } from "@/lib/legislacoes";

type CsvRow = Record<string, string>;

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const [headerLine, ...dataLines] = lines;

  if (!headerLine) {
    return [];
  }

  const headers = parseCsvLine(headerLine);

  return dataLines.map((line) => {
    const values = parseCsvLine(line);

    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function isCategoria(value: string): value is CategoriaLegislacao {
  return (
    value === "Constituição Federal" ||
    value === "Códigos" ||
    value === "Legislações"
  );
}

function toSimNao(value: string): SimNao {
  return value.toLowerCase() === "sim" ? "Sim" : "Não";
}

function rowToLegislacao(row: CsvRow): Legislacao | null {
  const codigo = row.codigo || row.slug;

  if (!codigo || !row.nome || !isCategoria(row.categoria)) {
    return null;
  }

  return {
    slug: codigo,
    nome: row.nome,
    descricaoCurta: row.descricaoCurta,
    categoria: row.categoria,
    destaqueHome: toSimNao(row.destaqueHome),
    ativo: toSimNao(row.ativo),
    youtubeUrl: row.youtubeUrl,
    quantidadeFlashcards:
      Number(row.quantidadeFlashcards.replace(/\./g, "").replace(",", ".")) ||
      0,
    pdfEsquematizadoUrl: row.pdfEsquematizadoUrl || undefined,
    legiscastUrl: row.legiscastUrl || undefined,
    hotmartUrl: row.hotmartUrl,
    ultimaAlteracaoLegislativa: row.ultimaAlteracaoLegislativa,
  };
}

export async function fetchLegislacoesFromGoogleSheets(csvUrl: string) {
  const response = await fetch(csvUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Não foi possível carregar a planilha do Google Sheets.");
  }

  const csv = await response.text();

  return parseCsv(csv)
    .map(rowToLegislacao)
    .filter((legislacao): legislacao is Legislacao => legislacao !== null);
}
