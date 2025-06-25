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
async function main(slot = 'finalized', validatorIndex = 0) {
    const client = await createClient();

    // Get the beacon block for the slot from the beacon node.
    console.log(`Fetching block for slot ${slot} from the beacon node`);
    const blockRes = await client.beacon.getBlockV2({ blockId: slot });
    if (!blockRes.ok) {
        throw blockRes.error;
    }

    const blockView = BeaconBlock.toView(blockRes.value().message);
    const blockRoot = blockView.hashTreeRoot();
    console.log(`Beacon block root: ${toHex(blockRoot)}`);

    // Read the state from a local file or fetch it from the beacon node.
    let stateSsz;
    const stateFilename = `beaconstate_${slot}.ssz`;
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
    console.log(`slot: ${blockView.slot}`);

    // Read the validator's balance from the state
    const validatorBalance = stateView.balances.get(validatorIndex);
    console.log(`Validator ${validatorIndex} balance: ${validatorBalance}`);

    /** @type {import('@chainsafe/persistent-merkle-tree').Tree} */
    const beaconBlockTree = blockView.tree.clone();
    const stateRootGIndex = blockView.type.getPropertyGindex('stateRoot');
    // Patching the tree by attaching the state in the `stateRoot` field of the block.
    beaconBlockTree.setNode(stateRootGIndex, stateView.node);

    console.log(`State root gen index in block view: ${stateRootGIndex}`);

    // BeaconBlock.state.validators
    console.log(`\nGenerating validator container proof`);
    const genIndexValidatorsContainer = concatGindices([
        blockView.type.getPathInfo(['stateRoot']).gindex,
        stateView.type.getPathInfo(['validators']).gindex,
    ]);
    console.log(`gen index for validators container in beacon block: ${genIndexValidatorsContainer}`);
    const validatorsContainerProof = createProof(beaconBlockTree.rootNode, {
        type: ProofType.single,
        gindex: genIndexValidatorsContainer,
    });
    // console.log(
    //     `Proof of validators container to block root ${
    //         validatorsContainerProof.witnesses.length
    //     }: ${validatorsContainerProof.witnesses.map(toHex)}`
    // );
    console.log(`Proof of validators container to block root:\n${toHex(concatProof(validatorsContainerProof))}`);

    console.log(`\nGenerating validator pubkey proof`);
    const genIndexValidatorPubkey = concatGindices([
        blockView.type.getPathInfo(['stateRoot']).gindex,
        // stateView.type.getPathInfo(['validators', validatorIndex, 'pubkey']).gindex,
        stateView.type.getPathInfo(['validators', validatorIndex]).gindex,
        toGindex(3, 0n), // depth 3, index 0 for pubkey = 8
    ]);
    console.log(`gen index for pubkey of validator ${validatorIndex} in beacon block: ${genIndexValidatorPubkey}`);
    const validatorPubkeyProof = createProof(beaconBlockTree.rootNode, {
        type: ProofType.single,
        gindex: genIndexValidatorPubkey,
    });
    const validatorDetails = stateView.validators.get(validatorIndex);
    console.log(`Validator public key: ${toHex(validatorDetails.pubkey)}`);
    console.log(`Validator public key leaf: ${toHex(validatorPubkeyProof.leaf)}`);
    // console.log(
    //     `Proof for pubkey of validator ${validatorIndex} to block root ${
    //         validatorPubkeyProof.witnesses.length
    //     }: ${validatorPubkeyProof.witnesses.map(toHex)}`
    // );
    console.log(
        `Public key proof for validator ${validatorIndex} to beacon block root:\n${toHex(
            concatProof(validatorPubkeyProof)
        )}`
    );

    // Get the balance container root from the state view.
    const balanceContainerRoot = stateView.balances.hashTreeRoot();
    console.log(`Balance container root: ${toHex(balanceContainerRoot)}`);
    console.log(`gen index for state in beacon block: ${blockView.type.getPathInfo(['stateRoot']).gindex}`);
    console.log(`gen index for balances in state: ${stateView.type.getPathInfo(['balances']).gindex}`);

    // BeaconBlock.state.balances
    const genIndexBalancesContainer = concatGindices([
        blockView.type.getPathInfo(['stateRoot']).gindex,
        stateView.type.getPathInfo(['balances']).gindex,
    ]);
    console.log(`gen index for balances container in beacon block: ${genIndexBalancesContainer}`);

    // BeaconBlock.state.balances[validatorIndex]
    // There are 4 balances per leaf, so we need to divide by 4 which is right shift by 2.
    const balanceIndex = validatorIndex >> 2;
    console.log(`Balance index in the balances container: ${balanceIndex}`);
    console.log(
        `gen index for balance container using validatorIndex in state: ${
            stateView.type.getPathInfo(['balances', validatorIndex]).gindex
        }`
    );
    const genIndexBalanceContainer = toGindex(39, BigInt(balanceIndex));
    console.log(`index for balance in balances container: ${genIndexBalanceContainer}`);
    const genIndexBalanceInBlock = concatGindices([
        blockView.type.getPathInfo(['stateRoot']).gindex,
        stateView.type.getPathInfo(['balances', validatorIndex]).gindex,
    ]);
    console.log(`gen index for validator ${validatorIndex} balance in beacon block: ${genIndexBalanceInBlock}`);

    console.log(`\nGenerating balance in balances container proof`);
    const balancesTree = beaconBlockTree.getSubtree(genIndexBalancesContainer);
    console.log(`Balances sub tree root: ${toHex(balancesTree.root)}`);
    const balanceLeaf = beaconBlockTree.getRoot(genIndexBalanceInBlock);
    console.log(`Balance leaf using validator index: ${toHex(balanceLeaf)}`);

    const balanceInContainerProof = createProof(balancesTree.rootNode, {
        type: ProofType.single,
        gindex: genIndexBalanceContainer,
    });
    console.log(`Balance  leaf: ${toHex(balanceInContainerProof.leaf)}`);
    console.log(`Balances root: ${toHex(balancesTree.root)}`);
    // console.log(
    //     `Proof of balance in balances container ${
    //         balanceInContainerProof.witnesses.length
    //     }: ${balanceInContainerProof.witnesses.map(toHex)}`
    // );
    console.log(`Proof of balance in balances container in bytes :\n${toHex(concatProof(balanceInContainerProof))}`);

    console.log(`\nGenerating balances container proof`);
    const balancesContainerProof = createProof(beaconBlockTree.rootNode, {
        type: ProofType.single,
        gindex: genIndexBalancesContainer,
    });
    console.log(`Balances container leaf: ${toHex(balancesContainerProof.leaf)}`);
    // console.log(
    //     `Proof of balances container to block root ${
    //         balancesContainerProof.witnesses.length
    //     }: ${balancesContainerProof.witnesses.map(toHex)}`
    // );
    console.log(
        `Proof of balances container to beacon block root in bytes :\n${toHex(concatProof(balancesContainerProof))}`
    );

    // BeaconBlock.slot
    console.log(`\nGenerating slot proof to beacon block root`);
    const slotGenIndex = blockView.type.getPathInfo(['slot']).gindex;
    const slotProof = createProof(beaconBlockTree.rootNode, {
        type: ProofType.single,
        gindex: slotGenIndex,
    });
    console.log(`Slot leaf: ${toHex(slotProof.leaf)}`);
    // console.log(`Proof of slot to block root ${slotProof.witnesses.length}: ${slotProof.witnesses.map(toHex)}`);
    console.log(`Slot proof in bytes:\n${toHex(concatProof(slotProof))}`);

    // BeaconBlock.body.executionPayload.blockNumber
    console.log(`\nGenerating block number proof to beacon block root`);
    const blockNumberGenIndex = blockView.type.getPathInfo(['body', 'executionPayload', 'blockNumber']).gindex;
    console.log(`gen index for block number: ${blockNumberGenIndex}`);
    console.log(`Block number: ${blockView.body.executionPayload.blockNumber}`);
    const blockNumberProof = createProof(beaconBlockTree.rootNode, {
        type: ProofType.single,
        gindex: blockNumberGenIndex,
    });
    console.log(`Block number leaf: ${toHex(blockNumberProof.leaf)}`);
    // console.log(
    //     `Proof of block number to block root ${blockNumberProof.witnesses.length}: ${blockNumberProof.witnesses.map(
    //         toHex
    //     )}`
    // );
    console.log(`Block number proof in bytes:\n${toHex(concatProof(blockNumberProof))}`);

    // // Sanity check: verify gIndex and proof match.
    // console.log(`Verifying proof`);
    // verifyProof(
    //     blockRoot,
    //     genIndexValidatorInfo,
    //     validatorProof.witnesses,
    //     stateView.validators.get(validatorIndex).hashTreeRoot()
    // );

    // // Since EIP-4788 stores parentRoot, we have to find the descendant block of
    // // the block from the state.
    // console.log(`Fetching block header for parentRoot: ${toHex(blockRoot)}`);
    // // FIXME this is not working for some reason. It getting for the latest slot which is the default behavior of the API.
    // const nextBlockHeaderRes = await client.beacon.getBlockHeaders({ parentRoot: blockRoot });
    // if (!nextBlockHeaderRes.ok) {
    //     throw nextBlockHeaderRes.error;
    // }

    // /** @type {import('@lodestar/types/lib/phase0/types.js').SignedBeaconBlockHeader} */
    // const nextBlockHeader = nextBlockHeaderRes.value()[0]?.header;
    // console.log(`Parent block slot ${nextBlockHeader.message.slot}`);
    // console.log(`Parent block parent root: ${toHex(nextBlockHeader.message.parentRoot)}`);
    // if (!nextBlockHeader) {
    //     throw new Error('No block to fetch timestamp from');
    // }

    const validator = stateView.validators.get(validatorIndex);
    console.log(`Validator public key: ${toHex(validator.pubkey)}`);
    const pubkeyHash = ssz.BLSPubkey.hashTreeRoot(validator.pubkey);
    console.log(`Validator public key hash : ${toHex(pubkeyHash)}`);

    return {
        blockRoot: toHex(blockRoot),
        balanceContainerRoot: toHex(balanceContainerRoot),
        validatorIndex,
        validatorBalance: validatorBalance,
        validator: stateView.validators.type.elementType.toJson(validator),
    };
}

