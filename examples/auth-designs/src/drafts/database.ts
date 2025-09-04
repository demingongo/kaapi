
export interface InMemoryData {
    id: string;
    [key: string]: unknown;
}

export class InMemoryCollection<Data extends InMemoryData = InMemoryData> {
    #documents: Record<string, Data> = {}

    async findById(id: string) {
        return this.#documents[id]
    }

    async insertOne(data: Data) {
        this.#documents[data.id] = data
    }
}

const users = new InMemoryCollection<InMemoryData & {
    name: string
    given_name?: string
    email?: string
}>();

users.insertOne({
    id: 'machine-123',
    name: 'ingestor-prod-01'
})
users.insertOne({
    id: '248289761001',
    name: 'Jane Doe',
    given_name: 'Jane',
    email: 'janed@example.com'
})

const clients = new InMemoryCollection<InMemoryData & {
    name: string
    secret?: string    
}>();

clients.insertOne({
    id: 'svc-data-ingestor',
    name: 'Data Ingestor Service',
    secret: ''
})
clients.insertOne({
    id: 'testabc',
    name: 'Jane Doe'
})
clients.insertOne({
    id: 'device-app',
    name: 'Device App Service'
})

export default {
    clients,
    users
}
