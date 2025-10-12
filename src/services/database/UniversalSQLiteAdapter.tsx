// src/services/database/UniversalSQLiteAdapter.tsx
import { SQLiteDBConnection, type capSQLiteChanges } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import type { Database, SqlJsStatic } from 'sql.js';

// Unified interface matching Capacitor's API
export interface UniversalSQLiteConnection {
  query(statement: string, values?: any[]): Promise<{ values?: any[] }>;
  run(statement: string, values?: any[]): Promise<capSQLiteChanges>;
  executeSet(statements: { statement: string; values?: any[] }[], transaction?: boolean): Promise<capSQLiteChanges>;
  close(): Promise<void>;
}

// Platform detection
const isNative = Capacitor.isNativePlatform();
const isWeb = !isNative;

/**
 * Universal SQLite Adapter - Using sql.js for web
 * 100% backward compatible with existing DatabaseManager code
 */
export class UniversalSQLiteAdapter implements UniversalSQLiteConnection {
  private nativeConnection?: SQLiteDBConnection;
  private webConnection?: Database;
  private platform: 'native' | 'web';
  private dbName: string;

  constructor(connection: SQLiteDBConnection | Database, platform: 'native' | 'web', dbName: string = '') {
    this.platform = platform;
    this.dbName = dbName;
    
    if (platform === 'native') {
      this.nativeConnection = connection as SQLiteDBConnection;
    } else {
      this.webConnection = connection as Database;
    }
  }

  /**
   * Query - SELECT operations
   */
  async query(statement: string, values?: any[]): Promise<{ values?: any[] }> {
    if (this.platform === 'native' && this.nativeConnection) {
      return await this.nativeConnection.query(statement, values);
    } else if (this.webConnection) {
      return this.executeWebQuery(statement, values);
    }
    throw new Error('No database connection available');
  }

  /**
   * Run - INSERT/UPDATE/DELETE operations
   */
  async run(statement: string, values?: any[]): Promise<capSQLiteChanges> {
    if (this.platform === 'native' && this.nativeConnection) {
      return await this.nativeConnection.run(statement, values);
    } else if (this.webConnection) {
      return this.executeWebRun(statement, values);
    }
    throw new Error('No database connection available');
  }

