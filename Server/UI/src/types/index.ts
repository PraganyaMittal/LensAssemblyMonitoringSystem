export interface LensAssemblyPC {
  mcId: number
  lineNumber: number
  mcNumber: number
  ipAddress: string
  generationNo: string
  isOnline: boolean
  isApplicationRunning: boolean
  lifecycleState?: string
  lifecycleError?: string | null
  agentVersion: string | null
  serviceVersion: string | null
  lastHeartbeat: string | null
  currentModel: {
    modelName: string
    modelPath: string
  } | null
  modelCount: number
}

export interface LineGroup {
  lineNumber: number
  targetModelName: string | null
  pcs: LensAssemblyPC[]
}

export interface MCDetails extends LensAssemblyPC {
  configFilePath: string
  logFolderPath: string
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
  modelName?: string 
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

export interface PCListResponse {
  lines: LineGroup[]
}

export interface ZipEntry {
  path: string
  size: number
  isDirectory: boolean
}

export interface GenerationNo {
  generationNoId: number
  versionNumber: number
  createdDate: string
  createdBy: string | null
  changeSummary: string | null
  size: number
}

// ── Model Management Types ──────────────────────────

export interface LineInfo {
  lineNumber: number
  machineCount: number
  onlineCount: number
  modelCount: number
  hasDefaultModel: boolean
}

export interface LineModel {
  modelName: string
  lensCount: number
  spacerCount: number
  assemblySequence: string | null
  ttl: number | null
  stepHeight: number | null
  lensHeight: number | null
  spacerHeight: number | null
  trayDimX: number | null
  trayDimY: number | null
  stepParamsJson: string | null
  componentParamsJson: string | null
  barrelSlotsJson: string | null
  version: string
  createdDate: string
  modifiedDate: string
  machineCount: number
  totalMachines: number
  lastSyncDate: string | null
  lastSyncStatus: string | null
  lastDeployDate: string | null
  lastDeployStatus: string | null
}

export interface BarrelConfig {
  lensCount: number
  spacerCount: number
  assemblySequence: string[]
  ttl: number | null
  trayDimX: number | null
  trayDimY: number | null
  stepParamsJson?: string | null
  componentParamsJson?: string | null
  barrelSlotsJson?: string | null
  machineCount?: number
}

export interface PickerParams {
  lensDiameter?: number
  lensThickness?: number
  angle?: number
  pressure?: number
  lensTrayDimX?: number
  lensTrayDimY?: number
  spacerOuterDia?: number
  spacerInnerDia?: number
  spacerThickness?: number
  [key: string]: number | undefined
}

export interface PickerConfig {
  mcNumber: number
  picker1Enabled: boolean
  picker1Type: string | null
  picker1Position: string | null
  picker1Params: PickerParams | null
  picker2Enabled: boolean
  picker2Type: string | null
  picker2Position: string | null
  picker2Params: PickerParams | null
}

export interface SaveModelRequest {
  modelName: string
  description?: string
  baseModelFileId?: number
  barrelConfig: BarrelConfig
  pickerConfigs: PickerConfig[]
}

export interface DefaultModelInfo {
  modelFileId: number
  modelName: string
  fileName: string
  fileSize: number
  uploadedDate: string
  description: string | null
}

// ── Barrel Assembly Types ──────────────────────────────

export interface StepParams {
  stepHeight: number
  innerDiameter: number
}

export interface LensComponentParams {
  angle?: number
  pressure?: number
  lensDiameter?: number
  lensHeight?: number
  lensThickness?: number
  lensColor?: string
  lensOpacity?: number
}

export interface SpacerComponentParams {
  angle?: number
  pressure?: number
  spacerOuterDia?: number
  spacerInnerDia?: number
  spacerHeight?: number
  spacerThickness?: number
}

export type ComponentParams = LensComponentParams | SpacerComponentParams
