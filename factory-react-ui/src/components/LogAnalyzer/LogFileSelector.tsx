import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FileText, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LogFileNode } from '../../types/logTypes';

// =========================================================================
// CONSTANTS
// =========================================================================
const CONSTANTS = {
    CARD_MIN_WIDTH: 70,
    CARD_GAP: 8,
    SEARCH_TIMEOUT: 800,
    MAX_VISIBLE_INDEX: 99,
    DROPDOWN_MAX_HEIGHT: 200,
    FILENAME_PATTERN: /^(\d{4})(\d{2})(\d{2})(\d{2})_.*\.log$/i,
} as const;

const STYLES = {
    header: {
        padding: '0.75rem 1rem',
        fontSize: '0.95rem',
    },
    subtext: {
        fontSize: '0.7rem',
    },
    button: {
        padding: '0.25rem 0.75rem',
        fontSize: '0.8rem',
    },
    badge: {
        fontSize: '0.6rem',
        padding: '0 3px',
        height: '16px',
    },
    dropdown: {
        label: '0.7rem',
        button: '0.75rem',
        buttonPadding: '0.3rem 0.6rem',
        option: '0.75rem',
        optionPadding: '0.3rem 0.5rem',
    },
    fileCard: {
        padding: '0.4rem',
        icon: 20,
        text: '0.65rem',
        index: '0.55rem',
    },
} as const;

// =========================================================================
// TYPES
// =========================================================================
interface Props {
    logFiles: LogFileNode[];
    selectedFile: string | null;
    onSelectFile: (path: string) => void;
    onBack: () => void;
    loading: boolean;
    pcInfo: { line: number; mcNumber: number; logPath: string };
}

type DateHierarchy = Record<string, Record<string, Record<string, LogFileNode[]>>>;

// =========================================================================
// UTILITY FUNCTIONS
// =========================================================================
const parseLogFilename = (filename: string): { hour: string; displayName: string } | null => {
    const match = filename.match(CONSTANTS.FILENAME_PATTERN);
    if (!match) return null;

    const hour = match[4];
    return {
        hour,
        displayName: `${hour}:00.log`,
    };
};

const sortYearsDesc = (years: string[]): string[] =>
    years.sort((a, b) => parseInt(b) - parseInt(a));

const sortMonthsDesc = (months: string[]): string[] =>
    months.sort((a, b) =>
        new Date(`${b} 1, 2000`).getTime() - new Date(`${a} 1, 2000`).getTime()
    );

const sortDaysByDate = (days: string[], monthData: Record<string, LogFileNode[]>): string[] =>
    days.sort((a, b) => {
        const timeA = monthData[a]?.[0]?.modifiedDate
            ? new Date(monthData[a][0].modifiedDate).getTime()
            : 0;
        const timeB = monthData[b]?.[0]?.modifiedDate
            ? new Date(monthData[b][0].modifiedDate).getTime()
            : 0;
        return timeB - timeA;
    });

const parseMonthNumber = (monthStr: string): string => {
    if (!/^\d+$/.test(monthStr)) return monthStr;

    const monthNum = parseInt(monthStr);
    if (monthNum < 1 || monthNum > 12) return monthStr;

    const date = new Date();
    date.setMonth(monthNum - 1);
    return date.toLocaleString('en-US', { month: 'long' });
};

const extractDateParts = (node: LogFileNode): { year: string; month: string; day: string } => {
    const parts = node.path?.split(/[/\\]/) || [];

    let year = 'Unknown';
    let month = 'General';
    let day = 'Files';

    // Extract year
    if (parts.length > 0 && /^\d{4}$/.test(parts[0])) {
        year = parts[0];
    } else if (node.modifiedDate) {
        year = new Date(node.modifiedDate).getFullYear().toString();
    }

    // Extract month
    if (parts.length > 1) {
        month = parseMonthNumber(parts[1]);
    }

    // Extract day
    if (parts.length > 2) {
        const potentialDay = parts[2];
        if (!potentialDay.toLowerCase().endsWith('.log') &&
            !potentialDay.toLowerCase().endsWith('.txt')) {
            day = potentialDay;
        }
    }

    return { year, month, day };
};

