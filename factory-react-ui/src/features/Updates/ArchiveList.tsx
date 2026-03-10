import { useState, useEffect, useRef } from 'react';
import { Archive, Trash2, RefreshCw, RotateCcw } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import { Toast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';

interface ArchivedPackage {
    updatePackageId: number;
    packageName: string;
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
            title: 'Permanently Delete Package',
            message: `Are you sure you want to permanently delete "${pkg.packageName} v${pkg.version}"? This cannot be undone and will delete the file from the server.`,
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
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (d: string) => {
        return new Date(d).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    };

    return (
        <>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Archive size={18} color="var(--text-dim)" /> Archived Packages
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            Note: Archived packages older than 30 days will be permanently purged to save disk space.
                        </span>
                        <button
                            onClick={loadArchive}
                            className="btn btn-secondary btn-icon"
                            style={{ padding: '0.35rem' }}
                            title="Refresh"
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        Loading archive...
                    </div>
                ) : packages.length === 0 ? (
                    <div style={{
                        padding: '3rem', textAlign: 'center', color: 'var(--text-dim)',
                        background: 'var(--card-bg)', borderRadius: '12px',
                        border: '1px solid var(--border)'
                    }}>
                        <Archive size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                        <p>Archive is empty</p>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '1rem'
                    }}>
                        {packages.map(pkg => (
                            <div key={pkg.updatePackageId} className="mc-card">
                                <div className="mc-card-header" style={{ alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={pkg.packageName}>
                                                {pkg.packageName}
                                            </span>
                                            <span style={{
                                                fontSize: '0.7rem', padding: '1px 6px', borderRadius: '3px',
                                                background: pkg.packageType === 'LAI' ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                                                color: pkg.packageType === 'LAI' ? '#60a5fa' : '#c084fc',
                                                fontWeight: 500
                                            }}>
                                                {pkg.packageType}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>v{pkg.version}</div>
                                    </div>
                                    <div style={{
                                        fontSize: '0.7rem',
                                        color: pkg.daysUntilPurge <= 3 ? '#ef4444' : '#eab308',
                                        background: pkg.daysUntilPurge <= 3 ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontWeight: 600
                                    }}>
                                        Purge in {pkg.daysUntilPurge}d
                                    </div>
                                </div>
                                <div className="mc-card-body" style={{ gap: '0.5rem', fontSize: '0.8rem' }}>
                                    {pkg.description && (
                                        <div style={{ color: 'var(--text-dim)', marginBottom: '0.25rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={pkg.description}>
                                            {pkg.description}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                                        <span>Size:</span>
                                        <span style={{ color: 'var(--text)' }}>{formatBytes(pkg.fileSize)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)' }}>
                                        <span>Archived:</span>
                                        <span style={{ color: 'var(--text)' }}>{formatDate(pkg.archivedDate)}</span>
                                    </div>
                                </div>
                                <div className="mc-card-footer" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => handleRestore(pkg)}
                                        className="btn btn-secondary"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                    >
                                        <RotateCcw size={14} /> Restore
                                    </button>
                                    <button
                                        onClick={() => handlePurge(pkg)}
                                        className="btn btn-danger"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                                    >
                                        <Trash2 size={14} /> Purge
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
