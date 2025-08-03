import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getClient } from '@lodestar/api';
import { config } from '@lodestar/config/default';
const { ssz } = await import('@lodestar/types');

const denebForkSlot = 269568n * 32n;
const electraForkSlot = 364032n * 32n;

const configClient = async () => {
    const baseUrl = process.env.BEACON_NODE_URL;

    const client = await getClient({ baseUrl, timeoutMs: 60000 }, { config });

    return client;
};

export async function createClient() {
    const client = await configClient();

    {
        let r = await client.beacon.getGenesis();
        if (!r.ok) {
            throw r.error;
        }

        client.beacon.genesisTime = r.value().genesisTime;
    }

    {
        let r = await client.config.getSpec();
        if (!r.ok) {
            throw r.error;
        }

        client.beacon.secsPerSlot = r.value().SECONDS_PER_SLOT;
    }

    client.slotToTS = (slot) => {
        return client.beacon.genesisTime + slot * client.beacon.secsPerSlot;
    };

    return client;
}

export async function getBeaconBlock(blockId = 'head') {
    const client = await configClient();

    const forkName = config.getForkName(blockId);
    console.log(`Slot ${blockId} is from the ${forkName} fork`);

    // Get the beacon block for the slot from the beacon node.
    console.log(`Fetching block for block id ${blockId} from the beacon node`);
    const blockRes = await client.beacon.getBlockV2({ blockId });
    if (!blockRes.ok) {
        console.error(blockRes);
        throw new Error(
            `Failed to get beacon block for block id ${blockId}. It could be because the slot was missed or the provider URL does not support beacon chain API. Error: ${blockRes.status} ${blockRes.statusText}`
        );
    }

    const BeaconBlock = ssz.electra.BeaconBlock;

    const blockView = BeaconBlock.toView(blockRes.value().message);

    return blockView;
}

export async function getBeaconState(slot = 'head') {
    const client = await configClient();

    // Read the state from a local file or fetch it from the beacon node.
    let stateSsz;
    const stateFilename = `./cache/state_${slot}.ssz`;
    if (existsSync(stateFilename)) {
        console.log(`Loading state from file ${stateFilename}`);
        stateSsz = readFileSync(stateFilename);
    } else {
        console.log(`Fetching state for slot ${slot} from the beacon node`);
        const stateRes = await client.debug.getStateV2({ stateId: slot }, 'ssz');
        if (!stateRes.ok) {
            console.error(stateRes);
            throw new Error(
                `Failed to get state for slot ${slot}. Probably because it was missed. Error: ${stateRes.status} ${stateRes.statusText}`
            );
        }

        console.log(`Writing state to file ${stateFilename}`);
        writeFileSync(stateFilename, stateRes.ssz());
        stateSsz = stateRes.ssz();
    }

    const forkName = config.getForkName(Number(slot));
    console.log(`Slot ${slot} is from the ${forkName} fork`);
    const BeaconState = ssz.electra.BeaconState;

    const stateView = BeaconState.deserializeToView(stateSsz);

    return stateView;
}
