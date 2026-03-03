import { useState, useEffect, useRef } from 'react';
import { Package, Upload, Download, Trash2, Rocket, Search, Clock, Shield } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import { UploadPackageModal } from './UploadPackageModal';
import DeployModal from './DeployModal';
import type { UpdatePackage } from '../../types/updateTypes';
import { Toast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';

export default function PackageList() {
    const [packages, setPackages] = useState<UpdatePackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [search, setSearch] = useState('');
    const [showUpload, setShowUpload] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
    const [deployPkg, setDeployPkg] = useState<UpdatePackage | null>(null);
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
            message: `Are you sure you want to delete "${pkg.packageName}" (${pkg.packageType} v${pkg.version})? This action can be undone by an admin.`,
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

            {/* Toolbar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 0', flexWrap: 'wrap'
            }}>
                {/* Type Filter Chips */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[
                        { label: 'All', value: '' },
                        { label: 'LAI', value: 'LAI' },
                        { label: 'Agent', value: 'Agent' }
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

                {/* Search */}
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

                {/* Upload Button */}
                <button
                    className="btn btn-primary"
                    onClick={() => setShowUpload(true)}
                    style={{ fontSize: '0.85rem', padding: '0.5rem 0.875rem', flexShrink: 0 }}
                >
                    <Upload size={15} /> Upload Package
                </button>
            </div>

            {/* Package Grid */}
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
                            <div key={pkg.updatePackageId} className="card" style={{
                                display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem'
                            }}>
                                {/* Icon */}
                                <div style={{
                                    width: 48, height: 48,
                                    background: pkg.packageType === 'LAI'
                                        ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05))'
                                        : 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05))',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    border: `1px solid ${pkg.packageType === 'LAI' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`
                                }}>
                                    <Package size={24} color={pkg.packageType === 'LAI' ? 'var(--primary)' : '#f59e0b'} />
                                </div>

                                {/* Details */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
                                        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>
                                            {pkg.packageName}
                                        </h3>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.6rem' }}>
                                            {pkg.packageType}
                                        </span>
                                        <span style={{
                                            fontSize: '0.7rem', padding: '0.1rem 0.5rem',
                                            borderRadius: '999px',
                                            background: 'rgba(34, 197, 94, 0.1)',
                                            color: '#22c55e',
                                            fontWeight: 600
                                        }}>
                                            v{pkg.version}
                                        </span>
                                    </div>

                                    {pkg.description && (
                                        <p style={{
                                            color: 'var(--text-muted)', fontSize: '0.8rem',
                                            margin: '0 0 0.375rem 0',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                            {pkg.description}
                                        </p>
                                    )}

                                    <div className="text-mono" style={{
                                        fontSize: '0.7rem', color: 'var(--text-dim)',
                                        display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap'
                                    }}>
                                        <span>{pkg.fileName} • {formatSize(pkg.fileSize)}</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Clock size={10} /> {formatDate(pkg.uploadedDate)}
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Shield size={10} color="#22c55e" /> SHA-256 verified
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <button
                                        className="btn btn-success"
                                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                                        onClick={() => setDeployPkg(pkg)}
                                        title="Deploy this package"
                                    >
                                        <Rocket size={14} /> Deploy
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-icon"
                                        onClick={() => handleDownload(pkg)}
                                        title="Download"
                                        style={{ padding: '0.4rem' }}
                                    >
                                        <Download size={16} />
                                    </button>
                                    <button
                                        className="btn btn-danger btn-icon"
                                        onClick={() => handleDelete(pkg)}
                                        title="Delete"
                                        style={{ padding: '0.4rem' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Upload Modal */}
            {showUpload && (
                <UploadPackageModal
                    onClose={() => setShowUpload(false)}
                    onUploaded={loadPackages}
                    showToast={showToast}
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

            {/* Deploy Modal (Feature 2) */}
            {deployPkg && (
                <DeployModal
                    pkg={deployPkg}
                    onClose={() => setDeployPkg(null)}
                    onDeployed={loadPackages}
                    showToast={showToast}
                />
            )}
        </>
    );
}
