import { getBeaconBlock, getBeaconState } from './client.js';
import { toHex } from './utils.js';
import { concatGindices } from '@chainsafe/persistent-merkle-tree';

const firstSummarySlot = 6217728n;
const slotsPerHistoricalRoot = 8192n;

/**
 * @param {string|number} blockId
 * @param {number} validatorIndex
 */
async function main(blockId = 'head', oldSlot) {
    const currentBlockView = await getBeaconBlock(blockId);
    logBeaconBlock(currentBlockView);

    const { historicalSummariesIndex, blockRootsIndex, historicalSummaryFirstSlot } = calcIndexes(oldSlot);

    const currentStateView = await getBeaconState(currentBlockView.slot);

    console.log(
        `There are ${currentStateView.historicalSummaries.length} historical summaries in slot ${currentBlockView.slot}`
    );
    const historicalSummary = currentStateView.historicalSummaries.get(historicalSummariesIndex);
    if (!historicalSummary) {
        throw new Error(`Historical summary not found`);
    }
    console.log(
        `Historical summary root of blockRoots at index ${historicalSummariesIndex}: ${toHex(
            historicalSummary.blockSummaryRoot
        )}`
    );

    /// Get block roots for historical summaries

    console.log(`First slot for a historical summary: ${historicalSummaryFirstSlot}`);
    const firstSlotInSummaryStateView = await getBeaconState(historicalSummaryFirstSlot);

    const genIndexHistoricalSummaries = concatGindices([
        currentBlockView.type.getPathInfo(['stateRoot']).gindex,
        firstSlotInSummaryStateView.type.getPathInfo(['historicalSummaries']).gindex,
    ]);
    console.log(`Historical summaries container gindex: ${genIndexHistoricalSummaries}`);

    console.log(
        `\nSlot ${historicalSummaryFirstSlot} has ${
            firstSlotInSummaryStateView.blockRoots.length
        } block roots with root ${toHex(firstSlotInSummaryStateView.blockRoots.hashTreeRoot())}`
    );
    if (toHex(historicalSummary.blockSummaryRoot) !== toHex(firstSlotInSummaryStateView.blockRoots.hashTreeRoot())) {
        throw Error(
            `Historical summary block root ${toHex(
                historicalSummary.blockSummaryRoot
            )} does not match root of blockRoot for the first slot ${historicalSummaryFirstSlot} in epoch ${
                historicalSummaryFirstSlot / 32n
            } ${toHex(firstSlotInSummaryStateView.blockRoots.hashTreeRoot())}`
        );
    }

    const beaconBlockRoot = toHex(firstSlotInSummaryStateView.blockRoots.get(blockRootsIndex));
    console.log(`Historical slot ${oldSlot} has beacon block root ${beaconBlockRoot}`);
    for (let i = 0; i < firstSlotInSummaryStateView.blockRoots.length; i++) {
        const root = toHex(firstSlotInSummaryStateView.blockRoots.get(i));
        if (root == beaconBlockRoot) {
            console.log(`Found block at index ${i} ${root}`);
        }
    }

    console.log(`\nHistorical beacon block:`);
    const historicalBlockView = await getBeaconBlock(oldSlot);
    logBeaconBlock(historicalBlockView);
}

const calcIndexes = (slot) => {
    const slotBI = BigInt(slot);

    if (slotBI < firstSummarySlot) {
        throw new Error(`Slot ${slot} is before the first historical summary slot ${firstSummarySlot}`);
    }
    const historicalSummariesIndex = (slotBI - firstSummarySlot) / slotsPerHistoricalRoot + 1n;
    // Take one off as that is the parent block root
    const blockRootsIndex = slotBI % slotsPerHistoricalRoot;
    console.log(
        `Slot ${slot} historical summary index ${historicalSummariesIndex} and beacon root index ${blockRootsIndex}`
    );

    // Calculate the first slot of a historical summaries to get the block roots
    // Warning, this will not work if the first slot in the epoch was missed
    const historicalSummaryFirstSlot = historicalSummariesIndex * slotsPerHistoricalRoot + firstSummarySlot;
    console.log(`First slot of a historical summary: ${historicalSummaryFirstSlot}`);

    return {
        historicalSummariesIndex,
        blockRootsIndex,
        historicalSummaryFirstSlot,
    };
};

