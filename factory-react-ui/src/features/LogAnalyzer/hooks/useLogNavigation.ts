/**
 * useLogNavigation - Custom hook for keyboard-navigable list selection.
 * 
 * Features:
 * - Keyboard arrow navigation (up/down)
 * - Focus management for accessibility
 * - Selection state management
 * - Generic type support for any list item
 */
import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseLogNavigationOptions<T> {
    /** Array of items to navigate */
    items: T[];
    /** Key extractor for item identification */
    getKey: (item: T) => string | number;
    /** Optional callback when selection changes */
    onSelect?: (item: T, index: number) => void;
    /** Whether navigation is enabled (default: true) */
    enabled?: boolean;
    /** Initial selected index (default: -1, no selection) */
    initialIndex?: number;
}

export interface UseLogNavigationReturn<T> {
    /** Currently selected item */
    selectedItem: T | null;
    /** Index of selected item (-1 if none) */
    selectedIndex: number;
    /** Currently focused item (for keyboard nav) */
    focusedItem: T | null;
    /** Index of focused item */
    focusedIndex: number;
    /** Select an item by index */
    selectByIndex: (index: number) => void;
    /** Select an item directly */
    selectItem: (item: T) => void;
    /** Move focus up */
    focusPrevious: () => void;
    /** Move focus down */
    focusNext: () => void;
    /** Confirm focused item as selected */
    confirmFocused: () => void;
    /** Reset selection */
    reset: () => void;
    /** Keyboard event handler for list container */
    handleKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Hook for managing keyboard-navigable list selection.
 * 
 * @example
 * ```tsx
 * const {
 *   selectedItem,
 *   focusedIndex,
 *   handleKeyDown,
 * } = useLogNavigation({
 *   items: logFiles,
 *   getKey: (file) => file.path,
 *   onSelect: (file) => handleFileClick(file),
 * });
 * 
 * return (
 *   <div role="listbox" onKeyDown={handleKeyDown}>
 *     {logFiles.map((file, i) => (
 *       <div
 *         key={file.path}
 *         role="option"
 *         aria-selected={selectedItem === file}
 *         data-focused={focusedIndex === i}
 *       >
 *         {file.name}
 *       </div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useLogNavigation<T>(
    options: UseLogNavigationOptions<T>
): UseLogNavigationReturn<T> {
    const {
        items,
        getKey,
        onSelect,
        enabled = true,
        initialIndex = -1,
    } = options;

    const [selectedIndex, setSelectedIndex] = useState(initialIndex);
    const [focusedIndex, setFocusedIndex] = useState(initialIndex);

    // Track previous items length for bounds checking
    const prevItemsLengthRef = useRef(items.length);

    // Adjust indices when items array changes
    useEffect(() => {
        if (items.length !== prevItemsLengthRef.current) {
            // Clamp indices to valid range
            if (selectedIndex >= items.length) {
                setSelectedIndex(items.length > 0 ? items.length - 1 : -1);
            }
            if (focusedIndex >= items.length) {
                setFocusedIndex(items.length > 0 ? items.length - 1 : -1);
            }
            prevItemsLengthRef.current = items.length;
        }
    }, [items.length, selectedIndex, focusedIndex]);

    const selectedItem = selectedIndex >= 0 && selectedIndex < items.length
        ? items[selectedIndex]
        : null;

    const focusedItem = focusedIndex >= 0 && focusedIndex < items.length
        ? items[focusedIndex]
        : null;

    /**
     * Select by index.
     */
    const selectByIndex = useCallback((index: number): void => {
        if (index >= 0 && index < items.length) {
            setSelectedIndex(index);
            setFocusedIndex(index);
            onSelect?.(items[index], index);
        }
    }, [items, onSelect]);

    /**
     * Select by item reference.
     */
    const selectItem = useCallback((item: T): void => {
        const index = items.findIndex(i => getKey(i) === getKey(item));
        if (index >= 0) {
            selectByIndex(index);
        }
    }, [items, getKey, selectByIndex]);

    /**
     * Move focus to previous item.
     */
    const focusPrevious = useCallback((): void => {
        if (!enabled || items.length === 0) return;

        setFocusedIndex(prev => {
            const next = prev <= 0 ? items.length - 1 : prev - 1;
            return next;
        });
    }, [enabled, items.length]);

    /**
     * Move focus to next item.
     */
    const focusNext = useCallback((): void => {
        if (!enabled || items.length === 0) return;

        setFocusedIndex(prev => {
            const next = prev >= items.length - 1 ? 0 : prev + 1;
            return next;
        });
    }, [enabled, items.length]);

    /**
     * Confirm the focused item as selected.
     */
    const confirmFocused = useCallback((): void => {
        if (focusedIndex >= 0 && focusedIndex < items.length) {
            selectByIndex(focusedIndex);
        }
    }, [focusedIndex, items.length, selectByIndex]);

    /**
     * Reset selection and focus.
     */
    const reset = useCallback((): void => {
        setSelectedIndex(-1);
        setFocusedIndex(-1);
    }, []);

    /**
     * Keyboard event handler for the list container.
     */
    const handleKeyDown = useCallback((e: React.KeyboardEvent): void => {
        if (!enabled) return;

        switch (e.key) {
            case 'ArrowUp':
            case 'ArrowLeft':
                e.preventDefault();
                focusPrevious();
                break;
            case 'ArrowDown':
            case 'ArrowRight':
                e.preventDefault();
                focusNext();
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                confirmFocused();
                break;
            case 'Home':
                e.preventDefault();
                if (items.length > 0) {
                    setFocusedIndex(0);
                }
                break;
            case 'End':
                e.preventDefault();
                if (items.length > 0) {
                    setFocusedIndex(items.length - 1);
                }
                break;
            case 'Escape':
                e.preventDefault();
                reset();
                break;
        }
    }, [enabled, focusPrevious, focusNext, confirmFocused, items.length, reset]);

    return {
        selectedItem,
        selectedIndex,
        focusedItem,
        focusedIndex,
        selectByIndex,
        selectItem,
        focusPrevious,
        focusNext,
        confirmFocused,
        reset,
        handleKeyDown,
    };
}

export default useLogNavigation;
