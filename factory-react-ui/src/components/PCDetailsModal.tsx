import { useEffect, useState, useRef } from 'react'
import { X, FileText, Cpu, Wifi, Activity, FileCode, Trash2, Edit } from 'lucide-react'
import { factoryApi } from '../services/api'
import type { FactoryPC, PCDetails } from '../types'
import { Toast } from './Toast'
import { ConfirmModal } from './ConfirmModal'
import EditPCModal from './EditPCModal'
// 1. Import the OfflineAlertModal
import { OfflineAlertModal } from './OfflineAlertModal'

interface Props {
    pcSummary: FactoryPC
    onClose: () => void
    onPCDeleted?: (version?: string) => void
}

export default function PCDetailsModal({ pcSummary, onClose, onPCDeleted }: Props) {
    const [pc, setPc] = useState<PCDetails | null>(null)
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)

    // UI States
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null)
    const [confirmModal, setConfirmModal] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // 2. Add state for the offline alert
    const [showOfflineEditAlert, setShowOfflineEditAlert] = useState(false)

    const toastTimer = useRef<any>(null)
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        loadData(true)
        const interval = setInterval(() => loadData(false), 3000)
        return () => {
            mounted.current = false
            clearInterval(interval)
        }
    }, [pcSummary.pcId])

    const loadData = async (isInitial: boolean) => {
        if (isInitial) setLoading(true)
        try {
            const data = await factoryApi.getPC(pcSummary.pcId)
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
            const blob = await factoryApi.downloadConfig(pc.pcId)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `config_Line${pc.lineNumber}_PC${pc.pcNumber}.ini`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (err: any) {
            showToast(err.message || 'Failed to download config', 'error')
        }
    }

    const handleDeletePC = () => {
        if (!pc) return
        openConfirm(
            "Delete PC Registration",
            `Are you sure you want to permanently delete PC-${pc.pcNumber} (${pc.ipAddress}) from the database? This will remove all configuration and history. This action cannot be undone.`,
            executeDelete
        )
    }

    const executeDelete = async () => {
        if (!pc) return
        setIsDeleting(true)
        setConfirmModal(null)
        try {
            const result = await factoryApi.deletePC(pc.pcId)

            if (result.isOffline) {
                // Using ConfirmModal as a custom popup for the offline notification
                openConfirm(
                    "Manual Reset Required",
                    "⚠️ PC Deleted from Database successfully.\n\nSince the Agent is currently OFFLINE, you must manually delete the 'agent_config.json' file on the physical device to prevent it from reconnecting.",
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
            showToast(err.message || 'Failed to delete PC', 'error')
            setIsDeleting(false)
        }
    }

    const display = pc || (pcSummary as unknown as PCDetails)
    const activeModel = pc?.availableModels.find(m => m.isCurrentModel)

    // 3. New handler to check offline status before editing
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
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>PC-{display.pcNumber}</h2>
                                <div className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{display.ipAddress}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {!loading && (
                                <>
                                    {/* 4. Updated Button onClick */}
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
                                            <FileCode size={20} color="var(--text-main)" />
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{activeModel?.modelName || 'No model loaded'}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Managed via Line Manager</div>
                                            </div>
                                        </div>
                                        {activeModel && <span className="badge badge-success">Active</span>}
                                    </div>
                                </div>

                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.5rem' }}>Configuration</h3>
                                    <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <FileText size={24} color="var(--text-muted)" />
                                            <div>
                                                <div className="text-mono">config.ini</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                                    Last Modified: {pc?.config ? new Date(pc.config.lastModified).toLocaleDateString() : 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                        <button className="btn btn-secondary" onClick={handleDownloadConfig} disabled={!pc?.config}>Download</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 5. Render OfflineAlertModal */}
            {showOfflineEditAlert && (
                <OfflineAlertModal
                    offlineCandidates={[display]}
                    onCancel={() => setShowOfflineEditAlert(false)}
                    isBlocking={true}
                    actionLabel="Close"
                    customMessage="You cannot edit this PC details as it is offline."
                />
            )}

            {isEditing && (
                <EditPCModal
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