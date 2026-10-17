// Parts of the File System Access API that TypeScript's DOM lib doesn't ship yet.
interface FilePickerAcceptType {
  description?: string
  accept: Record<string, string | string[]>
}
interface OpenFilePickerOptions {
  multiple?: boolean
  excludeAcceptAllOption?: boolean
  types?: FilePickerAcceptType[]
  id?: string
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads'
}
interface SaveFilePickerOptions {
  suggestedName?: string
  types?: FilePickerAcceptType[]
  id?: string
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads'
}
interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads'
}
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}
interface FileSystemHandle {
  queryPermission?(d?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission?(d?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>
}
interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>
}
interface Window {
  showOpenFilePicker?(o?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  showSaveFilePicker?(o?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
  showDirectoryPicker?(o?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
}
