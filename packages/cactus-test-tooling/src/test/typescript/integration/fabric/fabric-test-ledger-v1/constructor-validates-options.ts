// tslint:disable-next-line: no-var-requires
const tap = require("tap");
import isPortReachable from "is-port-reachable";
import { Container } from "dockerode";
import {
  FabricV1TestLedger,
} from "../../../../../main/typescript/public-api";

tap.test("constructor throws if invalid input is provided", (assert: any) => {
  assert.ok(FabricV1TestLedger);
  assert.throws(() => new FabricV1TestLedger({ containerImageVersion: "nope" }));
  assert.end();
});

tap.test(
  "constructor does not throw if valid input is provided",
  (assert: any) => {
    assert.ok(FabricV1TestLedger);
    assert.doesNotThrow(() => new FabricV1TestLedger());
    assert.end();
  }
);

tap.test("starts/stops/destroys a docker container", async (assert: any) => {
  const fabricTestLedger = new FabricV1TestLedger();
  assert.tearDown(() => fabricTestLedger.stop());
  assert.tearDown(() => fabricTestLedger.destroy());

  const container: Container = await fabricTestLedger.start();
  assert.ok(container);
  const ipAddress: string = await fabricTestLedger.getContainerIpAddress();
  assert.ok(ipAddress);
  assert.ok(ipAddress.length);

  const hostPort: number = await fabricTestLedger.getRestApiPublicPort();
  assert.ok(hostPort, "getRestApiPublicPort() returns truthy OK");
  assert.ok(isFinite(hostPort), "getRestApiPublicPort() returns finite OK");

  const isReachable = await isPortReachable(hostPort, { host: "localhost" });
  assert.ok(isReachable, `HostPort ${hostPort} is reachable via localhost`);

  assert.end();
});
