import fs from 'fs';
import { ssz } from '@lodestar/types';
import { concatGindices, createProof, ProofType, toGindex } from '@chainsafe/persistent-merkle-tree';

import { createClient } from './client.js';
import { toHex, concatProof } from './utils.js';

const BeaconState = ssz.electra.BeaconState;
const BeaconBlock = ssz.electra.BeaconBlock;

/**
 * @param {string|number} slot
 * @param {number} validatorIndex
 */
async function main(slot = 'finalized', validatorIndex) {
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
    console.log(`BeaconBlock.slot: ${blockView.slot}`);
    console.log(`BeaconBlock.body.executionPayload.blockNumber: ${blockView.body.executionPayload.blockNumber}`);
    console.log(`BeaconBlock.body.executionPayload.timestamp: ${blockView.body.executionPayload.timestamp}`);
    console.log(
        `BeaconBlock.body.executionRequests.deposits length: ${blockView.body.executionRequests.deposits.length}`
    );
    console.log(
        `BeaconBlock.body.executionRequests.withdrawals length: ${blockView.body.executionRequests.withdrawals.length}`
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
        console.log(`Fetching state for slot ${slot} from the beacon node`);
        const stateRes = await client.debug.getStateV2({ stateId: slot }, 'ssz');
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
    console.log(`BeaconBlock.state.slot: ${stateView.slot}`);
    console.log(`BeaconBlock.state.latestBlockHeader.slot: ${stateView.latestBlockHeader.slot}`);
    console.log(`BeaconBlock.state.eth1DepositIndex: ${stateView.eth1DepositIndex}`);
    console.log(`BeaconBlock.state.depositRequestsStartIndex: ${stateView.depositRequestsStartIndex}`);
    console.log(`BeaconBlock.state.pendingDeposits length: ${stateView.pendingDeposits.length}`);
    console.log(`BeaconBlock.state.pendingPartialWithdrawals length: ${stateView.pendingPartialWithdrawals.length}`);
    console.log(`BeaconBlock.state.pendingConsolidations length: ${stateView.pendingConsolidations.length}`);
    console.log(`BeaconBlock.state.depositBalanceToConsume: ${stateView.depositBalanceToConsume}`);

    console.log(`gindex of pending deposit index in state: ${stateView.type.getPathInfo(['pendingDeposits']).gindex}`);
    console.log(
        `gindex of pending deposit at index 0 in state : ${stateView.type.getPathInfo(['pendingDeposits', 0]).gindex}`
    );
    console.log(
        `gindex of pending deposit at last pos in state: ${
            stateView.type.getPathInfo(['pendingDeposits', stateView.pendingDeposits.length - 1]).gindex
        }`
    );

    console.log(`\nFirst deposit in the pending deposits queue`);
    const nextDeposit = stateView.pendingDeposits.get(0);
    console.log(`amount ${nextDeposit.amount}`);
    console.log(`pubkey ${toHex(nextDeposit.pubkey)}`);
    console.log(`slot ${nextDeposit.slot}`);
    console.log(`withdrawalCredentials ${toHex(nextDeposit.withdrawalCredentials)}`);
    // console.log(`signature ${toHex(nextDeposit.signature)}`);

    console.log(`\nLast last deposit in the pending deposits queue`);
    const lastDeposit = stateView.pendingDeposits.get(stateView.pendingDeposits.length - 1);
    console.log(`amount ${lastDeposit.amount}`);
    console.log(`pubkey ${toHex(lastDeposit.pubkey)}`);
    console.log(`slot ${lastDeposit.slot}`);
    console.log(`withdrawalCredentials ${toHex(lastDeposit.withdrawalCredentials)}`);
    // console.log(`signature ${toHex(lastDeposit.signature)}`);

    const validatorPubKeyBuffer = Buffer.from(
        // '960cae33dfddd0c53d47aa43e526a7688fa9437cdb8f08eab765bac15f4afa1f9f14e7ea45eaecd7dbdc91a3f82e237c',
        '8e49d4be22748a7755cc25926b17e9c4346fe9002a74356da558aba3e70db11a0a5bbd3c15ecfbf86e9f0c85c9e0e962',
        'hex'
    );
    console.log(`\nLooking for deposits to validator with pubkey: ${toHex(validatorPubKeyBuffer)}`);
    let depositsFound = 0;
    for (let i = 0; i < stateView.pendingDeposits.length; i++) {
        const deposit = stateView.pendingDeposits.get(i);
        if (Buffer.from(deposit.pubkey).equals(validatorPubKeyBuffer)) {
            console.log(`Found deposit at index ${i}`);
            console.log(`amount ${deposit.amount}`);
            console.log(`pubkey ${toHex(deposit.pubkey)}`);
            console.log(`slot ${deposit.slot}`);
            console.log(`withdrawalCredentials ${toHex(deposit.withdrawalCredentials)}`);
            // console.log(`signature ${toHex(deposit.signature)}`);
            depositsFound++;
        }
    }
    console.log(`${depositsFound} deposits found for validator`);

    console.log(`\nBeaconBlock.state.validators length: ${stateView.validators.length}`);
    if (validatorIndex) {
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
    }

    /** @type {import('@chainsafe/persistent-merkle-tree').Tree} */
    const beaconBlockTree = blockView.tree.clone();
    const stateRootGIndex = blockView.type.getPropertyGindex('stateRoot');
    // Patching the tree by attaching the state in the `stateRoot` field of the block.
    beaconBlockTree.setNode(stateRootGIndex, stateView.node);

    // BeaconBlock.state.PendingDeposits[0].slot
    console.log(`\nGenerating proof for the slot of the first pending deposit`);
    const genIndex = concatGindices([
        blockView.type.getPathInfo(['stateRoot']).gindex,
        stateView.type.getPathInfo(['pendingDeposits', 0]).gindex,
        toGindex(3, 4n), // depth 3, index 4 for slot = 11
    ]);
    console.log(`gen index for the slot in the first pending deposit in the beacon block: ${genIndex}`);
    const firstDepositSlotProof = createProof(beaconBlockTree.rootNode, {
        type: ProofType.single,
        gindex: genIndex,
    });
    console.log(`Slot of the first pending deposit : ${nextDeposit.slot}`);
    console.log(`Leaf for the slot of the first pending deposit: ${toHex(firstDepositSlotProof.leaf)}`);
    console.log(
        `Proof for the slot of the first pending deposit ${
            firstDepositSlotProof.witnesses.length
        }: ${firstDepositSlotProof.witnesses.map(toHex)}`
    );
    console.log(
        `Proof in bytes for the slot of the first pending deposit:\n${toHex(concatProof(firstDepositSlotProof))}`
    );
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

// Pectra upgrade slot 11649024
// main(11649024);
// Next epoch after the Pectra upgrade
main(11649060);