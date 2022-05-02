import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import {
  UniswapV2Pair,
  Burn,
  Mint,
  Swap,
  Sync,
  Transfer,
} from '../generated/UniswapV2Pair/UniswapV2Pair'
import { PricePoint, MetaData } from '../generated/schema'

function getNextId(): BigInt {
  let metaData = MetaData.load('metadata')
  if (metaData == null) {
    metaData = new MetaData('metadata')
    metaData.nextPricePointId = BigInt.fromI32(1000)
    metaData.save()
  }
  return metaData.nextPricePointId
}

function incrementNextId(): void {
  let metaData = MetaData.load('metadata') as MetaData
  metaData.nextPricePointId = metaData.nextPricePointId.plus(BigInt.fromI32(1))
  metaData.save()
}

function snapshotPrice(event: ethereum.Event): void {
  let newId = getNextId()

  let deusFtm = UniswapV2Pair.bind(
    Address.fromString('0xaF918eF5b9f33231764A5557881E6D3e5277d456'),
  )
  let ftmUsdc = UniswapV2Pair.bind(
    Address.fromString('0x2b4C76d0dc16BE1C31D4C1DC53bF9B45987Fc75c'),
  )

  let priceDeusFtm = deusFtm
    .getReserves()
    .value0.times(BigInt.fromString('1000000000000000000'))
    .div(deusFtm.getReserves().value1)
  let priceFtmUsdc = ftmUsdc
    .getReserves()
    .value0.times(BigInt.fromI64(1000000000000))
    .times(BigInt.fromString('1000000000000000000'))
    .div(ftmUsdc.getReserves().value1)
  let priceDeusUsdc = priceDeusFtm
    .times(priceFtmUsdc)
    .div(BigInt.fromString('1000000000000000000'))

  let pricePoint = new PricePoint(newId.toString())
  pricePoint.timestamp = event.block.timestamp

  pricePoint.priceDeusFtm = priceDeusFtm
  pricePoint.priceFtmUsdc = priceFtmUsdc
  pricePoint.price = priceDeusUsdc
  pricePoint.save()
  incrementNextId()
}
export function handleBurn(event: Burn): void {
  snapshotPrice(event)
}

export function handleMint(event: Mint): void {
  snapshotPrice(event)
}

export function handleSwap(event: Swap): void {
  snapshotPrice(event)
}

export function handleSync(event: Sync): void {
  snapshotPrice(event)
}

export function handleTransfer(event: Transfer): void {
  snapshotPrice(event)
}
