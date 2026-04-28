import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

const NotFound: React.FC = () => {
    return (
        <div style={{
            position: 'fixed',      
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,          
            background: 'var(--bg-app)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '2rem',
            color: 'var(--text-main)',
        }}>
            <div style={{
                background: 'var(--bg-card)',
                padding: '3rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                maxWidth: '450px',
                width: '100%'
            }}>
                <div style={{
                    padding: '1rem',
                    borderRadius: '50%',
                    background: 'var(--warning-bg, rgba(251, 191, 36, 0.1))',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <AlertTriangle
                        size={48}
                        color="var(--warning)"
                        style={{ opacity: 1 }}
                    />
                </div>

                <h1 style={{
                    fontSize: '3rem',
                    fontWeight: '800',
                    marginBottom: '0.5rem',
                    lineHeight: 1,
                    background: 'linear-gradient(135deg, var(--text-main) 0%, var(--text-muted) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                }}>
                    404
                </h1>

                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: '600',
                    marginBottom: '1rem',
                    color: 'var(--text-main)'
                }}>
                    Page Not Found
                </h2>

                <p style={{
                    color: 'var(--text-muted)',
                    marginBottom: '2rem',
                    lineHeight: '1.6'
                }}>
                    The page or resource you are looking for doesn't exist.
                </p>

                <Link to="/dashboard" className="btn btn-primary" style={{ minWidth: '200px', justifyContent: 'center' }}>
                    Return to Dashboard
                </Link>
            </div>
        </div>
    );
};

export default NotFound;