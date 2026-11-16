export function joinPath(dir, name) {
  return dir === '' || dir == null ? name : `${dir}/${name}`;
}

export function dirOf(key) {
  const slash = String(key).lastIndexOf('/');
  return slash === -1 ? '' : String(key).slice(0, slash);
}

export function baseOf(key) {
  const slash = String(key).lastIndexOf('/');
  return slash === -1 ? String(key) : String(key).slice(slash + 1);
}

export function isUnder(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function remapPath(path, from, to) {
  return isUnder(path, from) ? to + path.slice(from.length) : path;
}

export function dropDestination(source, target) {
  if (source === '') return null;
  if (isUnder(target, source)) return null;
  const destination = joinPath(target, baseOf(source));
  return destination === source ? null : destination;
}
