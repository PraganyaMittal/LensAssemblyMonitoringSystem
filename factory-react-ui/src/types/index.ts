export interface FactoryPC {
  mcId: number
  lineNumber: number
  mcNumber: number
  ipAddress: string
  modelVersion: string
  isOnline: boolean
  isApplicationRunning: boolean
  lastHeartbeat: string | null
  lastUpdated: string
  currentModel: {
    modelName: string
    modelPath: string
  } | null
  modelCount: number
}

export interface LineGroup {
  lineNumber: number
  targetModelName: string | null
  pcs: FactoryPC[]
}

export interface MCDetails extends FactoryPC {
  configFilePath: string
  logFilePath: string
  modelFolderPath: string
  registeredDate: string
  availableModels: ModelInfo[]
  config: {
    configContent: string
    lastModified: string
  } | null
}

export interface ModelInfo {
  modelId: number
  modelName: string
  modelPath: string
  isCurrentModel: boolean
  discoveredDate: string
  lastUsed: string | null
}

export interface ModelFile {
  modelFileId: number
  modelName: string
  fileName: string
  fileSize: number
  description: string | null
  category: string | null
  uploadedDate: string
  uploadedBy: string | null
}

export interface Stats {
  totalPCs: number
  onlinePCs: number
  offlinePCs: number
  runningApps: number
  versions: Array<{ version: string; count: number }>
  lines: Array<{ line: number; count: number }>
}

export interface ApplyModelRequest {
  modelFileId: number
  targetType: 'all' | 'version' | 'line' | 'selected' | 'lineandversion'
  lineNumber?: number
  version?: string
  selectedMCIds?: number[]
  applyImmediately: boolean
  checkOnly?: boolean
  forceOverwrite?: boolean
  modelName?: string // For local-only models
}

export interface LineModelOption {
  modelName: string
  modelFileId?: number
  inLibrary: boolean
  availableOnMCIds: number[]
  totalPCsInLine: number
  complianceCount: number
  complianceText: string
}


// Add to your existing types
export interface PCUpdateRequest {
  mcId: number
  lineNumber: number
  mcNumber: number
  ipAddress: string
  configFilePath: string
  logFolderPath: string
  modelFolderPath: string
  modelVersion: string
}

export interface PCListResponse {
  lines: LineGroup[]
}

// Add this interface
export interface ZipEntry {
  path: string
  size: number
  isDirectory: boolean
}
