
export interface InMemoryData {
    id: string;
    [key: string]: unknown;
}

export class InMemoryCollection<Data extends InMemoryData = InMemoryData> {
    #documents: Record<string, Data> = {}

    async findById(id: string) {
        return this.#documents[id]
    }

    async findByCredentials(id: string, secret: string) {
        return this.#documents[id]?.secret === secret ? this.#documents[id] : undefined
    }

    async insertOne(data: Data) {
        this.#documents[data.id] = data
    }
}

export type User = InMemoryData & {
    name: string
    given_name?: string
    email?: string
}

export type Client = InMemoryData & {
    name: string
    secret?: string
    details?: User
}

const users = new InMemoryCollection<User>();

const user1: User = {
    id: 'machine-123',
    name: 'ingestor-prod-01'
}

const user2: User = {
    id: '248289761001',
    name: 'Jane Doe',
    given_name: 'Jane',
    email: 'janed@example.com'
}

users.insertOne(user1)
users.insertOne(user2)

const clients = new InMemoryCollection<Client>();

clients.insertOne({
    id: 'svc-data-ingestor',
    name: 'Data Ingestor Service',
    secret: '123',
    user: user1
})
clients.insertOne({
    id: 'public-app',
    name: 'Jane Doe',
})
clients.insertOne({
    id: 'device-app',
    name: 'Device App Service'
})

export default {
    clients,
    users
}
