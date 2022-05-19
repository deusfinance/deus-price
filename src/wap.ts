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

import {
  BI_EXP_10,
  BI_EXP_18,
  BI_ONE,
  BI_ZERO,
  EACAggregatorProxyAddress,
  METADATA,
  WAPDATA,
} from "./constants";

function getMetaData(): MetaData {
  let metaData = MetaData.load(METADATA);
  if (metaData == null) {
    metaData = new MetaData(METADATA);
    metaData.nextPricePointId = BI_ZERO;
    metaData.count = BI_ZERO;
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
  metadata.count = metadata.count.plus(BI_ONE);
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
  let metaData = MetaData.load(METADATA) as MetaData;
  metaData.nextPricePointId = metaData.nextPricePointId.plus(BI_ONE);
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
  let lastPointMetadata = WapLastPoint.load(WAPDATA);
  if (!lastPointMetadata) {
    createInitialWapMetadata(pricePoint, newId);
  } else {
    let lastPoint = PricePoint.load(lastPointMetadata.lastId);
    let lastWap = WapPoint.load(lastPointMetadata.lastWapId) as WapPoint;
    let factor = pricePoint.timestamp.minus(lastPoint!.timestamp).abs();
    let numerator = lastPoint!.priceDeusUsdc.times(factor);
    let denominator = factor;

    let newWap = createNewWap(
      newId,
      lastWap,
      numerator,
      denominator,
      pricePoint,
      event.address
    );

    updateWapMetadata(lastPointMetadata, pricePoint, newWap);
  }
}

function createNewPricePoint(event: ethereum.Event, newId: BigInt): PricePoint {
  let deusFtm = UniswapV2Pair.bind(Address.fromBytes(event.address));
  let chainLinkFTMPrice = EACAggregatorProxy.bind(EACAggregatorProxyAddress);

  let reserveDeus = deusFtm.getReserves().value0;
  let reserveFtm = deusFtm.getReserves().value1;

  let priceDeusFtm = reserveDeus.times(BI_EXP_18).div(reserveFtm);
  let priceFtmUsdc = chainLinkFTMPrice.latestAnswer().times(BI_EXP_10);
  let priceDeusUsdc = priceDeusFtm.times(priceFtmUsdc).div(BI_EXP_18);

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

function createNewWap(
  newId: BigInt,
  lastWap: WapPoint,
  numerator: BigInt,
  denominator: BigInt,
  pricePoint: PricePoint,
  source: Address
): WapPoint {
  let newWap = new WapPoint(newId.toString());
  newWap.numerator = lastWap.numerator.plus(numerator);
  newWap.denominator = lastWap.denominator.plus(denominator);
  newWap.timestamp = pricePoint.timestamp;
  newWap.source = source;
  newWap.save();
  return newWap;
}

function updateWapMetadata(
  lastPointMetadata: WapLastPoint,
  pricePoint: PricePoint,
  newWap: WapPoint
): void {
  lastPointMetadata.lastId = pricePoint.id;
  lastPointMetadata.lastWapId = newWap.id;
  lastPointMetadata.save();
}

function createInitialWapMetadata(
  pricePoint: PricePoint,
  newId: BigInt
): WapLastPoint {
  let lastPointMetadata = new WapLastPoint(WAPDATA);
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

  wapPoint.numerator = BI_ZERO;
  wapPoint.denominator = BI_ZERO;
  wapPoint.timestamp = pricePoint.timestamp;
  wapPoint.save();
  return wapPoint;
}

export { snapshotPrice };
