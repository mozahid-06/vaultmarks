export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  const workers = Math.max(1, Math.min(limit, items.length));
  let next = 0;

  const run = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: workers }, run));
  return results;
}
