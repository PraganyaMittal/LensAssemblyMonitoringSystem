
import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseLogNavigationOptions<T> {
    
    items: T[];
    
    getKey: (item: T) => string | number;
    
    onSelect?: (item: T, index: number) => void;
    
    enabled?: boolean;
    
    initialIndex?: number;
}

export interface UseLogNavigationReturn<T> {
    
    selectedItem: T | null;
    
    selectedIndex: number;
    
    focusedItem: T | null;
    
    focusedIndex: number;
    
    selectByIndex: (index: number) => void;
    
    selectItem: (item: T) => void;
    
    focusPrevious: () => void;
    
    focusNext: () => void;
    
    confirmFocused: () => void;
    
    reset: () => void;
    
    handleKeyDown: (e: React.KeyboardEvent) => void;
}


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

    
    const prevItemsLengthRef = useRef(items.length);

    
    useEffect(() => {
        if (items.length !== prevItemsLengthRef.current) {
            
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

    
    const selectByIndex = useCallback((index: number): void => {
        if (index >= 0 && index < items.length) {
            setSelectedIndex(index);
            setFocusedIndex(index);
            onSelect?.(items[index], index);
        }
    }, [items, onSelect]);

    
    const selectItem = useCallback((item: T): void => {
        const index = items.findIndex(i => getKey(i) === getKey(item));
        if (index >= 0) {
            selectByIndex(index);
        }
    }, [items, getKey, selectByIndex]);

    
    const focusPrevious = useCallback((): void => {
        if (!enabled || items.length === 0) return;

        setFocusedIndex(prev => {
            const next = prev <= 0 ? items.length - 1 : prev - 1;
            return next;
        });
    }, [enabled, items.length]);

    
    const focusNext = useCallback((): void => {
        if (!enabled || items.length === 0) return;

        setFocusedIndex(prev => {
            const next = prev >= items.length - 1 ? 0 : prev + 1;
            return next;
        });
    }, [enabled, items.length]);

    
    const confirmFocused = useCallback((): void => {
        if (focusedIndex >= 0 && focusedIndex < items.length) {
            selectByIndex(focusedIndex);
        }
    }, [focusedIndex, items.length, selectByIndex]);

    
    const reset = useCallback((): void => {
        setSelectedIndex(-1);
        setFocusedIndex(-1);
    }, []);

    
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
