import { useEffect, useState, useRef } from 'react'
import { X, FileText, Cpu, Wifi, FileCode, Trash2, Edit, AlertCircle } from 'lucide-react'
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

    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null)
    const [confirmModal, setConfirmModal] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const [showOfflineEditAlert, setShowOfflineEditAlert] = useState(false)

    const toastTimer = useRef<any>(null)
    const mounted = useRef(true)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                
                if (!isEditing && !confirmModal && !showOfflineEditAlert) {
                    onClose()
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose, isEditing, confirmModal, showOfflineEditAlert])

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
    
    const activeModel = pc?.availableModels?.find(m => m.isCurrentModel)
        || (pc?.currentModel ? { modelName: pc.currentModel.modelName, modelPath: pc.currentModel.modelPath, isCurrentModel: true } : null)
        || (pc?.currentModelFromConfig ? { modelName: pc.currentModelFromConfig, modelPath: '', isCurrentModel: true } : null)

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
                <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '95%' }}>
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
                                        <Edit size={14} /> Edit Machine details
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    
                                    {/* Live Health Status */}
                                    <div>
                                        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Health</h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                            <div className="card" style={{ padding: '0.85rem', display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                                                <Wifi size={20} color={display.isOnline ? 'var(--success)' : 'var(--danger)'} />
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>AGENT STATUS</div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: display.isOnline ? 'var(--success)' : 'var(--danger)' }}>
                                                        {display.isOnline ? 'Online' : 'Offline'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="card" style={{ padding: '0.85rem', display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                                                <Cpu size={20} color={display.isApplicationRunning ? 'var(--success)' : 'var(--text-dim)'} />
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>APP STATE</div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: display.isApplicationRunning ? 'var(--success)' : 'var(--text-dim)' }}>
                                                        {display.isApplicationRunning ? 'Running' : 'Stopped'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Software Identities */}
                                    <div>
                                        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Software Versions</h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                            <div className="card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>BUNDLE VERSION</div>
                                                <div className="text-mono" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-300)' }}>
                                                    {display.agentVersion ? `v${display.agentVersion}` : 'Unknown'}
                                                </div>
                                            </div>
                                            <div className="card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>LAI VERSION</div>
                                                <div className="text-mono" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--success-300)' }}>
                                                    {display.serviceVersion ? `v${display.serviceVersion}` : 'Unknown'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Configuration */}
                                    <div>
                                        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Configuration</h3>
                                        <div className="card" style={{ padding: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                                                <FileText size={20} color={pc?.isOnline ? 'var(--primary)' : 'var(--text-muted)'} />
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                        <div className="text-mono" style={{ fontSize: '0.95rem', fontWeight: 600 }}>{configFileName}</div>
                                                        <div style={{ width: '1px', height: '14px', background: 'var(--border)' }}></div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            <FileCode size={13} color={activeModel ? 'var(--success)' : 'var(--text-dim)'} />
                                                            <span>Model: <span style={{ fontWeight: 600, color: 'var(--text)' }}>{activeModel?.modelName || (pc?.isOnline ? 'Waiting...' : 'Offline')}</span></span>
                                                            {activeModel && <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase' }}>(Active)</span>}
                                                        </div>
                                                    </div>
                                                    {!pc?.isOnline && (
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--warning, #f59e0b)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                                                            <AlertCircle size={10} color="var(--warning, #f59e0b)" />
                                                            <span>Agent Offline - Cannot download</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                className="btn btn-secondary"
                                                onClick={handleDownloadConfig}
                                                disabled={!pc?.isOnline}
                                                title={!pc?.isOnline ? 'Agent is offline' : 'Download config directly from agent'}
                                                style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
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

