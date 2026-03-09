import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
    ChevronDown, ChevronRight, AlertCircle, FolderOpen,
    Settings, FileCode, Layers, Search, X, ChevronsUpDown, Minimize2,
    RotateCcw, History
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

// State that can be persisted and restored
export interface XmlVisualEditorState {
    expandedGroups: string[];
    expandedSpecs: string[];
    scrollTop: number;
    searchQuery: string;
    showDiffPanel?: boolean;
}

interface XmlVisualEditorProps {
    content: string;
    originalContent?: string;  // For diff comparison
    onChange: (newContent: string) => void;
    filePath?: string;
    // Restore state when component mounts
    initialState?: XmlVisualEditorState;
    // Callback to save state when it changes
    onStateChange?: (state: XmlVisualEditorState) => void;
}

interface GroupData {
    id: string;
    name: string;
    isEnabled: boolean;
    specs: SpecData[];
}

interface SpecData {
    id: string;
    name: string;
    isEnabled: boolean;
    vals: ValData[];
}

interface ValData {
    id: string;
    specId: string;
    name: string;
    value: string;
    dataType: string;
    options: string[];
    min?: string;
    max?: string;
    isEditable: boolean;
    desc?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE CLEAN TREE EDITOR WITH STATE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

const XmlVisualEditor: React.FC<XmlVisualEditorProps> = ({
    content,
    originalContent,
    onChange,
    filePath,
    initialState,
    onStateChange
}) => {
    const [groups, setGroups] = useState<GroupData[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        new Set(initialState?.expandedGroups || [])
    );
    const [expandedSpecs, setExpandedSpecs] = useState<Set<string>>(
        new Set(initialState?.expandedSpecs || [])
    );
    const [searchQuery, setSearchQuery] = useState(initialState?.searchQuery || '');
    const contentRef = useRef(content);
    const treeRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);
    const hasRestoredScroll = useRef(false);

    const parser = useMemo(() => new DOMParser(), []);

    // Keep content ref updated
    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    // Get filename
    const fileName = useMemo(() => {
        if (!filePath) return 'XML Editor';
        return filePath.replace(/\\/g, '/').split('/').pop() || 'XML Editor';
    }, [filePath]);

