import mysqlDB from "../databes/config/Mysqldb";

export async function mysqlQuery<T>(
  sql: string,
  values: unknown[] = []
): Promise<T> {
  const [results] = await mysqlDB.query(sql, values);
  return results as T;
}