

export class InMemoryTmpCache<T = string | number> {
    private values: Record<string, NodeJS.Timeout> = {}

    async has(value: T): Promise<boolean> {
        if (this.values[`${value}`]) {
            return true
        }
        return false
    }

    async set(value: T, ttlSeconds: number): Promise<void> {
        const to = this.values[`${value}`]
        if (to) {
            clearTimeout(to)
        }
        this.values[`${value}`] = setTimeout(() => {
            delete this.values[`${value}`]
        }, ttlSeconds * 1000)
    }
}