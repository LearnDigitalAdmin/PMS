// Units.ts - shared unit vocabulary (type, size, condition, status) and helpers.
// A unit is the rentable thing inside a property. Price, deposit, size, type, condition and
// availability live on the unit; a tenant only points at one (tenants.unit_id).

export type UnitType = 'residential' | 'commercial';
export type UnitSize =
  | 'single_room' | 'bedsitter' | 'studio' | 'one_bedroom' | 'two_bedroom' | 'three_bedroom' | 'maisonette'
  | 'shop' | 'office' | 'stall' | 'warehouse'
  | 'other';
export type UnitCondition = 'new' | 'maintained' | 'old';
export type UnitStatus = 'vacant' | 'occupied' | 'maintenance';

export interface UnitSizeOption {
  value: UnitSize;
  label: string;
  /** Prefix of the generated unit id, e.g. BS-01 */
  code: string;
  type: UnitType | 'any';
}

export const UNIT_SIZES: UnitSizeOption[] = [
  { value: 'single_room', label: 'Single room', code: 'SR', type: 'residential' },
  { value: 'bedsitter', label: 'Bedsitter', code: 'BS', type: 'residential' },
  { value: 'studio', label: 'Studio', code: 'ST', type: 'residential' },
  { value: 'one_bedroom', label: 'One bedroom', code: '1B', type: 'residential' },
  { value: 'two_bedroom', label: 'Two bedroom', code: '2B', type: 'residential' },
  { value: 'three_bedroom', label: 'Three bedroom', code: '3B', type: 'residential' },
  { value: 'maisonette', label: 'Maisonette', code: 'MS', type: 'residential' },
  { value: 'shop', label: 'Shop', code: 'SH', type: 'commercial' },
  { value: 'office', label: 'Office', code: 'OF', type: 'commercial' },
  { value: 'stall', label: 'Stall', code: 'SL', type: 'commercial' },
  { value: 'warehouse', label: 'Warehouse', code: 'WH', type: 'commercial' },
  { value: 'other', label: 'Other', code: 'UN', type: 'any' }
];

export const UNIT_CONDITIONS: { value: UnitCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'maintained', label: 'Maintained' },
  { value: 'old', label: 'Old' }
];

export const UNIT_STATUSES: { value: UnitStatus; label: string }[] = [
  { value: 'vacant', label: 'Vacant' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'maintenance', label: 'Under maintenance' }
];

/** One row of the "add units" builder: `count` identical units. */
export interface UnitSpec {
  unitType: UnitType;
  unitSize: UnitSize;
  count: number;
  rentAmount: number;
  depositAmount: number;
  condition: UnitCondition;
}

/** Hard cap per property. Unit ids are propertyId * 1000 + n, so n must stay below 1000. */
export const MAX_UNITS_PER_PROPERTY = 999;

export const sizesForType = (type: UnitType): UnitSizeOption[] =>
  UNIT_SIZES.filter(s => s.type === type || s.type === 'any');

export const unitSizeLabel = (size?: string | null): string =>
  UNIT_SIZES.find(s => s.value === size)?.label ?? 'Unit';

export const unitSizeCode = (size?: string | null): string =>
  UNIT_SIZES.find(s => s.value === size)?.code ?? 'UN';

export const unitConditionLabel = (c?: string | null): string =>
  UNIT_CONDITIONS.find(x => x.value === c)?.label ?? 'Maintained';

export const unitStatusLabel = (s?: string | null): string =>
  UNIT_STATUSES.find(x => x.value === s)?.label ?? 'Vacant';

export const normalizeUnitType = (v: unknown): UnitType => (v === 'commercial' ? 'commercial' : 'residential');
export const normalizeUnitSize = (v: unknown): UnitSize =>
  (UNIT_SIZES.some(s => s.value === v) ? v : 'other') as UnitSize;
export const normalizeUnitCondition = (v: unknown): UnitCondition =>
  (v === 'new' || v === 'old' ? v : 'maintained') as UnitCondition;
export const normalizeUnitStatus = (v: unknown): UnitStatus =>
  (v === 'occupied' || v === 'maintenance' ? v : 'vacant') as UnitStatus;

/** Checks the builder rows. Returns an error message, or null when they are valid. */
export const validateUnitSpecs = (specs: UnitSpec[]): string | null => {
  if (!specs.length) return 'Add at least one unit';
  let total = 0;
  for (const s of specs) {
    if (!Number.isInteger(s.count) || s.count < 1) return 'Each unit row needs a count of at least 1';
    if (!(s.rentAmount > 0)) return 'Each unit row needs a rent amount greater than 0';
    if (s.depositAmount < 0 || Number.isNaN(s.depositAmount)) return 'Deposit cannot be negative';
    total += s.count;
  }
  if (total > MAX_UNITS_PER_PROPERTY) return `A property can have at most ${MAX_UNITS_PER_PROPERTY} units`;
  return null;
};
