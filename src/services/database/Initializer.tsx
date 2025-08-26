import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";

// Alternative approach - Use a single shared connection manager
class SQLiteConnectionManager {
  private static instance: SQLiteConnectionManager;
  private sqlite: SQLiteConnection;
  private connections: Map<string, SQLiteDBConnection> = new Map();

  private constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  static getInstance(): SQLiteConnectionManager {
    if (!SQLiteConnectionManager.instance) {
      SQLiteConnectionManager.instance = new SQLiteConnectionManager();
    }
    return SQLiteConnectionManager.instance;
  }

  async getConnection(dbName: string): Promise<SQLiteDBConnection> {
    // Check if we already have this connection
    if (this.connections.has(dbName)) {
      return this.connections.get(dbName)!;
    }

    try {
      let db: SQLiteDBConnection;
      
      // Check if connection exists for this specific database
      const connectionExists = await this.sqlite.isConnection(dbName, false);
      
      if (connectionExists.result) {
        db = await this.sqlite.retrieveConnection(dbName, false);
        console.log(`Retrieved existing connection: ${dbName}`);
      } else {
        db = await this.sqlite.createConnection(dbName, false, "no-encryption", 1, false);
        console.log(`Created new connection: ${dbName}`);
      }
      
      await db.open();
      this.connections.set(dbName, db);
      
      return db;
    } catch (error) {
      console.error(`Error getting connection for ${dbName}:`, error);
      throw error;
    }
  }

  async closeConnection(dbName: string): Promise<void> {
    const connection = this.connections.get(dbName);
    if (connection) {
      await connection.close();
      this.connections.delete(dbName);
      console.log(`Closed connection: ${dbName}`);
    }
  }

  async closeAllConnections(): Promise<void> {
    for (const [name, connection] of this.connections) {
      await connection.close();
      console.log(`Closed connection: ${name}`);
    }
    this.connections.clear();
  }
}
export default SQLiteConnectionManager;