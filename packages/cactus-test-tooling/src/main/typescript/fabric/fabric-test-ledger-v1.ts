import Docker, { Container, ContainerInfo } from "dockerode";
import axios from "axios";
import Joi from "joi";
import { EventEmitter } from "events";
import { ITestLedger } from "../i-test-ledger";

/*
 * Contains options for Fabric container
 */
export interface IFabricTestLedgerConstructorOptions {
  containerImageVersion?: string;
  containerImageName?: string;
  opsApiHttpPort?: number;
}

/*
 * Provides default options for Fabric container
 */
export const FABRIC_TEST_LEDGER_DEFAULT_OPTIONS = Object.freeze({
  containerImageVersion: "1.4.8",
  containerImageName: "sownak/cactus-fabric-all-in-one",
  opsApiHttpPort: 9443,
});

/*
 * Provides validations for the Corda container's options
 */
export const FABRIC_TEST_LEDGER_OPTIONS_JOI_SCHEMA: Joi.Schema = Joi.object().keys(
  {
    containerImageVersion: Joi.string().min(5).required(),
    containerImageName: Joi.string().min(1).required(),
    opsApiHttpPort: Joi.number()
      .integer()
      .min(1024)
      .max(65535)
      .required(),
  }
);

export class FabricV1TestLedger implements ITestLedger {
  public readonly containerImageVersion: string;
  public readonly containerImageName: string;
  public readonly opsApiHttpPort: number;

  private container: Container | undefined;

  constructor(
    public readonly options: IFabricTestLedgerConstructorOptions = {}
  ) {
    if (!options) {
      throw new TypeError(`FabricV1TestLedger#ctor options was falsy.`);
    }
    this.containerImageVersion =
      options.containerImageVersion ||
      FABRIC_TEST_LEDGER_DEFAULT_OPTIONS.containerImageVersion;
    this.containerImageName =
      options.containerImageName ||
      FABRIC_TEST_LEDGER_DEFAULT_OPTIONS.containerImageName;
    this.opsApiHttpPort =
      options.opsApiHttpPort || FABRIC_TEST_LEDGER_DEFAULT_OPTIONS.opsApiHttpPort;

    this.validateConstructorOptions();
  }

  public getContainer(): Container {
    const fnTag = "FabricV1TestLedger#getContainer()";
    if (!this.container) {
      throw new Error(
        `${fnTag} container not yet started by this instance.`
      );
    } else {
      return this.container;
    }
  }

  public getContainerImageName(): string {
    return `${this.containerImageName}:${this.containerImageVersion}`;
  }

  public async getOpsApiHttpHost(): Promise<string> {
    const ipAddress: string = "127.0.0.1";
    const hostPort: number = await this.getOpsApiPublicPort();
    return `http://${ipAddress}:${hostPort}/version`;
  }

  public async start(): Promise<Container> {
    const containerNameAndTag = this.getContainerImageName();

    if (this.container) {
      await this.container.stop();
      await this.container.remove();
    }
    const docker = new Docker();

    await this.pullContainerImage(containerNameAndTag);

    return new Promise<Container>((resolve, reject) => {
      const eventEmitter: EventEmitter = docker.run(
        containerNameAndTag,
        [],
        [],
        {
          ExposedPorts: {
            [`${this.opsApiHttpPort}/tcp`]: {}, // Fabric Peer GRPC - HTTP
            "7050/tcp": {}, // Orderer GRPC - HTTP
            "7051/tcp": {}, // Peer additional - HTTP
            "7052/tcp": {}, // Peer Chaincode - HTTP
            "7053/tcp": {}, // Peer additional - HTTP
            "7054/tcp": {}, // Fabric CA - HTTP
            "9001/tcp": {}, // supervisord - HTTP
          },
          // This is a workaround needed for macOS which has issues with routing
          // to docker container's IP addresses directly...
          // https://stackoverflow.com/a/39217691
          PublishAllPorts: true,
        },
        {},
        (err: any) => {
          if (err) {
            reject(err);
          }
        }
      );

      eventEmitter.once("start", async (container: Container) => {
        this.container = container;
        try {
          await this.waitForHealthCheck();
          resolve(container);
        } catch (ex) {
          reject(ex);
        }
      });
    });
  }

