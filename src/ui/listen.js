export function rebinder() {
  let bound = [];
  return (entries) => {
    for (const [target, type, fn] of bound) target.removeEventListener(type, fn);
    for (const [target, type, fn] of entries) target.addEventListener(type, fn);
    bound = entries;
  };
}
