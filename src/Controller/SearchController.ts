import { Request, Response } from "express";
import { z } from "zod";
import { mysqlQuery } from "../utils/mysqlQuery";

const searchUsersSchema = z.object({
  role: z.enum(["artist", "sessionist"]),
  q: z.string().trim().min(1).max(100),
});

type SearchRow = {
  id: number;
  username: string | null;
  email: string | null;
  display_name: string | null;
};

export async function searchUsers(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const parsed = searchUsersSchema.safeParse({
      role: req.query.role,
      q: req.query.q,
    });

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid search parameters",
        errors: parsed.error.flatten(),
      });
    }

    const { role, q } = parsed.data;
    const keyword = `%${q}%`;

    let sql = "";
    let params: unknown[] = [];

    if (role === "artist") {
      sql = `
        SELECT
          id,
          username,
          email,
          COALESCE(Stage_name, Full_name, username) AS display_name
        FROM artist
        WHERE
          username LIKE ?
          OR Full_name LIKE ?
          OR Stage_name LIKE ?
          OR email LIKE ?
        ORDER BY
          CASE
            WHEN Stage_name IS NOT NULL AND Stage_name <> '' THEN 0
            ELSE 1
          END,
          Stage_name ASC,
          Full_name ASC,
          username ASC
        LIMIT 10
      `;
      params = [keyword, keyword, keyword, keyword];
    } else {
      sql = `
        SELECT
          id,
          username,
          email,
          COALESCE(Stage_Name, Full_name, username) AS display_name
        FROM sessionist
        WHERE
          username LIKE ?
          OR Full_name LIKE ?
          OR Stage_Name LIKE ?
          OR email LIKE ?
        ORDER BY
          CASE
            WHEN Stage_Name IS NOT NULL AND Stage_Name <> '' THEN 0
            ELSE 1
          END,
          Stage_Name ASC,
          Full_name ASC,
          username ASC
        LIMIT 10
      `;
      params = [keyword, keyword, keyword, keyword];
    }

    const rows = await mysqlQuery<SearchRow[]>(sql, params);

    return res.status(200).json({
      items: rows.map((row) => ({
        id: Number(row.id),
        username: row.username ?? "",
        email: row.email ?? "",
        display_name: row.display_name ?? row.username ?? "Unnamed user",
      })),
    });
  } catch (error: any) {
    console.error("searchUsers error:", error);

    return res.status(500).json({
      message: error?.message || "Failed to search users",
    });
  }
}