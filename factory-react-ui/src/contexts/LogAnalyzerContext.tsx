import { createContext, useContext, useState, ReactNode } from 'react';

interface LogAnalyzerContextType {
    loading: boolean;
    loadingMessage: string;
    loadingSubmessage?: string;
    setLoading: (isLoading: boolean, message?: string, submessage?: string) => void;
}

const LogAnalyzerContext = createContext<LogAnalyzerContextType | undefined>(undefined);

export const useLogAnalyzerContext = () => {
    const context = useContext(LogAnalyzerContext);
    if (!context) {
        throw new Error('useLogAnalyzerContext must be used within a LogAnalyzerProvider');
    }
    return context;
};

export const LogAnalyzerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [loading, setLoadingState] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Loading...');
    const [loadingSubmessage, setLoadingSubmessage] = useState<string | undefined>(undefined);

    const setLoading = (isLoading: boolean, message?: string, submessage?: string) => {
        setLoadingState(isLoading);
        if (message) setLoadingMessage(message);
        if (submessage) setLoadingSubmessage(submessage);
    };

    return (
        <LogAnalyzerContext.Provider value={{ loading, loadingMessage, loadingSubmessage, setLoading }}>
            {children}
        </LogAnalyzerContext.Provider>
    );
};
