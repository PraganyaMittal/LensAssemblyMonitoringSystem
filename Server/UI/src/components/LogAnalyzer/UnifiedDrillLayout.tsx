import { ReactNode, useEffect, useRef, useCallback } from 'react';

export type ExpandedView = 'none' | 'top' | 'bottom';

interface Props {
    topContent: ReactNode;
    bottomContent: ReactNode;
    expandedView: ExpandedView;
}

/**
 * Unified layout used at every drill-down level.
 * Controls (Max Seq/Split/Max Bar) are in the header — this component
 * only handles the split rendering.
 *
 * ┌──────────────────────────────────────┐
 * │         TOP SECTION (72%)            │
 * │   (Gantt chart / content chart)      │
 * ├── 4px gap ───────────────────────────┤
 * │        BOTTOM SECTION (28%)          │
 * │    (Bar chart / candle chart)        │
 * └──────────────────────────────────────┘
 */
export default function UnifiedDrillLayout({ topContent, bottomContent, expandedView }: Props) {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
            {/* Top section — Gantt / content */}
            <div style={{
                height: expandedView === 'bottom' ? '0%' : expandedView === 'top' ? '100%' : '72%',
                display: expandedView === 'bottom' ? 'none' : 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
                flex: expandedView === 'top' ? 1 : undefined,
            }}>
                <div className="card no-hover" style={{ height: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, width: '100%', minHeight: 0, position: 'relative' }}>
                        <div style={{ position: 'absolute', inset: 0 }}>
                            {topContent}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom section — Bar chart */}
            <div style={{
                height: expandedView === 'top' ? '0%' : expandedView === 'bottom' ? '100%' : '28%',
                display: expandedView === 'top' ? 'none' : 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
                flex: expandedView === 'bottom' ? 1 : undefined,
            }}>
                <div className="card no-hover" style={{ height: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, width: '100%', minHeight: 0, position: 'relative' }}>
                        <div style={{ position: 'absolute', inset: 0 }}>
                            {bottomContent}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Hook for keyboard ← → navigation through items.
 * Works at every drill level (trays, barrels).
 */
export function useArrowKeyNav<T>(
    items: T[],
    selectedItem: T | null | undefined,
    getKey: (item: T) => string | number,
    onSelect: (item: T) => void,
) {
    const hasShownHint = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (items.length === 0 || selectedItem == null) return;

        const currentIndex = items.findIndex(it => getKey(it) === getKey(selectedItem));
        if (currentIndex === -1) return;

        const handleKeyPress = (e: KeyboardEvent) => {
            let newIndex = currentIndex;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                newIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
            }
            if (newIndex !== currentIndex) onSelect(items[newIndex]);
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [items, selectedItem, getKey, onSelect]);

    // Show hint toast once
    const showHint = useCallback((label: string) => {
        if (hasShownHint.current || !containerRef.current) return;
        hasShownHint.current = true;

        const toast = document.createElement('div');
        toast.style.cssText = `
            position: absolute;
            top: 8px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(68, 68, 68, 0.9);
            color: #fff;
            padding: 8px 16px;
            border-radius: 4px;
            font-family: 'Open Sans', sans-serif;
            font-size: 12px;
            z-index: 1000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease-out;
        `;
        toast.textContent = `Use ← → arrow keys to navigate ${label}`;

        containerRef.current.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; });

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }, []);

    return { containerRef, showHint };
}

/**
 * Hook for single-click = select, double-click = drill pattern.
 */
export function useClickDrillPattern(
    onSelect: (id: number | string) => void,
    onDrill: (id: number | string) => void,
) {
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastClickIdRef = useRef<number | string | null>(null);

    const handleClick = useCallback((id: number | string) => {
        if (clickTimerRef.current && lastClickIdRef.current === id) {
            // Double-click detected
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
            lastClickIdRef.current = null;
            onDrill(id);
        } else {
            // First click — start timer
            if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
            lastClickIdRef.current = id;
            clickTimerRef.current = setTimeout(() => {
                onSelect(id);
                clickTimerRef.current = null;
            }, 250);
        }
    }, [onSelect, onDrill]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
        };
    }, []);

    return handleClick;
}