const logBeaconBlock = (blockView) => {
    console.log(`Beacon block slot : ${blockView.slot}`);
    console.log(`Beacon block root : ${toHex(blockView.hashTreeRoot())}`);
    console.log(`Beacon parent root: ${toHex(blockView.parentRoot)}`);
    console.log(`Epoch             : ${blockView.slot / 32}`);
    console.log(`body.executionPayload.blockNumber: ${blockView.body.executionPayload.blockNumber}`);
    console.log(`block body.executionPayload.timestamp: ${blockView.body.executionPayload.timestamp}`);
};

// Slot
// await main('head');
// First historical summary
// await main(12279967, firstSummarySlot);
// await main(12279967, firstSummarySlot + slotsPerHistoricalRoot);
// First slot from the electra fork
await main(12279967, 11649024);
// await main(12279967, 12200000);
// await main(12279967, 12200000);

// Second last slot in epoch 382975. parent root at index 8189
// Beacon block root : 0xd8e052757fa58df5b4e57922d3d641719fea14b99ac1a1acae2498ec86b6c9bb
// Beacon parent root: 0x9f428966e3bd2a03319400c76c6e1d68a8ab9dd19be5ef1a6496affd5cf58969
// 8192 beacon block roots with root 0xc02f71346d7deedd7d15f34c0078690f4468d84c965ad9ce75478909217e2500
// Last historical block summary root at index 736: 0xab969ba664ab770cd857251a9fa5c5d6b1cd5d52aa26428856d776a3fcff5612
// 737 historical summaries found in the state. That's 6037504 slots.
// await main(12255230, 12200000);
// await main(12279967, 12255230);

// 12255231 last slot in epoch 382975. parent root at index 8190
// Beacon block root : 0x64b38b619a51cfe045382cfad6e28b0b372131651db4f47f4287bce4fb686a4b
// Beacon parent root: 0xd8e052757fa58df5b4e57922d3d641719fea14b99ac1a1acae2498ec86b6c9bb
// 8192 beacon block roots with root 0xc819bd346c8a52935eb9c0b2f3fbbbc4fc7831dcc4a8c9801e8526ce8f96458a
// Last historicalSummary index 736 with root 0xab969ba664ab770cd857251a9fa5c5d6b1cd5d52aa26428856d776a3fcff5612
// 737 historical summaries found in the state. That's 6037504 slots.
// Current block parent root found at blockRoots index 8190 0xd8e052757fa58df5b4e57922d3d641719fea14b99ac1a1acae2498ec86b6c9bb
// blockRoot 8190 is for slot the previous slot 12255230
// await main(12255231, 12200000);
// await main(12279967, 12255231);

// 12255232 First slot in epoch 382976. parent root at index 0
// Beacon block root : 0x8c81b6c163fd16217ddcb1d09f44cfa20a03233e356ad915fbd9583b14112f44
// Beacon parent root: 0x64b38b619a51cfe045382cfad6e28b0b372131651db4f47f4287bce4fb686a4b
// 8192 beacon block roots with root 0xc1ef88b9c2943daa9c047e06d291a46e89f1d5bf6689cf87be0a1ffdbfced494
// block root is the same as the new historicalSummaries root 0xc1ef88b9c2943daa9c047e06d291a46e89f1d5bf6689cf87be0a1ffdbfced494
// Last historical block summary root at index 737: 0xc1ef88b9c2943daa9c047e06d291a46e89f1d5bf6689cf87be0a1ffdbfced494
// 738 historical summaries found in the state. That's 6045696 slots.
// Current block parent root found at blockRoots index 8191 0x64b38b619a51cfe045382cfad6e28b0b372131651db4f47f4287bce4fb686a4b
// blockRoot 8191 is for slot the previous slot 12255231 in the previous epoch
// 12255232 - 737 * 8192 = 6217728
// await main(12255232, 12200000);
// await main(12279499, 12255232);

