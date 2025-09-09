import { expect } from 'chai'
import { InMemoryReplayStore, ReplayDetector } from '../../src/utils/replay-store'

describe('InMemoryReplayStore', () => {
    let store: ReplayDetector

    beforeEach(() => {
        store = new InMemoryReplayStore<string>()
    })

    it('should return false for a key that was never added', async () => {
        const result = await store.has('nonexistent-key')
        expect(result).to.be.equal(false)
    })

    it('should return true after adding a key', async () => {
        await store.add('my-key', 1) // 1 second TTL
        const result = await store.has('my-key')
        expect(result).to.be.equal(true)
    })

    it('should delete a key manually', async () => {
        await store.add('my-key', 1)
        await store.delete('my-key')
        const result = await store.has('my-key')
        expect(result).to.be.equal(false)
    })

    it('should expire a key after the TTL', async function () {
        this.slow(2000)

        await store.add('temp-key', 1) // 1 second
        const initial = await store.has('temp-key')
        expect(initial).to.be.equal(true)

        await new Promise(resolve => setTimeout(resolve, 1100)) // wait >1s

        const expired = await store.has('temp-key')
        expect(expired).to.be.equal(false)
    })

    it('should reset TTL if key is re-added', async function () {
        this.slow(2000)

        await store.add('rekey', 1)

        // wait 0.5s and re-add with 1s again
        await new Promise(resolve => setTimeout(resolve, 500))
        await store.add('rekey', 1)

        // wait 0.7s — first timer would have expired, but new one should still be valid
        await new Promise(resolve => setTimeout(resolve, 700))

        const result = await store.has('rekey')
        expect(result).to.be.equal(true)
    })
})
