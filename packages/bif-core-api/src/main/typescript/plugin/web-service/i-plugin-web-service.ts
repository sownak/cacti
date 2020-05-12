import { IWebServiceEndpoint } from "./i-web-service-endpoint";

export interface IPluginWebService {
  installWebService(expressApp: any): IWebServiceEndpoint[];
}

export function isIPluginWebService(pluginInstance: IPluginWebService): pluginInstance is IPluginWebService {
  return typeof pluginInstance.installWebService === 'function';
}
