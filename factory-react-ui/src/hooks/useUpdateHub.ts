import { useEffect, useRef, useState, useCallback } from 'react';
import { HubConnectionBuilder, HubConnection, HubConnectionState, LogLevel } from '@microsoft/signalr';

export interface DeploymentStatusEvent {
    scheduleId: number;
    deploymentId: number;
    mcId: number;
    status: string;
    errorMessage?: string;
}

export interface ScheduleStatusEvent {
    scheduleId: number;
    status: string;
    completedCount: number;
    failedCount: number;
    totalCount: number;
}

/**
 * Hook to connect to the UpdateHub for live deployment tracking.
 * Follows the same pattern as SignalRContext.tsx / YieldHub.
 */
export function useUpdateHub() {
    const [isConnected, setIsConnected] = useState(false);
    const connectionRef = useRef<HubConnection | null>(null);
    const deploymentCallbacksRef = useRef<Set<(e: DeploymentStatusEvent) => void>>(new Set());
    const scheduleCallbacksRef = useRef<Set<(e: ScheduleStatusEvent) => void>>(new Set());

    useEffect(() => {
        let mounted = true;

        const hubConnection = new HubConnectionBuilder()
            .withUrl('/updateHub')
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Warning)
            .build();

        connectionRef.current = hubConnection;

        hubConnection.on('DeploymentStatusChanged', (event: DeploymentStatusEvent) => {
            deploymentCallbacksRef.current.forEach(cb => cb(event));
        });

        hubConnection.on('ScheduleStatusChanged', (event: ScheduleStatusEvent) => {
            scheduleCallbacksRef.current.forEach(cb => cb(event));
        });

        hubConnection.onreconnected(() => {
            console.log('[UpdateHub] Reconnected');
            if (mounted) setIsConnected(true);
        });

        hubConnection.onclose(() => {
            console.log('[UpdateHub] Disconnected');
            if (mounted) setIsConnected(false);
        });

        hubConnection.start()
            .then(() => {
                if (mounted) {
                    console.log('[UpdateHub] Connected');
                    setIsConnected(true);
                } else {
                    hubConnection.stop();
                }
            })
            .catch((e: unknown) => {
                if (mounted) {
                    console.error('[UpdateHub] Connection failed:', e);
                }
            });

        return () => {
            mounted = false;
            setIsConnected(false);
            if (hubConnection.state !== HubConnectionState.Disconnected) {
                hubConnection.stop();
            }
        };
    }, []);

    const onDeploymentStatusChanged = useCallback((callback: (e: DeploymentStatusEvent) => void) => {
        deploymentCallbacksRef.current.add(callback);
        return () => { deploymentCallbacksRef.current.delete(callback); };
    }, []);

    const onScheduleStatusChanged = useCallback((callback: (e: ScheduleStatusEvent) => void) => {
        scheduleCallbacksRef.current.add(callback);
        return () => { scheduleCallbacksRef.current.delete(callback); };
    }, []);

    return {
        isConnected,
        onDeploymentStatusChanged,
        onScheduleStatusChanged,
    };
}
