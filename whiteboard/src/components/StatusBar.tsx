import { useEffect, useState } from 'react';
import { WorkerClient, type ConnectionState } from '../services/WorkerClient';
import logoImage from '../../logo.png';

interface StatusBarProps {
  onLoginClick: () => void;
  statusMessage?: string;
  nextSyncMessage?: string;
}

export function StatusBar({ onLoginClick, statusMessage, nextSyncMessage }: StatusBarProps) {
  const [conn, setConn] = useState<ConnectionState>(WorkerClient.getConnectionState());
  const [user, setUser] = useState(WorkerClient.getAuth());
  const [counts, setCounts] = useState(() => WorkerClient.getConnectedClients());

  useEffect(() => {
    const handleConn = (state: ConnectionState) => setConn(state);
    const handleCounts = (msg: any) => setCounts(msg);
    const handleErr = (_e: Error) => setConn('error');

    WorkerClient.onConnectionState(handleConn);
    WorkerClient.onConnectedClients(handleCounts);
    WorkerClient.onError(handleErr);

    return () => {
      WorkerClient.offConnectionState(handleConn);
      WorkerClient.offConnectedClients(handleCounts as any);
      WorkerClient.offError(handleErr);
    };
  }, []);

  useEffect(() => {
    setUser(WorkerClient.getAuth());
  }, [conn]);

  const color = conn === 'connected' ? '#16a34a' : conn === 'connecting' ? '#f59e0b' : conn === 'error' ? '#ef4444' : '#6b7280';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 36,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px', background: 'white', borderBottom: '1px solid #e5e7eb', zIndex: 1000
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img
          src={logoImage}
          alt="CloudConstruct Logo"
          style={{
            height: "24px",
            width: "24px",
            objectFit: "contain",
          }}
        />
        <span style={{ fontWeight: 600 }}>CloudConstruct</span>
        <span style={{ fontSize: 12, color }}>
          {conn === 'connected' ? 'Connected' : conn === 'connecting' ? 'Connecting…' : conn === 'error' ? 'Error' : 'Disconnected'}
        </span>
        {counts && (
          <span style={{ fontSize: 12, color: '#374151' }}>
            WS (CLI: {counts.vsc} · Whiteboard: {counts.excalidraw})
         </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {statusMessage && (
          <span style={{ fontSize: 12, color: '#1f2937' }}>{statusMessage}</span>
        )}
        {nextSyncMessage && (
          <span style={{ fontSize: 12, color: '#6b7280' }}>{nextSyncMessage}</span>
        )}
        {user.username ? (
          <span style={{ fontSize: 12, color: '#374151' }}>Signed in as <strong>{user.username}</strong></span>
        ) : (
          <button onClick={onLoginClick} style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb' }}>Login / Register</button>
        )}
      </div>
    </div>
  );
}
