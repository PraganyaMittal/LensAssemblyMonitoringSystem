import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { ThumbnailData } from '../../services/thumbnailApi';
import { logAnalyzerApi } from '../../services/logAnalyzerApi';
import { useLogAnalyzerContext } from '../../contexts/LogAnalyzerContext'; // Context Import

interface ThumbnailTooltipProps {
    isVisible: boolean;
    thumbnails: ThumbnailData[];
    anchorPosition?: { x: number; y: number };
    arrowDirection?: 'up' | 'down';
    ngReason?: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    mcId?: number; // Added for fetching full images
}

// COMPACT DIMENSIONS
const TOOLTIP_WIDTH = 180;  // Much smaller width
const IMAGE_HEIGHT = 120;   // Reduced image height

export const ThumbnailTooltip: React.FC<ThumbnailTooltipProps> = ({
    isVisible,
    thumbnails,
    anchorPosition,
    arrowDirection = 'up',
    ngReason,
    onMouseEnter,
    onMouseLeave,
    mcId
}) => {
    const { setLoading } = useLogAnalyzerContext(); // Context Hook
    const [currentIndex, setCurrentIndex] = useState(0);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Reset index when thumbnails change
    useEffect(() => {
        if (isVisible) {
            setCurrentIndex(0);
        }
    }, [thumbnails, isVisible]);

    if (!isVisible || thumbnails.length === 0 || !anchorPosition) {
        return null;
    }

    const currentThumb = thumbnails[currentIndex];
    // Guard against undefined thumbnail or missing data
    if (!currentThumb || !currentThumb.data) {
        return null;
    }
    const hasMultiple = thumbnails.length > 1;

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev + 1) % thumbnails.length);
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev - 1 + thumbnails.length) % thumbnails.length);
    };

    // Download handler (Fetches FULL image if mcId is available)
    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (mcId && currentThumb.imagePath) {
            try {
                setLoading(true, "Downloading High-Res Image...", "Fetching original quality from server");

                // Construct full path logic similar to InspectionImageViewer
                const rawPath = currentThumb.imagePath || '';
                const folder = rawPath.endsWith('\\') ? rawPath : rawPath + '\\';
                const fullPath = folder + currentThumb.filename;

                const url = logAnalyzerApi.getSingleImageUrl(mcId, fullPath);

                // Fetch as blob to force download
                const response = await fetch(url);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = currentThumb.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
            } catch (err) {
                console.error('Failed to download full image, falling back to thumbnail', err);
            } finally {
                setLoading(false);
            }
            return;
        }

        // Fallback to thumbnail base64
        const link = document.createElement('a');
        link.href = `data:image/jpeg;base64,${currentThumb.data}`;
        link.download = currentThumb.filename;
        link.click();
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    ref={tooltipRef}
                    initial={{ opacity: 0, scale: 0.95, y: arrowDirection === 'up' ? 6 : -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: arrowDirection === 'up' ? 6 : -6 }}
                    transition={{ type: 'spring', duration: 0.2 }}
                    style={{
                        position: 'fixed',
                        left: anchorPosition.x,
                        top: anchorPosition.y,
                        zIndex: 99999,
                        pointerEvents: 'auto',
                        padding: '6px',
                        background: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        width: `${TOOLTIP_WIDTH}px`
                    }}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    {/* CSS Arrow - always centered */}
                    <div
                        style={{
                            position: 'absolute',
                            left: '50%',
                            width: '12px',
                            height: '12px',
                            background: 'rgba(15, 23, 42, 0.95)',
                            border: '1px solid #334155',
                            transform: 'translateX(-50%) rotate(45deg)',
                            ...(arrowDirection === 'up'
                                ? { top: '-6px', borderBottom: 'none', borderRight: 'none' }
                                : { bottom: '-6px', borderTop: 'none', borderLeft: 'none' }
                            )
                        }}
                    />

                    {/* Image Container - Compact */}
                    <div
                        style={{
                            width: '100%',
                            height: `${IMAGE_HEIGHT}px`,
                            background: '#000',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <img
                            src={`data:image/jpeg;base64,${currentThumb.data}`}
                            alt={currentThumb.filename}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain'
                            }}
                        />

                        {/* Compact Carousel Controls */}
                        {hasMultiple && (
                            <>
                                <button
                                    onClick={handlePrev}
                                    style={{
                                        position: 'absolute',
                                        left: '2px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'rgba(0,0,0,0.7)',
                                        border: 'none',
                                        color: '#fff',
                                        borderRadius: '50%',
                                        width: '20px',
                                        height: '20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        padding: 0
                                    }}
                                >
                                    <ChevronLeft size={12} />
                                </button>
                                <button
                                    onClick={handleNext}
                                    style={{
                                        position: 'absolute',
                                        right: '2px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'rgba(0,0,0,0.7)',
                                        border: 'none',
                                        color: '#fff',
                                        borderRadius: '50%',
                                        width: '20px',
                                        height: '20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        padding: 0
                                    }}
                                >
                                    <ChevronRight size={12} />
                                </button>
                                {/* Counter Badge */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: '2px',
                                    right: '2px',
                                    background: 'rgba(0,0,0,0.7)',
                                    color: '#94a3b8',
                                    fontSize: '9px',
                                    padding: '1px 4px',
                                    borderRadius: '3px',
                                    fontFamily: 'monospace'
                                }}>
                                    {currentIndex + 1}/{thumbnails.length}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer: NG Reason + Download - Compact */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        {/* NG Reason - larger font */}
                        <span style={{
                            fontSize: '9px',
                            color: '#f87171',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            fontFamily: 'Inter, sans-serif'
                        }}>
                            {ngReason || 'NG'}
                        </span>

                        {/* Download Button - small */}
                        <button
                            onClick={handleDownload}
                            style={{
                                background: 'rgba(96,165,250,0.15)',
                                border: '1px solid rgba(96,165,250,0.3)',
                                color: '#60a5fa',
                                borderRadius: '3px',
                                padding: '2px 6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '12px',
                                fontFamily: 'Inter, sans-serif'
                            }}
                            title="Download"
                        >
                            <Download size={10} />
                            View
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ThumbnailTooltip;

// Export dimensions for positioning calculations
export { TOOLTIP_WIDTH, IMAGE_HEIGHT };
