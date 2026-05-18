# Pending Tasks

## Log Analyzer (Phase 2 & Beyond)
- [ ] **Update Hardcoded Log Columns (C++ Agent)**: The current `UploadFilteredFile` logic in `LogService.cpp` hardcodes the event at tab index 9 and the JSON payload at index 10. When the new log format is provided, these indexes must be updated to correctly match the new format.
