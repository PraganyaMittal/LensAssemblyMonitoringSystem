import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileArchive, Search, Cpu, Package } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import { laiApi } from '../../services/laiApi';
import type { LAIScanResult } from '../../types/updateTypes';

interface Props {
    onClose: () => void;
    onUploaded: () => void;
    showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
    initialTab?: 'Bundle' | 'LAI';
}

type SoftwareType = 'Bundle' | 'LAI';

export function UploadPackageModal({ onClose, onUploaded, showToast, initialTab }: Props) {
    const [softwareType, setSoftwareType] = useState<SoftwareType>(initialTab || 'Bundle');
    const [version, setVersion] = useState('');
    const [description, setDescription] = useState('');

    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [networkPath, setNetworkPath] = useState('');
    const [scanResult, setScanResult] = useState<LAIScanResult | null>(null);
    const [scanning, setScanning] = useState(false);

    const [isUploading, setIsUploading] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            if (!droppedFile.name.toLowerCase().endsWith('.zip')) {
                showToast('Only .zip files are allowed', 'error');
                return;
            }
            setFile(droppedFile);
        }
    }, [showToast]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            if (!selected.name.toLowerCase().endsWith('.zip')) {
                showToast('Only .zip files are allowed', 'error');
                return;
            }
            setFile(selected);
        }
    };

    const handleScan = async () => {
        if (!networkPath.trim()) { showToast('Network path is required.', 'error'); return; }
        setScanResult(null);
        setScanning(true);
        try {
            const result = await laiApi.scanRelease(networkPath.trim());
            setScanResult(result);
            if (result.success && result.version) {
                setVersion(result.version);
                setDescription(result.releaseNotes || '');
            }
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setScanning(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!version) return;

        setIsUploading(true);
        try {
            if (softwareType === 'Bundle') {
                if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                formData.append('packageType', 'Bundle');
                formData.append('version', version);
                if (description) formData.append('description', description);
                await updateApi.uploadPackage(formData);
                showToast('Bundle uploaded successfully!', 'success');
            } else {
                
                if (!scanResult?.version) {
                    showToast('Scan a network path first.', 'error');
                    setIsUploading(false);
                    return;
                }
                await laiApi.registerAndDeploy({
                    networkPath: networkPath.trim(),
                    version: scanResult.version,
                    releaseNotes: description || scanResult.releaseNotes
                });
                showToast(`LAI v${scanResult.version} registered to library!`, 'success');
            }
            onUploaded();
            onClose();
        } catch (err: any) {
            showToast(err.message || 'Upload failed', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    };

    const resetForm = (type: SoftwareType) => {
        setSoftwareType(type);
        setVersion('');
        setDescription('');
        setFile(null);
        setScanResult(null);
        setNetworkPath('');
    };

    const isSubmitDisabled = isUploading
        || !version
        || (softwareType === 'Bundle' && !file)
        || (softwareType === 'LAI' && !scanResult?.success);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                {}
                <div className="modal-header" style={{ padding: '0.5rem 0.625rem' }}>
                    <h3 style={{ fontSize: '0.95rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Upload size={16} color="var(--primary)" />
                        Add to Software Library
                    </h3>
                    <button onClick={onClose} className="btn btn-secondary btn-icon"><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    {}
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
                        {(['Bundle', 'LAI'] as SoftwareType[]).map(type => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => resetForm(type)}
                                style={{
                                    flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px',
                                    border: `1px solid ${softwareType === type ? 'var(--primary)' : 'var(--border)'}`,
                                    background: softwareType === type ? 'rgba(99,102,241,0.1)' : 'var(--bg-secondary)',
                                    color: softwareType === type ? 'var(--primary)' : 'var(--text-dim)',
                                    fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {type === 'Bundle' ? <Package size={13} /> : <Cpu size={13} />}
                                {type}
                            </button>
                        ))}
                    </div>

                    {}
                    {softwareType === 'Bundle' && (
                        <>
                            <div style={{
                                marginBottom: '0.75rem', padding: '0.5rem 0.65rem',
                                borderRadius: '6px', background: 'rgba(99,102,241,0.06)',
                                border: '1px solid rgba(99,102,241,0.15)',
                                fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5
                            }}>
                                <strong style={{ color: 'var(--primary)' }}>Bundle Format:</strong> Upload a <code>.zip</code> containing:
                                <div style={{ marginTop: '0.2rem', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                                    LAI/ &nbsp;·&nbsp; FactoryService/ &nbsp;·&nbsp; FactoryAgent/ &nbsp;·&nbsp; AutoUpdater/
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch' }}>
                                {}
                                <div style={{ flex: '7', display: 'flex', flexDirection: 'column' }}>
                                    {}
                                    <div style={{ marginBottom: '0.6rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            Version *
                                        </label>
                                        <input className="input-field" value={version} onChange={e => setVersion(e.target.value)}
                                            placeholder="e.g., 4.2.1" required style={{ fontSize: '0.78rem' }} />
                                    </div>

                                    {}
                                    <div style={{ marginBottom: '0.6rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            Release Notes
                                        </label>
                                        <textarea className="input-field" value={description} onChange={e => setDescription(e.target.value)}
                                            placeholder="What's new in this version..."
                                            rows={2} style={{ resize: 'vertical', fontSize: '0.78rem' }} />
                                    </div>
                                </div>

                                {}
                                <div style={{ flex: '3', display: 'flex', flexDirection: 'column' }}>
                                    {}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: '0.6rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            Package File (.zip) *
                                        </label>
                                        <div
                                            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{
                                                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                border: isDragging ? '2px dashed var(--primary)' : '2px dashed var(--border)',
                                                borderRadius: '6px', padding: '1rem', textAlign: 'center', cursor: 'pointer',
                                                background: isDragging ? 'rgba(99,102,241,0.04)' : 'var(--bg-app)',
                                                transition: 'all 0.2s ease', minHeight: '120px'
                                            }}
                                        >
                                            <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileSelect} style={{ display: 'none' }} />
                                            {file ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                                                    <FileArchive size={24} color="var(--success)" />
                                                    <span style={{ fontWeight: 500, fontSize: '0.78rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>{file.name}</span>
                                                    <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>({formatSize(file.size)})</span>
                                                    <button type="button" onClick={e => { e.stopPropagation(); setFile(null); }}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '0.1rem', marginTop: '0.3rem' }}>
                                                        <X size={14} /> Remove
                                                    </button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <FileArchive size={28} color="var(--text-dim)" style={{ marginBottom: '0.5rem' }} />
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.4 }}>Drag & drop .zip here<br/>or click to browse</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {}
                    {softwareType === 'LAI' && (
                        <>
                            {}
                            <div style={{ marginBottom: '0.6rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                    Network Path *
                                </label>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                    <input className="input-field" value={networkPath}
                                        onChange={e => setNetworkPath(e.target.value)}
                                        placeholder="\\ipaddress\share\LAI-Release"
                                        style={{ flex: 1, fontSize: '0.78rem' }} />
                                    <button type="button" onClick={handleScan} disabled={scanning}
                                        className="btn btn-primary"
                                        style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem', whiteSpace: 'nowrap' }}>
                                        <Search size={12} /> {scanning ? 'Scanning...' : 'Scan'}
                                    </button>
                                </div>
                            </div>

                            {}
                            {scanResult && (
                                <div style={{
                                    marginBottom: '0.6rem', padding: '0.5rem 0.65rem',
                                    borderRadius: '6px',
                                    border: `1px solid ${scanResult.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                    background: scanResult.success ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                                    fontSize: '0.72rem'
                                }}>
                                    {scanResult.success ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--success)' }}>✓ Metadata found</div>
                                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                Version: <strong>{scanResult.version}</strong>
                                            </div>
                                            {scanResult.fileSizeBytes && (
                                                <div style={{ color: 'var(--text-dim)', fontSize: '0.65rem' }}>
                                                    Size: {formatSize(scanResult.fileSizeBytes)}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--error)' }}>✗ {scanResult.errorMessage}</div>
                                    )}
                                </div>
                            )}

                            {}
                            {scanResult?.success && (
                                <>
                                    <div style={{ marginBottom: '0.6rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            Version
                                        </label>
                                        <input className="input-field" value={version} readOnly
                                            style={{ fontSize: '0.78rem', opacity: 0.7 }} />
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    <button type="submit" className="btn btn-primary"
                        style={{ width: '100%', fontSize: '0.8rem' }}
                        disabled={isSubmitDisabled}>
                        {isUploading ? 'Processing...'
                            : softwareType === 'Bundle' ? 'Upload Bundle' : 'Register LAI Package'}
                    </button>
                </form>
            </div>
        </div>
    );
}
