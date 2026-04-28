

export const spacing = {
    
    xs: '0.25rem',
    
    sm: '0.5rem',
    
    md: '0.75rem',
    
    lg: '1rem',
    
    xl: '1.5rem',
    
    '2xl': '2rem',
} as const;

export const typography = {
    
    fontSize: {
        
        xs: '0.625rem',
        
        sm: '0.6875rem',
        
        base: '0.75rem',
        
        md: '0.8125rem',
        
        lg: '0.875rem',
        
        xl: '0.9375rem',
        
        '2xl': '1.125rem',
    },

    fontWeight: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
    },

    lineHeight: {
        tight: 1.1,
        snug: 1.2,
        normal: 1.4,
        relaxed: 1.6,
    },

    letterSpacing: {
        tight: '-0.01em',
        normal: '0',
        wide: '0.02em',
        wider: '0.05em',
    },
} as const;

export const colors = {
    
    text: {
        primary: 'var(--text-main)',
        secondary: 'var(--text-dim)',
        muted: 'var(--text-muted)',
        inverse: '#ffffff',
    },

    background: {
        app: 'var(--bg-app)',
        card: 'var(--bg-card)',
        panel: 'var(--bg-panel)',
        main: 'var(--bg-main)',
        overlay: 'rgba(0, 0, 0, 0.6)',
    },

    border: {
        default: 'var(--border)',
        focus: 'rgba(59, 130, 246, 0.5)',
    },

    primary: {
        main: 'var(--primary)',
        dim: 'var(--primary-dim)',
        raw: '#3b82f6', 
    },

    status: {
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        info: '#38bdf8',
    },

    accent: {
        successGlow: 'rgba(52, 211, 153, 0.15)',
        dangerGlow: 'rgba(248, 113, 113, 0.15)',
        primaryGlow: 'rgba(59, 130, 246, 0.2)',
        infoGlow: 'rgba(56, 189, 248, 0.1)',
    },

    tooltip: {
        background: '#1e293b',
        border: '#334155',
        text: '#f8fafc',
    },
} as const;

export const borders = {
    radius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        full: '9999px',
    },

    width: {
        thin: '1px',
        medium: '2px',
        thick: '3px',
    },
} as const;

export const shadows = {
    
    sm: '0 1px 2px rgba(0, 0, 0, 0.1)',
    md: '0 2px 8px rgba(0, 0, 0, 0.15)',
    lg: '0 4px 12px rgba(0, 0, 0, 0.2)',
    xl: '0 8px 24px rgba(0, 0, 0, 0.3)',

    successGlow: '0 0 4px var(--success)',
    dangerGlow: '0 0 4px var(--danger)',
    primaryGlow: '0 0 8px rgba(59, 130, 246, 0.5)',

    card: '0 2px 8px rgba(0, 0, 0, 0.1)',
    cardHover: '0 4px 16px rgba(0, 0, 0, 0.2)',
} as const;

export const transitions = {
    duration: {
        fast: '0.1s',
        normal: '0.2s',
        slow: '0.3s',
    },

    timing: {
        ease: 'ease',
        easeIn: 'ease-in',
        easeOut: 'ease-out',
        easeInOut: 'ease-in-out',
    },

    default: '0.2s ease',
    fast: '0.1s ease-out',
    slow: '0.3s ease-in-out',
    transform: 'transform 0.2s ease',
    opacity: 'opacity 0.2s ease',
    all: 'all 0.2s ease',
} as const;

export const zIndex = {
    base: 0,
    dropdown: 10,
    sticky: 20,
    fixed: 30,
    modalBackdrop: 40,
    modal: 50,
    popover: 60,
    tooltip: 70,
} as const;

export const breakpoints = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
} as const;

export const MCCard = {
    minWidth: 115,
    height: 56,
    gap: 8,
    statusDotSize: 6,
} as const;

export const fileCard = {
    minWidth: 70,
    gap: 8,
    iconSize: 20,
    maxVisibleIndex: 99,
} as const;

export const dropdown = {
    maxHeight: 200,
} as const;

export const header = {
    lineHeight: 28,
    sectionMargin: 12,
} as const;

export const motion = {
    
    hoverScale: 1.02,
    
    tapScale: 0.98,
    
    slideDistance: 10,
    
    duration: 0.15,
    
    spring: { type: 'spring', stiffness: 400, damping: 25 },
} as const;

export const a11y = {
    
    minTouchTarget: 44,
    
    focusRingWidth: 2,
    
    focusRingOffset: 2,
} as const;

export function getStatusColor(isOnline: boolean): string {
    return isOnline ? colors.status.success : colors.status.danger;
}

export function getStatusGlow(isOnline: boolean): string {
    return isOnline ? colors.accent.successGlow : colors.accent.dangerGlow;
}

export function focusRingStyle(): React.CSSProperties {
    return {
        outline: `${a11y.focusRingWidth}px solid ${colors.primary.raw}`,
        outlineOffset: a11y.focusRingOffset,
    };
}

export type DesignTokens = {
    spacing: typeof spacing;
    typography: typeof typography;
    colors: typeof colors;
    borders: typeof borders;
    shadows: typeof shadows;
    transitions: typeof transitions;
    zIndex: typeof zIndex;
};
