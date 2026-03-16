
import { memo, forwardRef, type ReactNode, type CSSProperties } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import {
    spacing,
    typography,
    colors,
    borders,
    shadows,
    transitions,
    motion as motionTokens,
} from '../../styles/tokens';

interface StatusIndicatorProps {
    
    isOnline: boolean;
    
    size?: number;
    
    position?: 'static' | 'absolute';
}

export const StatusIndicator = memo(function StatusIndicator({
    isOnline,
    size = 6,
    position = 'static',
}: StatusIndicatorProps) {
    const color = isOnline ? colors.status.success : colors.status.danger;
    const label = isOnline ? 'Online' : 'Offline';

    const positionStyles: CSSProperties = position === 'absolute'
        ? { position: 'absolute', top: 4, right: 4 }
        : {};

    return (
        <span
            role="status"
            aria-label={label}
            style={{
                ...positionStyles,
                display: 'inline-block',
                width: size,
                height: size,
                borderRadius: borders.radius.full,
                backgroundColor: color,
                boxShadow: isOnline ? shadows.successGlow : 'none',
            }}
        />
    );
});

interface CardButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
    
    children: ReactNode;
    
    isSelected?: boolean;
    
    isFocused?: boolean;
    
    style?: CSSProperties;
    
    'aria-label': string;
}

export const CardButton = memo(forwardRef<HTMLButtonElement, CardButtonProps>(
    function CardButton(
        { children, isSelected, isFocused, style, 'aria-label': ariaLabel, ...motionProps },
        ref
    ) {
        
        const getBorderStyle = () => {
            if (isSelected) {
                return `${borders.width.medium} solid ${colors.primary.main}`;
            }
            if (isFocused) {
                return `${borders.width.medium} solid ${colors.border.focus}`;
            }
            return `${borders.width.thin} solid ${colors.border.default}`;
        };

        return (
            <motion.button
                ref={ref}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-label={ariaLabel}
                whileHover={{ scale: motionTokens.hoverScale, y: -2 }}
                whileTap={{ scale: motionTokens.tapScale }}
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: spacing.sm,
                    background: isSelected ? colors.primary.dim : colors.background.panel,
                    border: getBorderStyle(),
                    borderRadius: borders.radius.md,
                    cursor: 'pointer',
                    transition: transitions.all,
                    outline: 'none',
                    ...style,
                }}
                {...motionProps}
            >
                {children}
            </motion.button>
        );
    }
));

interface SectionHeaderProps {
    
    icon?: ReactNode;
    
    title: string;
    
    count?: number;
    
    action?: ReactNode;
}

export const SectionHeader = memo(function SectionHeader({
    icon,
    title,
    count,
    action,
}: SectionHeaderProps) {
    return (
        <header
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${spacing.sm} ${spacing.md}`,
                borderBottom: `${borders.width.thin} solid ${colors.border.default}`,
                backgroundColor: colors.background.panel,
            }}
        >
            <h2
                style={{
                    fontSize: typography.fontSize.lg,
                    fontWeight: typography.fontWeight.bold,
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    color: colors.text.primary,
                }}
            >
                {icon}
                {title}
                {count !== undefined && (
                    <span
                        style={{
                            fontSize: typography.fontSize.sm,
                            fontWeight: typography.fontWeight.normal,
                            color: colors.text.secondary,
                            marginLeft: spacing.sm,
                        }}
                    >
                        ({count} total)
                    </span>
                )}
            </h2>
            {action}
        </header>
    );
});

interface LineDividerProps {
    
    label: string;
    
    icon?: ReactNode;
}

export const LineDivider = memo(function LineDivider({ label, icon }: LineDividerProps) {
    return (
        <div
            role="separator"
            aria-label={`Line ${label}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: `0 ${spacing.xs}`,
                color: colors.text.primary,
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.bold,
                textTransform: 'uppercase',
            }}
        >
            {icon}
            <span>Line {label}</span>
            <div
                aria-hidden="true"
                style={{
                    flex: 1,
                    height: 1,
                    backgroundColor: colors.border.default,
                }}
            />
        </div>
    );
});