  public async waitForHealthCheck(timeoutMs: number = 120000): Promise<void> {
    const fnTag = "FabricV1TestLedger#waitForHealthCheck()";
    const httpUrl = await this.getOpsApiHttpHost();
    const startedAt = Date.now();
    let reachable: boolean = false;
    do {
      try {
        const res = await axios.get(httpUrl);
        reachable = res.status > 199 && res.status < 300;
      } catch (ex) {
        reachable = false;
        if (Date.now() >= startedAt + timeoutMs) {
          throw new Error(`${fnTag} timed out (${timeoutMs}ms) -> ${ex.stack}`);
        }
      }
      await new Promise((resolve2) => setTimeout(resolve2, 100));
    } while (!reachable);
  }

  public stop(): Promise<any> {
    const fnTag = "FabricV1TestLedger#stop()";
    return new Promise((resolve, reject) => {
      if (this.container) {
        this.container.stop({}, (err: any, result: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      } else {
        return reject(
          new Error(
            `${fnTag} Container was not running.`
          )
        );
      }
    });
  }

  public destroy(): Promise<any> {
    const fnTag = "FabricV1TestLedger#destroy()";
    if (this.container) {
      return this.container.remove();
    } else {
      return Promise.reject(
        new Error(
          `${fnTag} Containernot found, nothing to destroy.`
        )
      );
    }
  }

  protected async getContainerInfo(): Promise<ContainerInfo> {
    const docker = new Docker();
    const image = this.getContainerImageName();
    const containerInfos = await docker.listContainers({});

    const aContainerInfo = containerInfos.find((ci) => ci.Image === image);

    if (aContainerInfo) {
      return aContainerInfo;
    } else {
      throw new Error(`FabricV1TestLedger#getContainerInfo() no image "${image}"`);
    }
  }

  public async getOpsApiPublicPort(): Promise<number> {
    const fnTag = "FabricV1TestLedger#getOpsApiPublicPort()";
    const aContainerInfo = await this.getContainerInfo();
    const { opsApiHttpPort: thePort } = this;
    const { Ports: ports } = aContainerInfo;

    if (ports.length < 1) {
      throw new Error(`${fnTag} no ports exposed or mapped at all`);
    }
    const mapping = ports.find((x) => x.PrivatePort === thePort);
    if (mapping) {
      if (!mapping.PublicPort) {
        throw new Error(`${fnTag} port ${thePort} mapped but not public`);
      } else if (mapping.IP !== "0.0.0.0") {
        throw new Error(`${fnTag} port ${thePort} mapped to localhost`);
      } else {
        return mapping.PublicPort;
      }
    } else {
      throw new Error(`${fnTag} no mapping found for ${thePort}`);
    }
  }


  public async getContainerIpAddress(): Promise<string> {
    const fnTag = "FabricV1TestLedger#getContainerIpAddress()";
    const aContainerInfo = await this.getContainerInfo();

    if (aContainerInfo) {
      const { NetworkSettings } = aContainerInfo;
      const networkNames: string[] = Object.keys(NetworkSettings.Networks);
      if (networkNames.length < 1) {
        throw new Error(`${fnTag} container not connected to any networks`);
      } else {
        // return IP address of container on the first network that we found it connected to. Make this configurable?
        return NetworkSettings.Networks[networkNames[0]].IPAddress;
      }
    } else {
      throw new Error(
        `${fnTag} cannot find container image ${this.containerImageName}`
      );
    }
  }

  private pullContainerImage(containerNameAndTag: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const docker = new Docker();
      docker.pull(containerNameAndTag, (pullError: any, stream: any) => {
        if (pullError) {
          reject(pullError);
        } else {
          docker.modem.followProgress(
            stream,
            (progressError: any, output: any[]) => {
              if (progressError) {
                reject(progressError);
              } else {
                resolve(output);
              }
            },
            (event: any) => null // ignore the spammy docker download log, we get it in the output variable anyway
          );
        }
      });
    });
  }

  private validateConstructorOptions(): void {
    const validationResult = Joi.validate<IFabricTestLedgerConstructorOptions>(
      {
        containerImageVersion: this.containerImageVersion,
        containerImageName: this.containerImageName,
        opsApiHttpPort: this.opsApiHttpPort,
      },
      FABRIC_TEST_LEDGER_OPTIONS_JOI_SCHEMA
    );

    if (validationResult.error) {
      throw new Error(
        `FabricV1TestLedger#ctor ${validationResult.error.annotate()}`
      );
    }
  }
}
