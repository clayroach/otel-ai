/**
 * File demonstrating SQL string violations outside storage package
 */

export const queries = {
  // VIOLATION: Raw SQL SELECT outside storage
  getUsers: 'SELECT * FROM users WHERE active = true',

  // VIOLATION: Raw SQL INSERT outside storage
  createUser: 'INSERT INTO users (name, email) VALUES (?, ?)',

  // VIOLATION: Raw SQL UPDATE outside storage
  updateUser: 'UPDATE users SET name = ? WHERE id = ?',

  // VIOLATION: Raw SQL DELETE outside storage
  deleteUser: 'DELETE FROM users WHERE id = ?',

  // VIOLATION: CREATE TABLE outside storage
  createTable: `
    CREATE TABLE IF NOT EXISTS metrics (
      id UUID,
      name String,
      value Float64
    ) ENGINE = MergeTree()
    ORDER BY id
  `
}

// VIOLATION: Function using direct SQL
export function buildQuery(table: string, conditions: string[]) {
  return `SELECT * FROM ${table} WHERE ${conditions.join(' AND ')}`
}

// VIOLATION: Using ClickhouseClient directly
export async function directQuery() {
  // This would bypass the StorageServiceTag abstraction
  const result = await globalThis.clickhouse.query('SELECT NOW()')
  return result
}
