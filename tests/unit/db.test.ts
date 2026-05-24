import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  query: vi.fn(),
  connect: vi.fn().mockResolvedValue(mockClient),
  on: vi.fn(),
};

vi.mock('pg', () => ({
  Pool: vi.fn(() => mockPool),
}));

describe('db module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.query.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('healthCheck', () => {
    it('returns true when database is reachable', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });

      const { healthCheck } = await import('@/lib/db');
      const result = await healthCheck();

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1 AS ok');
    });

    it('returns false when database query fails', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection refused'));

      const { healthCheck } = await import('@/lib/db');
      const result = await healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('runMigrations', () => {
    it('returns empty array when migrations directory does not exist', async () => {
      mockPool.query
        .mockResolvedValueOnce(undefined) // CREATE TABLE
        .mockResolvedValueOnce({ rows: [] }); // SELECT applied

      const { runMigrations } = await import('@/lib/db');
      const result = await runMigrations('/nonexistent/path');

      expect(result).toEqual([]);
    });

    it('executes unapplied migrations in sorted order', async () => {
      const tmpDir = path.join(__dirname, '__test_migrations__');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '001_first.sql'), 'CREATE TABLE test1 (id INT);');
      fs.writeFileSync(path.join(tmpDir, '002_second.sql'), 'CREATE TABLE test2 (id INT);');

      try {
        mockPool.query
          .mockResolvedValueOnce(undefined) // CREATE TABLE IF NOT EXISTS
          .mockResolvedValueOnce({ rows: [] }); // SELECT name FROM _migrations

        mockClient.query.mockResolvedValue(undefined);

        const { runMigrations } = await import('@/lib/db');
        const result = await runMigrations(tmpDir);

        expect(result).toEqual(['001_first.sql', '002_second.sql']);
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('CREATE TABLE test1 (id INT);');
        expect(mockClient.query).toHaveBeenCalledWith(
          'INSERT INTO _migrations (name) VALUES ($1)',
          ['001_first.sql']
        );
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('skips already-applied migrations', async () => {
      const tmpDir = path.join(__dirname, '__test_migrations_skip__');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '001_first.sql'), 'CREATE TABLE test1 (id INT);');
      fs.writeFileSync(path.join(tmpDir, '002_second.sql'), 'CREATE TABLE test2 (id INT);');

      try {
        mockPool.query
          .mockResolvedValueOnce(undefined) // CREATE TABLE IF NOT EXISTS
          .mockResolvedValueOnce({ rows: [{ name: '001_first.sql' }] }); // SELECT name

        mockClient.query.mockResolvedValue(undefined);

        const { runMigrations } = await import('@/lib/db');
        const result = await runMigrations(tmpDir);

        expect(result).toEqual(['002_second.sql']);
        // Should not have executed 001_first.sql
        expect(mockClient.query).not.toHaveBeenCalledWith('CREATE TABLE test1 (id INT);');
        expect(mockClient.query).toHaveBeenCalledWith('CREATE TABLE test2 (id INT);');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('rolls back and throws on migration failure', async () => {
      const tmpDir = path.join(__dirname, '__test_migrations_fail__');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '001_bad.sql'), 'INVALID SQL;');

      try {
        mockPool.query
          .mockResolvedValueOnce(undefined) // CREATE TABLE IF NOT EXISTS
          .mockResolvedValueOnce({ rows: [] }); // SELECT name

        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockRejectedValueOnce(new Error('syntax error')) // SQL execution fails
          .mockResolvedValueOnce(undefined); // ROLLBACK

        const { runMigrations } = await import('@/lib/db');
        await expect(runMigrations(tmpDir)).rejects.toThrow('syntax error');
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('only processes .sql files', async () => {
      const tmpDir = path.join(__dirname, '__test_migrations_filter__');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '001_first.sql'), 'CREATE TABLE test1 (id INT);');
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Migrations');
      fs.writeFileSync(path.join(tmpDir, '.gitkeep'), '');

      try {
        mockPool.query
          .mockResolvedValueOnce(undefined) // CREATE TABLE IF NOT EXISTS
          .mockResolvedValueOnce({ rows: [] }); // SELECT name

        mockClient.query.mockResolvedValue(undefined);

        const { runMigrations } = await import('@/lib/db');
        const result = await runMigrations(tmpDir);

        expect(result).toEqual(['001_first.sql']);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });
});
