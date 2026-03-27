import { QueryError } from "mysql2";
import mysqlDB from "../databes/config/Mysqldb";

export function mysqlQuery<T>(sql: string, values: unknown[] = []): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    mysqlDB.query(sql, values, (err: QueryError | null, results: unknown) => {
      if (err) {
        return reject(err);
      }

      resolve(results as T);
    });
  });
}