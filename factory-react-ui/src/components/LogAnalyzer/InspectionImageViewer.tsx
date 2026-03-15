import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OperationData, InspectionImage } from '../../types/logTypes';
import { logAnalyzerApi } from '../../services/logAnalyzerApi';
import { thumbnailApi } from '../../services/thumbnailApi';

interface Props {
    operation: OperationData;
    mcId: number;
    logFilePath?: string;
    onClose: () => void;
}

export default function InspectionImageViewer(props: Props) {
    const { operation, mcId, onClose } = props;
    const [images, setImages] = useState<InspectionImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);

    
    
    
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    const imageContainerRef = useRef<HTMLDivElement>(null);

    
    useEffect(() => {
        const fetchImages = async () => {
            if (!props.logFilePath) {
                
                
                
                setError('Missing log file context for lazy loading');
                setLoading(false);
                return;
            }

            try {
                
                const logFileName = props.logFilePath.split(/[\\/]/).pop() || props.logFilePath;
                
                const thumbs = await thumbnailApi.getThumbnailsForOperation(logFileName, operation.operationName);

                if (thumbs.length === 0) {
                    
                    
                    
                    const request = operation.imagePath
                        ? { imagePath: operation.imagePath, barrelId: operation.barrelId }
                        : {
                            modelName: operation.modelName!,
                            trayId: operation.trayId!,
                            barrelId: operation.barrelId,
                            inspectionName: operation.inspectionName!
                        };
                    const response = await logAnalyzerApi.getInspectionImages(mcId, request);
                    if (response.images.length === 0) {
                        setError('No NG images found');
                    } else {
                        setImages(response.images);
                    }
                } else {
                    
                    const lazyImages: InspectionImage[] = thumbs.map(t => {
                        
                        
                        const rawPath = t.imagePath || '';
                        const folder = rawPath.endsWith('\\') ? rawPath : rawPath + '\\';
                        const fullPath = folder + t.filename;

                        return {
                            filename: t.filename,
                            url: logAnalyzerApi.getSingleImageUrl(mcId, fullPath),
                            
                            
                            data: '' 
                        };
                    });
                    setImages(lazyImages);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load images');
            } finally {
                setLoading(false);
            }
        };

        fetchImages();
    }, [mcId, operation, props.logFilePath]);

    
    useEffect(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, [currentIndex]);

    
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
                    handleZoomIn();
                    break;
                case '-':
                    handleZoomOut();
                    break;
                case '0':
                    handleResetZoom();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, images.length]);

    
    
    
    const handleZoomIn = useCallback(() => {
        setZoom(prev => Math.min(5, prev + 0.5));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoom(prev => {
            const newZoom = Math.max(1, prev - 0.5);
            
            if (newZoom === 1) {
                setPan({ x: 0, y: 0 });
            }
            return newZoom;
        });
    }, []);

    const handleResetZoom = useCallback(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            handleZoomIn();
        } else {
            handleZoomOut();
        }
    }, [handleZoomIn, handleZoomOut]);

    
    
    
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (zoom <= 1) return;
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            panX: pan.x,
            panY: pan.y
        };
    }, [zoom, pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging || zoom <= 1) return;

        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        setPan({
            x: dragStartRef.current.panX + deltaX,
            y: dragStartRef.current.panY + deltaY
        });
    }, [isDragging, zoom]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    
    
    
    const handleDownload = useCallback(async () => {
        if (images.length === 0) return;

        const currentImage = images[currentIndex];
        const link = document.createElement('a');

        if (currentImage.url) {
            
            
            try {
                const response = await fetch(currentImage.url);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                link.href = blobUrl;
                link.download = currentImage.filename || `inspection_${currentIndex + 1}.bmp`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
            } catch (e) {
                console.error("Download failed", e);
            }
        } else {
            
            link.href = `data:image/bmp;base64,${currentImage.data}`;
            link.download = currentImage.filename || `inspection_${currentIndex + 1}.bmp`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, [images, currentIndex]);

    const handleDownloadAll = useCallback(() => {
        images.forEach((img, idx) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = `data:image/bmp;base64,${img.data}`;
                link.download = img.filename || `inspection_${idx + 1}.bmp`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, idx * 100); 
        });
    }, [images]);

    
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
                {}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1.5rem',
                    borderBottom: '1px solid #334155',
                    background: '#0f172a',
                    flexShrink: 0
                }}>
                    {}
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

                    {}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.25rem 0.75rem',
                            background: '#1e293b',
                            borderRadius: '6px'
                        }}>
                            <button
                                onClick={handleZoomOut}
                                style={zoomButtonStyle}
                                title="Zoom Out (−)"
                            >
                                −
                            </button>
                            <span style={{
                                color: '#f8fafc',
                                fontSize: '0.875rem',
                                minWidth: '3rem',
                                textAlign: 'center',
                                fontFamily: 'JetBrains Mono, monospace'
                            }}>
                                {Math.round(zoom * 100)}%
                            </span>
                            <button
                                onClick={handleZoomIn}
                                style={zoomButtonStyle}
                                title="Zoom In (+)"
                            >
                                +
                            </button>
                            <button
                                onClick={handleResetZoom}
                                style={{
                                    ...zoomButtonStyle,
                                    fontSize: '0.7rem',
                                    padding: '0.25rem 0.5rem',
                                    width: 'auto'
                                }}
                                title="Reset (0)"
                            >
                                Reset
                            </button>
                        </div>

                        {}

                        {}
                        <button
                            onClick={handleDownload}
                            disabled={images.length === 0}
                            style={{
                                width: '48px',
                                height: '48px',
                                background: '#3b82f6',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: images.length > 0 ? 'pointer' : 'not-allowed',
                                opacity: images.length > 0 ? 1 : 0.5,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease',
                                padding: 0
                            }}
                            title="Download Current Image"
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M12 3v12M12 15l-4-4M12 15l4-4" />
                                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                            </svg>
                        </button>

                        {}
                        {images.length > 1 && (
                            <button
                                onClick={handleDownloadAll}
                                style={{
                                    minWidth: '48px',
                                    height: '48px',
                                    padding: '0.25rem 0.5rem',
                                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.1rem',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)'
                                }}
                                title={`Download All ${images.length} Images`}
                            >
                                {}
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M12 3v12M12 15l-4-4M12 15l4-4" />
                                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                                </svg>
                                {}
                                <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.02em',
                                    textTransform: 'uppercase'
                                }}>
                                    All
                                </span>
                            </button>
                        )}

                        {}
                        <button
                            onClick={onClose}
                            style={{
                                width: '40px',
                                height: '40px',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '1.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease'
                            }}
                            title="Close (Esc)"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {}
                <div
                    ref={imageContainerRef}
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        position: 'relative',
                        cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                        userSelect: 'none'
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
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
                        <>
                            <motion.img
                                key={currentIndex}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                src={images[currentIndex].url || `data:image/bmp;base64,${images[currentIndex].data}`}
                                alt={`Inspection ${currentIndex + 1}`}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    
                                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                                    transformOrigin: 'center center',
                                    transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                                    pointerEvents: 'none', 
                                    display: error ? 'none' : 'block'
                                }}
                                draggable={false}
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    setError(`Image not found on Factory PC: ${images[currentIndex].filename}`);
                                }}
                            />
                            {error && (
                                <div style={{
                                    color: '#ef4444',
                                    textAlign: 'center',
                                    padding: '2rem',
                                    background: 'rgba(30, 41, 59, 0.5)',
                                    borderRadius: '8px',
                                    border: '1px dashed #ef4444'
                                }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📷🚫</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>Image Not Found</div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                        {images[currentIndex].filename} could not be located on the remote agent.
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}

                    {}
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

                {}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1.5rem',
                    borderTop: '1px solid #334155',
                    background: '#0f172a',
                    flexShrink: 0,
                    gap: '1rem'
                }}>
                    {}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flex: '0 1 auto',
                        overflowX: 'auto',
                        minWidth: 0 
                    }}>
                        {images.length > 1 ? (
                            <>
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
                                            border: idx === currentIndex
                                                ? '2px solid #3b82f6'
                                                : '2px solid transparent',
                                            opacity: idx === currentIndex ? 1 : 0.6,
                                            flexShrink: 0
                                        }}
                                    >
                                        <img
                                            src={img.url || `data:image/bmp;base64,${img.data}`}
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
                                    marginLeft: '0.5rem',
                                    whiteSpace: 'nowrap',
                                    fontFamily: 'JetBrains Mono, monospace'
                                }}>
                                    {currentIndex + 1} of {images.length}
                                </span>
                            </>
                        ) : (
                            <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
                                Single Image
                            </span>
                        )}
                    </div>

                    {}
                    {operation.ngReason && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 1rem',
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            flexShrink: 0
                        }}>
                            <span style={{
                                color: '#ef4444',
                                fontSize: '1rem',
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                ⚠
                            </span>
                            <span style={{
                                color: '#fca5a5',
                                fontSize: '0.875rem',
                                whiteSpace: 'nowrap'
                            }}>
                                <b style={{ color: '#ef4444' }}>NG Reason:</b>{' '}
                                {operation.ngReason}
                            </span>
                        </div>
                    )}
                </div>
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
    justifyContent: 'center',
    transition: 'background 0.15s ease'
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
    zIndex: 10,
    transition: 'all 0.2s ease'
};
