import { getClient } from '@lodestar/api';
import { config } from '@lodestar/config/default';
import { ssz } from '@lodestar/types';

const BeaconBlock = ssz.electra.BeaconBlock;

async function main(slot = 'finalized') {
    const baseUrl = process.env.BEACON_NODE_URL;
    const client = getClient({ baseUrl, timeoutMs: 60_000 }, { config });

    // Get the beacon block for the slot from the beacon node.
    const blockRes = await client.beacon.getBlockV2({ blockId: slot });
    if (!blockRes.ok) {
        throw blockRes.error;
    }

    const blockView = BeaconBlock.toView(blockRes.value().message);
}

// Pectra upgrade slot 11649024
// main(11649024);
// Next epoch after the Pectra upgrade
main(11649060);
