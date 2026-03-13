import { Wifi, WifiOff, Activity } from 'lucide-react';

/**
 * MCHealthDialog — Machine health details dialog.
 * Shows component versions (Agent, Service, AutoUpdater, LAI) and IPC pipe health.
 * 
 * Used in: Overview page and Generation page when clicking on a machine.
 * 
 * Props: machine data with version + IPC fields from heartbeat.
 */

interface MCHealthData {
    mcId: number;
    lineNumber: number;
    mcNumber: number;
    ipAddress?: string;
    isOnline: boolean;
    lastHeartbeat?: string;
    agentVersion?: string;
    serviceVersion?: string;
    autoUpdaterVersion?: string;
    laiVersion?: string;
    ipcConnected?: boolean;
    ipcLastPingMs?: number;
}

interface MCHealthDialogProps {
    machine: MCHealthData;
    onClose: () => void;
}

export default function MCHealthDialog({ machine, onClose }: MCHealthDialogProps) {

    const ipcIndicator = () => {
        if (!machine.ipcConnected) return { icon: <WifiOff size={14} />, color: 'var(--error)', label: 'Disconnected' };
        if ((machine.ipcLastPingMs ?? 0) >= 200) return { icon: <Activity size={14} />, color: 'var(--warning)', label: `Slow (${machine.ipcLastPingMs}ms)` };
        return { icon: <Wifi size={14} />, color: 'var(--success)', label: `Connected (${machine.ipcLastPingMs ?? 0}ms)` };
    };

    const ipc = ipcIndicator();

    const versionRow = (label: string, version?: string) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>{label}</span>
            <span style={{ color: 'var(--text)', fontSize: '0.78rem', fontWeight: 600 }}>
                {version ? `v${version}` : '—'}
            </span>
        </div>
    );

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', zIndex: 1000
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
                    width: '380px', maxHeight: '80vh', overflow: 'auto',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '1rem', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>
                            MC #{machine.mcNumber} — Line {machine.lineNumber}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                            {machine.isOnline ? '🟢 Online' : '🔴 Offline'}
                            {machine.ipAddress && ` • ${machine.ipAddress}`}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', color: 'var(--text-dim)',
                            fontSize: '1.2rem', cursor: 'pointer', padding: '0.25rem'
                        }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Software Versions */}
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Software Versions
                        </div>
                        <div style={{
                            background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.5rem 0.75rem'
                        }}>
                            {versionRow('Agent', machine.agentVersion)}
                            {versionRow('Service', machine.serviceVersion)}
                            {versionRow('AutoUpdater', machine.autoUpdaterVersion)}
                            {versionRow('LAI', machine.laiVersion)}
                        </div>
                    </div>

                    {/* IPC Health */}
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            IPC Health (Agent ↔ Service)
                        </div>
                        <div style={{
                            background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.75rem',
                            display: 'flex', alignItems: 'center', gap: '0.75rem'
                        }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '50%',
                                background: `${ipc.color}15`, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', color: ipc.color
                            }}>
                                {ipc.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: ipc.color }}>
                                    {ipc.label}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                                    {machine.ipcConnected
                                        ? 'Named Pipe active — updates can be triggered'
                                        : 'Pipe disconnected — PipeServer may not be running'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Last Heartbeat */}
                    {machine.lastHeartbeat && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                            Last heartbeat: {new Date(machine.lastHeartbeat).toLocaleString()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
