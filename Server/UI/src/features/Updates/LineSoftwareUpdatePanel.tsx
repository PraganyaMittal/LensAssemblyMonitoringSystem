import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Rocket, CheckCircle, XCircle, Clock, AlertTriangle,
    ChevronDown, ChevronUp, Undo2, Ban, RefreshCw, X, Wifi, WifiOff, Lock
} from 'lucide-react';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import { updateApi } from '../../services/updateApi';
import { factoryApi } from '../../services/api';
import type {
    UpdatePackage, UpdateSchedule, ScheduleDetailResponse,
    CreateScheduleRequest
} from '../../types/updateTypes';

interface Props {
    lineNumber: number;
    version?: string;
    onClose: () => void;
}

const DEPLOY_PHASES = ['Queued', 'Dispatched', 'Downloading', 'Installing', 'Completed'] as const;
const ROLLBACK_PHASES = ['Queued', 'Dispatched', 'Installing', 'Completed'] as const;

function PhaseStepperInline({ status, isRollback }: { status: string; isRollback?: boolean }) {
    const isFailed = status === 'Failed';
    const isBlocked = status === 'Blocked';
    const isCancelled = status === 'Cancelled' || status === 'Skipped';

    if (isBlocked || isCancelled) return null;

    const phases = isRollback ? ROLLBACK_PHASES : DEPLOY_PHASES;
    const mappedStatus = isRollback && status === 'Downloading' ? 'Installing' : status;
    const currentIdx = phases.indexOf(mappedStatus as any);
    const activeIdx = isFailed ? -1 : currentIdx;
    const accentColor = isRollback ? 'var(--warning)' : 'var(--primary)';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '3px' }}>
            {phases.map((phase, i) => {
                let bg = 'var(--border)';
                let opacity = 0.4;

                if (isFailed) {
                    if (i <= Math.max(currentIdx, 0)) { bg = 'var(--error)'; opacity = 1; }
                } else if (i < activeIdx) {
                    bg = 'var(--success)'; opacity = 1;
                } else if (i === activeIdx) {
                    bg = status === 'Completed' ? 'var(--success)' : accentColor; opacity = 1;
                }

                return (
                    <div
                        key={phase}
                        title={isRollback && phase === 'Installing' ? 'Restoring' : phase}
                        style={{
                            width: i === activeIdx && status !== 'Completed' ? '16px' : '10px',
                            height: '3px', borderRadius: '2px', background: bg, opacity,
                            transition: 'all 0.3s ease',
                        }}
                    />
                );
            })}
        </div>
    );
}

