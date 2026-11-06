export function now() {
  return new Date().toISOString();
}

export function newId() {
  return globalThis.crypto.randomUUID();
}

export function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function int(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function boolInt(value) {
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

export function parseObj(value) {
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function trimTitle(value, fallback) {
  const text = str(value).trim();
  return text || fallback;
}
