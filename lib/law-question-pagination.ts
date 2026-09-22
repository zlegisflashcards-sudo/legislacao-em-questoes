export async function collectPages<T>(loadPage: (from: number, to: number) => Promise<T[]>, pageSize: number) {
  const items: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await loadPage(offset, offset + pageSize - 1);
    items.push(...page);
    if (page.length < pageSize) return items;
  }
}
