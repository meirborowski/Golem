import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { IFileSystem, FileInfo } from "../../core/interfaces/IFileSystem.js";

export class LocalFileSystemAdapter implements IFileSystem {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(this.resolve(filePath), "utf-8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = this.resolve(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
  }

  async deleteFile(filePath: string): Promise<void> {
    await fs.unlink(this.resolve(filePath));
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async listDirectory(dirPath: string, recursive?: boolean): Promise<FileInfo[]> {
    const resolved = this.resolve(dirPath);
    const entries = await fs.readdir(resolved, { withFileTypes: true, recursive });
    const results: FileInfo[] = [];

    for (const entry of entries) {
      const entryPath = path.join(entry.parentPath ?? resolved, entry.name);
      const stats = await fs.stat(entryPath);
      results.push({
        path: path.relative(this.basePath, entryPath).replace(/\\/g, "/"),
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime,
      });
    }

    return results;
  }

  async stat(filePath: string): Promise<FileInfo> {
    const resolved = this.resolve(filePath);
    const stats = await fs.stat(resolved);
    return {
      path: filePath,
      isDirectory: stats.isDirectory(),
      size: stats.size,
      modifiedAt: stats.mtime,
    };
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(this.resolve(dirPath), { recursive: true });
  }

  private resolve(filePath: string): string {
    const resolved = path.resolve(this.basePath, filePath);
    if (!resolved.startsWith(this.basePath)) {
      throw new Error(`Path traversal not allowed: ${filePath}`);
    }
    return resolved;
  }
}
