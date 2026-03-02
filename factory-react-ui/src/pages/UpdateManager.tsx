import { Package } from 'lucide-react';
import PackageList from '../features/Updates/PackageList';

/**
 * Update Manager page — Tab container for update management features.
 * Feature 1: Packages tab only. More tabs added as features are built.
 */
export default function UpdateManager() {
    return (
        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div className="dashboard-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Package size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span>Update Manager</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Content — Packages tab (Feature 1) */}
            <div className="dashboard-scroll-area" style={{ display: 'flex', flexDirection: 'column' }}>
                <PackageList />
            </div>
        </div>
    );
}
