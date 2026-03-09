import { useEffect, useState, useRef } from 'react'
import { X, FileText, Cpu, Wifi, Activity, FileCode, Trash2, Edit, RefreshCw, AlertCircle } from 'lucide-react'
import { factoryApi } from '../services/api'
import type { FactoryPC, MCDetails } from '../types'
import { Toast } from './Toast'
import { ConfirmModal } from './ConfirmModal'
import EditMCModal from './EditMCModal'
import { OfflineAlertModal } from './OfflineAlertModal'

interface Props {
    pcSummary: FactoryPC
    onClose: () => void
    onPCDeleted?: (version?: string) => void
}

export default function MCDetailsModal({ pcSummary, onClose, onPCDeleted }: Props) {
    const [pc, setPc] = useState<MCDetails | null>(null)
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)

    // UI States
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null)
    const [confirmModal, setConfirmModal] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)

    // State for the offline alert
    const [showOfflineEditAlert, setShowOfflineEditAlert] = useState(false)

    const toastTimer = useRef<any>(null)
    const mounted = useRef(true)

    // --- NEW: Handle Escape Key ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // Only close this modal if NO child modals are open
                if (!isEditing && !confirmModal && !showOfflineEditAlert) {
                    onClose()
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose, isEditing, confirmModal, showOfflineEditAlert])
    // ------------------------------

    useEffect(() => {
        mounted.current = true
        loadData(true)
        const interval = setInterval(() => loadData(false), 3000)
        return () => {
            mounted.current = false
            clearInterval(interval)
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

    const handleRequestSync = async () => {
        if (!pc) return
        if (!pc.isOnline) {
            showToast('Agent is offline. Cannot request sync.', 'error')
            return
        }
        setIsSyncing(true)
        try {
            const result = await factoryApi.requestSync(pc.mcId)
            showToast(result.message || 'Sync requested. Refreshing in 3s...', 'info')
            // Auto-refresh after 3 seconds to pick up synced data
            setTimeout(() => {
                if (mounted.current) loadData(false)
            }, 3000)
        } catch (err: any) {
            const msg = err?.response?.data?.message || err.message || 'Failed to request sync'
            showToast(msg, 'error')
        } finally {
            setIsSyncing(false)
        }
    }

    const handleDeletePC = () => {
        if (!pc) return
        openConfirm(
            "Delete MC Registration",
            `Are you sure you want to permanently delete MC-${pc.mcNumber} (${pc.ipAddress}) from the database? This will remove all configuration and history. This action cannot be undone.`,
            executeDelete
        )
    }

    const executeDelete = async () => {
        if (!pc) return
        setIsDeleting(true)
        setConfirmModal(null)
        try {
            const result = await factoryApi.deletePC(pc.mcId)

            if (result.isOffline) {
                openConfirm(
                    "Manual Reset Required",
                    "⚠️ MC Deleted from Database successfully.\n\nSince the Agent is currently OFFLINE, you must manually delete the 'agent_config.json' file on the physical device to prevent it from reconnecting.",
                    () => {
                        if (onPCDeleted) onPCDeleted(pc.modelVersion)
                        onClose()
                    }
                )
            } else {
                showToast(result.message, 'success')
                setTimeout(() => {
                    if (onPCDeleted) onPCDeleted(pc.modelVersion)
                    onClose()
                }, 500)
            }
        } catch (err: any) {
            showToast(err.message || 'Failed to Delete MC', 'error')
            setIsDeleting(false)
        }
    }

    const display = pc || (pcSummary as unknown as MCDetails)
    // Prefer availableModels entry, fall back to heartbeat data, then config-parsed model
    const activeModel = pc?.availableModels?.find(m => m.isCurrentModel)
        || (pc?.currentModel ? { modelName: pc.currentModel.modelName, modelPath: pc.currentModel.modelPath, isCurrentModel: true } : null)
        || (pc?.currentModelFromConfig ? { modelName: pc.currentModelFromConfig, modelPath: '', isCurrentModel: true } : null)

    // Config: prefer DB-synced config, fall back to just showing the path if known
    const configFileName = pc?.config
        ? 'config.ini'
        : (pc?.configFilePath ? pc.configFilePath.split(/[\/\\]/).pop() || 'config.ini' : 'config.ini')


    const handleEditClick = () => {
        if (!display.isOnline) {
            setShowOfflineEditAlert(true)
        } else {
            setIsEditing(true)
        }
    }

    return (
        <>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="pulse" style={{ color: display.isOnline ? 'var(--success)' : 'var(--danger)' }} />
                            <div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>MC-{display.mcNumber}</h2>
                                <div className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{display.ipAddress}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {!loading && (
                                <>
                                    <button className="btn btn-secondary" onClick={handleEditClick} style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Edit size={14} /> Edit
                                    </button>
                                    <button className="btn btn-danger" onClick={handleDeletePC} disabled={isDeleting} style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: isDeleting ? 0.6 : 1 }}>
                                        {isDeleting ? <div className="pulse" style={{ width: '12px', height: '12px' }} /> : <Trash2 size={14} />}
                                        {isDeleting ? 'Deleting...' : 'Delete'}
                                    </button>
                                </>
                            )}
                            <button onClick={onClose} className="btn btn-secondary btn-icon"><X size={20} /></button>
                        </div>
                    </div>

                    <div className="modal-body">
                        {loading && !pc ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>Loading system details...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                    <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <Cpu size={24} color={display.isApplicationRunning ? 'var(--success)' : 'var(--text-dim)'} />
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>APP STATE</div>
                                            <div>{display.isApplicationRunning ? 'Running' : 'Stopped'}</div>
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <Activity size={24} color="var(--primary)" />
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>VERSION</div>
                                            <div className="text-mono">{display.modelVersion}</div>
                                        </div>
                                    </div>
                                    <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <Wifi size={24} color={display.isOnline ? 'var(--success)' : 'var(--danger)'} />
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>AGENT</div>
                                            <div>{display.isOnline ? 'Online' : 'Offline'}</div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.5rem' }}>Current Model</h3>
                                    <div className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                            <FileCode size={20} color={activeModel ? 'var(--success)' : 'var(--text-dim)'} />
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{activeModel?.modelName || 'No model loaded'}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {activeModel?.modelPath || (pc?.isOnline ? 'Waiting for agent to sync...' : 'Agent offline — model sync pending')}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            {activeModel && <span className="badge badge-success">Active</span>}
                                            {!activeModel && pc?.isOnline && (
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={handleRequestSync}
                                                    disabled={isSyncing}
                                                    style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                    title="Ask agent to push its model list to the server"
                                                >
                                                    <RefreshCw size={12} className={isSyncing ? 'spin' : ''} />
                                                    {isSyncing ? 'Requesting...' : 'Request Sync'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.5rem' }}>Configuration</h3>
                                    <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <FileText size={24} color={pc?.isOnline ? 'var(--primary)' : 'var(--text-muted)'} />
                                            <div>
                                                <div className="text-mono">{configFileName}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    {!pc?.isOnline && (
                                                        <>
                                                            <AlertCircle size={11} color="var(--warning, #f59e0b)" />
                                                            <span style={{ color: 'var(--warning, #f59e0b)' }}>Agent Offline - Cannot download</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="btn btn-secondary"
                                                onClick={handleDownloadConfig}
                                                disabled={!pc?.isOnline}
                                                title={!pc?.isOnline ? 'Agent is offline' : 'Download config directly from agent'}
                                            >
                                                Download
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showOfflineEditAlert && (
                <OfflineAlertModal
                    offlineCandidates={[display]}
                    onCancel={() => setShowOfflineEditAlert(false)}
                    isBlocking={true}
                    actionLabel="Close"
                    customMessage="You cannot edit this MC details as it is offline."
                />
            )}

            {isEditing && (
                <EditMCModal
                    pc={display}
                    onClose={() => setIsEditing(false)}
                    onSuccess={() => {
                        loadData(false)
                        if (onPCDeleted) onPCDeleted(display.modelVersion)
                    }}
                />
            )}

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



