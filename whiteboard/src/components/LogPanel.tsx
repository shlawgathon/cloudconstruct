import { useEffect, useMemo, useState } from 'react';
import { WorkerClient } from '../services/WorkerClient';

type Level = 'debug' | 'info' | 'warn' | 'error';

export function LogPanel() {
  const [logs, setLogs] = useState<{ ts: number; level: Level; text: string }[]>([]);
  const [filter, setFilter] = useState<Level | 'all'>('all');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onLog = (level: string, args: any[]) => {
      const text = args.map(a => {
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
      }).join(' ');
      setLogs(prev => [{ ts: Date.now(), level: (level as Level), text }, ...prev].slice(0, 500));
    };
    WorkerClient.onLog(onLog);
    return () => { WorkerClient.offLog(onLog); };
  }, []);

  const filtered = useMemo(() => logs.filter(l => filter === 'all' || l.level === filter), [logs, filter]);

  return (
    <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 1000 }}>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#111827', color: 'white', fontSize: 12 }}>
          Open Logs ({logs.length})
        </button>
      )}
      {open && (
        <div style={{ width: 420, height: 280, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 8, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filter} onChange={e => setFilter(e.target.value as any)} style={{ fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px' }}>
                <option value="all">All</option>
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>
              <button onClick={() => setLogs([])} style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb' }}>Clear</button>
            </div>
            <button onClick={() => setOpen(false)} style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb' }}>Close</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>
            {filtered.map((l, i) => (
              <div key={i} style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6', color: l.level === 'error' ? '#b91c1c' : l.level === 'warn' ? '#92400e' : '#111827' }}>
                <span style={{ color: '#6b7280', marginRight: 6 }}>{new Date(l.ts).toLocaleTimeString()}</span>
                <span style={{ marginRight: 6, textTransform: 'uppercase', fontWeight: 600 }}>{l.level}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
