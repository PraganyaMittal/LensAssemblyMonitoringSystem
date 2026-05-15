import { useEffect, useState, useRef } from 'react'
import { X, FileText, Cpu, Wifi, FileCode, Trash2, AlertCircle, ArrowLeft } from 'lucide-react'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { factoryApi } from '../services/api'
import type { LensAssemblyPC, MCDetails } from '../types'
import { Toast } from './Toast'
import { ConfirmModal } from './ConfirmModal'

interface Props {
    pcSummary: LensAssemblyPC
    onClose: () => void
    onPCDeleted?: (version?: string) => void
}

export default function MCDetailsModal({ pcSummary, onClose, onPCDeleted }: Props) {
    const [pc, setPc] = useState<MCDetails | null>(null)
    const [loading, setLoading] = useState(true)

    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null)
    const [confirmModal, setConfirmModal] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDetailsView, setShowDetailsView] = useState(false)
    const toastTimer = useRef<any>(null)
    const mounted = useRef(true)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {

                if (!confirmModal) {
                    onClose()
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose, confirmModal])

    useEffect(() => {
        mounted.current = true
        loadData(true)

        // Real-time updates via SignalR — no polling
        const connection = new HubConnectionBuilder()
            .withUrl('/agentHub')
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Warning)
            .build();

        connection.on('McStatusChanged', (update: {
            mcId: number, isOnline: boolean, isApplicationRunning: boolean,
            lastHeartbeat: string, agentVersion?: string, serviceVersion?: string,
            currentModelName?: string | null,
            lifecycleState?: string, lifecycleError?: string | null
        }) => {
            if (update.mcId === pcSummary.mcId && mounted.current) {
                setPc(prev => {
                    if (!prev) return prev
                    const updated = {
                        ...prev,
                        isOnline: update.isOnline,
                        isApplicationRunning: update.isApplicationRunning,
                        lastHeartbeat: update.lastHeartbeat,
                        agentVersion: update.agentVersion ?? prev.agentVersion,
                        serviceVersion: update.serviceVersion ?? prev.serviceVersion,
                        lifecycleState: update.lifecycleState ?? prev.lifecycleState,
                        lifecycleError: update.lifecycleError ?? prev.lifecycleError,
                    }
                    // Update the current model from SignalR push
                    if (update.currentModelName != null) {
                        updated.availableModels = prev.availableModels.map(m => ({
                            ...m,
                            isCurrentModel: m.modelName === update.currentModelName
                        }))
                        if (update.currentModelName === '') {
                            updated.currentModel = null
                        } else {
                            updated.currentModel = { 
                                modelName: update.currentModelName, 
                                modelPath: prev.currentModel?.modelPath ?? '' 
                            }
                        }
                    }
                    return updated
                })
            }
        })

        connection.start().catch(err => console.error('MCDetailsModal SignalR error:', err));

        return () => {
            mounted.current = false
            connection.stop()
        }
    }, [pcSummary.mcId])

    const loadData = async (isInitial: boolean) => {
        if (isInitial) setLoading(true)
        try {
            const data = await factoryApi.getPC(pcSummary.mcId)
            if (mounted.current) {
                setPc(data)
            }
        } catch (err) {
            console.error(err)
        } finally {
            if (isInitial && mounted.current) setLoading(false)
        }
    }

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setToast({ msg, type })
        toastTimer.current = setTimeout(() => setToast(null), 4000)
    }

    const openConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmModal({ title, message, onConfirm })
    }

    const handleDownloadConfig = async () => {
        if (!pc) return
        try {
            const blob = await factoryApi.downloadConfig(pc.mcId)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `config_Line${pc.lineNumber}_MC${pc.mcNumber}.ini`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (err: any) {
            const msg = err?.response?.data?.message || err.message || 'Failed to download config'
            showToast(msg, 'error')
        }
    }

    const handleDeletePC = () => {
        if (!pc) return
        if (!pc.isOnline) {
            showToast('Agent must be online to delete and decommission this MC safely.', 'error')
            return
        }
        openConfirm(
            "Delete and Decommission MC",
            `Delete MC-${pc.mcNumber} (${pc.ipAddress})?\n\nThis will remotely stop and uninstall the service, agent, and autoupdater, then remove local Bundle/config/crashes/update/backup files. LAI and logs will be preserved. This MC cannot reconnect until service setup.exe is run manually and registration is completed again.`,
            executeDelete
        )
    }

    const executeDelete = async () => {
        if (!pc) return
        setIsDeleting(true)
        setConfirmModal(null)
        try {
            const result = await factoryApi.deletePC(pc.mcId)
            showToast(result.message, 'success')
            setTimeout(() => {
                if (onPCDeleted) onPCDeleted(pc.generationNo)
                onClose()
            }, 500)
        } catch (err: any) {
            showToast(err.message || 'Failed to Delete MC', 'error')
            setIsDeleting(false)
        }
    }

    const display = pc || (pcSummary as unknown as MCDetails)

    const activeModel = pc?.availableModels?.find(m => m.isCurrentModel)
        || (pc?.currentModel ? { modelName: pc.currentModel.modelName, modelPath: pc.currentModel.modelPath, isCurrentModel: true } : null)

    const configFileName = pc?.config
        ? 'config.ini'
        : (pc?.configFilePath ? pc.configFilePath.split(/[\/\\]/).pop() || 'config.ini' : 'config.ini')

    const deleteDisabled = isDeleting || !display.isOnline || display.lifecycleState === 'PendingDecommission'
    const deleteTitle = !display.isOnline
        ? 'Agent must be online to uninstall service, agent, autoupdater, and local files'
        : display.lifecycleState === 'PendingDecommission'
            ? 'Delete is already in progress'
            : 'Delete and decommission this MC'

    return (
        <>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '515px', width: '95%', height: '375px', display: 'flex', flexDirection: 'column', animation: 'none', overflow: 'hidden' }}>
                    <div className="modal-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: display.isOnline ? 'var(--success)' : 'var(--danger)' }} />
                            <div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.01em' }}>MC-{display.mcNumber}</h2>
                                <div className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', letterSpacing: '0.02em' }}>{display.ipAddress}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {!loading && (
                                showDetailsView ? (
                                    <button className="btn btn-secondary" onClick={() => setShowDetailsView(false)} style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <ArrowLeft size={14} /> Back
                                    </button>
                                ) : (
                                    <>
                                        <button className="btn btn-secondary" onClick={() => setShowDetailsView(true)} style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <FileText size={14} /> View Machine Details
                                        </button>
                                        <button className="btn btn-danger" onClick={handleDeletePC} disabled={deleteDisabled} title={deleteTitle} style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: deleteDisabled ? 0.55 : 1 }}>
                                            {isDeleting ? <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'currentColor' }} /> : <Trash2 size={14} />}
                                            {isDeleting ? 'Deleting...' : 'Delete'}
                                        </button>
                                    </>
                                )
                            )}
                            <button onClick={onClose} className="btn btn-secondary btn-icon"><X size={20} /></button>
                        </div>
                    </div>

                    <div className="modal-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {loading && !pc ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>Loading system details...</div>
                        ) : showDetailsView ? (
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '0.5rem', overflow: 'hidden' }}>
                                <div className="card no-hover" style={{ padding: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem', transition: 'none' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>GENERATION NO.</div>
                                        <div className="text-mono" style={{ fontSize: '0.9rem', color: 'var(--primary-300)', fontWeight: 700 }}>{display.generationNo || 'Unknown'}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>LINE NO.</div>
                                        <div className="text-mono" style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 500 }}>{display.lineNumber}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>MACHINE NO.</div>
                                        <div className="text-mono" style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 500 }}>{display.mcNumber}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>EXE NAME</div>
                                        <div className="text-mono" style={{ fontSize: '0.9rem', color: 'var(--success-300)', fontWeight: 500 }}>{(display as any).exeName || 'msedge.exe'}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1, overflow: 'hidden' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Paths</div>
                                    <div className="card no-hover" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, transition: 'none', overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>CONFIG PATH</div>
                                            <div className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{display.configFilePath || 'N/A'}</div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>LOG PATH</div>
                                            <div className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{display.logFolderPath || 'N/A'}</div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>MODEL PATH</div>
                                            <div className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', wordBreak: 'break-all' }}>{display.modelFolderPath || 'N/A'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', paddingBottom: '0.2rem' }}>
                                {/* Live Health Status */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Live Health</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div className="card no-hover" style={{ padding: '0.8rem', display: 'flex', gap: '0.8rem', alignItems: 'center', transition: 'none' }}>
                                            <Wifi size={18} color={display.isOnline ? 'var(--success)' : 'var(--danger)'} />
                                            <div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>AGENT STATUS</div>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: display.isOnline ? 'var(--success)' : 'var(--danger)' }}>
                                                    {display.isOnline ? 'Online' : 'Offline'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="card no-hover" style={{ padding: '0.8rem', display: 'flex', gap: '0.8rem', alignItems: 'center', transition: 'none' }}>
                                            <Cpu size={18} color={display.isApplicationRunning ? 'var(--success)' : 'var(--text-dim)'} />
                                            <div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>APP STATE</div>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: display.isApplicationRunning ? 'var(--success)' : 'var(--text-dim)' }}>
                                                    {display.isApplicationRunning ? 'Running' : 'Stopped'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Software Versions */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Software Versions</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div className="card no-hover" style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', transition: 'none' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>BUNDLE VERSION</div>
                                            <div className="text-mono" style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary-300)' }}>
                                                {display.agentVersion ? `v${display.agentVersion}` : 'Unknown'}
                                            </div>
                                        </div>
                                        <div className="card no-hover" style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', transition: 'none' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>LAI VERSION</div>
                                            <div className="text-mono" style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--success-300)' }}>
                                                {display.serviceVersion ? `v${display.serviceVersion}` : 'Unknown'}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Configuration */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Configuration</h3>
                                    <div className="card no-hover" style={{ padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', transition: 'none' }}>
                                        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                                            <FileText size={18} color={pc?.isOnline ? 'var(--primary)' : 'var(--text-muted)'} />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                                    <div className="text-mono" style={{ fontSize: '0.85rem', fontWeight: 600 }}>{configFileName}</div>
                                                    <div style={{ width: '1px', height: '12px', background: 'var(--border)' }}></div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                        <FileCode size={12} color={activeModel ? 'var(--success)' : 'var(--text-dim)'} />
                                                        <span>Model: <span style={{ fontWeight: 600, color: 'var(--text)' }}>{activeModel?.modelName || (pc?.isOnline ? 'Waiting...' : 'Offline')}</span></span>
                                                    </div>
                                                </div>
                                                {!pc?.isOnline && (
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--warning, #f59e0b)', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.1rem' }}>
                                                        <AlertCircle size={9} color="var(--warning, #f59e0b)" />
                                                        <span>Offline - No download</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={handleDownloadConfig}
                                            disabled={!pc?.isOnline || display.lifecycleState === 'PendingDecommission'}
                                            title={!pc?.isOnline ? 'Agent is offline' : 'Download config directly from agent'}
                                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                                        >
                                            Download
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {confirmModal && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal(null)}
                />
            )}
        </>
    )
}

