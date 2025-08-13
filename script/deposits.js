import fs from 'fs';
import { ssz } from '@lodestar/types';
import { formatUnits } from 'ethers';
import { concatGindices, createProof, ProofType, toGindex } from '@chainsafe/persistent-merkle-tree';

import { createClient } from './client.js';
import { toHex, concatProof } from './utils.js';

const BeaconState = ssz.electra.BeaconState;
const BeaconBlock = ssz.electra.BeaconBlock;

/**
 * @param {string|number} slot
 * @param {number} validatorIndex
 */
async function main(slot = 'head', validatorIndex) {
    const client = await createClient();

    // Get the beacon block for the slot from the beacon node.
    console.log(`Fetching block for slot ${slot} from the beacon node`);
    const blockRes = await client.beacon.getBlockV2({ blockId: slot });
    if (!blockRes.ok) {
        throw blockRes.error;
    }

    const blockView = BeaconBlock.toView(blockRes.value().message);
    const blockRoot = blockView.hashTreeRoot();
    console.log(`Beacon block root : ${toHex(blockRoot)}`);
    console.log(`Beacon parent root: ${toHex(blockView.parentRoot)}`);
    console.log(`BeaconBlock.slot  : ${blockView.slot}`);
    console.log(`Epoch             : ${BigInt(blockView.slot) / 32n}`);
    console.log(`BeaconBlock.body.executionPayload.blockNumber   : ${blockView.body.executionPayload.blockNumber}`);
    console.log(`BeaconBlock.body.executionPayload.timestamp     : ${blockView.body.executionPayload.timestamp}`);
    console.log(
        `BeaconBlock.body.executionRequests.deposits length      : ${blockView.body.executionRequests.deposits.length}`
    );
    console.log(
        `BeaconBlock.body.executionRequests.withdrawals length   : ${blockView.body.executionRequests.withdrawals.length}`
    );
    console.log(
        `BeaconBlock.body.executionRequests.consolidations length: ${blockView.body.executionRequests.consolidations.length}`
    );

    // Read the state from a local file or fetch it from the beacon node.
    let stateSsz;
    const stateFilename = `beaconstate_${blockView.slot}.ssz`;
    if (fs.existsSync(stateFilename)) {
        console.log(`Loading state from file ${stateFilename}`);
        stateSsz = fs.readFileSync(stateFilename);
    } else {
        console.log(`Fetching state for slot ${blockView.slot} from the beacon node`);
        const stateRes = await client.debug.getStateV2({ stateId: blockView.slot }, 'ssz');
        if (!stateRes.ok) {
            throw stateRes.error;
        }

        fs.writeFileSync(stateFilename, stateRes.ssz());
        stateSsz = stateRes.ssz();
    }

    const stateView = BeaconState.deserializeToView(stateSsz);
    const stateRoot = stateView.hashTreeRoot();
    console.log(`State root: ${toHex(stateRoot)}`);

    // Read the deposit index from the state view.
    console.log(`BeaconBlock.state.slot                     : ${stateView.slot}`);
    console.log(`BeaconBlock.state.latestBlockHeader.slot   : ${stateView.latestBlockHeader.slot}`);
    console.log(`BeaconBlock.state.eth1DepositIndex         : ${stateView.eth1DepositIndex}`);
    console.log(`BeaconBlock.state.depositRequestsStartIndex: ${stateView.depositRequestsStartIndex}`);
    console.log(`BeaconBlock.state.pendingDeposits length          : ${stateView.pendingDeposits.length}`);
    console.log(`BeaconBlock.state.pendingPartialWithdrawals length: ${stateView.pendingPartialWithdrawals.length}`);
    console.log(`BeaconBlock.state.pendingConsolidations length    : ${stateView.pendingConsolidations.length}`);
    console.log(`BeaconBlock.state.depositBalanceToConsume  : ${stateView.depositBalanceToConsume}`);

    console.log(`gindex of pending deposit index in state: ${stateView.type.getPathInfo(['pendingDeposits']).gindex}`);
    console.log(
        `gindex of pending deposit at index 0 in state : ${stateView.type.getPathInfo(['pendingDeposits', 0]).gindex}`
    );
    console.log(
        `gindex of pending deposit at last pos in state: ${
            stateView.type.getPathInfo(['pendingDeposits', stateView.pendingDeposits.length - 1]).gindex
        }`
    );

    console.log('Deposits that are out of order by slot:');
    let lastDeposit;
    for (let i = 0; i < stateView.pendingDeposits.length; i++) {
        const deposit = stateView.pendingDeposits.get(i);
        if (i > 0 && deposit.slot < lastDeposit.slot && deposit.slot != 0) {
            console.log(
                `  ${i - 1}, slot ${lastDeposit.slot}, amount ${formatUnits(
                    lastDeposit.amount,
                    9
                )}, withdrawalCredentials ${toHex(lastDeposit.withdrawalCredentials)}, pubkey ${toHex(
                    lastDeposit.pubkey
                )}, signature ${toHex(lastDeposit.signature)}`
            );
            console.log(
                `  ${i}, slot ${deposit.slot}, amount ${formatUnits(deposit.amount, 9)}, withdrawalCredentials ${toHex(
                    deposit.withdrawalCredentials
                )}, pubkey ${toHex(deposit.pubkey)}, signature ${toHex(deposit.signature)}`
            );
        }
        lastDeposit = deposit;
    }

    console.log('Pending deposits with a slot with a zero value');
    let zeroSlotDeposits = 0;
    for (let i = 0; i < stateView.pendingDeposits.length; i++) {
        const deposit = stateView.pendingDeposits.get(i);
        if (deposit.slot == 0) {
            zeroSlotDeposits++;
            console.log(
                `  ${i} slot ${deposit.slot}, amount ${formatUnits(deposit.amount, 9)}, withdrawalCredentials ${toHex(
                    deposit.withdrawalCredentials
                )}, pubkey ${toHex(deposit.pubkey)}, signature ${toHex(deposit.signature)}`
            );
        }
    }
    console.log(`${zeroSlotDeposits} of ${stateView.pendingDeposits.length} deposits have a zero slot`);

    if (stateView.pendingDeposits.length > 0) {
        console.log(
            `\nIndex 0 - first deposit in the pending deposits queue of ${stateView.pendingDeposits.length} deposits`
        );
        const nextDeposit = stateView.pendingDeposits.get(0);
        console.log(`  amount ${nextDeposit.amount}`);
        console.log(`  pubkey ${toHex(nextDeposit.pubkey)}`);
        console.log(`  slot ${nextDeposit.slot}`);
        console.log(`  withdrawalCredentials ${toHex(nextDeposit.withdrawalCredentials)}`);
        // console.log(`signature ${toHex(nextDeposit.signature)}`);

        console.log(
            `\nindex ${stateView.pendingDeposits.length - 1} - last last deposit in the pending deposits queue of ${
                stateView.pendingDeposits.length
            } deposits`
        );
        const lastDeposit = stateView.pendingDeposits.get(stateView.pendingDeposits.length - 1);
        console.log(`  amount ${lastDeposit.amount}`);
        console.log(`  pubkey ${toHex(lastDeposit.pubkey)}`);
        console.log(`  slot ${lastDeposit.slot}`);
        console.log(`  withdrawalCredentials ${toHex(lastDeposit.withdrawalCredentials)}`);
        // console.log(`signature ${toHex(lastDeposit.signature)}`);

        console.log(`Pending deposit container height: ${nextDeposit.type.depth}`);
    } else {
        const emptyDeposit = stateView.pendingDeposits.get(0);
        console.log(`Root hash of an empty pending deposit: ${toHex(emptyDeposit.hashTreeRoot())}`);
    }

    if (validatorIndex) {
        const validatorPubKeyBuffer = stateView.validators.get(validatorIndex)?.pubkey;
        console.log(`\nLooking for deposits to validator with pubkey: ${toHex(validatorPubKeyBuffer)}`);
        let depositsFound = 0;
        for (let i = 0; i < stateView.pendingDeposits.length; i++) {
            const deposit = stateView.pendingDeposits.get(i);
            if (Buffer.from(deposit.pubkey).equals(validatorPubKeyBuffer)) {
                console.log(
                    `  index ${i}, slot ${deposit.slot}, amount ${deposit.amount}, withdrawalCredentials ${toHex(
                        deposit.withdrawalCredentials
                    )}, pubkey ${toHex(deposit.pubkey)}, signature ${toHex(deposit.signature)}`
                );
                depositsFound++;
            }
        }
        console.log(
            `${depositsFound} deposits found for validator in ${stateView.pendingDeposits.length} pending deposits`
        );

        console.log(`\nBeaconBlock.state.validators length: ${stateView.validators.length}`);

        const validator = stateView.validators.get(validatorIndex);
        if (!validator.toValue()) {
            console.log(`Validator with index ${validatorIndex} not found`);
            return;
        }
        console.log(`Validator details for index: ${validatorIndex}`);
        console.log(`effective balance: ${validator.effectiveBalance}`);
        console.log(`slashed: ${validator.slashed}`);
        console.log(`activation eligibility epoch: ${validator.activationEligibilityEpoch}`);
        console.log(`activation epoch: ${validator.activationEpoch}`);
        console.log(`exit epoch: ${validator.exitEpoch}`);
        console.log(`withdrawable epoch: ${validator.withdrawableEpoch}`);
        console.log(`pubkey: ${toHex(validator.pubkey)}`);
        console.log(`withdrawal credentials: ${toHex(validator.withdrawalCredentials)}`);

        console.log(`Validator balance: ${stateView.balances.get(validatorIndex)}`);

        console.log(`Validator container height: ${validator.type.depth}`);
    }

    console.log(`Beacon block container height: ${blockView.type.depth}`);
    console.log(`State container height: ${stateView.type.depth}`);
    console.log(`Pending deposits height: ${stateView.pendingDeposits.type.depth}`);
    console.log(`Validators height: ${stateView.validators.type.depth}`);

    console.log(
        `Gen index of the first pending deposit in the state: ${
            stateView.type.getPathInfo(['pendingDeposits', 0]).gindex
        }`
    );
    console.log(`Gen index of the validators root in the state: ${stateView.type.getPathInfo(['validators']).gindex}`);

    /** @type {import('@chainsafe/persistent-merkle-tree').Tree} */
    const beaconBlockTree = blockView.tree.clone();
    const stateRootGIndex = blockView.type.getPropertyGindex('stateRoot');
    // Patching the tree by attaching the state in the `stateRoot` field of the block.
    beaconBlockTree.setNode(stateRootGIndex, stateView.node);

    // BeaconBlock.state.PendingDeposits[0].slot
    // console.log(`\nGenerating proof for the slot of the first pending deposit`);
    // const genIndex = concatGindices([
    //     blockView.type.getPathInfo(['stateRoot']).gindex,
    //     stateView.type.getPathInfo(['pendingDeposits', 0]).gindex,
    //     toGindex(3, 4n), // depth 3, index 4 for slot = 11
    // ]);
    // console.log(`gen index for the slot in the first pending deposit in the beacon block: ${genIndex}`);
    // const firstDepositSlotProof = createProof(beaconBlockTree.rootNode, {
    //     type: ProofType.single,
    //     gindex: genIndex,
    // });
    // console.log(`Leaf for the slot of the first pending deposit: ${toHex(firstDepositSlotProof.leaf)}`);
    // console.log(
    //     `Proof for the slot of the first pending deposit ${
    //         firstDepositSlotProof.witnesses.length
    //     }: ${firstDepositSlotProof.witnesses.map(toHex)}`
    // );
    // console.log(
    //     `Proof in bytes for the slot of the first pending deposit:\n${toHex(concatProof(firstDepositSlotProof))}`
    // );

    console.log(`Withdrawal requests ${blockView.body.executionRequests.withdrawals.length}`);
    // beconBlock.beaconBlockBody.executionRequests.withdrawals[WithdrawalRequest]
}

