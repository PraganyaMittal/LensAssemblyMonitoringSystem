<!-- 
╔══════════════════════════════════════════════════════════════════════════════╗
║                         AI INSTRUCTION — MANDATORY                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ This file is the MASTER FILE MAP for the FactoryMonitoring project.          ║
║                                                                              ║
║ RULES FOR ALL AI ASSISTANTS:                                                 ║
║  1. When you CREATE a new file that belongs to any feature listed below,     ║
║     you MUST add it to the appropriate section in this document.             ║
║  2. When you DELETE a file listed here, you MUST remove it from this doc.    ║
║  3. When you RENAME or MOVE a file listed here, you MUST update the path.    ║
║  4. When you add a NEW FEATURE, you MUST create a new section here.          ║
║  5. When you add a NEW DB COLUMN used by a feature, add it to the DB         ║
║     section of that feature.                                                 ║
║  6. When you add a NEW API ENDPOINT, add it to the Server section.           ║
║  7. NEVER skip updating this file. It is the source of truth for reviews.    ║
╚══════════════════════════════════════════════════════════════════════════════╝
-->

# FactoryMonitoring — Feature File Map

> **Purpose**: Quick-reference for code reviews. Navigate to any feature, pick a component layer (Agent / Server / DB / UI), and see every file involved.
>
> **Last reviewed**: 2026-05-19 (Phase 5 — Full Agent Refactor & UI Review)

---

## 1. Log Analyzer

### 1.1 Log Structure Sync

The pipeline that detects log-folder changes on the Agent, syncs the directory tree to the Server, persists it to DB, and makes it available to the UI via polling.

#### Agent (C++)

| File | Role |
|------|------|
| `FactoryStation/LensAssemblyAgent/include/log_analyzer/sync/LogDirWatcher.h` | Header — Win32 `ReadDirectoryChangesW` watcher with debounce |
| `FactoryStation/LensAssemblyAgent/src/log_analyzer/sync/LogDirWatcher.cpp` | Implementation — MonitorLoop + 5s DebounceLoop |
| `FactoryStation/LensAssemblyAgent/include/log_analyzer/sync/LogStructureSyncService.h` | Header — SyncWorkerLoop, BuildDirectoryTree, TriggerAsyncSync |
| `FactoryStation/LensAssemblyAgent/src/log_analyzer/sync/LogStructureSyncService.cpp` | Implementation — Structure build, thundering-herd delay, HTTP POST to `/api/agent/synclogs` |
| `FactoryStation/LensAssemblyAgent/include/common/Constants.h` | `ENDPOINT_SYNC_LOGS` constant |
| `FactoryStation/LensAssemblyAgent/src/core/AgentCore.cpp` | Initializes `LogDirWatcher` and `LogService`, wires the callback |

#### Server (C# .NET)

| File | Role |
|------|------|
| `Server/API/Controllers/LogController.cs` | `POST /api/agent/synclogs` — receives agent structure sync, directly enqueues |
| `Server/API/Services/Batching/LogStructureQueue.cs` | Channel-based bounded queue (capacity: 5000) |
| `Server/API/Services/Batching/ChannelWriteQueue.cs` | Generic base queue with batch-read support |
| `Server/API/Services/LogStructureBatchProcessor.cs` | `BackgroundService` — drains queue, batch-writes to DB |
| `Server/API/Services/LogService.cs` | `SyncLogStructureAsync()` — enqueue entry point |
| `Server/API/Services/ILogService.cs` | Interface definition |
| `Server/API/Controllers/LogAnalyzerController.cs` | `GET /api/LogAnalyzer/structure/{mcId}` — UI reads structure |
| `Server/API/Models/DTOs/AgentDTOs.cs` | `LogStructureSyncRequest` DTO (lines 144-150) |
| `Server/API/Program.cs` | DI registration for `LogStructureQueue`, `LogStructureBatchProcessor` |

#### Database

| Table | Column | Type | Purpose |
|-------|--------|------|---------|
| `LensAssemblyMCs` | `LogStructureJson` | `nvarchar(max), nullable` | Stores the JSON directory tree |
| `LensAssemblyMCs` | `LogFolderPath` | `nvarchar(500)` | Agent's local log folder root path |
| `LensAssemblyMCs` | `LastUpdated` | `datetime` | Timestamp of last structure sync |

