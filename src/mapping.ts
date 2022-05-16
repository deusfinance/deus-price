import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  UniswapV2Pair,
  Burn,
  Mint,
  Swap,
  Sync,
  Transfer,
} from "../generated/DeusFtm/UniswapV2Pair";
import { EACAggregatorProxy } from "../generated/DeusFtm/EACAggregatorProxy";
import {
  PricePoint,
  MetaData,
  CumulativeTransactionCount,
  TawapLastPoint,
  TwapPoint,
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
  let record = CumulativeTransactionCount.load(timestamp.toString());
  if (record == null) {
    record = new CumulativeTransactionCount(timestamp.toString());
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
    Address.fromString("0xaf918ef5b9f33231764a5557881e6d3e5277d456")
  );

  let chainLinkFTMPrice = EACAggregatorProxy.bind(
    Address.fromString("0xf4766552D15AE4d256Ad41B6cf2933482B0680dc")
  );

  let priceDeusFtm = deusFtm
    .getReserves()
    .value0.times(BigInt.fromString("1000000000000000000"))
    .div(deusFtm.getReserves().value1);

  let priceFtmUsdc = chainLinkFTMPrice
    .latestAnswer()
    .times(BigInt.fromString("10000000000"));

  let priceDeusUsdc = priceDeusFtm
    .times(priceFtmUsdc)
    .div(BigInt.fromString("1000000000000000000"));

  let globalCount = incrementMetaDataGlobalTransactionCount();
  updateCumulativeTransactionCountRecord(event.block.timestamp, globalCount);

  let pricePoint = new PricePoint(newId.toString());
  pricePoint.timestamp = event.block.timestamp;
  pricePoint.priceDeusFtm = priceDeusFtm;
  pricePoint.priceFtmUsdc = priceFtmUsdc;
  pricePoint.priceDeusUsdc = priceDeusUsdc;
  pricePoint.source = event.address;
  pricePoint.save();

  let lastPointMetadata = TawapLastPoint.load("twapData");
  if (!lastPointMetadata) {
    lastPointMetadata = new TawapLastPoint("twapData");
    lastPointMetadata.lastId = pricePoint.id;

    let twapPoint = new TwapPoint(newId.toString());

    twapPoint.numerator = BigInt.fromI32(0);
    twapPoint.denominator = BigInt.fromI32(0);
    twapPoint.timestamp = pricePoint.timestamp;
    twapPoint.save();

    lastPointMetadata.lastTwapId = twapPoint.id;
    lastPointMetadata.save();
  } else {
    let lastPoint = PricePoint.load(lastPointMetadata.lastId);
    let lastTwap = TwapPoint.load(lastPointMetadata.lastTwapId) as TwapPoint;

    let deltaX = pricePoint.timestamp
      .minus(lastPoint!.timestamp)
      .times(BigInt.fromString(pricePoint.id));

    let numerator = lastPoint!.priceDeusUsdc.times(deltaX);
    let denominator = deltaX;
    let newTwap = new TwapPoint(newId.toString());
    newTwap.numerator = lastTwap.numerator.plus(numerator);
    newTwap.denominator = lastTwap.denominator.plus(denominator);
    newTwap.timestamp = pricePoint.timestamp;
    newTwap.source = event.address;
    newTwap.save();
    lastPointMetadata.lastId = pricePoint.id;
    lastPointMetadata.lastTwapId = newTwap.id;
    lastPointMetadata.save();
  }
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
