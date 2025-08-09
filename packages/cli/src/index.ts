#! /usr/bin/env node

import { loadKaapiConfig } from './loadConfig';

(async () => {
    const config = await loadKaapiConfig();
    console.log('Loaded kaapi config:', config);
})();