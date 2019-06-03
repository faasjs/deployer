import { InvokeData, Next } from "@faasjs/func";

export default class Extend {
  onInvoke(data: InvokeData, next: Next) {
    data.event++;
    next();
  }
}
