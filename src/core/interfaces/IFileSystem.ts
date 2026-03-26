export interface FileInfo {
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
}

export interface IFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listDirectory(path: string, recursive?: boolean): Promise<FileInfo[]>;
  stat(path: string): Promise<FileInfo>;
  mkdir(path: string): Promise<void>;
}
