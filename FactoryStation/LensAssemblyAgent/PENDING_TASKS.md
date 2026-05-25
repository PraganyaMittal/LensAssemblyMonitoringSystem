# C++ Agent — Pending Production Tasks

<!--
  ==================== AI CONTEXT NOTE ====================
  This file tracks remaining hardening tasks for the C++ agent (LensAssemblyAgent).
  
  If an AI assistant reads this repository, these are KNOWN ISSUES that still need
  to be fixed. Do NOT suggest these as new findings — they are already documented.
  
  Each task has a priority and estimated effort. Tasks are organized by Phase.
  
  IMPORTANT: Phase D depends on the client providing the new log file format.
  Until then, the config structure can be built but the column values cannot
  be finalized.
  
  Last updated: 2026-05-17
  =========================================================
-->

## Config-Driven Log Filter (~1 day)

<!--
  AI NOTE: This phase is PARTIALLY BLOCKED.
  The client (factory operations team) is changing the log file format.
  The config structure should be built NOW, but the column index values
  cannot be finalized until the new format specification arrives.
  
  Current hardcoded values in LogService.cpp UploadFilteredFile():
  - tabCount >= 10 (minimum 11 columns)
  - Column 9 = event field (START/END/NG)
  - Column 10 = JSON payload (must contain "barrelId")
  
  These WILL BREAK when the log format changes. The fix is to move them
  to a JSON config file that can be updated without recompiling.
-->

### D.1 — Create LogFilterConfig struct

**File**: New `include/logs/LogFilterConfig.h`

Create a struct that reads filter rules from a JSON config file:
```cpp
struct LogFilterConfig {
    int minColumns = 11;
    int eventColumn = 9;
    int payloadColumn = 10;
    std::vector<std::string> relevantEvents = {"START", "END", "NG"};
    std::vector<std::string> requiredPayloadKeys = {"barrelId"};
    size_t maxLineLength = 65536;  // Also fixes D11 (OOM on corrupted files)
    
    static LogFilterConfig FromJson(const nlohmann::json& j);
};
```

### D.2 — Create JSON config file

**File**: New `config/log_filter.json`

```json
{
    "minColumns": 11,
    "eventColumn": 9,
    "payloadColumn": 10,
    "relevantEvents": ["START", "END", "NG"],
    "requiredPayloadKeys": ["barrelId"],
    "maxLineLength": 65536
}
```

### D.3 — Update UploadFilteredFile to use config

**File**: `src/logs/LogService.cpp` — `UploadFilteredFile()` method

Replace all hardcoded magic numbers with values from `LogFilterConfig`.
Also add `maxLineLength` check (D11 fix) to prevent OOM on corrupted files.

**Benefit**: When new log format arrives, update ONLY the JSON file.
Zero C++ recompilation. Zero agent binary redeployment.


---

## 🔲 PENDING WORK:
### **Phase D** — Config-Driven Log Filter
**Goal**: Extract all hardcoded filter magic numbers from UploadFilteredFile() into an external JSON config file that can be updated on the fly without recompiling or redeploying the C++ agent binary.

**WARNING**

**BLOCKER / DEPENDENCY**: The client's factory operations team is currently changing the log file format. Once the new log format description is received, the corresponding column indices must be updated. While the core JSON config loader structure can be built now, the exact index values cannot be finalized until the new format specs are ready.

**D.1 — Core Config Files & Structure**
New Header include/logs/LogFilterConfig.h: Defines a structure representing the filtration criteria.
New JSON Config config/log_filter.json: Shipped alongside the agent.
```cpp
**Proposed structure for LogFilterConfig**
struct LogFilterConfig {
    int minColumns = 11;
    int eventColumn = 9;           // 0-indexed event column index
    int payloadColumn = 10;        // 0-indexed JSON payload index
    std::vector<std::string> relevantEvents = {"START", "END", "NG"};
    std::vector<std::string> requiredPayloadKeys = {"barrelId"};
    size_t maxLineLength = 65536;  // Prevents OOM on long corrupt lines (fixes D11)
    static LogFilterConfig FromJson(const nlohmann::json& j);
};      
```
**D.2 — Parser Modernization (D6, D11)**
Modify LogService::UploadFilteredFile to read from the parsed LogFilterConfig instead of using the hardcoded values:
Replace tabCount >= 10 checks with configured minColumns.
Replace hardcoded column 9 and 10 indexing with eventColumn and payloadColumn from the configuration.
Implement a maxLineLength check inside std::getline to skip lines exceeding the limit (fully resolving D11).