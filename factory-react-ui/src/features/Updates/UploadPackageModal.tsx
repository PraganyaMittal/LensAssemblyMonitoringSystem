import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileArchive } from 'lucide-react';
import { updateApi } from '../../services/updateApi';

interface Props {
    onClose: () => void;
    onUploaded: () => void;
    showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function UploadPackageModal({ onClose, onUploaded, showToast }: Props) {
    const [version, setVersion] = useState('');
    const [packageName, setPackageName] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !version || !packageName) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('packageName', packageName);
            formData.append('packageType', 'Bundle');
            formData.append('version', version);
            if (description) formData.append('description', description);

            await updateApi.uploadPackage(formData);
            showToast('Package uploaded successfully!', 'success');
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

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h3 style={{ fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Upload size={18} color="var(--primary)" />
                        Upload Update Bundle
                    </h3>
                    <button onClick={onClose} className="btn btn-secondary btn-icon"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="modal-body">
                    {}
                    <div style={{
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(99, 102, 241, 0.08)',
                        border: '1px solid rgba(99, 102, 241, 0.2)',
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        lineHeight: 1.5
                    }}>
                        <strong style={{ color: 'var(--primary)' }}>Bundle Format:</strong> Upload a <code>.zip</code> containing one or more folders:
                        <div style={{ marginTop: '0.35rem', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                            LAI/ &nbsp;·&nbsp; FactoryService/ &nbsp;·&nbsp; FactoryAgent/ &nbsp;·&nbsp; AutoUpdater/
                        </div>
                    </div>

                    {}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            Version *
                        </label>
                        <input
                            className="input-field"
                            value={version}
                            onChange={e => setVersion(e.target.value)}
                            placeholder="e.g., 4.2.1"
                            required
                        />
                    </div>

                    {}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            Package Name *
                        </label>
                        <input
                            className="input-field"
                            value={packageName}
                            onChange={e => setPackageName(e.target.value)}
                            placeholder="e.g., LAI Update v4.2.1"
                            required
                        />
                    </div>

                    {}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            Package File (.zip) *
                        </label>
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: isDragging ? '2px dashed var(--primary)' : '2px dashed var(--border)',
                                borderRadius: 'var(--radius-md)',
                                padding: '1.5rem',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: isDragging ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-app)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".zip"
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                            />
                            {file ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    <FileArchive size={20} color="var(--success)" />
                                    <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{file.name}</span>
                                    <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>({formatSize(file.size)})</span>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '0.2rem' }}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <FileArchive size={32} color="var(--text-dim)" style={{ marginBottom: '0.5rem' }} />
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        Drag & drop .zip file here
                                    </div>
                                    <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                        or click to browse
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            Release Notes
                        </label>
                        <textarea
                            className="input-field"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="What's new in this version..."
                            rows={3}
                            style={{ resize: 'vertical' }}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        disabled={isUploading || !file || !version || !packageName}
                    >
                        {isUploading ? 'Uploading...' : 'Upload Package'}
                    </button>
                </form>
            </div>
        </div>
    );
}
