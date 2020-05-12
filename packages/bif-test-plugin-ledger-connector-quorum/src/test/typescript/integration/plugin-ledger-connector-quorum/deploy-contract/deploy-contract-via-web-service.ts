// tslint:disable-next-line: no-var-requires
const tap = require('tap');
import { QuorumTestLedger, IQuorumGenesisOptions, IAccount } from '@hyperledger-labs/bif-test-tooling';
import HelloWorldContractJson from '../../../../solidity/hello-world-contract/HelloWorld.json';
import { Logger, LoggerProvider } from '@hyperledger-labs/bif-common';
import { Web3EthContract, IQuorumDeployContractOptions, PluginLedgerConnectorQuorum, PluginFactoryLedgerConnector } from '@hyperledger-labs/bif-plugin-ledger-connector-quorum';
import { ApiServer, ConfigService } from '@hyperledger-labs/bif-cmd-api-server';
import { IBifApiServerOptions } from '@hyperledger-labs/bif-cmd-api-server/dist/types/main/typescript/config/config-service';

const log: Logger = LoggerProvider.getOrCreate({ label: 'test-deploy-contract-via-web-service', level: 'trace' })

tap.test('pulls up API server and deploys contract via REST API', async (assert: any) => {

  const configService = new ConfigService();
  // const config = configService.getOrCreate();
  const config = configService.newExampleConfigConvict();
  // config.set('bifNodeId', exampleConfig.bifNodeId);
  // config.set('storagePluginPackage', exampleConfig.storagePluginPackage);
  // config.set('privateKey', exampleConfig.privateKey);
  // config.set('publicKey',  exampleConfig.publicKey);
  config.set('apiCorsDomainCsv', '*');
  config.set('configFile', null);
  config.set('apiPort', 0);
  const apiServer = new ApiServer({ config });
  await apiServer.start();

  const quorumTestLedger = new QuorumTestLedger({ containerImageVersion: '1.0.0' });
  await quorumTestLedger.start();

  assert.tearDown(async () => {
    log.debug(`Starting teardown...`);
    await quorumTestLedger.stop();
    log.debug(`Stopped container OK.`);
    await quorumTestLedger.destroy();
    log.debug(`Destroyed container OK.`);
  });

  const rpcApiHttpHost = await quorumTestLedger.getRpcApiHttpHost();
  const quorumGenesisOptions: IQuorumGenesisOptions = await quorumTestLedger.getGenesisJsObject();
  assert.ok(quorumGenesisOptions);
  assert.ok(quorumGenesisOptions.alloc);

  const highNetWorthAccounts: string[] = Object.keys(quorumGenesisOptions.alloc).filter((address: string) => {
    const anAccount: IAccount = quorumGenesisOptions.alloc[address];
    const balance: number = parseInt(anAccount.balance, 10);
    return balance > 10e7;
  });
  const [firstHighNetWorthAccount] = highNetWorthAccounts;

  const factory = new PluginFactoryLedgerConnector();
  const connector: PluginLedgerConnectorQuorum = await factory.create({ rpcApiHttpHost });

  const options: IQuorumDeployContractOptions = {
    ethAccountUnlockPassword: '',
    fromAddress: firstHighNetWorthAccount,
    contractJsonArtifact: HelloWorldContractJson,
  };

  const contract: Web3EthContract = await connector.deployContract(options);
  assert.ok(contract);

  const contractMethod = contract.methods.sayHello();
  assert.ok(contractMethod);

  const callResponse = await contractMethod.call({ from: firstHighNetWorthAccount });
  log.debug(`Got message from smart contract method:`, { callResponse });
  assert.ok(callResponse);

  assert.end();
  log.debug('Assertion ended OK.');
});
