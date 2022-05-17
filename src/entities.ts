import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { UniswapV2Pair } from "../generated/DeusFtm/UniswapV2Pair";
import { EACAggregatorProxy } from "../generated/DeusFtm/EACAggregatorProxy";
import {
  PricePoint,
  MetaData,
  CumulativeTransactionCount,
  TwapLastPoint,
  TwapPoint,
} from "../generated/schema";
import {
  BI_EXP_10,
  BI_EXP_18,
  BI_ZERO,
  EACAggregatorProxyAddress,
  METADATA,
  TWAPDATA,
} from "./constants";

function getMetaData(): MetaData {
  let metaData = MetaData.load(METADATA);
  if (!metaData) {
    metaData = new MetaData(METADATA);
    metaData.nextPricePointId = BigInt.fromI32(1);
    metaData.count = BigInt.fromI32(0);
    metaData.save();
  }
  return metaData;
}

function incrementMetaDataGlobalTransactionCount(): BigInt {
  let metadata = getMetaData();
  metadata.count = metadata.count.plus(BigInt.fromI32(1));
  metadata.save();
  return metadata.count;
}

function getCumulativeTransactionCountRecord(
  timestamp: BigInt
): CumulativeTransactionCount {
  let record = CumulativeTransactionCount.load(timestamp.toString());
  if (!record) {
    record = new CumulativeTransactionCount(timestamp.toString());
    record.save();
  }
  return record;
}

function updateCumulativeTransactionCountRecord(
  blockNumber: BigInt,
  timestamp: BigInt,
  globalCumulativeCount: BigInt
): void {
  let cumulativeTransactionCountRecord = getCumulativeTransactionCountRecord(
    timestamp
  );
  cumulativeTransactionCountRecord.blockNumber = blockNumber;
  cumulativeTransactionCountRecord.timestamp = timestamp;
  cumulativeTransactionCountRecord.count = globalCumulativeCount;
  cumulativeTransactionCountRecord.save();
}

function getNextPricePointId(): BigInt {
  let metaData = getMetaData();
  return metaData.nextPricePointId;
}

function incrementNextId(): void {
  let metaData = getMetaData();
  metaData.nextPricePointId = metaData.nextPricePointId.plus(BigInt.fromI32(1));
  metaData.save();
}

export function snapshotPrice(event: ethereum.Event): void {
  // Generate a new ID
  let newPricePointId = getNextPricePointId();

  // Initiate contracts
  let deusFtmPair = UniswapV2Pair.bind(Address.fromBytes(event.address));
  let chainLinkFTMPrice = EACAggregatorProxy.bind(EACAggregatorProxyAddress);

  // DEUS price expressed in FTM
  let priceDeusFtm = deusFtmPair
    .getReserves()
    .value0.times(BI_EXP_18)
    .div(deusFtmPair.getReserves().value1);

  // DEUS price expressed in USDC via FTM
  let priceFtmUsdc = chainLinkFTMPrice.latestAnswer().times(BI_EXP_10); // EACAggregatorProxy has 8 decimals
  let priceDeusUsdc = priceDeusFtm.times(priceFtmUsdc).div(BI_EXP_18);

  // Update metadata
  let globalCount = incrementMetaDataGlobalTransactionCount();
  updateCumulativeTransactionCountRecord(
    event.block.blockNumber,
    event.block.timestamp,
    globalCount
  );

  // Create a PricePoint, a single txn can contain multiple PricePoints
  let pricePoint = new PricePoint(newPricePointId.toString());
  pricePoint.blockNumber = event.block.blockNumber;
  pricePoint.timestamp = event.block.timestamp;
  pricePoint.priceDeusFtm = priceDeusFtm;
  pricePoint.priceFtmUsdc = priceFtmUsdc;
  pricePoint.priceDeusUsdc = priceDeusUsdc;
  pricePoint.source = event.address;
  pricePoint.save();

  let lastPointMetadata = TwapLastPoint.load(TWAPDATA);
  if (!lastPointMetadata) {
    let twapPoint = new TwapPoint(newPricePointId.toString());
    twapPoint.numerator = BI_ZERO;
    twapPoint.denominator = BI_ZERO;
    twapPoint.blockNumber = pricePoint.blockNumber;
    twapPoint.timestamp = pricePoint.timestamp;
    twapPoint.save();

    lastPointMetadata = new TwapLastPoint(TWAPDATA);
    lastPointMetadata.lastId = pricePoint.id;
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
    let newTwap = new TwapPoint(newPricePointId.toString());
    newTwap.numerator = lastTwap.numerator.plus(numerator);
    newTwap.denominator = lastTwap.denominator.plus(denominator);
    newTwap.blockNumber = pricePoint.blockNumber;
    newTwap.timestamp = pricePoint.timestamp;
    newTwap.source = event.address;
    newTwap.save();

    lastPointMetadata.lastId = pricePoint.id;
    lastPointMetadata.lastTwapId = newTwap.id;
    lastPointMetadata.save();
  }
  incrementNextId();
}
