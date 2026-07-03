/**
 * Ranking Legis - Google Apps Script
 *
 * Como usar:
 * 1. Abra a planilha do Ranking Legis.
 * 2. Va em Extensoes > Apps Script.
 * 3. Cole este codigo no editor.
 * 4. Salve e execute atualizarRankingLegis uma vez para autorizar.
 *
 * Depois disso, preencha apenas a aba "rodada".
 * O script atualiza a aba "ranking" automaticamente.
 */

const RANKING_LEGIS_CONFIG = {
  rodadaSheetName: "rodada",
  rankingSheetName: "ranking",
  timezone: "America/Sao_Paulo",
  rodadaHeaders: [
    "data",
    "tema",
    "nome",
    "instagram",
    "colocacao",
    "pontosGanhos",
  ],
  rankingHeaders: [
    "posicao",
    "nome",
    "instagram",
    "pontos",
    "acertos",
    "ultimaPontuacao",
    "atualizadoEm",
  ],
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Ranking Legis")
    .addItem("Atualizar ranking agora", "atualizarRankingLegis")
    .addItem("Instalar gatilho automatico", "instalarGatilhoRankingLegis")
    .addToUi();
}

function onEdit(event) {
  if (!event || !event.range) {
    return;
  }

  const sheet = event.range.getSheet();

  if (sheet.getName() === RANKING_LEGIS_CONFIG.rodadaSheetName) {
    atualizarRankingLegis();
  }
}

function instalarGatilhoRankingLegis() {
  const spreadsheet = SpreadsheetApp.getActive();
  const existingTriggers = ScriptApp.getProjectTriggers();

  existingTriggers.forEach((trigger) => {
    if (trigger.getHandlerFunction() === "atualizarRankingLegisPorGatilho") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("atualizarRankingLegisPorGatilho")
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert("Gatilho automatico instalado com sucesso.");
}

function atualizarRankingLegisPorGatilho(event) {
  if (!event || !event.range) {
    return;
  }

  const sheet = event.range.getSheet();

  if (sheet.getName() === RANKING_LEGIS_CONFIG.rodadaSheetName) {
    atualizarRankingLegis();
  }
}

function atualizarRankingLegis() {
  const spreadsheet = SpreadsheetApp.getActive();
  const rodadaSheet = getOrCreateSheet_(
    spreadsheet,
    RANKING_LEGIS_CONFIG.rodadaSheetName,
    RANKING_LEGIS_CONFIG.rodadaHeaders,
  );
  const rankingSheet = getOrCreateSheet_(
    spreadsheet,
    RANKING_LEGIS_CONFIG.rankingSheetName,
    RANKING_LEGIS_CONFIG.rankingHeaders,
  );

  const rodadaRows = readRows_(rodadaSheet, RANKING_LEGIS_CONFIG.rodadaHeaders);
  const participantes = calcularParticipantes_(rodadaRows);
  const atualizadoEm = Utilities.formatDate(
    new Date(),
    RANKING_LEGIS_CONFIG.timezone,
    "dd/MM/yyyy HH:mm",
  );

  const rankingValues = participantes.map((participante, index) => [
    index + 1,
    participante.nome,
    participante.instagram,
    participante.pontos,
    participante.acertos,
    participante.ultimaPontuacao,
    atualizadoEm,
  ]);

  writeTable_(
    rankingSheet,
    RANKING_LEGIS_CONFIG.rankingHeaders,
    rankingValues,
  );
}

function calcularParticipantes_(rodadaRows) {
  const participantesPorInstagram = {};

  rodadaRows.forEach((row) => {
    const nome = String(row.nome || "").trim();
    const instagram = normalizarInstagram_(row.instagram);
    const pontosGanhos = toNumber_(row.pontosGanhos);
    const data = parseDate_(row.data);

    if (!nome || !instagram) {
      return;
    }

    if (!participantesPorInstagram[instagram]) {
      participantesPorInstagram[instagram] = {
        nome,
        instagram,
        pontos: 0,
        acertos: 0,
        ultimaPontuacaoDate: null,
        ultimaPontuacao: "",
      };
    }

    const participante = participantesPorInstagram[instagram];
    participante.nome = nome;
    participante.pontos += pontosGanhos;

    if (pontosGanhos > 0) {
      participante.acertos += 1;
    }

    if (data && (!participante.ultimaPontuacaoDate || data > participante.ultimaPontuacaoDate)) {
      participante.ultimaPontuacaoDate = data;
      participante.ultimaPontuacao = Utilities.formatDate(
        data,
        RANKING_LEGIS_CONFIG.timezone,
        "dd/MM/yyyy HH:mm",
      );
    }
  });

  return Object.values(participantesPorInstagram).sort((a, b) => {
    if (b.pontos !== a.pontos) {
      return b.pontos - a.pontos;
    }

    if (b.acertos !== a.acertos) {
      return b.acertos - a.acertos;
    }

    return a.nome.localeCompare(b.nome);
  });
}

function getOrCreateSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const currentHeaders = sheet
    .getRange(1, 1, 1, headers.length)
    .getValues()[0]
    .map((header) => String(header || "").trim());

  const hasMissingHeader = headers.some(
    (header, index) => currentHeaders[index] !== header,
  );

  if (hasMissingHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function readRows_(sheet, expectedHeaders) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values = sheet
    .getRange(1, 1, lastRow, expectedHeaders.length)
    .getValues();
  const headers = values[0].map((header) => String(header || "").trim());

  return values.slice(1).map((row) => {
    return headers.reduce((item, header, index) => {
      item[header] = row[index];
      return item;
    }, {});
  });
}

function writeTable_(sheet, headers, values) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (values.length > 0) {
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function normalizarInstagram_(value) {
  const instagram = String(value || "").trim();

  if (!instagram) {
    return "";
  }

  return instagram.startsWith("@") ? instagram : `@${instagram}`;
}

function toNumber_(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(
    String(value || "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim(),
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  const nativeDate = new Date(text);

  if (!Number.isNaN(nativeDate.getTime())) {
    return nativeDate;
  }

  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/,
  );

  if (!match) {
    return null;
  }

  const year = match[3].length === 2 ? `20${match[3]}` : match[3];

  return new Date(
    Number(year),
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4] || 0),
    Number(match[5] || 0),
  );
}
