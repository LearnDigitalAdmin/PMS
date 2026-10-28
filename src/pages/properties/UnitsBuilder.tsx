import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  UNIT_CONDITIONS, sizesForType, type UnitSpec, type UnitType
} from '../../services/database/Units';

interface UnitsBuilderProps {
  specs: UnitSpec[];
  onChange: (specs: UnitSpec[]) => void;
  error?: string;
  /** Edit mode: units are optional and are added to the ones the property already has. */
  optional?: boolean;
}

export const newUnitSpec = (unitType: UnitType = 'residential'): UnitSpec => ({
  unitType,
  unitSize: sizesForType(unitType)[0].value,
  count: 1,
  rentAmount: 0,
  depositAmount: 0,
  condition: 'maintained'
});

const inputCls = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';

const UnitsBuilder: React.FC<UnitsBuilderProps> = ({ specs, onChange, error, optional }) => {
  const update = (i: number, patch: Partial<UnitSpec>) =>
    onChange(specs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const changeType = (i: number, unitType: UnitType) =>
    update(i, { unitType, unitSize: sizesForType(unitType)[0].value });

  const total = specs.reduce((sum, s) => sum + (s.count || 0), 0);

  return (
    <div>
      <label className="block text-sm font-medium text-ink-soft mb-2">
        {optional ? 'Add more units' : 'Units *'}
      </label>

      <div className="space-y-3">
        {specs.map((spec, i) => (
          <div key={i} className="border border-line rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={spec.unitType} onChange={(e) => changeType(i, e.target.value as UnitType)} className={inputCls}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
              <select value={spec.unitSize} onChange={(e) => update(i, { unitSize: e.target.value as UnitSpec['unitSize'] })} className={inputCls}>
                {sizesForType(spec.unitType).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-ink-subtle">How many
                <input type="number" min={1} value={spec.count || ''} className={inputCls}
                  onChange={(e) => update(i, { count: Math.floor(Number(e.target.value)) })} />
              </label>
              <label className="text-xs text-ink-subtle">Rent (KES)
                <input type="number" min={0} value={spec.rentAmount || ''} className={inputCls}
                  onChange={(e) => update(i, { rentAmount: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-ink-subtle">Deposit (KES)
                <input type="number" min={0} value={spec.depositAmount || ''} className={inputCls}
                  onChange={(e) => update(i, { depositAmount: Number(e.target.value) })} />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <select value={spec.condition} onChange={(e) => update(i, { condition: e.target.value as UnitSpec['condition'] })} className={inputCls}>
                {UNIT_CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button type="button" onClick={() => onChange(specs.filter((_, idx) => idx !== i))}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg" aria-label="Remove unit row">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => onChange([...specs, newUnitSpec()])}
        className="mt-3 flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
        <Plus className="w-4 h-4" /> Add unit type
      </button>

      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      <p className="text-ink-subtle text-xs mt-1">{total} unit{total === 1 ? '' : 's'} will be created</p>
    </div>
  );
};

export default UnitsBuilder;
