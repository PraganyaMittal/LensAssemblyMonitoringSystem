import { useState } from 'react';
import { Package, Archive } from 'lucide-react';
import PackageList from '../features/Updates/PackageList';
import ArchiveList from '../features/Updates/ArchiveList';

export default function UpdateManager() {
    const [activeTab, setActiveTab] = useState<'packages' | 'archive'>('packages');

    const tabStyle = (tab: string) => ({
        padding: '0.4rem 1rem',
        borderRadius: '6px',
        border: 'none',
        background: activeTab === tab ? 'var(--card-bg)' : 'transparent',
        color: activeTab === tab ? 'var(--text)' : 'var(--text-dim)',
        fontWeight: activeTab === tab ? 600 : 400,
        cursor: 'pointer',
        fontSize: '0.8rem',
        display: 'flex' as const, alignItems: 'center' as const, gap: '0.4rem',
        transition: 'all 0.2s',
        boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
    });

    return (
        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {}
            <div className="dashboard-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Package size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span>Software Library</span>
                        </h1>
                    </div>

                    {}
                    <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '3px' }}>
                        <button onClick={() => setActiveTab('packages')} style={tabStyle('packages')}>
                            <Package size={14} /> Packages
                        </button>
                        <button onClick={() => setActiveTab('archive')} style={tabStyle('archive')}>
                            <Archive size={14} /> Archive
                        </button>
                    </div>
                </div>
            </div>

            {}
            <div className="dashboard-scroll-area" style={{ display: 'flex', flexDirection: 'column' }}>
                {activeTab === 'packages' && <PackageList />}
                {activeTab === 'archive' && <ArchiveList />}
            </div>
        </div>
    );
}
