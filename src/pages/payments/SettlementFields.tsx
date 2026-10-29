import { useEffect, useState } from 'react';

export type SettlementType = 'mpesa' | 'airtel-ke' | 'till' | 'bank';
export interface KenyaBank { name: string; code: string }

interface Props {
  settlementBank: SettlementType;
  setSettlementBank: (v: SettlementType) => void;
  bankCode: string;
  setBankCode: (v: string) => void;
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  loadBanks: () => Promise<KenyaBank[]>;
}

const input = 'w-full px-4 py-3 border border-line-strong rounded-lg focus:ring-2 focus:ring-indigo-500';
const label = 'block text-sm font-medium text-ink-soft mb-2';
const hint = 'text-xs text-ink-subtle mt-1';

const COPY: Record<SettlementType, { placeholder: string; help: string }> = {
  mpesa: { placeholder: '254712345678', help: 'Your M-Pesa registered phone number' },
  'airtel-ke': { placeholder: '254733123456', help: 'Your Airtel Money registered phone number' },
  till: { placeholder: '5123456', help: 'Your M-Pesa Buy Goods Till number' },
  bank: { placeholder: '0123456789', help: 'Your bank account number' },
};

/** Settlement destination: M-Pesa / Airtel phone, M-Pesa Till, or a Kenyan bank (banks only, never mobile money). */
export default function SettlementFields(p: Props) {
  const [banks, setBanks] = useState<KenyaBank[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (p.settlementBank !== 'bank' || banks.length || loading) return;
    setLoading(true);
    p.loadBanks()
      .then(setBanks)
      .catch(() => setErr('Could not load banks. Try again.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.settlementBank]);

  const shown = banks.filter(
    (b) => b.code === p.bankCode || b.name.toLowerCase().includes(filter.trim().toLowerCase())
  );
  const c = COPY[p.settlementBank];

  return (
    <>
      <div>
        <label className={label}>Settle to</label>
        <select
          value={p.settlementBank}
          onChange={(e) => { p.setSettlementBank(e.target.value as SettlementType); p.setBankCode(''); }}
          required
          className={input}
        >
          <option value="mpesa">M-Pesa (phone number)</option>
          <option value="till">M-Pesa Till</option>
          <option value="bank">Bank account</option>
          <option value="airtel-ke">Airtel Money (Kenya)</option>
        </select>
      </div>

      {p.settlementBank === 'bank' && (
        <div>
          <label className={label}>Bank</label>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={loading ? 'Loading banks…' : 'Search bank'}
            className={input + ' mb-2'}
          />
          <select value={p.bankCode} onChange={(e) => p.setBankCode(e.target.value)} required className={input}>
            <option value="">Select a bank</option>
            {shown.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
          {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
        </div>
      )}

      <div>
        <label className={label}>
          {p.settlementBank === 'till' ? 'Till Number' : p.settlementBank === 'bank' ? 'Account Number' : 'Phone Number'}
        </label>
        <input
          type="text"
          inputMode={p.settlementBank === 'bank' ? 'numeric' : 'tel'}
          value={p.accountNumber}
          onChange={(e) => p.setAccountNumber(e.target.value)}
          required
          className={input}
          placeholder={c.placeholder}
        />
        <p className={hint}>{c.help}</p>
      </div>
    </>
  );
}
