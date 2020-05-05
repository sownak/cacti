import { IPluginLedgerConnector } from '@hyperledger-labs/bif-core-api';
import Web3 from 'web3';
import EEAClient, { IWeb3InstanceExtended } from 'web3-eea';

export interface IPluginLedgerConnectorBesuOptions {
  rpcApiHttpHost: string;
}

export interface ITransactionOptions {
  privateKey?: string;
}

export class PluginLedgerConnectorBesu implements IPluginLedgerConnector {

  private readonly web3: Web3;
  private readonly web3Eea: IWeb3InstanceExtended;

  constructor(public readonly options: IPluginLedgerConnectorBesuOptions) {
    if (!options) {
      throw new Error(`PluginLedgerConnectorBesu#ctor options falsy.`);
    }
    const web3Provider = new Web3.providers.HttpProvider(this.options.rpcApiHttpHost);
    this.web3 = new Web3(web3Provider);
    this.web3Eea = EEAClient(this.web3, 2018);
  }

  public async sendTransaction(options: ITransactionOptions): Promise<any> {
    const txHash = await this.web3Eea.eea.sendRawTransaction(options);
  }

  public async deployContractInternal(contractJsonObject: any): Promise<void> {

    const privateKey = ''; // besu node's private key
    const publicKey = ''; // orion public key of the sender
    const allOrionPublicKeys: string[] = []; // all orion public keys of receipients

    const contractOptions = {
      data: contractJsonObject.options.data,
      // privateFrom : Orion public key of the sender.
      privateFrom: publicKey,
      // privateFor : Orion public keys of recipients or privacyGroupId: Privacy group to receive the transaction
      privateFor: allOrionPublicKeys,
      // privateKey: Ethereum private key with which to sign the transaction.
      privateKey,
    };

    const txHash = await this.web3Eea.eea.sendRawTransaction(contractOptions);

  }

  public deployContract(): Promise<void> {
    return this.sendTransaction({});
  }

  public async addPublicKey(publicKeyHex: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

}