interface Tab {
    id: string;
    label: string;
}

interface TabGroupProps {
    
    tabs: Tab[];
    
    activeTab: string;
    
    onTabChange: (tabId: string) => void;
    
    'aria-label': string;
}

export const TabGroup = memo(function TabGroup({
    tabs,
    activeTab,
    onTabChange,
    'aria-label': ariaLabel,
}: TabGroupProps) {
    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            style={{
                display: 'flex',
                gap: spacing.xs,
                padding: '2px',
                backgroundColor: colors.background.main,
                borderRadius: borders.radius.md,
                border: `${borders.width.thin} solid ${colors.border.default}`,
            }}
        >
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        role="tab"
                        id={`tab-${tab.id}`}
                        aria-selected={isActive}
                        aria-controls={`tabpanel-${tab.id}`}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onTabChange(tab.id)}
                        style={{
                            border: 'none',
                            background: isActive ? colors.primary.raw : 'transparent',
                            color: isActive ? colors.text.inverse : colors.text.secondary,
                            padding: `${spacing.xs} ${spacing.sm}`,
                            borderRadius: borders.radius.sm,
                            fontSize: typography.fontSize.base,
                            fontWeight: typography.fontWeight.semibold,
                            cursor: 'pointer',
                            transition: transitions.all,
                        }}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
});

interface LoadingSpinnerProps {
    
    size?: number;
    
    label?: string;
}

export const LoadingSpinner = memo(function LoadingSpinner({
    size = 24,
    label = 'Loading',
}: LoadingSpinnerProps) {
    return (
        <div
            role="status"
            aria-label={label}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: colors.text.secondary,
            }}
        >
            <div
                style={{
                    width: size,
                    height: size,
                    border: `${borders.width.medium} solid ${colors.border.default}`,
                    borderTopColor: colors.primary.raw,
                    borderRadius: borders.radius.full,
                    animation: 'spin 1s linear infinite',
                }}
            />
            {}
            <span className="sr-only">{label}</span>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .sr-only { 
                    position: absolute; 
                    width: 1px; 
                    height: 1px; 
                    padding: 0; 
                    margin: -1px; 
                    overflow: hidden; 
                    clip: rect(0, 0, 0, 0); 
                    white-space: nowrap; 
                    border: 0; 
                }
            `}</style>
        </div>
    );
});

interface EmptyStateProps {
    
    icon: ReactNode;
    
    message: string;
    
    description?: string;
}

export const EmptyState = memo(function EmptyState({
    icon,
    message,
    description,
}: EmptyStateProps) {
    return (
        <div
            role="status"
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: spacing['2xl'],
                backgroundColor: colors.background.panel,
                borderRadius: borders.radius.lg,
                border: `${borders.width.thin} dashed ${colors.border.default}`,
            }}
        >
            <div style={{ opacity: 0.3, marginBottom: spacing.sm }}>
                {icon}
            </div>
            <p
                style={{
                    margin: 0,
                    fontSize: typography.fontSize.base,
                    fontWeight: typography.fontWeight.medium,
                    color: colors.text.secondary,
                }}
            >
                {message}
            </p>
            {description && (
                <p
                    style={{
                        margin: `${spacing.sm} 0 0`,
                        fontSize: typography.fontSize.sm,
                        color: colors.text.muted,
                    }}
                >
                    {description}
                </p>
            )}
        </div>
    );
});

interface KeyboardHintProps {
    
    keyName: string;
}

export const KeyboardHint = memo(function KeyboardHint({ keyName }: KeyboardHintProps) {
    return (
        <kbd
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 18,
                height: 18,
                padding: `0 ${spacing.xs}`,
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.bold,
                fontFamily: 'system-ui, sans-serif',
                color: colors.text.muted,
                backgroundColor: colors.background.app,
                border: `${borders.width.thin} solid ${colors.border.default}`,
                borderRadius: borders.radius.sm,
                boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
            }}
        >
            {keyName}
        </kbd>
    );
});
