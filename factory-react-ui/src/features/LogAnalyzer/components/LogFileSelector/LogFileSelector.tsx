
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { FileText, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import type { LogFileNode } from '../../../../types/logTypes';


import {
    spacing,
    typography,
    colors,
    borders,
    shadows,
    transitions,
    fileCard,
    dropdown as dropdownTokens,
} from '../../styles/tokens';




const KEYBOARD_TIMEOUT_MS = 800;
const FILENAME_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})_.*\.log$/i;




interface Props {
    logFiles: LogFileNode[];
    selectedFile: string | null;
    onSelectFile: (path: string) => void;
    onBack: () => void;
    loading: boolean;
    pcInfo: { line: number; mcNumber: number; logPath: string };
}

type DateHierarchy = Record<string, Record<string, Record<string, LogFileNode[]>>>;






function parseLogFilename(filename: string): { hour: string; displayName: string } | null {
    const match = filename.match(FILENAME_PATTERN);
    if (!match) return null;
    const hour = match[4];
    return { hour, displayName: `${hour}:00.log` };
}


function sortYearsDesc(years: string[]) {
    return [...years].sort((a, b) => parseInt(b) - parseInt(a));
}


function sortMonthsDesc(months: string[]) {
    return [...months].sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        return numB - numA;
    });
}


function parseMonthNumber(monthStr: string | null): string {
    if (!monthStr || !/^\d+$/.test(monthStr)) return monthStr || '';
    const monthNum = parseInt(monthStr, 10);
    if (monthNum < 1 || monthNum > 12) return monthStr;
    const date = new Date(2000, monthNum - 1, 1);
    return date.toLocaleString('en-US', { month: 'long' });
}


function sortDaysByDate(days: string[], monthData: Record<string, LogFileNode[]>) {
    return [...days].sort((a, b) => {
        const timeA = monthData[a]?.[0]?.modifiedDate
            ? new Date(monthData[a][0].modifiedDate).getTime()
            : 0;
        const timeB = monthData[b]?.[0]?.modifiedDate
            ? new Date(monthData[b][0].modifiedDate).getTime()
            : 0;
        return timeB - timeA;
    });
}

function extractDateParts(node: LogFileNode): { year: string | null; month: string | null; day: string | null } {
    const parts = node.path?.split(/[/\\]/) || [];

    let year: string | null = null;
    let month: string | null = null;
    let day: string | null = null;

    if (parts.length === 0) {
        return { year, month, day };
    }

    
    
    
    const hasGeneralOffset = parts[0] === 'General';
    const offset = hasGeneralOffset ? 1 : 0;

    if (parts.length > 0 + offset && /^\d{4}$/.test(parts[0 + offset])) {
        const y = parseInt(parts[0 + offset], 10);
        if (y >= 1000 && y <= 9999) year = parts[0 + offset];
    }

    if (year && parts.length > 1 + offset && /^\d{2}$/.test(parts[1 + offset])) {
        const m = parseInt(parts[1 + offset], 10);
        if (m >= 1 && m <= 12) month = parts[1 + offset];
    }

    if (year && month && parts.length > 2 + offset && /^\d{2}$/.test(parts[2 + offset])) {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const d = parseInt(parts[2 + offset], 10);

        let daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
        if (m === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) {
            daysInMonth = 29;
        }

        if (d >= 1 && d <= daysInMonth) day = parts[2 + offset];
    }

    return { year, month, day };
}




