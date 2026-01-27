/**
 * Design Tokens for Log Analyzer Feature
 * 
 * Centralized theming tokens to ensure consistency, maintainability,
 * and easy theming across all components. NO raw pixel/hex values 
 * should appear in component files - use these tokens instead.
 */

// =============================================================================
// SPACING SCALE (8px base unit)
// =============================================================================
export const spacing = {
    /** 4px - Micro spacing for tight gaps */
    xs: '0.25rem',
    /** 8px - Default spacing unit */
    sm: '0.5rem',
    /** 12px - Medium spacing */
    md: '0.75rem',
    /** 16px - Standard padding */
    lg: '1rem',
    /** 24px - Large sections */
    xl: '1.5rem',
    /** 32px - Extra large sections */
    '2xl': '2rem',
} as const;

// =============================================================================
// TYPOGRAPHY
// =============================================================================
export const typography = {
    // Font Sizes
    fontSize: {
        /** 10px - Tiny labels */
        xs: '0.625rem',
        /** 11px - Index numbers, badges */
        sm: '0.6875rem',
        /** 12px - Secondary text */
        base: '0.75rem',
        /** 13px - Body text */
        md: '0.8125rem',
        /** 14px - Emphasized text */
        lg: '0.875rem',
        /** 15px - Section headers */
        xl: '0.9375rem',
        /** 18px - Page titles */
        '2xl': '1.125rem',
    },

    // Font Weights
    fontWeight: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
    },

    // Line Heights
    lineHeight: {
        tight: 1.1,
        snug: 1.2,
        normal: 1.4,
        relaxed: 1.6,
    },

    // Letter Spacing
    letterSpacing: {
        tight: '-0.01em',
        normal: '0',
        wide: '0.02em',
        wider: '0.05em',
    },
} as const;

// =============================================================================
// COLORS (CSS Custom Properties for theming)
// =============================================================================
export const colors = {
    // Semantic CSS variables (defined in global CSS)
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

    // Brand Colors
    primary: {
        main: 'var(--primary)',
        dim: 'var(--primary-dim)',
        raw: '#3b82f6', // Blue 500 - Only for special cases
    },

    // Status Colors
    status: {
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        info: '#38bdf8',
    },

    // Glow/Accent Colors (for gradients and shadows)
    accent: {
        successGlow: 'rgba(52, 211, 153, 0.15)',
        dangerGlow: 'rgba(248, 113, 113, 0.15)',
        primaryGlow: 'rgba(59, 130, 246, 0.2)',
        infoGlow: 'rgba(56, 189, 248, 0.1)',
    },

    // Tooltip Colors
    tooltip: {
        background: '#1e293b',
        border: '#334155',
        text: '#f8fafc',
    },
} as const;

// =============================================================================
// BORDERS & RADII
// =============================================================================
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

// =============================================================================
// SHADOWS
// =============================================================================
export const shadows = {
    // Elevation levels
    sm: '0 1px 2px rgba(0, 0, 0, 0.1)',
    md: '0 2px 8px rgba(0, 0, 0, 0.15)',
    lg: '0 4px 12px rgba(0, 0, 0, 0.2)',
    xl: '0 8px 24px rgba(0, 0, 0, 0.3)',

    // Status glows
    successGlow: '0 0 4px var(--success)',
    dangerGlow: '0 0 4px var(--danger)',
    primaryGlow: '0 0 8px rgba(59, 130, 246, 0.5)',

    // Interactive shadows
    card: '0 2px 8px rgba(0, 0, 0, 0.1)',
    cardHover: '0 4px 16px rgba(0, 0, 0, 0.2)',
} as const;

// =============================================================================
// TRANSITIONS
// =============================================================================
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

    // Pre-composed transitions
    default: '0.2s ease',
    fast: '0.1s ease-out',
    slow: '0.3s ease-in-out',
    transform: 'transform 0.2s ease',
    opacity: 'opacity 0.2s ease',
    all: 'all 0.2s ease',
} as const;

// =============================================================================
// Z-INDEX SCALE
// =============================================================================
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

// =============================================================================
// BREAKPOINTS (Mobile-first)
// =============================================================================
export const breakpoints = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
} as const;

// =============================================================================
// COMPONENT-SPECIFIC TOKENS
// =============================================================================

/** PC Card component dimensions */
export const pcCard = {
    minWidth: 115,
    height: 56,
    gap: 8,
    statusDotSize: 6,
} as const;

/** File Card component dimensions */
export const fileCard = {
    minWidth: 70,
    gap: 8,
    iconSize: 20,
    maxVisibleIndex: 99,
} as const;

/** Dropdown component dimensions */
export const dropdown = {
    maxHeight: 200,
} as const;

/** Header dimensions */
export const header = {
    lineHeight: 28,
    sectionMargin: 12,
} as const;

// =============================================================================
// ANIMATION TOKENS (for Framer Motion)
// =============================================================================
export const motion = {
    /** Standard hover scale */
    hoverScale: 1.02,
    /** Tap/press scale */
    tapScale: 0.98,
    /** Slide distance */
    slideDistance: 10,
    /** Standard animation duration */
    duration: 0.15,
    /** Spring config for bouncy animations */
    spring: { type: 'spring', stiffness: 400, damping: 25 },
} as const;

// =============================================================================
// ACCESSIBILITY
// =============================================================================
export const a11y = {
    /** Minimum touch target size (WCAG 2.1 AA) */
    minTouchTarget: 44,
    /** Focus ring width */
    focusRingWidth: 2,
    /** Focus ring offset */
    focusRingOffset: 2,
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get status color based on online state.
 */
export function getStatusColor(isOnline: boolean): string {
    return isOnline ? colors.status.success : colors.status.danger;
}

/**
 * Get status glow color based on online state.
 */
export function getStatusGlow(isOnline: boolean): string {
    return isOnline ? colors.accent.successGlow : colors.accent.dangerGlow;
}

/**
 * Create a focus ring style object.
 */
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
