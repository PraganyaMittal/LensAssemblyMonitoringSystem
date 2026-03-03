import { useState, useEffect, useRef } from 'react';
import { Settings, Save } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import { Toast } from '../../components/Toast';

export default function SettingsTab() {
    const [retentionDays, setRetentionDays] = useState('30');
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
                if (retention) {
                    setRetentionDays(retention.settingValue);
                }
            } catch (err: any) {
                showToast(err.message || 'Failed to load settings', 'error');
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        if (!retentionDays || isNaN(Number(retentionDays)) || Number(retentionDays) < 1) {
            showToast('Retention days must be a positive number', 'error');
            return;
        }

        setSaving(true);
        try {
            await updateApi.updateSetting('RetentionDays', retentionDays, 'Days to keep archived packages before auto-purge');
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

    return (
        <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Settings size={20} color="var(--primary)" />
                <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 600 }}>Update Manager Settings</h2>
            </div>

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
                                style={{
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-primary)',
                                    color: 'var(--text)',
                                    width: '100px'
                                }}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>days</span>
                        </div>
                    </div>
                </div>
                <div className="mc-card-footer" style={{ justifyContent: 'flex-start' }}>
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
        </div>
    );
}
