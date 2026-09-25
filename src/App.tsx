import React, { useState, useEffect, useMemo } from 'react';
import {
  Key,
  Users,
  Smartphone,
  ShieldCheck,
  Plus,
  Copy,
  Check,
  Share2,
  RefreshCw,
  Settings,
  X,
  Search,
  AlertTriangle,
  Lock,
  Unlock,
  RotateCcw,
  BellRing
} from 'lucide-react';
import type { ActivationCode, UserAccount, DeviceBinding, FirebaseConfigState } from './types';
import {
  initFirebase,
  loadSavedFirebaseConfig,
  saveFirebaseConfig,
  ref,
  onValue,
  set,
  update,
} from './firebase';
import { generateRandomActivationCode, hashActivationCode } from './utils/crypto';

export default function App() {
  // Config & Connection state
  const [config, setConfig] = useState<FirebaseConfigState>(loadSavedFirebaseConfig);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'devices' | 'codes' | 'users'>('devices');

  // Realtime Data state
  const [codes, setCodes] = useState<Record<string, ActivationCode>>({});
  const [users, setUsers] = useState<Record<string, UserAccount>>({});
  const [devices, setDevices] = useState<Record<string, DeviceBinding>>({});
  const [loading, setLoading] = useState(true);

  // Target device for generation
  const [targetDeviceId, setTargetDeviceId] = useState<string>('');
  const [targetDeviceModel, setTargetDeviceModel] = useState<string>('');

  // Generator state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedTargetDevice, setGeneratedTargetDevice] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [codeFilter, setCodeFilter] = useState<'ALL' | 'UNUSED' | 'USED'>('ALL');

  // Initialize Firebase listeners
  useEffect(() => {
    const { db } = initFirebase(config);
    if (!db) {
      setIsConnected(false);
      setLoading(false);
      return;
    }

    setIsConnected(true);
    setLoading(true);

    // Listen to activationCodes
    const codesRef = ref(db, 'activationCodes');
    const unsubCodes = onValue(codesRef, (snapshot) => {
      const val = snapshot.val() || {};
      setCodes(val);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching activationCodes:', err);
      setIsConnected(false);
      setLoading(false);
    });

    // Listen to users
    const usersRef = ref(db, 'users');
    const unsubUsers = onValue(usersRef, (snapshot) => {
      setUsers(snapshot.val() || {});
    });

    // Listen to devices
    const devicesRef = ref(db, 'devices');
    const unsubDevices = onValue(devicesRef, (snapshot) => {
      setDevices(snapshot.val() || {});
    });

    return () => {
      unsubCodes();
      unsubUsers();
      unsubDevices();
    };
  }, [config]);

  // List calculations
  const codesList = useMemo(() => Object.entries(codes).map(([hash, c]) => ({ ...c, codeHash: hash })), [codes]);
  const usersList = useMemo(() => Object.entries(users).map(([uid, u]) => ({ ...u, uid })), [users]);
  const devicesList = useMemo(() => Object.entries(devices).map(([devId, d]) => ({ ...d, deviceId: devId })), [devices]);

  // Pending devices waiting for activation
  const pendingDevices = useMemo(() => devicesList.filter(d => d.status === 'PENDING'), [devicesList]);
  const activeDevices = useMemo(() => devicesList.filter(d => d.status === 'ACTIVE').length, [devicesList]);
  const totalCodes = codesList.length;
  const unusedCodes = codesList.filter(c => c.status === 'UNUSED').length;
  const activeUsers = usersList.filter(u => u.status === 'ACTIVE').length;

  // Generate activation code (optionally bound to a specific target device)
  const handleGenerateCode = async (forDeviceId?: string, forModel?: string) => {
    setIsGenerating(true);
    try {
      const deviceIdToBind = (forDeviceId !== undefined ? forDeviceId : targetDeviceId).trim();
      const modelToBind = (forModel !== undefined ? forModel : targetDeviceModel).trim();

      const rawCode = generateRandomActivationCode();
      const codeHash = await hashActivationCode(rawCode);

      const newRecord: ActivationCode = {
        codeHash,
        targetDeviceId: deviceIdToBind || undefined,
        deviceModel: modelToBind || undefined,
        status: 'UNUSED',
        createdAt: Date.now(),
        usedAt: null,
        usedByUid: null,
        usedByEmail: null,
        usedDeviceId: null,
      };

      const { db } = initFirebase(config);
      if (db) {
        await set(ref(db, `activationCodes/${codeHash}`), newRecord);
      } else {
        // Local preview if Firebase is disconnected
        setCodes(prev => ({ [codeHash]: newRecord, ...prev }));
      }

      setGeneratedCode(rawCode);
      setGeneratedTargetDevice(deviceIdToBind || null);
      setCopiedCode(false);
    } catch (e: any) {
      alert('Failed to generate code: ' + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy code to clipboard
  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // WhatsApp share with device reference
  const handleShareWhatsApp = (code: string, deviceId?: string | null) => {
    let msg = `Welcome to SS-Stock!\n\nHere is your official device activation code:\n🔑 *${code}*\n`;
    if (deviceId) {
      msg += `\n🔒 This code is securely locked to your device ID: *${deviceId}*\n`;
    }
    msg += `\n1. Open SS-Stock on your phone\n2. Enter this code on the Device Verification screen\n3. Start using SS-Stock!\n\nThank you for choosing SS-Stock.`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Reset a device binding
  const handleResetDevice = async (deviceId: string, uid?: string) => {
    if (!confirm(`Are you sure you want to deactivate device "${deviceId}"? This will require re-activation.`)) {
      return;
    }
    const { db } = initFirebase(config);
    if (!db) {
      alert('Please connect Firebase first.');
      return;
    }

    try {
      const updates: Record<string, any> = {};
      updates[`devices/${deviceId}/status`] = 'DEACTIVATED';
      if (uid) {
        updates[`users/${uid}/deviceId`] = null;
      }
      await update(ref(db), updates);
      alert('Device successfully deactivated.');
    } catch (e: any) {
      alert('Error deactivating device: ' + e.message);
    }
  };

  // Quick activate a device directly from admin
  const handleQuickApproveDevice = async (deviceId: string) => {
    if (!confirm(`Directly activate device "${deviceId}" without entering code?`)) return;
    const { db } = initFirebase(config);
    if (!db) return;
    try {
      await update(ref(db, `devices/${deviceId}`), {
        status: 'ACTIVE',
        activatedAt: Date.now(),
      });
      alert(`Device ${deviceId} is now ACTIVE! The phone can immediately enter the app.`);
    } catch (e: any) {
      alert('Error approving device: ' + e.message);
    }
  };

  // Toggle user block / active status
  const handleToggleUserStatus = async (uid: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    if (!confirm(`Change user ${uid} status to ${nextStatus}?`)) return;

    const { db } = initFirebase(config);
    if (!db) {
      alert('Please connect Firebase first.');
      return;
    }

    try {
      await update(ref(db, `users/${uid}`), { status: nextStatus });
    } catch (e: any) {
      alert('Error updating user: ' + e.message);
    }
  };

  // Save Firebase configuration from modal
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveFirebaseConfig(config);
    setIsConfigOpen(false);
  };

  // Filtered codes
  const filteredCodes = useMemo(() => {
    return codesList.filter(c => {
      const matchesFilter = codeFilter === 'ALL' || c.status === codeFilter;
      const matchesQuery = !searchQuery ||
        c.codeHash.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.targetDeviceId && c.targetDeviceId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.usedByEmail && c.usedByEmail.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesFilter && matchesQuery;
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [codesList, codeFilter, searchQuery]);

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={24} />
          </div>
          <div className="brand-text">
            <h1>SS-Stock Admin</h1>
            <p>Device Licensing & Activation Control Center</p>
          </div>
        </div>

        <div className="nav-actions">
          <div className={`status-pill ${isConnected ? 'status-connected' : 'status-disconnected'}`}>
            <span className="status-dot"></span>
            <span>{isConnected ? 'Firebase Realtime Connected' : 'Firebase Disconnected'}</span>
          </div>

          <button className="btn btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Settings size={16} />
            <span>Firebase Config</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">
        {!isConnected && (
          <div className="alert-banner">
            <AlertTriangle size={20} color="#f59e0b" />
            <div>
              <strong>Firebase Connection Required:</strong> Paste your Firebase Realtime Database URL and API key to enable live device authorization and code redemption.
            </div>
            <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setIsConfigOpen(true)}>
              Configure Now
            </button>
          </div>
        )}

        {/* Pending Device Verification Requests Alert */}
        {pendingDevices.length > 0 && (
          <div className="pending-section">
            <div className="pending-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BellRing size={20} color="#f59e0b" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f59e0b' }}>
                  Pending Device Activation Requests ({pendingDevices.length})
                </h3>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                New phone installations waiting for your activation code
              </span>
            </div>

            <div className="pending-grid">
              {pendingDevices.map((d) => (
                <div key={d.deviceId} className="pending-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span className="badge badge-warning" style={{ marginBottom: '0.35rem' }}>Awaiting Activation</span>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '0.2rem' }}>
                        {d.model || 'Android Device'}
                      </h4>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {d.requestedAt ? new Date(d.requestedAt).toLocaleTimeString() : 'Just now'}
                    </span>
                  </div>

                  <div style={{ background: '#090d16', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Device ID:</span>
                    <div className="mono" style={{ fontSize: '0.85rem', color: '#93c5fd', wordBreak: 'break-all' }}>
                      {d.deviceId}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }}
                      onClick={() => {
                        setTargetDeviceId(d.deviceId);
                        setTargetDeviceModel(d.model || '');
                        handleGenerateCode(d.deviceId, d.model);
                      }}
                    >
                      <Key size={14} />
                      <span>Issue Code</span>
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
                      title="Directly activate without requiring user code entry"
                      onClick={() => handleQuickApproveDevice(d.deviceId)}
                    >
                      <Check size={14} color="#10b981" />
                      <span>Approve</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <section className="metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Active Devices</span>
              <div className="metric-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                <Smartphone size={20} />
              </div>
            </div>
            <div className="metric-value" style={{ color: '#fbbf24' }}>{activeDevices}</div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Hardware verified phones</span>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Pending Devices</span>
              <div className="metric-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                <BellRing size={20} />
              </div>
            </div>
            <div className="metric-value" style={{ color: '#f87171' }}>{pendingDevices.length}</div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Awaiting your approval</span>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Available Codes</span>
              <div className="metric-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                <Key size={20} />
              </div>
            </div>
            <div className="metric-value" style={{ color: '#818cf8' }}>{unusedCodes}</div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{totalCodes} total issued</span>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Active Users</span>
              <div className="metric-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                <Users size={20} />
              </div>
            </div>
            <div className="metric-value" style={{ color: '#34d399' }}>{activeUsers}</div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Google accounts registered</span>
          </div>
        </section>

        {/* Code Generator Card */}
        <section className="generator-card">
          <div className="generator-header">
            <h2>Generate Device-Locked Activation Code</h2>
            <p>Generate a unique 12-character activation key. You can lock it to a customer's specific Device ID so nobody else can use it.</p>
          </div>

          {/* Device lock selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Lock to Specific Device ID (Optional):</label>
              <input
                className="form-input mono"
                type="text"
                placeholder="e.g. DEV_A8B9C012 or select pending below"
                value={targetDeviceId}
                onChange={(e) => setTargetDeviceId(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Phone Model / Customer Name:</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. Samsung Galaxy S21 (John)"
                value={targetDeviceModel}
                onChange={(e) => setTargetDeviceModel(e.target.value)}
              />
            </div>
          </div>

          {generatedCode ? (
            <div>
              <div className="code-display-box">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Generated Code {generatedTargetDevice ? `(Locked to: ${generatedTargetDevice})` : '(Any device)'}:
                  </span>
                  <span className="code-value mono">{generatedCode}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={() => handleCopyCode(generatedCode)}>
                    {copiedCode ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                    <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                  <button className="btn btn-success" onClick={() => handleShareWhatsApp(generatedCode, generatedTargetDevice)}>
                    <Share2 size={16} />
                    <span>Send via WhatsApp</span>
                  </button>
                </div>
              </div>
              <div className="actions-row">
                <button className="btn btn-primary" onClick={() => handleGenerateCode()} disabled={isGenerating}>
                  <Plus size={16} />
                  <span>Generate Another Code</span>
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => handleGenerateCode()} disabled={isGenerating}>
              {isGenerating ? <RefreshCw className="animate-spin" size={16} /> : <Plus size={16} />}
              <span>{isGenerating ? 'Generating...' : (targetDeviceId ? `Generate Code for ${targetDeviceId}` : 'Generate Activation Code')}</span>
            </button>
          )}
        </section>

        {/* Navigation Tabs */}
        <div className="tabs-nav">
          <button
            className={`tab-btn ${activeTab === 'devices' ? 'active' : ''}`}
            onClick={() => setActiveTab('devices')}
          >
            <Smartphone size={16} />
            <span>Devices ({devicesList.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'codes' ? 'active' : ''}`}
            onClick={() => setActiveTab('codes')}
          >
            <Key size={16} />
            <span>Activation Codes ({totalCodes})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={16} />
            <span>Users ({usersList.length})</span>
          </button>
        </div>

        {/* Tab: Devices */}
        {activeTab === 'devices' && (
          <div className="table-card">
            <div className="table-header">
              <h3>Authorized & Registered Device Registry</h3>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Phone Model</th>
                    <th>Hardware Device ID</th>
                    <th>Registered At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devicesList.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                        No devices registered yet. When a user opens SS-Stock, their device ID will appear here.
                      </td>
                    </tr>
                  ) : (
                    devicesList.map((dev) => (
                      <tr key={dev.deviceId}>
                        <td>
                          <span className={`badge ${dev.status === 'ACTIVE' ? 'badge-success' : dev.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>
                            {dev.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{dev.model || 'Android Device'}</td>
                        <td className="mono" style={{ fontSize: '0.8rem', color: '#93c5fd' }}>
                          {dev.deviceId}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {dev.activatedAt ? new Date(dev.activatedAt).toLocaleString() : dev.requestedAt ? new Date(dev.requestedAt).toLocaleString() : '-'}
                        </td>
                        <td>
                          {dev.status === 'PENDING' ? (
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <button
                                className="btn btn-primary"
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setTargetDeviceId(dev.deviceId);
                                  setTargetDeviceModel(dev.model || '');
                                  handleGenerateCode(dev.deviceId, dev.model);
                                }}
                              >
                                <Key size={12} />
                                <span>Issue Code</span>
                              </button>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                                onClick={() => handleQuickApproveDevice(dev.deviceId)}
                              >
                                <Check size={12} color="#10b981" />
                                <span>Approve</span>
                              </button>
                            </div>
                          ) : dev.status === 'ACTIVE' ? (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                              onClick={() => handleResetDevice(dev.deviceId, dev.uid)}
                            >
                              <RotateCcw size={12} color="#ef4444" />
                              <span>Deactivate / Reset</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Deactivated</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab: Activation Codes */}
        {activeTab === 'codes' && (
          <div className="table-card">
            <div className="table-header">
              <h3>Activation Codes Registry</h3>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search hash or device..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.75rem 0.45rem 2rem',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: 'var(--radius-sm)' }}>
                  {(['ALL', 'UNUSED', 'USED'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setCodeFilter(filter)}
                      style={{
                        padding: '0.3rem 0.6rem',
                        fontSize: '0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        background: codeFilter === filter ? 'var(--accent-primary)' : 'transparent',
                        color: codeFilter === filter ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Code SHA-256 Hash</th>
                    <th>Locked Device ID</th>
                    <th>Created At</th>
                    <th>Used On Device</th>
                    <th>Used Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodes.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                        {loading ? 'Loading activation codes...' : 'No activation codes found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredCodes.map((item) => (
                      <tr key={item.codeHash}>
                        <td>
                          <span className={`badge ${item.status === 'UNUSED' ? 'badge-success' : 'badge-warning'}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="mono" style={{ fontSize: '0.8rem', color: '#93c5fd' }}>
                          {item.codeHash.slice(0, 16)}...
                        </td>
                        <td className="mono" style={{ fontSize: '0.75rem', color: item.targetDeviceId ? '#fbbf24' : 'var(--text-muted)' }}>
                          {item.targetDeviceId || 'Any Device'}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}
                        </td>
                        <td className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {item.usedDeviceId || '-'}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {item.usedAt ? new Date(item.usedAt).toLocaleString() : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab: Users */}
        {activeTab === 'users' && (
          <div className="table-card">
            <div className="table-header">
              <h3>Registered Users & Google Accounts</h3>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Email Address</th>
                    <th>Firebase UID</th>
                    <th>Bound Device</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                        No registered users yet. Users will appear here once they sign in with Google on the SS-Stock APK.
                      </td>
                    </tr>
                  ) : (
                    usersList.map((user) => (
                      <tr key={user.uid}>
                        <td>
                          <span className={`badge ${user.status === 'ACTIVE' ? 'badge-success' : user.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>
                            {user.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{user.email || 'N/A'}</td>
                        <td className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {user.uid.slice(0, 16)}...
                        </td>
                        <td className="mono" style={{ fontSize: '0.75rem', color: '#93c5fd' }}>
                          {user.deviceId || 'None'}
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                            onClick={() => handleToggleUserStatus(user.uid, user.status)}
                          >
                            {user.status === 'ACTIVE' ? (
                              <>
                                <Lock size={12} color="#ef4444" />
                                <span>Block User</span>
                              </>
                            ) : (
                              <>
                                <Unlock size={12} color="#10b981" />
                                <span>Activate</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Firebase Configuration Modal */}
      {isConfigOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Firebase Project Configuration</h3>
              <button className="close-btn" onClick={() => setIsConfigOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveConfig}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Copy the Web App configuration from your Firebase Console (Project Settings → General → Your Apps → Web App).
              </p>

              <div className="form-group">
                <label className="form-label">Database URL (Required for Realtime DB):</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="https://your-project-default-rtdb.firebaseio.com"
                  value={config.databaseURL}
                  onChange={(e) => setConfig({ ...config, databaseURL: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">API Key (Web API Key):</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="AIzaSy..."
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Project ID:</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="ss-stock-12345"
                  value={config.projectId}
                  onChange={(e) => setConfig({ ...config, projectId: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Auth Domain:</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="ss-stock-12345.firebaseapp.com"
                  value={config.authDomain}
                  onChange={(e) => setConfig({ ...config, authDomain: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">App ID:</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="1:123456789:web:abcdef"
                  value={config.appId}
                  onChange={(e) => setConfig({ ...config, appId: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setIsConfigOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save & Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