  /**
   * ExecuteSet - Transaction operations
   */
  async executeSet(
    statements: { statement: string; values?: any[] }[],
    transaction: boolean = true
  ): Promise<capSQLiteChanges> {
    if (this.platform === 'native' && this.nativeConnection) {
      return await this.nativeConnection.executeSet(statements, transaction);
    } else if (this.webConnection) {
      return this.executeWebTransaction(statements, transaction);
    }
    throw new Error('No database connection available');
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.platform === 'native' && this.nativeConnection) {
      await this.nativeConnection.close();
    } else if (this.webConnection) {
      this.webConnection.close();
      // Save to IndexedDB before closing
      await this.saveToIndexedDB();
    }
  }

  // ==================== WEB-SPECIFIC IMPLEMENTATIONS ====================

  /**
   * Execute SELECT query on web using sql.js
   */
  private executeWebQuery(statement: string, values?: any[]): { values?: any[] } {
    if (!this.webConnection) throw new Error('Web connection not initialized');

    try {
      const results = this.webConnection.exec(statement, values || []);
      
      if (!results || results.length === 0) {
        return { values: [] };
      }

      // Convert sql.js result format to Capacitor format
      const result = results[0];
      const rows: any[] = [];
      
      if (result && result.values) {
        for (const row of result.values) {
          const rowObj: any = {};
          result.columns.forEach((col, index) => {
            rowObj[col] = row[index];
          });
          rows.push(rowObj);
        }
      }
      
      return { values: rows };
    } catch (error) {
      console.error('Web query error:', statement, error);
      throw error;
    }
  }

  /**
   * Execute INSERT/UPDATE/DELETE on web
   */
  private executeWebRun(statement: string, values?: any[]): capSQLiteChanges {
    if (!this.webConnection) throw new Error('Web connection not initialized');

    try {
      // Execute the statement
      this.webConnection.run(statement, values || []);
      
      // Get changes and last insert ID
      const changes = this.webConnection.getRowsModified();
      
      // Get last insert rowid
      let lastId = 0;
      if (statement.trim().toUpperCase().startsWith('INSERT')) {
        const result = this.webConnection.exec('SELECT last_insert_rowid() as id');
        if (result && result[0] && result[0].values && result[0].values[0]) {
          lastId = result[0].values[0][0] as number;
        }
      }
      
      // Save to IndexedDB after every write
      this.saveToIndexedDB();
      
      return {
        changes: {
          changes: changes,
          lastId: lastId
        }
      };
    } catch (error) {
      console.error('Web run error:', statement, error);
      throw error;
    }
  }

  /**
   * Execute transaction on web
   */
  private executeWebTransaction(
    statements: { statement: string; values?: any[] }[],
    transaction: boolean
  ): capSQLiteChanges {
    if (!this.webConnection) throw new Error('Web connection not initialized');

    let totalChanges = 0;
    let lastId = 0;

    try {
      if (transaction) {
        this.webConnection.run('BEGIN TRANSACTION');
      }

      for (const stmt of statements) {
        this.webConnection.run(stmt.statement, stmt.values || []);
        
        const changes = this.webConnection.getRowsModified();
        totalChanges += changes;
        
        // Get last insert ID if it was an INSERT
        if (stmt.statement.trim().toUpperCase().startsWith('INSERT')) {
          const result = this.webConnection.exec('SELECT last_insert_rowid() as id');
          if (result && result[0] && result[0].values && result[0].values[0]) {
            lastId = result[0].values[0][0] as number;
          }
        }
      }

      if (transaction) {
        this.webConnection.run('COMMIT');
      }
      
      // Save to IndexedDB after transaction
      this.saveToIndexedDB();

      return {
        changes: {
          changes: totalChanges,
          lastId: lastId
        }
      };
    } catch (error) {
      if (transaction) {
        try {
          this.webConnection.run('ROLLBACK');
        } catch (rollbackError) {
          console.error('Rollback error:', rollbackError);
        }
      }
      console.error('Web transaction error:', error);
      throw error;
    }
  }

  /**
   * Save database to IndexedDB for persistence
   */
  private async saveToIndexedDB(): Promise<void> {
    if (!this.webConnection) return;
    
    try {
      const data = this.webConnection.export();
const arrayBuffer = new ArrayBuffer(data.byteLength);
const uint8Array = new Uint8Array(arrayBuffer);
uint8Array.set(new Uint8Array(data));
const blob = new Blob([arrayBuffer], { type: 'application/x-sqlite3' });

      // const data = this.webConnection.export();
      // const blob = new Blob([data], { type: 'application/x-sqlite3' });
      
      // Use IndexedDB to store the database
      const dbName = 'sqljs-databases';
      const request = indexedDB.open(dbName, 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('databases')) {
          db.createObjectStore('databases');
        }
      };
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(['databases'], 'readwrite');
        const store = transaction.objectStore('databases');
        store.put(blob, this.dbName);
        transaction.oncomplete = () => {
          db.close();
        };
      };
      
      request.onerror = (event) => {
        console.error('IndexedDB save error:', event);
      };
    } catch (error) {
      console.error('Failed to save to IndexedDB:', error);
    }
  }
}

/**
 * Universal Connection Manager
 * Drop-in replacement for SQLiteConnectionManager
 */
export class UniversalConnectionManager {
  private static instance: UniversalConnectionManager;
  private connections: Map<string, UniversalSQLiteConnection> = new Map();
  private capacitorManager?: any;
  private SQL?: SqlJsStatic;
  private sqlInitPromise?: Promise<void>;

  private constructor() {
    if (isWeb) {
      this.sqlInitPromise = this.initializeSqlJs();
    }
  }

  static getInstance(): UniversalConnectionManager {
    if (!UniversalConnectionManager.instance) {
      UniversalConnectionManager.instance = new UniversalConnectionManager();
    }
    return UniversalConnectionManager.instance;
  }

