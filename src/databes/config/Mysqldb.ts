import mysql from "mysql2/promise";

const mysqlDB = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "imajindb",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

console.log("DB ENV CHECK", {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
});

(async () => {
  try {
    const connection = await mysqlDB.getConnection();
    console.log("Connected to MySQL");
    connection.release();
  } catch (err) {
    console.error("MySQL connection failed:", err);
  }
})();


(async () => {
  try {
    const connection = await mysqlDB.getConnection();
    const [rows] = await connection.query("SELECT DATABASE() AS db");
    console.log("Connected to MySQL DB:", rows);
    connection.release();
  } catch (err) {
    console.error("MySQL connection failed:", err);
  }
})();

export default mysqlDB;