const styles = {
    container: {
        padding: 0,
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column' as const,
    },
    header: {
        padding: `${spacing.md} ${spacing.lg}`,
        borderBottom: `2px solid ${colors.border.default}`,
        background: colors.background.panel,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap' as const,
        gap: spacing.sm,
    },
    title: {
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.semibold,
        color: colors.primary.main,
        margin: 0,
    },
    subtitle: {
        fontSize: typography.fontSize.xs,
        color: colors.text.secondary,
    },
    content: {
        padding: spacing.md,
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        minHeight: 0,
        overflow: 'hidden',
    },
    filterRow: {
        display: 'flex',
        gap: spacing.sm,
        marginBottom: spacing.md,
        flexWrap: 'wrap' as const,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${fileCard.minWidth}px, 1fr))`,
        alignContent: 'start',
        gap: `${fileCard.gap}px`,
        overflowY: 'auto' as const,
        padding: spacing.sm,
        border: `1px solid ${colors.border.default}`,
        borderRadius: borders.radius.md,
        backgroundColor: 'rgba(0,0,0,0.02)',
        flex: 1,
    },
    emptyState: {
        textAlign: 'center' as const,
        color: colors.text.secondary,
        padding: spacing['2xl'],
        background: colors.background.panel,
        borderRadius: borders.radius.lg,
        border: `1px dashed ${colors.border.default}`,
        flex: 1,
    },
};




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
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const searchBuffer = useRef('');
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    
    
    
    const dateHierarchy = useMemo(() => {
        const hierarchy: DateHierarchy = {};

        const processNode = (node: LogFileNode) => {
            const { year, month, day } = extractDateParts(node);

            
            if (year) {
                if (node.isDirectory) {
                    hierarchy[year] ??= {};
                    if (month) {
                        hierarchy[year][month] ??= {};
                        if (day) {
                            hierarchy[year][month][day] ??= [];
                        }
                    }
                } else {
                    if (year && month && day) {
                        hierarchy[year] ??= {};
                        hierarchy[year][month] ??= {};
                        hierarchy[year][month][day] ??= [];
                        hierarchy[year][month][day].push(node);
                    }
                }
            }

            
            node.children?.forEach(processNode);
        };

        logFiles.forEach(processNode);
        return hierarchy;
    }, [logFiles]);

    const availableYears = useMemo(
        () => sortYearsDesc(Object.keys(dateHierarchy)),
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

    
    
    
    const handleYearChange = useCallback((newYear: string) => {
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
    }, [dateHierarchy]);

    const handleMonthChange = useCallback((newMonth: string) => {
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
    }, [selectedYear, dateHierarchy]);

    const handleDayChange = useCallback((newDay: string) => {
        setSelectedDay(newDay);
    }, []);

    const selectFileByIndex = useCallback((index: number) => {
        if (files[index]) {
            onSelectFile(files[index].path);
            setFocusedIndex(index);
        }
    }, [files, onSelectFile]);

    
    
    

    
    useEffect(() => {
        if (availableYears.length > 0 && (!selectedYear || !availableYears.includes(selectedYear))) {
            handleYearChange(availableYears[0]);
        }
    }, [availableYears, selectedYear, handleYearChange]);

    
    useEffect(() => {
        if (focusedIndex >= 0 && gridRef.current) {
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

    
    
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            
            if ((e.target as HTMLElement).tagName === 'INPUT') return;
            
            if (isDropdownOpen) return;

            
            if (e.key === 'Escape') {
                
                if (document.querySelector('.modal-overlay, .graph-overlay')) return;
                onBack();
                return;
            }

            if (files.length === 0) return;

            
            if (/^[0-9]$/.test(e.key)) {
                if (searchTimeout.current) clearTimeout(searchTimeout.current);
                searchBuffer.current += e.key;

                const num = parseInt(searchBuffer.current);
                const targetIndex = Math.min(num, files.length - 1);
                setFocusedIndex(targetIndex);

                searchTimeout.current = setTimeout(
                    () => { searchBuffer.current = ''; },
                    KEYBOARD_TIMEOUT_MS
                );
                return;
            }

            
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
                e.preventDefault();

                if (e.key === 'Enter') {
                    selectFileByIndex(focusedIndex);
                    return;
                }

                const gridWidth = gridRef.current?.clientWidth || 800;
                const cols = Math.floor(gridWidth / (fileCard.minWidth + fileCard.gap)) || 1;

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
    }, [files, onBack, focusedIndex, isDropdownOpen, selectFileByIndex]);

    
    
    
    return (
        <div className="card no-hover" style={styles.container}>
            {}
            <header style={styles.header}>
                <div>
                    <h2 style={styles.title}>
                        Log Files - Line {pcInfo.line} MC-{pcInfo.mcNumber}
                    </h2>
                    <div className="text-mono" style={styles.subtitle}>
                        {pcInfo.logPath}
                    </div>
                </div>
                <BackButton onBack={onBack} />
            </header>

            {}
            {loading ? (
                <div style={{ padding: spacing['2xl'], textAlign: 'center', color: colors.text.secondary }}>
                    Loading log files...
                </div>
            ) : (
                <div style={styles.content}>
                    {}
                    <div style={styles.filterRow}>
                        <Dropdown
                            label="Year"
                            options={availableYears}
                            value={selectedYear}
                            onChange={handleYearChange}
                            placeholder="Select Year"
                            onOpenChange={setIsDropdownOpen}
                        />
                        <Dropdown
                            label="Month"
                            options={availableMonths}
                            displayOptions={availableMonths.map(m => parseMonthNumber(m))}
                            value={selectedMonth}
                            onChange={handleMonthChange}
                            placeholder="Select Month"
                            disabled={!selectedYear}
                            onOpenChange={setIsDropdownOpen}
                        />
                        <Dropdown
                            label="Date"
                            options={availableDays}
                            value={selectedDay}
                            onChange={handleDayChange}
                            placeholder="Select Day"
                            disabled={!selectedMonth}
                            onOpenChange={setIsDropdownOpen}
                        />
                    </div>

                    {}
                    {files.length > 0 ? (
                        <FileGrid
                            files={files}
                            selectedFile={selectedFile}
                            focusedIndex={focusedIndex}
                            onSelectFile={selectFileByIndex}
                            gridRef={gridRef}
                        />
                    ) : (
                        selectedYear && selectedMonth && selectedDay && (
                            <div style={styles.emptyState}>
                                <FileText size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.3 }} />
                                <p style={{ fontSize: typography.fontSize.base, fontWeight: 500, margin: 0 }}>
                                    No log files found.
                                </p>
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
}






function BackButton({ onBack }: { onBack: () => void }) {
    return (
        <button
            className="btn btn-secondary"
            onClick={onBack}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: `${spacing.xs} ${spacing.md}`,
                fontSize: typography.fontSize.base,
            }}
        >
            <span>← Back</span>
            <kbd style={{
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.bold,
                color: colors.text.muted,
                border: `1px solid ${colors.border.default}`,
                borderRadius: borders.radius.sm,
                padding: '0 3px',
                height: 16,
                display: 'flex',
                alignItems: 'center',
                background: colors.background.app,
                boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
            }}>
                ESC
            </kbd>
        </button>
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
    onSelectFile: (index: number) => void;
    gridRef: React.RefObject<HTMLDivElement>;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: spacing.sm,
            }}>
                <h3 style={{
                    fontSize: typography.fontSize.lg,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.primary.main,
                    margin: 0,
                }}>
                    Available Files ({files.length})
                </h3>
                <div style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary }}>
                    <span style={{ marginRight: spacing.md }}>
                        <b style={{ color: colors.text.primary }}>Arrows</b> navigate
                    </span>
                    <span style={{ marginRight: spacing.md }}>
                        <b style={{ color: colors.text.primary }}>0-9</b> jump
                    </span>
                    <span>
                        <b style={{ color: colors.text.primary }}>Enter</b> select
                    </span>
                </div>
            </div>

            {}
            <div ref={gridRef} style={styles.grid}>
                {files.map((file, idx) => (
                    <FileCard
                        key={file.path}
                        file={file}
                        index={idx}
                        isSelected={selectedFile === file.path}
                        isFocused={focusedIndex === idx}
                        onSelect={() => onSelectFile(idx)}
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

    
    const borderStyle = isSelected
        ? `2px solid ${colors.primary.main}`
        : isFocused
            ? '2px solid rgba(59, 130, 246, 0.5)'
            : `1px solid ${colors.border.default}`;

    return (
        <motion.button
            type="button"
            onClick={onSelect}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
                position: 'relative',
                margin: 0,
                background: isSelected ? colors.primary.dim : colors.background.panel,
                border: borderStyle,
                borderRadius: borders.radius.md,
                padding: spacing.sm,
                cursor: 'pointer',
                transition: transitions.all,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.xs,
                aspectRatio: '1',
                width: '100%',
                overflow: 'hidden',
                outline: 'none',
            }}
        >
            {}
            {index <= fileCard.maxVisibleIndex && (
                <div style={{
                    position: 'absolute',
                    top: 2,
                    left: 4,
                    fontSize: typography.fontSize.sm,
                    color: isFocused ? colors.primary.main : colors.text.secondary,
                    fontWeight: typography.fontWeight.bold,
                    opacity: isFocused ? 1 : 0.5,
                }}>
                    {index}
                </div>
            )}

            {}
            {(isSelected || isFocused) && (
                <div style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 6,
                    height: 6,
                    borderRadius: borders.radius.full,
                    background: isSelected ? colors.status.success : 'rgba(56, 189, 248, 0.4)',
                    boxShadow: isSelected ? shadows.successGlow : 'none',
                }} />
            )}

            {}
            <FileText
                size={fileCard.iconSize}
                color={isSelected ? colors.primary.main : colors.text.muted}
            />

            {}
            <div style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                textAlign: 'center',
                wordBreak: 'break-word',
                lineHeight: typography.lineHeight.snug,
                width: '100%',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
            }}>
                {displayName}
            </div>
        </motion.button>
    );
}


function Dropdown({
    label,
    options,
    displayOptions,
    value,
    onChange,
    placeholder,
    disabled = false,
    onOpenChange
}: {
    label: string;
    options: string[];
    displayOptions?: string[];
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
        <div style={{ position: 'relative', minWidth: 130, flex: 1 }}>
            <label style={{
                display: 'block',
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.bold,
                marginBottom: spacing.xs,
                color: colors.text.secondary,
                textTransform: 'uppercase',
                letterSpacing: typography.letterSpacing.wide,
            }}>
                {label}
            </label>

            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className="btn btn-secondary"
                style={{
                    width: '100%',
                    justifyContent: 'space-between',
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: typography.fontWeight.semibold,
                    fontSize: typography.fontSize.base,
                    padding: `${spacing.xs} ${spacing.sm}`,
                    height: 'auto',
                    border: isOpen ? `1px solid ${colors.primary.main}` : undefined,
                }}
            >
                <span style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {value ? (displayOptions ? displayOptions[options.indexOf(value)] : value) : placeholder}
                </span>
                <ChevronDown
                    size={14}
                    style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: transitions.fast,
                    }}
                />
            </button>

            {isOpen && !disabled && (
                <>
                    {}
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                        onClick={() => setIsOpen(false)}
                    />

                    {}
                    <div
                        ref={listRef}
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 2px)',
                            left: 0,
                            right: 0,
                            maxHeight: dropdownTokens.maxHeight,
                            overflowY: 'auto',
                            background: colors.background.card,
                            border: `1px solid ${colors.border.default}`,
                            borderRadius: borders.radius.md,
                            zIndex: 1000,
                            boxShadow: shadows.lg,
                        }}
                    >
                        {options.map((option, idx) => {
                            const isThisSelected = value === option;
                            const isHighlighted = highlightedIndex === idx;

                            return (
                                <button
                                    key={option}
                                    type="button"
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
                                            : isThisSelected
                                                ? colors.primary.dim
                                                : 'transparent',
                                        fontWeight: isThisSelected
                                            ? typography.fontWeight.semibold
                                            : typography.fontWeight.normal,
                                        fontSize: typography.fontSize.base,
                                        padding: `${spacing.xs} ${spacing.sm}`,
                                        color: isHighlighted ? colors.primary.main : 'inherit',
                                        borderLeft: isHighlighted
                                            ? `2px solid ${colors.primary.main}`
                                            : '2px solid transparent',
                                    }}
                                >
                                    {displayOptions ? displayOptions[idx] : option}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

