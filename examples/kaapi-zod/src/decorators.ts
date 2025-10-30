import { z } from 'zod/v4';

// Zod schema
const userSchema = z.object({
    name: z.string(),
    age: z.number().int().positive(),
});

/*
// Decorator factory with correct return type
function Validate(schema: z.ZodSchema<any>): MethodDecorator {
    return function (
        _target: object,
        _propertyKey: string | symbol,
        descriptor: TypedPropertyDescriptor<any>
    ): void {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: any[]) {
            const result = schema.safeParse(args[0]);
            if (!result.success) {
                throw new Error(`Validation failed: ${result.error.message}`);
            }
            return originalMethod.apply(this, args);
        };
    };
}
*/

/*
// 2. Create a generic decorator
function Validate<T extends z.ZodTypeAny>(schema: T): MethodDecorator {
    return (
        target: object,
        propertyKey: string | symbol,
        descriptor: TypedPropertyDescriptor<(data: z.infer<T>) => any>
    ) => {
        const originalMethod = descriptor.value!;
        descriptor.value = function (data: z.infer<T>) {
            const result = schema.safeParse(data);
            if (!result.success) {
                throw new Error(`Validation failed: ${result.error.message}`);
            }
            return originalMethod.call(this, data);
        };
    };
}*/

// Generic decorator factory
function Validate<T extends z.ZodTypeAny>(schema: T): MethodDecorator {
    return (
        _target: object,
        _propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ) => {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: any[]) {
            const result = schema.safeParse(args[0]);
            if (!result.success) {
                throw new Error(`Validation failed: ${result.error.message}`);
            }
            return originalMethod.apply(this, args);
        };
    };
}

class UserService {
    @Validate(userSchema)
    createUser(data: { name: string, age: number }) {
        console.log('User created:', data);
    }
}

const service = new UserService();
service.createUser({ name: 'Alice', age: 30 }); // ✅ Valid
service.createUser({ name: 'Bob', age: -5 });   // ❌ Throws validation error
