import { TokenInstructions } from '@project-serum/serum';
import {
  Account,
  Commitment,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from '@solana/web3.js';
import { sleep } from '../src/utils';

export const MerpsProgramId = new PublicKey(
  'H3Xu3m3qiYZmXcdUDTEhQNJSui7bcfziphw8LGvot9Hp',
);
export const DexProgramId = new PublicKey(
  'DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY',
);
export const USDCMint = new PublicKey(
  'H6hy7Ykzc43EuGivv7VVuUKNpKgUoFAfUY3wdPr4UyRX',
);

export async function _sendTransaction(
  connection: Connection,
  transaction: Transaction,
  signers: Account[],
): Promise<TransactionSignature> {
  await sleep(1000);
  const signature = await connection.sendTransaction(transaction, signers);
  try {
    await connection.confirmTransaction(signature);
  } catch (e) {
    console.info('Error while confirming, trying again');
    await connection.confirmTransaction(signature);
  }
  return signature;
}

export function createDevnetConnection() {
  return new Connection(
    'https://api.devnet.solana.com',
    'processed' as Commitment,
  );
}

export async function airdropSol(
  connection: Connection,
  account: Account,
  amount: number,
): Promise<void> {
  const roundedSolAmount = Math.round(amount);
  console.info(`Requesting ${roundedSolAmount} SOL`);
  const generousAccount = [
    115, 98, 128, 18, 66, 112, 147, 244, 46, 244, 118, 106, 91, 202, 56, 83, 58,
    71, 89, 226, 32, 177, 177, 240, 189, 23, 209, 176, 138, 119, 130, 140, 6,
    149, 55, 70, 215, 34, 108, 133, 225, 117, 38, 141, 74, 246, 232, 76, 176,
    10, 207, 221, 68, 179, 115, 158, 106, 133, 35, 30, 4, 177, 124, 5,
  ];
  const backupAcc = new Account(generousAccount);
  const tx = new Transaction();
  tx.add(
    SystemProgram.transfer({
      fromPubkey: backupAcc.publicKey,
      lamports: roundedSolAmount * 1e9,
      toPubkey: account.publicKey,
    }),
  );
  const signers = [backupAcc];
  const signerPks = signers.map((x) => x.publicKey);
  tx.setSigners(...signerPks);
  await _sendTransaction(connection, tx, signers);
}

export async function createAccount(
  connection,
  solBalance: number = 1,
): Promise<Account> {
  const account = new Account();
  if (solBalance >= 1) {
    await airdropSol(connection, account, solBalance);
  }
  return account;
}

// export async function createTokenAccountWithBalance(
//   connection: Connection,
//   owner: Account,
//   tokenName: string,
//   mangoGroupTokenMappings: any,
//   faucetIds: any,
//   amount: number,
//   wrappedSol: boolean = true,
// ) {
//   const tokenMapping: any = Object.values(mangoGroupTokenMappings).find(
//     (x: any) => x.tokenName === tokenName,
//   );
//   const { tokenMint, decimals } = tokenMapping;
//   const multiplier = Math.pow(10, decimals);
//   const processedAmount = amount * multiplier;
//   let ownedTokenAccountPk: PublicKey | null = null;
//   if (tokenName === 'SOL') {
//     await airdropSol(connection, owner, amount);
//     if (wrappedSol) {
//       ownedTokenAccountPk = await createWrappedNativeAccount(
//         connection,
//         owner,
//         processedAmount,
//       );
//     }
//   } else {
//     ownedTokenAccountPk = await createTokenAccount(
//       connection,
//       tokenMint,
//       owner,
//     );
//     if (amount > 0) {
//       await airdropTokens(
//         connection,
//         owner,
//         faucetIds[tokenName],
//         ownedTokenAccountPk,
//         tokenMint,
//         new u64(processedAmount),
//       );
//     }
//   }
//   return ownedTokenAccountPk;
// }

export async function createTokenAccount(
  connection: Connection,
  mint: PublicKey,
  owner: Account,
): Promise<PublicKey> {
  const newAccount = new Account();
  const tx = new Transaction();
  const signers = [owner, newAccount];
  const signerPks = signers.map((x) => x.publicKey);
  tx.add(
    ...(await createTokenAccountInstrs(
      connection,
      newAccount.publicKey,
      mint,
      owner.publicKey,
    )),
  );
  tx.setSigners(...signerPks);
  await _sendTransaction(connection, tx, signers);
  return newAccount.publicKey;
}

export async function createTokenAccountInstrs(
  connection: Connection,
  newAccountPubkey: PublicKey,
  mint: PublicKey,
  ownerPk: PublicKey,
  lamports?: number,
): Promise<TransactionInstruction[]> {
  if (lamports === undefined)
    lamports = await connection.getMinimumBalanceForRentExemption(165);
  return [
    SystemProgram.createAccount({
      fromPubkey: ownerPk,
      newAccountPubkey,
      space: 165,
      lamports,
      programId: TokenInstructions.TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeAccount({
      account: newAccountPubkey,
      mint,
      owner: ownerPk,
    }),
  ];
}
