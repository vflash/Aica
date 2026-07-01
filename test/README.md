# AICA Tests

## Unit Tests

npm test
npm run test:unit

## Integration Tests

npm run test:integration
npm run test:integration:local
npm run test:integration:remote

## Environment Variables

AICA_BASE_URL - server URL
AICA_PASSWORD - server password

## Examples

Local: AICA_BASE_URL=http://localhost:3000 AICA_PASSWORD=secret npm run test:integration
Remote: AICA_BASE_URL=http://aica.ooko.pro AICA_PASSWORD=cmj3it64 npm run test:integration
Empty: AICA_BASE_URL=http://localhost:3000 AICA_PASSWORD="" npm run test:integration

## Server Parameters

node bin/aica.js aidev --password mysecret
node bin/aica.js aidev --password ""
node bin/aica.js aidev --port 8080 --password secret --auto