import type { IFileSystem, FileInfo } from "#core/interfaces/IFileSystem.js";

export class MemoryFileSystemAdapter implements IFileSystem {
  private files = new Map<string, { content: string; modifiedAt: Date }>();
  private directories = new Set<string>();

  constructor(initialFiles?: Record<string, string>) {
    this.directories.add("/");
    if (initialFiles) {
      for (const [path, content] of Object.entries(initialFiles)) {
        this.files.set(this.normalize(path), { content, modifiedAt: new Date() });
        this.ensureParentDirs(path);
      }
    }
  }

  async readFile(path: string): Promise<string> {
    const entry = this.files.get(this.normalize(path));
    if (!entry) throw new Error(`File not found: ${path}`);
    return entry.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.ensureParentDirs(path);
    this.files.set(this.normalize(path), { content, modifiedAt: new Date() });
  }

  async deleteFile(path: string): Promise<void> {
    const key = this.normalize(path);
    if (!this.files.has(key)) throw new Error(`File not found: ${path}`);
    this.files.delete(key);
  }

  async exists(path: string): Promise<boolean> {
    const key = this.normalize(path);
    return this.files.has(key) || this.directories.has(key);
  }

  async listDirectory(path: string, recursive?: boolean): Promise<FileInfo[]> {
    const dir = this.normalize(path);
    const results: FileInfo[] = [];

    for (const [filePath, entry] of this.files) {
      const parent = filePath.substring(0, filePath.lastIndexOf("/")) || "/";
      if (recursive ? filePath.startsWith(dir === "/" ? "/" : dir + "/") : parent === dir) {
        results.push({
          path: filePath,
          isDirectory: false,
          size: entry.content.length,
          modifiedAt: entry.modifiedAt,
        });
      }
    }

    for (const dirPath of this.directories) {
      if (dirPath === dir) continue;
      const parent = dirPath.substring(0, dirPath.lastIndexOf("/")) || "/";
      if (recursive ? dirPath.startsWith(dir === "/" ? "/" : dir + "/") : parent === dir) {
        results.push({
          path: dirPath,
          isDirectory: true,
          size: 0,
          modifiedAt: new Date(),
        });
      }
    }

    return results;
  }

  async stat(path: string): Promise<FileInfo> {
    const key = this.normalize(path);
    if (this.directories.has(key)) {
      return { path: key, isDirectory: true, size: 0, modifiedAt: new Date() };
    }
    const entry = this.files.get(key);
    if (!entry) throw new Error(`Not found: ${path}`);
    return { path: key, isDirectory: false, size: entry.content.length, modifiedAt: entry.modifiedAt };
  }

  async mkdir(path: string): Promise<void> {
    this.ensureParentDirs(path);
    this.directories.add(this.normalize(path));
  }

  private normalize(path: string): string {
    // Normalize to forward slashes, remove trailing slash (except root)
    let normalized = path.replace(/\\/g, "/");
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    if (!normalized.startsWith("/")) {
      normalized = "/" + normalized;
    }
    return normalized;
  }

  private ensureParentDirs(path: string): void {
    const parts = this.normalize(path).split("/").filter(Boolean);
    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
      current += "/" + parts[i];
      this.directories.add(current);
    }
  }
}
