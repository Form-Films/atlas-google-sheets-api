/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />

declare module "npm:*" {
  const value: any;
  export default value;
}

declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

declare namespace Deno {
  export interface ServeOptions {
    port?: number;
    hostname?: string;
  }
  
  export type ServeHandler = (request: Request) => Response | Promise<Response>;
  
  export function serve(handler: ServeHandler, options?: ServeOptions): void;
  
  export const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): { [key: string]: string };
  };
}