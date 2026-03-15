import { useEffect, useState, useMemo } from 'react';
import { Download, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LogFileContent } from '../../types/logTypes';

interface Props {
    fileContent: LogFileContent;
    onClose: () => void;
    onVisualize: () => void;
    onDownload: () => void;
    analyzing: boolean;
    downloading: boolean;
}

export default function LogFileViewerModal({
    fileContent,
    onClose,
    onVisualize,
    onDownload,
    analyzing,
    downloading
}: Props) {
    const [showEscTooltip, setShowEscTooltip] = useState(false);

    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    
    
    const displayName = useMemo(() => {
        const fileName = fileContent.fileName;
        
        const match = fileName.match(/^\d{8}(\d{2})_.*\.log$/i);

        if (match) {
            
            return `${match[1]}:00.log`;
        }
        return fileName; 
    }, [fileContent.fileName]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="modal-content"
                style={{
                    maxWidth: '90vw',
                    width: '90vw',
                    maxHeight: '90vh',
                    height: '90vh',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header" style={{
                    borderBottom: '2px solid var(--border)',
                    background: 'var(--bg-panel)'
                }}>
                    <div>
                        <h2 style={{
                            fontSize: '1.25rem',
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #60a5fa, #4ade80)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            margin: 0
                        }}>
                            {displayName} {}
                        </h2>
                        {}
                        <div className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {fileContent.fileName}
                        </div>
                    </div>

                    {}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={onClose}
                            className="btn btn-secondary"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                paddingLeft: '0.75rem',
                                paddingRight: '0.5rem'
                            }}
                            onMouseEnter={() => setShowEscTooltip(true)}
                            onMouseLeave={() => setShowEscTooltip(false)}
                        >
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dim)' }}>Close</span>
                            <div style={{
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                color: 'var(--text-muted)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                padding: '0 4px',
                                background: 'var(--bg-app)',
                                fontFamily: 'system-ui',
                                height: '18px',
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                ESC
                            </div>
                        </button>

                        <AnimatePresence>
                            {showEscTooltip && (
                                <motion.div
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    style={{
                                        position: 'absolute',
                                        top: '115%',
                                        right: 0,
                                        background: '#1e293b',
                                        border: '1px solid #334155',
                                        color: '#f8fafc',
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        whiteSpace: 'nowrap',
                                        zIndex: 50,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                    }}
                                >
                                    Press <b style={{ color: '#fff' }}>Esc</b> to close
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                        padding: '1rem 1.5rem',
                        borderBottom: '2px solid var(--border)',
                        display: 'flex',
                        gap: '0.75rem',
                        background: 'linear-gradient(180deg, var(--bg-panel), var(--bg-app))',
                        flexWrap: 'wrap',
                        alignItems: 'center'
                    }}>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="btn btn-primary"
                            onClick={onVisualize}
                            disabled={analyzing}
                            style={{
                                background: '#3b82f6',
                                border: '1px solid #2563eb',
                                boxShadow: analyzing ? 'none' : '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
                            }}
                        >
                            <BarChart3 size={18} />
                            {analyzing ? 'Analyzing...' : 'Visualize'}
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="btn btn-secondary"
                            onClick={onDownload}
                            disabled={downloading}
                        >
                            <Download size={18} />
                            {downloading ? 'Downloading...' : 'Download'}
                        </motion.button>

                        <div style={{
                            marginLeft: 'auto',
                            fontSize: '0.85rem',
                            color: 'var(--text-dim)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            whiteSpace: 'nowrap',
                            fontWeight: 600
                        }}>
                            <span style={{
                                padding: '0.25rem 0.75rem',
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border)'
                            }}>
                                Size: {(fileContent.size / 1024).toFixed(2)} KB
                            </span>
                        </div>
                    </div>

                    <pre className="text-mono" style={{
                        margin: 0,
                        padding: '1.5rem',
                        background: 'var(--bg-app)',
                        color: 'var(--text-main)',
                        fontSize: '0.8rem',
                        lineHeight: 1.7,
                        overflowX: 'auto',
                        overflowY: 'auto',
                        flex: 1,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        fontFamily: 'JetBrains Mono, monospace'
                    }}>
                        {fileContent.content}
                    </pre>
                </div>
            </motion.div>
        </motion.div>
    );
}