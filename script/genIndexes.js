const beaconBlockHeight = 3n;
const beaconStateHeight = 6n;
const beaconBlockBodyHeight = 4n;
const pendingDepositsHeight = 28n;
const validatorsHeight = 41n;
const balancesHeight = 39n;
const validatorHeight = 3n;

const stateRootIndex = 3n;
const validatorsContainerIndex = 11n;
const balancesContainerIndex = 12n;
const validatorIndex = 1770189n;
const pubkeyIndex = 0n;

const genIndexStateRoot = (1n << beaconBlockHeight) | stateRootIndex;
console.log(`generalized index for state root in block view: ${genIndexStateRoot}`);

const genValidatorsContainerInState = (1n << beaconStateHeight) | validatorsContainerIndex;
console.log(`generalized index for validators container in state view: ${genValidatorsContainerInState}`);

const genIndexValidatorsContainer =
    (1n << (beaconBlockHeight + beaconStateHeight)) | (stateRootIndex << beaconStateHeight) | validatorsContainerIndex;
console.log(`generalized index for validators container in state view: ${genIndexValidatorsContainer}`);

// beaconBlock.state.validators
const genIndexValidatorRoot =
    (1n << (beaconBlockHeight + beaconStateHeight + validatorsHeight)) |
    (stateRootIndex << (beaconStateHeight + validatorsHeight)) |
    (validatorsContainerIndex << validatorsHeight) |
    validatorIndex;
console.log(
    `generalized index for validator root with index ${validatorIndex} in the beacon block: ${genIndexValidatorRoot}`
);

// beaconBlock.state.validators.pubkey
const genIndexValidatorPubkey =
    (1n << (beaconBlockHeight + beaconStateHeight + validatorsHeight + validatorHeight)) |
    (stateRootIndex << (beaconStateHeight + validatorsHeight + validatorHeight)) |
    (validatorsContainerIndex << (validatorsHeight + validatorHeight)) |
    (validatorIndex << validatorHeight) |
    pubkeyIndex;
console.log(
    `generalized index for pubkey of validator ${validatorIndex} in the beacon block: ${genIndexValidatorPubkey}`
);

// beaconBlock.state.balances
const genIndexValidatorBalance =
    (1n << (beaconBlockHeight + beaconStateHeight + balancesHeight)) |
    (stateRootIndex << (beaconStateHeight + balancesHeight)) |
    (balancesContainerIndex << balancesHeight) |
    validatorIndex;
console.log(
    `generalized index for validator balance with index ${validatorIndex} in the beacon block: ${genIndexValidatorBalance}`
);

// State root gen index in block view: 11
// gen index for validators container in state view  : 75 = 2^6 + 11
// gen index for validators container in combined tree: 715
// Solidity gen index for validators container in state view: 203
// gen index for validator 1770189 in state view  : 164926745936589
// gen index for validator 1770189 in combined tree: 1572301629489869
// gen index for validator 1770189 balance in state: 41781442298035
// gen index for validator 1770189 balance in block: 393625163186355
