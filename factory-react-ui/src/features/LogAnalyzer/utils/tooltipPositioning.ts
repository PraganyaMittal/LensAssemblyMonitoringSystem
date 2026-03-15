
import { TOOLTIP_GAP, VIEWPORT_MARGIN, TOOLTIP_WIDTH, TOOLTIP_HEIGHT } from '../constants';
import type { TooltipPosition, CandleRect } from '../types/log.types';


export type { TooltipPosition, CandleRect };


export function calculateCornerSnappedPosition(
    candleRect: CandleRect,
    tooltipWidth: number = TOOLTIP_WIDTH,
    tooltipHeight: number = TOOLTIP_HEIGHT,
    gap: number = TOOLTIP_GAP
): TooltipPosition {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - candleRect.bottom;
    const spaceAbove = candleRect.top;
    const requiredSpace = tooltipHeight + gap;

    let arrowDirection: 'up' | 'down';
    let y: number;
    let anchorX: number;

    
    if (spaceBelow >= requiredSpace) {
        arrowDirection = 'up';
        y = candleRect.bottom + gap;
        anchorX = candleRect.left;
    } else if (spaceAbove >= requiredSpace) {
        arrowDirection = 'down';
        y = candleRect.top - tooltipHeight - gap;
        anchorX = candleRect.left;
    } else {
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

    
    let x = anchorX - (tooltipWidth / 2);
    x = Math.max(VIEWPORT_MARGIN, Math.min(viewportWidth - tooltipWidth - VIEWPORT_MARGIN, x));

    const arrowLeftOffset = tooltipWidth / 2;

    return { x, y, arrowDirection, arrowLeftOffset };
}


export function getCandleRectFromPlotly(
    chartElement: HTMLDivElement | null,
    pointIndex: number,
    traceIndex: number
): CandleRect | null {
    if (!chartElement) return null;

    try {
        const traces = chartElement.querySelectorAll('g.trace.bars');
        const targetTrace = traces[traceIndex];

        if (!targetTrace) {
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


export type AnchorPoint = { x: number; y: number };

export function getAnchorFromCursor(event: MouseEvent): AnchorPoint {
    return { x: event.clientX, y: event.clientY };
}

export function calculateVerticalTooltipPosition(
    anchor: AnchorPoint,
    tooltipWidth: number = TOOLTIP_WIDTH,
    tooltipHeight: number = TOOLTIP_HEIGHT,
    gap: number = TOOLTIP_GAP
): TooltipPosition {
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
