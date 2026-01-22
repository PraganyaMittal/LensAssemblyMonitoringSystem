import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OperationData, InspectionImage } from '../../types/logTypes';
import { logAnalyzerApi } from '../../services/logAnalyzerApi';

interface Props {
    operation: OperationData;
    pcId: number;
    onClose: () => void;
}

export default function InspectionImageViewer({ operation, pcId, onClose }: Props) {
    const [images, setImages] = useState<InspectionImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Fetch images on mount
    useEffect(() => {
        const fetchImages = async () => {
            if (!operation.modelName || !operation.trayId || !operation.inspectionName) {
                setError('Missing inspection metadata');
                setLoading(false);
                return;
            }

            try {
                const response = await logAnalyzerApi.getInspectionImages(pcId, {
                    modelName: operation.modelName,
                    trayId: operation.trayId,
                    barrelId: operation.barrelId,
                    inspectionName: operation.inspectionName
                });

                if (response.images.length === 0) {
                    setError('No NG images found for this inspection');
                } else {
                    setImages(response.images);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load images');
            } finally {
                setLoading(false);
            }
        };

        fetchImages();
    }, [pcId, operation]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    onClose();
                    break;
                case 'ArrowLeft':
                    setCurrentIndex(prev => Math.max(0, prev - 1));
                    break;
                case 'ArrowRight':
                    setCurrentIndex(prev => Math.min(images.length - 1, prev + 1));
                    break;
                case '+':
                case '=':
                    setZoom(prev => Math.min(5, prev + 0.5));
                    break;
                case '-':
                    setZoom(prev => Math.max(0.5, prev - 0.5));
                    break;
                case '0':
                    setZoom(1);
                    setDragOffset({ x: 0, y: 0 });
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, images.length]);

    const handleDownload = useCallback(() => {
        if (images.length === 0) return;
        
        const currentImage = images[currentIndex];
        const link = document.createElement('a');
        link.href = `data:image/bmp;base64,${currentImage.data}`;
        link.download = currentImage.filename || `inspection_${currentIndex + 1}.bmp`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [images, currentIndex]);

    const handleDownloadAll = useCallback(() => {
        images.forEach((img, idx) => {
            const link = document.createElement('a');
            link.href = `data:image/bmp;base64,${img.data}`;
            link.download = img.filename || `inspection_${idx + 1}.bmp`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }, [images]);

    // Clean operation name for display
    const displayName = operation.operationName
        .replace(/^Sequence_/i, '')
        .replace(/_/g, ' ');

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="inspection-image-viewer-overlay"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.95)',
                    zIndex: 10000,
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid #334155',
                    background: '#0f172a'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.25rem' }}>📷</span>
                            <h2 style={{ 
                                margin: 0, 
                                color: '#f8fafc', 
                                fontSize: '1.1rem',
                                fontWeight: 600 
                            }}>
                                {displayName}
                            </h2>
                        </div>
                        
                        <div style={{ 
                            display: 'flex', 
                            gap: '1rem', 
                            color: '#94a3b8',
                            fontSize: '0.875rem'
                        }}>
                            <span>Tray: <b style={{ color: '#f8fafc' }}>{operation.trayId}</b></span>
                            <span>Barrel: <b style={{ color: '#f8fafc' }}>{operation.barrelId}</b></span>
                            <span>Model: <b style={{ color: '#f8fafc' }}>{operation.modelName}</b></span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {/* Zoom controls */}
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            padding: '0.25rem 0.75rem',
                            background: '#1e293b',
                            borderRadius: '6px'
                        }}>
                            <button
                                onClick={() => setZoom(prev => Math.max(0.5, prev - 0.5))}
                                style={zoomButtonStyle}
                            >
                                −
                            </button>
                            <span style={{ color: '#f8fafc', fontSize: '0.875rem', minWidth: '3rem', textAlign: 'center' }}>
                                {Math.round(zoom * 100)}%
                            </span>
                            <button
                                onClick={() => setZoom(prev => Math.min(5, prev + 0.5))}
                                style={zoomButtonStyle}
                            >
                                +
                            </button>
                            <button
                                onClick={() => { setZoom(1); setDragOffset({ x: 0, y: 0 }); }}
                                style={{ ...zoomButtonStyle, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                                Reset
                            </button>
                        </div>

                        {/* Download */}
                        <button
                            onClick={handleDownload}
                            disabled={images.length === 0}
                            style={{
                                padding: '0.5rem 1rem',
                                background: '#3b82f6',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: images.length > 0 ? 'pointer' : 'not-allowed',
                                opacity: images.length > 0 ? 1 : 0.5,
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            ⬇ Download
                        </button>

                        {images.length > 1 && (
                            <button
                                onClick={handleDownloadAll}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: '#1e293b',
                                    color: '#f8fafc',
                                    border: '1px solid #334155',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    fontWeight: 500
                                }}
                            >
                                ⬇ All ({images.length})
                            </button>
                        )}

                        {/* Close */}
                        <button
                            onClick={onClose}
                            style={{
                                padding: '0.5rem',
                                background: 'transparent',
                                color: '#94a3b8',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '1.25rem',
                                lineHeight: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Main Image Area */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative',
                    cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
                }}
                    onMouseDown={() => {
                        if (zoom > 1) {
                            setIsDragging(true);
                        }
                    }}
                    onMouseMove={(e) => {
                        if (isDragging) {
                            setDragOffset(prev => ({
                                x: prev.x + e.movementX,
                                y: prev.y + e.movementY
                            }));
                        }
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                >
                    {loading ? (
                        <div style={{ color: '#94a3b8', fontSize: '1.25rem' }}>
                            <span style={{ marginRight: '0.5rem' }}>⏳</span>
                            Loading images...
                        </div>
                    ) : error ? (
                        <div style={{ 
                            color: '#ef4444', 
                            fontSize: '1.1rem',
                            textAlign: 'center',
                            padding: '2rem'
                        }}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
                            {error}
                        </div>
                    ) : images.length > 0 ? (
                        <motion.img
                            key={currentIndex}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            src={`data:image/bmp;base64,${images[currentIndex].data}`}
                            alt={`Inspection ${currentIndex + 1}`}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain',
                                transform: `scale(${zoom}) translate(${dragOffset.x / zoom}px, ${dragOffset.y / zoom}px)`,
                                transition: isDragging ? 'none' : 'transform 0.2s ease'
                            }}
                            draggable={false}
                        />
                    ) : null}

                    {/* Navigation arrows */}
                    {images.length > 1 && (
                        <>
                            <button
                                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                                disabled={currentIndex === 0}
                                style={{
                                    ...navButtonStyle,
                                    left: '1rem',
                                    opacity: currentIndex === 0 ? 0.3 : 1
                                }}
                            >
                                ◀
                            </button>
                            <button
                                onClick={() => setCurrentIndex(prev => Math.min(images.length - 1, prev + 1))}
                                disabled={currentIndex === images.length - 1}
                                style={{
                                    ...navButtonStyle,
                                    right: '1rem',
                                    opacity: currentIndex === images.length - 1 ? 0.3 : 1
                                }}
                            >
                                ▶
                            </button>
                        </>
                    )}
                </div>

                {/* Thumbnail strip */}
                {images.length > 1 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem',
                        borderTop: '1px solid #334155',
                        background: '#0f172a',
                        overflowX: 'auto'
                    }}>
                        {images.map((img, idx) => (
                            <motion.div
                                key={idx}
                                onClick={() => setCurrentIndex(idx)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{
                                    width: '60px',
                                    height: '45px',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    border: idx === currentIndex ? '2px solid #3b82f6' : '2px solid transparent',
                                    opacity: idx === currentIndex ? 1 : 0.6
                                }}
                            >
                                <img
                                    src={`data:image/bmp;base64,${img.data}`}
                                    alt={`Thumbnail ${idx + 1}`}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover'
                                    }}
                                />
                            </motion.div>
                        ))}
                        <span style={{ 
                            color: '#94a3b8', 
                            fontSize: '0.875rem',
                            marginLeft: '0.5rem'
                        }}>
                            {currentIndex + 1} of {images.length}
                        </span>
                    </div>
                )}

                {/* NG Reason footer */}
                {operation.ngReason && (
                    <div style={{
                        padding: '0.75rem 1.5rem',
                        background: 'rgba(239, 68, 68, 0.15)',
                        borderTop: '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        <span style={{ color: '#ef4444', fontSize: '1.1rem' }}>⚠</span>
                        <span style={{ color: '#fca5a5', fontSize: '0.9rem' }}>
                            <b>NG Reason:</b> {operation.ngReason}
                        </span>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}

const zoomButtonStyle: React.CSSProperties = {
    width: '28px',
    height: '28px',
    background: '#334155',
    color: '#f8fafc',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
};

const navButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '48px',
    height: '48px',
    background: 'rgba(15, 23, 42, 0.8)',
    color: '#f8fafc',
    border: '1px solid #334155',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10
};
