export async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
    onProgress?: (done: number, total: number) => void,
    onResult?: (result: R, index: number) => void
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    let done = 0;

    const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
            const i = nextIndex++;
            if (i >= items.length) return;
            results[i] = await mapper(items[i], i);
            done++;
            onResult?.(results[i], i);
            onProgress?.(done, items.length);
        }
    });

    await Promise.all(workers);
    return results;
}
