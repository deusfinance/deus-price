import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { UniswapV2Pair } from "../generated/DeusFtm/UniswapV2Pair";
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
  let pricePoint = createNewPricePoint(event, newId);
  updateTwap(pricePoint, newId, event);
  incrementNextId();
}

function updateTwap(
  pricePoint: PricePoint,
  newId: BigInt,
  event: ethereum.Event
): void {
  let lastPointMetadata = TawapLastPoint.load("twapData");
  if (!lastPointMetadata) {
    lastPointMetadata = createInitialTwapMetadata(pricePoint, newId);
  } else {
    let lastPoint = PricePoint.load(lastPointMetadata.lastId);
    let lastTwap = TwapPoint.load(lastPointMetadata.lastTwapId) as TwapPoint;

    let factor = pricePoint.reserveDeus.minus(lastPoint!.reserveDeus).abs();

    let numerator = pricePoint.priceDeusUsdc.times(factor);
    let denominator = factor;

    let newTwap = createNewTwap(
      newId,
      lastTwap,
      numerator,
      denominator,
      pricePoint,
      event.address
    );

    updateTwapMetadata(lastPointMetadata, pricePoint, newTwap);
  }
}

function createNewPricePoint(event: ethereum.Event, newId: BigInt): PricePoint {
  let deusFtm = UniswapV2Pair.bind(Address.fromBytes(event.address));

  let chainLinkFTMPrice = EACAggregatorProxy.bind(
    Address.fromString("0xf4766552D15AE4d256Ad41B6cf2933482B0680dc")
  );

  let reserveDeus = deusFtm.getReserves().value0;
  let reserveFtm = deusFtm.getReserves().value1;

  let priceDeusFtm = reserveDeus
    .times(BigInt.fromString("1000000000000000000"))
    .div(reserveFtm);

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
  pricePoint.reserveDeus = reserveDeus;
  pricePoint.priceDeusFtm = priceDeusFtm;
  pricePoint.priceFtmUsdc = priceFtmUsdc;
  pricePoint.priceDeusUsdc = priceDeusUsdc;
  pricePoint.source = event.address;
  pricePoint.save();
  return pricePoint;
}

function createNewTwap(
  newId: BigInt,
  lastTwap: TwapPoint,
  numerator: BigInt,
  denominator: BigInt,
  pricePoint: PricePoint,
  source: Address
): TwapPoint {
  let newTwap = new TwapPoint(newId.toString());
  newTwap.numerator = lastTwap.numerator.plus(numerator);
  newTwap.denominator = lastTwap.denominator.plus(denominator);
  newTwap.timestamp = pricePoint.timestamp;
  newTwap.source = source;
  newTwap.save();
  return newTwap;
}

function updateTwapMetadata(
  lastPointMetadata: TawapLastPoint,
  pricePoint: PricePoint,
  newTwap: TwapPoint
): void {
  lastPointMetadata.lastId = pricePoint.id;
  lastPointMetadata.lastTwapId = newTwap.id;
  lastPointMetadata.save();
}

function createInitialTwapMetadata(
  pricePoint: PricePoint,
  newId: BigInt
): TawapLastPoint {
  let lastPointMetadata = new TawapLastPoint("twapData");
  let twapPoint = createInitialTwapPoint(newId, pricePoint);

  lastPointMetadata.lastId = pricePoint.id;

  lastPointMetadata.lastTwapId = twapPoint.id;
  lastPointMetadata.save();
  return lastPointMetadata;
}

function createInitialTwapPoint(
  newId: BigInt,
  pricePoint: PricePoint
): TwapPoint {
  let twapPoint = new TwapPoint(newId.toString());

  twapPoint.numerator = BigInt.fromI32(0);
  twapPoint.denominator = BigInt.fromI32(0);
  twapPoint.timestamp = pricePoint.timestamp;
  twapPoint.save();
  return twapPoint;
}

export { snapshotPrice };
