import React from 'react';

interface CameraIconProps {
    size?: number;
    className?: string;
    onClick?: () => void;
}

/**
 * SVG Camera icon to indicate an operation has associated NG images.
 * Displayed on the left side of candles in the Gantt chart.
 */
export const CameraIcon: React.FC<CameraIconProps> = ({
    size = 14,
    className = '',
    onClick
}) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            onClick={onClick}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            {/* Camera body */}
            <rect
                x="2"
                y="6"
                width="20"
                height="14"
                rx="2"
                fill="#ef4444"
                stroke="#dc2626"
                strokeWidth="1"
            />
            {/* Camera lens */}
            <circle
                cx="12"
                cy="13"
                r="4"
                fill="#1e293b"
                stroke="#0f172a"
                strokeWidth="1"
            />
            {/* Inner lens highlight */}
            <circle
                cx="12"
                cy="13"
                r="2"
                fill="#475569"
            />
            {/* Flash/viewfinder on top */}
            <rect
                x="8"
                y="3"
                width="8"
                height="3"
                rx="1"
                fill="#ef4444"
                stroke="#dc2626"
                strokeWidth="0.5"
            />
        </svg>
    );
};

export default CameraIcon;