Entity model: `Server/API/Models/LensAssemblyMC.cs` (lines 30, 40, 50)
Entity model: `Server/API/Models/MCLogStructure.cs`

#### UI (React/TypeScript)

| File | Role |
|------|------|
| `Server/UI/src/features/LogAnalyzer/LogAnalyzerPage.tsx` | Active routed page — Feature module entry point |
| `Server/UI/src/features/LogAnalyzer/hooks/useLogStream.ts` | Polling hook with `AbortController` for structure updates |
| `Server/UI/src/types/logTypes.ts` | Shared types: `LogFileNode`, `OperationData`, `BarrelExecutionData`, `AnalysisResult`, etc. |
| `Server/UI/src/features/LogAnalyzer/types/log.schemas.ts` | Zod schemas + types: `LogFileStructureSchema`, `LogFileContentSchema`, validation helpers |
| `Server/UI/src/components/LogAnalyzer/LogFileSelector.tsx` | File tree viewer — shared component used by active page |

---

### 1.2 Log File Fetch (On-Demand)

Agent uploads a log file on-demand via SignalR command → HTTP POST.
- **ANALYSIS Mode**: Agent streams file line-by-line, filters to relevant lines only (~500KB from 40-50MB), compresses, uploads. The legacy full file download has been removed.

#### Agent (C++)

| File | Role |
|------|------|
| `FactoryStation/LensAssemblyAgent/include/log_analyzer/upload/LogFileUploadService.h` | Header for log file upload service |
| `FactoryStation/LensAssemblyAgent/src/log_analyzer/upload/LogFileUploadService.cpp` | `UploadRequestedFile()` — dispatches to filtered upload; `UploadFilteredFile()` — streaming line-by-line filter + GZip |
| `FactoryStation/LensAssemblyAgent/src/core/AgentCore.cpp` | `UPLOAD_LOG` command dispatch |
| `FactoryStation/LensAssemblyAgent/include/utilities/GzipCompressor.h` | GZip compression utility (`CompressToGzip` for filtered) |

#### Server (C# .NET)

| File | Role |
|------|------|
| `Server/API/Controllers/Hubs/AgentHub.cs` | SignalR hub — sends `ReceiveCommand("UPLOAD_LOG", ...)` |
| `Server/API/Services/LogService.cs` | `FetchFromAgentAsync()` — TCS pattern |
| `Server/API/Services/ILogService.cs` | Interface — `GetLogContentAsync(MCId, path)` |
| `Server/API/Services/LruSizeBasedLogCache.cs` | LRU cache for compressed log content |
| `Server/API/Services/ILogCache.cs` | Cache interface |
| `Server/API/Controllers/LogController.cs` | `POST /api/agent/uploadlog/{requestId}` — agent upload callback |
| `Server/API/Controllers/LogAnalyzerController.cs` | `POST /api/LogAnalyzer/file/{mcId}` — UI requests file content |

#### Database

No direct DB involvement — data flows through in-memory cache only.

#### UI (React/TypeScript)

| File | Role |
|------|------|
| `Server/UI/src/features/LogAnalyzer/hooks/useLogAnalysis.ts` | `handleFileClick()` — triggers fetch + parse via state machine |
| `Server/UI/src/features/LogAnalyzer/services/logAnalyzer.service.ts` | `getLogFileContent()`, `getInspectionImages()`, `getSingleImageUrl()` — Zod-validated API layer |

---

### 1.3 Log Parsing & Analysis (Client-Side)

All parsing happens in the browser. No server-side parser exists.

#### UI (React/TypeScript)

| File | Role |
|------|------|
| `Server/UI/src/features/LogAnalyzer/utils/logParser.ts` | **Primary parser** — handles Barrels, TrayLoads, NG, NGImage |
| `Server/UI/src/features/LogAnalyzer/workers/logParser.worker.ts` | Web Worker for offloading all parsing tasks |
| `Server/UI/src/features/LogAnalyzer/hooks/useLogAnalysis.ts` | State machine (useReducer) with worker offloading |
| `Server/UI/src/types/logTypes.ts` | `AnalysisResult`, `BarrelExecutionData`, `OperationData` types |
| `Server/UI/src/features/LogAnalyzer/types/log.schemas.ts` | Zod-validated schemas |
| `Server/UI/src/features/LogAnalyzer/constants/index.ts` | `OPERATION_INSPECTION_MAP`, polling intervals |

---

### 1.4 Analysis Visualization

