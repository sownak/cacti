// tslint:disable-next-line: no-var-requires
const tap = require('tap');
import { PluginLedgerConnectorBesu, PluginFactoryLedgerConnector } from '../../../../../main/typescript/public-api';
import { BesuTestLedger } from '@hyperledger-labs/bif-test-tooling';
import HelloWorldContractJson from '../../../../solidity/hello-world-contract/HelloWorld.json';

tap.test('deploys contract via .json file', async (assert: any) => {
  assert.plan(1);

  const besuTestLedger = new BesuTestLedger();
  await besuTestLedger.start();

  const rpcApiHttpHost = await besuTestLedger.getRpcApiHttpHost();

  const factory = new PluginFactoryLedgerConnector();
  const connector: PluginLedgerConnectorBesu = await factory.create({rpcApiHttpHost });

  const out = await connector.deployContractInternal(HelloWorldContractJson);
  assert.ok(out);
  assert.end();
});