    // Toggle for side-by-side diff panel (persisted in state)
    const [showDiffPanel, setShowDiffPanel] = useState(initialState?.showDiffPanel || false);
    // For exit animation
    const [isClosingDiffPanel, setIsClosingDiffPanel] = useState(false);
    // Track which diff value cells are expanded
    const [expandedDiffCells, setExpandedDiffCells] = useState<Set<string>>(new Set());
    const toggleDiffCell = useCallback((key: string) => setExpandedDiffCells(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; }), []);

    // Handle closing with animation
    const closeDiffPanel = useCallback(() => {
        setIsClosingDiffPanel(true);
        setTimeout(() => {
            setShowDiffPanel(false);
            setIsClosingDiffPanel(false);
        }, 280); // Match animation duration
    }, []);

    // Parse original content to build a map of original values: specId_valId -> originalValue
    const originalValuesMap = useMemo(() => {
        const map = new Map<string, string>();
        if (!originalContent) return map;
        try {
            const doc = parser.parseFromString(originalContent, "text/xml");
            if (doc.querySelector("parsererror")) return map;
            doc.querySelectorAll("group").forEach(groupEl => {
                groupEl.querySelectorAll(":scope > spec").forEach(specEl => {
                    const specId = specEl.getAttribute("spec_ID") || "";
                    specEl.querySelectorAll(":scope > val").forEach((valEl, idx) => {
                        const valId = valEl.getAttribute("val_id") || `v${idx}`;
                        const value = valEl.getAttribute("value") || "";
                        map.set(`${specId}_${valId}`, value);
                    });
                });
            });
        } catch { /* ignore parse errors */ }
        return map;
    }, [originalContent, parser]);

    // Parse XML
    useEffect(() => {
        try {
            const doc = parser.parseFromString(content, "text/xml");
            if (doc.querySelector("parsererror")) throw new Error("Invalid XML");

            const parsedGroups: GroupData[] = [];
            const groupIds: string[] = [];

            doc.querySelectorAll("group").forEach((groupEl, gIdx) => {
                const groupId = groupEl.getAttribute("group_ID") || `g_${gIdx}`;
                groupIds.push(groupId);

                const specs: SpecData[] = [];
                groupEl.querySelectorAll(":scope > spec").forEach((specEl, sIdx) => {
                    const specId = specEl.getAttribute("spec_ID") || `s_${groupId}_${sIdx}`;

                    const vals: ValData[] = [];
                    specEl.querySelectorAll(":scope > val").forEach((valEl, vIdx) => {
                        const valName = valEl.getAttribute("val_name") || "";
                        const valValue = valEl.getAttribute("value") || "";
                        const valId = valEl.getAttribute("val_id") || `v_${specId}_${vIdx}`;

                        if (valName || valValue) {
                            vals.push({
                                id: valId,
                                specId: specId,
                                name: valName,
                                value: valValue,
                                dataType: valEl.getAttribute("val_datatype") || "2",
                                options: valEl.getAttribute("options")?.split(",").filter(Boolean) || [],
                                min: valEl.getAttribute("min") || undefined,
                                max: valEl.getAttribute("max") || undefined,
                                isEditable: valEl.getAttribute("val_editable") !== "0",
                                desc: valEl.getAttribute("val_desc") || ""
                            });
                        }
                    });

                    specs.push({
                        id: specId,
                        name: specEl.getAttribute("spec_name") || "Parameter",
                        isEnabled: specEl.getAttribute("spec_check") === "1",
                        vals
                    });
                });

                parsedGroups.push({
                    id: groupId,
                    name: groupEl.getAttribute("group_name") || "Group",
                    isEnabled: groupEl.getAttribute("group_check") === "1",
                    specs
                });
            });

            setGroups(parsedGroups);

            // On first load, if no initial state provided, expand all groups
            if (isInitialMount.current && !initialState?.expandedGroups?.length) {
                setExpandedGroups(new Set(groupIds));
            }
            isInitialMount.current = false;
            setError(null);

        } catch (e) {
            setError(e instanceof Error ? e.message : "Parse error");
        }
    }, [content, parser, initialState?.expandedGroups?.length]);

    // Restore scroll position after groups/DOM are ready
    useEffect(() => {
        if (initialState?.scrollTop && treeRef.current && groups.length > 0 && !hasRestoredScroll.current) {
            // Small delay to ensure DOM is rendered
            requestAnimationFrame(() => {
                if (treeRef.current) {
                    treeRef.current.scrollTop = initialState.scrollTop;
                    hasRestoredScroll.current = true;
                }
            });
        }
    }, [groups, initialState?.scrollTop]);

    // Notify parent of state changes
    useEffect(() => {
        if (onStateChange && !isInitialMount.current) {
            onStateChange({
                expandedGroups: Array.from(expandedGroups),
                expandedSpecs: Array.from(expandedSpecs),
                scrollTop: treeRef.current?.scrollTop || 0,
                searchQuery,
                showDiffPanel
            });
        }
    }, [expandedGroups, expandedSpecs, searchQuery, showDiffPanel, onStateChange]);

    // Toggle group
    const toggleGroup = useCallback((groupId: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            next.has(groupId) ? next.delete(groupId) : next.add(groupId);
            return next;
        });
    }, []);

    // Toggle spec
    const toggleSpec = useCallback((specId: string) => {
        setExpandedSpecs(prev => {
            const next = new Set(prev);
            next.has(specId) ? next.delete(specId) : next.add(specId);
            return next;
        });
    }, []);

    // Local state for tracking active input to prevent cursor jumps
    const [activeInput, setActiveInput] = useState<{ id: string, value: string } | null>(null);

    // TARGETED VALUE REPLACEMENT using spec_ID + val_id
    const updateValue = useCallback((val: ValData, newValue: string, elementId?: string) => {
        // If typing in an input, update local state immediately
        if (elementId) {
            setActiveInput({ id: elementId, value: newValue });
        }

        const currentContent = contentRef.current;
        const oldValue = val.value;
        const specId = val.specId;
        const valId = val.id;

        if (oldValue === newValue) return;

        const lines = currentContent.split('\n');
        let inTargetSpec = false;
        let modified = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.includes(`spec_ID="${specId}"`) && line.includes('<spec')) {
                inTargetSpec = true;
                continue;
            }

            if (inTargetSpec && line.includes('</spec>')) {
                inTargetSpec = false;
                continue;
            }

            if (inTargetSpec && line.includes('<val') && line.includes(`val_id="${valId}"`)) {
                const simpleNewLine = line.replace(`value="${oldValue}"`, `value="${newValue}"`);

                if (simpleNewLine !== line) {
                    lines[i] = simpleNewLine;
                    modified = true;
                    break;
                }
            }
        }

        if (modified) {
            const newContent = lines.join('\n');
            contentRef.current = newContent;
            onChange(newContent);
        }
    }, [onChange]);

    // Save scroll position on scroll
    const handleScroll = useCallback(() => {
        if (onStateChange && treeRef.current) {
            onStateChange({
                expandedGroups: Array.from(expandedGroups),
                expandedSpecs: Array.from(expandedSpecs),
                scrollTop: treeRef.current.scrollTop,
                searchQuery,
                showDiffPanel
            });
        }
    }, [onStateChange, expandedGroups, expandedSpecs, searchQuery, showDiffPanel]);

    // Diff helpers
    const getOriginalValue = useCallback((val: ValData): string | undefined => {
        return originalValuesMap.get(`${val.specId}_${val.id}`);
    }, [originalValuesMap]);

    const isChanged = useCallback((val: ValData): boolean => {
        const orig = getOriginalValue(val);
        return orig !== undefined && orig !== val.value;
    }, [getOriginalValue]);

    // Count total changes
    const changesCount = useMemo(() => {
        let count = 0;
        groups.forEach(g => g.specs.forEach(s => s.vals.forEach(v => {
            if (isChanged(v)) count++;
        })));
        return count;
    }, [groups, isChanged]);

    // Build list of changed parameters for side-by-side panel
    const changedParams = useMemo(() => {
        const result: {
            groupName: string;
            specName: string;
            valName: string;
            original: string;
            current: string;
            val: ValData;
            isToggle: boolean;
        }[] = [];
        groups.forEach(g => g.specs.forEach(s => s.vals.forEach(v => {
            if (isChanged(v)) {
                const orig = getOriginalValue(v);
                const isToggleVal = v.dataType === "1" || (v.min === "0" && v.max === "1");
                result.push({
                    groupName: g.name,
                    specName: s.name,
                    valName: v.name || 'Value',
                    original: orig || '',
                    current: v.value,
                    val: v,
                    isToggle: isToggleVal
                });
            }
        })));
        return result;
    }, [groups, isChanged, getOriginalValue]);


    // Revert single value to original
    const revertValue = useCallback((val: ValData) => {
        const orig = getOriginalValue(val);
        if (orig !== undefined && orig !== val.value) {
            updateValue(val, orig);
        }
    }, [getOriginalValue, updateValue]);

    // Revert all changes
    const revertAll = useCallback(() => {
        if (originalContent) {
            contentRef.current = originalContent;
            onChange(originalContent);
        }
    }, [originalContent, onChange]);

    // Filter by search and/or showOnlyChanges
    const filteredGroups = useMemo(() => {
        let result = groups;

        // Filter by search query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.map(g => ({
                ...g,
                specs: g.specs.filter(s =>
                    s.name.toLowerCase().includes(q) ||
                    s.vals.some(v => v.name.toLowerCase().includes(q))
                )
            })).filter(g => g.name.toLowerCase().includes(q) || g.specs.length > 0);
        }

        return result;
    }, [groups, searchQuery]);

    // Input type helpers
    const isToggle = (val: ValData) => val.dataType === "1" || (val.min === "0" && val.max === "1");
    const isPath = (val: ValData) => val.dataType === "6";
    const isDropdown = (val: ValData) => val.dataType === "7" && val.options.length > 0;


    if (error) {
        return (
            <div className="xml-error">
                <AlertCircle size={32} />
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div className="xml-editor">
            {/* Header */}
            <div className="xml-header">
                <Settings size={14} className="xml-header-icon" />
                <span className="xml-header-title">{fileName}</span>
                <span className="xml-header-stats">
                    {groups.length} groups · {groups.reduce((a, g) => a + g.specs.length, 0)} params
                </span>

                {/* Changes Badge - click to open Side-by-Side diff panel */}
                {originalContent && changesCount > 0 && (
                    <button
                        className={`xml-changes-badge ${showDiffPanel ? 'active' : ''}`}
                        onClick={() => setShowDiffPanel(!showDiffPanel)}
                        title={showDiffPanel ? "Close diff panel" : "View changes side-by-side"}
                    >
                        <History size={12} />
                        <span>{changesCount} {changesCount === 1 ? 'change' : 'changes'}</span>
                    </button>
                )}

                <div className="xml-header-actions">
                    {/* Revert All - only show if there are changes */}
                    {originalContent && changesCount > 0 && (
                        <button
                            className="xml-action-btn revert"
                            onClick={revertAll}
                            title="Revert all changes"
                        >
                            <RotateCcw size={14} />
                            <span>Revert All</span>
                        </button>
                    )}
                    <button
                        className="xml-action-btn"
                        onClick={() => {
                            const allGroupIds = groups.map(g => g.id);
                            const allSpecIds = groups.flatMap(g => g.specs.map(s => s.id));
                            setExpandedGroups(new Set(allGroupIds));
                            setExpandedSpecs(new Set(allSpecIds));
                        }}
                        title="Expand All"
                    >
                        <ChevronsUpDown size={14} />
                        <span>Expand</span>
                    </button>
                    <button
                        className="xml-action-btn"
                        onClick={() => {
                            setExpandedGroups(new Set());
                            setExpandedSpecs(new Set());
                        }}
                        title="Collapse All"
                    >
                        <Minimize2 size={14} />
                        <span>Collapse</span>
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="xml-search">
                <Search size={12} className="xml-search-icon" />
                <input
                    type="text"
                    placeholder="Filter parameters..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="xml-search-input"
                />
                {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="xml-search-clear">
                        <X size={10} />
                    </button>
                )}
            </div>

            {/* Tree */}
            <div className="xml-tree" ref={treeRef} onScroll={handleScroll}>
                {filteredGroups.map(group => (
                    <div key={group.id} className="xml-group">
                        {/* Group Header */}
                        <div
                            className={`xml-group-header ${expandedGroups.has(group.id) ? 'expanded' : ''} ${!group.isEnabled ? 'disabled' : ''}`}
                            onClick={() => toggleGroup(group.id)}
                        >
                            <span className="xml-expand-icon">
                                {expandedGroups.has(group.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                            <Layers size={14} className="xml-group-icon" />
                            <span className="xml-group-name">{group.name}</span>
                            <span className={`xml-status-dot ${group.isEnabled ? 'active' : ''}`} />
                            <span className="xml-count">{group.specs.length}</span>
                        </div>

                        {/* Group Content */}
                        <div className={`xml-group-content ${expandedGroups.has(group.id) ? 'open' : ''}`}>
                            {group.specs.map(spec => (
                                <div key={spec.id} className="xml-spec">
                                    {/* Spec Header */}
                                    <div
                                        className={`xml-spec-header ${expandedSpecs.has(spec.id) ? 'expanded' : ''} ${!spec.isEnabled ? 'disabled' : ''}`}
                                        onClick={() => spec.vals.length > 0 && toggleSpec(spec.id)}
                                    >
                                        <span className="xml-expand-icon small">
                                            {spec.vals.length > 0 ? (
                                                expandedSpecs.has(spec.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                                            ) : <span style={{ width: 12 }} />}
                                        </span>
                                        <FileCode size={12} className="xml-spec-icon" />
                                        <span className="xml-spec-name">{spec.name}</span>
                                        {spec.vals.length > 0 && (
                                            <span className="xml-val-count">{spec.vals.length}</span>
                                        )}
                                    </div>

                                    {/* Values Panel */}
                                    <div className={`xml-vals-panel ${expandedSpecs.has(spec.id) && spec.vals.length > 0 ? 'open' : ''}`}>
                                        <div className="xml-vals-inner">
                                            {spec.vals.map((val, vIdx) => {
                                                const valIsChanged = isChanged(val);
                                                const origVal = getOriginalValue(val);
                                                return (
                                                    <div key={`${spec.id}_${val.id}_${vIdx}`} className={`xml-val-row ${valIsChanged ? 'changed' : ''}`}>
                                                        <label className="xml-val-label" title={val.desc}>
                                                            {val.name || 'Value'}
                                                        </label>
                                                        <div className="xml-val-input">
                                                            {isToggle(val) ? (
                                                                <button
                                                                    type="button"
                                                                    className={`xml-toggle ${(val.value === "1" || val.value === "-1") ? 'on' : 'off'}`}
                                                                    disabled={!val.isEditable}
                                                                    onClick={() => {
                                                                        const newVal = (val.value === "1" || val.value === "-1") ? "0" : "1";
                                                                        updateValue(val, newVal);
                                                                    }}
                                                                >
                                                                    {(val.value === "1" || val.value === "-1") ? 'Yes' : 'No'}
                                                                </button>
                                                            ) : isDropdown(val) ? (
                                                                <select
                                                                    value={val.value}
                                                                    disabled={!val.isEditable}
                                                                    onChange={(e) => updateValue(val, e.target.value)}
                                                                    className="xml-select"
                                                                >
                                                                    {val.options.map(opt => (
                                                                        <option key={opt} value={opt}>{opt}</option>
                                                                    ))}
                                                                </select>
                                                            ) : isPath(val) ? (
                                                                <div className="xml-path-input">
                                                                    <FolderOpen size={12} className="xml-path-icon" />
                                                                    <input
                                                                        id={`path_${spec.id}_${val.id}`}
                                                                        type="text"
                                                                        value={(activeInput && activeInput.id === `path_${spec.id}_${val.id}`) ? activeInput.value : val.value}
                                                                        disabled={!val.isEditable}
                                                                        onChange={(e) => updateValue(val, e.target.value, `path_${spec.id}_${val.id}`)}
                                                                        onBlur={() => setActiveInput(null)}
                                                                        className="xml-input path"
                                                                        title={val.value}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="xml-num-input">
                                                                    <input
                                                                        id={`input_${spec.id}_${val.id}`}
                                                                        type="text"
                                                                        value={(activeInput && activeInput.id === `input_${spec.id}_${val.id}`) ? activeInput.value : val.value}
                                                                        disabled={!val.isEditable}
                                                                        onChange={(e) => updateValue(val, e.target.value, `input_${spec.id}_${val.id}`)}
                                                                        onBlur={() => setActiveInput(null)}
                                                                        className="xml-input"
                                                                    />
                                                                    {(val.min || val.max) && (
                                                                        <span className="xml-range">
                                                                            [{val.min ?? '∞'} – {val.max ?? '∞'}]
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Inline diff indicator and revert button */}
                                                        {valIsChanged && origVal !== undefined && (
                                                            <div className="xml-val-diff">
                                                                <span className="xml-diff-indicator">
                                                                    <span className="xml-diff-old">{isToggle(val) ? (origVal === "1" || origVal === "-1" ? "Yes" : "No") : origVal}</span>
                                                                    <span className="xml-diff-arrow">→</span>
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    className="xml-revert-btn"
                                                                    onClick={() => revertValue(val)}
                                                                    title="Revert to original value"
                                                                >
                                                                    <RotateCcw size={10} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {filteredGroups.length === 0 && searchQuery && (
                    <div className="xml-no-results">
                        No results for "{searchQuery}"
                    </div>
                )}
            </div>

            {/* Side-by-Side Diff Panel */}
            {showDiffPanel && changedParams.length > 0 && (
                <div className={`xml-diff-panel ${isClosingDiffPanel ? 'closing' : ''}`}>
                    <div className="xml-diff-panel-header">
                        <span className="xml-diff-panel-title">
                            <History size={14} />
                            Parameter Changes ({changesCount})
                        </span>
                        <div className="xml-diff-panel-actions">
                            <button
                                className="xml-diff-revert-all"
                                onClick={revertAll}
                                title="Revert all changes"
                            >
                                <RotateCcw size={12} />
                                Revert All
                            </button>
                            <button
                                className="xml-diff-close"
                                onClick={closeDiffPanel}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="xml-diff-panel-content">
                        <div className="xml-diff-table">
                            <div className="xml-diff-header-row">
                                <div className="xml-diff-col param">Parameter</div>
                                <div className="xml-diff-col original">Original</div>
                                <div className="xml-diff-col current">Current</div>
                                <div className="xml-diff-col action"></div>
                            </div>
                            {changedParams.map((p, idx) => {
                                const origVal = p.isToggle ? (p.original === "1" || p.original === "-1" ? "Yes" : "No") : p.original;
                                const curVal = p.isToggle ? (p.current === "1" || p.current === "-1" ? "Yes" : "No") : p.current;
                                const origKey = `orig_${idx}`;
                                const curKey = `cur_${idx}`;
                                return (
                                    <div key={idx} className="xml-diff-row">
                                        <div className="xml-diff-col param">
                                            <span className="xml-diff-path">{p.groupName} → {p.specName}</span>
                                            <span className="xml-diff-name">{p.valName}</span>
                                        </div>
                                        <div className="xml-diff-col original">
                                            <span
                                                className={`xml-diff-value old ${expandedDiffCells.has(origKey) ? 'expanded' : ''}`}
                                                onClick={() => toggleDiffCell(origKey)}
                                                title={expandedDiffCells.has(origKey) ? 'Click to collapse' : origVal}
                                            >
                                                {origVal}
                                            </span>
                                        </div>
                                        <div className="xml-diff-col current">
                                            <span
                                                className={`xml-diff-value new ${expandedDiffCells.has(curKey) ? 'expanded' : ''}`}
                                                onClick={() => toggleDiffCell(curKey)}
                                                title={expandedDiffCells.has(curKey) ? 'Click to collapse' : curVal}
                                            >
                                                {curVal}
                                            </span>
                                        </div>
                                        <div className="xml-diff-col action">
                                            <button
                                                className="xml-diff-revert-btn"
                                                onClick={() => revertValue(p.val)}
                                                title="Revert this change"
                                            >
                                                <RotateCcw size={12} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )
            }

            <style>{`
                /* ═══════════════════════════════════════════════════════════════════════════
                   PREMIUM VISUAL EDITOR STYLES
                   ═══════════════════════════════════════════════════════════════════════════ */
                
                .xml-editor {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    background: var(--bg-app);
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    font-size: 13px;
                    position: relative;
                    overflow: hidden;
                }

                /* ─────────────── HEADER ─────────────── */
                .xml-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 12px;
                    background: linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%);
                    border-bottom: 1px solid rgba(56, 189, 248, 0.15);
                }
                .xml-header-icon { 
                    color: var(--primary);
                    filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.4));
                }
                .xml-header-title { 
                    font-weight: 600; 
                    color: var(--text-main); 
                    flex: 1;
                    font-size: 13px;
                    letter-spacing: -0.01em;
                }
                .xml-header-stats {
                    font-size: 10px;
                    color: var(--text-dim);
                    background: rgba(56, 189, 248, 0.1);
                    padding: 3px 8px;
                    border-radius: 12px;
                    font-weight: 500;
                }
                .xml-header-actions {
                    display: flex;
                    gap: 4px;
                    margin-left: 8px;
                }
                .xml-action-btn {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    border: 1px solid rgba(56, 189, 248, 0.2);
                    border-radius: 6px;
                    background: rgba(56, 189, 248, 0.08);
                    color: var(--text-dim);
                    font-size: 10px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .xml-action-btn:hover {
                    background: rgba(56, 189, 248, 0.15);
                    color: var(--primary);
                    border-color: rgba(56, 189, 248, 0.35);
                }
                .xml-action-btn span {
                    display: none;
                }
                @media (min-width: 600px) {
                    .xml-action-btn span {
                        display: inline;
                    }
                }

                /* ─────────────── SEARCH ─────────────── */
                .xml-search {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 12px;
                    background: var(--bg-panel);
                    border-bottom: 1px solid var(--border);
                }
                .xml-search-icon { 
                    color: var(--text-dim);
                    transition: color 0.2s;
                }
                .xml-search:focus-within .xml-search-icon {
                    color: var(--primary);
                }
                .xml-search-input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    color: var(--text-main);
                    font-size: 12px;
                    outline: none;
                }
                .xml-search-input::placeholder {
                    color: var(--text-dim);
                    opacity: 0.7;
                }
                .xml-search-clear {
                    width: 16px;
                    height: 16px;
                    border: none;
                    background: rgba(239, 68, 68, 0.15);
                    border-radius: 4px;
                    color: #ef4444;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .xml-search-clear:hover {
                    background: rgba(239, 68, 68, 0.25);
                }

                /* ─────────────── TREE ─────────────── */
                .xml-tree {
                    flex: 1;
                    overflow: auto;
                    padding: 6px 8px;
                }
                .xml-tree::-webkit-scrollbar { width: 6px; }
                .xml-tree::-webkit-scrollbar-track { background: transparent; }
                .xml-tree::-webkit-scrollbar-thumb { 
                    background: rgba(56, 189, 248, 0.2);
                    border-radius: 3px;
                }
                .xml-tree::-webkit-scrollbar-thumb:hover { 
                    background: rgba(56, 189, 248, 0.35);
                }

                /* ─────────────── GROUP ─────────────── */
                .xml-group { 
                    margin-bottom: 2px;
                }
                .xml-group-header {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 8px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    user-select: none;
                    border: 1px solid transparent;
                }
                .xml-group-header:hover { 
                    background: rgba(56, 189, 248, 0.06);
                    border-color: rgba(56, 189, 248, 0.1);
                }
                .xml-group-header.expanded { 
                    background: rgba(56, 189, 248, 0.08);
                    border-color: rgba(56, 189, 248, 0.15);
                }
                .xml-group-header.disabled { 
                    opacity: 0.45;
                }
                .xml-expand-icon {
                    width: 14px;
                    height: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-dim);
                    transition: color 0.2s;
                }
                .xml-group-header.expanded .xml-expand-icon {
                    color: var(--primary);
                }
                .xml-expand-icon.small { width: 12px; height: 12px; }
                .xml-group-icon { 
                    color: var(--primary);
                }
                .xml-group-name { 
                    flex: 1; 
                    font-weight: 500; 
                    color: var(--text-main);
                    font-size: 12px;
                }
                .xml-status-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--text-dim);
                    transition: all 0.3s;
                    box-shadow: 0 0 0 2px rgba(100, 116, 139, 0.2);
                }
                .xml-status-dot.active { 
                    background: #22c55e;
                    box-shadow: 0 0 4px rgba(34, 197, 94, 0.5);
                }
                .xml-count {
                    font-size: 10px;
                    color: var(--text-dim);
                    background: var(--bg-hover);
                    padding: 2px 6px;
                    border-radius: 8px;
                    font-weight: 500;
                }

                /* ─────────────── GROUP CONTENT ─────────────── */
                .xml-group-content {
                    margin-left: 16px;
                    padding-left: 10px;
                    border-left: 1px solid rgba(56, 189, 248, 0.15);
                    max-height: 0;
                    overflow: hidden;
                    opacity: 0;
                    transition: all 0.2s ease;
                }
                .xml-group-content.open {
                    max-height: 10000px;
                    opacity: 1;
                    margin-top: 2px;
                    margin-bottom: 4px;
                }

                /* ─────────────── SPEC ─────────────── */
                .xml-spec { margin-bottom: 1px; }
                .xml-spec-header {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 5px 8px;
                    border-radius: 5px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .xml-spec-header:hover { 
                    background: rgba(56, 189, 248, 0.05);
                }
                .xml-spec-header.expanded { 
                    background: rgba(56, 189, 248, 0.08);
                }
                .xml-spec-header.disabled { opacity: 0.5; }
                .xml-spec-icon { color: var(--text-dim); }
                .xml-spec-name { 
                    flex: 1; 
                    font-size: 11px; 
                    color: var(--text-main);
                    font-weight: 500;
                }
                .xml-val-count {
                    font-size: 9px;
                    color: var(--primary);
                    background: rgba(56, 189, 248, 0.12);
                    padding: 2px 5px;
                    border-radius: 6px;
                    font-weight: 600;
                }

                /* ─────────────── VALUES PANEL ─────────────── */
                .xml-vals-panel {
                    max-height: 0;
                    overflow: hidden;
                    opacity: 0;
                    transition: all 0.2s ease;
                }
                .xml-vals-panel.open {
                    max-height: 2000px;
                    opacity: 1;
                    margin-top: 2px;
                    margin-bottom: 4px;
                }
                .xml-vals-inner {
                    margin-left: 16px;
                    background: var(--bg-card);
                    border: 1px solid rgba(56, 189, 248, 0.1);
                    border-radius: 6px;
                    overflow: hidden;
                }

                /* ─────────────── VALUE ROW ─────────────── */
                .xml-val-row {
                    display: flex;
                    align-items: center;
                    padding: 6px 10px;
                    border-bottom: 1px solid rgba(56, 189, 248, 0.06);
                    gap: 12px;
                    transition: background 0.15s;
                }
                .xml-val-row:last-child { border-bottom: none; }
                .xml-val-row:hover { 
                    background: rgba(56, 189, 248, 0.03);
                }
                .xml-val-label {
                    width: 130px;
                    flex-shrink: 0;
                    font-size: 11px;
                    color: var(--text-muted);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    font-weight: 500;
                }
                .xml-val-input { flex: 1; display: flex; align-items: center; }

                /* ─────────────── TOGGLE BUTTON ─────────────── */
                .xml-toggle {
                    padding: 4px 10px;
                    font-size: 10px;
                    font-weight: 600;
                    border-radius: 4px;
                    border: none;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                    min-width: 42px;
                }
                .xml-toggle.on { 
                    background: #22c55e;
                    color: white;
                }
                .xml-toggle.off { 
                    background: rgba(100, 116, 139, 0.2);
                    color: var(--text-muted);
                }
                .xml-toggle:hover:not(:disabled) { 
                    filter: brightness(1.1);
                }
                .xml-toggle:disabled { 
                    opacity: 0.4; 
                    cursor: not-allowed;
                }

                /* ─────────────── TEXT INPUT ─────────────── */
                .xml-input {
                    padding: 4px 8px;
                    border: 1px solid var(--border);
                    border-radius: 4px;
                    background: var(--bg-panel);
                    color: var(--text-main);
                    font-size: 11px;
                    font-family: 'JetBrains Mono', monospace;
                    outline: none;
                    transition: all 0.15s;
                    min-width: 70px;
                }
                .xml-input:focus {
                    border-color: var(--primary);
                    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.1);
                }
                .xml-input.path { 
                    flex: 1; 
                    font-size: 10px; 
                    min-width: 0;
                }
                .xml-input:disabled { 
                    opacity: 0.4; 
                    cursor: not-allowed;
                }

                /* ─────────────── SELECT ─────────────── */
                .xml-select {
                    padding: 4px 8px;
                    border: 1px solid var(--border);
                    border-radius: 4px;
                    background: var(--bg-panel);
                    color: var(--text-main);
                    font-size: 11px;
                    outline: none;
                    cursor: pointer;
                    min-width: 80px;
                }
                .xml-select:focus {
                    border-color: var(--primary);
                }

                /* ─────────────── PATH INPUT ─────────────── */
                .xml-path-input { 
                    display: flex; 
                    align-items: center; 
                    gap: 6px; 
                    flex: 1;
                }
                .xml-path-icon { 
                    color: var(--primary); 
                    flex-shrink: 0;
                }

                /* ─────────────── NUMBER INPUT ─────────────── */
                .xml-num-input { 
                    display: flex; 
                    align-items: center; 
                    gap: 6px;
                }
                .xml-range {
                    font-size: 9px;
                    color: var(--text-dim);
                    font-family: 'JetBrains Mono', monospace;
                    white-space: nowrap;
                    background: rgba(56, 189, 248, 0.08);
                    padding: 2px 5px;
                    border-radius: 4px;
                }

                /* ─────────────── CHANGES BADGE ─────────────── */
                .xml-changes-badge {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding: 4px 10px;
                    border: 1px solid rgba(251, 191, 36, 0.3);
                    border-radius: 12px;
                    background: rgba(251, 191, 36, 0.12);
                    color: #fbbf24;
                    font-size: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-left: auto;
                }
                .xml-changes-badge:hover {
                    background: rgba(251, 191, 36, 0.2);
                    border-color: rgba(251, 191, 36, 0.5);
                }
                .xml-changes-badge.active {
                    background: rgba(251, 191, 36, 0.25);
                    border-color: #fbbf24;
                    box-shadow: 0 0 8px rgba(251, 191, 36, 0.3);
                }

                /* ─────────────── REVERT BUTTON VARIANTS ─────────────── */
                .xml-action-btn.revert {
                    border-color: rgba(239, 68, 68, 0.3);
                    background: rgba(239, 68, 68, 0.08);
                    color: #f87171;
                }
                .xml-action-btn.revert:hover {
                    background: rgba(239, 68, 68, 0.15);
                    border-color: rgba(239, 68, 68, 0.5);
                    color: #ef4444;
                }

                /* ─────────────── CHANGED VALUE ROW ─────────────── */
                .xml-val-row.changed {
                    background: rgba(251, 191, 36, 0.06);
                    border-left: 2px solid #fbbf24;
                    padding-left: 8px;
                }
                .xml-val-row.changed:hover {
                    background: rgba(251, 191, 36, 0.1);
                }

                /* ─────────────── INLINE DIFF ─────────────── */
                .xml-val-diff {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-left: auto;
                    flex-shrink: 0;
                }
                .xml-diff-indicator {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 10px;
                    font-family: 'JetBrains Mono', monospace;
                }
                .xml-diff-old {
                    color: #f87171;
                    text-decoration: line-through;
                    opacity: 0.8;
                    max-width: 60px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .xml-diff-arrow {
                    color: var(--text-dim);
                    font-size: 9px;
                }
                .xml-revert-btn {
                    width: 18px;
                    height: 18px;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 4px;
                    background: rgba(239, 68, 68, 0.1);
                    color: #f87171;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                }
                .xml-revert-btn:hover {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: #ef4444;
                    color: #ef4444;
                }

                /* ─────────────── SIDE-BY-SIDE DIFF PANEL ─────────────── */
                .xml-diff-panel {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: var(--bg-app);
                    display: flex;
                    flex-direction: column;
                    z-index: 10;
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                @keyframes slideUp {
                    from { 
                        transform: translateY(100%);
                        opacity: 0;
                    }
                    to { 
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                @keyframes slideDown {
                    from { 
                        transform: translateY(0);
                        opacity: 1;
                    }
                    to { 
                        transform: translateY(100%);
                        opacity: 0;
                    }
                }
                .xml-diff-panel.closing {
                    animation: slideDown 0.28s cubic-bezier(0.4, 0, 1, 1) forwards;
                }
                .xml-diff-panel-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 12px;
                    background: rgba(251, 191, 36, 0.1);
                    border-bottom: 1px solid rgba(251, 191, 36, 0.15);
                }
                .xml-diff-panel-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #fbbf24;
                }
                .xml-diff-panel-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .xml-diff-revert-all {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 6px;
                    background: rgba(239, 68, 68, 0.1);
                    color: #f87171;
                    font-size: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .xml-diff-revert-all:hover {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: #ef4444;
                }
                .xml-diff-close {
                    width: 24px;
                    height: 24px;
                    border: none;
                    border-radius: 4px;
                    background: rgba(100, 116, 139, 0.2);
                    color: var(--text-dim);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                }
                .xml-diff-close:hover {
                    background: rgba(100, 116, 139, 0.3);
                    color: var(--text-main);
                }
                .xml-diff-panel-content {
                    flex: 1;
                    overflow: auto;
                    padding: 8px;
                }
                .xml-diff-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .xml-diff-header-row {
                    display: flex;
                    padding: 6px 8px;
                    background: rgba(56, 189, 248, 0.08);
                    border-radius: 6px;
                    margin-bottom: 4px;
                    font-size: 10px;
                    font-weight: 600;
                    color: var(--text-dim);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .xml-diff-row {
                    display: flex;
                    padding: 8px;
                    border-radius: 6px;
                    transition: background 0.15s;
                }
                .xml-diff-row:nth-child(odd) {
                    background: rgba(56, 189, 248, 0.03);
                }
                .xml-diff-row:hover {
                    background: rgba(251, 191, 36, 0.08);
                }
                .xml-diff-col {
                    display: flex;
                    align-items: center;
                }
                .xml-diff-col.param {
                    flex: 2;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 2px;
                }
                .xml-diff-col.original,
                .xml-diff-col.current {
                    flex: 1;
                    justify-content: center;
                    overflow: hidden;
                    min-width: 0;
                }
                .xml-diff-col.action {
                    width: 40px;
                    justify-content: center;
                }
                .xml-diff-path {
                    font-size: 9px;
                    color: var(--text-dim);
                    font-weight: 500;
                }
                .xml-diff-name {
                    font-size: 11px;
                    color: var(--text-main);
                    font-weight: 600;
                }
                .xml-diff-value {
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-family: 'JetBrains Mono', monospace;
                    max-width: 100px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .xml-diff-value.expanded {
                    max-width: none;
                    white-space: normal;
                    word-break: break-all;
                    overflow: visible;
                }
                .xml-diff-value.old {
                    background: rgba(239, 68, 68, 0.15);
                    color: #f87171;
                }
                .xml-diff-value.new {
                    background: rgba(34, 197, 94, 0.15);
                    color: #22c55e;
                }
                .xml-diff-revert-btn {
                    width: 24px;
                    height: 24px;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 4px;
                    background: rgba(239, 68, 68, 0.1);
                    color: #f87171;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                }
                .xml-diff-revert-btn:hover {
                    background: rgba(239, 68, 68, 0.25);
                    border-color: #ef4444;
                    color: #ef4444;
                }

                /* ─────────────── STATES ─────────────── */
                .xml-error {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    color: var(--danger);
                }
                .xml-error svg {
                    filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.4));
                }
                .xml-no-results {
                    padding: 50px;
                    text-align: center;
                    color: var(--text-dim);
                    font-size: 14px;
                }
            `}</style>
        </div>
    );
};

export default XmlVisualEditor;