Components that render parsed log analysis results.

#### UI (React/TypeScript)

| File | Role |
|------|------|
| `Server/UI/src/components/LogAnalyzer/AnalysisResultsModal.tsx` | Main modal — barrel list + chart tabs |
| `Server/UI/src/components/LogAnalyzer/BarrelExecutionChart.tsx` | Bar chart — barrel execution times |
| `Server/UI/src/components/LogAnalyzer/OperationGanttChart.tsx` | Gantt chart — per-barrel operations |
| `Server/UI/src/components/LogAnalyzer/SubOperationGanttChart.tsx` | Gantt chart — tray load sub-operations |
| `Server/UI/src/components/LogAnalyzer/LongGanttChart.tsx` | Full-width Gantt for all barrels |
| `Server/UI/src/components/LogAnalyzer/LensTrayBarChart.tsx` | Bar chart — lens tray load durations |
| `Server/UI/src/components/LogAnalyzer/SubOperationComparisonModal.tsx` | Modal comparing sub-ops across tray loads |
| `Server/UI/src/components/LogAnalyzer/LoadingOverlay.tsx` | Full-screen loading overlay |
| `Server/UI/src/components/LogAnalyzer/ThumbnailTooltip.tsx` | NG image thumbnail on hover |
| `Server/UI/src/components/LogAnalyzer/tooltipPositioning.ts` | Tooltip placement utilities |
| `Server/UI/src/services/thumbnailApi.ts` | Thumbnail REST API — used by OperationGanttChart, AnalysisResultsModal, InspectionImageViewer |

---

### 1.5 Inspection Image Fetch

Fetches NG inspection images from agent via SignalR.

#### Agent (C++)

| File | Role |
|------|------|
| `FactoryStation/LensAssemblyAgent/include/log_analyzer/upload/ImageUploadService.h` | Header for image upload service |
| `FactoryStation/LensAssemblyAgent/src/log_analyzer/upload/ImageUploadService.cpp` | `UploadRequestedImage()` — reads BMP, HTTP POST |
| `FactoryStation/LensAssemblyAgent/src/core/AgentCore.cpp` | `UPLOAD_IMAGE` command dispatch |

#### Server (C# .NET)

| File | Role |
|------|------|
| `Server/API/Services/ImageService.cs` | `GetInspectionImagesAsync()` — TCS + semaphore (max 2 concurrent) |
| `Server/API/Controllers/LogAnalyzerController.cs` | `POST /api/LogAnalyzer/images/{mcId}`, `GET /api/LogAnalyzer/image-content/{requestId}/{index}`, `GET /api/LogAnalyzer/fetch-image/{mcId}` |

#### UI (React/TypeScript)

| File | Role |
|------|------|
| `Server/UI/src/components/LogAnalyzer/InspectionImageViewer.tsx` | Image gallery component |

---

### 1.6 Yield Monitoring & Alerts

Real-time yield tracking and alert system within Log Analyzer.

#### Server (C# .NET)

| File | Role |
|------|------|
| `Server/API/Services/YieldService.cs` | Yield calculation and SignalR push |
| `Server/API/Controllers/Hubs/AgentHub.cs` | `ReceiveYieldUpdate` event |

#### UI (React/TypeScript)

| File | Role |
|------|------|
| `Server/UI/src/features/LogAnalyzer/context/YieldContext.tsx` | `YieldProvider` — SignalR listener + polling fallback |
| `Server/UI/src/features/LogAnalyzer/context/AlertContext.tsx` | `AlertProvider` — real-time alert management |
| `Server/UI/src/features/LogAnalyzer/context/SignalRContext.tsx` | `SignalRProvider` — hub connection lifecycle |
| `Server/UI/src/features/LogAnalyzer/context/LogAnalyzerSettingsContext.tsx` | Settings — date range, segments |
| `Server/UI/src/features/LogAnalyzer/components/SettingsModal.tsx` | Settings UI |
| `Server/UI/src/features/LogAnalyzer/components/AlertHistoryModal/AlertHistoryModal.tsx` | Alert history UI |
| `Server/UI/src/features/LogAnalyzer/components/YieldAlertBanner.tsx` | Inline alert banner |
| `Server/UI/src/components/LogAnalyzer/MCSelectionList.tsx` | Machine selection with yield badges |
| `Server/UI/src/services/YieldService.ts` | REST API for yield summary |
| `Server/UI/src/services/AlertService.ts` | REST API for alert CRUD |
| `Server/UI/src/features/LogAnalyzer/context/LogAnalyzerContext.tsx` | Loading state + download toast context |

