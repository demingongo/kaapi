export interface CacheSet<T extends string | number> {
    has(value: T): Promise<boolean>;
    delete(value: T): Promise<void>;
    add(value: T, ttlSeconds: number): Promise<void>;
}

export class InMemoryTmpCache<T extends string | number = string | number> implements CacheSet<T> {
    private values: Record<string, NodeJS.Timeout> = {}

    async has(value: T): Promise<boolean> {
        if (this.values[`${value}`]) {
            return true
        }
        return false
    }

    async delete(value: T): Promise<void> {
        delete this.values[`${value}`]
    }

    async add(value: T, ttlSeconds: number): Promise<void> {
        const to = this.values[`${value}`]
        if (to) {
            clearTimeout(to)
        }
        this.values[`${value}`] = setTimeout(async () => {
            await this.delete(value)
        }, ttlSeconds * 1000)
    }
}

export type StringCacheSet = CacheSet<string>