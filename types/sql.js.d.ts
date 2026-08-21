declare module "sql.js" {
  type StatementResult = { values: unknown[][] };
  type Database = { exec(sql: string): StatementResult[]; close(): void };
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<{ Database: new (data: Uint8Array) => Database }>;
}
