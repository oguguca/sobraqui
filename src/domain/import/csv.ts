export type CsvTable = {
  delimiter: "," | ";" | "\t";
  headers: string[];
  /** Linhas de dados, com o número da linha no arquivo (1 = cabeçalho). */
  rows: { line: number; cells: string[] }[];
};

/** Escolhe o delimitador pelo cabeçalho, ignorando o que está entre aspas. */
export function detectDelimiter(firstLine: string): CsvTable["delimiter"] {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as keyof typeof counts]++;
  }
  const best = (Object.entries(counts) as [CsvTable["delimiter"], number][]).sort(
    (a, b) => b[1] - a[1],
  )[0];
  return best[1] > 0 ? best[0] : ",";
}

/** Parser RFC 4180: aspas, aspas escapadas ("") e quebras de linha dentro de campos. */
export function parseCsv(text: string): CsvTable {
  const firstLineEnd = text.search(/\r?\n/);
  const delimiter = detectDelimiter(firstLineEnd === -1 ? text : text.slice(0, firstLineEnd));

  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let fieldStarted = false;

  const endField = () => {
    cells.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRecord = () => {
    endField();
    if (!(cells.length === 1 && cells[0].trim() === "")) {
      records.push({ line: recordLine, cells: cells.map((c) => c.trim()) });
    }
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
      if (ch.trim() !== "") fieldStarted = true;
    }
  }
  if (field !== "" || cells.length > 0) endRecord();

  const [header, ...rows] = records;
  return { delimiter, headers: header?.cells ?? [], rows };
}