export default function LineSoftwareUpdateModal({ lineNumber, version, onClose }: Props) {

    // Deploy form state
    const [packageType, setPackageType] = useState<'Bundle' | 'LAI'>('Bundle');
    const [packages, setPackages] = useState<UpdatePackage[]>([]);
    const [selectedPkgId, setSelectedPkgId] = useState<number>(0);
    const [deploying, setDeploying] = useState(false);
    const [deployMsg, setDeployMsg] = useState('');
    const [offlineCount, setOfflineCount] = useState(0);

    // History state
    const [historyTab, setHistoryTab] = useState<'Bundle' | 'LAI'>('Bundle');
    const [schedules, setSchedules] = useState<UpdateSchedule[]>([]);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<ScheduleDetailResponse | null>(null);

    // UI state
    const [loading, setLoading] = useState(true);
    const [liveConnected, setLiveConnected] = useState(false);
    const [rollbackPending, setRollbackPending] = useState(false);
    const [rollbackConfirmId, setRollbackConfirmId] = useState<number | null>(null);
    const connectionRef = useRef<HubConnection | null>(null);
    const expandedIdRef = useRef<number | null>(null);

    useEffect(() => { expandedIdRef.current = expandedId; }, [expandedId]);

    // When package type toggle changes, reset selected package
    useEffect(() => { setSelectedPkgId(0); }, [packageType]);

    const refreshDetail = useCallback(async (scheduleId?: number) => {
        const id = scheduleId ?? expandedIdRef.current;
        if (!id) return;
        try { setDetail(await updateApi.getScheduleDetail(id)); } catch { }
    }, []);

    const loadData = useCallback(async (initial = false) => {
        if (initial) setLoading(true);
        try {
            const [pkgRes, schedRes, pcRes] = await Promise.all([
                updateApi.getPackages(undefined, undefined, 1, 50),
                updateApi.getSchedules(undefined, 1, 50),
                factoryApi.getPCs(version, lineNumber)
            ]);
            setPackages(pkgRes.packages);

            const linePCs = pcRes.lines.flatMap(l => l.pcs);
            setOfflineCount(linePCs.filter(p => !p.isOnline).length);

            const lineSchedules = schedRes.schedules.filter(s => {
                if (s.targetType === 'ByLine') {
                    try {
                        const filter = s.targetFilter ? JSON.parse(s.targetFilter) : {};
                        if (filter.LineNumbers?.includes(lineNumber) || filter.lineNumbers?.includes(lineNumber)) {
                            if (version && filter.Version && filter.Version !== version && filter.version !== version) return false;
                            return true;
                        }
                    } catch {
                        if (s.targetFilter === lineNumber.toString()) return true;
                    }
                }
                if (s.targetType === 'All') return true;
                // SelectedMCs rollbacks are always included — they reference original schedule's MCs
                if (s.targetType === 'SelectedMCs' && s.isRollback) return true;
                return false;
            });
            setSchedules(lineSchedules);

            if (expandedIdRef.current) await refreshDetail();
        } catch { }
        if (initial) setLoading(false);
    }, [lineNumber, version, refreshDetail]);

    useEffect(() => { loadData(true); }, [loadData]);

    // SignalR live updates
    useEffect(() => {
        const connection = new HubConnectionBuilder()
            .withUrl('/agentHub')
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
            .configureLogging(LogLevel.Warning)
            .build();

        connectionRef.current = connection;

        connection.on('DeploymentStatusChanged', (data: any) => {
            setDetail(prev => {
                if (!prev || prev.schedule.updateScheduleId !== data.scheduleId) return prev;
                return {
                    ...prev,
                    deployments: prev.deployments.map(d =>
                        d.updateDeploymentId === data.deploymentId
                            ? { ...d, status: data.status, errorMessage: data.errorMessage }
                            : d
                    )
                };
            });
        });

        connection.on('ScheduleStatusChanged', (data: any) => {
            setSchedules(prev => prev.map(s =>
                s.updateScheduleId === data.scheduleId
                    ? { ...s, status: data.status, haltReason: data.haltReason, completedDateUtc: data.completedDateUtc }
                    : s
            ));
            setDetail(prev => {
                if (!prev || prev.schedule.updateScheduleId !== data.scheduleId) return prev;
                return {
                    ...prev,
                    schedule: { ...prev.schedule, status: data.status, haltReason: data.haltReason, completedDateUtc: data.completedDateUtc }
                };
            });
        });

        connection.onreconnected(() => { setLiveConnected(true); loadData(false); });
        connection.onclose(() => setLiveConnected(false));
        connection.start()
            .then(() => setLiveConnected(true))
            .catch(() => setLiveConnected(false));

        return () => { connection.stop().catch(() => {}); };
    }, [loadData]);

    const handleDeploy = async () => {
        if (!selectedPkgId) return;
        setDeploying(true);
        setDeployMsg('');
        try {
            const pkg = packages.find(p => p.updatePackageId === selectedPkgId);
            const request: CreateScheduleRequest = {
                packageId: selectedPkgId,
                scheduleName: `${pkg?.packageType || 'Package'} v${pkg?.version} → Line ${lineNumber}`,
                targetType: 'ByLine',
                targetFilter: JSON.stringify({ LineNumbers: [lineNumber], Version: version || undefined }),
                scheduleType: 'Immediate',
            };
            const result = await updateApi.createSchedule(request);
            setDeployMsg(`Deployed! ${result.targetCount} MC${result.targetCount !== 1 ? 's' : ''} targeted.`);
            setSelectedPkgId(0);
            await loadData(false);
        } catch (e: any) {
            setDeployMsg(`Error: ${e.message}`);
        } finally {
            setDeploying(false);
        }
    };

    const toggleExpand = async (id: number) => {
        if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
        setExpandedId(id);
        try { setDetail(await updateApi.getScheduleDetail(id)); } catch { }
    };

    const handleRollback = async (scheduleId: number) => {
        setRollbackPending(true);
        setRollbackConfirmId(null);
        try {
            const resp = await updateApi.rollbackSchedule(scheduleId);
            setDeployMsg(`Rollback initiated for ${resp.targetCount ?? '?'} machine${(resp.targetCount ?? 0) !== 1 ? 's' : ''}.`);
            await loadData(false);
        } catch (e: any) {
            const msg = e?.response?.data?.message || e.message || 'Unknown error';
            setDeployMsg(`Rollback failed: ${msg}`);
        } finally {
            setRollbackPending(false);
        }
    };

    // ── Rollback eligibility logic ──────────────────────────────────────────
    // Only the single most-recent non-rollback completed deploy (per package type)
    // can be rolled back. All others are locked. Once rolled back, it is also locked.
    const getLatestRollbackableId = (type: 'Bundle' | 'LAI'): number | null => {
        const completed = schedules
            .filter(s => s.packageType === type && !s.isRollback && s.status === 'Completed')
            .sort((a, b) => b.updateScheduleId - a.updateScheduleId);
        if (completed.length === 0) return null;
        const latest = completed[0];
        // Check if a rollback already exists for it
        const hasRollback = schedules.some(
            s => s.isRollback && s.originalScheduleId === latest.updateScheduleId && s.status !== 'Cancelled'
        );
        return hasRollback ? null : latest.updateScheduleId;
    };

    // Derive per-type rollbackable IDs once
    const rollbackableIdBundle = getLatestRollbackableId('Bundle');
    const rollbackableIdLAI = getLatestRollbackableId('LAI');
    const getRollbackableId = (type: 'Bundle' | 'LAI') =>
        type === 'Bundle' ? rollbackableIdBundle : rollbackableIdLAI;

    // ── Helpers ─────────────────────────────────────────────────────────────
    const statusColor = (status: string): string => {
        switch (status) {
            case 'Completed': return 'var(--success)';
            case 'Failed': return 'var(--error)';
            case 'Halted': return 'var(--warning)';
            case 'InProgress': case 'Dispatched': case 'Dispatching':
            case 'Downloading': case 'Installing': return 'var(--primary)';
            default: return 'var(--text-dim)';
        }
    };

    const statusIcon = (status: string, size = 12) => {
        switch (status) {
            case 'Completed': return <CheckCircle size={size} style={{ color: 'var(--success)' }} />;
            case 'Failed': return <XCircle size={size} style={{ color: 'var(--error)' }} />;
            case 'Halted': return <AlertTriangle size={size} style={{ color: 'var(--warning)' }} />;
            case 'InProgress': case 'Dispatched': case 'Dispatching':
            case 'Downloading': case 'Installing':
                return <Clock size={size} style={{ color: 'var(--primary)' }} />;
            case 'Blocked': return <Ban size={size} style={{ color: 'var(--text-dim)' }} />;
            default: return <Clock size={size} style={{ color: 'var(--text-dim)' }} />;
        }
    };

    const statusEmoji: Record<string, string> = {
        Completed: '✅', Failed: '❌', Blocked: '🚫', Queued: '⏸',
        Dispatched: '⏳', Downloading: '⬇️', Installing: '🔧', Skipped: '⏭', Cancelled: '🚫'
    };

    const phaseLabel = (status: string, isRollback?: boolean): string => {
        if (isRollback) {
            switch (status) {
                case 'Queued': return 'Waiting…';
                case 'Dispatched': return 'Dispatched';
                case 'Downloading': return 'Restoring…';
                case 'Installing': return 'Replacing…';
                case 'Completed': return 'Rolled back';
                case 'Failed': return 'Failed';
                case 'Blocked': return 'Blocked';
                default: return status;
            }
        }
        switch (status) {
            case 'Queued': return 'Waiting…';
            case 'Dispatched': return 'Dispatched';
            case 'Downloading': return 'Downloading…';
            case 'Installing': return 'Installing…';
            case 'Completed': return 'Completed';
            case 'Failed': return 'Failed';
            case 'Blocked': return 'Blocked';
            default: return status;
        }
    };

    const filteredSchedules = schedules
        .filter(s => s.packageType === historyTab)
        .slice(0, 8); // cap at 8 entries

    // ── Tab button style helper ──────────────────────────────────────────────
    const tabStyle = (active: boolean): React.CSSProperties => ({
        background: 'none', border: 'none', padding: '0.35rem 0',
        fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
        color: active ? 'var(--primary)' : 'var(--text-dim)',
        borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
        textTransform: 'uppercase', letterSpacing: '0.04em', transition: 'color 0.2s'
    });

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div
                className="modal-content animate-scale-in"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '560px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
            >
                {/* ── Header ── */}
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <RefreshCw size={16} color="var(--primary)" />
                        <div>
                            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
                                Line {lineNumber} — Software Update
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '1px' }}>
                                {version && (
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                        Generation {version}
                                    </span>
                                )}
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                    fontSize: '0.58rem', padding: '1px 5px', borderRadius: '8px',
                                    background: liveConnected ? 'rgba(34,197,94,0.1)' : 'rgba(255,100,100,0.1)',
                                    color: liveConnected ? 'var(--success)' : 'var(--text-dim)',
                                    fontWeight: 600
                                }}>
                                    {liveConnected ? <><Wifi size={8} /> LIVE</> : <><WifiOff size={8} /> POLLING</>}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn btn-secondary btn-icon"><X size={18} /></button>
                </div>

                {/* ── Body ── */}
                <div className="modal-body" style={{ overflowY: 'auto', padding: '0.65rem 0.9rem' }}>
                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                            <div className="editor-loading-spinner" style={{ width: 20, height: 20, margin: '0 auto 0.5rem' }} />
                            Loading...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>

                            {/* ══ SECTION 1: Deploy ══════════════════════════════════════════ */}
                            <div style={{
                                background: 'var(--bg-secondary)', borderRadius: '8px',
                                border: '1px solid var(--border)', padding: '0.55rem 0.7rem'
                            }}>
                                {/* Section label */}
                                <div style={{
                                    fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-dim)',
                                    textTransform: 'uppercase', letterSpacing: '0.06em',
                                    marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem'
                                }}>
                                    <Rocket size={11} style={{ color: 'var(--primary)' }} />
                                    Deploy New Version
                                </div>

                                {/* Radio toggle: Bundle / LAI */}
                                <div style={{ display: 'flex', gap: '0.9rem', marginBottom: '0.45rem' }}>
                                    {(['Bundle', 'LAI'] as const).map(type => (
                                        <label key={type} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                                            fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                                            color: packageType === type ? 'var(--text)' : 'var(--text-dim)'
                                        }}>
                                            <input
                                                type="radio"
                                                name="packageType"
                                                value={type}
                                                checked={packageType === type}
                                                onChange={() => setPackageType(type)}
                                                style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                                            />
                                            {type === 'Bundle' ? 'Bundle Update' : 'LAI Update'}
                                        </label>
                                    ))}
                                </div>

                                {/* Single dropdown (for selected type) + Deploy button */}
                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                    <select
                                        value={selectedPkgId}
                                        onChange={e => setSelectedPkgId(Number(e.target.value))}
                                        style={{
                                            flex: 1, padding: '0.3rem 0.4rem', borderRadius: '5px',
                                            border: '1px solid var(--border)', background: 'var(--card-bg)',
                                            color: 'var(--text)', fontSize: '0.72rem'
                                        }}
                                    >
                                        <option value={0}>Select {packageType} package…</option>
                                        {packages.filter(p => p.packageType === packageType).map(p => (
                                            <option key={p.updatePackageId} value={p.updatePackageId}>
                                                v{p.version}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handleDeploy}
                                        disabled={deploying || !selectedPkgId || offlineCount > 0}
                                        className="btn btn-success"
                                        style={{
                                            fontSize: '0.7rem', padding: '0.28rem 0.65rem',
                                            whiteSpace: 'nowrap', opacity: (deploying || offlineCount > 0) ? 0.55 : 1
                                        }}
                                    >
                                        <Rocket size={11} /> {deploying ? 'Deploying…' : 'Deploy'}
                                    </button>
                                </div>

                                {/* Offline warning */}
                                {offlineCount > 0 && (
                                    <div style={{
                                        marginTop: '0.4rem', fontSize: '0.68rem', padding: '0.3rem 0.5rem',
                                        borderRadius: '4px', display: 'flex', gap: '0.3rem', alignItems: 'flex-start',
                                        color: 'var(--warning)', background: 'rgba(255,165,0,0.07)', border: '1px solid rgba(255,165,0,0.18)'
                                    }}>
                                        <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <span>
                                            <strong>Blocked:</strong> {offlineCount} machine{offlineCount > 1 ? 's' : ''} offline.
                                            All machines must be online to deploy.
                                        </span>
                                    </div>
                                )}

                                {/* Status message */}
                                {deployMsg && (
                                    <div style={{
                                        marginTop: '0.35rem', fontSize: '0.68rem', padding: '0.22rem 0.5rem',
                                        borderRadius: '4px',
                                        color: deployMsg.startsWith('Error') || deployMsg.startsWith('Rollback failed') ? 'var(--error)' : 'var(--success)',
                                        background: deployMsg.startsWith('Error') || deployMsg.startsWith('Rollback failed') ? 'rgba(255,100,100,0.06)' : 'rgba(34,197,94,0.06)'
                                    }}>
                                        {deployMsg}
                                    </div>
                                )}
                            </div>

                            {/* ══ SECTION 2: Deployment History ════════════════════════════════ */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

                                {/* Section header + tab selector */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    borderBottom: '1px solid var(--border)', paddingBottom: '0'
                                }}>
                                    <div style={{
                                        fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-dim)',
                                        textTransform: 'uppercase', letterSpacing: '0.06em',
                                        padding: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.3rem'
                                    }}>
                                        <Clock size={11} /> Deployment History
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.9rem' }}>
                                        <button style={tabStyle(historyTab === 'Bundle')} onClick={() => setHistoryTab('Bundle')}>Bundle</button>
                                        <button style={tabStyle(historyTab === 'LAI')} onClick={() => setHistoryTab('LAI')}>LAI</button>
                                    </div>
                                </div>

                                {/* History list */}
                                {filteredSchedules.length === 0 ? (
                                    <div style={{
                                        padding: '1.2rem', textAlign: 'center', color: 'var(--text-dim)',
                                        fontSize: '0.72rem', border: '2px dashed var(--border)',
                                        borderRadius: '0 0 8px 8px', borderTop: 'none'
                                    }}>
                                        No {historyTab} deployments found for this line.
                                    </div>
                                ) : (
                                    <div style={{
                                        background: 'var(--bg-secondary)', borderRadius: '0 0 8px 8px',
                                        border: '1px solid var(--border)', borderTop: 'none', overflow: 'hidden'
                                    }}>
                                        {filteredSchedules.map((schedule, idx) => {
                                            const isRollbackRow = schedule.isRollback;
                                            const rollbackableId = getRollbackableId(historyTab);
                                            const isRollbackable = !isRollbackRow && schedule.updateScheduleId === rollbackableId;
                                            const hasBeenRolledBack = !isRollbackRow && schedules.some(
                                                s => s.isRollback && s.originalScheduleId === schedule.updateScheduleId && s.status !== 'Cancelled'
                                            );
                                            // A non-rollback deploy that is not the latest rollbackable one
                                            const isLockedDeploy = !isRollbackRow && !isRollbackable && !hasBeenRolledBack;

                                            const rowAccent = isRollbackRow
                                                ? 'rgba(245,158,11,0.55)'  // amber for rollbacks
                                                : 'rgba(34,197,94,0.5)';   // green for deploys

                                            return (
                                                <div
                                                    key={schedule.updateScheduleId}
                                                    style={{
                                                        borderBottom: idx < filteredSchedules.length - 1 ? '1px solid var(--border)' : 'none',
                                                        borderLeft: `3px solid ${rowAccent}`,
                                                        background: isRollbackRow ? 'rgba(245,158,11,0.03)' : 'transparent'
                                                    }}
                                                >
                                                    {/* ── Row header ── */}
                                                    <div
                                                        onClick={() => toggleExpand(schedule.updateScheduleId)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                            padding: '0.38rem 0.6rem', cursor: 'pointer', fontSize: '0.72rem'
                                                        }}
                                                    >
                                                        {/* Status icon */}
                                                        {statusIcon(schedule.status)}

                                                        {/* Name + rollback badge */}
                                                        <span style={{
                                                            fontWeight: 600, color: 'var(--text)', flex: 1,
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                        }}>
                                                            {schedule.scheduleName}
                                                            {isRollbackRow && (
                                                                <span style={{
                                                                    marginLeft: '0.3rem', fontSize: '0.55rem',
                                                                    padding: '1px 4px', background: 'rgba(245,158,11,0.14)',
                                                                    color: 'var(--warning)', borderRadius: '3px', fontWeight: 700
                                                                }}>ROLLBACK</span>
                                                            )}
                                                        </span>

                                                        {/* MC counts */}
                                                        <span style={{
                                                            fontSize: '0.6rem', color: 'var(--text-dim)',
                                                            whiteSpace: 'nowrap', display: 'flex', gap: '0.25rem', alignItems: 'center'
                                                        }}>
                                                            {schedule.totalTargetCount} MC{schedule.totalTargetCount !== 1 ? 's' : ''}
                                                            {(schedule.completedCount ?? 0) > 0 && <span style={{ color: 'var(--success)' }}>{schedule.completedCount}✓</span>}
                                                            {(schedule.failedCount ?? 0) > 0 && <span style={{ color: 'var(--error)' }}>{schedule.failedCount}✕</span>}
                                                        </span>

                                                        {/* Status badge */}
                                                        <span style={{
                                                            fontSize: '0.58rem', padding: '1px 5px', borderRadius: '3px',
                                                            fontWeight: 600, background: `${statusColor(schedule.status)}15`,
                                                            color: statusColor(schedule.status), whiteSpace: 'nowrap'
                                                        }}>
                                                            {isRollbackRow && schedule.status === 'Completed' ? 'Rolled Back' : schedule.status}
                                                        </span>

                                                        {/* ── Rollback action area ── */}
                                                        {!isRollbackRow && (
                                                            isRollbackable ? (
                                                                // Active rollback button — only the latest rollbackable
                                                                rollbackConfirmId === schedule.updateScheduleId ? (
                                                                    <div style={{
                                                                        display: 'flex', alignItems: 'center', gap: '3px',
                                                                        animation: 'fadeIn 0.15s ease'
                                                                    }}>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); handleRollback(schedule.updateScheduleId); }}
                                                                            disabled={rollbackPending}
                                                                            style={{
                                                                                background: 'var(--warning)', border: 'none',
                                                                                borderRadius: '4px', padding: '2px 7px', cursor: rollbackPending ? 'wait' : 'pointer',
                                                                                color: '#fff', fontSize: '0.58rem', fontWeight: 700,
                                                                                opacity: rollbackPending ? 0.6 : 1
                                                                            }}
                                                                        >
                                                                            {rollbackPending ? '…' : 'Confirm'}
                                                                        </button>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); setRollbackConfirmId(null); }}
                                                                            style={{
                                                                                background: 'transparent', border: '1px solid var(--border)',
                                                                                borderRadius: '4px', padding: '2px 5px', cursor: 'pointer',
                                                                                color: 'var(--text-dim)', fontSize: '0.58rem'
                                                                            }}
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); setRollbackConfirmId(schedule.updateScheduleId); }}
                                                                        title="Rollback to previous version"
                                                                        style={{
                                                                            background: 'rgba(245,158,11,0.08)', border: '1px solid var(--warning)',
                                                                            borderRadius: '4px', padding: '2px 6px', cursor: 'pointer',
                                                                            color: 'var(--warning)', fontSize: '0.58rem', fontWeight: 600,
                                                                            display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0
                                                                        }}
                                                                    >
                                                                        <Undo2 size={9} /> Rollback
                                                                    </button>
                                                                )
                                                            ) : hasBeenRolledBack ? (
                                                                // Already rolled back — show dimmed chip
                                                                <span style={{
                                                                    display: 'flex', alignItems: 'center', gap: '2px',
                                                                    fontSize: '0.55rem', color: 'var(--text-dim)',
                                                                    padding: '2px 5px', borderRadius: '4px',
                                                                    border: '1px solid var(--border)', opacity: 0.6, flexShrink: 0
                                                                }}>
                                                                    <Undo2 size={8} /> Rolled Back
                                                                </span>
                                                            ) : isLockedDeploy ? (
                                                                // Older deploy — locked (a newer deploy exists)
                                                                <span
                                                                    title="Rollback only available for the most recent deployment"
                                                                    style={{
                                                                        display: 'flex', alignItems: 'center', gap: '2px',
                                                                        fontSize: '0.55rem', color: 'var(--text-dim)',
                                                                        opacity: 0.45, flexShrink: 0
                                                                    }}
                                                                >
                                                                    <Lock size={9} />
                                                                </span>
                                                            ) : null
                                                        )}

                                                        {/* Expand chevron */}
                                                        {expandedId === schedule.updateScheduleId
                                                            ? <ChevronUp size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                                                            : <ChevronDown size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />}
                                                    </div>

                                                    {/* Halt reason */}
                                                    {schedule.status === 'Halted' && schedule.haltReason && (
                                                        <div style={{
                                                            padding: '0.18rem 0.6rem', background: 'rgba(255,165,0,0.05)',
                                                            color: 'var(--warning)', fontSize: '0.6rem',
                                                            display: 'flex', alignItems: 'center', gap: '0.25rem'
                                                        }}>
                                                            <AlertTriangle size={9} /> {schedule.haltReason}
                                                        </div>
                                                    )}

                                                    {/* ── Expanded deployment details ── */}
                                                    {expandedId === schedule.updateScheduleId && detail && (
                                                        <div style={{
                                                            padding: '0.2rem 0.6rem 0.4rem 1rem',
                                                            background: 'var(--bg-app)'
                                                        }}>
                                                            {/* Column headers */}
                                                            <div style={{
                                                                display: 'flex', gap: '0.5rem',
                                                                padding: '0.25rem 0 0.3rem',
                                                                fontSize: '0.58rem', color: 'var(--text-dim)',
                                                                borderBottom: '1px solid var(--border)', marginBottom: '0.15rem'
                                                            }}>
                                                                <span>MC</span>
                                                                <span style={{ flex: 1 }}>Phase</span>
                                                                <span>Info</span>
                                                            </div>

                                                            {detail.deployments
                                                                .sort((a, b) => (a.executionOrder ?? 0) - (b.executionOrder ?? 0))
                                                                .map(dep => (
                                                                    <div key={dep.updateDeploymentId} style={{
                                                                        display: 'flex', alignItems: 'flex-start', gap: '0.4rem',
                                                                        padding: '0.28rem 0', fontSize: '0.68rem',
                                                                        opacity: dep.status === 'Blocked' ? 0.45 : 1,
                                                                        borderBottom: '1px solid var(--border)',
                                                                        transition: 'opacity 0.3s ease'
                                                                    }}>
                                                                        <span style={{ width: '1.1rem', textAlign: 'center', fontSize: '0.7rem' }}>
                                                                            {statusEmoji[dep.status] ?? '⏸'}
                                                                        </span>
                                                                        <div style={{ width: '3.2rem' }}>
                                                                            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.68rem' }}>
                                                                                MC-{dep.mcNumber ?? dep.mcId}
                                                                            </div>
                                                                            <PhaseStepperInline status={dep.status} isRollback={detail.schedule?.isRollback} />
                                                                        </div>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <span style={{
                                                                                color: statusColor(dep.status),
                                                                                fontWeight: 600, fontSize: '0.62rem'
                                                                            }}>
                                                                                {phaseLabel(dep.status, detail.schedule?.isRollback)}
                                                                            </span>
                                                                            {dep.errorMessage && (
                                                                                <div style={{
                                                                                    color: 'var(--error)', fontSize: '0.57rem',
                                                                                    marginTop: '1px', overflow: 'hidden',
                                                                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                                                }}>
                                                                                    {dep.errorMessage}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', minWidth: '3.5rem' }}>
                                                                            {dep.previousVersion && (
                                                                                <span style={{ fontSize: '0.5rem', color: 'var(--text-dim)', opacity: 0.8 }}>
                                                                                    was v{dep.previousVersion}
                                                                                </span>
                                                                            )}
                                                                            {dep.reportedAgentVersion && (
                                                                                <span style={{ fontSize: '0.5rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.1)', padding: '1px 3px', borderRadius: '3px' }}>
                                                                                    Ag:{dep.reportedAgentVersion}
                                                                                </span>
                                                                            )}
                                                                            {dep.reportedServiceVersion && (
                                                                                <span style={{ fontSize: '0.5rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.1)', padding: '1px 3px', borderRadius: '3px' }}>
                                                                                    Svc:{dep.reportedServiceVersion}
                                                                                </span>
                                                                            )}
                                                                            {dep.attemptCount > 1 && (
                                                                                <span style={{ fontSize: '0.48rem', color: 'var(--warning)', border: '1px solid var(--warning)', borderRadius: '3px', padding: '0px 3px' }}>
                                                                                    Try {dep.attemptCount}/{dep.maxAttempts}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
