export function isTabView(search) {
  return new URLSearchParams(String(search ?? '')).get('view') === 'tab';
}
