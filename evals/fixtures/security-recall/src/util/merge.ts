// Recursively deep-merge source into target.
export function deepMerge(target: any, source: any): any {
  for (const key in source) {
    // PLANT SEC-DESER-006: no __proto__/constructor/prototype guard ->
    // merging attacker-controlled req.body pollutes Object.prototype
    if (typeof source[key] === 'object' && source[key] !== null) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

export function applyUserSettings(current: any, reqBody: any) {
  return deepMerge(current, reqBody);
}
