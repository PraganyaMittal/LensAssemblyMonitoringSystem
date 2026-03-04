import { useState, useEffect, useRef } from 'react';
import { Settings, Save } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import { Toast } from '../../components/Toast';

export default function SettingsTab() {
    const [retentionDays, setRetentionDays] = useState('30');
    const [maxConcurrent, setMaxConcurrent] = useState('10');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
    const toastTimer = useRef<any>(null);

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ msg, type });
        toastTimer.current = setTimeout(() => setToast(null), 4000);
    };

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const settings = await updateApi.getSettings();
                const retention = settings.find((s: any) => s.settingKey === 'RetentionDays');
                if (retention) setRetentionDays(retention.settingValue);

                const concurrent = settings.find((s: any) => s.settingKey === 'MaxConcurrentDownloads');
                if (concurrent) setMaxConcurrent(concurrent.settingValue);
            } catch (err: any) {
                showToast(err.message || 'Failed to load settings', 'error');
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        const retVal = Number(retentionDays);
        const concVal = Number(maxConcurrent);

        if (!retentionDays || isNaN(retVal) || retVal < 1) {
            showToast('Retention days must be a positive number', 'error');
            return;
        }
        if (!maxConcurrent || isNaN(concVal) || concVal < 0) {
            showToast('Concurrent downloads must be 0 or more', 'error');
            return;
        }

        setSaving(true);
        try {
            await Promise.all([
                updateApi.updateSetting('RetentionDays', retentionDays, 'Days to keep archived packages before auto-purge'),
                updateApi.updateSetting('MaxConcurrentDownloads', maxConcurrent, 'Max agents downloading simultaneously (0 = paused)')
            ]);
            showToast('Settings saved successfully', 'success');
        } catch (err: any) {
            showToast(err.message || 'Failed to save settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', color: 'var(--text-dim)' }}>Loading settings...</div>;
    }

    const inputStyle = {
        padding: '0.5rem',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        background: 'var(--bg-primary)',
        color: 'var(--text)',
        width: '100px'
    };

    return (
        <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Settings size={20} color="var(--primary)" />
                <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 600 }}>Update Manager Settings</h2>
            </div>

            {/* Deployment Settings */}
            <div className="mc-card">
                <div className="mc-card-header">
                    <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: 600 }}>Deployment Concurrency</h3>
                </div>
                <div className="mc-card-body" style={{ gap: '1rem' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                        Controls how many agents can download an update package simultaneously.
                        Lower values reduce network load; higher values speed up rollouts.
                        Set to <strong>0</strong> to pause all new dispatches (in-flight downloads will complete).
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Max concurrent downloads</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={maxConcurrent}
                                onChange={(e) => setMaxConcurrent(e.target.value)}
                                style={inputStyle}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>agents</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                            Recommended: 10 for 1 Gbps | 50 for 10 Gbps | 3 for slow Wi-Fi
                        </div>
                    </div>
                </div>
            </div>

            {/* Archive Settings */}
            <div className="mc-card">
                <div className="mc-card-header">
                    <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: 600 }}>Archive Retention</h3>
                </div>
                <div className="mc-card-body" style={{ gap: '1rem' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                        Specify how long soft-deleted packages should be kept in the archive before they are permanently
                        deleted from the database and disk.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Days to keep in archive</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="number"
                                min="1"
                                value={retentionDays}
                                onChange={(e) => setRetentionDays(e.target.value)}
                                style={inputStyle}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>days</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div>
                <button
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    onClick={handleSave}
                    disabled={saving}
                >
                    <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
}
