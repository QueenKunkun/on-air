export interface TreeEntry {
  type: 'file' | 'directory';
  name: string;
  path: string;
}

export interface ApiResponse {
  dir: string;
  entries: TreeEntry[];
  error?: string;
}
