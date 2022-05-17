import { Burn, Mint, Swap } from "../generated/DeusFtm/UniswapV2Pair";
import { snapshotPrice } from "./entities";

export function handleBurn(event: Burn): void {
  snapshotPrice(event);
}

export function handleMint(event: Mint): void {
  snapshotPrice(event);
}

export function handleSwap(event: Swap): void {
  snapshotPrice(event);
}
