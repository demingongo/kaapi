
import { GroupAuthUtil, OAuth2Util } from '@novice1/api-doc-generator'
import { BaseAuthUtil } from '@novice1/api-doc-generator/lib/utils/auth/baseAuthUtils';

/**
 * Special class to set host
 * for Postman
 */
export class MultiAuthUtil extends OAuth2Util {
    protected authUtils: BaseAuthUtil[]
    protected groupAuth: GroupAuthUtil
    constructor(authUtils: BaseAuthUtil[]) {
        super('');
        this.authUtils = authUtils
        this.groupAuth = new GroupAuthUtil(authUtils)
    }

    setHost(host: string) {
        this.authUtils.forEach(builder => {
            if (builder instanceof OAuth2Util) {
                builder.setHost(host)
            }
        })
        return super.setHost(host);
    }

    removeHost() {
        this.authUtils.forEach(builder => {
            if (builder instanceof OAuth2Util) {
                builder.removeHost()
            }
        })
        return super.removeHost();
    }

    toPostman() {
        return this.groupAuth.toPostman();
    }

    toOpenAPISecurity() {
        return this.groupAuth.toOpenAPISecurity();
    }

    toOpenAPI() {
        return this.groupAuth.toOpenAPI();
    }
}