// 12255233 second slot in epoch 382976. parent root at index 1
// Beacon block root : 0xcf1eb5f39e0b23006924dc0d79f1bb0538f7fddd2220f3f64869d2ec0e0d9095
// Beacon parent root: 0x8c81b6c163fd16217ddcb1d09f44cfa20a03233e356ad915fbd9583b14112f44
// 8192 beacon block roots with root 0x8456e22fa14ff5fbcc6b431fbd431555d1f4c9d192ff98ea427676ee2f1a31fb
// Current block parent root found at blockRoots index 0 0x8c81b6c163fd16217ddcb1d09f44cfa20a03233e356ad915fbd9583b14112f44
// 738 historical summaries found in the state. That's 6045696 slots.
// Last historical block summary root at index 737: 0xc1ef88b9c2943daa9c047e06d291a46e89f1d5bf6689cf87be0a1ffdbfced494
// await main(12255233, 12200000);
// await main(12279499, 12255233);

// await main(12263391, 12200000); // last slot in epoch 383230. parent root at index 8158
// await main(12263392, 12200000); // first slot in epoch 383231. parent root at index 8159

// last slot in epoch 383231. parent root at index 8190
// Beacon block root : 0xb41d013b75c95252179ce539e23757db8dc0d6d0698fa3180e97b0a2488f28fa
// Beacon parent root: 0x854690b03c3ac3ac8a0f6fa46aca6b594ce7b082be7ab15b3a53a093466ded95
// 8192 beacon block roots with root 0xb8d1a4341679e8c9c67028d3b96eb1d8025c7685aa9bf1bf9c872dc427e8793a
// Current block parent root found at blockRoots index 8190 0x854690b03c3ac3ac8a0f6fa46aca6b594ce7b082be7ab15b3a53a093466ded95
// Last historical block summary root at index 737: 0xc1ef88b9c2943daa9c047e06d291a46e89f1d5bf6689cf87be0a1ffdbfced494
// await main(12263423, 12200000);

// was a missed slot. First slot in epoch 383232
// await main(12263424, 12200000);

// Second slot in epoch 383232
// Beacon block root : 0x07459f09fd932325afb1eb470718ca85bdc6b3a51b83f1de224df41db329b3b0
// Beacon parent root: 0xb41d013b75c95252179ce539e23757db8dc0d6d0698fa3180e97b0a2488f28fa
// 8192 beacon block roots with root 0x18588bae10f1bf466d264cea4cfbbb3ba1daa919dc58ec8f4a3086f49fafff0e
// Current block parent root found at blockRoots index 0 0xb41d013b75c95252179ce539e23757db8dc0d6d0698fa3180e97b0a2488f28fa
// Current block parent root found at blockRoots index 8191 0xb41d013b75c95252179ce539e23757db8dc0d6d0698fa3180e97b0a2488f28fa
// Last historical block summary root at index 738: 0xc4fd681b33e6102af708a6c5f4adfa206bc8601ba3cad5911e50f864ca2d4317
// blockRoot 0 is for slot 12263423 which is from two slots ago
// await main(12263425, 12200000);

// Third slot in epoch 383232
// Beacon block root : 0xcfdabc3cf7c4005b5034756d615ee6c96dffb1e5324def8009e82224f2f69443
// Beacon parent root: 0x07459f09fd932325afb1eb470718ca85bdc6b3a51b83f1de224df41db329b3b0
// Current block parent root found at blockRoots index 1 0x07459f09fd932325afb1eb470718ca85bdc6b3a51b83f1de224df41db329b3b0
// Last historical block summary root at index 738: 0xc4fd681b33e6102af708a6c5f4adfa206bc8601ba3cad5911e50f864ca2d4317
// await main(12263426, 12200000);

// 12268565 - 5140 = 12263425 updated 0 index 0xb41d013b75c95252179ce539e23757db8dc0d6d0698fa3180e97b0a2488f28fa
// await main(12263425, 12200000);
// await main(12268565, 12200000); // Updated beacon root 5140
