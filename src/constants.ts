import { Address, BigInt } from "@graphprotocol/graph-ts";

export const EACAggregatorProxyAddress = Address.fromString(
  "0xf4766552D15AE4d256Ad41B6cf2933482B0680dc"
);

export const METADATA = "metadata";
export const TWAPDATA = "twapdata";

export const BI_EXP_10 = BigInt.fromString("10000000000");
export const BI_EXP_18 = BigInt.fromString("1000000000000000000");
