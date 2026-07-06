export type RankingParticipant = {
  posicao: number;
  nome: string;
  instagram: string;
  pontos: number;
  acertos: number;
  ultimaPontuacao: string;
  atualizadoEm: string;
  primeiros: number;
  segundos: number;
  terceiros: number;
};

export type RankingTheme = {
  temaAtual: string;
  descricao: string;
  cursoUrl: string;
  instagramUrl: string;
  imagemUrl: string;
  playlistYoutubeLiga: string;
};

export type RankingRoundParticipant = {
  data: string;
  tema: string;
  nome: string;
  instagram: string;
  colocacao: number;
  pontosGanhos: number;
};

type CsvRow = Record<string, string>;

export type RankingLegisData = {
  ranking: RankingParticipant[];
  tema: RankingTheme;
  rodada: RankingRoundParticipant[];
  atualizadoEm: string;
};

const DEFAULT_INSTAGRAM_URL = "https://www.instagram.com/legis_flashcards/";
const DEFAULT_COURSE_URL = "/combo";

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

export function parseRankingCsv(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const [headerLine, ...dataLines] = lines;

  if (!headerLine) {
    return [];
  }

  const headers = parseCsvLine(headerLine).map((header) => header.trim());

  return dataLines.map((line) => {
    const values = parseCsvLine(line);

    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function toNumber(value: string) {
  const normalizedValue = String(value || "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function parseDateValue(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return 0;
  }

  const nativeDate = Date.parse(trimmedValue);

  if (Number.isFinite(nativeDate)) {
    return nativeDate;
  }

  const match = trimmedValue.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/,
  );

  if (!match) {
    return 0;
  }

  const [, day, month, year, hour = "0", minute = "0"] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;

  return new Date(
    Number(fullYear),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  ).getTime();
}

function getInitials(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";

  return `${first}${last}`.toUpperCase() || "LF";
}

function buildSheetUrl(sheetId: string, sheetName: string) {
  const params = new URLSearchParams({
    tqx: "out:csv",
    sheet: sheetName,
  });

  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;
}

async function fetchSheetTab(sheetId: string, sheetName: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const response = await fetch(buildSheetUrl(sheetId, sheetName), {
    next: { revalidate: 300 },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Nao foi possivel carregar a aba ${sheetName}.`);
  }

  return parseRankingCsv(await response.text());
}

function rowToRankingParticipant(row: CsvRow): RankingParticipant | null {
  const nome = row.nome?.trim();
  const instagram = row.instagram?.trim();

  if (!nome || !instagram) {
    return null;
  }

  return {
    posicao: toNumber(row.posicao),
    nome,
    instagram,
    pontos: toNumber(row.pontos),
    acertos: toNumber(row.acertos),
    ultimaPontuacao: row.ultimaPontuacao?.trim() ?? "",
    atualizadoEm: row.atualizadoEm?.trim() ?? "",
    primeiros: toNumber(row.primeiros),
    segundos: toNumber(row.segundos),
    terceiros: toNumber(row.terceiros),
  };
}

function rowToTheme(row: CsvRow | undefined): RankingTheme {
  return {
    temaAtual: row?.temaAtual?.trim() || "Tema da Liga",
    descricao:
      row?.descricao?.trim() ||
      "Questões sobre os principais artigos do tema atual da Liga Legis.",
    cursoUrl: row?.cursoUrl?.trim() || DEFAULT_COURSE_URL,
    instagramUrl: row?.instagramUrl?.trim() || DEFAULT_INSTAGRAM_URL,
    imagemUrl: normalizeImageUrl(row?.imagemUrl?.trim() || ""),
    playlistYoutubeLiga: row?.playlistYoutubeLiga?.trim() || "",
  };
}

function normalizeImageUrl(imageUrl: string) {
  if (!imageUrl) {
    return "";
  }

  try {
    const url = new URL(imageUrl);

    if (url.hostname.includes("drive.google.com")) {
      const filePathMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
      const idFromPath = filePathMatch?.[1];
      const idFromQuery = url.searchParams.get("id");
      const fileId = idFromPath || idFromQuery;

      if (fileId) {
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
      }
    }

    return imageUrl;
  } catch {
    return imageUrl;
  }
}

function rowToRoundParticipant(
  row: CsvRow,
): RankingRoundParticipant | null {
  const nome = row.nome?.trim();
  const instagram = row.instagram?.trim();

  if (!nome || !instagram) {
    return null;
  }

  return {
    data: row.data?.trim() ?? "",
    tema: row.tema?.trim() ?? "",
    nome,
    instagram,
    colocacao: toNumber(row.colocacao),
    pontosGanhos: toNumber(row.pontosGanhos),
  };
}

export function sortRanking(participants: RankingParticipant[]) {
  return [...participants]
    .sort((participantA, participantB) => {
      if (participantA.pontos !== participantB.pontos) {
        return participantB.pontos - participantA.pontos;
      }

      if (participantA.acertos !== participantB.acertos) {
        return participantB.acertos - participantA.acertos;
      }

      if (participantA.primeiros !== participantB.primeiros) {
        return participantB.primeiros - participantA.primeiros;
      }

      if (participantA.segundos !== participantB.segundos) {
        return participantB.segundos - participantA.segundos;
      }

      if (participantA.terceiros !== participantB.terceiros) {
        return participantB.terceiros - participantA.terceiros;
      }

      const updatedAtA = parseDateValue(participantA.atualizadoEm);
      const updatedAtB = parseDateValue(participantB.atualizadoEm);

      if (updatedAtA !== updatedAtB) {
        return updatedAtB - updatedAtA;
      }

      return participantA.nome.localeCompare(participantB.nome, "pt-BR");
    })
    .map((participant, index) => ({
      ...participant,
      posicao: index + 1,
    }));
}

function getLatestRound(roundParticipants: RankingRoundParticipant[]) {
  const latestDate = Math.max(
    ...roundParticipants.map((participant) => parseDateValue(participant.data)),
  );

  const latestParticipants =
    latestDate > 0
      ? roundParticipants.filter(
          (participant) => parseDateValue(participant.data) === latestDate,
        )
      : roundParticipants;

  return latestParticipants.sort((participantA, participantB) => {
    if (participantA.colocacao !== participantB.colocacao) {
      return participantA.colocacao - participantB.colocacao;
    }

    return participantB.pontosGanhos - participantA.pontosGanhos;
  });
}

function getLatestUpdatedAt(participants: RankingParticipant[]) {
  const rankedWithDate = [...participants]
    .filter((participant) => participant.atualizadoEm)
    .sort(
      (participantA, participantB) =>
        parseDateValue(participantB.atualizadoEm) -
        parseDateValue(participantA.atualizadoEm),
    );

  return rankedWithDate[0]?.atualizadoEm ?? "";
}

export function getParticipantInitials(nome: string) {
  return getInitials(nome);
}

export async function getRankingLegisData(): Promise<RankingLegisData> {
  const sheetId = process.env.NEXT_PUBLIC_RANKING_SHEET_ID;

  if (!sheetId) {
    throw new Error("NEXT_PUBLIC_RANKING_SHEET_ID nao foi configurada.");
  }

  const [rankingRows, themeRows, roundRows] = await Promise.all([
    fetchSheetTab(sheetId, "ranking"),
    fetchSheetTab(sheetId, "tema"),
    fetchSheetTab(sheetId, "rodada"),
  ]);

  const ranking = sortRanking(
    rankingRows
      .map(rowToRankingParticipant)
      .filter(
        (participant): participant is RankingParticipant =>
          participant !== null,
      ),
  );
  const rodada = getLatestRound(
    roundRows
      .map(rowToRoundParticipant)
      .filter(
        (participant): participant is RankingRoundParticipant =>
          participant !== null,
      ),
  );

  return {
    ranking,
    tema: rowToTheme(themeRows[0]),
    rodada,
    atualizadoEm: getLatestUpdatedAt(ranking),
  };
}
