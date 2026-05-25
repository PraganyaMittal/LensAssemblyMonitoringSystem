import { ChevronRight } from 'lucide-react';
import type { DrillDownState } from '../../features/LogAnalyzer/context/LogAnalyzerContext';

interface Props {
    drillDown: DrillDownState;
    fileName?: string;
    onNavigateToTrayList: () => void;
}

export default function DrillDownBreadcrumb({ drillDown, fileName, onNavigateToTrayList }: Props) {
    const crumbs: { label: string; onClick?: () => void }[] = [];

    // Level 0: always show the file name
    const shortName = fileName?.split(/[\\/]/).pop() || 'Log Analysis';
    crumbs.push({
        label: shortName,
        onClick: drillDown.level !== 'tray-list' ? onNavigateToTrayList : undefined
    });

    // Level 1: tray selected
    if (drillDown.selectedTrayId) {
        const trayLabel = `Tray ${drillDown.selectedTrayId}`;
        crumbs.push({
            label: trayLabel,
            onClick: drillDown.level === 'barrel-detail'
                ? () => onNavigateToTrayList()
                : undefined
        });
    }

    // Level 2: barrel selected
    if (drillDown.selectedBarrelId !== undefined && drillDown.level === 'barrel-detail') {
        crumbs.push({ label: `Barrel ${drillDown.selectedBarrelId}` });
    }

    return (
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {crumbs.map((crumb, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {i > 0 && <ChevronRight size={14} color="#475569" />}
                    {crumb.onClick ? (
                        <button
                            onClick={crumb.onClick}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#60a5fa',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                padding: '2px 4px',
                                borderRadius: '4px',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(96, 165, 250, 0.1)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                            {crumb.label}
                        </button>
                    ) : (
                        <span style={{
                            color: '#f8fafc',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            padding: '2px 4px'
                        }}>
                            {crumb.label}
                        </span>
                    )}
                </span>
            ))}
        </nav>
    );
}
