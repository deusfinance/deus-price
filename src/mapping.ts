import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  UniswapV2Pair,
  Burn,
  Mint,
  Swap,
  Sync,
  Transfer,
} from "../generated/DeusFtm/UniswapV2Pair";
import { Vault } from "../generated/DeusDei/Vault";
import {
  PricePoint,
  MetaData,
  CumulativeTransactionCount,
} from "../generated/schema";

function getMetaData(): MetaData {
  let metaData = MetaData.load("metadata");
  if (metaData == null) {
    metaData = new MetaData("metadata");
    metaData.nextPricePointId = BigInt.fromI32(1000);
    metaData.count = BigInt.fromI32(0);
    metaData.save();
  }
  return metaData;
}

function getCumulativeTransactionCountRecord(
  timestamp: BigInt
): CumulativeTransactionCount {
  let record = CumulativeTransactionCount.load(timestamp.toHexString());
  if (record == null) {
    record = new CumulativeTransactionCount(timestamp.toHexString());
  }
  return record;
}

function incrementMetaDataGlobalTransactionCount(): BigInt {
  let metadata = getMetaData();
  metadata.count = metadata.count.plus(BigInt.fromI32(1));
  metadata.save();
  return metadata.count;
}

function updateCumulativeTransactionCountRecord(
  timestamp: BigInt,
  globalCumulativeCount: BigInt
): void {
  let cumulativeTransactionCountRecord = getCumulativeTransactionCountRecord(
    timestamp
  );
  cumulativeTransactionCountRecord.timestamp = timestamp;
  cumulativeTransactionCountRecord.count = globalCumulativeCount;
  cumulativeTransactionCountRecord.save();
}

function getNextId(): BigInt {
  let metaData = getMetaData();
  return metaData.nextPricePointId;
}

function incrementNextId(): void {
  let metaData = MetaData.load("metadata") as MetaData;
  metaData.nextPricePointId = metaData.nextPricePointId.plus(BigInt.fromI32(1));
  metaData.save();
}

function snapshotPrice(event: ethereum.Event): void {
  let newId = getNextId();

  let deusFtm = UniswapV2Pair.bind(
    Address.fromString("0xaF918eF5b9f33231764A5557881E6D3e5277d456")
  );
  let ftmUsdc = UniswapV2Pair.bind(
    Address.fromString("0x2b4C76d0dc16BE1C31D4C1DC53bF9B45987Fc75c")
  );

  let deusDei = Vault.bind(
    Address.fromString("0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce")
  );

  let priceDeusFtm = deusFtm
    .getReserves()
    .value0.times(BigInt.fromString("1000000000000000000"))
    .div(deusFtm.getReserves().value1);
  let priceFtmUsdc = ftmUsdc
    .getReserves()
    .value0.times(BigInt.fromI64(1000000000000))
    .times(BigInt.fromString("1000000000000000000"))
    .div(ftmUsdc.getReserves().value1);

  let deusDeiInfo = deusDei.getPoolTokens(
    Bytes.fromHexString(
      "0x0e8e7307e43301cf28c5d21d5fd3ef0876217d410002000000000000000003f1"
    )
  );
  let reserveDei = deusDeiInfo.value1[0];
  let reserveDeus = deusDeiInfo.value1[1];

  let priceDeusDei = reserveDei
    .times(BigInt.fromString("1000000000000000000"))
    .times(BigInt.fromI32(4))
    .div(reserveDeus);

  let priceDeusUsdc = priceDeusFtm
    .times(priceFtmUsdc)
    .div(BigInt.fromString("1000000000000000000"));

  let globalCount = incrementMetaDataGlobalTransactionCount();
  updateCumulativeTransactionCountRecord(event.block.timestamp, globalCount);

  let pricePoint = new PricePoint(newId.toString());
  pricePoint.timestamp = event.block.timestamp;
  pricePoint.priceDeusFtm = priceDeusFtm;
  pricePoint.priceFtmUsdc = priceFtmUsdc;
  pricePoint.priceDeusDei = priceDeusDei;
  pricePoint.price = priceDeusUsdc;
  pricePoint.save();
  incrementNextId();
}

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