// Slot
// await main('head');
// Validator 1967047 0x8e49d4be22748a7755cc25926b17e9c4346fe9002a74356da558aba3e70db11a0a5bbd3c15ecfbf86e9f0c85c9e0e962
// First deposit of 1 ETH
// await main(11877795, 1967047);
// Second deposit of 31 ETH
// await main(11945653, 1967047);
// Last slot with a pending deposit of 1 ETH, last slot in epoch 373501
// await main(11952063, 1967047);
// The first deposit of 1 ETH is processed. first slot in epoch 373502
// await main(11952064, 1967047);

// Deposit to the Beacon Deposit Contract
// await main(11904764, 1966988);
// Validator 1966988 with pubkey 0x960cae33dfddd0c53d47aa43e526a7688fa9437cdb8f08eab765bac15f4afa1f9f14e7ea45eaecd7dbdc91a3f82e237c
// Slot before the validator was registered, the second last in epoch 373473
// await main(11951166, 1966988);
// Slot the validator was registered on the consensus layer, which is the last in epoch 373473
// await main(11951167, 1966988);
// The first slot in epoch 373474 which is before the activation eligibility epoch 373475
// The validator is registered in this slot with a balance
// await main(11951168, 1966988);
// Epoch 373475 the validator joins the queue to be activated
// The first slot in epoch before activation 373474
// await main(11951168, 1966988);
// The last slot in the epoch before activation 373474
// await main(11951199, 1966988);
// 11951200 is the first slot in epoch 373475
// await main(11951200, 1966988);
// The last slot in epoch 373475
// await main(11951231, 1966988);
// The first slot in epoch 373476
// await main(11951232, 1966988);

