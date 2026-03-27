import { Request, Response } from "express";
import { writeWithMirror } from "../databes/config/WriteWithMirror"; // ✅ match casing

export const mirrorTest = async (_req: Request, res: Response) => {
  try {
    const note = `mirror ping ${new Date().toISOString()}`;

    const result = await writeWithMirror({
      mysql: {
        sql: "INSERT INTO mirror_test (note) VALUES (?)",
        values: [note],
      },
      mirror: {
        table: "mirror_test",
        payload: { note }, // id will be auto on supabase
        onConflict: "id",
      },
    });

    return res.json({
      ok: true,
      message: "Mirror test inserted",
      mysqlInsertId: result.insertId,
      note,
    });
  } catch (err: any) {
    console.error("mirrorTest error:", err);
    return res.status(500).json({
      ok: false,
      message: "Mirror test failed",
      error: String(err?.message ?? err),
    });
  }
};

