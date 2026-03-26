export type FileChangeOperation = "create" | "modify" | "delete";

export interface FileChange {
  filePath: string;
  operation: FileChangeOperation;
  originalContent?: string;
  newContent?: string;
  description?: string;
}
