import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
    Package, Upload, Trash2, Download,
    Plus, AlertCircle, RefreshCw,
    Layers, CheckCircle, AlertTriangle, Box
} from 'lucide-react'
import { factoryApi } from '../../services/api'
import type { LineModel, DefaultModelInfo, LineInfo } from '../../types'
import { LoadingOverlay } from '../../components/LoadingOverlay'
import { Toast } from '../../components/Toast'
import { ConfirmModal } from '../../components/ConfirmModal'
import CreateModelWizard from './CreateModelWizard'

type ConfirmState = { title: string; message: string; onConfirm: () => void; onCancel: () => void }

export default function ModelManagement() {
    const [searchParams, setSearchParams] = useSearchParams()

    // ── State ──
    const [versions, setVersions] = useState<string[]>([])
    const [selectedVersion, setSelectedVersion] = useState<string>(searchParams.get('version') || '')
    const [lines, setLines] = useState<LineInfo[]>([])
    const [selectedLine, setSelectedLine] = useState<number | null>(
        searchParams.get('line') ? parseInt(searchParams.get('line')!) : null
    )
    const [models, setModels] = useState<LineModel[]>([])
    const [defaultModel, setDefaultModel] = useState<DefaultModelInfo | null>(null)

    const [loading, setLoading] = useState(true)
    const [modelsLoading, setModelsLoading] = useState(false)
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)
    const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null)
    const [showWizard, setShowWizard] = useState(false)
    const [wizardBaseModel, setWizardBaseModel] = useState<LineModel | null>(null)
    const [wizardInitialStage, setWizardInitialStage] = useState(0)
    const [uploading, setUploading] = useState(false)

    const toastTimer = useRef<any>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setToast({ msg, type })
        toastTimer.current = setTimeout(() => setToast(null), 4000)
    }

    // ── Upload default model ──
    const handleUploadDefault = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.zip')) {
            showToast('Only ZIP files are accepted', 'error')
            return
        }
        setUploading(true)
        try {
            // Upload to model library
            const result = await factoryApi.uploadModelToLibrary(file, file.name.replace('.zip', ''), 'Default model template')
            // Set as default template
            if (result?.modelFileId) {
                await factoryApi.setDefaultModel(result.modelFileId)
            }
            // Refresh default model info
            const defModel = await factoryApi.getDefaultModel()
            setDefaultModel(defModel)
            showToast('Default model uploaded and set as template', 'success')
        } catch (e: any) {
            showToast(e?.response?.data?.error || e.message || 'Upload failed', 'error')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // ── Load versions ──
    useEffect(() => {
        const load = async () => {
            try {
                const vers = await factoryApi.getVersions()
                setVersions(vers)
                if (!selectedVersion) {
                    if (vers.length > 0) {
                        setSelectedVersion(vers[0])
                    } else {
                        setLoading(false)
                    }
                }
            } catch (e) {
                console.error('Failed to load versions', e)
                setLoading(false)
            }
        }
        load()
    }, [])

    // ── Load lines when version changes ──
    useEffect(() => {
        if (!selectedVersion) return
        const load = async () => {
            setLoading(true)
            try {
                const [lineData, defModel] = await Promise.all([
                    factoryApi.getModelManagementLines(selectedVersion),
                    factoryApi.getDefaultModel()
                ])
                setLines(lineData)
                setDefaultModel(defModel)
                if (lineData.length > 0 && !selectedLine) {
                    setSelectedLine(lineData[0].lineNumber)
                }
            } catch (e: any) {
                console.error('Failed to load lines', e)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [selectedVersion])

    // ── Load models when line changes ──
    const loadModels = useCallback(async () => {
        if (!selectedLine || !selectedVersion) return
        setModelsLoading(true)
        try {
            const data = await factoryApi.getLineModels(selectedLine, selectedVersion)
            setModels(data)
        } catch (e: any) {
            console.error('Failed to load models', e)
        } finally {
            setModelsLoading(false)
        }
    }, [selectedLine, selectedVersion])

    useEffect(() => { loadModels() }, [loadModels])

    // ── Update URL params ──
    useEffect(() => {
        const params: Record<string, string> = {}
        if (selectedVersion) params.version = selectedVersion
        if (selectedLine) params.line = selectedLine.toString()
        setSearchParams(params, { replace: true })
    }, [selectedVersion, selectedLine])

    // ── Handlers ──
    const handleDeleteModel = (modelName: string) => {
        setConfirmModal({
            title: 'Delete Model',
            message: `Are you sure you want to delete "${modelName}" from Line ${selectedLine}? This removes barrel config and all picker assignments. This cannot be undone.`,
            onConfirm: async () => {
                setConfirmModal(null)
                try {
                    await factoryApi.deleteLineModelConfig(selectedLine!, modelName, selectedVersion)
                    showToast(`Model "${modelName}" deleted`, 'success')
                    await loadModels()
                } catch (e: any) {
                    showToast(e.message || 'Delete failed', 'error')
                }
            },
            onCancel: () => setConfirmModal(null)
        })
    }

    const handleCreateFromBase = (model: LineModel | null) => {
        setWizardBaseModel(model)
        setWizardInitialStage(0)
        setShowWizard(true)
    }

    const handleViewModel = (model: LineModel) => {
        setWizardBaseModel(model)
        setWizardInitialStage(5) // Summary stage
        setShowWizard(true)
    }

    const handleWizardComplete = async () => {
        setShowWizard(false)
        setWizardBaseModel(null)
        await loadModels()
        showToast('Model saved to library', 'success')
    }
    // @ts-ignore — will be used when default model upload UI is wired
    const _handleSetDefault = async (modelFileId: number) => {
        try {
            await factoryApi.setDefaultModel(modelFileId)
            const defModel = await factoryApi.getDefaultModel()
            setDefaultModel(defModel)
            showToast('Default model updated', 'success')
        } catch (e: any) {
            showToast(e.message || 'Failed to set default', 'error')
        }
    }

    const getSyncStatusClass = (model: LineModel) => {
        if (!model.lastSyncDate) return 'sync-never'
        const hours = (Date.now() - new Date(model.lastSyncDate).getTime()) / (1000 * 60 * 60)
        if (hours < 1) return 'sync-fresh'
        if (hours < 24) return 'sync-recent'
        return 'sync-stale'
    }

    const getSyncStatusText = (model: LineModel) => {
        if (!model.lastSyncDate) return 'Never synced'
        const date = new Date(model.lastSyncDate)
        const hours = (Date.now() - date.getTime()) / (1000 * 60 * 60)
        if (hours < 1) return `Synced ${Math.round(hours * 60)}m ago`
        if (hours < 24) return `Synced ${Math.round(hours)}h ago`
        return `Synced ${Math.round(hours / 24)}d ago`
    }

    // ── Render ──
    if (showWizard && selectedLine && selectedVersion) {
        return (
            <CreateModelWizard
                lineNumber={selectedLine}
                version={selectedVersion}
                baseModel={wizardBaseModel}
                initialStage={wizardInitialStage}
                onComplete={handleWizardComplete}
                onCancel={() => { setShowWizard(false); setWizardBaseModel(null) }}
            />
        )
    }

    return (
        <div className="mm-container">
            {loading && <LoadingOverlay />}
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            {confirmModal && <ConfirmModal {...confirmModal} />}

            {/* ── Header ── */}
            <div className="mm-header">
                <div className="mm-header-left">
                    <Package size={22} />
                    <h1>Model Library</h1>
                </div>
                <div className="mm-header-right">
                    <button className="mm-btn mm-btn-ghost" onClick={loadModels}>
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {/* ── Generation Tabs ── */}
            <div className="mm-gen-tabs">
                {versions.map(v => (
                    <button
                        key={v}
                        className={`mm-gen-tab ${selectedVersion === v ? 'active' : ''}`}
                        onClick={() => { setSelectedVersion(v); setSelectedLine(null); setModels([]) }}
                    >
                        Gen {v}
                    </button>
                ))}
            </div>

            {/* ── Main Content ── */}
            <div className="mm-content">
                {/* ── Line Sidebar ── */}
                <div className="mm-sidebar">
                    <div className="mm-sidebar-title">Lines</div>
                    {lines.map(line => (
                        <button
                            key={line.lineNumber}
                            className={`mm-line-item ${selectedLine === line.lineNumber ? 'active' : ''}`}
                            onClick={() => { setSelectedLine(line.lineNumber); }}
                        >
                            <span className={`mm-line-dot ${line.modelCount > 0 ? 'has-models' : ''}`} />
                            <span className="mm-line-name">Line {line.lineNumber}</span>
                            <span className="mm-line-badge">
                                {line.onlineCount}/{line.machineCount}
                            </span>
                        </button>
                    ))}
                    {lines.length === 0 && !loading && (
                        <div className="mm-sidebar-empty">
                            No lines found for Gen {selectedVersion}
                        </div>
                    )}
                </div>

                {/* ── Model Panel ── */}
                <div className="mm-panel">
                    {selectedLine ? (
                        <>
                            <div className="mm-panel-title">
                                <Layers size={18} />
                                <span>Line {selectedLine} — Models</span>
                                {modelsLoading && <RefreshCw size={14} className="mm-spin" />}
                            </div>

                            {/* ── Default Model Card ── */}
                            <div className="mm-card mm-card-default">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".zip"
                                    style={{ display: 'none' }}
                                    onChange={e => {
                                        const file = e.target.files?.[0]
                                        if (file) handleUploadDefault(file)
                                    }}
                                />
                                <div className="mm-card-header">
                                    <div className="mm-card-icon default">
                                        <Package size={18} />
                                    </div>
                                    <div className="mm-card-info">
                                        <div className="mm-card-title">Default Model Template</div>
                                        <div className="mm-card-subtitle">
                                            {defaultModel
                                                ? `${defaultModel.modelName} • ${(defaultModel.fileSize / 1024).toFixed(0)} KB`
                                                : 'No default model uploaded yet'}
                                        </div>
                                    </div>
                                    <div className="mm-card-actions">
                                        {defaultModel && (
                                            <>
                                                <button
                                                    className="mm-btn mm-btn-primary mm-btn-sm"
                                                    onClick={() => handleCreateFromBase(null)}
                                                >
                                                    <Plus size={14} /> Create First Model
                                                </button>
                                                <button
                                                    className="mm-btn mm-btn-outline mm-btn-sm"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={uploading}
                                                >
                                                    <Upload size={14} /> Replace
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {!defaultModel && (
                                    <div className="mm-card-body">
                                        <div
                                            className={`mm-upload-zone ${uploading ? 'uploading' : ''}`}
                                            onClick={() => !uploading && fileInputRef.current?.click()}
                                            onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                                            onDrop={e => {
                                                e.preventDefault(); e.stopPropagation()
                                                const file = e.dataTransfer.files?.[0]
                                                if (file) handleUploadDefault(file)
                                            }}
                                        >
                                            {uploading ? (
                                                <>
                                                    <RefreshCw size={24} className="mm-spin" />
                                                    <span>Uploading...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload size={24} />
                                                    <span>Click or drag a DEFAULT_MODEL ZIP here</span>
                                                    <span className="mm-upload-sub">This will be used as the base template for creating line models</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── Line Model Cards ── */}
                            {models.map(model => (
                                <div key={model.modelName} className="mm-card">
                                    {/* Card Header — always visible */}
                                    <div
                                        className="mm-card-header clickable"
                                        onClick={() => handleViewModel(model)}
                                    >
                                        <div className="mm-card-icon model">
                                            <Box size={18} />
                                        </div>
                                        <div className="mm-card-info">
                                            <div className="mm-card-title">{model.modelName}</div>
                                            <div className="mm-card-subtitle">
                                                {model.lensCount}L + {model.spacerCount}SP • MC-1 to MC-{model.machineCount || model.totalMachines}
                                            </div>
                                        </div>
                                        <div className={`mm-sync-badge ${getSyncStatusClass(model)}`}>
                                            {getSyncStatusClass(model) === 'sync-fresh' && <CheckCircle size={12} />}
                                            {getSyncStatusClass(model) === 'sync-stale' && <AlertTriangle size={12} />}
                                            {getSyncStatusClass(model) === 'sync-never' && <AlertCircle size={12} />}
                                            {getSyncStatusText(model)}
                                        </div>
                                        <div className="mm-card-actions" onClick={e => e.stopPropagation()}>
                                            <button
                                                className="mm-btn mm-btn-accent mm-btn-sm"
                                                onClick={() => handleCreateFromBase(model)}
                                                title="Create new model using this as base"
                                            >
                                                <Plus size={14} /> Create New
                                            </button>
                                            <button className="mm-btn mm-btn-ghost mm-btn-sm" title="Download">
                                                <Download size={14} />
                                            </button>
                                            <button
                                                className="mm-btn mm-btn-danger mm-btn-sm"
                                                onClick={() => handleDeleteModel(model.modelName)}
                                                title="Delete model"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {models.length === 0 && !modelsLoading && (
                                <div className="mm-empty-state">
                                    <Box size={48} strokeWidth={1} />
                                    <h3>No models configured</h3>
                                    <p>Upload a default model and click "Create First Model" to get started.</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="mm-empty-state">
                            <Layers size={48} strokeWidth={1} />
                            <h3>Select a line</h3>
                            <p>Choose a line from the sidebar to view and manage its models.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
