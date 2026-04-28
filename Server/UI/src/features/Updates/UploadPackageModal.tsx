import { useState, useCallback } from 'react';
import { X, Search, Package, Cpu, Shield, FileArchive, CalendarDays, User, HardDrive, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, Lock } from 'lucide-react';
import { scanApi } from '../../services/scanApi';
import type { ScanResult, RegisterPackageRequest } from '../../types/updateTypes';

interface Props {
    onClose: () => void;
    onRegistered: () => void;
    showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
    initialTab?: 'Bundle' | 'LAI';
}

type SoftwareType = 'Bundle' | 'LAI';

export function AddPackageModal({ onClose, onRegistered, showToast, initialTab }: Props) {
    const [softwareType, setSoftwareType] = useState<SoftwareType>(initialTab || 'Bundle');
    const [networkPath, setNetworkPath] = useState('');
    const [shareUsername, setShareUsername] = useState('');
    const [sharePassword, setSharePassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [scanning, setScanning] = useState(false);
    const [registering, setRegistering] = useState(false);

    const resetForm = useCallback((type: SoftwareType) => {
        setSoftwareType(type);
        setNetworkPath('');
        setShareUsername('');
        setSharePassword('');
        setShowPassword(false);
        setScanResult(null);
    }, []);

    const handleScan = async () => {
        if (!networkPath.trim() || !shareUsername.trim() || !sharePassword) {
            showToast('Network path and share credentials are required.', 'error');
            return;
        }
        setScanResult(null);
        setScanning(true);
        try {
            const result = await scanApi.scan(softwareType, networkPath.trim(), shareUsername.trim() || undefined, sharePassword || undefined);
            setScanResult(result);
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setScanning(false);
        }
    };

    const handleRegister = async () => {
        if (!scanResult?.success || !scanResult.version) return;

        setRegistering(true);
        try {
            const request: RegisterPackageRequest = {
                networkPath: networkPath.trim(),
                version: scanResult.version,
                fileName: scanResult.packageName,
                releaseNotes: scanResult.releaseNotes,
                fileHash: scanResult.fileHash,
                fileSizeBytes: scanResult.fileSizeBytes,
                registeredBy: 'Operator',
                shareUsername: shareUsername.trim() || undefined,
                sharePassword: sharePassword || undefined,
            };
            await scanApi.register(softwareType, request);
            showToast(`${softwareType} v${scanResult.version} registered successfully!`, 'success');
            onRegistered();
            onClose();
        } catch (err: any) {
            showToast(err.message || 'Registration failed', 'error');
        } finally {
            setRegistering(false);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    };

    const isBundle = softwareType === 'Bundle';
    const typeColor = isBundle ? 'var(--primary)' : '#f59e0b';
    const typeBg = isBundle ? 'rgba(56, 189, 248, 0.08)' : 'rgba(245, 158, 11, 0.08)';
    const typeBorder = isBundle ? 'rgba(56, 189, 248, 0.2)' : 'rgba(245, 158, 11, 0.2)';

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                {/* Header */}
                <div className="modal-header" style={{ padding: '0.75rem 1rem' }}>
                    <h3 style={{ fontSize: '0.95rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: '8px',
                            background: 'linear-gradient(135deg, var(--primary), #0891b2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Package size={14} color="#fff" />
                        </div>
                        Register Package
                    </h3>
                    <button onClick={onClose} className="btn btn-secondary btn-icon" style={{ width: 28, height: 28, padding: 0 }}>
                        <X size={16} />
                    </button>
                </div>

                <div className="modal-body" style={{ padding: '1rem' }}>
                    {/* Type Selector */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
                        marginBottom: '1rem'
                    }}>
                        {(['Bundle', 'LAI'] as SoftwareType[]).map(type => {
                            const active = softwareType === type;
                            const color = type === 'Bundle' ? 'var(--primary)' : '#f59e0b';
                            const bg = type === 'Bundle' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(245, 158, 11, 0.08)';
                            const border = type === 'Bundle' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(245, 158, 11, 0.3)';
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => resetForm(type)}
                                    style={{
                                        padding: '0.6rem 0.75rem', borderRadius: '10px',
                                        border: active ? `1.5px solid ${border}` : '1.5px solid var(--border)',
                                        background: active ? bg : 'transparent',
                                        color: active ? color : 'var(--text-dim)',
                                        fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {type === 'Bundle' ? <Package size={15} /> : <Cpu size={15} />}
                                    {type === 'Bundle' ? 'Bundle (Agent + Service + Autoupdater)' : 'LAI'}
                                </button>
                            );
                        })}
                    </div>

                    {/* Scan Section */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{
                            display: 'block', marginBottom: '0.4rem', fontSize: '0.72rem',
                            fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                        }}>
                            Shared Network Path
                        </label>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <input
                                className="input-field"
                                value={networkPath}
                                onChange={e => setNetworkPath(e.target.value)}
                                placeholder={`\\\\192.168.0.140\\share\\${isBundle ? 'Bundle' : 'LAI'}-Release`}
                                style={{ flex: 1, fontSize: '0.82rem', fontFamily: 'monospace' }}
                                onKeyDown={e => e.key === 'Enter' && handleScan()}
                            />
                            <button
                                type="button"
                                onClick={handleScan}
                                disabled={scanning || !networkPath.trim() || !shareUsername.trim() || !sharePassword}
                                className="btn btn-primary"
                                style={{
                                    fontSize: '0.78rem', padding: '0.4rem 0.85rem',
                                    whiteSpace: 'nowrap', minWidth: '90px'
                                }}
                            >
                                {scanning ? (
                                    <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Scanning...</>
                                ) : (
                                    <><Search size={13} /> Scan</>
                                )}
                            </button>
                        </div>
                        <p style={{
                            margin: '0.35rem 0 0', fontSize: '0.65rem', color: 'var(--text-dim)',
                            lineHeight: 1.4
                        }}>
                            Point to the folder containing <code style={{
                                background: 'var(--bg-hover)', padding: '1px 4px', borderRadius: '3px',
                                fontSize: '0.62rem'
                            }}>release-info.json</code> and the package <code style={{
                                background: 'var(--bg-hover)', padding: '1px 4px', borderRadius: '3px',
                                fontSize: '0.62rem'
                            }}>.zip</code> file
                        </p>
                    </div>

                    {/* Credentials Section */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{
                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                            marginBottom: '0.4rem', fontSize: '0.72rem',
                            fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                        }}>
                            <Lock size={11} />
                            Share Credentials <span style={{ color: 'var(--danger)', fontSize: '0.65rem' }}>*</span>
                        </label>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <input
                                className="input-field"
                                value={shareUsername}
                                onChange={e => setShareUsername(e.target.value)}
                                placeholder="domain\username"
                                style={{ flex: 1, fontSize: '0.82rem', fontFamily: 'monospace' }}
                                autoComplete="off"
                            />
                            <div style={{ flex: 1, position: 'relative' }}>
                                <input
                                    className="input-field"
                                    type={showPassword ? 'text' : 'password'}
                                    value={sharePassword}
                                    onChange={e => setSharePassword(e.target.value)}
                                    placeholder="Password"
                                    style={{ width: '100%', fontSize: '0.82rem', fontFamily: 'monospace', paddingRight: '2rem' }}
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--text-dim)', padding: '2px',
                                        display: 'flex', alignItems: 'center'
                                    }}
                                    title={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                        </div>
                        <p style={{
                            margin: '0.35rem 0 0', fontSize: '0.65rem', color: 'var(--text-dim)',
                            lineHeight: 1.4
                        }}>
                            Credentials for the network share. Stored encrypted on the server.
                        </p>
                    </div>

                    {/* Scan Result */}
                    {scanResult && (
                        <div style={{
                            borderRadius: '10px', overflow: 'hidden',
                            border: `1px solid ${scanResult.success ? typeBorder : 'rgba(239,68,68,0.3)'}`,
                            marginBottom: '0.75rem',
                            animation: 'fadeIn 0.3s ease-out'
                        }}>
                            {/* Result Header */}
                            <div style={{
                                padding: '0.6rem 0.75rem',
                                background: scanResult.success ? typeBg : 'rgba(239,68,68,0.06)',
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                borderBottom: scanResult.success ? `1px solid ${typeBorder}` : '1px solid rgba(239,68,68,0.15)'
                            }}>
                                {scanResult.success ? (
                                    <CheckCircle2 size={16} color={typeColor} />
                                ) : (
                                    <AlertCircle size={16} color="var(--danger)" />
                                )}
                                <span style={{
                                    fontWeight: 700, fontSize: '0.82rem',
                                    color: scanResult.success ? typeColor : 'var(--danger)'
                                }}>
                                    {scanResult.success ? 'Package Found' : 'Scan Failed'}
                                </span>
                                {scanResult.success && scanResult.version && (
                                    <span style={{
                                        marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700,
                                        padding: '2px 8px', borderRadius: '6px',
                                        background: typeBg, color: typeColor,
                                        border: `1px solid ${typeBorder}`
                                    }}>
                                        v{scanResult.version}
                                    </span>
                                )}
                            </div>

                            {scanResult.success ? (
                                /* Metadata Details */
                                <div style={{ padding: '0.65rem 0.75rem' }}>
                                    <div style={{
                                        display: 'grid', gridTemplateColumns: '1fr 1fr',
                                        gap: '0.5rem 1rem'
                                    }}>
                                        <MetaItem icon={<FileArchive size={12} />} label="Package" value={scanResult.packageName || 'N/A'} />
                                        <MetaItem icon={<HardDrive size={12} />} label="Size" value={scanResult.fileSizeBytes ? formatSize(scanResult.fileSizeBytes) : 'N/A'} />
                                        <MetaItem icon={<CalendarDays size={12} />} label="Build Date" value={scanResult.buildDate || 'N/A'} />
                                        <MetaItem icon={<User size={12} />} label="Verified By" value={scanResult.verifiedBy || 'N/A'} />
                                    </div>
                                    {scanResult.fileHash && (
                                        <div style={{
                                            marginTop: '0.5rem', padding: '0.35rem 0.5rem',
                                            background: 'var(--bg-secondary)', borderRadius: '6px',
                                            display: 'flex', alignItems: 'center', gap: '0.4rem'
                                        }}>
                                            <Shield size={11} color="var(--success)" style={{ flexShrink: 0 }} />
                                            <span style={{
                                                fontSize: '0.6rem', fontFamily: 'monospace',
                                                color: 'var(--text-dim)', wordBreak: 'break-all'
                                            }}>
                                                SHA-256: {scanResult.fileHash}
                                            </span>
                                        </div>
                                    )}
                                    {scanResult.releaseNotes && (
                                        <div style={{
                                            marginTop: '0.5rem', padding: '0.4rem 0.55rem',
                                            background: 'var(--bg-secondary)', borderRadius: '6px',
                                            fontSize: '0.72rem', color: 'var(--text-muted)',
                                            lineHeight: 1.5, whiteSpace: 'pre-wrap'
                                        }}>
                                            {scanResult.releaseNotes}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{
                                    padding: '0.65rem 0.75rem', fontSize: '0.78rem',
                                    color: 'var(--danger)', lineHeight: 1.5
                                }}>
                                    {scanResult.errorMessage}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Register Button */}
                    <button
                        type="button"
                        onClick={handleRegister}
                        className="btn btn-primary"
                        style={{
                            width: '100%', fontSize: '0.82rem', padding: '0.6rem',
                            marginTop: scanResult ? '0' : '0.5rem'
                        }}
                        disabled={registering || !scanResult?.success}
                    >
                        {registering ? (
                            <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Registering...</>
                        ) : (
                            <><Package size={14} /> Register to Software Library</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* Small helper component for metadata display */
function MetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{label}:</span>
            <span style={{
                fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-main)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
                {value}
            </span>
        </div>
    );
}
