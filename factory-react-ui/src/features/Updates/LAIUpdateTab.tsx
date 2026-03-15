import { useState, useEffect, useCallback } from 'react';
import { Search, Upload, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { laiApi } from '../../services/laiApi';
import { factoryApi } from '../../services/api';
import type { LAIScanResult, LAIRelease } from '../../types/updateTypes';


export default function LAIUpdateTab() {
    const [lines, setLines] = useState<number[]>([]);
    const [selectedLine, setSelectedLine] = useState<number>(0);
    const [networkPath, setNetworkPath] = useState('');
    const [scanResult, setScanResult] = useState<LAIScanResult | null>(null);
    const [releases, setReleases] = useState<LAIRelease[]>([]);
    const [scanning, setScanning] = useState(false);
    const [registering, setRegistering] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    
    useEffect(() => {
        factoryApi.getLines().then(setLines).catch(() => { });
    }, []);

    
    const loadReleases = useCallback(async () => {
        if (selectedLine <= 0) return;
        try {
            const data = await laiApi.getReleasesForLine(selectedLine);
            setReleases(data);
        } catch {  }
    }, [selectedLine]);

    useEffect(() => { loadReleases(); }, [loadReleases]);

    const handleScan = async () => {
        if (!networkPath.trim()) { setError('Network path is required.'); return; }
        setError(''); setScanResult(null); setSuccessMsg('');
        setScanning(true);
        try {
            const result = await laiApi.scanRelease(networkPath.trim());
            setScanResult(result);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setScanning(false);
        }
    };

    const handleRegister = async () => {
        if (!scanResult?.version || !scanResult?.packageName || selectedLine <= 0) return;
        setRegistering(true); setError('');
        try {
            const result = await laiApi.registerAndDeploy({
                networkPath: networkPath.trim(),
                version: scanResult.version,
                packageName: scanResult.packageName,
                releaseNotes: scanResult.releaseNotes,
                targetLineNumber: selectedLine,
            });
            setSuccessMsg(`LAI v${scanResult.version} registered — ${result.targetMCCount} agents will pull from shared path.`);
            setScanResult(null);
            setNetworkPath('');
            loadReleases();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setRegistering(false);
        }
    };

    const statusBadge = (status: string) => {
        const colors: Record<string, { bg: string; color: string }> = {
            Registered: { bg: 'rgba(100,150,255,0.1)', color: 'var(--primary)' },
            Deploying: { bg: 'rgba(255,165,0,0.1)', color: 'var(--warning)' },
            Completed: { bg: 'rgba(50,200,100,0.1)', color: 'var(--success)' },
            Failed: { bg: 'rgba(255,100,100,0.1)', color: 'var(--error)' },
        };
        const c = colors[status] || colors.Registered;
        return (
            <span style={{
                fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px',
                fontWeight: 600, background: c.bg, color: c.color
            }}>
                {status}
            </span>
        );
    };

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    };

    return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {}
            <div style={{
                background: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--border)',
                padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem'
            }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Upload size={16} style={{ color: 'var(--primary)' }} />
                    Register New LAI Release
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: '0 0 120px' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>Target Line</label>
                        <select
                            value={selectedLine}
                            onChange={e => setSelectedLine(Number(e.target.value))}
                            style={{
                                width: '100%', padding: '0.4rem 0.5rem', borderRadius: '6px',
                                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                color: 'var(--text)', fontSize: '0.8rem'
                            }}
                        >
                            <option value={0}>Select...</option>
                            {lines.map(l => <option key={l} value={l}>Line {l}</option>)}
                        </select>
                    </div>

                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>Shared Network Path</label>
                        <input
                            type="text"
                            value={networkPath}
                            onChange={e => setNetworkPath(e.target.value)}
                            placeholder="\\VERIFY-PC\LAI-Releases\v5.0.0"
                            style={{
                                width: '100%', padding: '0.4rem 0.5rem', borderRadius: '6px',
                                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                color: 'var(--text)', fontSize: '0.8rem'
                            }}
                        />
                    </div>

                    <button
                        onClick={handleScan}
                        disabled={scanning || !networkPath.trim()}
                        style={{
                            padding: '0.4rem 1rem', borderRadius: '6px', border: 'none',
                            background: 'var(--primary)', color: '#fff', fontSize: '0.8rem',
                            fontWeight: 600, cursor: 'pointer', opacity: scanning ? 0.6 : 1,
                            display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap'
                        }}
                    >
                        <Search size={14} /> {scanning ? 'Scanning...' : 'Scan'}
                    </button>
                </div>
            </div>

            {}
            {error && (
                <div style={{
                    padding: '0.75rem', background: 'rgba(255,100,100,0.1)', border: '1px solid var(--error)',
                    borderRadius: '8px', color: 'var(--error)', fontSize: '0.8rem'
                }}>
                    <AlertTriangle size={14} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                    {error}
                </div>
            )}
            {successMsg && (
                <div style={{
                    padding: '0.75rem', background: 'rgba(50,200,100,0.1)', border: '1px solid var(--success)',
                    borderRadius: '8px', color: 'var(--success)', fontSize: '0.8rem'
                }}>
                    <CheckCircle size={14} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                    {successMsg}
                </div>
            )}

            {}
            {scanResult && scanResult.success && (
                <div style={{
                    background: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--primary)',
                    padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
                    boxShadow: '0 0 0 1px rgba(100,150,255,0.1)'
                }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={16} style={{ color: 'var(--primary)' }} />
                        Found LAI Release
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.3rem 1rem', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Version:</span>
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{scanResult.version}</span>
                        <span style={{ color: 'var(--text-dim)' }}>Package:</span>
                        <span style={{ color: 'var(--text)' }}>
                            {scanResult.packageName}
                            {scanResult.fileSizeBytes != null && ` (${formatBytes(scanResult.fileSizeBytes)})`}
                        </span>
                        {scanResult.verifiedBy && <>
                            <span style={{ color: 'var(--text-dim)' }}>Verified By:</span>
                            <span style={{ color: 'var(--text)' }}>{scanResult.verifiedBy}</span>
                        </>}
                        {scanResult.buildDate && <>
                            <span style={{ color: 'var(--text-dim)' }}>Build Date:</span>
                            <span style={{ color: 'var(--text)' }}>{new Date(scanResult.buildDate).toLocaleString()}</span>
                        </>}
                    </div>

                    {scanResult.releaseNotes && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                            <strong>Release Notes:</strong><br />
                            {scanResult.releaseNotes}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => setScanResult(null)}
                            style={{
                                padding: '0.4rem 1rem', borderRadius: '6px', border: '1px solid var(--border)',
                                background: 'transparent', color: 'var(--text)', fontSize: '0.8rem', cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleRegister}
                            disabled={registering || selectedLine <= 0}
                            style={{
                                padding: '0.4rem 1.2rem', borderRadius: '6px', border: 'none',
                                background: 'var(--success)', color: '#fff', fontSize: '0.8rem',
                                fontWeight: 600, cursor: 'pointer', opacity: registering ? 0.6 : 1
                            }}
                        >
                            {registering ? 'Registering...' : `Register & Deploy to Line ${selectedLine}`}
                        </button>
                    </div>
                </div>
            )}

            {}
            {selectedLine > 0 && releases.length > 0 && (
                <div style={{
                    background: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--border)',
                    padding: '1rem'
                }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.75rem' }}>
                        LAI Release History — Line {selectedLine}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {releases.map(r => (
                            <div key={r.laiReleaseId} style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                padding: '0.4rem 0', borderBottom: '1px solid var(--border)',
                                fontSize: '0.78rem'
                            }}>
                                <span style={{ fontWeight: 600, color: 'var(--text)', width: '5rem' }}>v{r.version}</span>
                                {statusBadge(r.status)}
                                <span style={{ flex: 1, color: 'var(--text-dim)' }}>{r.packageName}</span>
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                                    {new Date(r.registeredDateUtc).toLocaleDateString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
