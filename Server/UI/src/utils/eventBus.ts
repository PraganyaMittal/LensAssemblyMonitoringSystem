
type EventCallback = () => void

class EventBus {
    private events: Map<string, EventCallback[]> = new Map()

    on(event: string, callback: EventCallback) {
        if (!this.events.has(event)) {
            this.events.set(event, [])
        }
        this.events.get(event)!.push(callback)
    }

    off(event: string, callback: EventCallback) {
        const callbacks = this.events.get(event)
        if (callbacks) {
            this.events.set(event, callbacks.filter(cb => cb !== callback))
        }
    }

    emit(event: string) {
        const callbacks = this.events.get(event)
        if (callbacks) {
            callbacks.forEach(cb => cb())
        }
    }
}

export const eventBus = new EventBus()

export const EVENTS = {
    REFRESH_DASHBOARD: 'refresh_dashboard',
    LOG_ANALYZER_HOME: 'log_analyzer_home',
    SIDEBAR_COLLAPSE: 'sidebar_collapse',
    SIDEBAR_EXPAND: 'sidebar_expand',
}
