const path = require('path');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const databasePath = process.env.DATABASE_FILE
  ? path.resolve(process.env.DATABASE_FILE)
  : path.join(__dirname, 'data', 'campuscare.json');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const adapter = new FileSync(databasePath);
const db = low(adapter);

db.defaults({ users: [], complaints: [], notifications: [] }).write();

module.exports = db;
