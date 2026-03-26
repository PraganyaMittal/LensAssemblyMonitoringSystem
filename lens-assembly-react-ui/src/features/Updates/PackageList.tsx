import { useState, useEffect, useRef } from 'react';
import { Download, Search, Trash2, Package, Upload, Clock } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import { UploadPackageModal } from './UploadPackageModal';
import type { UpdatePackage } from '../../types/updateTypes';
import { Toast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';

export default function PackageList() {
    const [packages, setPackages] = useState<UpdatePackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState<string>('Bundle');
    const [search, setSearch] = useState('');
    const [showUpload, setShowUpload] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

    const toastTimer = useRef<any>(null);

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ msg, type });
        toastTimer.current = setTimeout(() => setToast(null), 4000);
    };

    const loadPackages = async () => {
        setLoading(true);
        try {
            const res = await updateApi.getPackages(typeFilter || undefined, search || undefined);
            setPackages(res.packages);
        } catch (err: any) {
            showToast(err.message || 'Failed to load packages', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadPackages(); }, [typeFilter, search]);

    const handleDelete = (pkg: UpdatePackage) => {
        setConfirmModal({
            title: 'Delete Package',
            message: `Are you sure you want to delete ${pkg.packageType} v${pkg.version}? This action can be undone by an admin.`,
            onConfirm: async () => {
                try {
                    await updateApi.deletePackage(pkg.updatePackageId);
                    showToast('Package deleted', 'success');
                    loadPackages();
                } catch (err: any) {
                    showToast(err.message || 'Delete failed', 'error');
                }
            }
        });
    };

    const handleDownload = (pkg: UpdatePackage) => {
        const url = updateApi.getDownloadUrl(pkg.updatePackageId);
        const a = document.createElement('a');
        a.href = url;
        a.download = pkg.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 0', flexWrap: 'wrap'
            }}>
                {}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[
                        { label: 'Bundle', value: 'Bundle' },
                        { label: 'LAI', value: 'LAI' }
                    ].map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setTypeFilter(opt.value)}
                            style={{
                                padding: '0.35rem 0.85rem',
                                borderRadius: '999px',
                                border: typeFilter === opt.value ? '1px solid var(--primary)' : '1px solid var(--border)',
                                background: typeFilter === opt.value ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                color: typeFilter === opt.value ? 'var(--primary)' : 'var(--text-muted)',
                                fontWeight: typeFilter === opt.value ? 600 : 400,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {}
                <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                    <input
                        className="input-field"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search packages..."
                        style={{ paddingLeft: '2.25rem', fontSize: '0.85rem' }}
                    />
                </div>

                {}
                <button
                    className="btn btn-primary"
                    onClick={() => setShowUpload(true)}
                    style={{ fontSize: '0.85rem', padding: '0.5rem 0.875rem', flexShrink: 0 }}
                >
                    <Upload size={15} /> Upload Package
                </button>
            </div>

            {}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        <div className="editor-loading-spinner" style={{ width: 24, height: 24, margin: '0 auto 1rem' }} />
                        Loading packages...
                    </div>
                ) : packages.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        <Package size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <p style={{ margin: 0 }}>
                            {search || typeFilter ? 'No packages match your filters.' : 'No packages uploaded yet.'}
                        </p>
                        {!search && !typeFilter && (
                            <button
                                className="btn btn-primary"
                                onClick={() => setShowUpload(true)}
                                style={{ marginTop: '1rem', fontSize: '0.85rem' }}
                            >
                                <Upload size={14} /> Upload First Package
                            </button>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {packages.map(pkg => (
                            <div key={pkg.updatePackageId} className="card no-hover" style={{
                                display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.65rem 0.8rem',
                                transition: 'background-color 0.2s ease', cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-card)'}
                            >
                                {}
                                <div style={{
                                    width: 36, height: 36,
                                    background: pkg.packageType === 'Bundle'
                                        ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05))'
                                        : 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05))',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    border: `1px solid ${pkg.packageType === 'Bundle' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`
                                }}>
                                    <Package size={18} color={pkg.packageType === 'Bundle' ? 'var(--primary)' : '#f59e0b'} />
                                </div>

                                {}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                        <h3 style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>
                                            Version - v{pkg.version}
                                        </h3>
                                    </div>

                                    {pkg.description && (
                                        <p style={{
                                            color: 'var(--text-muted)', fontSize: '0.75rem',
                                            margin: '0 0 0.2rem 0',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                            {pkg.description}
                                        </p>
                                    )}

                                    <div className="text-mono" style={{
                                        fontSize: '0.65rem', color: 'var(--text-dim)',
                                        display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'
                                    }}>
                                        <span>{pkg.fileName} • {formatSize(pkg.fileSize)}</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                            <Clock size={9} /> {formatDate(pkg.uploadedDate)}
                                        </span>
                                    </div>
                                </div>

                                {}
                                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                    <button
                                        className="btn btn-secondary btn-icon"
                                        onClick={() => handleDownload(pkg)}
                                        title="Download"
                                        style={{ padding: '0.3rem', width: '30px', height: '30px' }}
                                    >
                                        <Download size={14} />
                                    </button>
                                    <button
                                        className="btn btn-danger btn-icon"
                                        onClick={() => handleDelete(pkg)}
                                        title="Delete"
                                        style={{ padding: '0.3rem', width: '30px', height: '30px' }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {}
            {showUpload && (
                <UploadPackageModal
                    onClose={() => setShowUpload(false)}
                    onUploaded={loadPackages}
                    showToast={showToast}
                    initialTab={typeFilter as 'Bundle' | 'LAI'}
                />
            )}

            {}
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
