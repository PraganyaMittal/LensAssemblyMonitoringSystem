import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ThumbnailData } from '../../services/thumbnailApi';

interface ThumbnailTooltipProps {
    isVisible: boolean;
    thumbnails: ThumbnailData[];
    dockSide: 'left' | 'right';  // Which side of screen to dock
    onMaximize?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    onClose?: () => void;
}

// Pane dimensions
const PANE_WIDTH = 320;
const IMAGE_SIZE = 280;  // Display size (source is 400x300, scaled down for retina sharpness)

export const ThumbnailTooltip: React.FC<ThumbnailTooltipProps> = ({
    isVisible,
    thumbnails,
    dockSide,
    onMaximize,
    onMouseEnter,
    onMouseLeave,
    onClose
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Reset index when thumbnails change (new operation hovered)
    useEffect(() => {
        if (isVisible) {
            setCurrentIndex(0);
        }
    }, [thumbnails, isVisible]);

    if (!isVisible || thumbnails.length === 0) {
        return null;
    }

    const currentThumb = thumbnails[currentIndex];
    const hasMultiple = thumbnails.length > 1;

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev + 1) % thumbnails.length);
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev - 1 + thumbnails.length) % thumbnails.length);
    };

    // Animation variants for slide-in from edge
    const slideVariants = {
        hidden: {
            x: dockSide === 'left' ? -PANE_WIDTH : PANE_WIDTH,
            opacity: 0
        },
        visible: {
            x: 0,
            opacity: 1,
            transition: { type: 'spring', stiffness: 300, damping: 30 }
        },
        exit: {
            x: dockSide === 'left' ? -PANE_WIDTH : PANE_WIDTH,
            opacity: 0,
            transition: { duration: 0.2 }
        }
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    variants={slideVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    style={{
                        position: 'fixed',
                        top: 0,
                        bottom: 0,
                        [dockSide]: 0,  // Dock to left or right edge
                        width: PANE_WIDTH,
                        zIndex: 9999,
                        pointerEvents: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(15,23,42,0.95) 100%)',
                        borderLeft: dockSide === 'right' ? '1px solid #334155' : 'none',
                        borderRight: dockSide === 'left' ? '1px solid #334155' : 'none',
                        boxShadow: dockSide === 'right'
                            ? '-10px 0 40px rgba(0, 0, 0, 0.5)'
                            : '10px 0 40px rgba(0, 0, 0, 0.5)',
                        backdropFilter: 'blur(12px)'
                    }}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    {/* Close Button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose?.(); }}
                        style={{
                            position: 'absolute',
                            top: '12px',
                            [dockSide === 'left' ? 'right' : 'left']: '12px',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '6px',
                            transition: 'all 0.2s'
                        }}
                        title="Close"
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239,68,68,0.2)';
                            e.currentTarget.style.color = '#ef4444';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                            e.currentTarget.style.color = '#94a3b8';
                        }}
                    >
                        <X size={16} />
                    </button>

                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            padding: '16px'
                        }}
                    >
                        {/* Header: Filename + Maximize */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{
                                fontSize: '12px',
                                color: '#94a3b8',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '220px',
                                fontFamily: 'JetBrains Mono, monospace'
                            }}>
                                {currentThumb.filename}
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onMaximize?.(); }}
                                style={{
                                    background: 'rgba(96,165,250,0.1)',
                                    border: '1px solid rgba(96,165,250,0.3)',
                                    color: '#60a5fa',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '6px',
                                    transition: 'all 0.2s'
                                }}
                                title="View Full Size"
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(96,165,250,0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(96,165,250,0.1)';
                                }}
                            >
                                <Maximize2 size={16} />
                            </button>
                        </div>

                        {/* Image Container */}
                        <div
                            style={{
                                width: IMAGE_SIZE,
                                height: IMAGE_SIZE,
                                background: '#000',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid #1e293b',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
                            }}
                        >
                            {/* Image - 2x source scaled down for retina sharpness */}
                            <img
                                src={`data:image/jpeg;base64,${currentThumb.data}`}
                                alt={currentThumb.filename}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    // CSS will scale down 400x300 source to fit 280x280 container
                                    // This gives retina-quality sharpness
                                }}
                            />

                            {/* Carousel Controls (Overlay) */}
                            {hasMultiple && (
                                <>
                                    <button
                                        onClick={handlePrev}
                                        style={{
                                            position: 'absolute',
                                            left: '8px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'rgba(0,0,0,0.7)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: '#fff',
                                            borderRadius: '50%',
                                            width: '36px',
                                            height: '36px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            backdropFilter: 'blur(4px)',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(96,165,250,0.8)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(0,0,0,0.7)';
                                        }}
                                    >
                                        <ChevronLeft size={22} />
                                    </button>
                                    <button
                                        onClick={handleNext}
                                        style={{
                                            position: 'absolute',
                                            right: '8px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'rgba(0,0,0,0.7)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: '#fff',
                                            borderRadius: '50%',
                                            width: '36px',
                                            height: '36px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            backdropFilter: 'blur(4px)',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(96,165,250,0.8)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(0,0,0,0.7)';
                                        }}
                                    >
                                        <ChevronRight size={22} />
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Footer: Counter + Operation Info */}
                        <div style={{ textAlign: 'center' }}>
                            {hasMultiple && (
                                <div style={{
                                    fontSize: '12px',
                                    color: '#64748b',
                                    fontWeight: 600,
                                    marginBottom: '4px'
                                }}>
                                    {currentIndex + 1} / {thumbnails.length}
                                </div>
                            )}
                            <div style={{
                                fontSize: '10px',
                                color: '#475569',
                                fontFamily: 'Inter, sans-serif'
                            }}>
                                Click maximize for full resolution
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ThumbnailTooltip;
