import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { UniswapV2Pair } from "../generated/DeusFtm/UniswapV2Pair";
import { EACAggregatorProxy } from "../generated/DeusFtm/EACAggregatorProxy";
import {
  PricePoint,
  MetaData,
  CumulativeTransactionCount,
  WapLastPoint,
  WapPoint,
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
  updateWap(pricePoint, newId, event);
  incrementNextId();
}

function updateWap(
  pricePoint: PricePoint,
  newId: BigInt,
  event: ethereum.Event
): void {
  let lastPointMetadata = WapLastPoint.load("VwapData");
  if (!lastPointMetadata) {
    lastPointMetadata = createInitialVwapMetadata(pricePoint, newId);
  } else {
    let lastPoint = PricePoint.load(lastPointMetadata.lastId);
    let lastVwap = WapPoint.load(lastPointMetadata.lastWapId) as WapPoint;
    let factor = pricePoint.reserveDeus.minus(lastPoint!.reserveDeus).abs();
    let numerator = pricePoint.priceDeusUsdc.times(factor);
    let denominator = factor;

    let newVwap = createNewVwap(
      newId,
      lastVwap,
      numerator,
      denominator,
      pricePoint,
      event.address
    );

    updateWapMetadata(lastPointMetadata, pricePoint, newVwap);
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

function createNewVwap(
  newId: BigInt,
  lastVwap: WapPoint,
  numerator: BigInt,
  denominator: BigInt,
  pricePoint: PricePoint,
  source: Address
): WapPoint {
  let newVwap = new WapPoint(newId.toString());
  newVwap.numerator = lastVwap.numerator.plus(numerator);
  newVwap.denominator = lastVwap.denominator.plus(denominator);
  newVwap.timestamp = pricePoint.timestamp;
  newVwap.source = source;
  newVwap.save();
  return newVwap;
}

function updateWapMetadata(
  lastPointMetadata: WapLastPoint,
  pricePoint: PricePoint,
  newVwap: WapPoint
): void {
  lastPointMetadata.lastId = pricePoint.id;
  lastPointMetadata.lastWapId = newVwap.id;
  lastPointMetadata.save();
}

function createInitialVwapMetadata(
  pricePoint: PricePoint,
  newId: BigInt
): WapLastPoint {
  let lastPointMetadata = new WapLastPoint("VwapData");
  let WapPoint = createInitialWapPoint(newId, pricePoint);

  lastPointMetadata.lastId = pricePoint.id;

  lastPointMetadata.lastWapId = WapPoint.id;
  lastPointMetadata.save();
  return lastPointMetadata;
}

function createInitialWapPoint(
  newId: BigInt,
  pricePoint: PricePoint
): WapPoint {
  let wapPoint = new WapPoint(newId.toString());

  wapPoint.numerator = BigInt.fromI32(0);
  wapPoint.denominator = BigInt.fromI32(0);
  wapPoint.timestamp = pricePoint.timestamp;
  wapPoint.save();
  return wapPoint;
}

export { snapshotPrice };
