
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { BarrelExecutionData, OperationData } from '../types/log.schemas';

export interface FilterCriteria {
    
    searchQuery: string;
    
    showNGOnly: boolean;
    
    operationNames: string[];
    
    minExecutionTime: number | null;
    
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
    
    barrels: BarrelExecutionData[];
    
    debounceMs?: number;
}

export interface UseLogFilterReturn {
    
    filters: FilterCriteria;
    
    filteredBarrels: BarrelExecutionData[];
    
    availableOperations: string[];
    
    stats: {
        totalBarrels: number;
        filteredBarrels: number;
        totalOperations: number;
        ngOperations: number;
    };
    
    setSearchQuery: (query: string) => void;
    
    setShowNGOnly: (show: boolean) => void;
    
    setOperationFilter: (names: string[]) => void;
    
    setTimeRange: (min: number | null, max: number | null) => void;
    
    resetFilters: () => void;
}

export function useLogFilter(options: UseLogFilterOptions): UseLogFilterReturn {
    const { barrels, debounceMs = 200 } = options;

    const [filters, setFilters] = useState<FilterCriteria>(DEFAULT_FILTER);
    const [debouncedQuery, setDebouncedQuery] = useState('');

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const availableOperations = useMemo(() => {
        const names = new Set<string>();
        barrels.forEach(barrel => {
            barrel.operations.forEach(op => {
                names.add(op.operationName);
            });
        });
        return Array.from(names).sort();
    }, [barrels]);

    const filterOperations = useCallback((
        operations: OperationData[]
    ): OperationData[] => {
        return operations.filter(op => {
            
            if (debouncedQuery) {
                const query = debouncedQuery.toLowerCase();
                if (!op.operationName.toLowerCase().includes(query)) {
                    return false;
                }
            }

            if (filters.showNGOnly && !op.isNG) {
                return false;
            }

            if (filters.operationNames.length > 0) {
                if (!filters.operationNames.includes(op.operationName)) {
                    return false;
                }
            }

            return true;
        });
    }, [debouncedQuery, filters.showNGOnly, filters.operationNames]);

    const filteredBarrels = useMemo((): BarrelExecutionData[] => {
        return barrels
            .filter(barrel => {
                
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
