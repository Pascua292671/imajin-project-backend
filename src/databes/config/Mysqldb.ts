import mysql from "mysql2";

const mysqlDB = mysql.createConnection({
   host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Acepascua0991",
  database: process.env.DB_NAME || "imajindb",
});

mysqlDB.connect((err: any) => {
  if (err) {
    console.error("MySQL connection failed:", err);
  } else {
    console.log("Connected to MySQL");
  }
});









export default mysqlDB;