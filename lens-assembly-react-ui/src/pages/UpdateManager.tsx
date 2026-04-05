import { useState } from 'react';
import { Package, Archive, Library } from 'lucide-react';
import PackageList from '../features/Updates/PackageList';
import ArchiveList from '../features/Updates/ArchiveList';

export default function UpdateManager() {
    const [activeTab, setActiveTab] = useState<'packages' | 'archive'>('packages');

    return (
        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div className="dashboard-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '10px',
                            background: 'linear-gradient(135deg, var(--primary), #0891b2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(56, 189, 248, 0.25)'
                        }}>
                            <Library size={16} color="#fff" />
                        </div>
                        <div>
                            <h1 style={{
                                fontSize: '1.05rem', fontWeight: 800, margin: 0,
                                letterSpacing: '-0.01em'
                            }}>
                                Software Library
                            </h1>
                            <span style={{
                                fontSize: '0.65rem', color: 'var(--text-dim)',
                                fontWeight: 500
                            }}>
                                Package registry & deployment management
                            </span>
                        </div>
                    </div>

                    {/* Tab Switcher */}
                    <div style={{
                        display: 'flex', gap: '2px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '10px', padding: '3px',
                        border: '1px solid var(--border)'
                    }}>
                        {[
                            { key: 'packages' as const, label: 'Registry', icon: <Package size={13} /> },
                            { key: 'archive' as const, label: 'Archive', icon: <Archive size={13} /> }
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                style={{
                                    padding: '0.35rem 0.85rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: activeTab === tab.key ? 'var(--bg-card)' : 'transparent',
                                    color: activeTab === tab.key ? 'var(--text-main)' : 'var(--text-dim)',
                                    fontWeight: activeTab === tab.key ? 700 : 500,
                                    cursor: 'pointer',
                                    fontSize: '0.78rem',
                                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                                    transition: 'all 0.2s ease',
                                    boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
                                }}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="dashboard-scroll-area" style={{ display: 'flex', flexDirection: 'column' }}>
                {activeTab === 'packages' && <PackageList />}
                {activeTab === 'archive' && <ArchiveList />}
            </div>
        </div>
    );
}