// =========================================================================
// MAIN COMPONENT
// =========================================================================
export default function LogFileSelector({
    logFiles,
    selectedFile,
    onSelectFile,
    onBack,
    loading,
    pcInfo
}: Props) {
    const [selectedYear, setSelectedYear] = useState<string | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [showEscTooltip, setShowEscTooltip] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const [isDropdownActive, setIsDropdownActive] = useState(false);

    const searchBuffer = useRef<string>('');
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    // =========================================================================
    // DATA PROCESSING
    // =========================================================================
    const dateHierarchy = useMemo(() => {
        const hierarchy: DateHierarchy = {};

        const processNode = (node: LogFileNode) => {
            // New Logic: Process directories to ensure keys exist even if empty
            if (node.isDirectory) {
                const { year, month, day } = extractDateParts(node);
                if (year !== 'Unknown') {
                    if (!hierarchy[year]) hierarchy[year] = {};
                    if (month !== 'General') {
                        if (!hierarchy[year][month]) hierarchy[year][month] = {};
                        if (day !== 'Files') {
                            if (!hierarchy[year][month][day]) hierarchy[year][month][day] = [];
                        }
                    }
                }
            } else {
                // Process Files
                const { year, month, day } = extractDateParts(node);

                if (!hierarchy[year]) hierarchy[year] = {};
                if (!hierarchy[year][month]) hierarchy[year][month] = {};
                if (!hierarchy[year][month][day]) hierarchy[year][month][day] = [];

                hierarchy[year][month][day].push(node);
            }
            node.children?.forEach(processNode);
        };

        logFiles.forEach(processNode);
        return hierarchy;
    }, [logFiles]);

    // =========================================================================
    // SELECTORS
    // =========================================================================
    const availableYears = useMemo(() =>
        sortYearsDesc(Object.keys(dateHierarchy)),
        [dateHierarchy]
    );

    const availableMonths = useMemo(() => {
        if (!selectedYear) return [];
        return sortMonthsDesc(Object.keys(dateHierarchy[selectedYear] || {}));
    }, [selectedYear, dateHierarchy]);

    const availableDays = useMemo(() => {
        if (!selectedYear || !selectedMonth) return [];
        const monthData = dateHierarchy[selectedYear]?.[selectedMonth];
        if (!monthData) return [];
        return sortDaysByDate(Object.keys(monthData), monthData);
    }, [selectedYear, selectedMonth, dateHierarchy]);

    const files = useMemo(() => {
        if (!selectedYear || !selectedMonth || !selectedDay) return [];
        return dateHierarchy[selectedYear]?.[selectedMonth]?.[selectedDay] || [];
    }, [selectedYear, selectedMonth, selectedDay, dateHierarchy]);

    // =========================================================================
    // HANDLERS
    // =========================================================================
    const handleYearChange = (newYear: string) => {
        setSelectedYear(newYear);
        const months = sortMonthsDesc(Object.keys(dateHierarchy[newYear] || {}));

        if (months.length > 0) {
            const latestMonth = months[0];
            setSelectedMonth(latestMonth);

            const monthData = dateHierarchy[newYear]?.[latestMonth];
            if (monthData) {
                const days = sortDaysByDate(Object.keys(monthData), monthData);
                setSelectedDay(days.length > 0 ? days[0] : null);
            }
        } else {
            setSelectedMonth(null);
            setSelectedDay(null);
        }
    };

    const handleMonthChange = (newMonth: string) => {
        setSelectedMonth(newMonth);

        if (selectedYear) {
            const monthData = dateHierarchy[selectedYear]?.[newMonth];
            if (monthData) {
                const days = sortDaysByDate(Object.keys(monthData), monthData);
                setSelectedDay(days.length > 0 ? days[0] : null);
            } else {
                setSelectedDay(null);
            }
        }
    };

    const handleDayChange = (newDay: string) => {
        setSelectedDay(newDay);
    };

    const handleFileSelect = (file: LogFileNode, index: number) => {
        onSelectFile(file.path);
        setFocusedIndex(index);
    };

    // =========================================================================
    // EFFECTS
    // =========================================================================
    useEffect(() => {
        if (availableYears.length > 0) {
            handleYearChange(availableYears[0]);
        }
    }, [dateHierarchy]);

    useEffect(() => {
        if (focusedIndex !== -1 && gridRef.current) {
            const buttons = gridRef.current.querySelectorAll('button');
            buttons[focusedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [focusedIndex]);

    useEffect(() => {
        if (selectedFile) {
            const idx = files.findIndex(f => f.path === selectedFile);
            if (idx !== -1) setFocusedIndex(idx);
        }
    }, [selectedFile, files]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return;
            if (isDropdownActive) return;

            // Escape key
            if (e.key === 'Escape') {
                if (document.querySelector('.modal-overlay, .graph-overlay')) return;
                onBack();
                return;
            }

            if (files.length === 0) return;

            // Number key navigation
            if (/^[0-9]$/.test(e.key)) {
                if (searchTimeout.current) clearTimeout(searchTimeout.current);
                searchBuffer.current += e.key;

                const num = parseInt(searchBuffer.current);
                // 0-based index: direct mapping, clamped to files length
                const targetIndex = Math.min(num, files.length - 1);

                setFocusedIndex(targetIndex);

                searchTimeout.current = setTimeout(() => {
                    searchBuffer.current = '';
                }, CONSTANTS.SEARCH_TIMEOUT);
                return;
            }

            // Arrow key navigation
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
                e.preventDefault();

                if (e.key === 'Enter') {
                    if (focusedIndex !== -1 && files[focusedIndex]) {
                        onSelectFile(files[focusedIndex].path);
                    }
                    return;
                }

                const gridWidth = gridRef.current?.clientWidth || 800;
                const cols = Math.floor(gridWidth / (CONSTANTS.CARD_MIN_WIDTH + CONSTANTS.CARD_GAP)) || 1;

                setFocusedIndex(prev => {
                    const current = prev === -1 ? 0 : prev;
                    switch (e.key) {
                        case 'ArrowRight': return Math.min(current + 1, files.length - 1);
                        case 'ArrowLeft': return Math.max(current - 1, 0);
                        case 'ArrowDown': return Math.min(current + cols, files.length - 1);
                        case 'ArrowUp': return Math.max(current - cols, 0);
                        default: return current;
                    }
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [files, onBack, onSelectFile, focusedIndex, isDropdownActive]);

    // =========================================================================
    // RENDER
    // =========================================================================
    return (
        <div className="card no-hover" style={{
            padding: 0,
            overflow: 'hidden',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Header */}
            <div style={{
                padding: STYLES.header.padding,
                borderBottom: '2px solid var(--border)',
                background: 'var(--bg-panel)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                flexShrink: 0
            }}>
                <div>
                    <h2 style={{
                        fontSize: STYLES.header.fontSize,
                        fontWeight: 600,
                        color: 'var(--primary)',
                        margin: 0
                    }}>
                        Log Files - Line {pcInfo.line} MC-{pcInfo.mcNumber}
                    </h2>
                    <div className="text-mono" style={{
                        fontSize: STYLES.subtext.fontSize,
                        color: 'var(--text-dim)'
                    }}>
                        {pcInfo.logPath}
                    </div>
                </div>

                <BackButton
                    onBack={onBack}
                    showTooltip={showEscTooltip}
                    setShowTooltip={setShowEscTooltip}
                />
            </div>

            {loading ? (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--text-dim)',
                    fontSize: '0.9rem'
                }}>
                    Fetching log files...
                </div>
            ) : (
                <div style={{
                    padding: '0.75rem',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    overflow: 'hidden'
                }}>
                    {/* Date Filters */}
                    <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        marginBottom: '0.75rem',
                        flexWrap: 'wrap',
                        flexShrink: 0
                    }}>
                        <Dropdown
                            label="Year"
                            options={availableYears}
                            value={selectedYear}
                            onChange={handleYearChange}
                            placeholder="Select Year"
                            onOpenChange={setIsDropdownActive}
                        />
                        <Dropdown
                            label="Month"
                            options={availableMonths}
                            value={selectedMonth}
                            onChange={handleMonthChange}
                            placeholder="Select Month"
                            disabled={!selectedYear}
                            onOpenChange={setIsDropdownActive}
                        />
                        <Dropdown
                            label="Date"
                            options={availableDays}
                            value={selectedDay}
                            onChange={handleDayChange}
                            placeholder="Select Day"
                            disabled={!selectedMonth}
                            onOpenChange={setIsDropdownActive}
                        />
                    </div>

                    {files.length > 0 ? (
                        <FileGrid
                            files={files}
                            selectedFile={selectedFile}
                            focusedIndex={focusedIndex}
                            onSelectFile={handleFileSelect}
                            gridRef={gridRef}
                        />
                    ) : (
                        selectedYear && selectedMonth && selectedDay && (
                            <EmptyState />
                        )
                    )}
                </div>
            )}

            <style>{`
        .hover-card:hover .hover-effect {
          opacity: 1 !important;
        }
        .hover-card:hover {
          border-color: var(--primary) !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
        }
      `}</style>
        </div>
    );
}

// =========================================================================
// SUB-COMPONENTS
// =========================================================================
function BackButton({
    onBack,
    showTooltip,
    setShowTooltip
}: {
    onBack: () => void;
    showTooltip: boolean;
    setShowTooltip: (show: boolean) => void;
}) {
    return (
        <div style={{ position: 'relative' }}>
            <button
                className="btn btn-secondary"
                onClick={onBack}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: STYLES.button.padding,
                    fontSize: STYLES.button.fontSize
                }}
            >
                <span>← Back</span>
                <div style={{
                    fontSize: STYLES.badge.fontSize,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: STYLES.badge.padding,
                    background: 'var(--bg-app)',
                    fontFamily: 'system-ui',
                    height: STYLES.badge.height,
                    display: 'flex',
                    alignItems: 'center',
                    boxShadow: '0 1px 0 rgba(0,0,0,0.2)'
                }}>
                    ESC
                </div>
            </button>

            <AnimatePresence>
                {showTooltip && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'absolute',
                            top: '115%',
                            right: 0,
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#f8fafc',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: STYLES.subtext.fontSize,
                            whiteSpace: 'nowrap',
                            zIndex: 50,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                        }}
                    >
                        Press <b style={{ color: '#fff' }}>Esc</b> to go back
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function FileGrid({
    files,
    selectedFile,
    focusedIndex,
    onSelectFile,
    gridRef
}: {
    files: LogFileNode[];
    selectedFile: string | null;
    focusedIndex: number;
    onSelectFile: (file: LogFileNode, index: number) => void;
    gridRef: React.RefObject<HTMLDivElement>;
}) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0
        }}>
            {/* Title Row */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
                flexShrink: 0
            }}>
                <h3 style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--primary)',
                    margin: 0
                }}>
                    Available Files ({files.length})
                </h3>
                <div style={{ fontSize: STYLES.subtext.fontSize, color: 'var(--text-dim)' }}>
                    <span style={{ marginRight: '0.75rem' }}>
                        Use <b style={{ color: 'var(--text-main)' }}>Arrows</b> to navigate
                    </span>
                    <span style={{ marginRight: '0.75rem' }}>
                        Type <b style={{ color: 'var(--text-main)' }}>number</b> to select
                    </span>
                    <span>Press <b style={{ color: 'var(--text-main)' }}>Enter</b></span>
                </div>
            </div>

            {/* File Grid */}
            <div
                ref={gridRef}
                style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fill, minmax(${CONSTANTS.CARD_MIN_WIDTH}px, 1fr))`,
                    alignContent: 'start',
                    gap: `${CONSTANTS.CARD_GAP}px`,
                    overflowY: 'auto',
                    padding: '0.5rem',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(0,0,0,0.02)',
                    flex: 1
                }}
            >
                {files.map((file, idx) => (
                    <FileCard
                        key={file.path}
                        file={file}
                        index={idx}
                        isSelected={selectedFile === file.path}
                        isFocused={focusedIndex === idx}
                        onSelect={() => onSelectFile(file, idx)}
                    />
                ))}
            </div>
        </div>
    );
}

function FileCard({
    file,
    index,
    isSelected,
    isFocused,
    onSelect
}: {
    file: LogFileNode;
    index: number;
    isSelected: boolean;
    isFocused: boolean;
    onSelect: () => void;
}) {
    const parsedFile = parseLogFilename(file.name);
    const displayName = parsedFile?.displayName || file.name;

    return (
        <motion.button
            onClick={onSelect}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
                position: 'relative',
                margin: 0,
                background: isSelected ? 'var(--primary-dim)' : 'var(--bg-panel)',
                border: isSelected
                    ? '2px solid var(--primary)'
                    : isFocused
                        ? '2px solid rgba(59, 130, 246, 0.5)'
                        : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: STYLES.fileCard.padding,
                cursor: 'pointer',
                transition: 'all 0.2s',
                backdropFilter: 'blur(12px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25rem',
                aspectRatio: '1',
                width: '100%',
                overflow: 'hidden',
                outline: 'none'
            }}
            className={isSelected ? '' : 'hover-card'}
        >
            {/* Numeric Index */}
            {index < CONSTANTS.MAX_VISIBLE_INDEX && (
                <div style={{
                    position: 'absolute',
                    top: 2,
                    left: 4,
                    fontSize: STYLES.fileCard.index,
                    color: isFocused ? 'var(--primary)' : 'var(--text-dim)',
                    fontWeight: 700,
                    opacity: isFocused ? 1 : 0.5
                }}>
                    {index}
                </div>
            )}

            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1), transparent)',
                opacity: 0,
                transition: 'opacity 0.3s',
                borderRadius: 'var(--radius-md)',
                pointerEvents: 'none'
            }} className="hover-effect" />

            <FileText
                size={STYLES.fileCard.icon}
                color={isSelected ? 'var(--primary)' : 'var(--text-muted)'}
            />

            <div style={{
                fontSize: STYLES.fileCard.text,
                fontWeight: 600,
                color: 'var(--text-main)',
                textAlign: 'center',
                wordBreak: 'break-word',
                lineHeight: 1.1,
                width: '100%',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
            }}>
                {displayName}
            </div>

            {(isSelected || isFocused) && (
                <div style={{
                    position: 'absolute',
                    top: '0.25rem',
                    right: '0.25rem',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isSelected ? 'var(--success)' : 'rgba(56, 189, 248, 0.4)',
                    boxShadow: isSelected ? '0 0 8px var(--success)' : 'none'
                }} />
            )}
        </motion.button>
    );
}

function EmptyState() {
    return (
        <div style={{
            textAlign: 'center',
            color: 'var(--text-dim)',
            padding: '2rem',
            background: 'var(--bg-panel)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border)',
            flex: 1
        }}>
            <FileText size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.3 }} />
            <p style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                No log files found.
            </p>
        </div>
    );
}

// =========================================================================
// DROPDOWN COMPONENT
// =========================================================================
function Dropdown({
    label,
    options,
    value,
    onChange,
    placeholder,
    disabled = false,
    onOpenChange
}: {
    label: string;
    options: string[];
    value: string | null;
    onChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        onOpenChange?.(isOpen);
    }, [isOpen, onOpenChange]);

    useEffect(() => {
        if (isOpen) {
            const idx = value ? options.indexOf(value) : 0;
            setHighlightedIndex(idx !== -1 ? idx : 0);
        }
    }, [isOpen, value, options]);

    useEffect(() => {
        if (isOpen && listRef.current) {
            const buttons = listRef.current.querySelectorAll('button');
            buttons[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightedIndex, isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => Math.min(prev + 1, options.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (options[highlightedIndex]) {
                    onChange(options[highlightedIndex]);
                    setIsOpen(false);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                break;
        }
    };

    return (
        <div style={{ position: 'relative', minWidth: '130px', flex: 1 }}>
            <label style={{
                display: 'block',
                fontSize: STYLES.dropdown.label,
                fontWeight: 700,
                marginBottom: '0.25rem',
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
            }}>
                {label}
            </label>
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className="btn btn-secondary"
                style={{
                    width: '100%',
                    justifyContent: 'space-between',
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: STYLES.dropdown.button,
                    padding: STYLES.dropdown.buttonPadding,
                    height: 'auto',
                    border: isOpen ? '1px solid var(--primary)' : undefined
                }}
            >
                <span style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>
                    {value || placeholder}
                </span>
                <ChevronDown size={14} style={{
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                }} />
            </button>

            {isOpen && !disabled && (
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                        onClick={() => setIsOpen(false)}
                    />
                    <div
                        ref={listRef}
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 2px)',
                            left: 0,
                            right: 0,
                            maxHeight: `${CONSTANTS.DROPDOWN_MAX_HEIGHT}px`,
                            overflowY: 'auto',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            zIndex: 1000,
                            boxShadow: '0 4px 15px rgba(0,0,0,0.4)'
                        }}
                    >
                        {options.map((option, idx) => {
                            const isSelected = value === option;
                            const isHighlighted = highlightedIndex === idx;

                            return (
                                <button
                                    key={option}
                                    onClick={() => {
                                        onChange(option);
                                        setIsOpen(false);
                                    }}
                                    className="btn btn-ghost"
                                    style={{
                                        width: '100%',
                                        justifyContent: 'flex-start',
                                        borderRadius: 0,
                                        background: isHighlighted
                                            ? 'rgba(59, 130, 246, 0.1)'
                                            : isSelected
                                                ? 'var(--primary-dim)'
                                                : 'transparent',
                                        fontWeight: isSelected ? 600 : 400,
                                        fontSize: STYLES.dropdown.option,
                                        padding: STYLES.dropdown.optionPadding,
                                        color: isHighlighted ? 'var(--primary)' : 'inherit',
                                        borderLeft: isHighlighted
                                            ? '2px solid var(--primary)'
                                            : '2px solid transparent'
                                    }}
                                >
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
