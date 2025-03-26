/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />

// declare module "npm:*" {
//   const value: any;
//   export = value;
// }

declare module "*.ts" {
  const value: any;
  export default value;
}

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

declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};