import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { HubConnectionBuilder, HubConnection, HubConnectionState, LogLevel } from '@microsoft/signalr';

interface SignalRContextValue {
    connection: HubConnection | null;
    isConnected: boolean;
}

const SignalRContext = createContext<SignalRContextValue | null>(null);

export const SignalRProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [connection, setConnection] = useState<HubConnection | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const connectionRef = useRef<HubConnection | null>(null);

    useEffect(() => {
        let mounted = true;

        const hubConnection = new HubConnectionBuilder()
            .withUrl('/yieldHub')
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Warning)
            .build();

        connectionRef.current = hubConnection;
        setConnection(hubConnection);

        hubConnection.onreconnected(() => {
            console.log('[SignalRContext] Reconnected to YieldHub');
            if (mounted) setIsConnected(true);
        });

        hubConnection.onclose(() => {
            console.log('[SignalRContext] Disconnected from YieldHub');
            if (mounted) setIsConnected(false);
        });

        hubConnection.start()
            .then(() => {
                if (mounted) {
                    console.log('[SignalRContext] Connected to YieldHub');
                    setIsConnected(true);
                } else {
                    
                    hubConnection.stop();
                }
            })
            .catch((e: unknown) => {
                if (mounted) {
                    console.error('[SignalRContext] Connection failed:', e);
                }
            });

        return () => {
            mounted = false;
            
            setConnection(null);
            setIsConnected(false);
            
            if (hubConnection.state !== HubConnectionState.Disconnected) {
                hubConnection.stop();
            }
        };
    }, []);

    return (
        <SignalRContext.Provider value={{ connection, isConnected }}>
            {children}
        </SignalRContext.Provider>
    );
};

export const useSignalR = () => {
    const context = useContext(SignalRContext);
    if (!context) throw new Error("useSignalR must be used within SignalRProvider");
    return context;
};
