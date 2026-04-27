import mysql from 'mysql2/promise'
import { CONFIG } from './config.js'

export const db = mysql.createPool({
  host: CONFIG.db_host,
  user: CONFIG.db_user,
  password: CONFIG.db_password,
  database: CONFIG.db_name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})