// startCheckPoint
// tx https://etherscan.io/tx/0x53263f068f2c7940028ec92eab3314f48626a776a78b9e3d467a316e374ba639
// tx is in Epoch 370665, slot 11861307, Block 22641157
// CheckpointCreated event
//   checkpointTimestamp 1749159707
//   beaconBlockRoot 0x871C9FF223BDC9004ADED09EF020F377A4783D963295ABA48226E94F5FEB1922
// beaconBlockRoot is the parent block root at that checkpoint timestamp
// But the previous block works as withdrawals are processed after block transactions
// Parent block in previous slot
// "data": {
//     "root": "0x585c4d7ebaf81965655dd5495398eaef3a54551e09ac93803b8c8bd2b53dcf3d",
//     "canonical": true,
//     "header": {
//       "message": {
//         "slot": "11861305",
//         "proposer_index": "1449442",
//         "parent_root": "0xa6f1768fee5022dc486a0ecb540f2568d4ff4cce789b8d5fa3858268efc524e5",
//         "state_root": "0x6e1d61add432150ea7433c02ef9552ea119732347359e51745d2b8163379d84d",
//         "body_root": "0xc7c01b557f889fb718c7dd65f199abe3e55477d9ffafa67c53fba7ca88b278b1"
//       },
//       "signature": "0x89e357796377433db4e385deb90e67f20c5fbd68cbcb0f8e5cb89aacf8bafe5632d31c814a91b9aa4d2af8e90cebe91101961bc7dc9a80f40ccad718bba4bfe24f531e91ded19bf710905141e9b97e7f6d56b73ed22380c19763ee8043ea10fe"
//     }
//   }
// https://wispy-evocative-card.quiknode.pro/48bd43e784ff466119a5ce572add3d026fc2abb3/eth/v1/beacon/headers/0x871C9FF223BDC9004ADED09EF020F377A4783D963295ABA48226E94F5FEB1922
// "data": {
//     "root": "0x871c9ff223bdc9004aded09ef020f377a4783d963295aba48226e94f5feb1922",
//     "canonical": true,
//     "header": {
//       "message": {
//         "slot": "11861306",
//         "proposer_index": "551559",
//         "parent_root": "0x585c4d7ebaf81965655dd5495398eaef3a54551e09ac93803b8c8bd2b53dcf3d",
//         "state_root": "0xd90dd8563f5892a27f3115a991f768ff909ce93e24cf1de56dc01a3e8553a8d5",
//         "body_root": "0xb524399d85b76defe65dda6813c990c0d77f64dc05870985702b3f9ae633f6fd"
//       },
//       "signature": "0xa206513241dda274a3dd9405747ff4bdeb5a30b6ec2788d870dd1f40946ce9364dd0d907474234aef1bd6394d9de2e1c044f887d80adbbba65a4364bb7d477e725dcdc33d1a0d62ae95fcbf4a383af1d14ce2dd9d6c84659147f19357aa42484"
//     }
//   }
// The next block with the parent root of the checkpoint block
// https://wispy-evocative-card.quiknode.pro/48bd43e784ff466119a5ce572add3d026fc2abb3/eth/v1/beacon/headers?parent_root=0x871c9ff223bdc9004aded09ef020f377a4783d963295aba48226e94f5feb1922
// "data":
// {
//     "root": "0xd33574842aabc553574750a093a4f5be40c79306de9915744f0fd297a3570e6e",
//     "canonical": true,
//     "header": {
//     "message": {
//         "slot": "11861307",
//         "proposer_index": "1812008",
//         "parent_root": "0x871c9ff223bdc9004aded09ef020f377a4783d963295aba48226e94f5feb1922",
//         "state_root": "0xb924cf40b7804d1cb8168abbc530a723559df287a15413ad63d4ccc9727361e3",
//         "body_root": "0x20bac52c8a6f66936c75959040b304ceb950b48fd0b17f0375c9275c740049f8"
//     },
//     "signature": "0x90eaa4fb52be929546b5e17cd381449d231275af5131379e6969e0a2a4bf1d2d914b1acbf9e5899647b9dc2f90a128550073d7845663690c823e0cfc81517c435ed94d0b5813139d877a2565a18a384400c9a51da699f4bd5d2008192ebc927f"
//     }
// }
// tx https://etherscan.io/tx/0xe7f33ba7e8b6b9dfef50d35f25577fc3a47df0a99452a636e9cf05dfe1d427ac
// verifyCheckpointProofs
// tx is in Epoch 370666, slot 11861320, Block 22641170
// Validator index 1770189 has no balance at that slot
// Validator index 1770193 has balance 32001800437 Gwei at that slot

// Slot, Validator index
// main(11861306, 1770189).then(console.log).catch(console.error);
// main(11861306, 1770193).then(console.log).catch(console.error);
// Validator 1770193 deposited in slot 10961946 exited in slot 11921028
// main(11861307, 1770193).then(console.log).catch(console.error);
main(11999549, 1770193).then(console.log).catch(console.error);

// Validator in EigenPod verifyWithdrawalCredentials
// tx 0xb1b848991c3cba0851b4742cdae067001de91562df8c91b53d26324c987b42e7
// this has since been withdrawn
// main(11952064, 1770189).then(console.log).catch(console.error);
