import { motion } from 'framer-motion';

interface Props {
    message?: string;
    submessage?: string;
}

export default function LoadingOverlay({ message = 'LOADING...', submessage }: Props) {
    const pegCount = 12;
    const radius = 85;
    const pegSize = 32;
    const cylinderBodyColor = '#3b5cb8';
    const ANIMATION_DURATION = '2.2s';
    const STAGGER_DELAY = 0.18;

    const generateColumnShadow = (color: string) => {
        let shadow = '';
        for (let i = 1; i <= 20; i++) {
            shadow += `0px ${i}px 0px ${color}${i === 20 ? '' : ','}`;
        }
        return shadow;
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(11, 17, 33, 0.95)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
                fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
        >
            <div style={{
                position: 'relative',
                width: '260px',
                height: '260px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                boxShadow: 'inset 5px 5px 20px rgba(0,0,0,0.6), inset -5px -5px 20px rgba(255,255,255,0.05), 0 10px 40px rgba(56, 189, 248, 0.10)',                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: 'rotateX(15deg)',
                transformStyle: 'preserve-3d',
            }}>
                {[...Array(pegCount)].map((_, i) => {
                    const angle = (i * 360) / pegCount;
                    const radian = (angle * Math.PI) / 180;
                    const x = Math.cos(radian - Math.PI / 2) * radius;
                    const y = Math.sin(radian - Math.PI / 2) * radius;

                    return (
                        <div key={i} style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            width: `${pegSize}px`,
                            height: `${pegSize}px`,
                            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                        }}>
                            <div style={{
                                width: '100%',
                                height: '100%',
                                borderRadius: '50%',
                                background: '#1e293b',
                                boxShadow: 'inset 2px 2px 5px #0f172a, inset -2px -2px 5px #334155',
                                animation: `pistonPump ${ANIMATION_DURATION} ease-in-out infinite`,
                                animationDelay: `${i * STAGGER_DELAY}s`,
                            }} />
                        </div>
                    );
                })}

                <div style={{
                    zIndex: 10,
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    transform: 'rotateX(-15deg)',
                }}>
                    <div style={{
                        color: '#f8fafc',
                        fontSize: '15px',
                        letterSpacing: '4px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        opacity: 0.95,
                        textShadow: '0 2px 8px rgba(56, 189, 248, 0.5)',
                        marginBottom: submessage ? '0.5rem' : 0
                    }}>
                        {message}
                    </div>
                    {submessage && (
                        <div style={{
                            color: '#94a3b8',
                            fontSize: '12px',
                            fontWeight: '500',
                            letterSpacing: '0.5px'
                        }}>
                            {submessage}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes pistonPump {
                    0% { 
                        transform: translateY(0px); 
                        background-color: #1e293b; 
                        box-shadow: inset 2px 2px 5px #0f172a, inset -2px -2px 5px #334155; 
                    }
                    12% { 
                        transform: translateY(-22px); 
                        background-color: #38bdf8; 
                        box-shadow: ${generateColumnShadow(cylinderBodyColor)}; 
                    }
                    35%, 100% { 
                        transform: translateY(0px); 
                        background-color: #1e293b; 
                        box-shadow: inset 2px 2px 5px #0f172a, inset -2px -2px 5px #334155; 
                    }
                }
            `}</style>
        </motion.div>
    );
}