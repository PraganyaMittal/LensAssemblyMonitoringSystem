import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, ChevronLeft, ChevronRight } from 'lucide-react';
import { ThumbnailData } from '../../services/thumbnailApi';

interface ThumbnailTooltipProps {
    isVisible: boolean;
    thumbnails: ThumbnailData[];
    position: { x: number; y: number };
    onMaximize?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

export const ThumbnailTooltip: React.FC<ThumbnailTooltipProps> = ({
    isVisible,
    thumbnails,
    position,
    onMaximize,
    onMouseEnter,
    onMouseLeave
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

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                    style={{
                        position: 'fixed',
                        left: position.x,
                        top: position.y,
                        zIndex: 9999,
                        pointerEvents: 'auto' // Critical for interaction
                    }}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    <div
                        style={{
                            background: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '12px',
                            padding: '8px',
                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            width: '280px' // Slightly larger than image for padding
                        }}
                    >
                        {/* Header: Filename + Maximize */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                            <span style={{ fontSize: '12px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>
                                {currentThumb.filename}
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onMaximize?.(); }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#60a5fa',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '4px'
                                }}
                                title="Maximize"
                            >
                                <Maximize2 size={16} />
                            </button>
                        </div>

                        {/* Image Container (Perfect Square) */}
                        <div
                            style={{
                                width: '264px', // 280 - 16 padding
                                height: '264px',
                                background: '#000',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid #1e293b'
                            }}
                        >
                            {/* Image */}
                            <img
                                src={`data:image/jpeg;base64,${currentThumb.data}`}
                                alt={currentThumb.filename}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'cover'
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
                                            background: 'rgba(0,0,0,0.6)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: '#fff',
                                            borderRadius: '50%',
                                            width: '32px',
                                            height: '32px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            backdropFilter: 'blur(4px)'
                                        }}
                                    >
                                        <ChevronLeft size={20} />
                                    </button>
                                    <button
                                        onClick={handleNext}
                                        style={{
                                            position: 'absolute',
                                            right: '8px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'rgba(0,0,0,0.6)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: '#fff',
                                            borderRadius: '50%',
                                            width: '32px',
                                            height: '32px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            backdropFilter: 'blur(4px)'
                                        }}
                                    >
                                        <ChevronRight size={20} />
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Footer: Counter */}
                        {hasMultiple && (
                            <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                {currentIndex + 1} / {thumbnails.length}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ThumbnailTooltip;
