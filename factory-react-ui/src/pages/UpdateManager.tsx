import { useState } from 'react';
import { Package, Rocket } from 'lucide-react';
import PackageList from '../features/Updates/PackageList';
import ScheduleList from '../features/Updates/ScheduleList';

/**
 * Update Manager page — Tab container for update management features.
 * Feature 1: Packages tab
 * Feature 2: Deployments tab
 */
export default function UpdateManager() {
    const [activeTab, setActiveTab] = useState<'packages' | 'deployments'>('packages');

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

                    {/* Tab Navigation */}
                    <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '3px' }}>
                        <button
                            onClick={() => setActiveTab('packages')}
                            style={{
                                padding: '0.4rem 1rem',
                                borderRadius: '6px',
                                border: 'none',
                                background: activeTab === 'packages' ? 'var(--card-bg)' : 'transparent',
                                color: activeTab === 'packages' ? 'var(--text)' : 'var(--text-dim)',
                                fontWeight: activeTab === 'packages' ? 600 : 400,
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                transition: 'all 0.2s',
                                boxShadow: activeTab === 'packages' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                            }}
                        >
                            <Package size={14} /> Packages
                        </button>
                        <button
                            onClick={() => setActiveTab('deployments')}
                            style={{
                                padding: '0.4rem 1rem',
                                borderRadius: '6px',
                                border: 'none',
                                background: activeTab === 'deployments' ? 'var(--card-bg)' : 'transparent',
                                color: activeTab === 'deployments' ? 'var(--text)' : 'var(--text-dim)',
                                fontWeight: activeTab === 'deployments' ? 600 : 400,
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                transition: 'all 0.2s',
                                boxShadow: activeTab === 'deployments' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                            }}
                        >
                            <Rocket size={14} /> Deployments
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="dashboard-scroll-area" style={{ display: 'flex', flexDirection: 'column' }}>
                {activeTab === 'packages' && <PackageList />}
                {activeTab === 'deployments' && <ScheduleList />}
            </div>
        </div>
    );
}
