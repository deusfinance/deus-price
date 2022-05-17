import {
  Burn,
  Mint,
  Swap,
  Sync,
  Transfer,
} from "../generated/DeusFtm/UniswapV2Pair";
import { snapshotPrice } from "./entities";

export function handleBeetsSwap(event: Burn): void {
  snapshotPrice(event);
}

export function handleBurn(event: Burn): void {
  snapshotPrice(event);
}

export function handleMint(event: Mint): void {
  snapshotPrice(event);
}

export function handleSwap(event: Swap): void {
  snapshotPrice(event);
}

export function handleSync(event: Sync): void {
  snapshotPrice(event);
}

export function handleTransfer(event: Transfer): void {
  snapshotPrice(event);
}