  /**
   * Initialize sql.js for web platforms
   */
  private async initializeSqlJs(): Promise<void> {
    try {
      console.log('Initializing sql.js for web platform...');
      
      // Import sql.js
      const initSqlJs = (await import('sql.js')).default;
      
      // Initialize with CDN WASM file
      this.SQL = await initSqlJs({
        locateFile: (file) => `https://sql.js.org/dist/${file}`
      });
      
      console.log('✅ sql.js initialized successfully');
    } catch (error) {
      console.error('Failed to initialize sql.js:', error);
      throw new Error('Web SQLite initialization failed: ' + error);
    }
  }

  /**
   * Get database connection (backward compatible)
   */
  async getConnection(dbName: string): Promise<UniversalSQLiteConnection> {
    if (this.connections.has(dbName)) {
      return this.connections.get(dbName)!;
    }

    let connection: UniversalSQLiteConnection;

    if (isNative) {
      // Native platform: use Capacitor SQLite
      if (!this.capacitorManager) {
        const { default: SQLiteConnectionManager } = await import('./Initializer');
        this.capacitorManager = SQLiteConnectionManager.getInstance();
      }
      const nativeConn = await this.capacitorManager.getConnection(dbName);
      connection = new UniversalSQLiteAdapter(nativeConn, 'native', dbName);
    } else {
      // Web platform: use sql.js
      if (this.sqlInitPromise) {
        await this.sqlInitPromise;
      }
      
      if (!this.SQL) {
        throw new Error('sql.js not initialized');
      }
      
      const webConn = await this.openWebDatabase(dbName);
      connection = new UniversalSQLiteAdapter(webConn, 'web', dbName);
    }

    this.connections.set(dbName, connection);
    return connection;
  }

  /**
   * Open database on web using sql.js with IndexedDB persistence
   */
  private async openWebDatabase(dbName: string): Promise<Database> {
    if (!this.SQL) {
      throw new Error('sql.js not initialized');
    }

    try {
      // Try to load existing database from IndexedDB
      const existingData = await this.loadFromIndexedDB(dbName);
      
      let db: Database;
      
      if (existingData) {
        // Load existing database
        db = new this.SQL.Database(new Uint8Array(existingData));
        console.log(`✅ Loaded existing database "${dbName}" from IndexedDB`);
      } else {
        // Create new database
        db = new this.SQL.Database();
        console.log(`✅ Created new database "${dbName}"`);
      }
      
      // Apply SQLite optimizations
      db.run('PRAGMA journal_mode = MEMORY');
      db.run('PRAGMA synchronous = OFF');
      db.run('PRAGMA cache_size = -32000');
      db.run('PRAGMA temp_store = MEMORY');
      
      return db;
    } catch (error) {
      console.error('Failed to open web database:', error);
      throw error;
    }
  }

  /**
   * Load database from IndexedDB
   */
  private async loadFromIndexedDB(dbName: string): Promise<ArrayBuffer | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open('sqljs-databases', 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('databases')) {
          db.createObjectStore('databases');
        }
      };
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(['databases'], 'readonly');
        const store = transaction.objectStore('databases');
        const getRequest = store.get(dbName);
        
        getRequest.onsuccess = async () => {
          const blob = getRequest.result as Blob;
          if (blob) {
            const arrayBuffer = await blob.arrayBuffer();
            resolve(arrayBuffer);
          } else {
            resolve(null);
          }
          db.close();
        };
        
        getRequest.onerror = () => {
          console.log('No existing database found in IndexedDB');
          resolve(null);
          db.close();
        };
      };
      
      request.onerror = () => {
        console.error('Failed to open IndexedDB');
        resolve(null);
      };
    });
  }

  /**
   * Close connection
   */
  async closeConnection(dbName: string): Promise<void> {
    const connection = this.connections.get(dbName);
    if (connection) {
      await connection.close();
      this.connections.delete(dbName);
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections(): Promise<void> {
    for (const [dbName, connection] of this.connections) {
      await connection.close();
      this.connections.delete(dbName);
    }
  }
}

// Pre-initialize for web to speed up first connection
if (isWeb) {
  UniversalConnectionManager.getInstance();
}