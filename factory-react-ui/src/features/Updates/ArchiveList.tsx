import { useState, useEffect, useRef } from 'react';
import { Archive, Trash2, RotateCcw, Clock, HardDrive } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import { Toast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';

interface ArchivedPackage {
    updatePackageId: number;
    packageType: string;
    version: string;
    fileName: string;
    fileSize: number;
    description?: string;
    uploadedBy: string;
    uploadedDate: string;
    archivedDate: string;
    daysUntilPurge: number;
}

export default function ArchiveList() {
    const [packages, setPackages] = useState<ArchivedPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
    const toastTimer = useRef<any>(null);

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ msg, type });
        toastTimer.current = setTimeout(() => setToast(null), 4000);
    };

    const loadArchive = async () => {
        setLoading(true);
        try {
            const res = await updateApi.getArchivedPackages();
            setPackages(res.packages);
        } catch (err: any) {
            showToast(err.message || 'Failed to load archive', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadArchive(); }, []);

    const handleRestore = async (pkg: ArchivedPackage) => {
        try {
            await updateApi.restorePackage(pkg.updatePackageId);
            showToast('Package restored successfully', 'success');
            loadArchive();
        } catch (err: any) {
            showToast(err.message || 'Restore failed', 'error');
        }
    };

    const handlePurge = (pkg: ArchivedPackage) => {
        setConfirmModal({
            title: 'Confirm Hard Delete',
            message: `Are you sure you want to permanently delete "${pkg.packageType} v${pkg.version}"? This cannot be undone and will delete the file from the server.`,
            onConfirm: async () => {
                try {
                    await updateApi.purgePackage(pkg.updatePackageId);
                    showToast('Package permanently deleted', 'success');
                    loadArchive();
                } catch (err: any) {
                    showToast(err.message || 'Delete failed', 'error');
                }
            }
        });
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatDate = (d: string) => {
        return new Date(d).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    };

    return (
        <>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Archive size={16} color="var(--text-dim)" /> Archived Packages
                    </h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        Packages older than 30 days are auto-purged
                    </span>
                </div>

                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        <div className="editor-loading-spinner" style={{ width: 20, height: 20, margin: '0 auto 0.5rem' }} />
                        Loading archive...
                    </div>
                ) : packages.length === 0 ? (
                    <div style={{
                        padding: '3rem', textAlign: 'center', color: 'var(--text-dim)',
                        background: 'var(--card-bg)', borderRadius: '10px',
                        border: '1px solid var(--border)'
                    }}>
                        <Archive size={36} style={{ opacity: 0.2, marginBottom: '0.5rem' }} />
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>Archive is empty</p>
                    </div>
                ) : (
                    /* Modern List/Table View */
                    <div style={{
                        background: 'var(--card-bg)',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        overflow: 'hidden'
                    }}>
                        {/* Table header */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 70px 60px 80px 90px 80px 110px',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            background: 'var(--bg-secondary)',
                            borderBottom: '1px solid var(--border)',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            color: 'var(--text-dim)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                        }}>
                            <span>Package</span>
                            <span>Type</span>
                            <span>Version</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <HardDrive size={10} /> Size
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Clock size={10} /> Archived
                            </span>
                            <span>Purge In</span>
                            <span style={{ textAlign: 'right' }}>Actions</span>
                        </div>

                        {/* Table rows */}
                        {packages.map((pkg, idx) => (
                            <div
                                key={pkg.updatePackageId}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 70px 60px 80px 90px 80px 110px',
                                    gap: '0.5rem',
                                    padding: '0.5rem 0.75rem',
                                    alignItems: 'center',
                                    borderBottom: idx < packages.length - 1 ? '1px solid var(--border)' : 'none',
                                    fontSize: '0.78rem',
                                    transition: 'background 0.15s',
                                    cursor: 'default'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                {/* Package Name */}
                                <div style={{
                                    fontWeight: 600,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }} title={`${pkg.packageType} v${pkg.version}`}>
                                    {pkg.packageType} v{pkg.version}
                                </div>

                                {/* Type Badge */}
                                <div>
                                    <span style={{
                                        fontSize: '0.62rem',
                                        padding: '1px 6px',
                                        borderRadius: '3px',
                                        background: pkg.packageType === 'Bundle'
                                            ? 'rgba(99,102,241,0.12)' : 'rgba(59,130,246,0.12)',
                                        color: pkg.packageType === 'Bundle'
                                            ? '#818cf8' : '#60a5fa',
                                        fontWeight: 600
                                    }}>
                                        {pkg.packageType}
                                    </span>
                                </div>

                                {/* Version */}
                                <span style={{
                                    color: 'var(--accent)',
                                    fontWeight: 600,
                                    fontSize: '0.75rem'
                                }}>
                                    v{pkg.version}
                                </span>

                                {/* Size */}
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                                    {formatBytes(pkg.fileSize)}
                                </span>

                                {/* Archived Date */}
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                                    {formatDate(pkg.archivedDate)}
                                </span>

                                {/* Purge Timer */}
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 600,
                                    color: pkg.daysUntilPurge <= 3 ? '#ef4444' : pkg.daysUntilPurge <= 7 ? '#eab308' : 'var(--text-dim)',
                                    background: pkg.daysUntilPurge <= 3
                                        ? 'rgba(239,68,68,0.08)' : pkg.daysUntilPurge <= 7
                                            ? 'rgba(234,179,8,0.08)' : 'transparent',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    display: 'inline-block'
                                }}>
                                    {pkg.daysUntilPurge}d
                                </span>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={() => handleRestore(pkg)}
                                        className="btn btn-secondary"
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '3px',
                                            fontSize: '0.68rem', padding: '0.2rem 0.45rem'
                                        }}
                                        title="Restore to active packages"
                                    >
                                        <RotateCcw size={11} /> Restore
                                    </button>
                                    <button
                                        onClick={() => handlePurge(pkg)}
                                        className="btn btn-danger"
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '3px',
                                            fontSize: '0.68rem', padding: '0.2rem 0.45rem'
                                        }}
                                        title="Permanently delete"
                                    >
                                        <Trash2 size={11} /> Purge
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

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
