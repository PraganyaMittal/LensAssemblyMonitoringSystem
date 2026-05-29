import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Server, Wifi, Play, Download, Settings, Upload, Trash2, RefreshCw, Check, FileText } from 'lucide-react'
import { factoryApi } from '../services/api'
import type { MCDetails } from '../types'
import NotFound from './NotFound'

export default function PCDetailsPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [pc, setPC] = useState<MCDetails | null>(null)
    const [loading, setLoading] = useState(true)

    const [isNotFound, setIsNotFound] = useState(false)

    const [showUploadConfig, setShowUploadConfig] = useState(false)

    const [selectedModel, setSelectedModel] = useState<string>('')
    const [configFile, setConfigFile] = useState<File | null>(null)

    const [isDownloading, setIsDownloading] = useState(false)
    const pollTimer = useRef<number | null>(null)

    const isIdInvalid = !id || !/^\d+$/.test(id);

    useEffect(() => {
        return () => {
            if (pollTimer.current) window.clearTimeout(pollTimer.current)
        }
    }, [])

    useEffect(() => {
        if (!isIdInvalid && id) {
            loadPC(parseInt(id))
        }
    }, [id, isIdInvalid])

    const loadPC = async (mcId: number) => {
        try {
            setLoading(true)
            const data = await factoryApi.getPC(mcId)

            if (!data) {
                setIsNotFound(true)
                return
            }

            setPC(data)
            
            const currentModel = data.availableModels.find(m => m.isCurrentModel)
            if (currentModel) {
                setSelectedModel(currentModel.modelName)
            } else if (data.availableModels.length > 0) {
                setSelectedModel(data.availableModels[0].modelName)
            }
        } catch (err) {
            console.error('Failed to load PC:', err)
            setIsNotFound(true)
        } finally {
            setLoading(false)
        }
    }

    if (isIdInvalid || isNotFound) {
        return <NotFound />
    }

    const handleDeletePC = async () => {
        if (!pc) return
        if (!pc.isOnline) {
            alert('Agent must be online to delete and decommission this MC safely.')
            return
        }

        const confirmMsg = `Delete MC-${pc.mcNumber} (Line ${pc.lineNumber})?\n\n` +
            `IMPACT:\n` +
            `1. The online agent will uninstall the service, agent, and autoupdater.\n` +
            `2. Local Bundle/config/crashes/update/backup files will be removed.\n` +
            `3. LAI and logs will be preserved.\n` +
            `4. This MC cannot reconnect until service setup.exe is run manually and registration is completed again.`

        if (!window.confirm(confirmMsg)) return

        try {
            await factoryApi.deletePC(pc.mcId)
            alert('Delete started. The agent will decommission and exit shortly.')
            navigate('/') 
        } catch (err: any) {
            alert(err.message || 'Failed to Delete MC')
        }
    }

    const handleApplyModel = async () => {
        if (!pc || !selectedModel) {
            alert('Please select a model')
            return
        }
        if (!confirm(`Apply model "${selectedModel}"?`)) return

        try {
            const result = await factoryApi.changeModel(pc.mcId, selectedModel)
            alert(result.message || 'Model change initiated!')
            setTimeout(() => loadPC(pc.mcId), 1000)
        } catch (err: any) {
            alert(err.message || 'Failed to change model')
        }
    }

    const handleDownloadModel = async () => {
        if (!pc || !selectedModel) {
            alert('Please select a model')
            return
        }
        if (!confirm(`Download model "${selectedModel}" from MC to server? This may take a moment.`)) return

        try {
            setIsDownloading(true)
            const result = await factoryApi.downloadModelFromPC(pc.mcId, selectedModel)

            if (result.success && result.commandId) {
                pollDownloadStatus(result.commandId.toString())
            } else {
                alert('Failed to start download command.')
                setIsDownloading(false)
            }
        } catch (err: any) {
            alert(err.message || 'Failed to download model')
            setIsDownloading(false)
        }
    }

    const pollDownloadStatus = async (commandId: string) => {
        try {
            const statusResult = await factoryApi.checkDownloadStatus(commandId.toString())

            if (statusResult.status === 'Completed') {
                const downloadUrl = statusResult.downloadUrl
                const link = document.createElement('a')
                link.href = downloadUrl
                link.download = `${selectedModel}.zip`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)

                setIsDownloading(false)
                alert('Download ready! File is downloading.')
            }
            else if (statusResult.status === 'Failed') {
                setIsDownloading(false)
                alert(`Download failed: ${statusResult.message}`)
            }
            else {
                pollTimer.current = window.setTimeout(() => pollDownloadStatus(commandId), 2000)
            }
        } catch (error) {
            console.error('Polling error', error)
            setIsDownloading(false)
            alert('Error checking download status')
        }
    }

    const handleDeleteModel = async () => {
        if (!pc || !selectedModel) {
            alert('Please select a model')
            return
        }
        const currentModel = pc.availableModels.find(m => m.isCurrentModel)
        if (currentModel && currentModel.modelName === selectedModel) {
            alert('Cannot delete the currently active model!')
            return
        }
        if (!confirm(`⚠️ DELETE model "${selectedModel}"?\\n\\nThis cannot be undone!`)) return

        try {
            const result = await factoryApi.deleteModelFromPC(pc.mcId, selectedModel)
            alert(result.message || 'Model deletion initiated!')
            setTimeout(() => loadPC(pc.mcId), 1000)
        } catch (err: any) {
            alert(err.message || 'Failed to delete model')
        }
    }

    const handleRefreshModels = () => {
        if (pc) {
            loadPC(pc.mcId)
            alert('Models list refreshed!')
        }
    }

    const handleDownloadConfig = async () => {
        if (!pc) return
        try {
            const blob = await factoryApi.downloadConfig(pc.mcId)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `config_Line${pc.lineNumber}_PC${pc.mcNumber}.txt`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
            alert('Config downloaded successfully!')
        } catch (err: any) {
            alert(err.message || 'Failed to download config')
        }
    }

    const handleUploadConfig = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!pc || !configFile) return

        try {
            const result = await factoryApi.uploadConfig(pc.mcId, configFile)
            alert(result.message || 'Config upload initiated!')
            setShowUploadConfig(false)
            setConfigFile(null)
            setTimeout(() => loadPC(pc.mcId), 1000)
        } catch (err: any) {
            alert(err.message || 'Failed to upload config')
        }
    }

    if (loading && !pc) {
        return (
            <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
                <div style={{ textAlign: 'center', color: 'var(--neutral-400)' }}>
                    <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Loading MC Details...</div>
                </div>
            </div>
        )
    }

    const currentModel = pc?.availableModels.find(m => m.isCurrentModel)

    return (
        <>
            {}
            <div className="main-header">
                <div className="header-title-section">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                        <button
                            onClick={() => navigate(-1)}
                            className="btn btn-ghost btn-icon"
                            title="Go Back"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="header-title">
                                Line {pc?.lineNumber} - MC {pc?.mcNumber}
                            </h1>
                            <p className="header-subtitle">{pc?.ipAddress} • Generation {pc?.generationNo}</p>
                        </div>
                    </div>
                </div>

                <div className="header-actions">
                    {}
                    <span className={`badge ${pc?.isOnline ? 'badge-success' : 'badge-danger'}`}>
                        <Wifi size={14} />
                        {pc?.isOnline ? 'Online' : 'Offline'}
                    </span>
                    <span className={`badge ${pc?.isApplicationRunning ? 'badge-success' : 'badge-neutral'}`}>
                        <Play size={14} />
                        {pc?.isApplicationRunning ? 'Running' : 'Stopped'}
                    </span>

                    <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />

                    {}
                    <button
                        disabled
                        className="btn btn-secondary"
                        title="Machine details are read-only"
                    >
                        <FileText size={16} />
                        <span className="hide-mobile">View Machine Details</span>
                    </button>

                    <button
                        onClick={handleDeletePC}
                        className="btn btn-danger"
                        disabled={!pc?.isOnline || pc?.lifecycleState === 'PendingDecommission'}
                        title={!pc?.isOnline ? 'Agent must be online to decommission this MC' : 'Delete and decommission this MC'}
                        style={{ border: '1px solid var(--danger)', opacity: (!pc?.isOnline || pc?.lifecycleState === 'PendingDecommission') ? 0.55 : 1 }}
                    >
                        <Trash2 size={16} />
                        <span className="hide-mobile">Delete</span>
                    </button>
                </div>
            </div>

            {}
            <div className="main-content">
                {}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--spacing-xl)', marginBottom: 'var(--spacing-xl)' }}>
                    {}
                    <div className="info-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                            <div className="icon-box" style={{ background: 'linear-gradient(135deg, var(--primary-700), var(--primary-500))' }}>
                                <Server size={28} color="white" />
                            </div>
                            <h2>MC Information</h2>
                        </div>
                        <table className="info-table">
                            <tbody>
                                <tr>
                                    <td>IP Address</td>
                                    <td><strong>{pc?.ipAddress}</strong></td>
                                </tr>
                                <tr>
                                    <td>Generation</td>
                                    <td><strong>{pc?.generationNo}</strong></td>
                                </tr>
                                <tr>
                                    <td>Registered</td>
                                    <td>{pc?.registeredDate ? new Date(pc.registeredDate).toLocaleString() : '-'}</td>
                                </tr>
                                <tr>
                                    <td>Last Updated</td>
                                    <td>{pc?.lastUpdated ? new Date(pc.lastUpdated).toLocaleString() : '-'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {}
                    <div className="info-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                            <div className="icon-box" style={{ background: 'linear-gradient(135deg, var(--success-600), var(--success-500))' }}>
                                <Settings size={28} color="white" />
                            </div>
                            <h2>File Paths</h2>
                        </div>
                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            <div className="label">CONFIG FILE</div>
                            <div className="path-text">{pc?.configFilePath}</div>
                        </div>
                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            <div className="label">LOG PATH</div>
                            <div className="path-text">{pc?.logFolderPath}</div>
                        </div>
                        <div>
                            <div className="label">MODEL FOLDER</div>
                            <div className="path-text">{pc?.modelFolderPath}</div>
                        </div>
                    </div>
                </div>

                {}
                <div className="section-card">
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--spacing-xl)' }}>
                        Models Management
                    </h2>

                    {}
                    <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                        <label htmlFor="modelSelect" style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--spacing-sm)' }}>
                            Available Models:
                        </label>
                        <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                            <select
                                id="modelSelect"
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="form-select"
                                style={{ flex: 1 }}
                            >
                                {pc?.availableModels.length === 0 && <option value="">No models synced yet</option>}
                                {pc?.availableModels.map(model => (
                                    <option key={model.modelId} value={model.modelName}>
                                        {model.modelName} {model.isCurrentModel ? '(Current)' : ''}
                                    </option>
                                ))}
                            </select>
                            {currentModel && selectedModel === currentModel.modelName && (
                                <span className="badge badge-success" style={{ whiteSpace: 'nowrap' }}>
                                    <Check size={14} />
                                    Active
                                </span>
                            )}
                        </div>
                    </div>

                    {}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                        <button
                            onClick={handleApplyModel}
                            className="btn btn-primary"
                            disabled={!selectedModel || (currentModel && selectedModel === currentModel.modelName) || isDownloading}
                            style={{ width: '100%' }}
                        >
                            <Check size={16} />
                            Apply Model
                        </button>
                        <button
                            onClick={handleDownloadModel}
                            className="btn btn-secondary"
                            disabled={!selectedModel || isDownloading}
                            style={{ width: '100%' }}
                        >
                            {isDownloading ? (
                                <>
                                    <span className="spinner-border spinner-border-sm" style={{ marginRight: '8px' }}></span>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Download size={16} />
                                    Download Model
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleDeleteModel}
                            className="btn btn-danger"
                            disabled={!selectedModel || (currentModel && selectedModel === currentModel.modelName) || isDownloading}
                            style={{ width: '100%' }}
                        >
                            <Trash2 size={16} />
                            Delete Model
                        </button>
                        <button
                            onClick={handleRefreshModels}
                            className="btn btn-secondary"
                            disabled={isDownloading}
                            style={{ width: '100%' }}
                        >
                            <RefreshCw size={16} />
                            Refresh List
                        </button>
                    </div>

                    {currentModel && (
                        <div style={{
                            padding: 'var(--spacing-lg)',
                            background: 'var(--primary-900)',
                            border: '2px solid var(--primary-600)',
                            borderRadius: 'var(--radius-lg)',
                            marginTop: 'var(--spacing-lg)'
                        }}>
                            <div style={{ fontSize: '0.875rem', color: 'var(--neutral-400)', marginBottom: 'var(--spacing-xs)' }}>
                                CURRENT ACTIVE MODEL
                            </div>
                            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--primary-300)', fontFamily: 'monospace' }}>
                                {currentModel.modelName}
                            </div>
                        </div>
                    )}
                </div>

                {}
                <div className="section-card">
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 'var(--spacing-xl)' }}>
                        Configuration File
                    </h2>
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
                            <button onClick={handleDownloadConfig} className="btn btn-primary" style={{ width: '100%' }} disabled={!pc?.isOnline}>
                                <Download size={16} /> {pc?.isOnline ? 'Download Config (On-Demand)' : 'Agent Offline'}
                            </button>
                            <button onClick={() => setShowUploadConfig(true)} className="btn btn-success" style={{ width: '100%' }} disabled={!pc?.isOnline}>
                                <Upload size={16} /> {pc?.isOnline ? 'Upload New Config' : 'Agent Offline'}
                            </button>
                        </div>
                    </>
                </div>
            </div>

            {}
            {showUploadConfig && (
                <div className="modal-overlay" onClick={() => setShowUploadConfig(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>Upload Config File</h2>
                        <p style={{ color: 'var(--neutral-400)', marginBottom: 'var(--spacing-lg)' }}>
                            Upload a config.ini file to replace the current configuration.
                        </p>
                        <form onSubmit={handleUploadConfig}>
                            <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                                <input type="file" accept=".ini,.txt" onChange={(e) => setConfigFile(e.target.files?.[0] || null)} required className="file-input" />
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                                <button type="submit" className="btn btn-success" style={{ flex: 1 }}><Upload size={16} /> Upload</button>
                                <button type="button" onClick={() => { setShowUploadConfig(false); setConfigFile(null); }} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <style>
                {`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 600px) {
            .hide-mobile { display: none; }
        }
        `}
            </style>
        </>
    )
}

