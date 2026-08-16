import inert from '@hapi/inert';
import { Kaapi, BearerAuthDesign } from '@kaapi/kaapi';
import Joi from 'joi';
import fs from 'node:fs';
import path from 'node:path';
import Stream, { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// 1. Setup bearer auth strategy
const bearerAuthDesign = new BearerAuthDesign({
    auth: {
        async validate(_, token) {
            if (token === 'secret-token') {
                return {
                    isValid: true,
                    credentials: {
                        user: {
                            name: 'admin',
                        },
                    },
                };
            }
            return { isValid: false };
        },
    },
});

// 2. Initialize Kaapi with bearer strategy
const app = new Kaapi({
    port: 3000,
    host: 'localhost',
    extend: [bearerAuthDesign],
    routes: {
        auth: {
            strategy: bearerAuthDesign.getStrategyName(),
            mode: 'try',
        },
        validate: {
            failAction: async (_request, _h, err) => {
                // Just rethrow the original error so Hapi includes full Joi details in the response
                throw err;
            },
        },
    },
});

async function start() {
    // 3. Register hapi-inert for file support
    await app.base().register(inert);

    // 5. Start the server
    await app.listen();
    app.log.info('Server running on', app.base().info.uri);
}

start();

// 4. Register the protected route
app.route<{
    Payload: {
        firstName?: string;
        lastName?: string;
        resume: {
            _data: Stream;
            hapi: {
                filename: string;
                headers: { 'content-type': string };
            };
        };
    };
}>(
    {
        method: 'POST',
        path: '/profile/update',
        options: {
            description: 'Update user profile with resume upload',
            tags: ['Profile'],
            validate: {
                payload: Joi.object({
                    firstName: Joi.string().max(50),
                    lastName: Joi.string().max(50),
                    resume: Joi.object().required().tag('files'),
                }),
            },
            payload: {
                output: 'stream',
                parse: true,
                allow: 'multipart/form-data',
                multipart: { output: 'stream' },
                maxBytes: 1024 * 3_000, // 3MB
            },
            auth: {
                strategy: bearerAuthDesign.getStrategyName(),
                mode: 'required',
            },
        },
    },
    async ({ payload }) => {
        const { firstName, lastName, resume } = payload;

        // Save the resume file
        const uploadPath = path.join(__dirname, '..', 'uploads', resume.hapi.filename);
        await pipeline(
            resume._data as Readable,
            fs.createWriteStream(uploadPath)
        );

        return {
            message: 'Profile updated',
            uploaded: resume.hapi.filename,
            firstName,
            lastName,
        };
    }
);
