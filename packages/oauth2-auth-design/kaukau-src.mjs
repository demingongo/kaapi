import { defineConfig } from 'kaukau/config'

export default defineConfig({
  enableLogs: true,
  exitOnFail: true,
  files: 'test',
  ext: '.test.mjs',
  options: {
    bail: false,
    fullTrace: true,
    grep: '',
    ignoreLeaks: false,
    reporter: 'spec',
    retries: 0,
    slow: 10000,
    timeout: 30000,
    ui: 'bdd',
    color: true,
  }
});
