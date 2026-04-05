import { useState, useEffect, useRef } from 'react';
import { Search, Trash2, Package, Cpu, Clock, HardDrive, Shield, Plus, Hash, ChevronDown } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import { AddPackageModal } from './UploadPackageModal';
import type { UpdatePackage } from '../../types/updateTypes';
import { Toast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';

export default function PackageList() {
    const [packages, setPackages] = useState<UpdatePackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState<string>('LAI');
    const [search, setSearch] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const toastTimer = useRef<any>(null);

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ msg, type });
        toastTimer.current = setTimeout(() => setToast(null), 4000);
    };

    const loadPackages = async () => {
        setLoading(true);
        try {
            const res = await updateApi.getPackages(undefined, search || undefined);
            setPackages(res.packages);
        } catch (err: any) {
            showToast(err.message || 'Failed to load packages', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadPackages(); }, [search]);

    const handleDelete = (pkg: UpdatePackage) => {
        setConfirmModal({
            title: 'Archive Package',
            message: `Are you sure you want to archive ${pkg.packageType} v${pkg.version}? It can be restored from the Archive tab.`,
            onConfirm: async () => {
                try {
                    await updateApi.deletePackage(pkg.updatePackageId);
                    showToast('Package archived', 'success');
                    loadPackages();
                } catch (err: any) {
                    showToast(err.message || 'Delete failed', 'error');
                }
            }
        });
    };

    const formatSize = (bytes: number) => {
        if (!bytes) return '—';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const formatDateShort = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    };

    const bundleCount = packages.filter(p => p.packageType === 'Bundle').length;
    const laiCount = packages.filter(p => p.packageType === 'LAI').length;
    
    const visiblePackages = packages.filter(p => p.packageType === typeFilter);

    return (
        <>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Stats Bar */}
            <div style={{
                display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap'
            }}>
                {[
                    { label: 'LAI Packages', value: laiCount, color: '#f59e0b', filter: 'LAI' },
                    { label: 'Bundle Packages', value: bundleCount, color: 'var(--primary)', filter: 'Bundle' }
                ].map(stat => (
                    <button
                        key={stat.label}
                        onClick={() => setTypeFilter(stat.filter)}
                        style={{
                            flex: 1, minWidth: '120px',
                            padding: '0.6rem 0.75rem',
                            background: typeFilter === stat.filter ? 'var(--bg-card)' : 'transparent',
                            border: typeFilter === stat.filter
                                ? `1.5px solid ${stat.filter === 'Bundle' ? 'rgba(56,189,248,0.3)' : stat.filter === 'LAI' ? 'rgba(245,158,11,0.3)' : 'var(--border-light)'}`
                                : '1.5px solid var(--border)',
                            borderRadius: '10px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <span style={{
                            fontSize: '1.25rem', fontWeight: 800, color: stat.color,
                            lineHeight: 1
                        }}>
                            {stat.value}
                        </span>
                        <span style={{
                            fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 500
                        }}>
                            {stat.label}
                        </span>
                    </button>
                ))}
            </div>

            {/* Toolbar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                marginBottom: '0.75rem', flexWrap: 'wrap'
            }}>
                {/* Search */}
                <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                    <Search size={14} style={{
                        position: 'absolute', left: '0.75rem', top: '50%',
                        transform: 'translateY(-50%)', color: 'var(--text-dim)'
                    }} />
                    <input
                        className="input-field"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by version or description..."
                        style={{ paddingLeft: '2.25rem', fontSize: '0.82rem' }}
                    />
                </div>

                {/* Add Button */}
                <button
                    className="btn btn-primary"
                    onClick={() => setShowAddModal(true)}
                    style={{
                        fontSize: '0.82rem', padding: '0.5rem 1rem', flexShrink: 0,
                        gap: '0.35rem'
                    }}
                >
                    <Plus size={15} /> Scan & Register
                </button>
            </div>

            {/* Package Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        <div className="editor-loading-spinner" style={{ width: 24, height: 24, margin: '0 auto 1rem' }} />
                        Loading packages...
                    </div>
                ) : visiblePackages.length === 0 ? (
                    <div style={{
                        padding: '3rem', textAlign: 'center', color: 'var(--text-dim)',
                        background: 'var(--bg-card)', borderRadius: '12px',
                        border: '1px solid var(--border)'
                    }}>
                        <Package size={48} style={{ opacity: 0.15, marginBottom: '1rem' }} />
                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                            {search ? 'No packages match your search.' : `No ${typeFilter === 'Bundle' ? 'Bundle' : 'LAI'} packages registered yet.`}
                        </p>
                        <p style={{ margin: '0 0 1rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            Scan a shared network path to register your first package.
                        </p>
                        {!search && (
                            <button
                                className="btn btn-primary"
                                onClick={() => setShowAddModal(true)}
                                style={{ fontSize: '0.82rem' }}
                            >
                                <Plus size={14} /> Scan & Register {typeFilter === 'Bundle' ? 'Bundle' : 'LAI'}
                            </button>
                        )}
                    </div>
                ) : (
                    <div style={{
                        background: 'var(--bg-card)', borderRadius: '12px',
                        border: '1px solid var(--border)', overflow: 'hidden'
                    }}>
                        {/* Table Header */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 80px 90px 100px 130px 50px',
                            gap: '0.5rem', padding: '0.55rem 0.85rem',
                            background: 'var(--bg-secondary)',
                            borderBottom: '1px solid var(--border)',
                            fontSize: '0.62rem', fontWeight: 700,
                            color: 'var(--text-dim)', textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            <span>Package</span>
                            <span>Type</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <HardDrive size={9} /> Size
                            </span>
                            <span>Registered By</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Clock size={9} /> Date
                            </span>
                            <span></span>
                        </div>

                        {/* Table Rows */}
                        {visiblePackages.map((pkg, idx) => {
                            const isBundle = pkg.packageType === 'Bundle';
                            const typeColor = isBundle ? 'var(--primary)' : '#f59e0b';
                            const typeBg = isBundle ? 'rgba(56,189,248,0.08)' : 'rgba(245,158,11,0.08)';
                            const typeBorder = isBundle ? 'rgba(56,189,248,0.2)' : 'rgba(245,158,11,0.2)';
                            const expanded = expandedId === pkg.updatePackageId;

                            return (
                                <div key={pkg.updatePackageId}>
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '2fr 80px 90px 100px 130px 50px',
                                            gap: '0.5rem', padding: '0.6rem 0.85rem',
                                            alignItems: 'center',
                                            borderBottom: idx < visiblePackages.length - 1 && !expanded ? '1px solid var(--border)' : 'none',
                                            fontSize: '0.8rem',
                                            transition: 'background 0.15s',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => setExpandedId(expanded ? null : pkg.updatePackageId)}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        {/* Package Name + Version */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                            <div style={{
                                                width: 30, height: 30, borderRadius: '8px',
                                                background: typeBg, border: `1px solid ${typeBorder}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                {isBundle ? <Package size={14} color={typeColor} /> : <Cpu size={14} color={typeColor} />}
                                            </div>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{
                                                    fontWeight: 700, fontSize: '0.82rem',
                                                    display: 'flex', alignItems: 'center', gap: '0.4rem'
                                                }}>
                                                    <span style={{
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                    }}>
                                                        v{pkg.version}
                                                    </span>
                                                    <ChevronDown size={12} style={{
                                                        color: 'var(--text-dim)', flexShrink: 0,
                                                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                        transition: 'transform 0.2s ease'
                                                    }} />
                                                </div>
                                                {pkg.description && (
                                                    <div style={{
                                                        fontSize: '0.68rem', color: 'var(--text-dim)',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        maxWidth: '280px'
                                                    }}>
                                                        {pkg.description}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Type Badge */}
                                        <div>
                                            <span style={{
                                                fontSize: '0.62rem', padding: '2px 8px',
                                                borderRadius: '6px', fontWeight: 700,
                                                background: typeBg, color: typeColor,
                                                border: `1px solid ${typeBorder}`,
                                                letterSpacing: '0.02em'
                                            }}>
                                                {pkg.packageType}
                                            </span>
                                        </div>

                                        {/* Size */}
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                            {formatSize(pkg.fileSize)}
                                        </span>

                                        {/* Registered By */}
                                        <span style={{
                                            color: 'var(--text-muted)', fontSize: '0.72rem',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                            {pkg.uploadedBy}
                                        </span>

                                        {/* Date */}
                                        <span style={{
                                            color: 'var(--text-dim)', fontSize: '0.68rem',
                                            fontFamily: 'monospace'
                                        }}>
                                            {formatDateShort(pkg.uploadedDate)}
                                        </span>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-danger btn-icon"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(pkg); }}
                                                title="Archive"
                                                style={{ padding: '0.25rem', width: '28px', height: '28px' }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Details */}
                                    {expanded && (
                                        <div style={{
                                            padding: '0.65rem 0.85rem 0.75rem',
                                            background: 'var(--bg-secondary)',
                                            borderBottom: idx < packages.length - 1 ? '1px solid var(--border)' : 'none',
                                            animation: 'fadeIn 0.2s ease-out'
                                        }}>
                                            <div style={{
                                                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                                gap: '0.5rem 1.5rem'
                                            }}>
                                                <DetailRow icon={<Package size={11} />} label="File" value={pkg.fileName} />
                                                <DetailRow icon={<HardDrive size={11} />} label="Size" value={formatSize(pkg.fileSize)} />
                                                <DetailRow icon={<Clock size={11} />} label="Registered" value={formatDate(pkg.uploadedDate)} />
                                                {pkg.fileHash && (
                                                    <div style={{ gridColumn: '1 / -1' }}>
                                                        <DetailRow
                                                            icon={<Shield size={11} />}
                                                            label="SHA-256"
                                                            value={pkg.fileHash}
                                                            mono
                                                        />
                                                    </div>
                                                )}
                                                {pkg.description && (
                                                    <div style={{ gridColumn: '1 / -1' }}>
                                                        <DetailRow icon={<Hash size={11} />} label="Notes" value={pkg.description} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add Package Modal */}
            {showAddModal && (
                <AddPackageModal
                    onClose={() => setShowAddModal(false)}
                    onRegistered={loadPackages}
                    showToast={showToast}
                    initialTab={typeFilter === 'LAI' ? 'LAI' : 'Bundle'}
                />
            )}

            {/* Confirm Modal */}
            {confirmModal && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                    onCancel={() => setConfirmModal(null)}
                />
            )}
        </>
    );
}

function DetailRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem' }}>
            <span style={{ color: 'var(--text-dim)', marginTop: '1px', flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', flexShrink: 0 }}>{label}:</span>
            <span style={{
                fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-main)',
                fontFamily: mono ? 'monospace' : 'inherit',
                wordBreak: mono ? 'break-all' : 'normal',
                lineHeight: 1.4
            }}>
                {value}
            </span>
        </div>
    );
}
