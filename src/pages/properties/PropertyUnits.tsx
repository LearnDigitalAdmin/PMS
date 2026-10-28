import React, { useCallback, useEffect, useState } from 'react';
import { database, type Unit, type Tenant } from '../../services/database/Database';
import {
  unitSizeLabel, unitConditionLabel, unitStatusLabel
} from '../../services/database/Units';

interface PropertyUnitsProps {
  propertyId: number;
  /** Changes whenever the tenants list changes, so unit status is reloaded. */
  refreshKey?: unknown;
}

const statusStyle: Record<string, string> = {
  vacant: 'bg-green-100 text-green-700',
  occupied: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-amber-100 text-amber-700'
};

const PropertyUnits: React.FC<PropertyUnitsProps> = ({ propertyId, refreshKey }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setUnits(await database.getUnitsByProperty(propertyId));
    setTenants(await database.getTenantsByProperty(propertyId));
  }, [propertyId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const toggleMaintenance = async (unit: Unit) => {
    try {
      setError('');
      await database.setUnitStatus(unit.id, unit.status === 'maintenance' ? 'vacant' : 'maintenance');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the unit');
    }
  };

  const count = (status: string) => units.filter(u => u.status === status).length;
  const tenantOf = (unit: Unit) => tenants.find(t => t.unitId === unit.id)?.name;

  return (
    <div className="bg-surface rounded-xl border border-line-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-lg font-medium text-ink">Units</h3>
        <p className="text-xs text-ink-subtle">
          {units.length} total · {count('vacant')} vacant · {count('occupied')} occupied · {count('maintenance')} under maintenance
        </p>
      </div>

      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      {units.length === 0 ? (
        <p className="text-sm text-ink-subtle">No units yet. Use Edit Property to add units.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-subtle text-xs">
                <th className="py-2 pr-3">Unit</th>
                <th className="pr-3">Type</th>
                <th className="pr-3">Condition</th>
                <th className="pr-3">Rent</th>
                <th className="pr-3">Deposit</th>
                <th className="pr-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {units.map(u => (
                <tr key={u.id} className="border-t border-line-soft">
                  <td className="py-2 pr-3 font-medium text-ink">{u.unitNumber}</td>
                  <td className="pr-3 text-ink-soft">{unitSizeLabel(u.unitSize)} · {u.unitType}</td>
                  <td className="pr-3 text-ink-soft">{unitConditionLabel(u.condition)}</td>
                  <td className="pr-3 text-ink-soft">KES {u.rentAmount.toLocaleString()}</td>
                  <td className="pr-3 text-ink-soft">KES {u.depositAmount.toLocaleString()}</td>
                  <td className="pr-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${statusStyle[u.status]}`}>{unitStatusLabel(u.status)}</span>
                    {u.status === 'occupied' && tenantOf(u) && <span className="ml-2 text-xs text-ink-subtle">{tenantOf(u)}</span>}
                  </td>
                  <td className="text-right">
                    {u.status !== 'occupied' && (
                      <button type="button" onClick={() => toggleMaintenance(u)} className="text-xs text-blue-600 hover:underline">
                        {u.status === 'maintenance' ? 'Mark vacant' : 'Under maintenance'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PropertyUnits;
