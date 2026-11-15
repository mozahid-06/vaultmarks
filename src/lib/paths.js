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