// First slot in epoch 373481 when the validator was activated
// await main(11951392, 1966988);

// main(11935963);
// main(11937422);
// Has 30 deposits from Ether.fi
// main(11941369);
// Slot before 30 deposits
// main(11941368);

// Latest mainnet slot
// main(12301392);

// Latest Hoodi slot
// main('head');

// Pectra upgrade slot 11649024
// main(11649024);
// Next epoch after the Pectra upgrade
// main(11649060);

// Pectra slot with no deposits
main(1015024, 1204929);

// Pectra validator with a deposit while exiting
// withdrawal address 0xf7749b41db006860cec0650d18b8013d69c44eeb
// Slot before the exit request
// main(956712, 1187281);
// Exit request was processed in slot 956713
// main(956713, 1187281);
// The slot the 32 ETH deposit was requested
// main(972268, 1187281);
// The slot after the deposit was requested
// main(972269, 1187281);

// main(975000, 1187281);

// The slot before the deposit was processed on the beacon chain
// main(988670, 1187281);
// The slot the 32 ETH deposit was swept in block 923896
// main(988671, 1187281);
// The slot before the exit request was processed on the beacon chain
// main(990313, 1187281);
// The slot the exit request was processed on the beacon chain
// main(990314, 1187281);

// New 1 ETH deposit made on the execution layer
// main(1062911, 1187281);

// Slot with on-chain exit request in block 989355
// main(1062956, 1187282);
// Slot of deposit of 1 ETH in block 989379
// main(1062981, 1187282);
// Latest slot with a deposit of 1 ETH to an exiting validator
// main('head', 1187282);
