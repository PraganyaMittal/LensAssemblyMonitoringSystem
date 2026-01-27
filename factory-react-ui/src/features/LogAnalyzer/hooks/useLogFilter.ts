/**
 * useLogFilter - Custom hook for filtering log operations and barrels.
 * 
 * Features:
 * - Filter operations by name, status, NG reason
 * - Filter barrels by execution time range
 * - Memoized filter results for performance
 * - Debounced text search
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { BarrelExecutionData, OperationData } from '../types/log.schemas';

export interface FilterCriteria {
    /** Text search query (matches operation name) */
    searchQuery: string;
    /** Filter to only show NG operations */
    showNGOnly: boolean;
    /** Filter operations by name (exact match) */
    operationNames: string[];
    /** Min execution time filter (ms) */
    minExecutionTime: number | null;
    /** Max execution time filter (ms) */
    maxExecutionTime: number | null;
}

const DEFAULT_FILTER: FilterCriteria = {
    searchQuery: '',
    showNGOnly: false,
    operationNames: [],
    minExecutionTime: null,
    maxExecutionTime: null,
};

export interface UseLogFilterOptions {
    /** Barrels to filter */
    barrels: BarrelExecutionData[];
    /** Debounce delay for text search (ms) */
    debounceMs?: number;
}

export interface UseLogFilterReturn {
    /** Current filter criteria */
    filters: FilterCriteria;
    /** Filtered barrels */
    filteredBarrels: BarrelExecutionData[];
    /** Unique operation names in the data */
    availableOperations: string[];
    /** Statistics about filtered data */
    stats: {
        totalBarrels: number;
        filteredBarrels: number;
        totalOperations: number;
        ngOperations: number;
    };
    /** Update search query */
    setSearchQuery: (query: string) => void;
    /** Toggle NG-only filter */
    setShowNGOnly: (show: boolean) => void;
    /** Set operation name filter */
    setOperationFilter: (names: string[]) => void;
    /** Set execution time range */
    setTimeRange: (min: number | null, max: number | null) => void;
    /** Reset all filters */
    resetFilters: () => void;
}

/**
 * Hook for filtering log analysis data.
 * 
 * @example
 * ```tsx
 * const {
 *   filteredBarrels,
 *   filters,
 *   setSearchQuery,
 *   setShowNGOnly,
 *   stats,
 * } = useLogFilter({ barrels: result.barrels });
 * 
 * return (
 *   <div>
 *     <input 
 *       value={filters.searchQuery}
 *       onChange={(e) => setSearchQuery(e.target.value)}
 *     />
 *     <label>
 *       <input 
 *         type="checkbox"
 *         checked={filters.showNGOnly}
 *         onChange={(e) => setShowNGOnly(e.target.checked)}
 *       />
 *       Show NG Only
 *     </label>
 *     <p>Showing {stats.filteredBarrels} of {stats.totalBarrels} barrels</p>
 *   </div>
 * );
 * ```
 */
export function useLogFilter(options: UseLogFilterOptions): UseLogFilterReturn {
    const { barrels, debounceMs = 200 } = options;

    const [filters, setFilters] = useState<FilterCriteria>(DEFAULT_FILTER);
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // Debounce timer ref
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounce search query
    useEffect(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            setDebouncedQuery(filters.searchQuery);
        }, debounceMs);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [filters.searchQuery, debounceMs]);

    /**
     * Extract unique operation names from all barrels.
     */
    const availableOperations = useMemo(() => {
        const names = new Set<string>();
        barrels.forEach(barrel => {
            barrel.operations.forEach(op => {
                names.add(op.operationName);
            });
        });
        return Array.from(names).sort();
    }, [barrels]);

    /**
     * Filter operations within a barrel based on criteria.
     */
    const filterOperations = useCallback((
        operations: OperationData[]
    ): OperationData[] => {
        return operations.filter(op => {
            // Search query filter
            if (debouncedQuery) {
                const query = debouncedQuery.toLowerCase();
                if (!op.operationName.toLowerCase().includes(query)) {
                    return false;
                }
            }

            // NG-only filter
            if (filters.showNGOnly && !op.isNG) {
                return false;
            }

            // Operation name filter
            if (filters.operationNames.length > 0) {
                if (!filters.operationNames.includes(op.operationName)) {
                    return false;
                }
            }

            return true;
        });
    }, [debouncedQuery, filters.showNGOnly, filters.operationNames]);

    /**
     * Filter barrels and their operations.
     */
    const filteredBarrels = useMemo((): BarrelExecutionData[] => {
        return barrels
            .filter(barrel => {
                // Execution time filter
                if (filters.minExecutionTime !== null) {
                    if (barrel.totalExecutionTime < filters.minExecutionTime) {
                        return false;
                    }
                }
                if (filters.maxExecutionTime !== null) {
                    if (barrel.totalExecutionTime > filters.maxExecutionTime) {
                        return false;
                    }
                }

                // Check if any operation passes filters
                const filteredOps = filterOperations(barrel.operations);
                return filteredOps.length > 0 || (
                    !debouncedQuery &&
                    !filters.showNGOnly &&
                    filters.operationNames.length === 0
                );
            })
            .map(barrel => ({
                ...barrel,
                operations: filterOperations(barrel.operations),
            }));
    }, [barrels, filters, debouncedQuery, filterOperations]);

    /**
     * Calculate statistics.
     */
    const stats = useMemo(() => {
        const totalOperations = barrels.reduce(
            (sum, b) => sum + b.operations.length,
            0
        );
        const ngOperations = barrels.reduce(
            (sum, b) => sum + b.operations.filter(op => op.isNG).length,
            0
        );

        return {
            totalBarrels: barrels.length,
            filteredBarrels: filteredBarrels.length,
            totalOperations,
            ngOperations,
        };
    }, [barrels, filteredBarrels]);

    // Filter setters
    const setSearchQuery = useCallback((query: string) => {
        setFilters(prev => ({ ...prev, searchQuery: query }));
    }, []);

    const setShowNGOnly = useCallback((show: boolean) => {
        setFilters(prev => ({ ...prev, showNGOnly: show }));
    }, []);

    const setOperationFilter = useCallback((names: string[]) => {
        setFilters(prev => ({ ...prev, operationNames: names }));
    }, []);

    const setTimeRange = useCallback((
        min: number | null,
        max: number | null
    ) => {
        setFilters(prev => ({
            ...prev,
            minExecutionTime: min,
            maxExecutionTime: max,
        }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTER);
        setDebouncedQuery('');
    }, []);

    return {
        filters,
        filteredBarrels,
        availableOperations,
        stats,
        setSearchQuery,
        setShowNGOnly,
        setOperationFilter,
        setTimeRange,
        resetFilters,
    };
}

export default useLogFilter;
