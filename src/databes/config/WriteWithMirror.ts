import mysqlDB from "./Mysqldb";
import { queryWithMirror } from "./SupabaseDb";

export function mysqlQuery<T = any>(sql: string, values: any[] = []) {
  return new Promise<T>((resolve, reject) => {
    mysqlDB.query(sql, values, (err: any, results: any) => {
      if (err) return reject(err);
      resolve(results as T);
    });
  });
}

export async function writeWithMirror(opts: {
  op?: "insert" | "update" | "upsert" | "delete";
  mysql: { sql: string; values: any[] };
  mirror?: { table: string; payload: any; onConflict?: string };
}) {
  const result = await mysqlQuery<any>(opts.mysql.sql, opts.mysql.values);

  if (opts.mirror) {
    try {
      await queryWithMirror(opts.mirror.table, opts.mirror.payload, opts.mirror.onConflict ?? "id");
    } catch (e: any) {
      await mysqlQuery(
        `INSERT INTO mirror_failures (op, table_name, payload_json, error_msg)
         VALUES (?,?,?,?)`,
        [
          opts.op ?? "upsert",
          opts.mirror.table,
          JSON.stringify(opts.mirror.payload),
          String(e?.message ?? e),
        ]
      );
    }
  }

  return result;
}