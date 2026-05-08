import type { RouteModifierObject } from './services/docs/modifiers';
import type { ReqRef, ReqRefDefaults } from '@hapi/hapi';
import type { KaapiServerRoute } from '@kaapi/server';

/**
 * Apply modifiers to a server route.
 * @param serverRoute The server route to which the modifiers will be applied.
 * @param modifiers A function that returns the modifiers to be applied to the server route.
 * @returns The server route with the applied modifiers.
 */
export function applyModifiers<Refs extends ReqRef = ReqRefDefaults>(
    serverRoute: KaapiServerRoute<Refs>,
    modifiers: (() => RouteModifierObject) | RouteModifierObject
): KaapiServerRoute<Refs> {
    if (!serverRoute.options) {
        serverRoute.options = {};
    }
    if (typeof serverRoute.options != 'object') {
        throw new Error('serverRoute.options should be an object');
    }
    if (!serverRoute.options.plugins) {
        serverRoute.options.plugins = {};
    }
    if (!serverRoute.options.plugins.kaapi) {
        serverRoute.options.plugins.kaapi = {};
    }
    if (!serverRoute.options.plugins.kaapi.docs) {
        serverRoute.options.plugins.kaapi.docs = {};
    }
    const docs = serverRoute.options.plugins.kaapi.docs;
    docs.modifiers = typeof modifiers === 'function' ? modifiers : () => modifiers;
    return serverRoute;
}
