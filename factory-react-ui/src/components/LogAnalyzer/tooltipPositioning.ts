/**
 * Collision-Aware Vertical Tooltip Positioning Utility
 * 
 * UPDATED: Dynamic Element Targeting with Corner Snapping
 * - Tooltip anchors to the LEFT edge of the candle
 * - Arrow points to Bottom-Left (when below) or Top-Left (when above)
 */

// ============================================
// Constants
// ============================================

/** Gap between tooltip and anchor point (pixels) */
export const TOOLTIP_GAP = 12;

/** Minimum margin from viewport edges (pixels) */
export const VIEWPORT_MARGIN = 10;

/** Default tooltip dimensions - COMPACT VERSION */
export const DEFAULT_TOOLTIP_WIDTH = 180;
export const DEFAULT_TOOLTIP_HEIGHT = 150;

// ============================================
// Types
// ============================================

export interface TooltipPosition {
    /** Fixed left position in pixels */
    x: number;
    /** Fixed top position in pixels */
    y: number;
    /** Arrow direction - where the arrow points */
    arrowDirection: 'up' | 'down';
    /** Arrow horizontal offset from tooltip left edge (for corner snapping) */
    arrowLeftOffset: number;
}

export interface CandleRect {
    /** Left edge X coordinate */
    left: number;
    /** Top edge Y coordinate */
    top: number;
    /** Right edge X coordinate */
    right: number;
    /** Bottom edge Y coordinate */
    bottom: number;
    /** Width of the candle */
    width: number;
    /** Height of the candle */
    height: number;
}

// ============================================
// Main Positioning Function - Corner Snapping
// ============================================

/**
 * Calculates tooltip position with CORNER SNAPPING logic.
 * 
 * The arrow snaps to the LEFT EDGE of the candle:
 * - BELOW: Arrow points UP to candle's Bottom-Left corner
 * - ABOVE: Arrow points DOWN to candle's Top-Left corner
 * 
 * The tooltip is positioned so the arrow aligns with the candle's left edge.
 * 
 * @param candleRect - DOMRect of the hovered candle element
 * @param tooltipWidth - Width of the tooltip in pixels
 * @param tooltipHeight - Height of the tooltip in pixels
 * @param gap - Gap between candle and tooltip (default: 12px)
 * @returns Calculated position with arrow direction and offset
 */
export function calculateCornerSnappedPosition(
    candleRect: CandleRect,
    tooltipWidth: number = DEFAULT_TOOLTIP_WIDTH,
    tooltipHeight: number = DEFAULT_TOOLTIP_HEIGHT,
    gap: number = TOOLTIP_GAP
): TooltipPosition {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Calculate space above and below the candle
    const spaceBelow = viewportHeight - candleRect.bottom;
    const spaceAbove = candleRect.top;
    const requiredSpace = tooltipHeight + gap;

    let arrowDirection: 'up' | 'down';
    let y: number;
    let anchorX: number;  // The X coordinate the arrow should point to

    // ========================================
    // Vertical Placement (Down-First Priority)
    // ========================================
    if (spaceBelow >= requiredSpace) {
        // Position BELOW the candle
        arrowDirection = 'up';  // Arrow points UP toward candle's bottom-left
        y = candleRect.bottom + gap;
        anchorX = candleRect.left;  // Bottom-left corner of candle
    } else if (spaceAbove >= requiredSpace) {
        // Position ABOVE the candle
        arrowDirection = 'down';  // Arrow points DOWN toward candle's top-left
        y = candleRect.top - tooltipHeight - gap;
        anchorX = candleRect.left;  // Top-left corner of candle
    } else {
        // Fallback: place in direction with max headroom
        if (spaceBelow >= spaceAbove) {
            arrowDirection = 'up';
            y = candleRect.bottom + gap;
            y = Math.min(y, viewportHeight - tooltipHeight - VIEWPORT_MARGIN);
        } else {
            arrowDirection = 'down';
            y = candleRect.top - tooltipHeight - gap;
            y = Math.max(VIEWPORT_MARGIN, y);
        }
        anchorX = candleRect.left;
    }

    // ========================================
    // Horizontal Placement
    // Arrow stays CENTERED at 50% of tooltip
    // Tooltip shifts so its center aligns with candle's left edge
    // ========================================

    // Position tooltip so its center aligns with candle's left edge
    let x = anchorX - (tooltipWidth / 2);

    // Clamp tooltip X to viewport bounds
    x = Math.max(VIEWPORT_MARGIN, Math.min(viewportWidth - tooltipWidth - VIEWPORT_MARGIN, x));

    // Arrow offset is always center (50% of tooltip width)
    const arrowLeftOffset = tooltipWidth / 2;

    return { x, y, arrowDirection, arrowLeftOffset };
}

