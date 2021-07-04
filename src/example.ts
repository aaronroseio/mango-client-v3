import * as os from 'os';
import * as fs from 'fs';
import { MangoClient } from './client';
import { Account, Commitment, Connection } from '@solana/web3.js';
import configFile from './ids.json';
import { Config, getMarketByBaseSymbolAndKind, GroupConfig } from './config';
import { Market } from '@project-serum/serum';
import BN from 'bn.js';
import { MangoAccount } from '.';

function readKeypair() {
  return JSON.parse(
    process.env.KEYPAIR ||
      fs.readFileSync(os.homedir() + '/.config/solana/devnet.json', 'utf-8'),
  );
}

async function examplePerp() {
  // setup client
  const config = new Config(configFile);
  const groupConfig = config.getGroup(
    'devnet',
    'mango_test_v2.2',
  ) as GroupConfig;
  const connection = new Connection(
    'https://api.devnet.solana.com',
    'processed' as Commitment,
  );
  const client = new MangoClient(connection, groupConfig.mangoProgramId);

  // load group & market
  const perpMarketConfig = getMarketByBaseSymbolAndKind(
    groupConfig,
    'BTC',
    'perp',
  );
  const mangoGroup = await client.getMangoGroup(groupConfig.publicKey);
  const perpMarket = await mangoGroup.loadPerpMarket(
    connection,
    perpMarketConfig.marketIndex,
    perpMarketConfig.baseDecimals,
    perpMarketConfig.quoteDecimals,
  );

  // Fetch orderbooks
  const bids = await perpMarket.loadBids(connection);
  const asks = await perpMarket.loadAsks(connection);

  // L2 orderbook data
  for (const [price, size] of bids.getL2(20)) {
    console.log(price, size);
  }

  // L3 orderbook data
  for (const order of asks) {
    console.log(
      order.owner.toBase58(),
      order.orderId.toString('hex'),
      order.price,
      order.size,
      order.side, // 'buy' or 'sell'
    );
  }

  // Place order
  const owner = new Account(readKeypair());
  const mangoAccount = (
    await client.getMarginAccountsForOwner(mangoGroup, owner.publicKey)
  )[0];
  await client.placePerpOrder(
    mangoGroup,
    mangoAccount,
    mangoGroup.mangoCache,
    perpMarket,
    owner,
    'buy', // or 'sell'
    39000,
    0.0001,
    'limit',
  ); // or 'ioc' or 'postOnly'

  // retrieve open orders for account
  const openOrders = await perpMarket.loadOrdersForAccount(
    connection,
    mangoAccount,
  );

  // cancel orders
  for (const order of openOrders) {
    await client.cancelPerpOrder(
      mangoGroup,
      mangoAccount,
      owner,
      perpMarket,
      order,
    );
  }

  // Retrieve fills
  for (const fill of await perpMarket.loadFills(connection)) {
    console.log(
      fill.maker.toBase58(),
      fill.taker.toBase58(),
      fill.baseChange.toNumber(),
      fill.quoteChange.toNumber(),
    );
  }
}

async function exampleSpot() {
  // setup client
  const config = new Config(configFile);
  const groupConfig = config.getGroup(
    'devnet',
    'mango_test_v2.2',
  ) as GroupConfig;
  const connection = new Connection(
    'https://api.devnet.solana.com',
    'processed' as Commitment,
  );
  const client = new MangoClient(connection, groupConfig.mangoProgramId);

  // load group & market
  const spotMarketConfig = getMarketByBaseSymbolAndKind(
    groupConfig,
    'BTC',
    'spot',
  );
  const mangoGroup = await client.getMangoGroup(groupConfig.publicKey);
  const spotMarket = await Market.load(
    connection,
    spotMarketConfig.publicKey,
    undefined,
    groupConfig.serumProgramId,
  );

  // Fetch orderbooks
  const bids = await spotMarket.loadBids(connection);
  const asks = await spotMarket.loadAsks(connection);

  // L2 orderbook data
  for (const [price, size] of bids.getL2(20)) {
    console.log(price, size);
  }

  // L3 orderbook data
  for (const order of asks) {
    console.log(
      order.openOrdersAddress.toBase58(),
      order.orderId.toString('hex'),
      order.price,
      order.size,
      order.side, // 'buy' or 'sell'
    );
  }

  // Place order
  const owner = new Account(readKeypair());
  const mangoAccount = (
    await client.getMarginAccountsForOwner(mangoGroup, owner.publicKey)
  )[0];
  await client.placeSpotOrder(
    mangoGroup,
    mangoAccount,
    mangoGroup.mangoCache,
    spotMarket,
    owner,
    'buy', // or 'sell'
    41000,
    0.0001,
    'limit',
  ); // or 'ioc' or 'postOnly'

  // retrieve open orders for account
  const openOrders = await spotMarket.loadOrdersForOwner(
    connection,
    mangoAccount.publicKey,
  );

  // cancel orders
  for (const order of openOrders) {
    await client.cancelSpotOrder(
      mangoGroup,
      mangoAccount,
      owner,
      spotMarket,
      order,
    );
  }

  // Retrieve fills
  for (const fill of await spotMarket.loadFills(connection)) {
    console.log(
      fill.openOrders.toBase58(),
      fill.eventFlags.maker ? 'maker' : 'taker',
      fill.size * (fill.side === 'buy' ? 1 : -1),
      spotMarket.quoteSplSizeToNumber(
        fill.side === 'buy'
          ? fill.nativeQuantityPaid
          : fill.nativeQuantityReleased,
      ),
    );
  }

  // Settle funds
  for (const openOrders of await mangoAccount.loadOpenOrders(
    connection,
    groupConfig.serumProgramId,
  )) {
    if (!openOrders) continue;

    const zero = new BN(0);
    if (
      openOrders.baseTokenFree.gt(zero) ||
      openOrders.quoteTokenFree.gt(zero)
    ) {
      await client.settleFunds(mangoGroup, mangoAccount, owner, spotMarket);
    }
  }
}

examplePerp();
exampleSpot();
