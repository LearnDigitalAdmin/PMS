declare module 'wa-sqlite/dist/wa-sqlite-async.mjs' {
  export interface SQLite3 {
    open_v2(filename: string, flags: number, vfs?: string): Promise<number>;
    close(db: number): Promise<void>;
    exec(
      db: number,
      sql: string,
      callback: (row: any[], columns: string[]) => void,
      bind?: any[]
    ): Promise<void>;
    changes(db: number): number;
    last_insert_rowid(db: number): number;
    vfs_register(vfs: any, makeDefault: boolean): void;
    SQLITE_OPEN_READWRITE: number;
    SQLITE_OPEN_CREATE: number;
  }

  export interface SQLiteFactory {
    (config?: { locateFile?: (file: string) => string }): Promise<SQLite3>;
  }

  const factory: SQLiteFactory;
  export default factory;
}

declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  export class IDBBatchAtomicVFS {
    constructor(name: string, options?: { durability?: 'default' | 'strict' | 'relaxed' });
    isReady(): Promise<void>;
  }
}