---

### 1.7 Shared / Cross-Cutting

| File | Role |
|------|------|
| `Server/UI/src/App.tsx` | Route: `/log-analyzer` → `features/LogAnalyzer/LogAnalyzerPage.tsx` |
| `Server/UI/src/utils/eventBus.ts` | `LOG_ANALYZER_HOME` event (sidebar → page navigation) |
| `Server/UI/src/components/Sidebar.tsx` | Emits `LOG_ANALYZER_HOME` on nav click |
| `Server/UI/src/features/LogAnalyzer/styles/tokens.ts` | Design tokens for feature components |
| `Server/UI/src/components/OfflineAlertModal.tsx` | Shared offline warning modal |
| `Server/UI/src/components/LogAnalyzer/YieldHistoryModal.tsx` | Yield history chart modal (used by MCSelectionList) |

---

## Changelog

| Date | Phase | Changes |
|------|-------|---------|
| 2026-05-14 | Phase 1 Review | Initial map created. Removed dead `AnalyzeLogFile` endpoint + `ParseEnhancedLogFile` + `BarrelData`/`OperationData` classes from `LogAnalyzerController.cs` (~200 lines). Cleaned unused `Newtonsoft.Json`, `JObject`, `Regex` imports. |
| 2026-05-14 | Agent-Side Filtering | Implemented streaming line-by-line log filter on Agent (`UploadFilteredFile`). Server passes `ANALYSIS` filterMode via SignalR. Agent peak RAM: ~1MB vs 80MB. Transfer: ~50KB vs 4-5MB. Files changed: `LogService.h`, `LogService.cpp`, `AgentCore.cpp`, `ILogService.cs`, `LogService.cs`, `LogAnalyzerController.cs`. |
| 2026-05-14 | Clean Up Download Feature | Client requested removal of raw log downloads and Logs tab. Agent ALWAYS filters now. Removed `filterMode` parameter plumbing. Removed `DownloadLogFile` endpoint. Removed Logs tab, `react-virtual`, and `rawContent` memory storage from UI. |
| 2026-05-15 | UI Architecture Migration | Fully migrated Log Analyzer to the new React feature architecture. Routed `/log-analyzer` to `features/LogAnalyzer/LogAnalyzerPage.tsx`. Completely deleted the legacy implementation (`pages/LogAnalyzer.tsx`, `services/logAnalyzerApi.ts`, `utils/logParser.ts`). Permanently removed `ShiftTallyCard.tsx`. Moved `LogAnalyzerContext.tsx` into the feature folder. |
| 2026-05-15 | Phase 2 Review | **Dead files deleted (7):** feature-level `LogFileSelector/` (duplicate, never imported), `useLogNavigation.ts`, `useLogFilter.ts` (never used in components), `chartConfig.ts` (never imported), `thumbnail.service.ts` (duplicate of `thumbnailApi.ts`), `CameraIcon.tsx` (never imported). **Dead code removed:** `getLogStructure()` from service (duplicates `useLogStream` inline fetch), `System.Text` import from controller, `OPERATION_INSPECTION_MAP`/`LensAssemblyPC`/`LogFileStructure`/`LogFileContent`/`InspectionImageRequest`/`InspectionImageResponse` from `logTypes.ts` (duplicates of schemas), Thumbnail Zod schemas from `log.schemas.ts` (only used by deleted service), `ThumbnailData`/`ThumbnailResponse` re-exports from `log.types.ts`. **Barrel exports cleaned:** hooks, utils, services, types barrels updated. |
| 2026-05-19 | Phase 3-5 Review | **Agent Refactoring**: Log, yield, and image folders moved into `log_analyzer/` subdirectories (`sync/`, `upload/`, `yield/`). Split `LogService` into `LogStructureSyncService` and `LogFileUploadService`. Renamed `ImageService` to `ImageUploadService`. **Server Architecture**: Replaced CQRS `SyncLogStructureCommand`/`Handler` with direct queue push in `LogController`. Removed dead code (`LogRequestManager`, `IWriteQueue`). Extracted `MCLogStructure.cs` model. **Bugfixes**: Resolved memory cache invalidation issues in `FullImageCache` and `LruSizeBasedLogCache`. |
