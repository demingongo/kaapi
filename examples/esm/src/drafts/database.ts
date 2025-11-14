export interface InMemoryData {
    id: string;
    [key: string]: unknown;
}

export class InMemoryCollection<Data extends InMemoryData = InMemoryData> {
    protected documents: Record<string, Data> = {};

    async findById(id: string) {
        return this.documents[id];
    }

    async findByCredentials(id: string, secret: string) {
        return this.documents[id]?.secret === secret ? this.documents[id] : undefined;
    }

    async insertOne(data: Data) {
        this.documents[data.id] = data;
    }

    async deleteOneWithId(id: string) {
        delete this.documents[id]
    }
}

export type User = InMemoryData & {
    name: string;
    given_name?: string;
    email?: string;
    password?: string;
};

export type Client = InMemoryData & {
    name: string;
    secret?: string;
    details?: User;
};

export type AuthCode = InMemoryData & {
    clientId: string;
    user: string;
    expiresAt: number;
    scope?: string | undefined;
    codeChallenge?: string | undefined;
    nonce?: string | undefined;
}

export class InMemoryUsers extends InMemoryCollection<User> {
    async findByCredentials(email: string, password: string) {
        let result: User | undefined;
        for (const k in this.documents) {
            const user = this.documents[k];
            if (user.email === email && user.password === password) {
                result = user;
                break;
            }
        }
        return result;
    }
}

const users = new InMemoryUsers();

const user1: User = {
    id: 'machine-123',
    name: 'ingestor-prod-01',
};

const user2: User = {
    id: '248289761001',
    name: 'Jane Doe',
    given_name: 'Jane',
    email: 'janed@example.com',
    password: '123',
};

users.insertOne(user1);
users.insertOne(user2);

const clients = new InMemoryCollection<Client>();

clients.insertOne({
    id: 'svc-data-ingestor',
    name: 'Data Ingestor Service',
    secret: '123',
    details: user1,
});
clients.insertOne({
    id: 'public-app',
    name: 'Public App',
    secret: 'public-app',
});
clients.insertOne({
    id: 'device-app',
    name: 'Device App Service',
});

export default {
    clients,
    users,
    authCodes: new InMemoryCollection<AuthCode>()
};