/**
 * Extracts the bounding rect of the hovered bar element from Plotly.
 * 
 * This function queries the Plotly DOM structure to find the specific
 * bar element corresponding to the hovered data point.
 * 
 * @param chartElement - The Plotly chart container element
 * @param pointIndex - Index of the hovered point in the trace
 * @param traceIndex - Index of the trace (0-based)
 * @returns CandleRect if found, null otherwise
 */
export function getCandleRectFromPlotly(
    chartElement: HTMLDivElement | null,
    pointIndex: number,
    traceIndex: number
): CandleRect | null {
    if (!chartElement) return null;

    try {
        // Plotly structure: .plot-container > .svg-container > svg > g.cartesianlayer > g.subplot > g.plot > g.trace.bars
        const traces = chartElement.querySelectorAll('g.trace.bars');
        const targetTrace = traces[traceIndex];

        if (!targetTrace) {
            // Try alternative selector for grouped bars
            const allTraces = chartElement.querySelectorAll('g.trace');
            const barTraces = Array.from(allTraces).filter(t =>
                t.querySelector('g.points') || t.querySelector('path')
            );
            const trace = barTraces[traceIndex];
            if (!trace) return null;

            const points = trace.querySelectorAll('g.point path, path');
            const targetPoint = points[pointIndex];
            if (!targetPoint) return null;

            const rect = targetPoint.getBoundingClientRect();
            return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height
            };
        }

        // Get the specific bar/point within the trace
        const points = targetTrace.querySelectorAll('g.point path, path');
        const targetPoint = points[pointIndex];

        if (!targetPoint) return null;

        const rect = targetPoint.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
        };
    } catch (error) {
        console.warn('Failed to extract candle rect from Plotly:', error);
        return null;
    }
}

/**
 * Fallback: Create a synthetic CandleRect from cursor position.
 * Used when DOM element extraction fails.
 * 
 * @param event - Mouse event from Plotly hover
 * @param estimatedWidth - Estimated width of the bar (default 20px)
 * @param estimatedHeight - Estimated height of the bar (default 30px)
 */
export function getCandleRectFromCursor(
    event: MouseEvent,
    estimatedWidth: number = 20,
    estimatedHeight: number = 30
): CandleRect {
    const centerX = event.clientX;
    const centerY = event.clientY;

    return {
        left: centerX - estimatedWidth / 2,
        top: centerY - estimatedHeight / 2,
        right: centerX + estimatedWidth / 2,
        bottom: centerY + estimatedHeight / 2,
        width: estimatedWidth,
        height: estimatedHeight
    };
}

// Legacy exports for backward compatibility
export type AnchorPoint = { x: number; y: number };

export function getAnchorFromCursor(event: MouseEvent): AnchorPoint {
    return { x: event.clientX, y: event.clientY };
}

export function calculateVerticalTooltipPosition(
    anchor: AnchorPoint,
    tooltipWidth: number = DEFAULT_TOOLTIP_WIDTH,
    tooltipHeight: number = DEFAULT_TOOLTIP_HEIGHT,
    gap: number = TOOLTIP_GAP
): TooltipPosition {
    // Convert legacy anchor to CandleRect centered on anchor point
    const candleRect: CandleRect = {
        left: anchor.x - 10,
        top: anchor.y - 15,
        right: anchor.x + 10,
        bottom: anchor.y + 15,
        width: 20,
        height: 30
    };
    return calculateCornerSnappedPosition(candleRect, tooltipWidth, tooltipHeight, gap);
}
