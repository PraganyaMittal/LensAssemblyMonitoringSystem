import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ThumbnailData {
    filename: string;
    data: string; // Base64 encoded JPEG
}

interface ThumbnailTooltipProps {
    isVisible: boolean;
    thumbnails: ThumbnailData[];
    position: { x: number; y: number };
    onClose?: () => void;
    onClick?: () => void;
}

/**
 * Tooltip component that displays thumbnails when hovering over an NG candle.
 * Shows all thumbnails in a horizontal row with a "Click to view full size" hint.
 */
export const ThumbnailTooltip: React.FC<ThumbnailTooltipProps> = ({
    isVisible,
    thumbnails,
    position,
    onClick
}) => {
    if (!isVisible || thumbnails.length === 0) {
        return null;
    }

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    style={{
                        position: 'fixed',
                        left: position.x,
                        top: position.y,
                        zIndex: 9999,
                        pointerEvents: 'auto'
                    }}
                    onClick={onClick}
                >
                    <div
                        style={{
                            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '12px',
                            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                            maxWidth: '500px'
                        }}
                    >
                        {/* Thumbnails row */}
                        <div
                            style={{
                                display: 'flex',
                                gap: '8px',
                                flexWrap: 'wrap',
                                justifyContent: 'center'
                            }}
                        >
                            {thumbnails.slice(0, 4).map((thumb, index) => (
                                <div
                                    key={index}
                                    style={{
                                        width: '100px',
                                        height: '75px',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        border: '1px solid #475569'
                                    }}
                                >
                                    <img
                                        src={`data:image/jpeg;base64,${thumb.data}`}
                                        alt={thumb.filename}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover'
                                        }}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Info text */}
                        <div
                            style={{
                                marginTop: '8px',
                                textAlign: 'center',
                                color: '#94a3b8',
                                fontSize: '11px'
                            }}
                        >
                            {thumbnails.length > 4 && (
                                <span style={{ marginRight: '8px' }}>
                                    +{thumbnails.length - 4} more
                                </span>
                            )}
                            <span style={{ color: '#60a5fa' }}>
                                Click to view full size
                            </span>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ThumbnailTooltip;
